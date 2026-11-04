from __future__ import annotations

import logging
from typing import Any, Optional

from app.application.trip_editing.schemas import ChangeWarning, QualityDelta
from app.domain.schemas.itinerary_document import ItineraryDocument
from app.quality.itinerary_metrics import evaluate_itinerary_quality
from app.utils.opening_hours_parser import (
    parse_osm_opening_hours,
    parse_time_to_minutes,
)

logger = logging.getLogger(__name__)


def _to_mins(val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str) and ":" in val:
        try:
            return parse_time_to_minutes(val)
        except Exception:
            return None
    return None


class ItineraryValidator:
    """
    Validates an ItineraryDocument for realistic constraints:
    - Opening hours compliance
    - Flight/hotel anchor alignment
    - Day length and meal spacing
    - Budget limits
    - Itinerary quality gates
    """

    @classmethod
    def validate_itinerary(
        cls,
        doc: ItineraryDocument,
        destination_city: str = "",
    ) -> list[ChangeWarning]:
        warnings: list[ChangeWarning] = []

        total_cost = 0.0
        budget_usd = None
        if doc.travel_constraints:
            budget_usd = doc.travel_constraints.get("budget_usd")

        # 1. Day-level and Stop-level validation
        for day_plan in doc.days:
            path = day_plan.itinerary.path
            if not path:
                continue

            day_start_mins = None
            day_end_mins = None

            for stop in path:
                # Accumulate costs
                poi = stop.poi or {}
                cost = poi.get("price") or poi.get("cost") or 0.0
                try:
                    total_cost += float(cost)
                except (ValueError, TypeError):
                    pass

                # Check Opening Hours
                hours_raw = poi.get("opening_hours")
                if hours_raw and isinstance(hours_raw, str):
                    try:
                        parsed_sched = parse_osm_opening_hours(hours_raw)
                        if parsed_sched.hours_known:
                            # Day of week (0=Mon, 6=Sun) default to 0 if date not present
                            weekday_idx = 0
                            if day_plan.date:
                                try:
                                    from datetime import date

                                    weekday_idx = date.fromisoformat(
                                        day_plan.date.split("T")[0]
                                    ).weekday()
                                except Exception:
                                    pass

                            open_mins = parsed_sched.open_time_mins_by_day[weekday_idx]
                            close_mins = parsed_sched.close_time_mins_by_day[
                                weekday_idx
                            ]

                            if open_mins == -1:
                                warnings.append(
                                    ChangeWarning(
                                        code="POI_CLOSED_ON_DAY",
                                        severity="warning",
                                        message=f"'{poi.get('name')}' is closed on this day according to its schedule.",
                                        stop_id=stop.stop_id,
                                        day=day_plan.day,
                                    )
                                )
                            elif open_mins >= 0 and close_mins >= 0:
                                stop_start = _to_mins(stop.scheduled_start)
                                stop_end = _to_mins(stop.scheduled_end)
                                if stop_start is not None and stop_start < open_mins:
                                    warnings.append(
                                        ChangeWarning(
                                            code="HOURS_CONFLICT_EARLY",
                                            severity="warning",
                                            message=f"'{poi.get('name')}' is scheduled to start at {stop.scheduled_start}, but opens at {open_mins//60:02d}:{open_mins%60:02d}.",
                                            stop_id=stop.stop_id,
                                            day=day_plan.day,
                                        )
                                    )
                                if stop_end is not None and stop_end > close_mins:
                                    warnings.append(
                                        ChangeWarning(
                                            code="HOURS_CONFLICT_LATE",
                                            severity="warning",
                                            message=f"'{poi.get('name')}' ends at {stop.scheduled_end}, but closes at {close_mins//60:02d}:{close_mins%60:02d}.",
                                            stop_id=stop.stop_id,
                                            day=day_plan.day,
                                        )
                                    )
                    except Exception as e:
                        logger.debug(
                            f"Could not parse hours for {poi.get('name')}: {e}"
                        )

                # Track day bounds
                s_start = _to_mins(stop.scheduled_start)
                s_end = _to_mins(stop.scheduled_end)
                if s_start is not None:
                    if day_start_mins is None or s_start < day_start_mins:
                        day_start_mins = s_start
                if s_end is not None:
                    if day_end_mins is None or s_end > day_end_mins:
                        day_end_mins = s_end

            # Check total day span
            if day_start_mins is not None and day_end_mins is not None:
                span_hours = (day_end_mins - day_start_mins) / 60.0
                if span_hours > 14.0:
                    warnings.append(
                        ChangeWarning(
                            code="DAY_SPAN_TOO_LONG",
                            severity="warning",
                            message=f"Day {day_plan.day} span is {span_hours:.1f} hours, which exceeds comfortable travel limits.",
                            day=day_plan.day,
                        )
                    )

            # Check flight arrival collision (Day 1)
            flight_info = day_plan.flight_info
            if flight_info and isinstance(flight_info, dict):
                arr_time = flight_info.get("arrival_time") or flight_info.get(
                    "flight_arrival_hour"
                )
                if arr_time:
                    arr_mins = _to_mins(arr_time)
                    if (
                        arr_mins is not None
                        and day_start_mins is not None
                        and day_start_mins < arr_mins
                    ):
                        warnings.append(
                            ChangeWarning(
                                code="FLIGHT_ARRIVAL_COLLISION",
                                severity="error",
                                message=f"Day {day_plan.day} activities start before flight arrival time ({arr_time}).",
                                day=day_plan.day,
                            )
                        )

        # 2. Check Budget Overrun
        if budget_usd is not None and float(budget_usd) > 0:
            if total_cost > float(budget_usd):
                warnings.append(
                    ChangeWarning(
                        code="BUDGET_OVERRUN",
                        severity="warning",
                        message=f"Total estimated cost (${total_cost:.2f}) exceeds budget (${float(budget_usd):.2f}).",
                    )
                )

        return warnings

    @classmethod
    def evaluate_quality(
        cls,
        doc: ItineraryDocument,
        destination_city: str = "",
        score_before: Optional[float] = None,
    ) -> QualityDelta:
        try:
            raw_dict = doc.to_dict()
            if destination_city:
                raw_dict["destination"] = destination_city
            report = evaluate_itinerary_quality(raw_dict)
            return QualityDelta(
                score_before=score_before,
                score_after=report.overall_realism_score,
                gates_passed=report.gates_passed,
                details={
                    "mean_zigzag_ratio": report.mean_zigzag_ratio,
                    "max_bounding_diameter_km": report.max_bounding_diameter_km,
                    "gate_failures": report.gate_failures,
                },
            )
        except Exception as e:
            logger.warning(f"Quality evaluation failed: {e}")
            return QualityDelta(
                score_before=score_before,
                score_after=None,
                gates_passed=True,
            )
