from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any, Optional

from app.application.trip_editing.schemas import Change, ChangeSet
from app.domain.schemas.itinerary_document import (
    DayItinerary,
    DayPlan,
    ItineraryDocument,
    Stop,
)


class ItineraryEditor:
    """
    Pure operations on ItineraryDocument.
    Manipulates stops, days, durations, and constraints without direct database I/O.
    Returns structured ChangeSet for each modification.
    """

    @staticmethod
    def _find_day(doc: ItineraryDocument, day_num: int) -> tuple[int, DayPlan]:
        for idx, d in enumerate(doc.days):
            if d.day == day_num:
                return idx, d
        raise ValueError(
            f"Day {day_num} not found. Trip has days: {[d.day for d in doc.days]}"
        )

    @classmethod
    def add_stop(
        cls,
        doc: ItineraryDocument,
        day: int,
        poi: dict[str, Any],
        after_stop_id: Optional[str] = None,
        duration_mins: int = 60,
        custom_stop: bool = False,
        notes: Optional[str] = None,
        scheduled_start: Optional[int | str] = None,
    ) -> tuple[ChangeSet, Stop]:
        _, day_plan = cls._find_day(doc, day)
        new_stop_id = str(uuid.uuid4())
        stop = Stop(
            stop_id=new_stop_id,
            poi=poi,
            duration=duration_mins,
            custom_stop=custom_stop,
            notes=notes,
            scheduled_start=scheduled_start,
        )

        insert_idx = len(day_plan.itinerary.path)
        if after_stop_id:
            for idx, s in enumerate(day_plan.itinerary.path):
                if s.stop_id == after_stop_id:
                    insert_idx = idx + 1
                    break

        day_plan.itinerary.path.insert(insert_idx, stop)

        poi_name = poi.get("name") or "New Stop"
        summary = f"Added '{poi_name}' to Day {day}."
        changes = [
            Change(
                kind="add_stop",
                day=day,
                stop_id=new_stop_id,
                before=None,
                after=stop.model_dump(mode="json"),
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes), stop

    @classmethod
    def remove_stop(cls, doc: ItineraryDocument, stop_id: str) -> ChangeSet:
        for day_plan in doc.days:
            for idx, s in enumerate(day_plan.itinerary.path):
                if s.stop_id == stop_id:
                    removed_stop = day_plan.itinerary.path.pop(idx)
                    # If stop was in locked_stops, remove it
                    if day_plan.locked_stops and stop_id in day_plan.locked_stops:
                        day_plan.locked_stops.remove(stop_id)

                    poi_name = removed_stop.poi.get("name") or "stop"
                    summary = f"Removed '{poi_name}' from Day {day_plan.day}."
                    changes = [
                        Change(
                            kind="remove_stop",
                            day=day_plan.day,
                            stop_id=stop_id,
                            before=removed_stop.model_dump(mode="json"),
                            after=None,
                        )
                    ]
                    return ChangeSet(ok=True, summary=summary, changes=changes)
        raise ValueError(f"Stop with ID '{stop_id}' not found in any day of itinerary.")

    @classmethod
    def move_stop(
        cls,
        doc: ItineraryDocument,
        stop_id: str,
        to_day: int,
        after_stop_id: Optional[str] = None,
    ) -> ChangeSet:
        # 1. Locate and remove stop from current day
        source_day = None
        target_stop: Optional[Stop] = None
        for day_plan in doc.days:
            for idx, s in enumerate(day_plan.itinerary.path):
                if s.stop_id == stop_id:
                    source_day = day_plan.day
                    target_stop = day_plan.itinerary.path.pop(idx)
                    if day_plan.locked_stops and stop_id in day_plan.locked_stops:
                        day_plan.locked_stops.remove(stop_id)
                    break
            if target_stop:
                break

        if not target_stop or source_day is None:
            raise ValueError(f"Stop '{stop_id}' not found.")

        # 2. Insert into destination day
        _, dest_day_plan = cls._find_day(doc, to_day)
        insert_idx = len(dest_day_plan.itinerary.path)
        if after_stop_id:
            for idx, s in enumerate(dest_day_plan.itinerary.path):
                if s.stop_id == after_stop_id:
                    insert_idx = idx + 1
                    break

        dest_day_plan.itinerary.path.insert(insert_idx, target_stop)

        poi_name = target_stop.poi.get("name") or "Stop"
        summary = f"Moved '{poi_name}' from Day {source_day} to Day {to_day}."
        changes = [
            Change(
                kind="move_stop",
                day=to_day,
                stop_id=stop_id,
                before={"day": source_day},
                after={"day": to_day, "position": insert_idx},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def reorder_day(
        cls, doc: ItineraryDocument, day: int, ordered_stop_ids: list[str]
    ) -> ChangeSet:
        _, day_plan = cls._find_day(doc, day)
        current_stops = {s.stop_id: s for s in day_plan.itinerary.path}

        missing_ids = set(current_stops.keys()) - set(ordered_stop_ids)
        if missing_ids:
            raise ValueError(
                f"ordered_stop_ids is missing existing stops from Day {day}: {list(missing_ids)}"
            )

        new_path = []
        for sid in ordered_stop_ids:
            if sid in current_stops:
                new_path.append(current_stops[sid])
            else:
                raise ValueError(f"Stop '{sid}' is not currently in Day {day}.")

        day_plan.itinerary.path = new_path
        summary = f"Reordered stops for Day {day}."
        changes = [
            Change(
                kind="reorder_day",
                day=day,
                before={"ordered_ids": list(current_stops.keys())},
                after={"ordered_ids": ordered_stop_ids},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def swap_days(cls, doc: ItineraryDocument, day_a: int, day_b: int) -> ChangeSet:
        idx_a, plan_a = cls._find_day(doc, day_a)
        idx_b, plan_b = cls._find_day(doc, day_b)

        # Swap itineraries
        plan_a.itinerary, plan_b.itinerary = plan_b.itinerary, plan_a.itinerary
        plan_a.locked_stops, plan_b.locked_stops = (
            plan_b.locked_stops,
            plan_a.locked_stops,
        )

        summary = f"Swapped itinerary between Day {day_a} and Day {day_b}."
        changes = [
            Change(kind="swap_days", day=day_a, after={"swapped_with": day_b}),
            Change(kind="swap_days", day=day_b, after={"swapped_with": day_a}),
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def set_stop_time(
        cls,
        doc: ItineraryDocument,
        stop_id: str,
        scheduled_start: int | str,
        scheduled_end: Optional[int | str] = None,
        lock: bool = True,
    ) -> ChangeSet:
        d_idx, s_idx, stop = doc.find_stop(stop_id)
        if not stop or d_idx is None:
            raise ValueError(f"Stop '{stop_id}' not found.")

        day_plan = doc.days[d_idx]
        before_time = {
            "scheduled_start": stop.scheduled_start,
            "scheduled_end": stop.scheduled_end,
            "is_locked": stop.is_locked,
        }

        stop.scheduled_start = scheduled_start
        if scheduled_end is not None:
            stop.scheduled_end = scheduled_end
        if lock:
            stop.is_locked = True
            if day_plan.locked_stops is None:
                day_plan.locked_stops = []
            if stop_id not in day_plan.locked_stops:
                day_plan.locked_stops.append(stop_id)

        poi_name = stop.poi.get("name") or "Stop"
        summary = f"Set time window for '{poi_name}' on Day {day_plan.day} to {scheduled_start}."
        changes = [
            Change(
                kind="set_stop_time",
                day=day_plan.day,
                stop_id=stop_id,
                before=before_time,
                after={
                    "scheduled_start": stop.scheduled_start,
                    "scheduled_end": stop.scheduled_end,
                    "is_locked": stop.is_locked,
                },
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def set_stop_duration(
        cls, doc: ItineraryDocument, stop_id: str, duration_mins: int
    ) -> ChangeSet:
        d_idx, _, stop = doc.find_stop(stop_id)
        if not stop or d_idx is None:
            raise ValueError(f"Stop '{stop_id}' not found.")

        before_dur = stop.duration
        stop.duration = duration_mins
        day_plan = doc.days[d_idx]

        poi_name = stop.poi.get("name") or "Stop"
        summary = f"Updated duration of '{poi_name}' to {duration_mins} minutes."
        changes = [
            Change(
                kind="set_stop_duration",
                day=day_plan.day,
                stop_id=stop_id,
                before={"duration": before_dur},
                after={"duration": duration_mins},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def lock_stop(
        cls, doc: ItineraryDocument, stop_id: str, locked: bool = True
    ) -> ChangeSet:
        d_idx, _, stop = doc.find_stop(stop_id)
        if not stop or d_idx is None:
            raise ValueError(f"Stop '{stop_id}' not found.")

        day_plan = doc.days[d_idx]
        stop.is_locked = locked
        if day_plan.locked_stops is None:
            day_plan.locked_stops = []

        if locked and stop_id not in day_plan.locked_stops:
            day_plan.locked_stops.append(stop_id)
        elif not locked and stop_id in day_plan.locked_stops:
            day_plan.locked_stops.remove(stop_id)

        poi_name = stop.poi.get("name") or "Stop"
        action = "Locked" if locked else "Unlocked"
        summary = f"{action} stop '{poi_name}' on Day {day_plan.day}."
        changes = [
            Change(
                kind="lock_stop",
                day=day_plan.day,
                stop_id=stop_id,
                after={"is_locked": locked},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def add_meal(
        cls,
        doc: ItineraryDocument,
        day: int,
        meal_type: str,
        scheduled_start: Optional[int | str] = None,
        duration_mins: int = 60,
        name: Optional[str] = None,
    ) -> tuple[ChangeSet, Stop]:
        meal_title = name or f"{meal_type.capitalize()} Break"
        poi = {
            "id": f"custom_meal_{uuid.uuid4().hex[:6]}",
            "name": meal_title,
            "category": "restaurant",
            "meal_type": meal_type.upper(),
        }
        return cls.add_stop(
            doc,
            day=day,
            poi=poi,
            duration_mins=duration_mins,
            custom_stop=True,
            notes=f"Scheduled {meal_type.lower()}",
            scheduled_start=scheduled_start,
        )

    @classmethod
    def add_free_time(
        cls,
        doc: ItineraryDocument,
        day: int,
        duration_mins: int = 60,
        after_stop_id: Optional[str] = None,
    ) -> tuple[ChangeSet, Stop]:
        poi = {
            "id": f"free_time_{uuid.uuid4().hex[:6]}",
            "name": "Free Time & Exploration",
            "category": "free_time",
        }
        return cls.add_stop(
            doc,
            day=day,
            poi=poi,
            after_stop_id=after_stop_id,
            duration_mins=duration_mins,
            custom_stop=True,
        )

    @classmethod
    def set_stop_notes(
        cls, doc: ItineraryDocument, stop_id: str, notes: str
    ) -> ChangeSet:
        d_idx, _, stop = doc.find_stop(stop_id)
        if not stop or d_idx is None:
            raise ValueError(f"Stop '{stop_id}' not found.")

        before_notes = stop.notes
        stop.notes = notes
        day_plan = doc.days[d_idx]
        poi_name = stop.poi.get("name") or "Stop"
        summary = f"Updated notes for '{poi_name}'."
        changes = [
            Change(
                kind="set_stop_notes",
                day=day_plan.day,
                stop_id=stop_id,
                before={"notes": before_notes},
                after={"notes": notes},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def add_day(cls, doc: ItineraryDocument, date: Optional[str] = None) -> ChangeSet:
        next_day_num = max([d.day for d in doc.days], default=0) + 1
        new_day = DayPlan(day=next_day_num, date=date, itinerary=DayItinerary(path=[]))
        doc.days.append(new_day)
        summary = f"Added Day {next_day_num} to itinerary."
        changes = [
            Change(
                kind="add_day",
                day=next_day_num,
                after={"day": next_day_num, "date": date},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def remove_day(cls, doc: ItineraryDocument, day: int) -> ChangeSet:
        if len(doc.days) <= 1:
            raise ValueError("Cannot remove the only day in an itinerary.")

        idx, removed_day = cls._find_day(doc, day)
        doc.days.pop(idx)

        # Renumber remaining days to maintain contiguous indexing
        for i, d in enumerate(doc.days):
            d.day = i + 1

        summary = f"Removed Day {day} and renumbered remaining {len(doc.days)} days."
        changes = [
            Change(
                kind="remove_day", day=day, before=removed_day.model_dump(mode="json")
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def set_day_bounds(
        cls,
        doc: ItineraryDocument,
        day: int,
        start_time: Optional[int | str] = None,
        end_time: Optional[int | str] = None,
    ) -> ChangeSet:
        _, day_plan = cls._find_day(doc, day)
        if day_plan.hotel_depot is None:
            day_plan.hotel_depot = {}

        if start_time is not None:
            day_plan.hotel_depot["start_time"] = start_time
        if end_time is not None:
            day_plan.hotel_depot["end_time"] = end_time

        summary = f"Set Day {day} operating bounds: start={start_time}, end={end_time}."
        changes = [Change(kind="set_day_bounds", day=day, after=day_plan.hotel_depot)]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @classmethod
    def set_pace(cls, doc: ItineraryDocument, pace: str) -> ChangeSet:
        normalized_pace = pace.lower().strip()
        if normalized_pace not in (
            "leisurely",
            "relaxed",
            "balanced",
            "intense",
            "fast",
        ):
            raise ValueError(
                f"Invalid pace '{pace}'. Must be leisurely, balanced, or intense."
            )

        if doc.travel_constraints is None:
            doc.travel_constraints = {}
        before_pace = doc.travel_constraints.get("pace")
        doc.travel_constraints["pace"] = normalized_pace

        summary = f"Updated travel pace from '{before_pace}' to '{normalized_pace}'."
        changes = [
            Change(
                kind="set_pace",
                day=0,
                before={"pace": before_pace},
                after={"pace": normalized_pace},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes)

    @staticmethod
    def _shift_iso_date(val: Any, delta_days: int) -> Any:
        if not isinstance(val, str) or len(val) < 10:
            return val
        try:
            parsed = date.fromisoformat(val[:10])
            shifted = (parsed + timedelta(days=delta_days)).isoformat()
            return shifted + val[10:]
        except ValueError:
            return val

    @classmethod
    def shift_trip_dates(
        cls,
        doc: ItineraryDocument,
        new_start_date: str,
        old_start_date: Optional[str] = None,
    ) -> tuple[ChangeSet, int]:
        """Shifts all itinerary days, travel constraints, and lodging dates to a new start date."""
        new_start = date.fromisoformat(new_start_date[:10])
        base_str: Optional[str] = old_start_date
        if not base_str and doc.travel_constraints:
            base_str = doc.travel_constraints.get("start_date")
        if not base_str and doc.days and doc.days[0].date:
            base_str = doc.days[0].date

        if base_str:
            base_start = date.fromisoformat(str(base_str)[:10])
        else:
            base_start = new_start

        delta_days = (new_start - base_start).days
        new_end = new_start + timedelta(days=max(0, len(doc.days) - 1))

        if doc.travel_constraints is None:
            doc.travel_constraints = {}
        doc.travel_constraints["start_date"] = new_start.isoformat()
        doc.travel_constraints["end_date"] = new_end.isoformat()

        for key in ("hotel",):
            nested = doc.travel_constraints.get(key)
            if isinstance(nested, dict):
                for df in ("check_in_date", "check_out_date", "date"):
                    if df in nested:
                        nested[df] = cls._shift_iso_date(nested[df], delta_days)

        for idx, day_plan in enumerate(doc.days):
            day_plan.date = (new_start + timedelta(days=idx)).isoformat()
            for container_name in ("lodging", "hotel_depot"):
                container = getattr(day_plan, container_name, None)
                if isinstance(container, dict):
                    for df in (
                        "check_in",
                        "check_out",
                        "check_in_date",
                        "check_out_date",
                        "date",
                    ):
                        if df in container:
                            container[df] = cls._shift_iso_date(
                                container[df], delta_days
                            )

        summary = f"Shifted trip dates by {delta_days:+d} days to start on {new_start.isoformat()}."
        changes = [
            Change(
                kind="shift_trip_dates",
                day=0,
                before={"start_date": base_start.isoformat()},
                after={"start_date": new_start.isoformat(), "delta_days": delta_days},
            )
        ]
        return ChangeSet(ok=True, summary=summary, changes=changes), delta_days

    @classmethod
    def regenerate_stop_ids(cls, doc: ItineraryDocument) -> None:
        """Assigns fresh UUIDs to all stops in the document (used when duplicating a trip)."""
        for day_plan in doc.days:
            id_map: dict[str, str] = {}
            for stop in day_plan.itinerary.path:
                old_id = stop.stop_id
                new_id = str(uuid.uuid4())
                stop.stop_id = new_id
                if old_id:
                    id_map[old_id] = new_id
            if day_plan.locked_stops:
                day_plan.locked_stops = [
                    id_map.get(s, s) for s in day_plan.locked_stops
                ]
