"""Deterministic importance signals derived from raw OpenStreetMap tags.

No network access and no LLM here: these functions only turn already-fetched
tags into (a) a comparable importance score used for per-city relative tiering and
(b) sensible visit duration / cost / opening-hours defaults per POI type.
"""

import re
from typing import Any

_LANG_KEY = re.compile(r"^name:([a-z]{2,3})(?:[-_][A-Za-z]+)?$")
_IGNORED_NAME_KEYS = {"name:etymology", "name:left", "name:right", "name:signed"}

UNESCO_OPERATORS = {"whc", "unesco"}


def count_name_languages(tags: dict[str, str]) -> int:
    """Number of distinct language-specific names: a strong global-fame proxy."""
    langs = {
        m.group(1)
        for k in tags
        if k not in _IGNORED_NAME_KEYS and (m := _LANG_KEY.match(k))
    }
    return len(langs)


def extract_osm_signals(tags: dict[str, str]) -> dict[str, Any]:
    """Compact, JSON-serialisable signal summary persisted in POI metadata."""
    heritage = str(tags.get("heritage", "")).strip()
    unesco = (
        str(tags.get("heritage:operator", "")).lower() in UNESCO_OPERATORS
        or "whc:inscription_date" in tags
        or bool(tags.get("ref:whc"))
    )
    sig: dict[str, Any] = {
        "wikidata": bool(tags.get("wikidata")),
        "wikipedia": bool(tags.get("wikipedia")),
        "n_langs": count_name_languages(tags),
        "heritage": heritage or None,
        "unesco": unesco,
        "commons": bool(tags.get("wikimedia_commons")),
        "website": bool(tags.get("website") or tags.get("contact:website")),
        "description": bool(tags.get("description")),
        "has_hours": bool(tags.get("opening_hours")),
        "tourism": tags.get("tourism"),
        "historic": tags.get("historic"),
        "building": tags.get("building"),
        "amenity": tags.get("amenity"),
        "leisure": tags.get("leisure"),
        "natural": tags.get("natural"),
        "man_made": tags.get("man_made"),
        "religion": tags.get("religion"),
    }
    sig["importance_raw"] = importance_raw(sig)
    return sig


def importance_raw(sig: dict[str, Any]) -> float:
    """Additive, monotone importance score (higher = more of a must-see)."""
    score = 0.0
    if sig.get("wikidata"):
        score += 2.0
    if sig.get("wikipedia"):
        score += 2.0
    score += min(int(sig.get("n_langs", 0)), 15) * 0.35
    if sig.get("unesco"):
        score += 4.0
    heritage = sig.get("heritage")
    if heritage:
        score += 2.0 if heritage in ("1", "2", "world", "national") else 1.0
    if sig.get("commons"):
        score += 0.8
    if sig.get("website"):
        score += 0.4
    if sig.get("description"):
        score += 0.3
    if sig.get("has_hours"):
        score += 0.2

    building = sig.get("building")
    historic = sig.get("historic")
    tourism = sig.get("tourism")
    if building in ("cathedral", "palace", "castle", "basilica"):
        score += 1.0
    if historic in ("castle", "palace", "fort", "archaeological_site"):
        score += 1.0
    if tourism == "attraction":
        score += 0.5
    elif tourism == "museum":
        score += 0.6
    elif tourism == "zoo" or tourism == "aquarium":
        score += 0.8

    # Low-value street furniture style objects
    if tourism == "artwork":
        score -= 1.0
    if historic in ("memorial", "wayside_cross", "wayside_shrine", "boundary_stone"):
        score -= 1.0
    return round(score, 3)


# --- Category / visit defaults -------------------------------------------------


def classify_osm_category(tags: dict[str, str]) -> str:
    """Maps raw OSM tags onto the coarse categories used across Paladio."""
    amenity = tags.get("amenity")
    if amenity == "restaurant":
        return "restaurant"
    if amenity == "cafe":
        return "cafe"
    tourism = tags.get("tourism")
    if tourism in ("museum", "gallery"):
        return "museum"
    if tourism == "viewpoint":
        return "viewpoint"
    if tourism in ("zoo", "aquarium"):
        return "attraction"
    if tags.get("leisure") in ("park", "garden"):
        return "park"
    if tags.get("natural") in ("peak", "beach", "waterfall", "cave_entrance"):
        return "viewpoint"
    if tags.get("historic") or tags.get("amenity") == "place_of_worship":
        return "monument"
    if tags.get("building") in (
        "cathedral",
        "palace",
        "castle",
        "temple",
        "mosque",
        "synagogue",
        "basilica",
    ):
        return "monument"
    if tags.get("man_made") in ("tower", "lighthouse", "bridge", "obelisk", "windmill"):
        return "monument"
    return "attraction"


def default_duration_mins(
    tags: dict[str, str], category: str, sig: dict[str, Any]
) -> int:
    """Realistic visit duration by type (minutes)."""
    tourism = tags.get("tourism")
    historic = tags.get("historic")
    if tourism == "zoo":
        return 180
    if tourism == "aquarium":
        return 120
    if tourism == "museum":
        return 120 if sig.get("wikidata") or sig.get("n_langs", 0) >= 4 else 90
    if tourism == "gallery":
        return 60
    if historic in ("castle", "palace", "fort", "manor"):
        return 90
    if historic in ("ruins", "archaeological_site"):
        return 60
    if historic in ("city_gate", "citywalls", "memorial", "monument", "tower"):
        return 20
    if tags.get("amenity") == "place_of_worship":
        return 40 if sig.get("wikidata") else 25
    if tags.get("building") in ("cathedral", "basilica", "palace", "castle"):
        return 45
    if category == "viewpoint":
        return 30
    if category == "park":
        return 60
    if tags.get("man_made") in ("tower", "lighthouse", "windmill"):
        return 40
    if category == "restaurant":
        return 75
    if category == "cafe":
        return 40
    return 45


def default_cost_eur(tags: dict[str, str], category: str) -> float:
    """Entrance cost estimate when OSM carries no fee/charge tag (EUR)."""
    tourism = tags.get("tourism")
    if tourism in ("zoo", "aquarium"):
        return 20.0
    if tourism == "museum":
        return 12.0
    if tourism == "gallery":
        return 8.0
    if tags.get("historic") in ("castle", "palace", "fort", "manor"):
        return 10.0
    if category == "restaurant":
        return 25.0
    if category == "cafe":
        return 8.0
    if category in ("park", "viewpoint", "monument"):
        return 0.0
    return 3.0


def default_hours(category: str, tags: dict[str, str]) -> tuple[list[int], list[int]]:
    """Assumed 7-day opening vectors when OSM has no opening_hours tag.

    Indexed Monday..Sunday, minutes since midnight. These are *assumptions* and
    are flagged as such in metadata (`hours_source = "assumed_default"`).
    """
    if category == "restaurant":
        return [690] * 7, [1380] * 7  # 11:30 - 23:00
    if category == "cafe":
        return [450] * 7, [1200] * 7  # 07:30 - 20:00
    if category in ("park", "viewpoint") or tags.get("natural"):
        return [420] * 7, [1260] * 7  # 07:00 - 21:00
    if tags.get("amenity") == "place_of_worship":
        return [540] * 7, [1080] * 7  # 09:00 - 18:00
    if tags.get("historic") in ("city_gate", "memorial", "monument", "citywalls"):
        return [360] * 7, [1320] * 7  # outdoor, effectively always visitable
    return [570] * 7, [1080] * 7  # 09:30 - 18:00 museums / sites


def default_visit_mode(tags: dict[str, str], category: str) -> str:
    historic = tags.get("historic")
    if historic in ("city_gate", "citywalls", "memorial", "monument") or tags.get(
        "man_made"
    ) in ("bridge", "obelisk"):
        return "exterior_only"
    if category in ("viewpoint",):
        return "quick"
    return "full"
