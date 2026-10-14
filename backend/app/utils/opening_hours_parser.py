"""Deterministic parser for OpenStreetMap opening_hours syntax.

Extracts multi-interval schedules (split lunch/dinner windows), supports sunrise/sunset,
and flags unparseable or missing schedules with UNKNOWN_TIME_SENTINEL = -2 to prevent
hallucinated 08:00-22:00 assumptions.
"""

from __future__ import annotations

import re
from typing import NamedTuple

WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"]
DAY_INDEX_MAP = {day: idx for idx, day in enumerate(WEEKDAYS)}

UNKNOWN_TIME_SENTINEL = -2  # -1 = Explicitly Closed on this weekday; -2 = Hours Unknown
SUNRISE_MINS = 390  # 06:30
SUNSET_MINS = 1140  # 19:00


class ParsedWeeklySchedule(NamedTuple):
    open_time_mins_by_day: list[int]  # Length 7, -1 if closed, -2 if unknown
    close_time_mins_by_day: list[int]  # Length 7, -1 if closed, -2 if unknown
    daily_windows: list[
        list[tuple[int, int]]
    ]  # All intervals per day, e.g. [[(780, 990), (1200, 1425)], ...]
    hours_known: bool  # False if raw string is None/empty/unparseable
    has_split_hours: bool  # True if any weekday has >= 2 intervals


def parse_time_to_minutes(time_str: str) -> int:
    """Parses 'HH:MM', 'H:MM', 'sunrise', or 'sunset' to minutes elapsed from midnight."""
    t = time_str.strip().lower()
    if t == "sunrise":
        return SUNRISE_MINS
    if t == "sunset":
        return SUNSET_MINS
    parts = t.split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return int(parts[0]) * 60


def parse_osm_opening_hours(hours_str: str | None) -> ParsedWeeklySchedule:
    """Parses OSM opening_hours syntax into multi-interval daily windows and outer bounds.

    Returns UNKNOWN_TIME_SENTINEL (-2) when hours are unknown or unparseable.
    """
    empty_windows: list[list[tuple[int, int]]] = [[] for _ in range(7)]

    if not hours_str or not isinstance(hours_str, str) or not hours_str.strip():
        return ParsedWeeklySchedule(
            open_time_mins_by_day=[-2] * 7,
            close_time_mins_by_day=[-2] * 7,
            daily_windows=empty_windows,
            hours_known=False,
            has_split_hours=False,
        )

    s = hours_str.strip().lower()

    # 24/7 check
    if "24/7" in s:
        windows_24_7 = [[(0, 1440)] for _ in range(7)]
        return ParsedWeeklySchedule(
            open_time_mins_by_day=[0] * 7,
            close_time_mins_by_day=[1440] * 7,
            daily_windows=windows_24_7,
            hours_known=True,
            has_split_hours=False,
        )

    daily_windows: list[list[tuple[int, int]]] = [[] for _ in range(7)]
    closed_days: set[int] = set()
    matched_any = False

    # Split rules separated by semicolon
    rules = [r.strip() for r in s.split(";") if r.strip()]

    for rule in rules:
        is_closed = any(kw in rule for kw in ["closed", "off"])
        applicable_days: list[int] = []

        # Check day range: e.g. mo-fr, tu-sa, sa-su
        range_match = re.search(r"\b([a-z]{2})\s*-\s*([a-z]{2})\b", rule)
        if range_match:
            d_start, d_end = range_match.group(1), range_match.group(2)
            if d_start in DAY_INDEX_MAP and d_end in DAY_INDEX_MAP:
                start_idx = DAY_INDEX_MAP[d_start]
                end_idx = DAY_INDEX_MAP[d_end]
                if start_idx <= end_idx:
                    applicable_days.extend(range(start_idx, end_idx + 1))
                else:  # wraps around weekend, e.g. fr-mo
                    applicable_days.extend(range(start_idx, 7))
                    applicable_days.extend(range(end_idx + 1))

        # Check individual days: e.g. mo, tu, sa
        if not applicable_days:
            for day_str, idx in DAY_INDEX_MAP.items():
                if re.search(rf"\b{day_str}\b", rule) and idx not in applicable_days:
                    applicable_days.append(idx)

        # If no specific days mentioned, applies to all 7 days unless already set
        if not applicable_days:
            applicable_days = list(range(7))

        if is_closed:
            for d in applicable_days:
                closed_days.add(d)
                daily_windows[d] = []
            matched_any = True
            continue

        # Extract all time ranges: e.g. 13:00-16:30, 20:00-23:45 or sunrise-sunset
        time_matches = re.findall(
            r"(sunrise|sunset|\d{1,2}:\d{2})\s*-\s*(sunrise|sunset|\d{1,2}:\d{2})",
            rule,
        )
        if time_matches:
            matched_any = True
            for t_open, t_close in time_matches:
                o_min = parse_time_to_minutes(t_open)
                c_min = parse_time_to_minutes(t_close)
                if c_min < o_min:
                    c_min += 1440
                for d in applicable_days:
                    if d not in closed_days:
                        daily_windows[d].append((o_min, c_min))

    if not matched_any:
        # Check if single simple time range exists in the entire string
        single_matches = re.findall(
            r"(sunrise|sunset|\d{1,2}:\d{2})\s*-\s*(sunrise|sunset|\d{1,2}:\d{2})",
            s,
        )
        if single_matches:
            matched_any = True
            intervals: list[tuple[int, int]] = []
            for t_open, t_close in single_matches:
                o_min = parse_time_to_minutes(t_open)
                c_min = parse_time_to_minutes(t_close)
                if c_min < o_min:
                    c_min += 1440
                intervals.append((o_min, c_min))
            intervals.sort(key=lambda iv: iv[0])
            daily_windows = [list(intervals) for _ in range(7)]
        else:
            return ParsedWeeklySchedule(
                open_time_mins_by_day=[-2] * 7,
                close_time_mins_by_day=[-2] * 7,
                daily_windows=empty_windows,
                hours_known=False,
                has_split_hours=False,
            )

    open_vec = [-2] * 7
    close_vec = [-2] * 7

    for d in range(7):
        if d in closed_days:
            open_vec[d] = -1
            close_vec[d] = -1
        elif daily_windows[d]:
            # Sort windows and remove overlaps if any
            daily_windows[d].sort(key=lambda iv: iv[0])
            open_vec[d] = daily_windows[d][0][0]
            close_vec[d] = daily_windows[d][-1][1]
        elif matched_any:
            # Unspecified day in an explicit schedule -> closed
            open_vec[d] = -1
            close_vec[d] = -1

    has_split = any(len(windows) >= 2 for windows in daily_windows)

    return ParsedWeeklySchedule(
        open_time_mins_by_day=open_vec,
        close_time_mins_by_day=close_vec,
        daily_windows=daily_windows,
        hours_known=matched_any,
        has_split_hours=has_split,
    )
