"""Canonical 8-category taxonomy classification for Paladio POIs.

Matches C++ solver category IDs (0-7):
  0: art_culture
  1: history_heritage
  2: nature_outdoors
  3: architecture
  4: food_culinary
  5: nightlife
  6: shopping
  7: scenic_views
"""

from typing import Any

CANONICAL_CATEGORIES: dict[str, int] = {
    "art_culture": 0,
    "history_heritage": 1,
    "nature_outdoors": 2,
    "architecture": 3,
    "food_culinary": 4,
    "nightlife": 5,
    "shopping": 6,
    "scenic_views": 7,
}

UNKNOWN_CATEGORY: str = "unknown"
UNKNOWN_CATEGORY_ID: int = 255

CATEGORY_ID_TO_NAME: dict[int, str] = {v: k for k, v in CANONICAL_CATEGORIES.items()}
CATEGORY_ID_TO_NAME[UNKNOWN_CATEGORY_ID] = UNKNOWN_CATEGORY

# Ordered rules: earlier matches take priority
_TAXONOMY_KEYWORD_PATTERNS: list[tuple[str, list[str]]] = [
    (
        "scenic_views",
        [
            "mirador",
            "miradouro",
            "belvédère",
            "viewpoint",
            "observation",
            "rooftop",
            "lookout",
            "panorama",
            "crossing",
            "tower",
            "torre",
            "bridge",
            "pont ",
            "ponte ",
        ],
    ),
    (
        "food_culinary",
        [
            "restaurant",
            "bistrot",
            "brasserie",
            "café",
            "cafe",
            "food",
            "culinary",
            "gastro",
            "tasting",
            "dining",
            "eatery",
            "trattoria",
            "tavern",
            "taberna",
            "bodega",
        ],
    ),
    (
        "nightlife",
        [
            "bar",
            "pub",
            "club",
            "cocktail",
            "nightlife",
            "lounge",
            "speakeasy",
            "disco",
            "brewery",
            "cantina",
        ],
    ),
    (
        "shopping",
        [
            "shopping",
            "mall",
            "market",
            "mercado",
            "marche",
            "boutique",
            "store",
            "bazaar",
            "bazaars",
            "commercial",
        ],
    ),
    (
        "nature_outdoors",
        [
            "park",
            "parc",
            "parque",
            "jardin",
            "jardim",
            "garden",
            "forest",
            "zoo",
            "botanical",
            "botânico",
            "river",
            "lake",
            "beach",
            "praia",
            "playa",
        ],
    ),
    (
        "history_heritage",
        [
            "history",
            "histoire",
            "história",
            "histórico",
            "historic",
            "arqueol",
            "archaeolog",
            "catacomb",
            "château",
            "castle",
            "castelo",
            "castillo",
            "convento",
            "monastery",
            "fortress",
            "fort",
            "temple",
            "shrine",
            "ruins",
            "ruines",
            "ruínas",
            "monument",
            "memorial",
        ],
    ),
    (
        "architecture",
        [
            "aqueduc",
            "aqueduto",
            "architecture",
            "landmark",
            "building",
            "edifício",
            "palacio",
            "palácio",
            "palais",
            "palace",
            "cathedral",
            "cathédrale",
            "catedral",
            "basilica",
            "basílica",
            "igreja",
            "church",
            "chapelle",
            "chapel",
        ],
    ),
    (
        "art_culture",
        [
            "museum",
            "musée",
            "museo",
            "museu",
            "art",
            "arte",
            "arts",
            "theatre",
            "théâtre",
            "teatro",
            "opera",
            "opéra",
            "cinema",
            "gallery",
            "galerie",
            "galeria",
            "music",
            "musique",
            "música",
            "exhibition",
            "exposition",
            "sculpture",
            "paint",
            "peinture",
            "cultural",
        ],
    ),
]


def classify_poi_taxonomy(
    name: str,
    category: str = "",
    metadata: dict[str, Any] | None = None,
) -> tuple[str, int]:
    """Classify a POI into one of the 8 canonical categories (or unknown).

    Tag-first deterministic hierarchy:
    1. Structured OSM tags (amenity, tourism, historic, leisure, building, shop)
    2. Explicit category string
    3. Name and keyword patterns
    4. Fallback to ('unknown', 255)

    Returns:
        tuple[str, int]: (taxonomy_category_name, category_id in 0..7 or 255)
    """
    # 1. Structured OSM tags check (highest confidence)
    tags_dict: dict[str, Any] = {}
    if metadata and isinstance(metadata, dict):
        if isinstance(metadata.get("tags"), dict):
            tags_dict.update(metadata["tags"])
        if isinstance(metadata.get("osm"), dict) and isinstance(
            metadata["osm"].get("tags"), dict
        ):
            tags_dict.update(metadata["osm"]["tags"])
        for k in ("amenity", "tourism", "historic", "leisure", "building", "shop"):
            if k in metadata and isinstance(metadata[k], str):
                tags_dict[k] = metadata[k]

    amenity = str(tags_dict.get("amenity", "")).lower().strip()
    tourism = str(tags_dict.get("tourism", "")).lower().strip()
    historic = str(tags_dict.get("historic", "")).lower().strip()
    leisure = str(tags_dict.get("leisure", "")).lower().strip()
    building = str(tags_dict.get("building", "")).lower().strip()
    shop = str(tags_dict.get("shop", "")).lower().strip()

    if amenity in ("bar", "pub", "nightclub", "biergarten", "lounge"):
        return "nightlife", CANONICAL_CATEGORIES["nightlife"]
    if amenity in (
        "restaurant",
        "cafe",
        "fast_food",
        "food_court",
        "bistrot",
        "bistro",
        "ice_cream",
    ):
        return "food_culinary", CANONICAL_CATEGORIES["food_culinary"]
    if tourism == "viewpoint":
        return "scenic_views", CANONICAL_CATEGORIES["scenic_views"]
    if tourism in ("museum", "gallery", "arts_centre"):
        return "art_culture", CANONICAL_CATEGORIES["art_culture"]
    if tourism in ("theme_park", "zoo", "aquarium"):
        return "nature_outdoors", CANONICAL_CATEGORIES["nature_outdoors"]
    if historic == "aqueduct":
        return "architecture", CANONICAL_CATEGORIES["architecture"]
    if historic in (
        "monument",
        "memorial",
        "castle",
        "ruins",
        "archaeological_site",
        "fort",
        "city_gate",
    ):
        return "history_heritage", CANONICAL_CATEGORIES["history_heritage"]
    if building in (
        "cathedral",
        "church",
        "temple",
        "basilica",
        "chapel",
        "mosque",
        "synagogue",
        "palace",
    ):
        return "architecture", CANONICAL_CATEGORIES["architecture"]
    if leisure in ("park", "garden", "nature_reserve"):
        return "nature_outdoors", CANONICAL_CATEGORIES["nature_outdoors"]
    if shop and shop not in ("no", "none", "false", ""):
        return "shopping", CANONICAL_CATEGORIES["shopping"]

    # 2. Name and keyword patterns (e.g. 'Cathedral', 'Aqueduto' refine broad 'monument' category)
    text_corpus = f"{name} {category}".lower()
    if metadata and isinstance(metadata, dict):
        tags = metadata.get("tags") or metadata.get("amenity") or ""
        if isinstance(tags, dict):
            tags_str = " ".join(f"{k} {v}" for k, v in tags.items())
        elif isinstance(tags, list):
            tags_str = " ".join(str(t) for t in tags)
        else:
            tags_str = str(tags)
        text_corpus += f" {tags_str}".lower()

    name_lower = name.lower()
    for cat_name, patterns in _TAXONOMY_KEYWORD_PATTERNS:
        if any(pat in name_lower for pat in patterns):
            return cat_name, CANONICAL_CATEGORIES[cat_name]

    for cat_name, patterns in _TAXONOMY_KEYWORD_PATTERNS:
        if any(pat in text_corpus for pat in patterns):
            return cat_name, CANONICAL_CATEGORIES[cat_name]

    # 3. Broad category input string fallback
    cat_lower = category.lower().strip()
    if cat_lower in ("museum", "art_gallery"):
        return "art_culture", CANONICAL_CATEGORIES["art_culture"]
    if cat_lower in ("monument", "historic", "ruins", "heritage"):
        return "history_heritage", CANONICAL_CATEGORIES["history_heritage"]
    if cat_lower in ("restaurant", "food", "cafe", "bistrot", "bistro"):
        return "food_culinary", CANONICAL_CATEGORIES["food_culinary"]
    if cat_lower in ("bar", "pub", "nightlife", "club"):
        return "nightlife", CANONICAL_CATEGORIES["nightlife"]
    if cat_lower in ("viewpoint", "lookout", "mirador", "miradouro"):
        return "scenic_views", CANONICAL_CATEGORIES["scenic_views"]
    if cat_lower in ("park", "garden", "nature"):
        return "nature_outdoors", CANONICAL_CATEGORIES["nature_outdoors"]
    if cat_lower in ("shopping", "mall", "market"):
        return "shopping", CANONICAL_CATEGORIES["shopping"]

    # 4. Fallback for unclassified venues
    return UNKNOWN_CATEGORY, UNKNOWN_CATEGORY_ID
