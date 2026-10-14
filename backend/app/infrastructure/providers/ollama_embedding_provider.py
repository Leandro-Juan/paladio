import asyncio
import logging
import os
from typing import Literal

import httpx
import numpy as np
from app.domain.interfaces.embedding_provider import IEmbeddingProvider

logger = logging.getLogger(__name__)


class EmbeddingProviderError(RuntimeError):
    """Raised when an embedding provider fails to generate a valid embedding vector."""


class OllamaEmbeddingProvider(IEmbeddingProvider):
    """
    Adapter communicating with local Ollama instance (e.g. nomic-embed-text).
    Produces unit L2-normalized 768-dimensional dense vectors via POST /api/embed.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 20.0,
    ):
        env_url = os.getenv("OLLAMA_BASE_URL")
        if base_url:
            self.base_url = base_url.rstrip("/")
        elif env_url:
            self.base_url = env_url.rstrip("/")
        else:
            # Default to host port 11435 if running locally outside container
            self.base_url = "http://127.0.0.1:11435"

        self.model = model or os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
        self.timeout = timeout
        self._dim = 768

    @property
    def dimension(self) -> int:
        return self._dim

    def _prefix_text(
        self, text: str, input_type: Literal["document", "query"] = "document"
    ) -> str:
        """Applies task-specific prefixes for nomic-embed-text family models."""
        clean = text.strip()
        if "nomic-embed-text" in self.model:
            if input_type == "query":
                if not clean.startswith("search_query: "):
                    return f"search_query: {clean}"
            else:
                if not clean.startswith("search_document: "):
                    return f"search_document: {clean}"
        return clean

    @staticmethod
    def _validate_and_normalize(
        raw_vec: list[float] | np.ndarray, dim: int
    ) -> list[float]:
        """Validates vector health and normalizes to unit L2 norm."""
        arr = np.asarray(raw_vec, dtype=np.float32)
        if arr.shape != (dim,):
            raise EmbeddingProviderError(
                f"Embedding dimension mismatch: expected {dim}, got {arr.shape}"
            )
        if not np.all(np.isfinite(arr)):
            raise EmbeddingProviderError("Embedding contains NaN or Inf values")

        norm = float(np.linalg.norm(arr))
        if norm < 1e-6:
            raise EmbeddingProviderError("Embedding has near-zero L2 norm (< 1e-6)")

        # Verify not uniform fake vector
        target_uniform = 1.0 / np.sqrt(dim)
        if np.max(np.abs(arr - target_uniform)) < 1e-4:
            raise EmbeddingProviderError("Detected poisoned uniform vector")

        arr = arr / norm
        return [float(x) for x in arr.tolist()]

    async def _post_embed(
        self, client: httpx.AsyncClient, base: str, texts: list[str]
    ) -> list[list[float]]:
        """Invokes Ollama POST /api/embed with fallback to /api/embeddings."""
        url_embed = f"{base}/api/embed"
        try:
            resp = await client.post(
                url_embed,
                json={"model": self.model, "input": texts},
            )
            if resp.status_code == 200:
                data = resp.json()
                embeddings = data.get("embeddings", [])
                if len(embeddings) == len(texts):
                    return embeddings
        except Exception as e:
            logger.debug(f"/api/embed attempt via {url_embed} failed: {e}")

        # Fallback to legacy /api/embeddings if /api/embed is unavailable
        legacy_embeddings = []
        for t in texts:
            url_legacy = f"{base}/api/embeddings"
            resp = await client.post(
                url_legacy,
                json={"model": self.model, "prompt": t},
            )
            resp.raise_for_status()
            vec = resp.json().get("embedding", [])
            legacy_embeddings.append(vec)
        return legacy_embeddings

    async def embed_text(
        self, text: str, input_type: Literal["document", "query"] = "document"
    ) -> list[float]:
        """Generates a normalized 768D semantic embedding vector for a single text."""
        if not text or not text.strip():
            raise EmbeddingProviderError("Cannot generate embedding for empty text")

        prefixed_text = self._prefix_text(text, input_type=input_type)
        candidates = [self.base_url]
        alt = "http://127.0.0.1:11435" if "llm" in self.base_url else "http://llm:11434"
        if alt not in candidates:
            candidates.append(alt)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            last_err: Exception | None = None
            for base in candidates:
                try:
                    embs = await self._post_embed(client, base, [prefixed_text])
                    if embs and len(embs) == 1:
                        vec = self._validate_and_normalize(embs[0], self._dim)
                        self.base_url = base  # Cache successful base
                        return vec
                except Exception as e:
                    last_err = e
                    logger.debug(f"Attempt via {base} failed: {e}")

            raise EmbeddingProviderError(
                f"All Ollama embedding candidates failed for model '{self.model}': {last_err}"
            )

    async def embed_batch(
        self,
        texts: list[str],
        input_type: Literal["document", "query"] = "document",
        batch_size: int = 128,
        max_concurrency: int = 4,
    ) -> list[list[float]]:
        """Generates normalized 768D semantic embedding vectors for a batch of texts using POST /api/embed."""
        if not texts:
            return []

        prefixed_texts = [self._prefix_text(t, input_type=input_type) for t in texts]
        candidates = [self.base_url]
        alt = "http://127.0.0.1:11435" if "llm" in self.base_url else "http://llm:11434"
        if alt not in candidates:
            candidates.append(alt)

        chunks = [
            prefixed_texts[i : i + batch_size]
            for i in range(0, len(prefixed_texts), batch_size)
        ]

        semaphore = asyncio.Semaphore(max_concurrency)

        async def process_chunk(
            chunk_texts: list[str], client: httpx.AsyncClient
        ) -> list[list[float]]:
            async with semaphore:
                last_err: Exception | None = None
                for attempt in range(3):
                    for base in candidates:
                        try:
                            embs = await self._post_embed(client, base, chunk_texts)
                            if len(embs) == len(chunk_texts):
                                self.base_url = base
                                # Vectorized matrix validation & normalization
                                arr = np.asarray(embs, dtype=np.float32)
                                if arr.shape != (len(chunk_texts), self._dim):
                                    raise EmbeddingProviderError(
                                        f"Batch shape mismatch: {arr.shape} vs {(len(chunk_texts), self._dim)}"
                                    )
                                if not np.all(np.isfinite(arr)):
                                    raise EmbeddingProviderError(
                                        "Batch contains NaN or Inf vectors"
                                    )
                                norms = np.linalg.norm(arr, axis=1, keepdims=True)
                                if np.any(norms < 1e-6):
                                    raise EmbeddingProviderError(
                                        "Batch contains near-zero norm vectors"
                                    )
                                arr = arr / norms
                                return [[float(x) for x in row] for row in arr]
                        except Exception as e:
                            last_err = e
                            logger.debug(
                                f"Batch chunk attempt {attempt+1} via {base} failed: {e}"
                            )
                    await asyncio.sleep(0.5 * (2**attempt))
                raise EmbeddingProviderError(
                    f"Batch chunk failed after 3 retries: {last_err}"
                )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            tasks = [process_chunk(chunk, client) for chunk in chunks]
            chunk_results = await asyncio.gather(*tasks)

        flattened = []
        for res in chunk_results:
            flattened.extend(res)
        return flattened
