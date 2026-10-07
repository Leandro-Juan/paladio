"""Data-Driven Local Day Rhythm & Dining Windows for Paladio Itinerary v2.

Computes a RhythmProfile from empirical dining-venue opening-hours distributions
in the destination city. Eliminates hardcoded meal times and replaces them
with real, data-driven local customs (e.g. late Spanish dinners vs earlier Nordic dinners).
Zero hardcoded city tables.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from statistics import median

from app.domain.entities.poi import Poi
from app.engine.v2.candidate_pool import CandidatePoi
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class RhythmProfile(BaseModel):
    """Local circadian rhythm and dining windows for a city."""

    breakfast_window: tuple[int, int] = (480, 630)  # 08:00 - 10:30
    lunch_window: tuple[int, int] = (720, 930)  # 12:00 - 15:30
    dinner_window: tuple[int, int] = (1170, 1410)  # 19:30 - 23:30
    lunch_peak_min: int = 810  # 13:30
    dinner_peak_min: int = 1260  # 21:00
    evening_cutoff_min: int = 1380  # 23:00
    is_empirical: bool = False
    sample_size: int = 0


def _parse_time_str_to_mins(t_str: str) -> int:
    parts = t_str.strip().split(":")
    if len(parts) >= 2:
        return int(parts[0]) * 60 + int(parts[1])
    return int(parts[0]) * 60


def compute_city_rhythm_profile(
    dining_venues: Sequence[CandidatePoi | Poi],
    default_rhythm: RhythmProfile | None = None,
) -> RhythmProfile:
    """Computes a RhythmProfile from the opening/closing hour distributions
    of dining venues in a city.
    """
    if not dining_venues:
        return default_rhythm or RhythmProfile()

    lunch_starts: list[int] = []
    lunch_ends: list[int] = []
    dinner_starts: list[int] = []
    dinner_ends: list[int] = []
    breakfast_starts: list[int] = []
    breakfast_ends: list[int] = []

    time_range_regex = re.compile(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})")

    for v in dining_venues:
        raw_hours = getattr(v, "osm_opening_hours", None)
        if not raw_hours and hasattr(v, "metadata") and isinstance(v.metadata, dict):
            raw_hours = v.metadata.get("osm_opening_hours") or v.metadata.get(
                "opening_hours"
            )

        found_intervals = False
        if raw_hours and isinstance(raw_hours, str):
            matches = time_range_regex.findall(raw_hours)
            if matches:
                found_intervals = True
                for start_s, end_s in matches:
                    s_min = _parse_time_str_to_mins(start_s)
                    e_min = _parse_time_str_to_mins(end_s)
                    if e_min < s_min:
                        e_min += 1440

                    if s_min <= 630 and e_min <= 840:
                        breakfast_starts.append(s_min)
                        breakfast_ends.append(e_min)
                    elif 660 <= s_min <= 960:
                        lunch_starts.append(s_min)
                        lunch_ends.append(min(960, e_min))
                    elif 1020 <= s_min or e_min >= 1260:
                        dinner_starts.append(s_min if s_min >= 1020 else 1170)
                        dinner_ends.append(e_min)

        if not found_intervals:
            open_days = getattr(v, "open_time_mins_by_day", None) or []
            close_days = getattr(v, "close_time_mins_by_day", None) or []
            for d in range(min(len(open_days), len(close_days))):
                o = open_days[d]
                c = close_days[d]
                if o == -1 or c == -1:
                    continue
                if c < o:
                    c += 1440

                if 660 <= o <= 900:
                    lunch_starts.append(o)
                    lunch_ends.append(min(960, c))
                if c >= 1260:
                    dinner_service_start = o if o >= 1080 else 1170
                    dinner_starts.append(dinner_service_start)
                    dinner_ends.append(c)

    if len(lunch_starts) >= 3 and len(dinner_starts) >= 3:
        l_start = int(median(lunch_starts))
        l_end = int(median(lunch_ends))
        d_start = int(median(dinner_starts))
        d_end = int(median(dinner_ends))

        l_start = max(660, min(840, l_start))
        l_end = max(l_start + 60, min(960, l_end))
        d_start = max(1020, min(1320, d_start))
        d_end = max(d_start + 60, min(1440, d_end))

        l_peak = (l_start + l_end) // 2
        d_peak = (d_start + d_end) // 2
        cutoff = min(1440, max(1380, d_end))

        b_window = (480, 630)
        if breakfast_starts and breakfast_ends:
            b_s = max(420, min(600, int(median(breakfast_starts))))
            b_e = max(b_s + 45, min(720, int(median(breakfast_ends))))
            b_window = (b_s, b_e)

        return RhythmProfile(
            breakfast_window=b_window,
            lunch_window=(l_start, l_end),
            dinner_window=(d_start, d_end),
            lunch_peak_min=l_peak,
            dinner_peak_min=d_peak,
            evening_cutoff_min=cutoff,
            is_empirical=True,
            sample_size=len(lunch_starts) + len(dinner_starts),
        )

    return default_rhythm or RhythmProfile()


def get_meal_time_window(
    slot: str,
    rhythm: RhythmProfile | None = None,
) -> tuple[int, int]:
    """Retrieves the start/end minutes for a specified meal slot."""
    r = rhythm or RhythmProfile()
    slot_lower = slot.lower().strip()
    if slot_lower == "breakfast":
        return r.breakfast_window
    elif slot_lower == "dinner":
        return r.dinner_window
    return r.lunch_window
