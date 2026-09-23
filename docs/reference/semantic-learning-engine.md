# Technical Reference: `SemanticLearningEngine`

This document outlines the mathematical foundation and API reference for `SemanticLearningEngine` (`backend/app/engine/scoring/semantic_learning.py`).

The engine is responsible for:
1. **Continuous 768-D vector evolution** via Exponential Moving Average (EMA).
2. **Harmonic projection** from the 768-D semantic hypersphere into 8-D human-interpretable category affinities.
3. **Inverse synthesis** of 768-D vectors from 8-D preference weights.

---

## 1. Mathematical Formulation

### 1.1. Vector Normalization
All operations are executed on the unit $L_2$ hypersphere:

$$\mathbf{v}_{\text{norm}} = \frac{\mathbf{v}}{\|\mathbf{v}\|_2} \quad \text{where } \|\mathbf{v}\|_2 = \sqrt{\sum_{i=1}^{768} v_i^2}$$

If $\|\mathbf{v}\|_2 < 10^{-6}$, the vector falls back to an orthogonal neutral prior $\frac{1}{\sqrt{768}}\mathbf{1}$.

### 1.2. Exponential Moving Average (EMA) Update
When new prompt embeddings $\mathbf{v}_{\text{prompt}}$ are received, the historical preference vector $\mathbf{v}_{\text{hist}}$ is updated:

$$\mathbf{v}_{\text{new}} = \text{Normalize}\Big((1 - \gamma)\,\mathbf{v}_{\text{hist}} + \gamma\,\mathbf{v}_{\text{prompt}}\Big)$$

Where $\gamma \in (0, 1)$ is the learning rate (default: $0.20$).

### 1.3. Continuous-to-Discrete Harmonic Projection
To project a 768-D embedding onto the 8 canonical categories, the engine computes the cosine similarity against normalized category anchor embeddings $\mathbf{u}_k$:

$$\mathbf{a}_k = \text{clip}\left(\frac{\mathbf{v} \cdot \mathbf{u}_k + 1}{2}, \, 0.0, \, 1.0\right) \quad \forall k \in [1, \dots, 8]$$

---

## 2. Python API Reference

### `normalize_vector(vec: np.ndarray | list[float]) -> np.ndarray`
Returns a 1D unit $L_2$-normalized `float32` NumPy array.

### `get_neutral_768d_prior(dim: int = 768) -> list[float]`
Returns a deterministic, normalized neutral prior vector for cold-start users.

### `apply_ema_update(v_history, v_prompt, gamma: float = 0.20) -> list[float]`
Applies the EMA formula between historical vectors and new prompt vectors, returning a normalized 768-D float list.

### `project_to_8d_harmonics(v_768d) -> dict[str, float]`
Projects a 768-D embedding onto the 8 canonical categories:
```python
{
    "art_culture": 0.85,
    "history_heritage": 0.72,
    "nature_outdoors": 0.40,
    "architecture": 0.68,
    "food_culinary": 0.90,
    "nightlife": 0.35,
    "shopping": 0.50,
    "scenic_views": 0.60
}
```

### `synthesize_768d_from_harmonics(harmonics: dict[str, float]) -> list[float]`
Computes a weighted linear combination of category anchor vectors to reconstruct a 768-D continuous latent vector from discrete user preference sliders.
