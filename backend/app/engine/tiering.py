"""POI Tiering and Iconicity Resolution for Paladio Itinerary v2.

Resolves curated seed assignments (Tier 1 iconic must-sees, Tier 2 anchors)
with high confidence, and applies deterministic heuristic scoring for unseeded POIs.
"""

import math
from typing import Any

from app.engine.taxonomy import CANONICAL_CATEGORIES, classify_poi_taxonomy


def compute_unified_iconicity_raw(poi: dict[str, Any]) -> float:
    """Computes raw iconicity combining OSM importance + Wikimedia authority signals.

    Formula:
    I_raw(p) = osm_importance_raw(p)
             + 2.5 * ln(1 + sitelinks_count)
             + 1.0 * ln(1 + pageviews_30d / 1000)
             + 3.0 * I(unesco)
             + 2.0 * I(wikivoyage_listed)
    """
    meta = poi.get("metadata") if isinstance(poi.get("metadata"), dict) else {}
    sig = meta.get("osm") if isinstance(meta.get("osm"), dict) else {}
    tags = meta.get("tags") if isinstance(meta.get("tags"), dict) else {}

    osm_raw = float(sig.get("importance_raw") or poi.get("importance_raw") or 0.0)
    if osm_raw == 0.0 and tags:
        from app.engine.osm_signals import extract_osm_signals

        extracted = extract_osm_signals(tags)
        osm_raw = float(extracted.get("importance_raw", 0.0))

    sitelinks = int(
        poi.get("sitelinks_count")
        or meta.get("sitelinks_count")
        or meta.get("wikidata", {}).get("sitelinks")
        or 0
    )
    pageviews = float(
        poi.get("pageviews_30d")
        or meta.get("pageviews_30d")
        or meta.get("wikipedia", {}).get("pageviews_30d")
        or 0.0
    )

    is_unesco = bool(
        poi.get("is_unesco")
        or meta.get("unesco")
        or sig.get("unesco")
        or tags.get("heritage") == "1"
        or "unesco" in str(tags.get("heritage", "")).lower()
        or tags.get("heritage:operator") == "whc"
    )

    is_wikivoyage = bool(
        poi.get("wikivoyage_listed")
        or meta.get("wikivoyage_listed")
        or poi.get("wikivoyage_extract")
        or meta.get("wikivoyage")
    )

    i_raw = (
        osm_raw
        + 2.5 * math.log(1.0 + sitelinks)
        + 1.0 * math.log(1.0 + max(0.0, pageviews) / 1000.0)
        + (3.0 if is_unesco else 0.0)
        + (2.0 if is_wikivoyage else 0.0)
    )
    return round(i_raw, 4)


def classify_poi_tier(
    poi: dict[str, Any],
    city: str,
) -> dict[str, Any]:
    """Compute tier, taxonomy, iconicity, and visit mode for a POI automatically.

    Always dynamic and algorithmic for every city worldwide.
    """
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

    name = poi.get("name", "")
    category = poi.get("category", "")
    metadata = poi.get("metadata") if isinstance(poi.get("metadata"), dict) else {}
    sig = metadata.get("osm") if isinstance(metadata.get("osm"), dict) else {}
    tax_cat, cat_id = classify_poi_taxonomy(name, category, metadata)
    i_raw = compute_unified_iconicity_raw(poi)

    duration = poi.get("duration_mins", 60)
    cost = poi.get("cost_eur", 0.0)

    if i_raw >= 3.5:
        tier = 1
        iconicity = round(min(0.99, 0.85 + 0.03 * (i_raw - 3.5)), 3)
        confidence = "high"
    elif i_raw >= 1.2:
        tier = 2
        iconicity = round(min(0.84, 0.60 + 0.08 * (i_raw - 1.2)), 3)
        confidence = "high"
    else:
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

    if (
        tax_cat == "scenic_views"
        or duration <= 45
        or str(category).lower() in ("statue", "viewpoint")
    ):
        visit_mode = "quick"
    else:
        visit_mode = "full"

    return {
        "tier": tier,
        "tier_confidence": confidence,
        "tier_source": "osm_signals" if (i_raw > 0 or sig) else "heuristic",
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
) -> list[dict[str, Any]]:
    """Assign tiers relative to the city itself using unified OSM + Wikimedia signals.

    A small town and a megacity both get calibrated must-sees, because ranking is by
    city-relative percentile ranks combined with absolute floors.
    Megacities allow up to t1_cap = 25 Tier 1 anchors and t2_cap = 80 Tier 2 sights,
    while smaller cities scale proportionally.
    Ties broken deterministically by name.
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

    ranked = sorted(
        sights,
        key=lambda r: (-compute_unified_iconicity_raw(r), r.get("name", "")),
    )
    n = len(ranked)
    t1_cap = max(4, min(25, round(0.08 * n)))
    t2_cap = max(8, min(80, round(0.22 * n)))

    t1_count = 0
    t2_count = 0
    for rec in ranked:
        i_raw = compute_unified_iconicity_raw(rec)
        sig = rec.get("metadata", {}).get("osm") or {}
        tax_cat, cat_id = classify_poi_taxonomy(
            rec.get("name", ""),
            rec.get("category", ""),
            {"tags": _osm_tag_words(sig)},
        )
        strong = bool(
            sig.get("wikidata")
            or sig.get("wikipedia")
            or sig.get("unesco")
            or rec.get("wikidata_id")
            or rec.get("wikipedia_title")
        )

        if t1_count < t1_cap and (i_raw >= 3.5 or (t1_count < 3 and i_raw > 0.0)):
            tier = 1
            t1_count += 1
            iconicity = round(
                max(0.85, 0.99 - 0.14 * (t1_count - 1) / max(1, t1_cap - 1)), 3
            )
        elif t2_count < t2_cap and i_raw >= 1.2:
            tier = 2
            t2_count += 1
            iconicity = round(
                max(0.60, 0.84 - 0.24 * (t2_count - 1) / max(1, t2_cap - 1)), 3
            )
        elif i_raw <= 0.3:
            tier = 4
            iconicity = 0.10
        else:
            tier = 3
            iconicity = round(min(0.59, 0.35 + 0.08 * i_raw), 3)

        tier_source = (
            "osm_signals" if (sig or rec.get("wikidata_id")) else "unified_signals"
        )

        dur = rec.get("duration_mins", 60)
        if (
            tax_cat == "scenic_views"
            or dur <= 45
            or str(rec.get("category", "")).lower() in ("statue", "viewpoint")
        ):
            visit_mode = "quick"
        else:
            visit_mode = "full"

        rec.update(
            {
                "tier": tier,
                "tier_confidence": "high"
                if (strong and tier <= 2) or tier == 1
                else "low",
                "tier_source": tier_source,
                "iconicity_score": iconicity,
                "taxonomy_category": tax_cat,
                "category_id": cat_id,
                "visit_mode": rec.get("visit_mode") or visit_mode,
            }
        )
        out.append(rec)
    return out
