from typing import Any

import numpy as np
from app.domain.entities.poi import ScoredPoi
from app.schemas.itinerary import TravelConstraints
from app.utils.text import is_poi_mandatory

try:
    import paladio_core
except ImportError:
    paladio_core = None


def map_category_to_node_type(category: str, name: str = ""):
    """Maps string categories to paladio_core.NodeType enum."""
    category = category.upper()
    name_lower = name.lower()
    if not paladio_core:
        return None

    if "dinner" in name_lower:
        return paladio_core.NodeType.RESTAURANT_DINNER
    if "breakfast" in name_lower:
        return paladio_core.NodeType.RESTAURANT_BREAKFAST
    if "lunch" in name_lower:
        return paladio_core.NodeType.RESTAURANT_LUNCH

    mapping = {
        "HOTEL": paladio_core.NodeType.HOTEL,
        "ATTRACTION": paladio_core.NodeType.ATTRACTION,
        "MUSEUM": paladio_core.NodeType.ATTRACTION,
        "LANDMARK": paladio_core.NodeType.ATTRACTION,
        "PARK": paladio_core.NodeType.ATTRACTION,
        "BAR": paladio_core.NodeType.BAR,
        "RESTAURANT": paladio_core.NodeType.RESTAURANT_LUNCH,
        "CAFE": paladio_core.NodeType.RESTAURANT_BREAKFAST,
        "BAKERY": paladio_core.NodeType.RESTAURANT_BREAKFAST,
        "AIRPORT": paladio_core.NodeType.ATTRACTION,
        "TRANSIT": paladio_core.NodeType.ATTRACTION,
    }
    return mapping.get(category, paladio_core.NodeType.ATTRACTION)


def build_cpp_pois(
    scored_pois: list[ScoredPoi],
    day_start_mins: int,
    mandatory_names: list[str] | None = None,
    day_weekday: int = 0,
) -> list[Any]:
    if not paladio_core:
        return []

    cpp_pois = []

    for sp in scored_pois:
        poi = sp.poi
        score = sp.score

        node_type = map_category_to_node_type(poi.category, poi.name)

        is_specialized_meal = any(
            s in poi.name.lower() for s in ("(lunch)", "(dinner)", "(breakfast)")
        )
        open_vec = getattr(poi, "open_time_mins_by_day", None)
        close_vec = getattr(poi, "close_time_mins_by_day", None)
        if open_vec and len(open_vec) == 7 and 0 <= day_weekday < 7:
            o_min = open_vec[day_weekday]
            c_min = close_vec[day_weekday]
            if (o_min == -1 or c_min == -1) and not is_specialized_meal:
                o_min, c_min = poi.open_time_mins, poi.close_time_mins
        else:
            o_min, c_min = poi.open_time_mins, poi.close_time_mins

        if is_specialized_meal and (o_min == -1 or c_min == -1):
            earliest = 1440
            latest = 1440
        else:
            earliest = max(o_min, day_start_mins)
            latest = c_min

        # Guardrail 3: Midnight-crossing normalization
        if latest < earliest:
            latest += 1440

        is_mandatory = (
            is_poi_mandatory(poi.name, mandatory_names) if mandatory_names else False
        )

        is_hotel = node_type == paladio_core.NodeType.HOTEL
        node_cost = 0.0 if is_hotel else poi.cost_eur
        node_score = 0.0 if is_hotel else score
        node_dur = 0 if is_hotel else poi.duration_mins

        cat_id = getattr(poi, "category_id", 255)
        if cat_id is None:
            cat_id = 255

        cpp_poi = paladio_core.POI(
            node_type,
            node_cost,
            node_score,
            earliest,
            latest,
            node_dur,
            is_mandatory,
            cat_id,
        )

        cat = poi.category.upper()
        name = poi.name.lower()
        if (
            cat in ("RESTAURANT", "CAFE", "BAKERY")
            or "(lunch)" in name
            or "(dinner)" in name
            or "(breakfast)" in name
        ):
            is_b = False
            is_l = False
            is_d = False
            if "breakfast" in name:
                is_b = True
                cpp_poi.earliest_time = max(cpp_poi.earliest_time, 450)
                cpp_poi.latest_time = min(cpp_poi.latest_time, 630)
            elif "dinner" in name:
                is_d = True
                cpp_poi.earliest_time = max(cpp_poi.earliest_time, 1110)
                cpp_poi.latest_time = min(cpp_poi.latest_time, 1350)
            elif "lunch" in name:
                is_l = True
                cpp_poi.earliest_time = max(cpp_poi.earliest_time, 690)
                cpp_poi.latest_time = min(cpp_poi.latest_time, 900)
            else:
                if (
                    "cafe" in name
                    or "café" in name
                    or "bakery" in name
                    or "desayuno" in name
                    or cat in ("CAFE", "BAKERY")
                    or (earliest <= 10 * 60 and latest >= 11 * 60)
                ):
                    is_b = True
                if earliest <= 14 * 60 and latest >= 13 * 60:
                    is_l = True
                if latest >= 20 * 60 and earliest <= 21 * 60:
                    is_d = True
                if not (is_b or is_l or is_d):
                    is_l = True
                    is_d = True

            cpp_poi.is_breakfast_spot = is_b
            cpp_poi.is_lunch_spot = is_l
            cpp_poi.is_dinner_spot = is_d

        cpp_pois.append(cpp_poi)

    return cpp_pois


def flatten_transit_matrix(
    transit_matrix: list[list[Any]],
) -> tuple[np.ndarray, np.ndarray]:
    n = len(transit_matrix)
    durations = np.zeros(n * n, dtype=np.int32)
    costs = np.zeros(n * n, dtype=np.float64)
    for i in range(n):
        for j in range(n):
            idx = i * n + j
            if i != j:
                cell = transit_matrix[i][j]
                if isinstance(cell, (tuple, list)):
                    durations[idx] = int(cell[0])
                    costs[idx] = float(cell[1])
                elif isinstance(cell, dict):
                    durations[idx] = int(cell.get("duration_mins", 0))
                    costs[idx] = float(cell.get("cost_eur", 0.0))
                else:
                    durations[idx] = int(getattr(cell, "duration_mins", 0))
                    costs[idx] = float(getattr(cell, "cost_eur", 0.0))
    return durations, costs


def build_optimization_config(
    constraints: TravelConstraints,
    day_start_mins: int,
    day_end_mins: int,
    start_node_index: int | None,
    end_node_index: int | None,
    exchange_rate: float = 0.92,
    cpp_pois: list[Any] | None = None,
    monotony_threshold: int = 2,
    monotony_multiplier: float = 0.5,
    max_nodes_expanded: int = 0,
    max_budget: float | None = None,
    enforce_default_meal_deadlines: bool = False,
    max_idle_time: int = 60,
) -> Any:
    if not paladio_core:
        return None

    breakfast_deadline = -1
    lunch_deadline = -1
    dinner_deadline = -1

    if not constraints.meals:
        if enforce_default_meal_deadlines:
            lunch_deadline = 15 * 60
            dinner_deadline = 22 * 60 + 30
    else:
        for meal in constraints.meals:
            m_type = meal.meal_type.upper()
            end_mins = meal.end_time.hour * 60 + meal.end_time.minute
            if "BREAKFAST" in m_type:
                breakfast_deadline = end_mins
            elif "LUNCH" in m_type:
                lunch_deadline = end_mins
            elif "DINNER" in m_type:
                dinner_deadline = end_mins

    if day_end_mins - day_start_mins < 240:
        breakfast_deadline = -1
        lunch_deadline = -1
        dinner_deadline = -1
    else:
        if breakfast_deadline != -1 and (
            breakfast_deadline <= day_start_mins + 90
            or breakfast_deadline > day_end_mins
        ):
            breakfast_deadline = -1
        if lunch_deadline != -1 and (
            lunch_deadline <= day_start_mins + 120 or lunch_deadline > day_end_mins
        ):
            lunch_deadline = -1
        if dinner_deadline != -1 and (
            dinner_deadline <= day_start_mins + 120 or dinner_deadline > day_end_mins
        ):
            dinner_deadline = -1

    # If cpp_pois is provided, verify candidate spots exist before enforcing meal deadlines
    if cpp_pois is not None:
        has_b = any(getattr(p, "is_breakfast_spot", False) for p in cpp_pois)
        has_l = any(getattr(p, "is_lunch_spot", False) for p in cpp_pois)
        has_d = any(getattr(p, "is_dinner_spot", False) for p in cpp_pois)
        if not has_b:
            breakfast_deadline = -1
        if not has_l:
            lunch_deadline = -1
        if not has_d:
            dinner_deadline = -1

    if max_budget is not None and max_budget > 0:
        budget_eur = max_budget
    elif constraints.budget_usd and constraints.budget_usd > 0:
        budget_eur = constraints.budget_usd * exchange_rate
    else:
        budget_eur = 100000.0

    config = paladio_core.OptimizationConfig(
        max_budget=budget_eur,
        start_node_index=start_node_index,
        end_node_index=end_node_index,
        end_time_limit=day_end_mins,
        breakfast_deadline=breakfast_deadline,
        lunch_deadline=lunch_deadline,
        dinner_deadline=dinner_deadline,
        monotony_threshold=monotony_threshold,
        monotony_multiplier=monotony_multiplier,
        max_nodes_expanded=max_nodes_expanded,
        max_idle_time=max_idle_time,
    )
    return config
