import logging
import os
from typing import Optional
import httpx
import numpy as np

from app.domain.interfaces.embedding_provider import IEmbeddingProvider

logger = logging.getLogger(__name__)


class OllamaEmbeddingProvider(IEmbeddingProvider):
    """
    Adapter communicating with local Ollama instance (e.g. nomic-embed-text).
    Produces unit L2-normalized 768-dimensional dense vectors.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 15.0,
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

    @staticmethod
    def _normalize_vector(vec: list[float]) -> list[float]:
        """Ensures vector is unit L2-normalized for stable cosine similarity."""
        arr = np.asarray(vec, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 1e-6:
            arr = arr / norm
        return [float(x) for x in arr.tolist()]

    async def embed_text(self, text: str) -> list[float]:
        """Generates a normalized 768D semantic embedding vector for a single text."""
        if not text or not text.strip():
            # Return neutral zero-centered normalized vector
            arr = np.full(self._dim, 1.0 / np.sqrt(self._dim), dtype=np.float32)
            return arr.tolist()

        clean_text = text.strip()
        url = f"{self.base_url}/api/embeddings"

        candidates = [self.base_url]
        alt = "http://127.0.0.1:11435" if "llm" in self.base_url else "http://llm:11434"
        if alt not in candidates:
            candidates.append(alt)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for base in candidates:
                url = f"{base}/api/embeddings"
                try:
                    resp = await client.post(
                        url,
                        json={"model": self.model, "prompt": clean_text},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    raw_vec = data.get("embedding", [])
                    if len(raw_vec) == self._dim:
                        self.base_url = base  # Cache working base URL
                        return self._normalize_vector(raw_vec)
                except Exception as e:
                    logger.debug(f"Attempt via {url} failed: {e}")

            logger.error(
                f"All Ollama embedding candidates failed for text: {clean_text[:40]}..."
            )
            arr = np.full(self._dim, 1.0 / np.sqrt(self._dim), dtype=np.float32)
            return arr.tolist()

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generates normalized 768D semantic embedding vectors for a batch of texts."""
        if not texts:
            return []

        # Batch querying Ollama
        results = []
        for text in texts:
            vec = await self.embed_text(text)
            results.append(vec)
        return results
