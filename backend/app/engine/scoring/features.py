import logging
import re
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

# Mapping common travel keywords to standard tags (English, Spanish, Italian, French)
KEYWORD_TO_TAG: dict[str, str] = {
    # Art & Culture
    "museum": "art_culture",
    "museo": "art_culture",
    "musée": "art_culture",
    "art": "art_culture",
    "arts": "art_culture",
    "gallery": "art_culture",
    "galería": "art_culture",
    "galerie": "art_culture",
    "painting": "art_culture",
    "sculpture": "art_culture",
    "exhibition": "art_culture",
    "theatre": "art_culture",
    "theater": "art_culture",
    "teatro": "art_culture",
    "opera": "art_culture",
    # History & Heritage
    "history": "history_heritage",
    "historic": "history_heritage",
    "historical": "history_heritage",
    "ancient": "history_heritage",
    "castle": "history_heritage",
    "castillo": "history_heritage",
    "château": "history_heritage",
    "palace": "history_heritage",
    "palacio": "history_heritage",
    "palazzo": "history_heritage",
    "cathedral": "history_heritage",
    "catedral": "history_heritage",
    "duomo": "history_heritage",
    "basilica": "history_heritage",
    "basílica": "history_heritage",
    "church": "history_heritage",
    "iglesia": "history_heritage",
    "monastery": "history_heritage",
    "monasterio": "history_heritage",
    "abbey": "history_heritage",
    "ruin": "history_heritage",
    "ruins": "history_heritage",
    "monument": "history_heritage",
    "monumento": "history_heritage",
    "citadel": "history_heritage",
    "alcazar": "history_heritage",
    "alcázar": "history_heritage",
    "mezquita": "history_heritage",
    "fortress": "history_heritage",
    "fort": "history_heritage",
    "amphitheater": "history_heritage",
    "colosseum": "history_heritage",
    "sanctuary": "history_heritage",
    "shrine": "history_heritage",
    "temple": "history_heritage",
    # Nature & Outdoors
    "park": "nature_outdoors",
    "parque": "nature_outdoors",
    "garden": "nature_outdoors",
    "gardens": "nature_outdoors",
    "jardín": "nature_outdoors",
    "jardines": "nature_outdoors",
    "nature": "nature_outdoors",
    "forest": "nature_outdoors",
    "bosque": "nature_outdoors",
    "beach": "nature_outdoors",
    "playa": "nature_outdoors",
    "trail": "nature_outdoors",
    "hiking": "nature_outdoors",
    "senderismo": "nature_outdoors",
    "lake": "nature_outdoors",
    "lago": "nature_outdoors",
    "cliff": "nature_outdoors",
    "canyon": "nature_outdoors",
    "waterfall": "nature_outdoors",
    "cascada": "nature_outdoors",
    "botanical": "nature_outdoors",
    "botánico": "nature_outdoors",
    "reserve": "nature_outdoors",
    "reserva": "nature_outdoors",
    # Architecture
    "architecture": "architecture",
    "arquitectura": "architecture",
    "building": "architecture",
    "edificio": "architecture",
    "tower": "architecture",
    "torre": "architecture",
    "bridge": "architecture",
    "puente": "architecture",
    "plaza": "architecture",
    "square": "architecture",
    "piazza": "architecture",
    "facade": "architecture",
    "monumental": "architecture",
    "fountain": "architecture",
    "fuente": "architecture",
    # Food & Culinary
    "restaurant": "food_culinary",
    "restaurante": "food_culinary",
    "food": "food_culinary",
    "comida": "food_culinary",
    "cafe": "food_culinary",
    "café": "food_culinary",
    "cafeteria": "food_culinary",
    "bakery": "food_culinary",
    "panaderia": "food_culinary",
    "pasteleria": "food_culinary",
    "tapas": "food_culinary",
    "bistro": "food_culinary",
    "brasserie": "food_culinary",
    "gastronomy": "food_culinary",
    "gastronomia": "food_culinary",
    "osteria": "food_culinary",
    "trattoria": "food_culinary",
    "pizzeria": "food_culinary",
    "bodega": "food_culinary",
    "taberna": "food_culinary",
    "meson": "food_culinary",
    "mesón": "food_culinary",
    "churreria": "food_culinary",
    "churrería": "food_culinary",
    "culinary": "food_culinary",
    # Nightlife
    "bar": "nightlife",
    "pub": "nightlife",
    "cocktail": "nightlife",
    "coctel": "nightlife",
    "coctelería": "nightlife",
    "club": "nightlife",
    "discoteca": "nightlife",
    "nightlife": "nightlife",
    "beer": "nightlife",
    "cerveza": "nightlife",
    "cerveceria": "nightlife",
    "cervecería": "nightlife",
    "wine": "nightlife",
    "vino": "nightlife",
    "lounge": "nightlife",
    "speakeasy": "nightlife",
    "jazz": "nightlife",
    # Shopping
    "market": "shopping",
    "mercado": "shopping",
    "mercadillo": "shopping",
    "shopping": "shopping",
    "bazaar": "shopping",
    "bazar": "shopping",
    "mall": "shopping",
    "boutique": "shopping",
    "souvenir": "shopping",
    "artisan": "shopping",
    "artesanía": "shopping",
    # Scenic Views
    "view": "scenic_views",
    "views": "scenic_views",
    "vistas": "scenic_views",
    "viewpoint": "scenic_views",
    "mirador": "scenic_views",
    "panorama": "scenic_views",
    "panoramic": "scenic_views",
    "panorámica": "scenic_views",
    "lookout": "scenic_views",
    "terrace": "scenic_views",
    "terraza": "scenic_views",
    "rooftop": "scenic_views",
    "belvedere": "scenic_views",
    "overlook": "scenic_views",
    "observation": "scenic_views",
    "skyline": "scenic_views",
}


# Pre-compiled categorical regex patterns for multi-hot tag extraction at module load time
TAG_REGEX_MAP: dict[str, re.Pattern] = {
    tag: re.compile(
        rf"\b(?:{'|'.join(re.escape(kw) for kw, t in KEYWORD_TO_TAG.items() if t == tag)})\b",
        re.IGNORECASE,
    )
    for tag in TAG_KEYS
}

COMPILED_KEYWORD_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE), kw, tag)
    for kw, tag in KEYWORD_TO_TAG.items()
]
MARKET_STREET_PATTERN: re.Pattern = re.compile(
    r"\bmarket\s+(?:st|street|ave|avenue|rd|road|sq|square)\b", re.IGNORECASE
)


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
    def encode(poi: dict[str, Any] | Any) -> np.ndarray:
        if hasattr(poi, "model_dump"):
            poi = poi.model_dump()
        elif not isinstance(poi, dict):
            poi = dict(poi)

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

        # Text keyword extraction from name and description using regex word boundaries
        meta = poi.get("metadata")
        meta_dict = (
            meta
            if isinstance(meta, dict)
            else (meta.model_dump() if hasattr(meta, "model_dump") else {})
        )
        description = (
            (meta_dict.get("description") if isinstance(meta_dict, dict) else "")
            or poi.get("description", "")
            or ""
        )
        text_corpus = f"{poi.get('name', '')} {description} {category}".lower()
        for pattern, kw, tag in COMPILED_KEYWORD_PATTERNS:
            if tag in TAG_KEYS:
                if pattern.search(text_corpus):
                    # Guardrail: avoid false-positive shopping when "market" is solely a street name
                    if kw == "market" and MARKET_STREET_PATTERN.search(text_corpus):
                        continue
                    idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index(tag)
                    features[idx] = 1.0

        # Metadata tags list if available
        metadata_tags = (
            meta_dict.get("tags", [])
            if isinstance(meta_dict, dict)
            else poi.get("metadata", {}).get("tags", [])
        )
        if isinstance(metadata_tags, list):
            for t in metadata_tags:
                t_clean = str(t).lower()
                for pattern, kw, tag in COMPILED_KEYWORD_PATTERNS:
                    if tag in TAG_KEYS:
                        if pattern.search(t_clean):
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
