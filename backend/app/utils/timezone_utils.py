import logging
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.services.airport_service import get_airport_service

logger = logging.getLogger(__name__)


class _IataTimezonesProxy(dict):
    """Backward-compatible proxy mapping IATA codes to IANA timezone strings via AirportService."""

    def __contains__(self, key: object) -> bool:
        if not isinstance(key, str):
            return False
        return get_airport_service().is_valid_iata(key)

    def __getitem__(self, key: str) -> str:
        ap = get_airport_service().get_airport(key)
        if ap and ap.timezone:
            return ap.timezone
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        ap = get_airport_service().get_airport(key)
        if ap and ap.timezone:
            return ap.timezone
        return default


IATA_TIMEZONES = _IataTimezonesProxy()

_CITY_TZ_CACHE: dict[str, str] = {}


def cache_city_timezone(city: str, tz: str) -> None:
    if city and tz:
        _CITY_TZ_CACHE[city.strip().lower()] = tz


def get_timezone_for_city(city: str) -> ZoneInfo:
    """Dynamically resolves ZoneInfo for any destination city."""
    if not city:
        return ZoneInfo("UTC")

    city_clean = city.strip().lower()
    if city_clean in _CITY_TZ_CACHE:
        try:
            return ZoneInfo(_CITY_TZ_CACHE[city_clean])
        except Exception:
            pass

    return ZoneInfo("UTC")


def get_timezone_for_iata(iata_code: str | None) -> ZoneInfo:
    """
    Returns the ZoneInfo for an airport IATA code using AirportService.
    """
    if iata_code:
        return get_airport_service().get_timezone_from_iata(iata_code)
    return ZoneInfo("UTC")


def parse_flexible_datetime(dt_str: str) -> tuple[datetime, str]:
    """
    Parses a date string in various formats:
    - ISO: '2026-09-23T10:00:00' or '2026-09-23T10:00:00Z'
    - Space separated: '2026-09-23 10:00'
    - Time only: '10:00'
    Returns (naive_datetime, format_type).
    """
    clean_str = dt_str.strip().replace("Z", "+00:00")

    # Check if time-only (e.g. "10:00" or "10:00:00")
    if (
        ":" in clean_str
        and "-" not in clean_str
        and "T" not in clean_str
        and "/" not in clean_str
    ):
        parts = clean_str.split(":")
        h = int(parts[0])
        m = int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
        # Use a dummy reference date for time-only
        dt = datetime(2026, 1, 1, h, m, s)
        return dt, "time_only"

    if "T" in clean_str:
        try:
            dt = datetime.fromisoformat(clean_str)
            if dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)
            return dt, "iso"
        except ValueError:
            pass

    if " " in clean_str:
        try:
            dt = datetime.strptime(clean_str, "%Y-%m-%d %H:%M")
            return dt, "space"
        except ValueError:
            try:
                dt = datetime.strptime(clean_str, "%Y-%m-%d %H:%M:%S")
                return dt, "space_sec"
            except ValueError:
                pass

    # Fallback to fromisoformat
    dt = datetime.fromisoformat(clean_str)
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt, "iso"


def calculate_timezone_aware_arrival(
    departure_time_str: str,
    duration_minutes: int,
    origin_iata: str | None = None,
    destination_iata: str | None = None,
) -> str:
    """
    Calculates the destination local arrival time given local departure time,
    flight duration, and origin/destination IATA codes.

    Uses airport timezones to compute:
    arrival_local = departure_local + flight_duration + (dest_offset - origin_offset)

    Preserves the format of departure_time_str (ISO, space, or time-only).
    """
    dep_dt, fmt = parse_flexible_datetime(departure_time_str)
    orig_tz = get_timezone_for_iata(origin_iata)
    dest_tz = get_timezone_for_iata(destination_iata)

    # 1. Local departure to aware datetime in origin timezone
    dep_aware = dep_dt.replace(tzinfo=orig_tz)

    # 2. Add flight duration in absolute time
    arr_aware_orig = dep_aware + timedelta(minutes=duration_minutes)

    # 3. Convert to destination timezone
    arr_aware_dest = arr_aware_orig.astimezone(dest_tz)

    # 4. Extract local destination datetime
    arr_local = arr_aware_dest.replace(tzinfo=None)

    # 5. Format to match departure_time_str style
    if fmt == "time_only":
        return arr_local.strftime("%H:%M")
    elif fmt == "space":
        return arr_local.strftime("%Y-%m-%d %H:%M")
    elif fmt == "space_sec":
        return arr_local.strftime("%Y-%m-%d %H:%M:%S")
    else:
        # iso
        return arr_local.isoformat()
