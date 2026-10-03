"""POI Tiering and Iconicity Resolution for Paladio Itinerary v2.

Resolves curated seed assignments (Tier 1 iconic must-sees, Tier 2 anchors)
with high confidence, and applies deterministic heuristic scoring for unseeded POIs.
"""

from pathlib import Path
from typing import Any

import yaml
from app.engine.v2.taxonomy import classify_poi_taxonomy

SEEDS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "city_seeds"


class CitySeedStore:
    """In-memory cache for curated city seeds loaded from YAML."""

    def __init__(self, seeds_dir: Path = SEEDS_DIR):
        self.seeds_dir = seeds_dir
        self._cache: dict[str, dict[str, dict[str, Any]]] = {}
        self._load_seeds()

    def _load_seeds(self) -> None:
        if not self.seeds_dir.exists():
            return

        for yaml_path in self.seeds_dir.glob("*.yaml"):
            try:
                with open(yaml_path, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if not data or "city" not in data or "seeds" not in data:
                    continue
                city_key = data["city"].strip().lower()
                if city_key not in self._cache:
                    self._cache[city_key] = {}
                for seed in data["seeds"]:
                    name_key = seed["name"].strip().lower()
                    self._cache[city_key][name_key] = seed
            except Exception as e:
                # Log or ignore corrupted files gracefully
                print(f"Warning: Failed to load seed file {yaml_path}: {e}")

    def get_seed(self, city: str, name: str) -> dict[str, Any] | None:
        city_dict = self._cache.get(city.strip().lower(), {})
        # Exact lowercase match
        clean_name = name.strip().lower()
        if clean_name in city_dict:
            return city_dict[clean_name]

        # Substring / partial match fallback for minor naming variations
        for seed_name, seed_data in city_dict.items():
            if clean_name in seed_name or seed_name in clean_name:
                return seed_data

        return None


# Global singleton instance
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
    """Compute tier, taxonomy, iconicity, and visit mode for a POI.

    Returns:
        dict with keys:
          - tier: int (1, 2, 3, or 4)
          - tier_confidence: str ("high" or "low")
          - tier_source: str ("seed" or "heuristic")
          - iconicity_score: float (0.0 .. 1.0)
          - taxonomy_category: str
          - category_id: int (0 .. 7)
          - visit_mode: str ("full", "quick", "exterior_only")
    """
    store = seed_store or get_seed_store()
    name = poi.get("name", "")
    seed = store.get_seed(city, name)

    if seed:
        return {
            "tier": int(seed.get("tier", 1)),
            "tier_confidence": "high",
            "tier_source": "seed",
            "iconicity_score": round(float(seed.get("iconicity_score", 0.90)), 3),
            "taxonomy_category": seed.get("taxonomy_category", "art_culture"),
            "category_id": int(seed.get("category_id", 0)),
            "visit_mode": seed.get("visit_mode", "full"),
        }

    # Unseeded: heuristic classification
    category = poi.get("category", "")
    metadata = poi.get("metadata") if isinstance(poi.get("metadata"), dict) else {}
    tax_cat, cat_id = classify_poi_taxonomy(name, category, metadata)

    # Calculate heuristic iconicity score
    duration = poi.get("duration_mins", 60)
    cost = poi.get("cost_eur", 0.0)

    score = 0.20

    # Duration signal
    if duration >= 120:
        score += 0.15
    elif duration >= 60:
        score += 0.08

    # Financial / admission signal
    if cost >= 10.0:
        score += 0.12
    elif cost > 0.0:
        score += 0.06

    # Category signal
    if tax_cat in ("art_culture", "history_heritage"):
        score += 0.08
    elif tax_cat in ("scenic_views", "architecture"):
        score += 0.06

    # Cap heuristic iconicity to [0.10, 0.65] to preserve distinction with curated seeds
    iconicity = max(0.10, min(0.65, score))

    if iconicity >= 0.50:
        tier = 2
    elif iconicity < 0.25:
        tier = 4
    else:
        tier = 3

    # Visit mode heuristic
    if tax_cat == "scenic_views" or duration <= 45:
        visit_mode = "quick"
    else:
        visit_mode = "full"

    return {
        "tier": tier,
        "tier_confidence": "low",
        "tier_source": "heuristic",
        "iconicity_score": round(iconicity, 3),
        "taxonomy_category": tax_cat,
        "category_id": cat_id,
        "visit_mode": visit_mode,
    }


# --- Relative (per-city) tiering for cities without curated seeds ---------------

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
    Curated seeds always win over the heuristic. Deterministic; ties broken by name.
    """
    store = seed_store or get_seed_store()
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
                    "category_id": 5,
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
    t1_cap = max(3, min(12, round(0.04 * n)))
    t2_cap = max(5, min(30, round(0.15 * n)))

    t1_count = 0
    t2_count = 0
    for idx, rec in enumerate(ranked):
        sig = rec.get("metadata", {}).get("osm") or {}
        seed = store.get_seed(city, rec.get("name", ""))
        if seed:
            rec.update(classify_poi_tier(rec, city, store))
            out.append(rec)
            continue

        r = raw(rec)
        tax_cat, cat_id = classify_poi_taxonomy(
            rec.get("name", ""),
            rec.get("category", ""),
            {"tags": _osm_tag_words(sig)},
        )
        strong = bool(sig.get("wikidata") or sig.get("wikipedia") or sig.get("unesco"))

        if t1_count < t1_cap and (r >= 4.0 or (t1_count < 3 and r > 0.0)):
            tier = 1
            t1_count += 1
            iconicity = round(
                max(0.70, 0.98 - 0.28 * (t1_count - 1) / max(1, t1_cap - 1)), 3
            )
        elif t2_count < t2_cap and r >= 1.0:
            tier = 2
            t2_count += 1
            iconicity = round(
                max(0.45, 0.66 - 0.21 * (t2_count - 1) / max(1, t2_cap - 1)), 3
            )
        elif r <= 0.3:
            tier = 4
            iconicity = 0.10
        else:
            tier = 3
            iconicity = round(min(0.40, 0.20 + 0.05 * r), 3)

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
