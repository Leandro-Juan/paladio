import sys
import numpy as np
from typing import List, Dict

try:
    import paladio_core
except ImportError:
    print("Warning: paladio_core module not found. C++ engine binding must be compiled.", file=sys.stderr)
    paladio_core = None

from app.schemas.itinerary import TravelConstraints

class OptimizationError(Exception):
    pass

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
        "RESTAURANT": paladio_core.NodeType.RESTAURANT_LUNCH, # Default
        "AIRPORT": paladio_core.NodeType.ATTRACTION, # Default
        "TRANSIT": paladio_core.NodeType.ATTRACTION
    }
    return mapping.get(category, paladio_core.NodeType.ATTRACTION)

def run_optimization(
    constraints: TravelConstraints,
    pois_data: List[Dict],
    transit_matrix: List[List[Dict]],
    num_days: int = 1
) -> Dict:
    """
    Bridges the Python orchestration layer with the C++ deterministic core.
    """
    if not paladio_core:
        raise OptimizationError("C++ optimization engine is not available.")
        
    n = len(pois_data)
    
    # 1. Build POI vector
    cpp_pois = []
    for poi in pois_data:
        node_type = map_category_to_node_type(poi.get("category", "ATTRACTION"))
        
        # We assume for now that all POIs are open 08:00 (480 mins) to 22:00 (1320 mins)
        # unless specified in metadata (simplified for MVP)
        earliest = 480
        latest = 1320
        duration = int(poi.get("duration_mins", 60))
        cost = float(poi.get("cost_eur", 0.0))
        score = 100.0 # Base score, we could compute this based on rating/preference
        
        cpp_poi = paladio_core.POI(
            node_type,
            cost,
            score,
            earliest,
            latest,
            duration
        )
        
        # Set meal flags so the C++ engine can satisfy meal constraints
        cat = poi.get("category", "").upper()
        name = poi.get("name", "").lower()
        if cat == "RESTAURANT":
            if "breakfast" in name:
                cpp_poi.is_breakfast_spot = True
            elif "lunch" in name:
                cpp_poi.is_lunch_spot = True
            elif "dinner" in name:
                cpp_poi.is_dinner_spot = True
            else:
                cpp_poi.is_breakfast_spot = True
                cpp_poi.is_lunch_spot = True
                cpp_poi.is_dinner_spot = True
        
        cpp_pois.append(cpp_poi)
        
    # 2. Build flattened transit matrices as Numpy arrays (zero-copy for PyBind11 boundary)
    durations = np.zeros(n * n, dtype=np.int32)
    costs = np.zeros(n * n, dtype=np.float64)
    for i in range(n):
        for j in range(n):
            idx = i * n + j
            if i != j:
                edge = transit_matrix[i][j]
                durations[idx] = edge["duration_mins"]
                costs[idx] = float(edge.get("cost_eur", 0.0))
                
    # 3. Build Configuration
    # We parse deadlines from the constraints if present
    breakfast_deadline = -1
    lunch_deadline = -1
    dinner_deadline = -1
    
    for meal in constraints.meals:
        m_type = meal.meal_type.upper()
        # Convert time to minutes from midnight
        end_mins = meal.end_time.hour * 60 + meal.end_time.minute
        if "BREAKFAST" in m_type:
            breakfast_deadline = end_mins
        elif "LUNCH" in m_type:
            lunch_deadline = end_mins
        elif "DINNER" in m_type:
            dinner_deadline = end_mins
            
    # Time limit: trip start and end date don't perfectly map to the single-day config yet,
    # but let's assume we are planning a single day up to 23:59 (1439 mins)
    end_time_limit = 1439 

    config = paladio_core.OptimizationConfig(
        max_budget=constraints.budget_usd / num_days if num_days > 0 else constraints.budget_usd,
        end_time_limit=end_time_limit,
        breakfast_deadline=breakfast_deadline,
        lunch_deadline=lunch_deadline,
        dinner_deadline=dinner_deadline
    )
    
    # 4. Call C++ Engine
    try:
        result = paladio_core.optimize_itinerary(cpp_pois, durations, costs, config)
        
        # 5. Map back to Python dict
        path_details = []
        for idx in result.path:
            path_details.append({
                "poi": pois_data[idx],
            })
            
        return {
            "total_score": result.total_score,
            "total_cost_eur": result.total_cost,
            "total_time_mins": result.total_time,
            "path": path_details
        }
    except Exception as e:
        raise OptimizationError(f"C++ engine failed: {str(e)}")
