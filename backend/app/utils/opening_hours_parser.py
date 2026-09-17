import re
from typing import NamedTuple

WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"]
DAY_INDEX_MAP = {day: idx for idx, day in enumerate(WEEKDAYS)}


class ParsedWeeklySchedule(NamedTuple):
    open_time_mins_by_day: list[int]  # Length 7, -1 if closed
    close_time_mins_by_day: list[int]  # Length 7, -1 if closed


def parse_time_to_minutes(time_str: str) -> int:
    """Parses 'HH:MM' or 'H:MM' to minutes elapsed from midnight."""
    parts = time_str.strip().split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return int(parts[0]) * 60


def parse_osm_opening_hours(hours_str: str | None) -> ParsedWeeklySchedule:
    """
    Parses OSM opening_hours syntax into two 7-element vectors representing
    opening and closing minutes for Monday (0) through Sunday (6).
    Closed days are represented as -1.

    Guardrail: If close_mins < open_mins (e.g. 20:00-02:00), normalize by adding 1440
    to close_mins (120 + 1440 = 1560) to prevent time-window violations.
    """
    default_open = [480] * 7  # 08:00
    default_close = [1320] * 7  # 22:00

    if not hours_str or not isinstance(hours_str, str) or not hours_str.strip():
        return ParsedWeeklySchedule(default_open, default_close)

    s = hours_str.strip().lower()

    # 24/7 check
    if "24/7" in s:
        return ParsedWeeklySchedule([0] * 7, [1440] * 7)

    open_vec = [-1] * 7
    close_vec = [-1] * 7
    matched_any = False

    # Split rules separated by semicolon
    rules = [r.strip() for r in s.split(";") if r.strip()]

    for rule in rules:
        # Check if this rule explicitly marks closure
        is_closed = any(kw in rule for kw in ["closed", "off"])

        # Extract days
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
                # Word boundary check for 2-letter day
                if re.search(rf"\b{day_str}\b", rule) and idx not in applicable_days:
                    applicable_days.append(idx)

        # If no specific days mentioned, applies to all 7 days unless already set
        if not applicable_days:
            applicable_days = list(range(7))

        if is_closed:
            for d in applicable_days:
                open_vec[d] = -1
                close_vec[d] = -1
            matched_any = True
            continue

        # Extract time range: e.g. 09:30-18:00, 10:00-20:00
        time_match = re.search(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", rule)
        if time_match:
            o_min = parse_time_to_minutes(time_match.group(1))
            c_min = parse_time_to_minutes(time_match.group(2))

            # Midnight crossing normalization: e.g. 20:00-02:00 -> close = 120 + 1440 = 1560
            if c_min < o_min:
                c_min += 1440

            for d in applicable_days:
                open_vec[d] = o_min
                close_vec[d] = c_min
            matched_any = True

    if not matched_any:
        # Check if single simple time range exists in the entire string
        single_time = re.search(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", s)
        if single_time:
            o_min = parse_time_to_minutes(single_time.group(1))
            c_min = parse_time_to_minutes(single_time.group(2))
            if c_min < o_min:
                c_min += 1440
            return ParsedWeeklySchedule([o_min] * 7, [c_min] * 7)
        return ParsedWeeklySchedule(default_open, default_close)

    # For any days that were not specified in an open schedule:
    # If some days matched, unspecified days might be closed (if explicit days were listed like Tu-Su)
    # or should retain default if all are -1
    if all(v == -1 for v in open_vec):
        return ParsedWeeklySchedule(default_open, default_close)

    return ParsedWeeklySchedule(open_vec, close_vec)
