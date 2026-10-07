from __future__ import annotations

import copy
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from app.adapters.repositories.in_memory_poi_repository import InMemoryPoiRepository
from app.domain.entities.poi import Poi, PoiLocation
from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.v2.pipeline import ItineraryV2Result, run_itinerary_v2_pipeline
from app.schemas.itinerary import TravelConstraints
from app.services.routing_service import RoutingService

logger = logging.getLogger(__name__)


class OptimizeDailyItineraryUseCase:
    """
    Agency-grade multi-day itinerary orchestrator.
    Connects production workflows to the deterministic v2 itinerary pipeline
    powered by C++20 paladio_core, dynamic circadian rhythms, and fail-fast routing.
    """

    def __init__(
        self,
        engine: IOptimizationEngine | None = None,
        poi_repo: IPoiRepository | None = None,
        transit_matrix_fn: Callable[[list[dict[str, Any]], str], Any] | None = None,
    ):
        self.engine = engine
        self.poi_repo = poi_repo
        self.transit_matrix_fn = transit_matrix_fn

    async def execute(
        self,
        constraints: TravelConstraints,
        daily_pois_data: list[list[dict[str, Any]]] | None = None,
        outbound_flight: dict[str, Any] | None = None,
        return_flight: dict[str, Any] | None = None,
        user_vector: list[float] | None = None,
    ) -> dict[str, Any]:
        city = getattr(constraints, "destination_city", None) or getattr(
            constraints, "city", None
        )
        if not city:
            raise ValueError("destination_city must be specified in constraints.")

        # Trigger GTFS transit prewarm/download if configured
        try:
            from app.tasks import async_trigger_city_gtfs_download_if_needed

            await async_trigger_city_gtfs_download_if_needed(city_name=city)
        except (ImportError, OSError, RuntimeError) as e:
            logger.debug(f"GTFS background trigger skipped for {city}: {e}")

        # Resolve Flights
        outbound = copy.deepcopy(outbound_flight) if outbound_flight else None
        ret_flight = copy.deepcopy(return_flight) if return_flight else None

        anchors = getattr(constraints, "booking_anchors", None)
        if anchors:
            if not outbound and anchors.outbound_flight:
                outbound = anchors.outbound_flight.model_dump()
            if not ret_flight and anchors.return_flight:
                ret_flight = anchors.return_flight.model_dump()

        # Resolve Hotel Depot
        depot_poi: Poi | None = None
        hotel_anchor = anchors.hotel if anchors else None

        hotel_dict = None
        if daily_pois_data:
            hotel_dict = next(
                (
                    p
                    for day in daily_pois_data
                    for p in day
                    if isinstance(p, dict) and p.get("category") == "HOTEL"
                ),
                None,
            )

        if hotel_anchor:
            hotel_lat = getattr(hotel_anchor, "latitude", None)
            hotel_lon = getattr(hotel_anchor, "longitude", None)
            if (hotel_lat is None or float(hotel_lat) == 0.0) and hotel_dict:
                loc = hotel_dict.get("location", {})
                hotel_lat = loc.get("latitude", hotel_dict.get("lat"))
                hotel_lon = loc.get("longitude", hotel_dict.get("lon"))

            if (
                hotel_lat is not None
                and hotel_lon is not None
                and (float(hotel_lat) != 0.0 or float(hotel_lon) != 0.0)
            ):
                depot_poi = Poi(
                    id=f"hotel_{hotel_anchor.name.lower().replace(' ', '_')}",
                    name=hotel_anchor.name,
                    city=city,
                    category="HOTEL",
                    location=PoiLocation(
                        latitude=float(hotel_lat), longitude=float(hotel_lon)
                    ),
                    open_time_mins_by_day=[0] * 7,
                    close_time_mins_by_day=[1440] * 7,
                    duration_mins=1,
                    cost_eur=0.0,
                    tier=3,
                    iconicity_score=0.0,
                    taxonomy_category="art_culture",
                    category_id=255,
                )
        elif hotel_dict:
            loc = hotel_dict.get("location", {})
            h_lat = loc.get("latitude", hotel_dict.get("lat", 0.0))
            h_lon = loc.get("longitude", hotel_dict.get("lon", 0.0))
            if float(h_lat) != 0.0 or float(h_lon) != 0.0:
                depot_poi = Poi(
                    id=str(
                        hotel_dict.get("id")
                        or hotel_dict.get("poi_id")
                        or "hotel_depot"
                    ),
                    name=hotel_dict.get("name", "Accommodations"),
                    city=city,
                    category="HOTEL",
                    location=PoiLocation(latitude=float(h_lat), longitude=float(h_lon)),
                    open_time_mins_by_day=[0] * 7,
                    close_time_mins_by_day=[1440] * 7,
                    duration_mins=1,
                    cost_eur=0.0,
                    tier=3,
                    iconicity_score=0.0,
                    taxonomy_category="art_culture",
                    category_id=255,
                )

        # Detect airport venue
        selected_airport = None
        if daily_pois_data:
            selected_airport = next(
                (
                    p
                    for day in daily_pois_data
                    for p in day
                    if isinstance(p, dict) and p.get("category") == "AIRPORT"
                ),
                None,
            )

        # Resolve Repository
        repo = self.poi_repo
        if repo is None:
            flat_candidate_pois = []
            if daily_pois_data:
                for day in daily_pois_data:
                    for p in day:
                        if (
                            isinstance(p, dict)
                            and (p.get("category") or "").upper()
                            not in ("HOTEL", "AIRPORT")
                            or (
                                isinstance(p, Poi)
                                and p.category.upper() not in ("HOTEL", "AIRPORT")
                            )
                        ):
                            flat_candidate_pois.append(p)

            if flat_candidate_pois:
                repo = InMemoryPoiRepository(flat_candidate_pois, city=city)
            else:
                from app.adapters.repositories.sql_poi_repository import (
                    SqlPoiRepository,
                )
                from app.db.session import async_session
                from app.engine.v2.city_readiness import ensure_city_ready

                async with async_session() as session:
                    sql_repo = SqlPoiRepository(session)
                    await ensure_city_ready(city, sql_repo)
                    repo = sql_repo

        # Resolve Transit Matrix Function
        matrix_fn = self.transit_matrix_fn
        if matrix_fn is None:
            plan_mode = getattr(constraints, "plan_mode", "real")

            async def _default_matrix(
                pois: list[dict[str, Any]], city_name: str
            ) -> list[list[Any]]:
                return await RoutingService.get_transit_matrix(
                    pois=pois,
                    city_name=city_name,
                    plan_mode=plan_mode,
                )

            matrix_fn = _default_matrix

        # Execute V2 Pipeline
        v2_res: ItineraryV2Result = await run_itinerary_v2_pipeline(
            city=city,
            constraints=constraints,
            poi_repo=repo,
            transit_matrix_fn=matrix_fn,
            depot_poi=depot_poi,
            outbound_flight=outbound,
            return_flight=ret_flight,
            user_vector=user_vector,
        )

        # Assemble Output
        multi_day_itinerary: list[dict[str, Any]] = []
        themes: list[str] = []
        num_days = len(v2_res.days)

        for d_idx, d_data in enumerate(v2_res.days):
            itin_val = d_data.get("itinerary")
            if hasattr(itin_val, "model_dump"):
                itin_dict = itin_val.model_dump(mode="json")
            elif isinstance(itin_val, dict):
                itin_dict = copy.deepcopy(itin_val)
            else:
                itin_dict = {
                    "path": [],
                    "total_cost_eur": 0.0,
                    "total_time_mins": 0,
                    "total_score": 0.0,
                }

            # Prepend/append airport nodes if airport is provided
            if d_idx == 0 and selected_airport and outbound:
                arr_t = outbound.get("arrival_time") or "12:00"
                if "T" in arr_t:
                    dt = datetime.fromisoformat(arr_t)
                    arr_mins = dt.hour * 60 + dt.minute
                elif " " in arr_t:
                    time_part = arr_t.split(" ")[-1]
                    arr_parts = time_part.split(":")
                    arr_mins = int(arr_parts[0]) * 60 + int(arr_parts[1])
                else:
                    arr_parts = arr_t.split(":")
                    arr_mins = int(arr_parts[0]) * 60 + int(arr_parts[1])

                airport_start = arr_mins
                airport_end = arr_mins + 60
                airport_node = {
                    "poi": selected_airport,
                    "scheduled_start": f"{airport_start // 60:02d}:{airport_start % 60:02d}",
                    "scheduled_end": f"{airport_end // 60:02d}:{airport_end % 60:02d}",
                }
                itin_dict.setdefault("path", []).insert(0, airport_node)
                itin_dict["total_time_mins"] = itin_dict.get("total_time_mins", 0) + 60
                itin_dict["total_cost_eur"] = itin_dict.get(
                    "total_cost_eur", 0.0
                ) + float(selected_airport.get("cost_eur", 0.0) or 0.0)

            if d_idx == num_days - 1 and selected_airport and ret_flight:
                dep_t = ret_flight.get("departure_time") or "18:00"
                if "T" in dep_t:
                    dt = datetime.fromisoformat(dep_t)
                    dep_mins = dt.hour * 60 + dt.minute
                elif " " in dep_t:
                    time_part = dep_t.split(" ")[-1]
                    dep_parts = time_part.split(":")
                    dep_mins = int(dep_parts[0]) * 60 + int(dep_parts[1])
                else:
                    dep_parts = dep_t.split(":")
                    dep_mins = int(dep_parts[0]) * 60 + int(dep_parts[1])

                airport_end = dep_mins
                airport_start = max(0, dep_mins - 120)
                airport_node = {
                    "poi": selected_airport,
                    "scheduled_start": f"{airport_start // 60:02d}:{airport_start % 60:02d}",
                    "scheduled_end": f"{airport_end // 60:02d}:{airport_end % 60:02d}",
                }
                itin_dict.setdefault("path", []).append(airport_node)
                itin_dict["total_time_mins"] = itin_dict.get("total_time_mins", 0) + 120
                itin_dict["total_cost_eur"] = itin_dict.get(
                    "total_cost_eur", 0.0
                ) + float(selected_airport.get("cost_eur", 0.0) or 0.0)

            if "total_cost" not in itin_dict:
                itin_dict["total_cost"] = itin_dict.get("total_cost_eur", 0.0)
            if "total_time" not in itin_dict:
                itin_dict["total_time"] = itin_dict.get("total_time_mins", 0)

            day_dict = {
                "day": d_data.get("day", d_idx + 1),
                "day_index": d_idx,
                "flight_info": d_data.get("flight_info"),
                "inbound_flight": d_data.get("inbound_flight"),
                "outbound_flight": d_data.get("outbound_flight"),
                "theme": d_data.get("theme", "City Exploration"),
                "anchor": d_data.get("anchor", ""),
                "itinerary": itin_dict,
                "committed_pois": d_data.get("committed_pois", []),
                "scheduled_pois": d_data.get("scheduled_pois", []),
                "dropped_pois": d_data.get("dropped_pois", []),
                "unspent_budget_eur": d_data.get("unspent_budget_eur", 0.0),
            }
            multi_day_itinerary.append(day_dict)
            themes.append(day_dict["theme"])

        assumptions = [
            f"Accommodations: hotel depot located at {depot_poi.name if depot_poi else 'dynamically derived tourist city centre median coordinates'}.",
            "Flight buffers: 120m post-touchdown arrival buffer, 180m pre-takeoff departure buffer.",
            "Dynamic circadian rhythm and dining windows derived from local venue hours.",
            "Deterministic C++ optimization via paladio_core with sequential schedule verification.",
        ]

        return {
            "metadata": {
                "engine": "paladio_core_cpp20",
                "version": "2.0.0",
                "nodes_evaluated": v2_res.summary.nodes_expanded,
                "load_variance": v2_res.summary.load_variance,
                "closure_violations": v2_res.summary.closure_violations,
                "total_pois_scheduled": v2_res.summary.total_pois_scheduled,
            },
            "travel_constraints": constraints.model_dump(mode="json"),
            "themes": themes,
            "assumptions": assumptions,
            "days": multi_day_itinerary,
            "total_trip_cost": v2_res.summary.total_cost_eur,
            "selected_pois": [
                p.model_dump() if hasattr(p, "model_dump") else p
                for p in v2_res.selected_pois
            ],
            "dropped_pois": [
                p.model_dump() if hasattr(p, "model_dump") else p
                for p in v2_res.dropped_pois
            ],
            "summary": v2_res.summary.model_dump()
            if hasattr(v2_res.summary, "model_dump")
            else v2_res.summary,
        }
