import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# Common airport IATA code to IANA timezone name
IATA_TIMEZONES: dict[str, str] = {
    # Spain & Portugal
    "MAD": "Europe/Madrid",
    "BCN": "Europe/Madrid",
    "VLC": "Europe/Madrid",
    "SVQ": "Europe/Madrid",
    "AGP": "Europe/Madrid",
    "BIO": "Europe/Madrid",
    "IBZ": "Europe/Madrid",
    "PMI": "Europe/Madrid",
    "LIS": "Europe/Lisbon",
    "OPO": "Europe/Lisbon",
    "FAO": "Europe/Lisbon",
    # France
    "CDG": "Europe/Paris",
    "ORY": "Europe/Paris",
    "BVA": "Europe/Paris",
    "NCE": "Europe/Paris",
    "LYS": "Europe/Paris",
    "MRS": "Europe/Paris",
    "BOD": "Europe/Paris",
    "TLS": "Europe/Paris",
    # UK & Ireland
    "LHR": "Europe/London",
    "LGW": "Europe/London",
    "STN": "Europe/London",
    "LTN": "Europe/London",
    "MAN": "Europe/London",
    "EDI": "Europe/London",
    "GLA": "Europe/London",
    "BHX": "Europe/London",
    "DUB": "Europe/Dublin",
    "SNN": "Europe/Dublin",
    "ORK": "Europe/Dublin",
    # Italy
    "FCO": "Europe/Rome",
    "CIA": "Europe/Rome",
    "MXP": "Europe/Rome",
    "LIN": "Europe/Rome",
    "BGY": "Europe/Rome",
    "VCE": "Europe/Rome",
    "FLR": "Europe/Rome",
    "NAP": "Europe/Rome",
    "BLQ": "Europe/Rome",
    # Germany, Austria, Switzerland
    "BER": "Europe/Berlin",
    "FRA": "Europe/Berlin",
    "MUC": "Europe/Berlin",
    "HAM": "Europe/Berlin",
    "DUS": "Europe/Berlin",
    "CGN": "Europe/Berlin",
    "STR": "Europe/Berlin",
    "VIE": "Europe/Vienna",
    "SZG": "Europe/Vienna",
    "INN": "Europe/Vienna",
    "ZRH": "Europe/Zurich",
    "GVA": "Europe/Zurich",
    "BSL": "Europe/Zurich",
    # Benelux
    "AMS": "Europe/Amsterdam",
    "RTM": "Europe/Amsterdam",
    "EIN": "Europe/Amsterdam",
    "BRU": "Europe/Brussels",
    "CRL": "Europe/Brussels",
    # Nordics & Eastern Europe
    "CPH": "Europe/Copenhagen",
    "ARN": "Europe/Stockholm",
    "OSL": "Europe/Oslo",
    "HEL": "Europe/Helsinki",
    "PRG": "Europe/Prague",
    "WAW": "Europe/Warsaw",
    "KRK": "Europe/Warsaw",
    "BUD": "Europe/Budapest",
    "ATH": "Europe/Athens",
    "IST": "Europe/Istanbul",
    "SAW": "Europe/Istanbul",
    # North America
    "JFK": "America/New_York",
    "EWR": "America/New_York",
    "LGA": "America/New_York",
    "BOS": "America/New_York",
    "PHL": "America/New_York",
    "IAD": "America/New_York",
    "DCA": "America/New_York",
    "ATL": "America/New_York",
    "MIA": "America/New_York",
    "MCO": "America/New_York",
    "CLT": "America/New_York",
    "DTW": "America/New_York",
    "ORD": "America/Chicago",
    "MDW": "America/Chicago",
    "DFW": "America/Chicago",
    "IAH": "America/Chicago",
    "MSP": "America/Chicago",
    "DEN": "America/Denver",
    "SLC": "America/Denver",
    "PHX": "America/Phoenix",
    "LAX": "America/Los_Angeles",
    "SFO": "America/Los_Angeles",
    "SEA": "America/Los_Angeles",
    "SAN": "America/Los_Angeles",
    "PDX": "America/Los_Angeles",
    "LAS": "America/Los_Angeles",
    "YYZ": "America/Toronto",
    "YUL": "America/Toronto",
    "YVR": "America/Vancouver",
    "MEX": "America/Mexico_City",
    # Asia & Middle East
    "DXB": "Asia/Dubai",
    "AUH": "Asia/Dubai",
    "DOH": "Asia/Qatar",
    "HND": "Asia/Tokyo",
    "NRT": "Asia/Tokyo",
    "KIX": "Asia/Tokyo",
    "ICN": "Asia/Seoul",
    "SIN": "Asia/Singapore",
    "HKG": "Asia/Hong_Kong",
    "BKK": "Asia/Bangkok",
    "PVG": "Asia/Shanghai",
    "PEK": "Asia/Shanghai",
    # South America
    "GRU": "America/Sao_Paulo",
    "GIG": "America/Sao_Paulo",
    "EZE": "America/Argentina/Buenos_Aires",
    "AEP": "America/Argentina/Buenos_Aires",
    "SCL": "America/Santiago",
    "BOG": "America/Bogota",
    # Australia & NZ
    "SYD": "Australia/Sydney",
    "MEL": "Australia/Melbourne",
    "BNE": "Australia/Brisbane",
    "PER": "Australia/Perth",
    "AKL": "Pacific/Auckland",
}

CITY_TIMEZONES: dict[str, str] = {
    "paris": "Europe/Paris",
    "madrid": "Europe/Madrid",
    "barcelona": "Europe/Madrid",
    "london": "Europe/London",
    "rome": "Europe/Rome",
    "milan": "Europe/Rome",
    "berlin": "Europe/Berlin",
    "munich": "Europe/Berlin",
    "vienna": "Europe/Vienna",
    "zurich": "Europe/Zurich",
    "amsterdam": "Europe/Amsterdam",
    "brussels": "Europe/Brussels",
    "lisbon": "Europe/Lisbon",
    "dublin": "Europe/Dublin",
    "prague": "Europe/Prague",
    "tokyo": "Asia/Tokyo",
    "new york": "America/New_York",
}


def get_timezone_for_iata(iata_code: str | None) -> ZoneInfo:
    """
    Returns the ZoneInfo for an airport IATA code.
    Defaults to Europe/Paris (app default context) if unknown.
    """
    if iata_code:
        clean = iata_code.strip().upper()
        if clean in IATA_TIMEZONES:
            try:
                return ZoneInfo(IATA_TIMEZONES[clean])
            except Exception:
                pass

        # Try looking up city name
        from app.utils.iata_mapping import get_city_from_iata

        city = get_city_from_iata(clean).lower()
        if city in CITY_TIMEZONES:
            try:
                return ZoneInfo(CITY_TIMEZONES[city])
            except Exception:
                pass

    return ZoneInfo("Europe/Paris")


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
