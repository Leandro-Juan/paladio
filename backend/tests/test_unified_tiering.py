import math
from app.engine.v2.tiering import (
    compute_unified_iconicity_raw,
    tier_city_attractions,
)


def test_compute_unified_iconicity_raw_formula():
    """Verify that compute_unified_iconicity_raw matches the PLAN.md formula:
    I_raw(p) = osm_importance_raw(p)
             + 2.5 * ln(1 + sitelinks_count)
             + 1.0 * ln(1 + pageviews_30d / 1000)
             + 3.0 * I(unesco)
             + 2.0 * I(wikivoyage_listed)
    """
    poi = {
        "name": "Eiffel Tower",
        "category": "monument",
        "sitelinks_count": 150,
        "pageviews_30d": 45000,
        "is_unesco": True,
        "wikivoyage_listed": True,
        "metadata": {
            "osm": {
                "importance_raw": 18.0,
            }
        },
    }
    raw = compute_unified_iconicity_raw(poi)

    expected = (
        18.0 + 2.5 * math.log(1 + 150) + 1.0 * math.log(1 + 45000 / 1000) + 3.0 + 2.0
    )
    assert abs(raw - expected) < 1e-3


def test_megacity_relative_scaling_caps():
    """Verify that a megacity with 1000 POIs scales t1_cap up to 25 and t2_cap up to 80."""
    # Generate 1000 dummy POIs with decreasing importance
    pois = [
        {
            "id": f"poi_{i}",
            "name": f"Attraction {i:04d}",
            "category": "monument",
            "metadata": {
                "osm": {
                    "importance_raw": max(0.1, 20.0 - i * 0.02),
                }
            },
        }
        for i in range(1000)
    ]

    tiered = tier_city_attractions(pois, "Paris")
    t1_sights = [p for p in tiered if p["tier"] == 1]
    t2_sights = [p for p in tiered if p["tier"] == 2]

    # t1_cap should be clamped at 25
    assert len(t1_sights) == 25
    # t2_cap should be clamped at 80
    assert len(t2_sights) == 80


def test_small_city_relative_scaling():
    """Verify that a small city with 30 POIs assigns balanced tiers proportionally."""
    pois = [
        {
            "id": f"poi_{i}",
            "name": f"Small Town Sight {i:02d}",
            "category": "monument",
            "metadata": {
                "osm": {
                    "importance_raw": max(0.1, 5.0 - i * 0.2),
                }
            },
        }
        for i in range(30)
    ]

    tiered = tier_city_attractions(pois, "SmallTown")
    t1_sights = [p for p in tiered if p["tier"] == 1]
    t2_sights = [p for p in tiered if p["tier"] == 2]

    # max(4, min(25, round(0.08 * 30))) = 4
    assert len(t1_sights) <= 4
    # max(8, min(80, round(0.22 * 30))) = 8
    assert len(t2_sights) <= 8
