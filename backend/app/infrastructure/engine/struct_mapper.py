from typing import Any

import numpy as np
from app.domain.entities.poi import ScoredPoi
from app.schemas.itinerary import TravelConstraints
from app.utils.text import is_poi_mandatory

try:
    import paladio_core
except ImportError:
    paladio_core = None


def map_category_to_node_type(category: str):
    """Maps string categories to paladio_core.NodeType enum."""
    category = category.upper()
    if not paladio_core:
        return None

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
) -> list[Any]:
    if not paladio_core:
        return []

    cpp_pois = []

    for sp in scored_pois:
        poi = sp.poi
        score = sp.score

        node_type = map_category_to_node_type(poi.category)

        earliest = max(poi.open_time_mins, day_start_mins)
        latest = poi.close_time_mins

        is_mandatory = (
            is_poi_mandatory(poi.name, mandatory_names) if mandatory_names else False
        )

        is_hotel = node_type == paladio_core.NodeType.HOTEL
        node_cost = 0.0 if is_hotel else poi.cost_eur
        node_score = 0.0 if is_hotel else score
        node_dur = 0 if is_hotel else poi.duration_mins

        cpp_poi = paladio_core.POI(
            node_type,
            node_cost,
            node_score,
            earliest,
            latest,
            node_dur,
            is_mandatory,
        )

        cat = poi.category.upper()
        name = poi.name.lower()
        if cat in ("RESTAURANT", "CAFE", "BAKERY"):
            if (
                "breakfast" in name
                or "cafe" in name
                or "café" in name
                or "bakery" in name
                or "desayuno" in name
                or cat in ("CAFE", "BAKERY")
                or (earliest <= 10 * 60 and latest >= 11 * 60)
            ):
                cpp_poi.is_breakfast_spot = True
            if "lunch" in name or (earliest <= 14 * 60 and latest >= 13 * 60):
                cpp_poi.is_lunch_spot = True
            if "dinner" in name or (latest >= 20 * 60 and earliest <= 21 * 60):
                cpp_poi.is_dinner_spot = True
            if not (
                cpp_poi.is_breakfast_spot
                or cpp_poi.is_lunch_spot
                or cpp_poi.is_dinner_spot
            ):
                cpp_poi.is_lunch_spot = True
                cpp_poi.is_dinner_spot = True

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
) -> Any:
    if not paladio_core:
        return None

    breakfast_deadline = -1
    lunch_deadline = -1
    dinner_deadline = -1

    if not constraints.meals:
        # Default to ensure realism if none provided
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

    budget_eur = constraints.budget_usd * exchange_rate

    config = paladio_core.OptimizationConfig(
        max_budget=budget_eur,
        start_node_index=start_node_index,
        end_node_index=end_node_index,
        end_time_limit=day_end_mins,
        breakfast_deadline=breakfast_deadline,
        lunch_deadline=lunch_deadline,
        dinner_deadline=dinner_deadline,
    )
    return config
