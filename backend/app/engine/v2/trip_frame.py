"""Trip Frame and Daily Capacities for Paladio Itinerary v2.

Constructs explicit DayFrame specifications per calendar day, accounting for
pace preferences, arrival/departure flight buffers, meal windows, and budget shares.
"""

from datetime import date, datetime, timedelta
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.itinerary import TravelConstraints
from app.schemas.user import PacePreference

# Standard FX rate (Amendment A6: Single conversion function, no online calls)
USD_TO_EUR_RATE = 0.92


def usd_to_eur(usd: float) -> float:
    return round(usd * USD_TO_EUR_RATE, 2)


def eur_to_usd(eur: float) -> float:
    return round(eur / USD_TO_EUR_RATE, 2) if USD_TO_EUR_RATE > 0 else 0.0


# Default city center coordinates for fallback depot
CITY_DEPOT_COORDINATES: dict[str, tuple[float, float]] = {
    "paris": (48.8566, 2.3522),
    "madrid": (40.4168, -3.7038),
    "lisbon": (38.7223, -9.1393),
    "porto": (41.1579, -8.6291),
    "tokyo": (35.6762, 139.6503),
}


class DayFrame(BaseModel):
    """Specification for a single calendar day in the itinerary."""

    day_index: int
    calendar_date: date | None = None
    start_time_mins: int = 540  # 09:00 default
    end_time_mins: int = 1260  # 21:00 default
    is_arrival_day: bool = False
    is_departure_day: bool = False
    max_anchors: int = 3
    target_active_mins: int = 420
    utilization_target: float = 0.70
    requested_meals: list[str] = Field(default_factory=list)
    daily_budget_eur: float = 0.0
    start_depot: dict[str, Any] = Field(default_factory=dict)
    end_depot: dict[str, Any] = Field(default_factory=dict)

    @property
    def total_available_mins(self) -> int:
        return max(0, self.end_time_mins - self.start_time_mins)


class TripFrame(BaseModel):
    """Overall multi-day itinerary physical and temporal frame."""

    city: str
    days: list[DayFrame]
    pace: PacePreference = PacePreference.BALANCED
    total_budget_usd: float = 0.0
    total_budget_eur: float = 0.0
    total_anchor_slots: int = 0
    max_tier1_slots: int = 0


def _parse_flight_time_to_minutes(flight_time_str: str | None) -> int | None:
    """Extract minute of day (0..1439) from ISO or HH:MM string."""
    if not flight_time_str:
        return None
    try:
        clean = flight_time_str.strip()
        if "T" in clean:
            dt = datetime.fromisoformat(clean)
            return dt.hour * 60 + dt.minute
        if " " in clean:
            time_part = clean.split(" ")[1]
            h, m = map(int, time_part.split(":")[:2])
            return h * 60 + m
        if ":" in clean:
            h, m = map(int, clean.split(":")[:2])
            return h * 60 + m
    except Exception:
        return None
    return None


def build_trip_frame(constraints: TravelConstraints) -> TripFrame:
    """Builds a deterministic TripFrame from user TravelConstraints."""
    city = (constraints.destination_city or "Paris").strip()
    pace = constraints.pace or PacePreference.BALANCED

    # Calculate number of days
    num_days = 3
    start_dt = constraints.start_date
    if constraints.start_date and constraints.end_date:
        delta = (constraints.end_date - constraints.start_date).days + 1
        num_days = max(1, delta)

    total_budget_usd = float(constraints.budget_usd or 0.0)
    total_budget_eur = usd_to_eur(total_budget_usd)
    daily_budget_eur = round(total_budget_eur / num_days, 2) if num_days > 0 else 0.0

    depot_coord = CITY_DEPOT_COORDINATES.get(city.lower(), (48.8566, 2.3522))
    default_depot = {
        "name": f"{city} Center Base",
        "latitude": depot_coord[0],
        "longitude": depot_coord[1],
    }

    # Extract flight arrival/departure buffers if available
    anchors = constraints.booking_anchors
    arrival_flight_mins = None
    departure_flight_mins = None
    if anchors:
        if anchors.outbound_flight and anchors.outbound_flight.arrival_time:
            arrival_flight_mins = _parse_flight_time_to_minutes(
                anchors.outbound_flight.arrival_time
            )
        if anchors.return_flight and anchors.return_flight.departure_time:
            departure_flight_mins = _parse_flight_time_to_minutes(
                anchors.return_flight.departure_time
            )

    days: list[DayFrame] = []
    total_anchors = 0

    for d in range(num_days):
        is_arr = d == 0
        is_dep = d == (num_days - 1)

        start_time = 540  # 09:00
        end_time = 1260  # 21:00

        # Arrival day window shrink (flight arrival + 120m buffer)
        if is_arr and arrival_flight_mins is not None:
            buffered_start = arrival_flight_mins + 120
            start_time = max(540, min(1200, buffered_start))

        # Departure day window shrink (flight departure - 180m buffer)
        if is_dep and departure_flight_mins is not None:
            buffered_end = departure_flight_mins - 180
            end_time = min(1260, max(start_time + 120, buffered_end))

        # Pace-based capacity targets
        if pace == PacePreference.LEISURELY:
            max_a = 1 if (is_arr or is_dep) else 2
            target_mins = 240 if (is_arr or is_dep) else 300
            util = 0.50 if (is_arr or is_dep) else 0.55
        elif pace == PacePreference.INTENSE:
            max_a = 3 if (is_arr or is_dep) else 5
            target_mins = 420 if (is_arr or is_dep) else 540
            util = 0.75 if (is_arr or is_dep) else 0.85
        else:  # BALANCED
            max_a = 2 if (is_arr or is_dep) else 3
            target_mins = 330 if (is_arr or is_dep) else 420
            util = 0.60 if (is_arr or is_dep) else 0.70

        total_anchors += max_a

        cal_date = None
        if start_dt:
            cal_date = start_dt + timedelta(days=d)

        # Distribute requested meals across days
        day_meals: list[str] = []
        if constraints.meals:
            for m in constraints.meals:
                m_type = m.meal_type.lower()
                if m_type not in day_meals:
                    day_meals.append(m_type)
        else:
            day_meals = ["lunch"] if not (is_arr and start_time >= 840) else []

        days.append(
            DayFrame(
                day_index=d,
                calendar_date=cal_date,
                start_time_mins=start_time,
                end_time_mins=end_time,
                is_arrival_day=is_arr,
                is_departure_day=is_dep,
                max_anchors=max_a,
                target_active_mins=target_mins,
                utilization_target=util,
                requested_meals=day_meals,
                daily_budget_eur=daily_budget_eur,
                start_depot=default_depot,
                end_depot=default_depot,
            )
        )

    # 55% anchor cap for Tier 1 iconic POIs
    max_t1_slots = min(total_anchors, max(1, int(0.55 * total_anchors)))

    return TripFrame(
        city=city,
        days=days,
        pace=pace,
        total_budget_usd=total_budget_usd,
        total_budget_eur=total_budget_eur,
        total_anchor_slots=total_anchors,
        max_tier1_slots=max_t1_slots,
    )
