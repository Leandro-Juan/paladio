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

    MONTH_HOLIDAY_KEYWORDS = {
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
        "ph",
        "sh",
        "easter",
    }

    for rule in rules:
        is_closed = any(kw in rule for kw in ["closed", "off"])
        applicable_days: list[int] = []
        working_rule = rule

        # 1. Check all day ranges: e.g. mo-fr, tu-sa, sa-su
        for range_match in re.finditer(r"\b([a-z]{2})\s*-\s*([a-z]{2})\b", rule):
            d_start, d_end = range_match.group(1), range_match.group(2)
            if d_start in DAY_INDEX_MAP and d_end in DAY_INDEX_MAP:
                start_idx = DAY_INDEX_MAP[d_start]
                end_idx = DAY_INDEX_MAP[d_end]
                if start_idx <= end_idx:
                    for d in range(start_idx, end_idx + 1):
                        if d not in applicable_days:
                            applicable_days.append(d)
                else:  # wraps around weekend, e.g. fr-mo
                    for d in list(range(start_idx, 7)) + list(range(end_idx + 1)):
                        if d not in applicable_days:
                            applicable_days.append(d)
                working_rule = working_rule.replace(range_match.group(0), "  ")

        # 2. Check all remaining individual days: e.g. mo, tu, sa, su
        for day_match in re.finditer(r"\b([a-z]{2})\b", working_rule):
            day_str = day_match.group(1)
            if day_str in DAY_INDEX_MAP:
                idx = DAY_INDEX_MAP[day_str]
                if idx not in applicable_days:
                    applicable_days.append(idx)

        has_month_or_holiday = any(
            re.search(rf"\b{m}\b", rule) for m in MONTH_HOLIDAY_KEYWORDS
        )

        # If no specific days mentioned:
        if not applicable_days:
            # Date/holiday closure (e.g. Dec 28-Jan 01 off) should NOT wipe out the weekly schedule!
            if is_closed and has_month_or_holiday:
                continue
            # Seasonal or general time range with no specific day constraints applies to all 7 days
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
                interval = (o_min, c_min)
                for d in applicable_days:
                    if d not in closed_days and interval not in daily_windows[d]:
                        daily_windows[d].append(interval)

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
            daily_windows[d].sort(key=lambda iv: (iv[0], -iv[1]))
            merged: list[tuple[int, int]] = [daily_windows[d][0]]
            for iv in daily_windows[d][1:]:
                prev_start, prev_end = merged[-1]
                if iv[0] <= prev_end:
                    merged[-1] = (prev_start, max(prev_end, iv[1]))
                else:
                    merged.append(iv)
            daily_windows[d] = merged
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
