"""POI Tiering and Iconicity Resolution for Paladio Itinerary v2.

Resolves curated seed assignments (Tier 1 iconic must-sees, Tier 2 anchors)
with high confidence, and applies deterministic heuristic scoring for unseeded POIs.
"""

from pathlib import Path
from typing import Any

from app.engine.v2.taxonomy import CANONICAL_CATEGORIES, classify_poi_taxonomy

SEEDS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "city_seeds"


class CitySeedStore:
    """Deprecated: Seed store kept for backward-compatibility only.
    All POI tiering and ingestion is 100% automatic and dynamic across all cities.
    """

    def __init__(self, seeds_dir: Path | None = None):
        self._cache: dict[str, dict[str, dict[str, Any]]] = {}

    def get_seed(self, city: str, name: str) -> dict[str, Any] | None:
        return None


# Global singleton instance (deprecated stub)
_GLOBAL_SEED_STORE: CitySeedStore | None = None


def get_seed_store() -> CitySeedStore:
    global _GLOBAL_SEED_STORE
    if _GLOBAL_SEED_STORE is None:
        _GLOBAL_SEED_STORE = CitySeedStore()
    return _GLOBAL_SEED_STORE


def classify_poi_tier(
    poi: dict[str, Any],
    city: str,
    seed_store: CitySeedStore | None = None,
) -> dict[str, Any]:
    """Compute tier, taxonomy, iconicity, and visit mode for a POI automatically.

    Always dynamic and algorithmic for every city worldwide.
    """
    # 1. Fast path: if the POI already has persisted tier and iconicity_score from
    # automatic OSM relative tiering, preserve them directly.
    existing_tier = poi.get("tier")
    existing_iconicity = poi.get("iconicity_score")
    if (
        existing_tier is not None
        and existing_tier in (1, 2, 3, 4)
        and existing_iconicity is not None
        and float(existing_iconicity) > 0.0
    ):
        return {
            "tier": int(existing_tier),
            "tier_confidence": poi.get("tier_confidence", "high"),
            "tier_source": poi.get("tier_source", "osm_signals"),
            "iconicity_score": round(float(existing_iconicity), 3),
            "taxonomy_category": poi.get("taxonomy_category", "art_culture"),
            "category_id": int(poi.get("category_id", 0)),
            "visit_mode": poi.get("visit_mode", "full"),
        }

    # Dynamic signal / heuristic classification
    name = poi.get("name", "")
    category = poi.get("category", "")
    metadata = poi.get("metadata") if isinstance(poi.get("metadata"), dict) else {}
    tax_cat, cat_id = classify_poi_taxonomy(name, category, metadata)
    sig = metadata.get("osm") if isinstance(metadata.get("osm"), dict) else {}
    r = float(sig.get("importance_raw", 0.0))

    duration = poi.get("duration_mins", 60)
    cost = poi.get("cost_eur", 0.0)

    if r >= 3.5:
        tier = 1
        iconicity = round(min(0.99, 0.85 + 0.03 * (r - 3.5)), 3)
        confidence = "high"
    elif r >= 1.2:
        tier = 2
        iconicity = round(min(0.84, 0.60 + 0.08 * (r - 1.2)), 3)
        confidence = "high"
    else:
        # Calculate heuristic iconicity score
        score = 0.25
        if duration >= 120:
            score += 0.20
        elif duration >= 60:
            score += 0.10

        if cost >= 10.0:
            score += 0.15
        elif cost > 0.0:
            score += 0.08

        if tax_cat in ("art_culture", "history_heritage"):
            score += 0.12
        elif tax_cat in ("scenic_views", "architecture"):
            score += 0.08

        iconicity = max(0.10, min(0.80, score))
        if iconicity >= 0.65:
            tier = 2
        elif iconicity < 0.25:
            tier = 4
        else:
            tier = 3
        confidence = "low"

    # Visit mode heuristic
    if tax_cat == "scenic_views" or duration <= 45:
        visit_mode = "quick"
    else:
        visit_mode = "full"

    return {
        "tier": tier,
        "tier_confidence": confidence,
        "tier_source": "osm_signals" if r > 0 else "heuristic",
        "iconicity_score": round(iconicity, 3),
        "taxonomy_category": tax_cat,
        "category_id": cat_id,
        "visit_mode": visit_mode,
    }


# --- Relative (per-city) tiering for any city on Earth ------------------------

_MEAL_CATEGORIES = {"restaurant", "cafe", "food", "bistrot"}


def _osm_tag_words(sig: dict[str, Any]) -> list[str]:
    keys = (
        "tourism",
        "historic",
        "building",
        "amenity",
        "leisure",
        "natural",
        "man_made",
    )
    return [str(sig[k]) for k in keys if sig.get(k)]


def tier_city_attractions(
    records: list[dict[str, Any]],
    city: str,
    seed_store: CitySeedStore | None = None,
) -> list[dict[str, Any]]:
    """Assign tiers relative to the city itself from OSM importance signals.

    A town of 3 sights and a megacity both get a handful of Tier-1 must-sees, because
    ranking is by percentile of the importance score, not by absolute thresholds.
    100% dynamic and algorithmic for every city. Ties broken deterministically by name.
    """
    out: list[dict[str, Any]] = []
    sights: list[dict[str, Any]] = []

    for rec in records:
        if str(rec.get("category", "")).lower() in _MEAL_CATEGORIES:
            rec.update(
                {
                    "tier": 3,
                    "tier_confidence": "low",
                    "tier_source": "osm_signals",
                    "iconicity_score": 0.0,
                    "taxonomy_category": "food_culinary",
                    "category_id": CANONICAL_CATEGORIES["food_culinary"],
                    "visit_mode": "full",
                }
            )
            out.append(rec)
        else:
            sights.append(rec)

    def raw(rec: dict[str, Any]) -> float:
        return float(
            (rec.get("metadata", {}).get("osm") or {}).get("importance_raw", 0.0)
        )

    ranked = sorted(sights, key=lambda r: (-raw(r), r.get("name", "")))
    n = len(ranked)
    t1_cap = max(4, min(14, round(0.08 * n)))
    t2_cap = max(8, min(35, round(0.22 * n)))

    t1_count = 0
    t2_count = 0
    for idx, rec in enumerate(ranked):
        sig = rec.get("metadata", {}).get("osm") or {}
        r = raw(rec)
        tax_cat, cat_id = classify_poi_taxonomy(
            rec.get("name", ""),
            rec.get("category", ""),
            {"tags": _osm_tag_words(sig)},
        )
        strong = bool(sig.get("wikidata") or sig.get("wikipedia") or sig.get("unesco"))

        if t1_count < t1_cap and (r >= 3.5 or (t1_count < 3 and r > 0.0)):
            tier = 1
            t1_count += 1
            iconicity = round(
                max(0.85, 0.99 - 0.14 * (t1_count - 1) / max(1, t1_cap - 1)), 3
            )
        elif t2_count < t2_cap and r >= 1.2:
            tier = 2
            t2_count += 1
            iconicity = round(
                max(0.60, 0.84 - 0.24 * (t2_count - 1) / max(1, t2_cap - 1)), 3
            )
        elif r <= 0.3:
            tier = 4
            iconicity = 0.10
        else:
            tier = 3
            iconicity = round(min(0.59, 0.35 + 0.08 * r), 3)

        rec.update(
            {
                "tier": tier,
                "tier_confidence": "high" if strong and tier <= 2 else "low",
                "tier_source": "osm_signals",
                "iconicity_score": iconicity,
                "taxonomy_category": tax_cat,
                "category_id": cat_id,
                "visit_mode": rec.get("visit_mode", "full"),
            }
        )
        out.append(rec)
    return out
