import logging
from typing import Any
import numpy as np

logger = logging.getLogger(__name__)

TAG_KEYS: list[str] = [
    "art_culture",
    "history_heritage",
    "nature_outdoors",
    "architecture",
    "food_culinary",
    "nightlife",
    "shopping",
    "scenic_views",
]

# Mapping categories to standard tags
CATEGORY_TO_TAG: dict[str, list[str]] = {
    "MUSEUM": ["art_culture", "history_heritage"],
    "ATTRACTION": ["history_heritage", "scenic_views"],
    "LANDMARK": ["history_heritage", "architecture"],
    "PARK": ["nature_outdoors", "scenic_views"],
    "RESTAURANT": ["food_culinary"],
    "BAR": ["nightlife", "food_culinary"],
    "HOTEL": ["architecture"],
}

# Mapping common travel keywords to standard tags
KEYWORD_TO_TAG: dict[str, str] = {
    "museum": "art_culture",
    "art": "art_culture",
    "gallery": "art_culture",
    "painting": "art_culture",
    "sculpture": "art_culture",
    "history": "history_heritage",
    "historic": "history_heritage",
    "ancient": "history_heritage",
    "castle": "history_heritage",
    "cathedral": "history_heritage",
    "church": "history_heritage",
    "monument": "history_heritage",
    "ruin": "history_heritage",
    "palace": "history_heritage",
    "park": "nature_outdoors",
    "garden": "nature_outdoors",
    "nature": "nature_outdoors",
    "forest": "nature_outdoors",
    "beach": "nature_outdoors",
    "trail": "nature_outdoors",
    "architecture": "architecture",
    "building": "architecture",
    "tower": "architecture",
    "bridge": "architecture",
    "plaza": "architecture",
    "square": "architecture",
    "restaurant": "food_culinary",
    "food": "food_culinary",
    "cafe": "food_culinary",
    "bakery": "food_culinary",
    "tapas": "food_culinary",
    "bistro": "food_culinary",
    "gastronomy": "food_culinary",
    "bar": "nightlife",
    "pub": "nightlife",
    "cocktail": "nightlife",
    "club": "nightlife",
    "nightlife": "nightlife",
    "beer": "nightlife",
    "wine": "nightlife",
    "market": "shopping",
    "shopping": "shopping",
    "bazaar": "shopping",
    "mall": "shopping",
    "view": "scenic_views",
    "viewpoint": "scenic_views",
    "panorama": "scenic_views",
    "lookout": "scenic_views",
    "terrace": "scenic_views",
}


class PoiEncoder:
    """
    Encodes POI dictionaries into deterministic, interpretable 16D feature vectors
    using pure NumPy.

    Feature Layout (16D):
    - [0]: normalized_cost in [0.0, 1.0] (capped at 200 EUR)
    - [1]: normalized_duration in [0.0, 1.0] (capped at 240 mins)
    - [2]: normalized_rating in [0.0, 1.0] (raw rating 0-5 divided by 5)
    - [3]: normalized_log_reviews in [0.0, 1.0] (log10(reviews + 1) / 5.0)
    - [4]: raw_rating in [0.0, 5.0]
    - [5]: raw_reviews in [0.0, inf)
    - [6]: is_free flag (1.0 if cost <= 0 else 0.0)
    - [7]: is_outdoor flag (1.0 if outdoor/nature else 0.0)
    - [8..15]: 8 multi-hot tag activations in [0.0, 1.0]:
        art_culture, history_heritage, nature_outdoors, architecture,
        food_culinary, nightlife, shopping, scenic_views
    """

    FEATURE_DIM: int = 16
    TAG_START_IDX: int = 8

    @staticmethod
    def encode(poi: dict[str, Any]) -> np.ndarray:
        features = np.zeros(PoiEncoder.FEATURE_DIM, dtype=np.float32)

        # 1. Cost
        cost_raw = poi.get("cost_eur")
        if cost_raw is None:
            cost_raw = poi.get("financials", {}).get("estimated_cost", 0.0)
        cost = float(cost_raw) if cost_raw is not None else 0.0
        features[0] = min(max(cost / 200.0, 0.0), 1.0)
        features[6] = 1.0 if cost <= 0.0 else 0.0

        # 2. Duration
        dur_raw = poi.get("duration_mins")
        if dur_raw is None:
            dur_raw = poi.get("schedule", {}).get("recommended_duration_minutes", 60.0)
        dur = float(dur_raw) if dur_raw is not None else 60.0
        features[1] = min(max(dur / 240.0, 0.0), 1.0)

        # 3. Rating & Reviews
        scoring = poi.get("scoring") or {}
        raw_rating = scoring.get("google_rating") or poi.get("rating") or 4.0
        rating = float(raw_rating) if raw_rating is not None else 4.0
        features[2] = min(max(rating / 5.0, 0.0), 1.0)
        features[4] = min(max(rating, 0.0), 5.0)

        raw_reviews = scoring.get("reviews") or poi.get("reviews") or 50
        reviews = float(raw_reviews) if raw_reviews is not None else 50.0
        features[3] = min(max(np.log10(max(reviews, 0.0) + 1.0) / 5.0, 0.0), 1.0)
        features[5] = max(reviews, 0.0)

        # 4. Multi-hot Tag Activations
        category = str(poi.get("category", "")).upper()
        if category in CATEGORY_TO_TAG:
            for tag in CATEGORY_TO_TAG[category]:
                if tag in TAG_KEYS:
                    idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index(tag)
                    features[idx] = 1.0

        # Text keyword extraction from name and description
        text_corpus = (
            f"{poi.get('name', '')} {poi.get('description', '')} {category}".lower()
        )
        for kw, tag in KEYWORD_TO_TAG.items():
            if kw in text_corpus and tag in TAG_KEYS:
                idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index(tag)
                features[idx] = 1.0

        # Metadata tags list if available
        metadata_tags = poi.get("metadata", {}).get("tags", [])
        if isinstance(metadata_tags, list):
            for t in metadata_tags:
                t_clean = str(t).lower()
                for kw, tag in KEYWORD_TO_TAG.items():
                    if kw in t_clean and tag in TAG_KEYS:
                        idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index(tag)
                        features[idx] = 1.0

        # Outdoor flag
        if features[PoiEncoder.TAG_START_IDX + TAG_KEYS.index("nature_outdoors")] > 0:
            features[7] = 1.0

        # If no tag matched at all, set default to general attraction
        if np.sum(features[PoiEncoder.TAG_START_IDX :]) == 0:
            features[PoiEncoder.TAG_START_IDX + TAG_KEYS.index("history_heritage")] = (
                0.5
            )
            features[PoiEncoder.TAG_START_IDX + TAG_KEYS.index("scenic_views")] = 0.5

        return features
