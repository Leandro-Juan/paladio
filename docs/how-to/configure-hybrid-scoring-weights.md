# How-To: Configure Hybrid Scoring Weights & Bayesian Priors

The **`HybridSovereignScorer`** (`backend/app/infrastructure/scoring/hybrid_scorer.py`) calculates calibrated venue scores in $[0.0, 100.0]$ using a multi-attribute utility formulation:

$$S_{\text{final}} = w_{\text{quality}} S_{\text{qual}} + w_{\text{affinity}} S_{\text{aff}} + w_{\text{pacing}} S_{\text{pace}} + w_{\text{budget}} S_{\text{budget}}$$

This guide explains how to calibrate the Bayesian rating smoothing constants and adjust the utility weight distributions.

---

## 1. Tuning the Bayesian Rating Smoothing Priors

Raw user ratings (e.g., Google Maps stars) suffer from the *low review count bias*: a venue with one 5.0-star rating should not outrank an iconic museum with 20,000 reviews averaging 4.7 stars.

Paladio applies **Bayesian m-estimate smoothing**:

$$S_{\text{qual}} = \frac{R \cdot v + C \cdot m}{v + m}$$

Where:
- $R$: Raw rating of the POI in $[0.0, 5.0]$.
- $v$: Total review count of the POI.
- $m$: Prior weight (`prior_reviews_m`, default: `50.0`). The number of pseudo-reviews required to pull the rating toward the prior.
- $C$: Prior global mean (`prior_rating_C`, default: `4.0`). The assumed average rating of an unknown venue.

### Adjustment Strategy
In `backend/app/infrastructure/scoring/hybrid_scorer.py`:
- **Increase $m$ (e.g., $100.0$):** Heavily penalizes lesser-known venues, favoring world-renowned institutions.
- **Decrease $m$ (e.g., $15.0$):** Enables hidden gems with few reviews to compete fairly with major tourist attractions.

```python
# backend/app/infrastructure/scoring/hybrid_scorer.py

scorer = HybridSovereignScorer(
    prior_reviews_m=35.0,  # More permissive for local discoveries
    prior_rating_C=4.1     # City-wide average baseline
)
```

---

## 2. Rebalancing Multi-Attribute Utility Weights

The four core weights control the recommendation trade-offs:

| Parameter | Default | Interpretation |
| :--- | :---: | :--- |
| `w_quality` | `0.35` | Baseline prestige and reputation of the venue. |
| `w_affinity` | `0.40` | Match between user taste profile and venue category/keywords. |
| `w_pacing` | `0.15` | Penalty for extreme duration that would crowd out daily pacing. |
| `w_budget` | `0.10` | Preference for cost-effective venues within the total trip budget. |

*Constraint:* The sum $\sum w_i = 1.0$ guarantees that the resulting score is normalized in $[0.0, 100.0]$.

### Example: Budget-Conscious Configuration
If you want the algorithm to aggressively prioritize low-cost and free attractions:

```python
scorer = HybridSovereignScorer(
    w_quality=0.25,
    w_affinity=0.35,
    w_pacing=0.10,
    w_budget=0.30   # Increased from 0.10 to 0.30
)
```

---

## 3. Dynamic Configuration via API State

You can inject customized weights dynamically at runtime when initializing the FastAPI app state in `backend/app/main.py`:

```python
# backend/app/main.py
app.state.ml_params = {
    "w_quality": 0.30,
    "w_affinity": 0.45,
    "w_pacing": 0.15,
    "w_budget": 0.10,
    "prior_reviews_m": 50.0,
    "prior_rating_C": 4.0,
}
```

---

## 4. Verification

Run the unit tests to verify that score normalization and ranking boundaries remain valid:

```bash
pytest backend/tests/test_hybrid_scorer.py
```
