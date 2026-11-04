from __future__ import annotations

import logging
from typing import Any

from app.domain.schemas.itinerary_document import ItineraryDocument
from app.services.transit_service import ensure_walking_legs_populated
from app.services.trip_reoptimization_service import TripReoptimizationService

logger = logging.getLogger(__name__)


def _time_to_minutes(val: Any) -> int:
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str) and ":" in val:
        try:
            parts = val.split(":")
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            pass
    return 540  # 09:00 default


def _minutes_to_time_str(mins: int) -> str:
    h = (mins // 60) % 24
    m = mins % 60
    return f"{h:02d}:{m:02d}"


class RecomputeService:
    """
    Recalculates times, legs, and sequences after an itinerary edit.
    Supports:
      - cascade: keeps order, refreshes transit legs & scheduled times.
      - reoptimize: calls C++ TSPTW optimizer via TripReoptimizationService, honoring locked stops.
    """

    @classmethod
    async def cascade_day(
        cls,
        doc: ItineraryDocument,
        day: int,
        destination_city: str,
    ) -> None:
        """
        Refreshes transit legs and recalculates cumulative schedule times
        for a specific day without reordering stops.
        Honors locked stop times where set.
        """
        day_plan = None
        for d in doc.days:
            if d.day == day:
                day_plan = d
                break

        if not day_plan or not day_plan.itinerary.path:
            return

        # 1. Determine day start time
        curr_time = 540  # Default 09:00
        if day_plan.hotel_depot and day_plan.hotel_depot.get("start_time"):
            curr_time = _time_to_minutes(day_plan.hotel_depot["start_time"])

        path = day_plan.itinerary.path
        total_time_mins = 0

        for i, stop in enumerate(path):
            dwell = stop.duration or 60

            # If stop is locked and has scheduled start, snap to it if reasonable
            if stop.is_locked and stop.scheduled_start is not None:
                stop_start = _time_to_minutes(stop.scheduled_start)
                curr_time = max(curr_time, stop_start)
            else:
                stop.scheduled_start = _minutes_to_time_str(curr_time)

            curr_time += dwell
            stop.scheduled_end = _minutes_to_time_str(curr_time)

            # Estimate / populate transit leg to next stop if not last
            if i < len(path) - 1:
                next_stop = path[i + 1]
                leg = next_stop.transit_from_previous
                transit_mins = 15  # Default reasonable transfer
                if isinstance(leg, dict) and leg.get("duration_minutes"):
                    transit_mins = int(round(float(leg["duration_minutes"])))
                elif hasattr(leg, "duration_minutes") and getattr(
                    leg, "duration_minutes", 0
                ):
                    transit_mins = int(round(float(getattr(leg, "duration_minutes"))))
                curr_time += transit_mins
                total_time_mins += transit_mins

            total_time_mins += dwell

        day_plan.itinerary.total_time = total_time_mins

        # 2. Enrich walkable legs through ensure_walking_legs_populated
        try:
            raw_dict = doc.to_dict()
            enriched = await ensure_walking_legs_populated(
                raw_dict, city=destination_city, target_day=day
            )
            # Re-read legs back into doc
            for d in enriched.get("days", []):
                if d.get("day") == day:
                    enriched_path = d.get("itinerary", {}).get("path", [])
                    for idx, p_item in enumerate(enriched_path):
                        if idx < len(day_plan.itinerary.path):
                            if "transit_from_previous" in p_item:
                                day_plan.itinerary.path[
                                    idx
                                ].transit_from_previous = p_item[
                                    "transit_from_previous"
                                ]
        except Exception as e:
            logger.warning(f"Could not refresh walking legs for Day {day}: {e}")

    @classmethod
    async def reoptimize_day(
        cls,
        doc: ItineraryDocument,
        day: int,
        destination_city: str,
        plan_mode: str = "estimated",
    ) -> None:
        """
        Re-sequences a day's stops using the C++20 TSPTW optimizer,
        strictly respecting locked stops and time windows.
        """
        raw_dict = doc.to_dict()
        reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
            itinerary_data=raw_dict,
            destination_city=destination_city,
            plan_mode=plan_mode,
            target_day=day,
        )

        # Parse reoptimized data back into ItineraryDocument
        updated_doc, _ = ItineraryDocument.from_dict(reoptimized)
        for idx, d in enumerate(doc.days):
            if d.day == day:
                for up_d in updated_doc.days:
                    if up_d.day == day:
                        doc.days[idx] = up_d
                        break
                break

    @classmethod
    async def reoptimize_all_days(
        cls,
        doc: ItineraryDocument,
        destination_city: str,
        plan_mode: str = "estimated",
    ) -> None:
        """
        Re-optimizes all days in the itinerary.
        """
        raw_dict = doc.to_dict()
        reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
            itinerary_data=raw_dict,
            destination_city=destination_city,
            plan_mode=plan_mode,
            target_day=None,
        )
        updated_doc, _ = ItineraryDocument.from_dict(reoptimized)
        doc.days = updated_doc.days
