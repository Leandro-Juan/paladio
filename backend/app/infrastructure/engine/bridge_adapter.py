import logging
from typing import Any

from app.domain.entities.poi import Itinerary, Poi, ScheduledPoi, TransitMatrix
from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.infrastructure.engine.ml_scorer import MLScorer
from app.infrastructure.engine.struct_mapper import (
    build_cpp_pois,
    build_optimization_config,
    flatten_transit_matrix,
)
from app.schemas.itinerary import TravelConstraints

logger = logging.getLogger(__name__)

try:
    import paladio_core
except ImportError:
    logger.warning(
        "paladio_core module not found. C++ engine binding must be compiled."
    )
    paladio_core = None


class OptimizationError(Exception):
    pass


class CppOptimizationAdapter(IOptimizationEngine):
    """
    Adapter bridging the Python application layer with the C++ paladio_core engine.
    Implements IOptimizationEngine interface.
    """

    def __init__(self, ml_scorer: MLScorer, exchange_rate: float = 0.92):
        self.ml_scorer = ml_scorer
        self.exchange_rate = exchange_rate

    async def run_optimization(
        self,
        constraints: TravelConstraints,
        pois: list[Poi],
        transit_matrix: TransitMatrix | list[list[dict[str, Any]]],
        num_days: int = 1,
        day_start_mins: int = 480,  # Default 08:00
        day_end_mins: int = 1320,  # Default 22:00
        mandatory_names: list[str] | None = None,
        user_id: str = "default_user",
        start_node_index: int | None = None,
        end_node_index: int | None = None,
        day_weekday: int = 0,
    ) -> Itinerary:
        if not paladio_core:
            raise OptimizationError("C++ optimization engine is not available.")

        # 1. ML Scoring
        if self.ml_scorer:
            scored_pois = await self.ml_scorer.score_pois(pois, user_id)
        else:
            from app.domain.entities.poi import ScoredPoi

            scored_pois = [ScoredPoi(poi=p, score=1.0) for p in pois]

        # 2. Map structures
        cpp_pois = build_cpp_pois(
            scored_pois, day_start_mins, mandatory_names, day_weekday
        )
        durations, costs = flatten_transit_matrix(transit_matrix)
        config = build_optimization_config(
            constraints,
            day_start_mins,
            day_end_mins,
            start_node_index,
            end_node_index,
            self.exchange_rate,
            cpp_pois=cpp_pois,
        )

        # 3. Call C++ Engine
        import asyncio

        try:
            result = await asyncio.to_thread(
                paladio_core.optimize_itinerary, cpp_pois, durations, costs, config
            )

            # 4. Map back to Itinerary Entity
            path_details = []
            current_time = day_start_mins
            prev_idx = -1
            n = len(pois)

            for idx in result.path:
                if prev_idx != -1:
                    transit_time = int(durations[prev_idx * n + idx])
                    current_time += transit_time

                # Enforce venue opening hours and dwell time
                earliest_open = getattr(pois[idx], "open_time_mins", 0) or 0
                current_time = max(current_time, earliest_open)

                start_h = current_time // 60
                start_m = current_time % 60

                is_hotel = getattr(pois[idx], "category", "").upper() == "HOTEL"
                duration = 0 if is_hotel else int(pois[idx].duration_mins)
                current_time += duration

                end_h = current_time // 60
                end_m = current_time % 60

                path_details.append(
                    ScheduledPoi(
                        poi=pois[idx],
                        scheduled_start=f"{start_h:02d}:{start_m:02d}",
                        scheduled_end=f"{end_h:02d}:{end_m:02d}",
                    )
                )
                prev_idx = idx

            return Itinerary(
                total_score=float(result.total_score),
                total_cost_eur=float(result.total_cost),
                total_time_mins=int(result.total_time),
                path=path_details,
            )
        except (RuntimeError, ValueError, TypeError, KeyError, AttributeError) as e:
            raise OptimizationError(f"C++ engine failed: {e!s}") from e
