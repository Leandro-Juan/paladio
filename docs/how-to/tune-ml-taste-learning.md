# How-To: Tune ML Taste Learning & EMA Parameters

Paladio's **`SemanticLearningEngine`** dynamically adapts the user's permanent 768-D semantic taste embedding over time using an **Exponential Moving Average (EMA)** and projects it into 8 harmonic radar dimensions.

This guide demonstrates how to tune the adaptation rate ($\gamma$), modify the canonical category anchor prompts, and adjust the sensitivity of the taste projection.

---

## 1. Adjusting the EMA Learning Rate ($\gamma$)

The EMA learning rate $\gamma \in (0, 1)$ governs how aggressively the user's permanent profile responds to new prompts:
- **Low $\gamma$ (e.g., $0.05 - 0.10$):** High inertia. The profile adapts slowly, preserving historical preferences over long periods.
- **Default $\gamma = 0.20$:** Balanced. The user's preferences noticeably adjust after 2–3 interactions while resisting short-term outliers.
- **High $\gamma$ (e.g., $0.40 - 0.50$):** Reactive. The most recent prompt dominates the recommendation engine immediately.

To adjust $\gamma$, modify `DEFAULT_GAMMA` in `backend/app/engine/scoring/semantic_learning.py`:

```python
# backend/app/engine/scoring/semantic_learning.py

class SemanticLearningEngine:
    DEFAULT_GAMMA: float = 0.15  # Adjust from 0.20 to 0.15 for higher stability
```

Alternatively, pass it dynamically during batch scoring calls in `backend/app/infrastructure/engine/ml_scorer.py`:

```python
v_new = engine.apply_ema_update(user_768d, v_prompt, gamma=0.15)
```

---

## 2. Modifying Canonical Category Anchor Prompts

The continuous 768-D vector space is mapped onto 8 discrete human-interpretable categories by computing cosine similarity against canonical **anchor prompts**.

To customize the semantic boundaries of each category, edit `CATEGORY_ANCHORS` in `backend/app/engine/scoring/semantic_learning.py`:

```python
CATEGORY_ANCHORS: dict[str, str] = {
    "art_culture": "fine arts museum art gallery cultural exhibitions masterpiece paintings sculptures contemporary art",
    "history_heritage": "ancient historical monuments medieval castles heritage ruins cathedrals archaeology landmarks history",
    "nature_outdoors": "national parks botanical gardens lakes hiking trails nature outdoor scenic green landscapes",
    "architecture": "monumental urban architecture modern facades historic palaces bridges towers city design",
    "food_culinary": "culinary gastronomy restaurants delicious traditional local food dining tapas bistro dishes",
    "nightlife": "vibrant nightlife cocktail bars speakeasy pubs wine lounges evening music entertainment",
    "shopping": "artisan craft markets shopping bazaars designer boutiques local goods antique vintage stores",
    "scenic_views": "scenic panoramic viewpoints mirador observation decks elevated horizon rooftop cityscapes",
}
```

> [!TIP]
> Adding domain-specific keywords (e.g., *"tapas"*, *"craft beer"*, *"gothic"*) sharpens the projection matrix for regional travel patterns.

---

## 3. Calibrating the Harmonic Projection Sensitivity

The continuous projection formula maps dot products from $[-1.0, 1.0]$ into normalized affinity weights $[0.0, 1.0]$:

$$\mathbf{a}_k = \frac{\mathbf{v} \cdot \mathbf{u}_k + 1}{2}$$

If you want the radar chart to be more discriminative (stretching differences between high and low affinities), apply a power law in `project_to_8d_harmonics`:

```python
def project_to_8d_harmonics(self, v_768d: list[float] | np.ndarray) -> dict[str, float]:
    # ...
    # Standard linear mapping:
    sim_norm = float(np.clip((dot_prod + 1.0) / 2.0, 0.0, 1.0))
    
    # Optional non-linear contrast stretching:
    stretched = float(np.power(sim_norm, 1.5))
    harmonics[tag] = round(stretched, 4)
```

---

## 4. Verification & Testing

Verify that EMA updates and projection math remain numerically stable:

```bash
pytest backend/tests/test_semantic_learning.py backend/tests/test_ml_scorer.py
```
