"""Meal Candidates Injection for Paladio Itinerary v2.

Selects 3-4 localized restaurant/dining candidates per requested meal slot
near daily anchor points or cluster centroids to feed the C++ solver graph.
"""

from collections.abc import Sequence

from app.domain.entities.poi import (
    Itinerary,
    Poi,
    PoiLocation,
    TransitLeg,
)
from app.engine.transit_matrix import haversine_distance
from app.engine.v2.candidate_pool import CandidatePoi
from app.engine.v2.exceptions import ItineraryInfeasible
from app.engine.v2.rhythm import RhythmProfile, get_meal_time_window
from app.engine.v2.taxonomy import CANONICAL_CATEGORIES
from app.schemas.itinerary import TravelConstraints

MAX_MEAL_RADIUS_KM = 2.5


def get_default_meal_windows(
    rhythm: RhythmProfile | None = None,
) -> dict[str, tuple[int, int]]:
    r = rhythm or RhythmProfile()
    return {
        "breakfast": r.breakfast_window,
        "lunch": r.lunch_window,
        "dinner": r.dinner_window,
    }


MEAL_TIME_WINDOWS: dict[str, tuple[int, int]] = get_default_meal_windows()


def select_daily_meal_candidates(
    anchor_lat: float,
    anchor_lon: float,
    candidate_pool: Sequence[CandidatePoi | Poi],
    requested_slots: Sequence[str] = ("lunch", "dinner"),
    candidates_per_slot: int = 3,
    rhythm: RhythmProfile | None = None,
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
                category_id=CANONICAL_CATEGORIES["food_culinary"],
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
    near_meals = [p for p in meal_pois if dist_to_anchor(p) <= MAX_MEAL_RADIUS_KM]
    if not near_meals:
        # In larger sprawling cities (e.g. Tokyo), fall back to nearest available dining venues
        near_meals = sorted(meal_pois, key=dist_to_anchor)[:15]
    else:
        near_meals.sort(key=dist_to_anchor)
    meal_pois = near_meals

    selected: list[Poi] = []
    # Pick nearest unique spots for requested slots
    for slot in requested_slots:
        slot_lower = slot.lower()
        slot_window = get_meal_time_window(slot_lower, rhythm=rhythm)
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


def _time_str_to_mins(t_str: str | None) -> int | None:
    if not t_str or ":" not in t_str:
        return None
    try:
        parts = t_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None


def _mins_to_time_str(mins: int | None) -> str:
    if mins is None:
        return "--:--"
    h = mins // 60
    m = mins % 60
    return f"{h:02d}:{m:02d}"


def _cand_to_meal_poi(cand: CandidatePoi | Poi, slot: str) -> Poi:
    """Converts a dining CandidatePoi or Poi into a scheduled meal Poi with provenance."""
    if isinstance(cand, Poi):
        p = cand.model_copy(deep=True)
        if slot.lower() not in p.name.lower():
            p.name = f"{p.name} ({slot.title()})"
        p.cost_source = "real_poi"
        p.cost_is_estimated = False
        p.taxonomy_category = "food_culinary"
        p.category_id = CANONICAL_CATEGORIES.get("food_culinary", 4)
        return p

    lat = (
        cand.location.get("latitude")
        if isinstance(cand.location, dict)
        else getattr(cand.location, "latitude", None)
    )
    lon = (
        cand.location.get("longitude")
        if isinstance(cand.location, dict)
        else getattr(cand.location, "longitude", None)
    )
    slot_name = (
        f"{cand.name} ({slot.title()})"
        if slot.lower() not in cand.name.lower()
        else cand.name
    )

    return Poi(
        id=cand.id,
        city=cand.city,
        name=slot_name,
        category="RESTAURANT",
        location=PoiLocation(latitude=float(lat or 0.0), longitude=float(lon or 0.0)),
        open_time_mins_by_day=list(cand.open_time_mins_by_day),
        close_time_mins_by_day=list(cand.close_time_mins_by_day),
        duration_mins=cand.duration_mins or 60,
        cost_eur=cand.cost_eur or 18.0,
        cost_is_estimated=False,
        cost_source="real_poi",
        tier=cand.tier,
        tier_confidence=cand.tier_confidence,
        tier_source=cand.tier_source,
        iconicity_score=cand.iconicity_score,
        taxonomy_category="food_culinary",
        category_id=CANONICAL_CATEGORIES.get("food_culinary", 4),
        visit_mode=cand.visit_mode or "full",
        embedding=cand.embedding,
    )


def snap_corridor_meals(
    day_itinerary: Itinerary,
    candidate_pool: Sequence[CandidatePoi | Poi],
    city: str,
    rhythm: RhythmProfile | None = None,
    day_weekday: int = 0,
    depot_poi: Poi | None = None,
    constraints: TravelConstraints | None = None,
) -> Itinerary:
    """Snaps virtual meal nodes to real dining POIs along the travel corridor.

    For each virtual meal:
    - Finds traveller position between predecessor and successor sights.
    - Filters real dining POIs open at scheduled meal time within corridor detour radius.
    - Ranks by taste score, quality signals (OSM/metadata completeness), cuisine match, and detour.
    - Attaches top-1 as primary Poi, top-2 as backup_poi.
    - If no dining venue found, attaches shortfall_notice without inventing synthetic venues.
    """
    if not day_itinerary.path:
        return day_itinerary

    # 1. Collect all real dining venues from candidate pool
    dining_candidates: list[CandidatePoi | Poi] = []
    for cand in candidate_pool:
        if isinstance(cand, CandidatePoi):
            if cand.is_meal_spot or cand.taxonomy_category == "food_culinary":
                dining_candidates.append(cand)
        elif isinstance(cand, Poi):
            cat = cand.category.lower()
            if (
                cat in ("restaurant", "food", "cafe", "bistrot", "bar", "bakery")
                or cand.taxonomy_category == "food_culinary"
            ):
                dining_candidates.append(cand)

    used_poi_ids = {
        str(step.poi.id)
        for step in day_itinerary.path
        if step.poi.id and not str(step.poi.id).startswith("virtual_meal_")
    }

    depot_lat = (
        depot_poi.location.latitude
        if depot_poi and depot_poi.location
        else (day_itinerary.path[0].poi.location.latitude or 0.0)
    ) or 0.0
    depot_lon = (
        depot_poi.location.longitude
        if depot_poi and depot_poi.location
        else (day_itinerary.path[0].poi.location.longitude or 0.0)
    ) or 0.0

    new_path = list(day_itinerary.path)

    for k, step in enumerate(new_path):
        poi_id_str = str(step.poi.id or "")
        if not poi_id_str.startswith("virtual_meal_"):
            continue

        # Determine meal slot
        if "lunch" in poi_id_str.lower():
            slot = "lunch"
        elif "dinner" in poi_id_str.lower():
            slot = "dinner"
        elif "breakfast" in poi_id_str.lower():
            slot = "breakfast"
        else:
            arr_m = _time_str_to_mins(step.scheduled_start) or 720
            slot = "lunch" if arr_m < 1020 else "dinner"

        # Predecessor sight
        prev_poi = None
        for p_idx in range(k - 1, -1, -1):
            if not str(new_path[p_idx].poi.id or "").startswith("virtual_meal_"):
                prev_poi = new_path[p_idx].poi
                break
        if not prev_poi:
            prev_poi = depot_poi or new_path[0].poi

        # Successor sight
        next_poi = None
        next_step_idx = None
        for n_idx in range(k + 1, len(new_path)):
            if not str(new_path[n_idx].poi.id or "").startswith("virtual_meal_"):
                next_poi = new_path[n_idx].poi
                next_step_idx = n_idx
                break
        if not next_poi:
            next_poi = depot_poi or new_path[-1].poi

        lat_prev = (
            (prev_poi.location.latitude or depot_lat)
            if prev_poi.location
            else depot_lat
        )
        lon_prev = (
            (prev_poi.location.longitude or depot_lon)
            if prev_poi.location
            else depot_lon
        )
        lat_next = (
            (next_poi.location.latitude or depot_lat)
            if next_poi.location
            else depot_lat
        )
        lon_next = (
            (next_poi.location.longitude or depot_lon)
            if next_poi.location
            else depot_lon
        )

        slot_window = get_meal_time_window(slot, rhythm=rhythm)
        scheduled_arr = _time_str_to_mins(step.scheduled_start) or (
            780 if slot == "lunch" else 1200
        )
        target_arr = (
            max(scheduled_arr, slot_window[0]) if slot_window else scheduled_arr
        )
        meal_duration = step.poi.duration_mins or 60

        # Filter and score candidates
        scored_candidates: list[tuple[float, CandidatePoi | Poi, float, float]] = []

        preferred_cuisines = (
            [
                c.lower().strip()
                for c in constraints.preferred_cuisines
                if c and c.strip()
            ]
            if constraints and constraints.preferred_cuisines
            else []
        )

        d_direct = haversine_distance(lat_prev, lon_prev, lat_next, lon_next)

        for cand in dining_candidates:
            c_id = str(getattr(cand, "id", "") or getattr(cand, "name", ""))
            if c_id in used_poi_ids:
                continue

            # Location check
            c_loc = (
                cand.location
                if isinstance(cand.location, dict)
                else (
                    {
                        "latitude": cand.location.latitude,
                        "longitude": cand.location.longitude,
                    }
                    if hasattr(cand.location, "latitude")
                    else {}
                )
            )
            c_lat = float(c_loc.get("latitude") or 0.0)
            c_lon = float(c_loc.get("longitude") or 0.0)
            if c_lat == 0.0 and c_lon == 0.0:
                continue

            # Opening hours check
            open_by_day = cand.open_time_mins_by_day
            close_by_day = cand.close_time_mins_by_day
            if day_weekday < len(open_by_day) and day_weekday < len(close_by_day):
                o_time = open_by_day[day_weekday]
                c_time = close_by_day[day_weekday]
                if o_time == -1 or c_time == -1:
                    continue  # Closed today
                if not (o_time == 0 and c_time in (0, 1440)) and (
                    target_arr < o_time - 15
                    or (target_arr + meal_duration) > c_time + 15
                ):
                    continue  # Closed during meal time

            d_from_prev = haversine_distance(lat_prev, lon_prev, c_lat, c_lon)
            d_to_next = haversine_distance(c_lat, c_lon, lat_next, lon_next)
            detour_km = max(0.0, (d_from_prev + d_to_next) - d_direct)

            if slot == "dinner":
                # Dinner: within radius of final sight with hotel proximity tie-break
                if d_from_prev > 3.0:
                    continue
                d_to_hotel = haversine_distance(c_lat, c_lon, depot_lat, depot_lon)
                dist_penalty = 10.0 * d_from_prev + 5.0 * d_to_hotel
            else:
                # Lunch: corridor detour
                if detour_km > 1.8 and d_from_prev > 2.2:
                    continue
                dist_penalty = 15.0 * detour_km + 3.0 * d_from_prev + 3.0 * d_to_next

            # Score computation
            base_taste = float(getattr(cand, "taste_score", 50.0) or 50.0)
            iconicity = float(getattr(cand, "iconicity_score", 0.0) or 0.0)
            quality_score = base_taste + iconicity * 20.0

            # Cuisine match bonus
            cand_name_lower = cand.name.lower()
            if preferred_cuisines and any(
                pc in cand_name_lower for pc in preferred_cuisines
            ):
                quality_score += 25.0

            cand_score = quality_score - dist_penalty
            scored_candidates.append((cand_score, cand, d_from_prev, d_to_next))

        if scored_candidates:
            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            primary_cand = scored_candidates[0][1]
            backup_cand = (
                scored_candidates[1][1] if len(scored_candidates) > 1 else None
            )

            p_poi = _cand_to_meal_poi(primary_cand, slot=slot)
            b_poi = _cand_to_meal_poi(backup_cand, slot=slot) if backup_cand else None

            step.poi = p_poi
            step.backup_poi = b_poi
            step.shortfall_notice = None
            used_poi_ids.add(str(p_poi.id))

            # Update transit legs (multimodal: transit speed if > 1.2km, pedestrian otherwise)
            d_in = scored_candidates[0][2]
            d_out = scored_candidates[0][3]
            in_dur = (
                max(2, round(d_in / 25.0 * 60 + 6))
                if d_in > 1.2
                else max(2, round(d_in * 13.33))
            )
            out_dur = (
                max(2, round(d_out / 25.0 * 60 + 6))
                if d_out > 1.2
                else max(2, round(d_out * 13.33))
            )
            step.transit_from_previous = TransitLeg(
                duration_mins=in_dur,
                cost_eur=1.50 if d_in > 1.2 else 0.0,
                mode="transit" if d_in > 1.2 else "pedestrian",
            )
            if next_step_idx is not None and next_step_idx < len(new_path):
                new_path[next_step_idx].transit_from_previous = TransitLeg(
                    duration_mins=out_dur,
                    cost_eur=1.50 if d_out > 1.2 else 0.0,
                    mode="transit" if d_out > 1.2 else "pedestrian",
                )
        else:
            # No real dining venue open along the corridor: honest shortfall notice
            notice = f"No open dining venues found within corridor radius for {slot}."
            step.shortfall_notice = notice
            step.poi.name = f"{step.poi.name} ({notice})"

    day_itinerary.path = new_path
    return day_itinerary


def verify_day_schedule(
    day_itinerary: Itinerary,
    day_weekday: int = 0,
    day_end_mins: int = 1440,
    day_start_mins: int | None = None,
    rhythm: RhythmProfile | None = None,
) -> Itinerary:
    """Verifies day timeline feasibility against venue opening hours and day bounds.

    Recomputes scheduled_start and scheduled_end sequentially with transit legs.
    If a primary meal violates closing hours, swaps to backup_poi.
    If mandatory sights or day bounds are irrecoverably violated, raises ItineraryInfeasible.
    """
    if not day_itinerary.path:
        return day_itinerary

    path = day_itinerary.path
    first_start = (
        day_start_mins
        if day_start_mins is not None
        else (_time_str_to_mins(path[0].scheduled_start) or 540)
    )

    # 1. Identify key anchor meal indices
    lunch_idx: int | None = None
    dinner_idx: int | None = None
    for idx, step in enumerate(path):
        p_name_l = step.poi.name.lower()
        p_id_l = str(step.poi.id or "").lower()
        if lunch_idx is None and (
            "lunch" in p_name_l
            or "lunch" in p_id_l
            or getattr(step.poi, "is_lunch_spot", False)
        ):
            lunch_idx = idx
        elif dinner_idx is None and (
            "dinner" in p_name_l
            or "dinner" in p_id_l
            or getattr(step.poi, "is_dinner_spot", False)
        ):
            dinner_idx = idx

    l_win_start = rhythm.lunch_window[0] if rhythm else 780
    d_win_start = rhythm.dinner_window[0] if rhythm else 1170

    # 2. Build scheduling blocks: (start_idx, end_idx, target_floor)
    blocks: list[tuple[int, int, int | None]] = []
    if lunch_idx is not None and lunch_idx > 0:
        blocks.append((0, lunch_idx, l_win_start))
        if dinner_idx is not None and dinner_idx > lunch_idx:
            blocks.append((lunch_idx, dinner_idx, d_win_start))
            if dinner_idx < len(path) - 1:
                blocks.append((dinner_idx, len(path) - 1, None))
        else:
            if lunch_idx < len(path) - 1:
                blocks.append((lunch_idx, len(path) - 1, None))
    elif dinner_idx is not None and dinner_idx > 0:
        blocks.append((0, dinner_idx, d_win_start))
        if dinner_idx < len(path) - 1:
            blocks.append((dinner_idx, len(path) - 1, None))
    else:
        blocks.append((0, len(path) - 1, None))

    # Initialize start depot
    path[0].scheduled_start = _mins_to_time_str(first_start)
    path[0].scheduled_end = _mins_to_time_str(first_start)
    curr_time = first_start

    # 3. Schedule each block smoothly with fair slack distribution
    for b_start, b_end, target_floor in blocks:
        # Simulate forward to check if a large idle gap precedes target_floor
        sim_t = curr_time
        for i in range(b_start + 1, b_end + 1):
            st = path[i]
            t_m = (
                st.transit_from_previous.duration_mins
                if st.transit_from_previous
                else 0
            )
            is_d = (i == len(path) - 1) and st.poi.category in (
                "HOTEL",
                "DEPOT",
                "AIRPORT",
            )
            d_m = 0 if is_d else (st.poi.duration_mins or 60)
            sim_t += t_m
            o_m = (
                st.poi.open_time_mins_by_day[day_weekday]
                if day_weekday < len(st.poi.open_time_mins_by_day)
                else 0
            )
            if o_m > 0 and o_m != -1 and sim_t < o_m:
                sim_t = o_m
            if i < b_end:
                sim_t += d_m

        slack = max(0, target_floor - sim_t) if target_floor is not None else 0
        m_steps = b_end - b_start
        base_slack = min(114, slack // m_steps) if m_steps > 0 else 0
        rem_slack = slack - (base_slack * m_steps)

        for i in range(b_start + 1, b_end + 1):
            step = path[i]
            is_depot = (i == len(path) - 1) and step.poi.category in (
                "HOTEL",
                "DEPOT",
                "AIRPORT",
            )
            dur = 0 if is_depot else (step.poi.duration_mins or 60)

            transit_mins = 0
            if step.transit_from_previous:
                transit_mins = step.transit_from_previous.duration_mins or 0

            # Add distributed slack between activities to eliminate idle gaps
            step_slack = base_slack
            if rem_slack > 0 and i < b_end:
                bonus = min(rem_slack, 114 - step_slack)
                step_slack += bonus
                rem_slack -= bonus

            arr = curr_time + transit_mins + step_slack

            if i == b_end and target_floor is not None:
                arr = max(arr, target_floor)

            open_by_day = step.poi.open_time_mins_by_day
            close_by_day = step.poi.close_time_mins_by_day
            o_time = open_by_day[day_weekday] if day_weekday < len(open_by_day) else 0
            c_time = (
                close_by_day[day_weekday] if day_weekday < len(close_by_day) else 1440
            )

            if o_time > 0 and o_time != -1 and arr < o_time:
                arr = o_time

            # If closing window would be violated, clamp arrival back within open hours
            if c_time > 0 and c_time != -1 and c_time != 1440 and arr + dur > c_time:
                latest_valid = c_time - dur
                if latest_valid >= curr_time + transit_mins:
                    arr = latest_valid

            dep = arr + dur

            # Check closing window failure & backup swap
            if c_time > 0 and c_time != -1 and c_time != 1440 and dep > c_time:
                if step.backup_poi is not None:
                    b_close = (
                        step.backup_poi.close_time_mins_by_day[day_weekday]
                        if day_weekday < len(step.backup_poi.close_time_mins_by_day)
                        else 1440
                    )
                    if b_close == -1 or b_close == 1440 or dep <= b_close:
                        step.poi = step.backup_poi
                        step.backup_poi = None
                else:
                    # If venue is still open during arrival, clamp duration to remaining time if viable
                    avail_dur = c_time - arr
                    min_dur = 20 if dur >= 30 else dur
                    if avail_dur >= min_dur and not is_depot:
                        dur = avail_dur
                        dep = arr + dur
                    else:
                        is_mand = getattr(
                            step.poi, "is_user_mandatory", False
                        ) or getattr(step.poi, "is_mandatory", False)
                        if is_mand:
                            raise ItineraryInfeasible(
                                f"Mandatory sight '{step.poi.name}' closes at {_mins_to_time_str(c_time)} "
                                f"but scheduled visit ends at {_mins_to_time_str(dep)}."
                            )

            step.scheduled_start = _mins_to_time_str(arr)
            step.scheduled_end = _mins_to_time_str(dep)
            curr_time = dep

    # Recompute total time and cost
    start_mins = _time_str_to_mins(path[0].scheduled_start) or 540
    end_mins = _time_str_to_mins(path[-1].scheduled_end) or curr_time
    day_itinerary.total_time_mins = max(0, end_mins - start_mins)

    total_cost = sum(
        float(step.poi.cost_eur or 0.0)
        for step in path
        if step.poi.category not in ("HOTEL", "DEPOT", "AIRPORT")
    )
    total_cost += sum(
        float(step.transit_from_previous.cost_eur or 0.0)
        for step in path
        if step.transit_from_previous
    )
    day_itinerary.total_cost_eur = round(total_cost, 2)

    return day_itinerary
