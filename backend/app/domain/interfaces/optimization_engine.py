from abc import ABC, abstractmethod
from typing import List, Optional
from app.schemas.itinerary import TravelConstraints
from app.domain.entities.poi import Poi, TransitEdge, Itinerary

class IOptimizationEngine(ABC):
    """
    Abstract port for the Optimization Engine.
    Isolates the Application Use Cases from the specific C++ implementation.
    """
    
    @abstractmethod
    def run_optimization(
        self,
        constraints: TravelConstraints,
        pois: List[Poi],
        transit_matrix: List[List[TransitEdge]],
        num_days: int = 1,
        day_start_mins: int = 480,
        day_end_mins: int = 1320,
        mandatory_names: Optional[List[str]] = None,
        user_id: str = "default_user",
        start_node_index: Optional[int] = None,
        end_node_index: Optional[int] = None
    ) -> Itinerary:
        """
        Runs the core optimization routine given a set of constraints and domain entities.
        """
        pass
