from abc import ABC, abstractmethod
from typing import Any

class IScoringModel(ABC):
    """
    Abstract port for the scoring engine.
    Isolates the domain logic from the underlying ML framework (JAX/Flax, PyTorch, etc.)
    """
    
    @abstractmethod
    def init_params(self, rng_key: Any = None) -> Any:
        """Initialize and return the model parameters."""
        pass

    @abstractmethod
    def batch_score(self, params: Any, user_embedding: Any, poi_embeddings: Any) -> Any:
        """Compute scores for a batch of POIs given a user embedding."""
        pass

    @abstractmethod
    def update_user(self, params: Any, user_embedding: Any, poi_embedding: Any, target_score: float, learning_rate: float = 0.05) -> Any:
        """Update the user embedding based on feedback."""
        pass
