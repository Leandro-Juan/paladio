from abc import ABC, abstractmethod

from app.domain.entities.poi import Itinerary, Poi, TransitEdge
from app.schemas.itinerary import TravelConstraints


class IOptimizationEngine(ABC):
    """
    Abstract port for the Optimization Engine.
    Isolates the Application Use Cases from the specific C++ implementation.
    """

    @abstractmethod
    def run_optimization(
        self,
        constraints: TravelConstraints,
        pois: list[Poi],
        transit_matrix: list[list[TransitEdge]],
        num_days: int = 1,
        day_start_mins: int = 480,
        day_end_mins: int = 1320,
        mandatory_names: list[str] | None = None,
        user_id: str = "default_user",
        start_node_index: int | None = None,
        end_node_index: int | None = None,
    ) -> Itinerary:
        """
        Runs the core optimization routine given a set of constraints and domain entities.
        """
