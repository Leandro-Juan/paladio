"""Unit tests for direct flight and hotel booking URL builders."""

import urllib.parse
from datetime import date

from app.engine.market.booking_links import (
    build_flight_booking_url,
    build_hotel_booking_url,
)


def test_flight_booking_url_fallback_google_flights_roundtrip():
    url = build_flight_booking_url(
        origin="MAD",
        destination="HND",
        depart_date=date(2026, 12, 10),
        return_date=date(2026, 12, 20),
        deep_link=None,
    )
    assert url.startswith("https://www.google.com/travel/flights?q=")
    decoded = urllib.parse.unquote_plus(url)
    assert "Flights from MAD to HND on 2026-12-10 through 2026-12-20" in decoded


def test_flight_booking_url_replaces_bare_google_flights():
    url = build_flight_booking_url(
        origin="JFK",
        destination="CDG",
        depart_date="2026-11-05",
        deep_link="https://www.google.com/travel/flights",
    )
    decoded = urllib.parse.unquote_plus(url)
    assert "Flights from JFK to CDG on 2026-11-05" in decoded


def test_flight_booking_url_normalizes_ryanair_select_params():
    url = build_flight_booking_url(
        origin="MAD",
        destination="STN",
        depart_date="2026-12-01",
        deep_link="https://www.ryanair.com/gb/en/trip/flights/select?originIata=MAD&destinationIata=STN&dateOut=2026-12-01",
        travelers=2,
    )
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    assert qs["adults"] == ["2"]
    assert qs["isReturn"] == ["false"]
    assert qs["originIata"] == ["MAD"]
    assert qs["destinationIata"] == ["STN"]
    assert qs["dateOut"] == ["2026-12-01"]


def test_flight_booking_url_prefixes_relative_aviasales():
    url = build_flight_booking_url(
        origin="MAD",
        destination="FCO",
        depart_date="2026-12-01",
        deep_link="/search/MAD0112FCO1",
    )
    assert url == "https://www.aviasales.com/search/MAD0112FCO1"


def test_hotel_booking_url_fallback_uses_property_and_city():
    url = build_hotel_booking_url(
        destination="CDG",
        property_name="Hôtel Fabric (2 Guests)",
        city_name="Paris",
        check_in=date(2026, 12, 10),
        check_out=date(2026, 12, 13),
        deep_link=None,
        travelers=2,
    )
    assert url is not None
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    assert parsed.netloc == "www.booking.com"
    assert qs["ss"] == ["Hôtel Fabric, Paris"]
    assert qs["checkin"] == ["2026-12-10"]
    assert qs["checkout"] == ["2026-12-13"]
    assert qs["group_adults"] == ["2"]
    assert qs["no_rooms"] == ["1"]


def test_hotel_booking_url_replaces_bare_booking_searchresults():
    url = build_hotel_booking_url(
        destination="LIS",
        property_name="AlmaLusa Baixa",
        city_name="Lisbon",
        check_in="2026-11-15",
        check_out="2026-11-18",
        deep_link="https://www.booking.com/searchresults.html",
        travelers=1,
    )
    assert url is not None
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert qs["ss"] == ["AlmaLusa Baixa, Lisbon"]
    assert qs["checkin"] == ["2026-11-15"]
    assert qs["checkout"] == ["2026-11-18"]


def test_hotel_booking_url_replaces_broken_agoda_city_string():
    url = build_hotel_booking_url(
        destination="TYO",
        property_name="Hotel Gracery Shinjuku",
        city_name="Tokyo",
        check_in="2026-12-01",
        check_out="2026-12-05",
        deep_link="https://www.agoda.com/search?city=Tokyo&checkIn=2026-12-01&checkOut=2026-12-05",
        travelers=2,
    )
    assert url is not None
    assert "booking.com/searchresults.html" in url
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert qs["ss"] == ["Hotel Gracery Shinjuku, Tokyo"]


def test_hotel_booking_url_enriches_booking_property_link():
    url = build_hotel_booking_url(
        destination="ROM",
        property_name="Hotel Quirinale",
        check_in="2026-11-20",
        check_out="2026-11-23",
        deep_link="https://www.booking.com/hotel/it/quirinale.html",
        travelers=2,
    )
    assert url is not None
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    assert parsed.path == "/hotel/it/quirinale.html"
    assert qs["checkin"] == ["2026-11-20"]
    assert qs["checkout"] == ["2026-11-23"]
    assert qs["group_adults"] == ["2"]
    assert qs["no_rooms"] == ["1"]
