import copy
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from app.db.models import TripModel
from app.services.transit_fare_service import TransitFareService
from app.services.transit_service import TransitRoutingError, get_detailed_transit_leg
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

logger = logging.getLogger(__name__)


def parse_time_to_minutes(time_str: str) -> int:
    """Converts 'HH:MM' string to total minutes from midnight."""
    try:
        parts = time_str.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return 540  # 09:00 default


def minutes_to_time_str(total_minutes: int) -> str:
    """Converts total minutes from midnight to 'HH:MM'."""
    hrs = (total_minutes // 60) % 24
    mins = total_minutes % 60
    return f"{hrs:02d}:{mins:02d}"


class UpgradeTripTransitUseCase:
    """
    Reruns all travel legs between POIs in an existing trip using real
    Valhalla transit and road network tiles. Preserves POI sequence and dwell
    durations, and dynamically cascades arrival/departure timestamps.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def execute(self, trip_id: str) -> dict[str, Any]:
        stmt = select(TripModel).where(TripModel.id == trip_id)
        result = await self.session.execute(stmt)
        trip = result.scalar_one_or_none()
        if not trip:
            raise ValueError(f"Trip '{trip_id}' not found")

        itinerary = copy.deepcopy(trip.itinerary_data)
        days = itinerary.get("days", [])
        city = trip.destination or ""

        for day_idx, day_obj in enumerate(days):
            day_itin = day_obj.get("itinerary", {})
            path_items = day_itin.get("path", [])
            if len(path_items) < 2:
                continue

            day_date_str = day_obj.get("date")
            try:
                base_date = (
                    datetime.fromisoformat(day_date_str).date()
                    if day_date_str
                    else datetime.now(timezone.utc).date()
                )
            except ValueError:
                base_date = datetime.now(timezone.utc).date()

            # Track cascading minutes from midnight
            first_item = path_items[0]
            curr_start_str = first_item.get("scheduled_start", "08:00")
            curr_end_str = first_item.get("scheduled_end", "09:00")
            start_mins = parse_time_to_minutes(curr_start_str)
            end_mins = parse_time_to_minutes(curr_end_str)
            dwell_mins = max(15, end_mins - start_mins)
            current_clock_mins = start_mins + dwell_mins

            transit_leg_costs = []
            has_airport_transit = False

            for k in range(1, len(path_items)):
                prev_poi = path_items[k - 1].get("poi", {})
                curr_poi = path_items[k].get("poi", {})

                is_airport_leg = (
                    (day_idx == 0 and k == 1)
                    or (day_idx == len(days) - 1 and k == len(path_items) - 1)
                    or curr_poi.get("category") == "AIRPORT"
                    or prev_poi.get("category") == "AIRPORT"
                )

                if isinstance(prev_poi, dict) and "city" not in prev_poi and city:
                    prev_poi["city"] = city
                if isinstance(curr_poi, dict) and "city" not in curr_poi and city:
                    curr_poi["city"] = city

                dep_clock_str = minutes_to_time_str(current_clock_mins)
                dep_iso = f"{base_date.isoformat()}T{dep_clock_str}"

                try:
                    transit_leg = await get_detailed_transit_leg(
                        origin=prev_poi,
                        destination=curr_poi,
                        departure_iso=dep_iso,
                        is_airport_leg=is_airport_leg,
                    )
                except (
                    TransitRoutingError,
                    httpx.HTTPError,
                    ValueError,
                    KeyError,
                    OSError,
                    RuntimeError,
                ) as exc:
                    logger.warning(
                        f"Could not fetch real transit leg on upgrade ({exc}), retaining previous."
                    )
                    transit_leg = None

                if transit_leg:
                    # Update leg data
                    path_items[k]["transit_from_previous"] = transit_leg.model_dump(
                        mode="json"
                    )
                    leg_dur_mins = transit_leg.duration_mins or 15
                    if transit_leg.cost_eur > 0:
                        transit_leg_costs.append(transit_leg.cost_eur)
                    if is_airport_leg or transit_leg.airport_surcharge_eur > 0:
                        has_airport_transit = True
                else:
                    existing_transit = path_items[k].get("transit_from_previous", {})
                    leg_dur_mins = existing_transit.get("duration_mins", 15)

                # Calculate dwell time at current POI based on original schedule
                old_start_mins = parse_time_to_minutes(
                    path_items[k].get("scheduled_start", "09:00")
                )
                old_end_mins = parse_time_to_minutes(
                    path_items[k].get("scheduled_end", "10:00")
                )
                poi_dwell = max(15, old_end_mins - old_start_mins)

                # Dynamic cascade of timestamps
                arrival_mins = current_clock_mins + leg_dur_mins
                path_items[k]["scheduled_start"] = minutes_to_time_str(arrival_mins)

                departure_mins = arrival_mins + poi_dwell

                flight_info = day_obj.get("flight_info") or {}
                is_departure_flight = (
                    flight_info.get("direction") == "departure"
                    or day_idx == len(days) - 1
                )
                if is_departure_flight and curr_poi.get("category") == "AIRPORT":
                    flight_dep_str = flight_info.get("departure_time")
                    if flight_dep_str:
                        f_dep_mins = parse_time_to_minutes(flight_dep_str)
                        if f_dep_mins > arrival_mins:
                            departure_mins = f_dep_mins
                        else:
                            departure_mins = arrival_mins + 30

                path_items[k]["scheduled_end"] = minutes_to_time_str(departure_mins)
                current_clock_mins = departure_mins

            # Re-evaluate transit pass advisory with real leg fares
            transit_rec = TransitFareService.evaluate_daily_transit_savings(
                city=city,
                leg_costs=transit_leg_costs,
                has_airport_leg=has_airport_transit,
            )
            day_itin["transit_recommendation"] = transit_rec.model_dump(mode="json")
            day_obj["transit_recommendation"] = transit_rec.model_dump(mode="json")

        if "metadata" not in itinerary or not isinstance(itinerary["metadata"], dict):
            itinerary["metadata"] = {}
        itinerary["metadata"]["transit_upgraded"] = True
        itinerary["is_upgraded"] = True

        trip.itinerary_data = itinerary
        await self.session.commit()
        await self.session.refresh(trip)
        return {
            "status": "success",
            "trip_id": trip.id,
            "itinerary_data": trip.itinerary_data,
        }
