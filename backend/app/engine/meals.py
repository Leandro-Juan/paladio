"""Meal Candidates Injection for Paladio Itinerary v2.

Selects 3-4 localized restaurant/dining candidates per requested meal slot
near daily anchor points or cluster centroids to feed the C++ solver graph.
"""

from collections.abc import Sequence
from typing import Any

from app.domain.entities.poi import (
    Itinerary,
    Poi,
    PoiLocation,
    ScheduledPoi,
    TransitLeg,
)
from app.engine.transit_matrix import haversine_distance
from app.engine.candidate_pool import CandidatePoi
from app.engine.exceptions import ItineraryInfeasible
from app.engine.rhythm import RhythmProfile, get_meal_time_window
from app.engine.selection import normalize_poi_name
from app.engine.taxonomy import CANONICAL_CATEGORIES
from app.schemas.itinerary import TravelConstraints

_HEAVY_CULTURAL_CATS = frozenset({"museum", "art_gallery", "gallery"})
_HEAVY_CULTURAL_KEYWORDS = (
    "museum",
    "musée",
    "museo",
    "gallery",
    "cathedral",
    "abbey",
    "basilica",
    "palace",
    "castle",
)
_NON_CULTURAL_CATS = frozenset(
    {
        "restaurant",
        "food",
        "cafe",
        "bistrot",
        "bakery",
        "bar",
        "nightlife",
        "shop",
        "hotel",
        "depot",
        "airport",
    }
)


def is_heavy_cultural_poi(poi: Any) -> bool:
    """Return True for museums, galleries, cathedrals, abbeys, basilicas, palaces, and castles."""
    cat_l = str(getattr(poi, "category", "") or "").lower()
    if cat_l in _NON_CULTURAL_CATS:
        return False
    if cat_l in _HEAVY_CULTURAL_CATS:
        return True
    name_l = str(getattr(poi, "name", "") or "").lower()
    return any(kw in name_l for kw in _HEAVY_CULTURAL_KEYWORDS)


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
                    daily_windows = getattr(slot_p, "daily_windows", None) or (
                        slot_p.metadata.get("daily_windows")
                        if hasattr(slot_p, "metadata")
                        and isinstance(slot_p.metadata, dict)
                        else None
                    )
                    for w in range(7):
                        o = open_by_day[w] if w < len(open_by_day) else -2
                        c = close_by_day[w] if w < len(close_by_day) else -2
                        if o == -1 or c == -1:
                            open_by_day[w] = -1
                            close_by_day[w] = -1
                        elif o == -2 or c == -2:
                            # Soft default bounds for unknown meal venues
                            open_by_day[w] = w_start
                            close_by_day[w] = w_end
                        elif (
                            daily_windows
                            and w < len(daily_windows)
                            and len(daily_windows[w]) >= 2
                        ):
                            # Split hours: pick the interval overlapping the meal slot
                            matched_iv = None
                            for iv_o, iv_c in daily_windows[w]:
                                no = max(iv_o, w_start)
                                nc = min(iv_c, w_end)
                                if nc - no >= 45:
                                    matched_iv = (no, nc)
                                    break
                            if matched_iv:
                                open_by_day[w], close_by_day[w] = matched_iv
                            else:
                                open_by_day[w], close_by_day[w] = -1, -1
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


def _mins_to_time_str(mins: int | float | None) -> str:
    if mins is None:
        return "--:--"
    mins_total = int(round(float(mins)))
    h = (mins_total // 60) % 24
    m = mins_total % 60
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


def _extract_base_venue_name(name: str) -> str:
    """Strips slot suffixes and diacritics to obtain the canonical dining venue name."""
    n = normalize_poi_name(name)
    for suffix in (" (breakfast)", " (lunch)", " (dinner)"):
        if n.endswith(suffix):
            return n[: -len(suffix)].strip()
    return n


def snap_corridor_meals(
    day_itinerary: Itinerary,
    candidate_pool: Sequence[CandidatePoi | Poi],
    city: str,
    rhythm: RhythmProfile | None = None,
    day_weekday: int = 0,
    depot_poi: Poi | None = None,
    constraints: TravelConstraints | None = None,
    used_trip_poi_ids: set[str] | None = None,
    used_trip_poi_names: set[str] | None = None,
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
    used_poi_names = {
        _extract_base_venue_name(step.poi.name)
        for step in day_itinerary.path
        if step.poi.name and not str(step.poi.id).startswith("virtual_meal_")
    }
    if used_trip_poi_ids:
        used_poi_ids.update(used_trip_poi_ids)
    if used_trip_poi_names:
        used_poi_names.update(used_trip_poi_names)

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

        def _score_candidates(
            relax_level: int,
        ) -> list[tuple[float, CandidatePoi | Poi, float, float]]:
            tier_scored: list[tuple[float, CandidatePoi | Poi, float, float]] = []
            for cand in dining_candidates:
                c_id = str(getattr(cand, "id", "") or getattr(cand, "name", ""))
                c_norm = _extract_base_venue_name(getattr(cand, "name", ""))
                if c_id in used_poi_ids or c_norm in used_poi_names:
                    continue

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
                o_time = 0
                c_time = 1440
                if day_weekday < len(open_by_day) and day_weekday < len(close_by_day):
                    o_time = open_by_day[day_weekday]
                    c_time = close_by_day[day_weekday]
                    if o_time == -1 or c_time == -1:
                        continue  # Closed today
                    if o_time != -2 and c_time != -2:
                        windows = getattr(cand, "daily_windows", None) or (
                            cand.metadata.get("daily_windows")
                            if hasattr(cand, "metadata")
                            and isinstance(cand.metadata, dict)
                            else None
                        )
                        if (
                            windows
                            and day_weekday < len(windows)
                            and len(windows[day_weekday]) >= 2
                        ):
                            eff_target = (
                                min(target_arr, 870)
                                if (slot == "lunch" and relax_level >= 1)
                                else target_arr
                            )
                            window_open = any(
                                not (
                                    eff_target < iv_o - 15
                                    or (eff_target + meal_duration) > iv_c + 15
                                )
                                for iv_o, iv_c in windows[day_weekday]
                            )
                            if not window_open:
                                continue
                        else:
                            slot_end = (
                                slot_window[1] if slot_window else target_arr + 120
                            )
                            slot_start = slot_window[0] if slot_window else target_arr
                            if not (o_time == 0 and c_time in (0, 1440)) and (
                                c_time < slot_start + 30 or o_time > slot_end - 30
                            ):
                                continue  # Closed during meal time

                if slot == "breakfast":
                    max_open = (
                        540 if relax_level == 0 else (570 if relax_level == 1 else 600)
                    )
                    if o_time > 0 and o_time > max_open:
                        continue

                d_from_prev = haversine_distance(lat_prev, lon_prev, c_lat, c_lon)
                d_to_next = haversine_distance(c_lat, c_lon, lat_next, lon_next)
                detour_km = max(0.0, (d_from_prev + d_to_next) - d_direct)
                d_to_hotel = haversine_distance(c_lat, c_lon, depot_lat, depot_lon)

                if slot == "dinner":
                    if relax_level == 0:
                        if d_from_prev > 3.0:
                            continue
                        dist_penalty = 10.0 * d_from_prev + 5.0 * d_to_hotel
                    elif relax_level == 1:
                        if d_from_prev > 6.0 and d_to_hotel > 2.5 and detour_km > 2.5:
                            continue
                        dist_penalty = (
                            6.0 * min(d_from_prev, d_to_hotel)
                            + 6.0 * d_to_hotel
                            + 3.0 * d_from_prev
                        )
                    else:
                        if d_to_hotel > 12.0 and d_from_prev > 12.0:
                            continue
                        dist_penalty = 8.0 * d_to_hotel + 4.0 * d_from_prev
                elif slot == "breakfast":
                    max_hotel_km = (
                        2.5 if relax_level == 0 else (4.5 if relax_level == 1 else 8.0)
                    )
                    if d_to_hotel > max_hotel_km:
                        continue
                    dist_penalty = 12.0 * d_to_hotel + 4.0 * d_to_next
                else:
                    if relax_level == 0:
                        if detour_km > 0.85:
                            continue
                    elif relax_level == 1:
                        if detour_km > 2.5 and min(d_from_prev, d_to_next) > 3.0:
                            continue
                    else:
                        if d_from_prev > 10.0 and d_to_next > 10.0:
                            continue
                    w_detour = (
                        25.0
                        if relax_level == 0
                        else (15.0 if relax_level == 1 else 10.0)
                    )
                    dist_penalty = (
                        w_detour * detour_km + 4.0 * d_from_prev + 4.0 * d_to_next
                    )

                base_taste = float(getattr(cand, "taste_score", 50.0) or 50.0)
                iconicity = float(getattr(cand, "iconicity_score", 0.0) or 0.0)
                quality_score = base_taste + iconicity * 20.0

                cand_name_lower = cand.name.lower()
                if preferred_cuisines and any(
                    pc in cand_name_lower for pc in preferred_cuisines
                ):
                    quality_score += 25.0

                cand_score = quality_score - dist_penalty
                tier_scored.append((cand_score, cand, d_from_prev, d_to_next))
            return tier_scored

        scored_candidates: list[tuple[float, CandidatePoi | Poi, float, float]] = []
        for relax_level in (0, 1, 2):
            scored_candidates = _score_candidates(relax_level)
            if scored_candidates:
                break

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
            base_p_name = _extract_base_venue_name(p_poi.name)
            used_poi_names.add(base_p_name)
            if used_trip_poi_ids is not None:
                used_trip_poi_ids.add(str(primary_cand.id))
                used_trip_poi_ids.add(str(p_poi.id))
                if backup_cand:
                    used_trip_poi_ids.add(str(backup_cand.id))
                    if b_poi:
                        used_trip_poi_ids.add(str(b_poi.id))
            if used_trip_poi_names is not None:
                used_trip_poi_names.add(base_p_name)
                if backup_cand:
                    used_trip_poi_names.add(_extract_base_venue_name(backup_cand.name))

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


def _identify_meal_indices(
    path: list[ScheduledPoi],
) -> tuple[int | None, int | None, int | None]:
    """Identifies the indices of (breakfast, lunch, dinner) in a path."""
    b_idx: int | None = None
    l_idx: int | None = None
    d_idx: int | None = None
    for idx, step in enumerate(path):
        p_name_l = step.poi.name.lower()
        p_id_l = str(step.poi.id or "").lower()
        if b_idx is None and (
            "breakfast" in p_name_l
            or "breakfast" in p_id_l
            or getattr(step.poi, "is_breakfast_spot", False)
        ):
            b_idx = idx
        elif l_idx is None and (
            "lunch" in p_name_l
            or "lunch" in p_id_l
            or getattr(step.poi, "is_lunch_spot", False)
        ):
            l_idx = idx
        elif d_idx is None and (
            "dinner" in p_name_l
            or "dinner" in p_id_l
            or getattr(step.poi, "is_dinner_spot", False)
        ):
            d_idx = idx
    return b_idx, l_idx, d_idx


def _recompute_path_transit(path: list[ScheduledPoi]) -> None:
    """Recomputes step-by-step transit legs after reordering a path."""
    for k in range(1, len(path)):
        p_prev = path[k - 1].poi
        p_curr = path[k].poi
        lat1 = p_prev.location.latitude if p_prev.location else 0.0
        lon1 = p_prev.location.longitude if p_prev.location else 0.0
        lat2 = p_curr.location.latitude if p_curr.location else 0.0
        lon2 = p_curr.location.longitude if p_curr.location else 0.0
        if lat1 and lon1 and lat2 and lon2:
            dist = haversine_distance(lat1, lon1, lat2, lon2)
            dur_t = (
                max(2, round(dist / 25.0 * 60 + 6))
                if dist > 1.2
                else max(2, round(dist * 13.33))
            )
            path[k].transit_from_previous = TransitLeg(
                duration_mins=dur_t,
                cost_eur=1.50 if dist > 1.2 else 0.0,
                mode="transit" if dist > 1.2 else "pedestrian",
            )


def _simulate_meal_arrivals(
    cand_path: list[ScheduledPoi],
    first_start: int,
    day_weekday: int,
    target_indices: set[int],
) -> dict[int, int]:
    """Quick chronological simulation returning arrival minutes for requested path indices."""
    arrs: dict[int, int] = {}
    curr_t = first_start
    for k in range(1, len(cand_path)):
        p_prev, p_curr = cand_path[k - 1].poi, cand_path[k].poi
        t_dur = 0
        if cand_path[k].transit_from_previous and k == 1:
            t_dur = cand_path[k].transit_from_previous.duration_mins or 0
        lat1 = p_prev.location.latitude if p_prev.location else 0.0
        lon1 = p_prev.location.longitude if p_prev.location else 0.0
        lat2 = p_curr.location.latitude if p_curr.location else 0.0
        lon2 = p_curr.location.longitude if p_curr.location else 0.0
        if lat1 and lon1 and lat2 and lon2:
            dist = haversine_distance(lat1, lon1, lat2, lon2)
            t_dur = (
                max(2, round(dist / 25.0 * 60 + 6))
                if dist > 1.2
                else max(2, round(dist * 13.33))
            )
        elif cand_path[k].transit_from_previous:
            t_dur = cand_path[k].transit_from_previous.duration_mins or 0
        curr_t += t_dur
        o_k = (
            p_curr.open_time_mins_by_day[day_weekday]
            if day_weekday < len(p_curr.open_time_mins_by_day)
            else 0
        )
        if o_k > 0 and o_k != -1 and curr_t < o_k:
            curr_t = o_k
        if k in target_indices:
            arrs[k] = curr_t
        is_depot = (k == len(cand_path) - 1) and p_curr.category in (
            "HOTEL",
            "DEPOT",
            "AIRPORT",
        )
        curr_t += 0 if is_depot else (p_curr.duration_mins or 60)
    return arrs


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

    # 0. Enforce realistic evening sequencing: dinner should be after daytime cultural sights
    _, _, temp_dinner_idx = _identify_meal_indices(path)

    if temp_dinner_idx is not None and temp_dinner_idx < len(path) - 2:
        last_daytime_idx = None
        for k in range(temp_dinner_idx + 1, len(path) - 1):
            if str(path[k].poi.id or "").startswith("virtual_meal_"):
                continue
            cat_l = str(path[k].poi.category or "").lower()
            name_l = str(path[k].poi.name or "").lower()
            if cat_l in ("hotel", "depot", "airport", "bar", "nightlife") or any(
                w in name_l for w in ("pub", "theatre", "theater", "club")
            ):
                continue
            last_daytime_idx = k

        if last_daytime_idx is not None:
            cand_path = list(path)
            dinner_step = cand_path.pop(temp_dinner_idx)
            cand_path.insert(last_daytime_idx, dinner_step)
            sim_d_t = _simulate_meal_arrivals(
                cand_path, first_start, day_weekday, {last_daytime_idx}
            ).get(last_daytime_idx, 1200)
            if sim_d_t <= 1350:
                path[:] = cand_path
                _recompute_path_transit(path)

    # 0b. Enforce realistic morning sequencing: breakfast should precede daytime cultural visits
    temp_b_idx, _, _ = _identify_meal_indices(path)

    if temp_b_idx is not None and temp_b_idx > 1:
        b_step = path.pop(temp_b_idx)
        path.insert(1, b_step)
        _recompute_path_transit(path)

    # 0c. Enforce realistic lunch sequencing: lunch <= 15:00 (900m) and >= 180m before dinner
    temp_b_idx, temp_l_idx, temp_d_idx = _identify_meal_indices(path)

    if temp_l_idx is not None:
        targets = {temp_l_idx}
        if temp_d_idx is not None:
            targets.add(temp_d_idx)
        sim_arrs = _simulate_meal_arrivals(path, first_start, day_weekday, targets)
        sim_l_t = sim_arrs.get(temp_l_idx, 720)
        sim_d_t = sim_arrs.get(temp_d_idx) if temp_d_idx is not None else None
        # Also account for target floors applied in step 3
        if sim_d_t is not None:
            sim_d_t = max(
                sim_d_t, max(rhythm.dinner_window[0] if rhythm else 1170, 1170)
            )

        need_lunch_reloc = sim_l_t > 900 or (
            sim_d_t is not None and (sim_d_t - sim_l_t) < 180
        )
        if need_lunch_reloc:
            min_slot = (temp_b_idx + 1) if temp_b_idx is not None else 1
            max_slot = (temp_d_idx - 1) if temp_d_idx is not None else (len(path) - 2)
            if min_slot <= max_slot:
                best_slot = None
                best_rank: tuple[int, int, int, float] | None = None
                orig_over = 1 if sim_l_t > 900 else 0
                orig_gap_bad = (
                    1 if (sim_d_t is not None and sim_d_t - sim_l_t < 180) else 0
                )
                l_step = path.pop(temp_l_idx)
                for cand_slot in range(min_slot, max_slot + 1):
                    cand_path = list(path)
                    cand_path.insert(cand_slot, l_step)
                    cand_d_idx = None
                    if temp_d_idx is not None:
                        d_after_pop = temp_d_idx - (1 if temp_l_idx < temp_d_idx else 0)
                        cand_d_idx = d_after_pop + (
                            1 if cand_slot <= d_after_pop else 0
                        )
                    cand_targets = {cand_slot}
                    if cand_d_idx is not None:
                        cand_targets.add(cand_d_idx)
                    c_arrs = _simulate_meal_arrivals(
                        cand_path, first_start, day_weekday, cand_targets
                    )
                    c_l = c_arrs.get(cand_slot, 720)
                    c_d = c_arrs.get(cand_d_idx) if cand_d_idx is not None else None
                    if c_d is not None:
                        c_d = max(
                            c_d, max(rhythm.dinner_window[0] if rhythm else 1170, 1170)
                        )
                    c_over = 1 if c_l > 900 else 0
                    c_gap_bad = 1 if (c_d is not None and c_d - c_l < 180) else 0
                    t_d = 0.0
                    for idx_c in range(len(cand_path) - 1):
                        p1, p2 = cand_path[idx_c].poi, cand_path[idx_c + 1].poi
                        lat1 = p1.location.latitude if p1.location else 0.0
                        lon1 = p1.location.longitude if p1.location else 0.0
                        lat2 = p2.location.latitude if p2.location else 0.0
                        lon2 = p2.location.longitude if p2.location else 0.0
                        t_d += haversine_distance(lat1, lon1, lat2, lon2)
                    rank = (c_over + c_gap_bad, c_over, max(0, c_l - 900), t_d)
                    if c_over + c_gap_bad <= orig_over + orig_gap_bad and (
                        best_rank is None or rank < best_rank
                    ):
                        best_rank = rank
                        best_slot = cand_slot
                path.insert(
                    best_slot
                    if best_slot is not None
                    else min(temp_l_idx, len(path) - 1),
                    l_step,
                )
                _recompute_path_transit(path)

    # 1. Identify key anchor meal indices
    breakfast_idx, lunch_idx, dinner_idx = _identify_meal_indices(path)

    # Enforce chronological ordering of meals
    if (
        breakfast_idx is not None
        and lunch_idx is not None
        and lunch_idx <= breakfast_idx
    ):
        raise ItineraryInfeasible(
            "Schedule order violation: lunch cannot be scheduled before breakfast."
        )
    if lunch_idx is not None and dinner_idx is not None and dinner_idx <= lunch_idx:
        raise ItineraryInfeasible(
            "Schedule order violation: dinner cannot be scheduled before lunch."
        )
    if (
        breakfast_idx is not None
        and dinner_idx is not None
        and dinner_idx <= breakfast_idx
    ):
        raise ItineraryInfeasible(
            "Schedule order violation: dinner cannot be scheduled before breakfast."
        )

    b_win_start = rhythm.breakfast_window[0] if rhythm else 480
    l_win_start = rhythm.lunch_window[0] if rhythm else 780
    d_win_start = rhythm.dinner_window[0] if rhythm else 1170

    # 2. Build scheduling blocks: (start_idx, end_idx, target_floor)
    blocks: list[tuple[int, int, int | None]] = []
    prev_idx = 0
    if breakfast_idx is not None and breakfast_idx > 0:
        blocks.append((prev_idx, breakfast_idx, b_win_start))
        prev_idx = breakfast_idx
    if lunch_idx is not None and lunch_idx > prev_idx:
        target_l = max(l_win_start, 750) if breakfast_idx is not None else l_win_start
        blocks.append((prev_idx, lunch_idx, target_l))
        prev_idx = lunch_idx
    if dinner_idx is not None and dinner_idx > prev_idx:
        target_d = max(d_win_start, 1170) if lunch_idx is not None else d_win_start
        blocks.append((prev_idx, dinner_idx, target_d))
        prev_idx = dinner_idx
    if prev_idx < len(path) - 1:
        blocks.append((prev_idx, len(path) - 1, None))
    if not blocks:
        blocks.append((0, len(path) - 1, None))

    # Initialize start depot
    path[0].scheduled_start = _mins_to_time_str(first_start)
    path[0].scheduled_end = _mins_to_time_str(first_start)
    curr_time = first_start

    # 3. Schedule each block smoothly with fair slack distribution
    meal_arrs: dict[str, int] = {}
    for b_start, b_end, target_floor in blocks:
        if b_end == lunch_idx and "breakfast" in meal_arrs:
            min_lunch_t = meal_arrs["breakfast"] + 180
            target_floor = max(target_floor or 0, min_lunch_t)
        elif b_end == dinner_idx and "lunch" in meal_arrs:
            min_dinner_t = meal_arrs["lunch"] + 180
            d_dur = path[b_end].poi.duration_mins or 60
            if min_dinner_t + d_dur <= max(day_end_mins, 1380):
                target_floor = max(target_floor or 0, min_dinner_t)
            else:
                target_floor = max(
                    target_floor or 0, min(min_dinner_t, max(0, day_end_mins - d_dur))
                )

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
            meal_floor = 0
            if i == lunch_idx and "breakfast" in meal_arrs:
                meal_floor = meal_arrs["breakfast"] + 180
            elif i == dinner_idx and "lunch" in meal_arrs:
                meal_floor = meal_arrs["lunch"] + 180

            if c_time > 0 and c_time != -1 and c_time != 1440 and arr + dur > c_time:
                latest_valid = c_time - dur
                if latest_valid >= max(curr_time + transit_mins, meal_floor):
                    arr = latest_valid

            dep = arr + dur

            # Check closing window failure & backup swap
            if c_time > 0 and c_time != -1 and c_time != 1440 and dep > c_time:
                swapped = False
                if step.backup_poi is not None:
                    b_close = (
                        step.backup_poi.close_time_mins_by_day[day_weekday]
                        if day_weekday < len(step.backup_poi.close_time_mins_by_day)
                        else 1440
                    )
                    if b_close == -1 or b_close == 1440 or dep <= b_close:
                        step.poi = step.backup_poi
                        step.backup_poi = None
                        swapped = True
                if not swapped:
                    # If venue is still open during arrival, clamp duration to remaining time if viable
                    avail_dur = c_time - arr
                    min_dur = (
                        50
                        if is_heavy_cultural_poi(step.poi)
                        else (20 if dur >= 30 else dur)
                    )
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
            if i == breakfast_idx:
                meal_arrs["breakfast"] = arr
            elif i == lunch_idx:
                meal_arrs["lunch"] = arr
            elif i == dinner_idx:
                meal_arrs["dinner"] = arr

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
