"""Trip Frame and Daily Capacities for Paladio Itinerary v2.

Constructs explicit DayFrame specifications per calendar day, accounting for
pace preferences, arrival/departure flight buffers, meal windows, and budget shares.
"""

from datetime import date, datetime, timedelta
from typing import Any

from app.engine.currency import eur_to_usd, usd_to_eur
from app.engine.rhythm import RhythmProfile
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
    hotel_check_in_mins: int | None = None
    hotel_check_out_mins: int | None = None

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
    taste_profile: dict[str, Any] | None = None
    prefers_offbeat: bool = False


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

    # Extract hotel check-in / check-out dates and times if available
    hotel_cin_mins: int | None = None
    hotel_cout_mins: int | None = None
    hotel_cin_date: date | None = None
    hotel_cout_date: date | None = None
    if anchors and getattr(anchors, "hotel", None):
        h_anc = anchors.hotel
        hotel_cin_mins = _parse_flight_time_to_minutes(
            getattr(h_anc, "check_in_time", None)
        )
        hotel_cout_mins = _parse_flight_time_to_minutes(
            getattr(h_anc, "check_out_time", None)
        )
        raw_cin_d = getattr(h_anc, "check_in_date", None)
        if raw_cin_d:
            try:
                hotel_cin_date = date.fromisoformat(str(raw_cin_d).split("T")[0])
            except Exception:
                pass
        raw_cout_d = getattr(h_anc, "check_out_date", None)
        if raw_cout_d:
            try:
                hotel_cout_date = date.fromisoformat(str(raw_cout_d).split("T")[0])
            except Exception:
                pass

    days: list[DayFrame] = []
    total_anchors = 0
    tp = getattr(constraints, "taste_profile", None)
    bp = (
        tp.get("behavioral_params")
        if isinstance(tp, dict)
        and tp.get("active_profile_count", 0) > 0
        and isinstance(tp.get("behavioral_params"), dict)
        else {}
    )

    for d in range(num_days):
        is_arr = d == 0
        is_dep = d == (num_days - 1)

        start_time = (
            540
            if pace == PacePreference.LEISURELY
            else (480 if pace == PacePreference.INTENSE else 510)
        )
        end_time = rhythm.evening_cutoff_min if rhythm else 1380  # 23:00 default

        if bp:
            if bp.get("start_time_mins") is not None:
                start_time = int(
                    round(0.5 * start_time + 0.5 * int(bp["start_time_mins"]))
                )
            if bp.get("end_time_mins") is not None:
                end_time = min(end_time, int(bp["end_time_mins"]))

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

        if (
            bp
            and not (is_arr or is_dep)
            and bp.get("preferred_stops_per_day") is not None
        ):
            learned_stops = int(round(float(bp["preferred_stops_per_day"])))
            max_a = max(1, min(6, int(round(0.5 * max_a + 0.5 * learned_stops))))

        total_anchors += max_a

        cal_date = None
        if start_dt:
            cal_date = start_dt + timedelta(days=d)

        # Distribute requested meals across days using local rhythm
        day_meals: list[str] = []
        b_start, _b_end = r.breakfast_window
        l_start, _l_end = r.lunch_window
        d_start, _d_end = r.dinner_window

        if constraints.meals:
            for m in constraints.meals:
                m_type = (
                    m.meal_type
                    if hasattr(m, "meal_type")
                    else (
                        m.get("meal_type") or m.get("type")
                        if isinstance(m, dict)
                        else str(m)
                    )
                ).lower()
                if "breakfast" in m_type:
                    if (
                        not is_arr
                        or arrival_flight_mins is None
                        or start_time <= b_start + 90
                    ) and end_time >= b_start + 30:
                        if "breakfast" not in day_meals:
                            day_meals.append("breakfast")
                            start_time = min(start_time, b_start)
                elif "lunch" in m_type:
                    if start_time <= l_start + 60 and end_time >= l_start + 60:
                        if "lunch" not in day_meals:
                            day_meals.append("lunch")
                elif "dinner" in m_type:
                    if start_time <= d_start + 90 and end_time >= d_start + 60:
                        if "dinner" not in day_meals:
                            day_meals.append("dinner")
                else:
                    if m_type not in day_meals:
                        day_meals.append(m_type)
        else:
            if not is_arr and not is_dep:
                # Agency standard full day: 3 distinct meals
                day_meals = ["breakfast", "lunch", "dinner"]
                start_time = min(start_time, b_start)
            elif is_arr and is_dep:
                # Single day trip
                meals_single = []
                if (
                    arrival_flight_mins is None or start_time <= b_start + 90
                ) and end_time >= b_start + 90:
                    meals_single.append("breakfast")
                    start_time = min(start_time, b_start)
                if start_time <= l_start + 60 and end_time >= l_start + 60:
                    meals_single.append("lunch")
                if start_time <= d_start + 60 and end_time >= d_start + 60:
                    meals_single.append("dinner")
                day_meals = meals_single or ["lunch"]
            elif is_arr:
                meals_arr = []
                if (
                    arrival_flight_mins is None or start_time <= b_start + 90
                ) and end_time >= b_start + 90:
                    meals_arr.append("breakfast")
                    start_time = min(start_time, b_start)
                if start_time <= l_start + 60:
                    meals_arr.append("lunch")
                if start_time <= d_start + 90:
                    meals_arr.append("dinner")
                day_meals = meals_arr
            elif is_dep:
                meals_dep = []
                if end_time >= b_start + 90:
                    meals_dep.append("breakfast")
                    start_time = min(start_time, b_start)
                if end_time >= l_start + 60:
                    meals_dep.append("lunch")
                if end_time >= d_start + 60:
                    meals_dep.append("dinner")
                day_meals = meals_dep

        # When dinner is scheduled, extend end_time to local evening cutoff
        if "dinner" in day_meals and not (is_dep and departure_flight_mins is not None):
            end_time = max(end_time, r.evening_cutoff_min, 1350)

        is_cin_day = (
            (cal_date == hotel_cin_date)
            if (cal_date is not None and hotel_cin_date is not None)
            else (is_arr and hotel_cin_mins is not None)
        )
        is_cout_day = (
            (cal_date == hotel_cout_date)
            if (cal_date is not None and hotel_cout_date is not None)
            else (is_dep and hotel_cout_mins is not None)
        )

        day_cin_mins = hotel_cin_mins if is_cin_day else None
        day_cout_mins = hotel_cout_mins if is_cout_day else None

        if day_cin_mins is not None and not (
            is_dep and departure_flight_mins is not None
        ):
            end_time = max(end_time, day_cin_mins)

        if day_cout_mins is not None:
            start_time = min(start_time, day_cout_mins)
        if is_dep and departure_flight_mins is not None:
            start_time = min(start_time, max(360, departure_flight_mins - 180))
        if start_time > end_time:
            end_time = min(1440, start_time + 60)

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
                hotel_check_in_mins=day_cin_mins,
                hotel_check_out_mins=day_cout_mins,
            )
        )

    prefers_offbeat = bool(getattr(constraints, "prefers_offbeat", False))
    n_days = max(1, len(days))
    # Duration-decaying anchor cap for Tier 1 iconic POIs
    # Short trips allow high iconic density; long trips reserve slots for neighborhood discovery
    if prefers_offbeat:
        max_t1_slots = min(total_anchors, max(1, min(3, int(0.35 * total_anchors))))
    else:
        if n_days <= 2:
            max_t1_slots = total_anchors
        elif n_days <= 4:
            max_t1_slots = min(total_anchors, max(2, int(0.80 * total_anchors)))
        elif n_days <= 7:
            max_t1_slots = min(total_anchors, max(3, int(0.65 * total_anchors)))
        else:
            max_t1_slots = min(total_anchors, max(4, int(0.55 * total_anchors)))

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
        taste_profile=tp if isinstance(tp, dict) else None,
        prefers_offbeat=prefers_offbeat,
    )
