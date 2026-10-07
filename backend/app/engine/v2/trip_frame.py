"""Trip Frame and Daily Capacities for Paladio Itinerary v2.

Constructs explicit DayFrame specifications per calendar day, accounting for
pace preferences, arrival/departure flight buffers, meal windows, and budget shares.
"""

from datetime import date, datetime, timedelta
from typing import Any

from app.engine.v2.currency import eur_to_usd, usd_to_eur
from app.engine.v2.rhythm import RhythmProfile
from app.schemas.itinerary import TravelConstraints
from app.schemas.user import PacePreference
from pydantic import BaseModel, Field

__all__ = [
    "DayFrame",
    "TripFrame",
    "build_trip_frame",
    "eur_to_usd",
    "usd_to_eur",
]


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
    tag_affinities: dict[str, float] = Field(default_factory=dict)
    travel_tastes: list[str] = Field(default_factory=list)
    rhythm: RhythmProfile = Field(default_factory=RhythmProfile)
    city_center: tuple[float, float] | None = None


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
    except (ValueError, IndexError):
        return None
    return None


def build_trip_frame(
    constraints: TravelConstraints,
    outbound_flight: Any = None,
    return_flight: Any = None,
    city_center: tuple[float, float] | None = None,
    fx_rate: float | None = None,
    rhythm: RhythmProfile | None = None,
) -> TripFrame:
    """Builds a deterministic TripFrame from user TravelConstraints.

    `city_center` supplies the default depot for cities outside the built-in table.
    """
    raw_city = getattr(constraints, "destination_city", None) or getattr(
        constraints, "city", None
    )
    if not raw_city or not raw_city.strip():
        raise ValueError("destination_city must be specified in constraints.")
    city = raw_city.strip()
    pace = constraints.pace or PacePreference.BALANCED
    r = rhythm or RhythmProfile()

    # Calculate number of days
    num_days = 3
    start_dt = constraints.start_date
    if constraints.start_date and constraints.end_date:
        delta = (constraints.end_date - constraints.start_date).days + 1
        num_days = max(1, delta)
    elif hasattr(constraints, "days") and getattr(constraints, "days", None):
        num_days = max(1, int(constraints.days))

    total_budget_usd = float(constraints.budget_usd or 0.0)
    total_budget_eur = usd_to_eur(total_budget_usd, rate=fx_rate)
    daily_budget_eur = round(total_budget_eur / num_days, 2) if num_days > 0 else 0.0

    if city_center is None:
        raise ValueError(
            f"No depot coordinates for '{city}': pass city_center (dynamically derived from its POIs)."
        )
    default_depot = {
        "name": f"{city} Center Base",
        "latitude": city_center[0],
        "longitude": city_center[1],
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
    if outbound_flight and arrival_flight_mins is None:
        arr_t = (
            outbound_flight.get("arrival_time")
            if isinstance(outbound_flight, dict)
            else getattr(outbound_flight, "arrival_time", None)
        )
        if arr_t:
            arrival_flight_mins = _parse_flight_time_to_minutes(arr_t)
    if return_flight and departure_flight_mins is None:
        dep_t = (
            return_flight.get("departure_time")
            if isinstance(return_flight, dict)
            else getattr(return_flight, "departure_time", None)
        )
        if dep_t:
            departure_flight_mins = _parse_flight_time_to_minutes(dep_t)

    days: list[DayFrame] = []
    total_anchors = 0

    for d in range(num_days):
        is_arr = d == 0
        is_dep = d == (num_days - 1)

        start_time = (
            600
            if pace == PacePreference.LEISURELY
            else (510 if pace == PacePreference.INTENSE else 540)
        )
        end_time = rhythm.evening_cutoff_min if rhythm else 1380  # 23:00 default

        # Arrival day window shrink (flight arrival + 120m buffer)
        if is_arr and arrival_flight_mins is not None:
            buffered_start = arrival_flight_mins + 120
            start_time = max(start_time, min(1200, buffered_start))

        # Departure day window shrink (flight departure - 180m buffer)
        if is_dep and departure_flight_mins is not None:
            buffered_end = departure_flight_mins - 180
            end_time = min(end_time, max(start_time + 120, buffered_end))

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

        # Distribute requested meals across days using local rhythm
        day_meals: list[str] = []
        if constraints.meals:
            for m in constraints.meals:
                m_type = m.meal_type.lower()
                if m_type not in day_meals:
                    day_meals.append(m_type)
        else:
            l_start, _l_end = r.lunch_window
            d_start, _d_end = r.dinner_window

            if not is_arr and not is_dep:
                # Agency standard full day: lunch and dinner
                day_meals = ["lunch", "dinner"]
            elif is_arr and is_dep:
                # Single day trip
                meals_single = []
                if start_time <= l_start + 60 and end_time >= l_start + 60:
                    meals_single.append("lunch")
                if start_time <= d_start + 60 and end_time >= d_start + 60:
                    meals_single.append("dinner")
                day_meals = meals_single or ["lunch"]
            elif is_arr:
                meals_arr = []
                if start_time <= l_start + 60:
                    meals_arr.append("lunch")
                if start_time <= d_start + 90:
                    meals_arr.append("dinner")
                day_meals = meals_arr
            elif is_dep:
                meals_dep = []
                if end_time >= l_start + 60:
                    meals_dep.append("lunch")
                if end_time >= d_start + 60:
                    meals_dep.append("dinner")
                day_meals = meals_dep

        # When dinner is scheduled, extend end_time to local evening cutoff
        if "dinner" in day_meals and not (is_dep and departure_flight_mins is not None):
            end_time = max(end_time, r.evening_cutoff_min)

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
        tag_affinities=dict(constraints.tag_affinities or {}),
        travel_tastes=list(constraints.travel_tastes or []),
        rhythm=r,
        city_center=city_center,
    )
