"""Meal Candidates Injection for Paladio Itinerary v2.

Selects 3-4 localized restaurant/dining candidates per requested meal slot
near daily anchor points or cluster centroids to feed the C++ solver graph.
"""

from collections.abc import Sequence

from app.domain.entities.poi import Poi, PoiLocation
from app.engine.transit_matrix import haversine_distance
from app.engine.v2.candidate_pool import CandidatePoi


def select_daily_meal_candidates(
    anchor_lat: float,
    anchor_lon: float,
    candidate_pool: Sequence[CandidatePoi | Poi],
    requested_slots: Sequence[str] = ("lunch", "dinner"),
    candidates_per_slot: int = 3,
) -> list[Poi]:
    """Selects 3-4 localized dining spots per slot near the daily anchor."""
    # Filter meal spots from pool
    meal_pois: list[Poi] = []
    for cand in candidate_pool:
        if isinstance(cand, CandidatePoi):
            if not cand.is_meal_spot:
                continue
            lat = cand.location.get("latitude", 0.0)
            lon = cand.location.get("longitude", 0.0)
            p = Poi(
                id=f"meal_{cand.id}",
                name=cand.name,
                city=cand.city,
                category="RESTAURANT",
                location=PoiLocation(latitude=lat, longitude=lon),
                open_time_mins_by_day=cand.open_time_mins_by_day,
                close_time_mins_by_day=cand.close_time_mins_by_day,
                duration_mins=cand.duration_mins or 60,
                cost_eur=cand.cost_eur or 18.0,
                tier=cand.tier,
                iconicity_score=cand.iconicity_score,
                taxonomy_category="food_culinary",
                category_id=5,
            )
            meal_pois.append(p)
        elif isinstance(cand, Poi):
            cat = cand.category.lower()
            if (
                cat in ("restaurant", "food", "cafe", "bistrot")
                or cand.taxonomy_category == "food_culinary"
            ):
                meal_pois.append(cand)

    if not meal_pois:
        # If pool has no meal candidates, generate synthetic local dining spots near anchor
        return _generate_fallback_dining_spots(anchor_lat, anchor_lon, requested_slots)

    # Sort meal spots by proximity to anchor
    def dist_to_anchor(p: Poi) -> float:
        lat = p.location.latitude or 0.0
        lon = p.location.longitude or 0.0
        return haversine_distance(anchor_lat, anchor_lon, lat, lon)

    meal_pois.sort(key=dist_to_anchor)

    selected: list[Poi] = []
    # Pick nearest unique spots for requested slots
    for slot in requested_slots:
        slot_candidates = 0
        for p in meal_pois:
            if slot_candidates >= candidates_per_slot:
                break
            if p not in selected:
                # Clone and specialize for slot
                slot_p = p.model_copy(deep=True)
                slot_p.id = f"{slot}_{p.id}"
                slot_p.name = f"{p.name} ({slot.title()})"
                selected.append(slot_p)
                slot_candidates += 1

    return selected


def _generate_fallback_dining_spots(
    anchor_lat: float,
    anchor_lon: float,
    requested_slots: Sequence[str],
) -> list[Poi]:
    """Generates localized fallback dining options near the anchor."""
    spots: list[Poi] = []
    offsets = [(0.001, 0.001), (-0.001, 0.002), (0.002, -0.001)]

    for slot in requested_slots:
        is_lunch = slot == "lunch"
        open_mins = 720 if is_lunch else 1170
        close_mins = 900 if is_lunch else 1350

        for i, (dlat, dlon) in enumerate(offsets):
            spots.append(
                Poi(
                    id=f"fallback_{slot}_{i}",
                    name=f"Local {slot.title()} Bistro {i + 1}",
                    city="Destination",
                    category="RESTAURANT",
                    location=PoiLocation(
                        latitude=anchor_lat + dlat,
                        longitude=anchor_lon + dlon,
                    ),
                    open_time_mins_by_day=[open_mins] * 7,
                    close_time_mins_by_day=[close_mins] * 7,
                    duration_mins=60,
                    cost_eur=18.0,
                    tier=3,
                    iconicity_score=0.5,
                    taxonomy_category="food_culinary",
                    category_id=5,
                )
            )
    return spots
