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

CATEGORY_ID_TO_NAME: dict[int, str] = {v: k for k, v in CANONICAL_CATEGORIES.items()}

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
            "crossing view",
            "crossing",
            "shibuya crossing",
            "tower",
            "torre",
            "bridge",
            "pont ",
            "ponte ",
            "barcos rabelo",
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
            "bacalhau",
            "gastro",
            "tasting",
            "wine",
            "bodega",
            "dining",
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
        ],
    ),
    (
        "shopping",
        [
            "shopping",
            "mall",
            "market",
            "mercado",
            "boutique",
            "store",
            "bazaar",
            "bazaars",
            "commercial",
            "parco",
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
            "biodiversidade",
            "zoo",
            "botanical",
            "botânico",
            "river",
            "lake",
            "beach",
            "praia",
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
            "convento",
            "cervantes",
            "chamberí",
            "moneda",
            "aljube",
            "milit",
            "armée",
            "futebol clube do porto",
            "samurai",
            "katana",
            "刀剣",
            "temple",
            "shrine",
            "ruins",
            "ruines",
            "ruínas",
            "monument",
        ],
    ),
    (
        "architecture",
        [
            "aqueduc",
            "aqueduto",
            "architecture",
            "patrimoine",
            "champs élysées",
            "building",
            "edifício",
            "palacio",
            "palácio",
            "palais",
            "cathedral",
            "cathédrale",
            "catedral",
            "basilica",
            "basílica",
            "igreja",
            "church",
            "chapelle",
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
            "dali",
            "sorolla",
            "goya",
            "victor hugo",
            "pessoa",
            "amália",
            "marionet",
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
            "sculpture",
            "paint",
            "peinture",
            "ukiyo-e",
            "美術館",
            "民藝館",
        ],
    ),
]


def classify_poi_taxonomy(
    name: str,
    category: str = "",
    metadata: dict[str, Any] | None = None,
) -> tuple[str, int]:
    """Classify a POI into one of the 8 canonical categories.

    Returns:
        tuple[str, int]: (taxonomy_category_name, category_id in 0..7)
    """
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

    # Category fallback
    cat_lower = category.lower()
    if cat_lower in ("museum", "art_gallery"):
        return "art_culture", CANONICAL_CATEGORIES["art_culture"]
    if cat_lower in ("monument", "historic", "ruins"):
        return "history_heritage", CANONICAL_CATEGORIES["history_heritage"]
    if cat_lower in ("restaurant", "food"):
        return "food_culinary", CANONICAL_CATEGORIES["food_culinary"]
    if cat_lower in ("bar", "pub"):
        return "nightlife", CANONICAL_CATEGORIES["nightlife"]
    if cat_lower in ("viewpoint",):
        return "scenic_views", CANONICAL_CATEGORIES["scenic_views"]

    # Default fallback
    return "art_culture", CANONICAL_CATEGORIES["art_culture"]
