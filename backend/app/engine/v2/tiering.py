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
