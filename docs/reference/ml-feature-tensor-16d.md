# Technical Reference: 16-D Feature Tensor (`PoiEncoder`)

This document provides the mathematical specification and index layout of the **16-dimensional feature vector** produced by `PoiEncoder` (`backend/app/engine/scoring/features.py`).

`PoiEncoder` converts heterogeneous POI records (museums, restaurants, parks, monuments) into standardized NumPy arrays with zero dynamic allocations in hot inference paths.

---

## 1. Tensor Index Layout (16 Dimensions)

```text
┌──────────────────────────────┬──────────────────────────────┐
│  [0..7] Scalar & Operations  │   [8..15] 8-Category Tags   │
└──────────────────────────────┴──────────────────────────────┘
```

| Index | Field Name | Type | Value Range | Normalization & Extraction Logic |
| :---: | :--- | :---: | :---: | :--- |
| `[0]` | `normalized_cost` | `float32` | $[0.0, 1.0]$ | $\min(\max(\text{cost} / 200.0, 0.0), 1.0)$ |
| `[1]` | `normalized_duration` | `float32` | $[0.0, 1.0]$ | $\min(\max(\text{duration} / 240.0, 0.0), 1.0)$ |
| `[2]` | `normalized_rating` | `float32` | $[0.0, 1.0]$ | $\min(\max(\text{rating} / 5.0, 0.0), 1.0)$ |
| `[3]` | `normalized_log_reviews` | `float32` | $[0.0, 1.0]$ | $\min(\max(\log_{10}(\text{reviews} + 1) / 5.0, 0.0), 1.0)$ |
| `[4]` | `raw_rating` | `float32` | $[0.0, 5.0]$ | Unscaled raw Google/OSM rating |
| `[5]` | `raw_reviews` | `float32` | $[0, \infty)$ | Unscaled total user review count |
| `[6]` | `is_free` | `float32` | $\{0.0, 1.0\}$ | $1.0$ if $\text{cost} \le 0.0$, else $0.0$ |
| `[7]` | `is_outdoor` | `float32` | $\{0.0, 1.0\}$ | $1.0$ if venue is park, trail, or outdoor attraction |
| `[8]` | `art_culture` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for fine arts, museums |
| `[9]` | `history_heritage` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for ruins, castles, churches |
| `[10]` | `nature_outdoors` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for gardens, parks, lakes |
| `[11]` | `architecture` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for palaces, towers, bridges |
| `[12]` | `food_culinary` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for dining, tapas, bakeries |
| `[13]` | `nightlife` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for bars, clubs, speakeasies |
| `[14]` | `shopping` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for markets, bazaars, boutiques |
| `[15]` | `scenic_views` | `float32` | $\{0.0, 1.0\}$ | Multi-hot regex & category match for miradors, rooftop viewpoints |

---

## 2. Multi-Hot Tag Extraction via Compiled Regular Expressions

To eliminate external NLP dependencies during POI encoding, `PoiEncoder` matches text corpora (name, category, description, and metadata tags) against pre-compiled regex word boundaries:

```python
# Sample excerpt from KEYWORD_TO_TAG
KEYWORD_TO_TAG = {
    "museum": "art_culture", "museo": "art_culture", "galería": "art_culture",
    "castle": "history_heritage", "cathedral": "history_heritage", "alcázar": "history_heritage",
    "park": "nature_outdoors", "jardín": "nature_outdoors", "hiking": "nature_outdoors",
    "tapas": "food_culinary", "bistro": "food_culinary", "restaurante": "food_culinary",
    "cocktail": "nightlife", "discoteca": "nightlife", "lounge": "nightlife",
    "mirador": "scenic_views", "rooftop": "scenic_views", "viewpoint": "scenic_views",
}
```

### Word-Boundary Guardrails:
- Patterns are bounded by `\b` word boundaries to prevent substring collisions (e.g., ensuring *"bar"* does not match *"barcelona"* or *"embarcadero"*).
- `MARKET_STREET_PATTERN` prevents false-positive shopping matches when "market" appears solely as a street name (e.g. *"Market Street"*).
- If zero tags match, `history_heritage` and `scenic_views` receive default $0.5$ fallback activations.
