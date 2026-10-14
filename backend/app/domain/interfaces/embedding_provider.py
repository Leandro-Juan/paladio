from abc import ABC, abstractmethod
from typing import Literal


class IEmbeddingProvider(ABC):
    """
    Domain interface for generating semantic text embeddings.
    Isolates domain logic from specific LLM/embedding providers (Ollama, local models, etc.).
    """

    @abstractmethod
    async def embed_text(
        self, text: str, input_type: Literal["document", "query"] = "document"
    ) -> list[float]:
        """Generates a normalized semantic embedding vector for a single text."""

    @abstractmethod
    async def embed_batch(
        self,
        texts: list[str],
        input_type: Literal["document", "query"] = "document",
        batch_size: int = 128,
        max_concurrency: int = 4,
    ) -> list[list[float]]:
        """Generates normalized semantic embedding vectors for a batch of texts."""

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the dimensionality of the embedding vectors (e.g. 768)."""
