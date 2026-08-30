from typing import Any

import flax.linen as nn
import jax
import jax.numpy as jnp
from app.domain.interfaces.scoring_model import IScoringModel


class ScoringMLP(nn.Module):
    """
    A simple Multi-Layer Perceptron that predicts user affinity (0-100)
    given a user embedding and a POI embedding.
    """

    @nn.compact
    def __call__(
        self, user_embedding: jnp.ndarray, poi_embedding: jnp.ndarray
    ) -> jnp.ndarray:
        # Concatenate embeddings
        x = jnp.concatenate([user_embedding, poi_embedding], axis=-1)

        # Dense layers
        x = nn.Dense(128)(x)
        x = nn.relu(x)
        x = nn.Dense(64)(x)
        x = nn.relu(x)

        # Output layer
        x = nn.Dense(1)(x)
        # Sigmoid to constrain between 0 and 1, then scale to 100
        return nn.sigmoid(x) * 100.0


# Global model instance
model = ScoringMLP()


@jax.jit
def forward_pass(params, user_embedding, poi_embedding):
    """
    JIT-compiled forward pass for fast inference.
    """
    return model.apply(params, user_embedding, poi_embedding)


@jax.jit
def batch_forward_pass(params, user_embedding, poi_embeddings):
    """
    JIT-compiled batched forward pass.
    user_embedding: (64,)
    poi_embeddings: (N, 128)
    Returns: (N, 1) scores
    """
    # Vectorize the model over the POI embeddings (batch dimension 0)
    # The user embedding is broadcasted (in_axes=(None, 0))
    batched_apply = jax.vmap(model.apply, in_axes=(None, None, 0))
    return batched_apply(params, user_embedding, poi_embeddings)


@jax.jit
def mse_loss(params, user_embedding, poi_embedding, target_score):
    """Mean Squared Error Loss between prediction and target."""
    pred = model.apply(params, user_embedding, poi_embedding)
    return jnp.mean((pred - target_score) ** 2)


@jax.jit
def compute_user_gradient(params, user_embedding, poi_embedding, target_score):
    """
    Computes the gradient of the loss with respect to the user_embedding.
    (We freeze the model params for now).
    """
    # jax.grad takes derivative wrt argnum 1 (user_embedding)
    grad_fn = jax.grad(mse_loss, argnums=1)
    return grad_fn(params, user_embedding, poi_embedding, target_score)


@jax.jit
def update_user_embedding(
    params, user_embedding, poi_embedding, target_score, learning_rate=0.05
):
    """
    Performs a gradient descent step on the user_embedding.
    """
    grad = compute_user_gradient(params, user_embedding, poi_embedding, target_score)
    updated_embedding = user_embedding - learning_rate * grad
    return updated_embedding


def init_model_params(rng_key=None):
    """Initializes the model weights."""
    if rng_key is None:
        rng_key = jax.random.key(42)
    dummy_user = jnp.zeros((64,))
    dummy_poi = jnp.zeros((128,))
    return model.init(rng_key, dummy_user, dummy_poi)


class JaxScoringModel(IScoringModel):
    """
    Adapter that implements the scoring model interface using the global JAX model.
    """

    def init_params(self, rng_key: Any = None) -> Any:
        return init_model_params(rng_key)

    def batch_score(self, params: Any, user_embedding: Any, poi_embeddings: Any) -> Any:
        return batch_forward_pass(params, user_embedding, poi_embeddings)

    def update_user(
        self,
        params: Any,
        user_embedding: Any,
        poi_embedding: Any,
        target_score: float,
        learning_rate: float = 0.05,
    ) -> Any:
        return update_user_embedding(
            params, user_embedding, poi_embedding, target_score, learning_rate
        )
