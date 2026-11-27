"""Helpers for building and normalizing direct flight and hotel booking URLs."""

from __future__ import annotations

import re
import urllib.parse
from datetime import date

_GUEST_SUFFIX_RE = re.compile(r"\s*\(\d+\s+[Gg]uests?\)\s*$")


def _fmt_date(val: str | date | None) -> str:
    if val is None:
        return ""
    if isinstance(val, date):
        return val.isoformat()
    return str(val).strip()


def _is_iata_code(val: str) -> bool:
    return len(val) == 3 and val.isalpha() and val.isupper()


def _normalize_ryanair_select_url(
    url: str,
    origin: str,
    destination: str,
    depart_date: str,
    travelers: int,
) -> str | None:
    """Ensures a Ryanair /trip/flights/select URL has the required query parameters."""
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    orig = (qs.get("originIata", [""])[0] or origin).strip().upper()
    dest = (qs.get("destinationIata", [""])[0] or destination).strip().upper()
    date_out = (qs.get("dateOut", [""])[0] or depart_date).strip()

    if not orig or not dest:
        return None

    # Ryanair's SPA requires adults, teens, children, infants, isReturn, etc.
    params = {
        "adults": qs.get("adults", [str(max(1, travelers))])[0],
        "teens": qs.get("teens", ["0"])[0],
        "children": qs.get("children", ["0"])[0],
        "infants": qs.get("infants", ["0"])[0],
        "dateOut": date_out,
        "dateIn": qs.get("dateIn", [""])[0],
        "isConnectedFlight": qs.get("isConnectedFlight", ["false"])[0],
        "discount": qs.get("discount", ["0"])[0],
        "promoCode": qs.get("promoCode", [""])[0],
        "isReturn": qs.get("isReturn", ["false"])[0],
        "originIata": orig,
        "destinationIata": dest,
    }
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(params))
    )


def _host_matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def _is_google_host(host: str) -> bool:
    parts = host.split(".")
    return len(parts) >= 2 and ("google" in parts[:-1])


def _normalize_host(parsed: urllib.parse.ParseResult) -> str:
    return (parsed.hostname or "").lower()


def build_flight_booking_url(
    origin: str,
    destination: str,
    depart_date: str | date | None = None,
    return_date: str | date | None = None,
    deep_link: str | None = None,
    travelers: int = 1,
) -> str:
    """Returns a working direct booking/search URL for a flight leg or round trip."""
    orig = (origin or "").strip().upper()
    dest = (destination or "").strip().upper()
    dep_str = _fmt_date(depart_date)
    ret_str = _fmt_date(return_date)
    raw = (deep_link or "").strip()

    if raw:
        if raw.startswith("/search/"):
            return f"https://www.aviasales.com{raw}"

        if raw.startswith("http://") or raw.startswith("https://"):
            parsed = urllib.parse.urlparse(raw)
            host = _normalize_host(parsed)
            path = (parsed.path or "").rstrip("/")

            # Bare Google Flights URL with no query string -> build a pre-filled search
            if _is_google_host(host) and path == "/travel/flights" and not parsed.query:
                raw = ""
            # Ryanair /trip/flights/select requires full query params for the SPA
            elif _host_matches(host, "ryanair.com") and "/trip/flights/select" in path:
                normalized = _normalize_ryanair_select_url(
                    raw, orig, dest, dep_str, travelers
                )
                if normalized:
                    return normalized
                raw = ""
            else:
                return raw

    if dep_str and ret_str:
        query = f"Flights from {orig} to {dest} on {dep_str} through {ret_str}"
    elif dep_str:
        query = f"Flights from {orig} to {dest} on {dep_str}"
    else:
        query = f"Flights from {orig} to {dest}"

    return f"https://www.google.com/travel/flights?q={urllib.parse.quote_plus(query)}"


def build_hotel_booking_url(
    destination: str = "",
    property_name: str | None = None,
    city_name: str | None = None,
    check_in: str | date | None = None,
    check_out: str | date | None = None,
    deep_link: str | None = None,
    travelers: int = 1,
) -> str | None:
    """Returns a working direct booking/search URL for a hotel or destination stay."""
    dest = (destination or "").strip()
    city = (city_name or "").strip()
    clean_prop = _GUEST_SUFFIX_RE.sub("", (property_name or "").strip()).strip()
    cin_str = _fmt_date(check_in)
    cout_str = _fmt_date(check_out)
    adults = max(1, travelers)
    raw = (deep_link or "").strip()

    if raw:
        if raw.startswith("/hotel/") or raw.startswith("/searchresults.html"):
            raw = f"https://www.booking.com{raw}"

        if raw.startswith("http://") or raw.startswith("https://"):
            parsed = urllib.parse.urlparse(raw)
            host = _normalize_host(parsed)
            path = (parsed.path or "").lower()
            qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)

            # Bare or broken search URLs without an actual search target
            is_bare_booking_search = (
                _host_matches(host, "booking.com")
                and "searchresults" in path
                and not qs.get("ss")
            )
            is_bare_google_search = (
                _is_google_host(host) and "/travel/search" in path and not qs.get("q")
            )
            is_broken_agoda = (
                _host_matches(host, "agoda.com")
                and "/search" in path
                and qs.get("city")
                and not qs["city"][0].isdigit()
            )

            if not (is_bare_booking_search or is_bare_google_search or is_broken_agoda):
                if _host_matches(host, "booking.com"):
                    flat_qs = {k: v[0] for k, v in qs.items() if v}
                    if cin_str and "checkin" not in flat_qs:
                        flat_qs["checkin"] = cin_str
                    if cout_str and "checkout" not in flat_qs:
                        flat_qs["checkout"] = cout_str
                    if adults > 1 or "group_adults" not in flat_qs:
                        if "group_adults" not in flat_qs:
                            flat_qs["group_adults"] = str(adults)
                    if "no_rooms" not in flat_qs:
                        flat_qs["no_rooms"] = "1"
                    return urllib.parse.urlunparse(
                        parsed._replace(query=urllib.parse.urlencode(flat_qs))
                    )
                return raw

    # Build a targeted Booking.com search URL using property name and/or city
    if clean_prop and city and city.lower() not in clean_prop.lower():
        ss = f"{clean_prop}, {city}"
    elif clean_prop:
        if dest and not _is_iata_code(dest) and dest.lower() not in clean_prop.lower():
            ss = f"{clean_prop}, {dest}"
        else:
            ss = clean_prop
    else:
        ss = city or dest

    if not ss:
        return None

    params: dict[str, str] = {"ss": ss}
    if cin_str and cout_str:
        params["checkin"] = cin_str
        params["checkout"] = cout_str
    params["group_adults"] = str(adults)
    params["no_rooms"] = "1"

    return (
        f"https://www.booking.com/searchresults.html?{urllib.parse.urlencode(params)}"
    )
