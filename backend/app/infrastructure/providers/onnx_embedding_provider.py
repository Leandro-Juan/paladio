import asyncio
import gc
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Literal

import numpy as np
from app.domain.interfaces.embedding_provider import IEmbeddingProvider

logger = logging.getLogger(__name__)

DEFAULT_ONNX_MODEL = "nomic-ai/nomic-embed-text-v1.5-Q"
DEFAULT_CACHE_DIR = "/opt/models/fastembed"


class EmbeddingProviderError(RuntimeError):
    """Raised when an embedding provider fails to generate a valid embedding vector."""


class OnnxEmbeddingProvider(IEmbeddingProvider):
    """
    In-process CPU embedding adapter backed by fastembed (ONNX Runtime).
    Uses quantized nomic-embed-text-v1.5-Q to produce unit L2-normalized
    768-dimensional dense vectors with zero external daemon or Ollama dependency.
    """

    _model_lock = threading.Lock()
    _shared_models: dict[tuple[str, str | None, int], Any] = {}
    _last_used: dict[tuple[str, str | None, int], float] = {}

    def __init__(
        self,
        model: str | None = None,
        cache_dir: str | None = None,
        threads: int | None = None,
        idle_timeout_seconds: float | None = None,
    ):
        self.model = model or os.getenv("FASTEMBED_MODEL", DEFAULT_ONNX_MODEL)
        self.cache_dir = self._resolve_cache_dir(cache_dir)
        self.threads = (
            threads
            if threads is not None
            else max(1, int(os.getenv("FASTEMBED_THREADS", "2")))
        )
        env_idle = os.getenv("FASTEMBED_IDLE_TIMEOUT_SECONDS")
        self.idle_timeout_seconds = (
            idle_timeout_seconds
            if idle_timeout_seconds is not None
            else (float(env_idle) if env_idle else None)
        )
        self._dim = 768

    @staticmethod
    def _resolve_cache_dir(explicit_cache_dir: str | None) -> str | None:
        if explicit_cache_dir:
            return explicit_cache_dir
        env_cache = os.getenv("FASTEMBED_CACHE_PATH")
        if env_cache:
            return env_cache
        default_path = Path(DEFAULT_CACHE_DIR)
        if default_path.exists() and os.access(default_path, os.R_OK):
            return str(default_path)
        return None

    @property
    def dimension(self) -> int:
        return self._dim

    def _cache_key(self) -> tuple[str, str | None, int]:
        return (self.model, self.cache_dir, self.threads)

    def _get_text_embedding(self) -> Any:
        key = self._cache_key()
        with self._model_lock:
            inst = self._shared_models.get(key)
            if inst is None:
                from fastembed import TextEmbedding

                kwargs: dict[str, Any] = {
                    "model_name": self.model,
                    "threads": self.threads,
                }
                if self.cache_dir:
                    kwargs["cache_dir"] = self.cache_dir
                if os.getenv("FASTEMBED_OFFLINE", "").lower() in ("1", "true", "yes"):
                    kwargs["local_files_only"] = True

                logger.info(
                    "Lazy-loading ONNX embedding model '%s' (threads=%d, cache_dir=%s)",
                    self.model,
                    self.threads,
                    self.cache_dir or "default",
                )
                inst = TextEmbedding(**kwargs)
                self._shared_models[key] = inst
            self._last_used[key] = time.monotonic()
            return inst

    @classmethod
    def unload_idle_models(cls, max_idle_seconds: float = 300.0) -> int:
        """Unloads cached ONNX models idle longer than max_idle_seconds to free RAM."""
        now = time.monotonic()
        removed = 0
        with cls._model_lock:
            stale_keys = [
                k for k, ts in cls._last_used.items() if (now - ts) >= max_idle_seconds
            ]
            for k in stale_keys:
                cls._shared_models.pop(k, None)
                cls._last_used.pop(k, None)
                removed += 1
        if removed:
            gc.collect()
        return removed

    @classmethod
    def clear_cached_models(cls) -> None:
        """Immediately releases all cached ONNX models from memory."""
        with cls._model_lock:
            cls._shared_models.clear()
            cls._last_used.clear()
        gc.collect()

    def _prefix_text(
        self, text: str, input_type: Literal["document", "query"] = "document"
    ) -> str:
        """Applies task-specific prefixes for nomic-embed-text family models."""
        clean = text.strip()
        if "nomic" in self.model.lower():
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

        target_uniform = 1.0 / np.sqrt(dim)
        if np.max(np.abs(arr - target_uniform)) < 1e-4:
            raise EmbeddingProviderError("Detected poisoned uniform vector")

        arr = arr / norm
        return [float(x) for x in arr.tolist()]

    def _embed_sync(self, texts: list[str], batch_size: int = 128) -> list[np.ndarray]:
        try:
            embedder = self._get_text_embedding()
            vectors = list(embedder.embed(texts, batch_size=batch_size))
        except EmbeddingProviderError:
            raise
        except Exception as exc:
            raise EmbeddingProviderError(
                f"ONNX embedding inference failed for model '{self.model}': {exc}"
            ) from exc

        if len(vectors) != len(texts):
            raise EmbeddingProviderError(
                f"Mismatch in returned embeddings count: {len(vectors)} vs {len(texts)}"
            )
        return vectors

    async def embed_text(
        self, text: str, input_type: Literal["document", "query"] = "document"
    ) -> list[float]:
        """Generates a normalized 768D semantic embedding vector for a single text."""
        if not text or not text.strip():
            raise EmbeddingProviderError("Cannot generate embedding for empty text")

        prefixed_text = self._prefix_text(text, input_type=input_type)
        raw_vecs = await asyncio.to_thread(self._embed_sync, [prefixed_text], 1)
        vec = self._validate_and_normalize(raw_vecs[0], self._dim)
        if self.idle_timeout_seconds is not None and self.idle_timeout_seconds <= 0:
            self.clear_cached_models()
        return vec

    async def embed_batch(
        self,
        texts: list[str],
        input_type: Literal["document", "query"] = "document",
        batch_size: int = 128,
        max_concurrency: int = 4,
    ) -> list[list[float]]:
        """Generates normalized 768D semantic embedding vectors for a batch of texts."""
        if not texts:
            return []

        for t in texts:
            if not t or not t.strip():
                raise EmbeddingProviderError(
                    "Cannot generate embedding for empty text in batch"
                )

        prefixed_texts = [self._prefix_text(t, input_type=input_type) for t in texts]
        raw_vecs = await asyncio.to_thread(self._embed_sync, prefixed_texts, batch_size)

        arr = np.asarray(raw_vecs, dtype=np.float32)
        if arr.shape != (len(prefixed_texts), self._dim):
            raise EmbeddingProviderError(
                f"Batch shape mismatch: {arr.shape} vs {(len(prefixed_texts), self._dim)}"
            )
        if not np.all(np.isfinite(arr)):
            raise EmbeddingProviderError("Batch contains NaN or Inf vectors")

        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        if np.any(norms < 1e-6):
            raise EmbeddingProviderError("Batch contains near-zero norm vectors")

        target_uniform = 1.0 / np.sqrt(self._dim)
        if np.any(np.max(np.abs(arr - target_uniform), axis=1) < 1e-4):
            raise EmbeddingProviderError("Batch contains poisoned uniform vector")

        arr = arr / norms
        return [[float(x) for x in row] for row in arr]
