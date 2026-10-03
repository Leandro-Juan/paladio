"""Meal Candidates Injection for Paladio Itinerary v2.

Selects 3-4 localized restaurant/dining candidates per requested meal slot
near daily anchor points or cluster centroids to feed the C++ solver graph.
"""

from collections.abc import Sequence

from app.domain.entities.poi import Poi, PoiLocation
from app.engine.transit_matrix import haversine_distance
from app.engine.v2.candidate_pool import CandidatePoi


MAX_MEAL_RADIUS_KM = 2.5

MEAL_TIME_WINDOWS: dict[str, tuple[int, int]] = {
    "breakfast": (450, 630),  # 07:30 - 10:30
    "lunch": (690, 900),  # 11:30 - 15:00
    "dinner": (1110, 1350),  # 18:30 - 22:30
}


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
        # No real dining venue is known for this city: never synthesize one.
        # The day simply carries no meal stop and the shortfall is reported upstream.
        return []

    # Sort meal spots by proximity to anchor
    def dist_to_anchor(p: Poi) -> float:
        lat = p.location.latitude or 0.0
        lon = p.location.longitude or 0.0
        return haversine_distance(anchor_lat, anchor_lon, lat, lon)

    # A real agency never sends travellers across town for lunch: keep walkable/near spots.
    meal_pois = [p for p in meal_pois if dist_to_anchor(p) <= MAX_MEAL_RADIUS_KM]
    meal_pois.sort(key=dist_to_anchor)

    selected: list[Poi] = []
    # Pick nearest unique spots for requested slots
    for slot in requested_slots:
        slot_lower = slot.lower()
        slot_window = MEAL_TIME_WINDOWS.get(slot_lower)
        slot_candidates = 0
        for p in meal_pois:
            if slot_candidates >= candidates_per_slot:
                break
            if p not in selected:
                # Clone and specialize for slot
                slot_p = p.model_copy(deep=True)
                slot_p.id = f"{slot_lower}_{p.id}"
                slot_p.name = f"{p.name} ({slot.title()})"
                if slot_window:
                    w_start, w_end = slot_window
                    open_by_day = list(slot_p.open_time_mins_by_day)
                    close_by_day = list(slot_p.close_time_mins_by_day)
                    for w in range(7):
                        o = open_by_day[w] if w < len(open_by_day) else 480
                        c = close_by_day[w] if w < len(close_by_day) else 1320
                        if o == -1 or c == -1:
                            open_by_day[w] = -1
                            close_by_day[w] = -1
                        else:
                            no = max(o, w_start)
                            nc = min(c, w_end)
                            if nc - no >= 45:
                                open_by_day[w] = no
                                close_by_day[w] = nc
                            else:
                                open_by_day[w] = -1
                                close_by_day[w] = -1
                    slot_p.open_time_mins_by_day = open_by_day
                    slot_p.close_time_mins_by_day = close_by_day

                selected.append(slot_p)
                slot_candidates += 1

    return selected
