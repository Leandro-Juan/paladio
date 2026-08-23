import logging
import numpy as np
from typing import List, Optional
import jax.numpy as jnp

from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.domain.interfaces.scoring_model import IScoringModel
from app.domain.entities.poi import Poi, TransitEdge, Itinerary, ScheduledPoi
from app.schemas.itinerary import TravelConstraints
from app.engine.scoring.features import PoiEncoder, UserStore

logger = logging.getLogger(__name__)

try:
    import paladio_core
except ImportError:
    logger.warning("paladio_core module not found. C++ engine binding must be compiled.")
    paladio_core = None

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


class CppOptimizationAdapter(IOptimizationEngine):
    """
    Adapter bridging the Python application layer with the C++ paladio_core engine.
    Implements IOptimizationEngine interface.
    """
    def __init__(self, ml_model: IScoringModel, ml_params: Any, user_store: UserStore):
        self.ml_model = ml_model
        self.ml_params = ml_params
        self.user_store = user_store

    def run_optimization(
        self,
        constraints: TravelConstraints,
        pois: List[Poi],
        transit_matrix: List[List[TransitEdge]],
        num_days: int = 1,
        day_start_mins: int = 480,  # Default 08:00
        day_end_mins: int = 1320,   # Default 22:00
        mandatory_names: Optional[List[str]] = None,
        user_id: str = "default_user"
    ) -> Itinerary:
        
        if not paladio_core:
            raise OptimizationError("C++ optimization engine is not available.")
            
        n = len(pois)
        cpp_pois = []
        poi_embeddings = []
        
        # 1. Batch encode POIs for ML
        for poi in pois:
            # PoiEncoder currently expects dict, so we convert the entity for the encoder
            poi_embeddings.append(PoiEncoder.encode(poi.model_dump()))
            
        poi_embeddings_jnp = jnp.stack(poi_embeddings)
        user_embedding = self.user_store.get_embedding(user_id)
        
        # Batch inference -> shape (N, 1)
        scores = self.ml_model.batch_score(self.ml_params, user_embedding, poi_embeddings_jnp)

        # 2. Build POI vectors for C++
        for i, poi in enumerate(pois):
            node_type = map_category_to_node_type(poi.category)
            score = float(scores[i][0])
            
            earliest = max(poi.open_time_mins, day_start_mins)
            latest = poi.close_time_mins
            
            # Check if mandatory
            is_mandatory = False
            poi_name_lower = poi.name.lower()
            if mandatory_names:
                for m_name in mandatory_names:
                    if m_name.lower() in poi_name_lower:
                        is_mandatory = True
                        break
            
            cpp_poi = paladio_core.POI(
                node_type,
                poi.cost_eur,
                score,
                earliest,
                latest,
                poi.duration_mins,
                is_mandatory
            )
            
            # Set meal flags
            cat = poi.category.upper()
            name = poi.name.lower()
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
            
        # 3. Build flattened transit matrices
        durations = np.zeros(n * n, dtype=np.int32)
        costs = np.zeros(n * n, dtype=np.float64)
        for i in range(n):
            for j in range(n):
                idx = i * n + j
                if i != j:
                    edge = transit_matrix[i][j]
                    durations[idx] = edge.duration_mins
                    costs[idx] = edge.cost_eur
                    
        # 4. Build Configuration
        breakfast_deadline = -1
        lunch_deadline = -1
        dinner_deadline = -1
        
        for meal in constraints.meals:
            m_type = meal.meal_type.upper()
            end_mins = meal.end_time.hour * 60 + meal.end_time.minute
            if "BREAKFAST" in m_type:
                breakfast_deadline = end_mins
            elif "LUNCH" in m_type:
                lunch_deadline = end_mins
            elif "DINNER" in m_type:
                dinner_deadline = end_mins
                
        if breakfast_deadline != -1 and breakfast_deadline <= day_start_mins:
            breakfast_deadline = -1
        if lunch_deadline != -1 and lunch_deadline <= day_start_mins:
            lunch_deadline = -1
        if dinner_deadline != -1 and dinner_deadline <= day_start_mins:
            dinner_deadline = -1
                
        budget_eur = constraints.budget_usd * 0.92

        config = paladio_core.OptimizationConfig(
            max_budget=budget_eur / num_days if num_days > 0 else budget_eur,
            end_time_limit=day_end_mins,
            breakfast_deadline=breakfast_deadline,
            lunch_deadline=lunch_deadline,
            dinner_deadline=dinner_deadline
        )
        
        # 5. Call C++ Engine
        try:
            result = paladio_core.optimize_itinerary(cpp_pois, durations, costs, config)
            
            # 6. Map back to Itinerary Entity
            path_details = []
            current_time = day_start_mins
            prev_idx = -1
            
            for idx in result.path:
                if prev_idx != -1:
                    transit_time = int(durations[prev_idx * n + idx])
                    current_time += transit_time
                    
                start_h = current_time // 60
                start_m = current_time % 60
                
                duration = int(pois[idx].duration_mins)
                current_time += duration
                
                end_h = current_time // 60
                end_m = current_time % 60
                
                path_details.append(ScheduledPoi(
                    poi=pois[idx],
                    scheduled_start=f"{start_h:02d}:{start_m:02d}",
                    scheduled_end=f"{end_h:02d}:{end_m:02d}"
                ))
                prev_idx = idx
                
            return Itinerary(
                total_score=float(result.total_score),
                total_cost_eur=float(result.total_cost),
                total_time_mins=int(result.total_time),
                path=path_details
            )
        except Exception as e:
            raise OptimizationError(f"C++ engine failed: {str(e)}")
