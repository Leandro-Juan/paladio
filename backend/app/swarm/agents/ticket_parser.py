import logging
import re
from datetime import datetime

import dateparser
from app.schemas.itinerary import BookingAnchors, FlightSegment, HotelAnchor
from app.services.airport_service import get_airport_service

logger = logging.getLogger(__name__)


class BookingParseError(ValueError):
    """Raised when non-empty free-text booking input cannot be deterministically parsed."""

    def __init__(self, message: str, missing_fields: list[str] | None = None):
        super().__init__(message)
        self.status_code = 422
        self.missing_fields = missing_fields or []


_ROUTE_RE = re.compile(
    r"\b([A-Z]{3})\s*(?:\([^)]+\)\s*)?(?:to|->|→|-|–)\s*([A-Z]{3})\b"
)

_FLIGHT_NO_RE = re.compile(r"\b(?:flight\s+(?:no\.?\s*)?)?([A-Z]{2}-?\d{2,4})\b")

_AIRLINE_BEFORE_FLIGHT_RE = re.compile(
    r"\b([A-Za-z][A-Za-z\s]{1,25}?)\s+flight\b",
    re.IGNORECASE,
)

_ISO_DT_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})(?:[T\s]+(\d{1,2}:\d{2}))?\b")

_NATURAL_DT_RE = re.compile(
    r"\b("
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?"
    r"(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))?"
    r"|"
    r"\d{1,2}(?:st|nd|rd|th)?\s+"
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\.?(?:,?\s+\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))?"
    r"|"
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))?"
    r")\b",
    re.IGNORECASE,
)

_DURATION_HM_RE = re.compile(
    r"(?:duration[:\s]*|\()?\b(\d{1,2})\s*h(?:ours?|rs?)?(?:\s*(\d{1,2})\s*m(?:in(?:utes?)?)?)?\b",
    re.IGNORECASE,
)
_DURATION_MIN_RE = re.compile(
    r"(?:duration[:\s]*|\()?\b(\d{2,4})\s*m(?:in(?:utes?|s)?)?\b",
    re.IGNORECASE,
)

_TIME_ONLY_RE = re.compile(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b", re.I)

_HOTEL_PATTERNS = [
    # "<Hotel Name> booked in <City> from <d1> to <d2>"
    re.compile(
        r"([A-Za-z0-9À-ÿ'’&.\-\s]{2,80}?)\s+booked\s+in\s+([A-Za-zÀ-ÿ\s-]{2,50}?)"
        r"(?:\s+from\s+([0-9A-Za-z,\s/-]+?)\s+to\s+([0-9A-Za-z,\s/-]+?))?(?:[.;\n]|$)",
        re.IGNORECASE,
    ),
    # "Booked at [the] <Hotel Name> in <City> [from <d1> to <d2>]"
    re.compile(
        r"(?:booked|staying|reserved)\s+(?:at|in)\s+(?:the\s+)?([A-Za-z0-9À-ÿ'’&.\-\s]{2,80}?)\s+in\s+([A-Za-zÀ-ÿ\s-]{2,50}?)"
        r"(?:\s+from\s+([0-9A-Za-z,\s/-]+?)\s+to\s+([0-9A-Za-z,\s/-]+?))?(?:[.;\n]|$)",
        re.IGNORECASE,
    ),
    # "Hotel: <Name>, <City> (Check-in: <d1>, Check-out: <d2>)"
    re.compile(
        r"hotel[:\s]+([A-Za-z0-9À-ÿ'’&.\-\s]{2,80}?),\s*([A-Za-zÀ-ÿ\s-]{2,50}?)"
        r"(?:\s*\(\s*check[- ]?in[:\s]*([^,;)]+?)[,;]\s*check[- ]?out[:\s]*([^)]+?)\))?(?:[.;\n]|$)",
        re.IGNORECASE,
    ),
    # "Hotel <Name> in <City> [from <d1> to <d2>]"
    re.compile(
        r"\b(Hotel\s+[A-Za-z0-9À-ÿ'’&.\-\s]{2,70}?)\s+in\s+([A-Za-zÀ-ÿ\s-]{2,50}?)"
        r"(?:\s+from\s+([0-9A-Za-z,\s/-]+?)\s+to\s+([0-9A-Za-z,\s/-]+?))?(?:[.;\n]|$)",
        re.IGNORECASE,
    ),
]


def _parse_datetime_str(raw: str, default_hour: str = "09:00") -> str | None:
    if not raw or not raw.strip():
        return None
    clean = raw.strip()

    iso_m = _ISO_DT_RE.search(clean)
    if iso_m:
        day_part = iso_m.group(1)
        time_part = iso_m.group(2)
        if time_part:
            hh, mm = time_part.split(":")
            return f"{day_part} {int(hh):02d}:{int(mm):02d}"
        return f"{day_part} {default_hour}"

    parsed = dateparser.parse(
        clean,
        languages=["en"],
        settings={"PREFER_DATES_FROM": "future"},
    )
    if parsed is None:
        return None
    has_explicit_time = bool(_TIME_ONLY_RE.search(clean))
    if has_explicit_time:
        return parsed.strftime("%Y-%m-%d %H:%M")
    return f"{parsed.strftime('%Y-%m-%d')} {default_hour}"


def _parse_date_only(raw: str | None) -> str | None:
    if not raw or not raw.strip():
        return None
    iso_m = _ISO_DT_RE.search(raw)
    if iso_m:
        return iso_m.group(1)
    parsed = dateparser.parse(
        raw.strip(),
        languages=["en"],
        settings={"PREFER_DATES_FROM": "future"},
    )
    return parsed.strftime("%Y-%m-%d") if parsed else None


def _extract_clause_datetimes(
    clause: str, default_hour: str = "09:00"
) -> tuple[str | None, str | None, int | None]:
    """Extracts (departure_time, arrival_time, duration_minutes) from a flight clause."""
    arr_split = re.split(
        r"\barriv(?:ing|al)\s+(?:at\s+)?", clause, maxsplit=1, flags=re.I
    )
    dep_part = arr_split[0]
    arr_part = arr_split[1] if len(arr_split) > 1 else ""

    dep_dt: str | None = None
    for pattern in (_ISO_DT_RE, _NATURAL_DT_RE):
        m = pattern.search(dep_part)
        if m:
            dep_dt = _parse_datetime_str(m.group(0), default_hour=default_hour)
            if dep_dt:
                break

    arr_dt: str | None = None
    if arr_part:
        for pattern in (_ISO_DT_RE, _NATURAL_DT_RE):
            m = pattern.search(arr_part)
            if m:
                arr_dt = _parse_datetime_str(m.group(0), default_hour=default_hour)
                if arr_dt:
                    break
        if arr_dt is None and dep_dt:
            t_m = _TIME_ONLY_RE.search(arr_part)
            if t_m:
                combined = f"{dep_dt[:10]} {t_m.group(1)}"
                arr_dt = _parse_datetime_str(combined, default_hour=default_hour)

    duration_mins: int | None = None
    dur_hm = _DURATION_HM_RE.search(clause)
    if dur_hm:
        hrs = int(dur_hm.group(1))
        mins = int(dur_hm.group(2) or 0)
        duration_mins = hrs * 60 + mins
    else:
        dur_m = _DURATION_MIN_RE.search(clause)
        if dur_m:
            duration_mins = int(dur_m.group(1))

    if duration_mins is None and dep_dt and arr_dt:
        try:
            d0 = datetime.strptime(dep_dt, "%Y-%m-%d %H:%M")
            d1 = datetime.strptime(arr_dt, "%Y-%m-%d %H:%M")
            diff = int((d1 - d0).total_seconds() // 60)
            if 15 <= diff <= 1800:
                duration_mins = diff
        except ValueError:
            pass

    return dep_dt, arr_dt, duration_mins


def _extract_hotel_anchor(
    clauses: list[str],
    outbound: FlightSegment | None,
    ret_flight: FlightSegment | None,
    airport_svc,
) -> HotelAnchor | None:
    for clause in clauses:
        for pat in _HOTEL_PATTERNS:
            m = pat.search(clause)
            if not m:
                continue
            raw_name = m.group(1).strip(" .,:;-")
            raw_city = m.group(2).strip(" .,:;-")
            # Avoid matching flight phrases as hotel names
            if _ROUTE_RE.search(raw_name) or "flight" in raw_name.lower():
                continue
            if not raw_name or not raw_city:
                continue
            # Clean leading stop-phrases if captured in greedy match
            raw_name = re.sub(
                r"^(?:and\s+)?(?:staying|booked|reserved)\s+(?:at|in)\s+(?:the\s+)?",
                "",
                raw_name,
                flags=re.I,
            ).strip()
            check_in = (
                _parse_date_only(m.group(3))
                if m.lastindex and m.lastindex >= 3 and m.group(3)
                else None
            )
            check_out = (
                _parse_date_only(m.group(4))
                if m.lastindex and m.lastindex >= 4 and m.group(4)
                else None
            )
            if not check_in and outbound and outbound.departure_time:
                check_in = outbound.departure_time[:10]
            if not check_out and ret_flight and ret_flight.departure_time:
                check_out = ret_flight.departure_time[:10]
            return HotelAnchor(
                name=raw_name,
                city=raw_city.title(),
                check_in_date=check_in,
                check_out_date=check_out,
            )

    # Fallback: "Booked at the Savoy hotel" without explicit city when outbound IATA resolves city
    if outbound and outbound.destination_iata:
        for clause in clauses:
            fb_m = re.search(
                r"(?:booked|staying)\s+(?:at|in)\s+(?:the\s+)?([A-Za-z0-9À-ÿ'’&.\-\s]{2,60}?\bhotel\b)",
                clause,
                re.IGNORECASE,
            )
            if fb_m:
                dest_city = airport_svc.get_city_from_iata(outbound.destination_iata)
                if dest_city and dest_city != "Unknown":
                    return HotelAnchor(
                        name=fb_m.group(1).strip(),
                        city=dest_city,
                        check_in_date=outbound.departure_time[:10]
                        if outbound.departure_time
                        else None,
                        check_out_date=ret_flight.departure_time[:10]
                        if ret_flight and ret_flight.departure_time
                        else None,
                    )
    return None


def parse_booking_text(text: str) -> BookingAnchors | None:
    """Deterministically parses free-text flight and hotel confirmations into BookingAnchors."""
    if not text or not text.strip():
        return None

    airport_svc = get_airport_service()
    clauses = [
        c.strip() for c in re.split(r"(?<=[.!?\n;])\s+|\n+", text.strip()) if c.strip()
    ]

    outbound: FlightSegment | None = None
    ret_flight: FlightSegment | None = None

    for clause in clauses:
        is_return_clause = bool(
            re.search(
                r"\b(?:return(?:ing)?|coming\s+back|flight\s+back|inbound)\b",
                clause,
                re.I,
            )
        )
        route_m = _ROUTE_RE.search(clause)
        if route_m:
            orig = route_m.group(1).upper()
            dest = route_m.group(2).upper()
            if orig == dest or not (
                airport_svc.is_valid_iata(orig) and airport_svc.is_valid_iata(dest)
            ):
                continue

            default_hr = "14:00" if is_return_clause else "09:00"
            dep_dt, arr_dt, dur_mins = _extract_clause_datetimes(
                clause, default_hour=default_hr
            )
            if not dep_dt:
                continue

            flight_no_m = _FLIGHT_NO_RE.search(clause)
            flight_no = flight_no_m.group(1).upper() if flight_no_m else None
            if flight_no in {orig, dest}:
                flight_no = None

            airline = None
            air_m = _AIRLINE_BEFORE_FLIGHT_RE.search(clause)
            if air_m:
                candidate_airline = air_m.group(1).strip()
                if candidate_airline.lower() not in {
                    "a",
                    "an",
                    "the",
                    "my",
                    "outbound",
                    "return",
                    "have a",
                    "i have a",
                }:
                    airline = re.sub(
                        r"^(?:i\s+have\s+a|have\s+a|a|the)\s+",
                        "",
                        candidate_airline,
                        flags=re.I,
                    ).title()

            is_reverse_of_outbound = (
                outbound is not None
                and orig == outbound.destination_iata
                and dest == outbound.origin_iata
            )

            if is_return_clause or is_reverse_of_outbound or outbound is not None:
                if ret_flight is None and (
                    is_return_clause or is_reverse_of_outbound or outbound is not None
                ):
                    ret_flight = FlightSegment(
                        origin_iata=orig,
                        destination_iata=dest,
                        departure_time=dep_dt,
                        arrival_time=arr_dt,
                        flight_duration_minutes=dur_mins,
                        flight_number=flight_no,
                        airline=airline,
                        direction="departure",
                    )
            else:
                outbound = FlightSegment(
                    origin_iata=orig,
                    destination_iata=dest,
                    departure_time=dep_dt,
                    arrival_time=arr_dt,
                    flight_duration_minutes=dur_mins,
                    flight_number=flight_no,
                    airline=airline,
                    direction="arrival",
                )
        elif is_return_clause and outbound is not None and ret_flight is None:
            # Handle terse return clauses like "Return 2026-11-28."
            dep_dt, arr_dt, dur_mins = _extract_clause_datetimes(
                clause, default_hour="14:00"
            )
            if dep_dt:
                ret_flight = FlightSegment(
                    origin_iata=outbound.destination_iata,
                    destination_iata=outbound.origin_iata,
                    departure_time=dep_dt,
                    arrival_time=arr_dt,
                    flight_duration_minutes=dur_mins,
                    direction="departure",
                )

    hotel = _extract_hotel_anchor(clauses, outbound, ret_flight, airport_svc)

    if outbound or ret_flight or hotel:
        return BookingAnchors(
            outbound_flight=outbound,
            return_flight=ret_flight,
            hotel=hotel,
        )
    return None


async def ticket_parser_node(state: dict) -> dict:
    """Deterministic booking-text parser node replacing the Pydantic AI LLM agent."""
    booking_text = state.get("booking_text")
    if not booking_text or not booking_text.strip():
        logger.info("No booking text provided. Bypassing ticket parser.")
        return {"booking_anchors": state.get("booking_anchors")}

    raw_existing = state.get("booking_anchors")
    anchors = parse_booking_text(booking_text)

    if not anchors or (
        not anchors.outbound_flight and not anchors.return_flight and not anchors.hotel
    ):
        if raw_existing:
            logger.info(
                "Deterministic ticket parser extracted no new anchors; preserving existing anchors."
            )
            return {"booking_anchors": raw_existing}
        missing = ["outbound_flight (IATA route & date)", "hotel (name & city)"]
        raise BookingParseError(
            "Could not parse flight IATA/dates or hotel accommodation from booking_text.",
            missing_fields=missing,
        )

    if anchors.outbound_flight:
        anchors.outbound_flight.direction = "arrival"
    if anchors.return_flight:
        anchors.return_flight.direction = "departure"

    logger.info("Successfully extracted booking anchors deterministically from text.")
    return {"booking_anchors": anchors.model_dump(mode="json")}
