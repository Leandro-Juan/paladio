from abc import ABC, abstractmethod


class IEmbeddingProvider(ABC):
    """
    Domain interface for generating semantic text embeddings.
    Isolates domain logic from specific LLM/embedding providers (Ollama, local models, etc.).
    """

    @abstractmethod
    async def embed_text(self, text: str) -> list[float]:
        """Generates a normalized semantic embedding vector for a single text."""
        pass

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generates normalized semantic embedding vectors for a batch of texts."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the dimensionality of the embedding vectors (e.g. 768)."""
        pass
