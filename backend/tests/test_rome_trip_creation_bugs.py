from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.api.trips import _populate_initial_anchors
from app.services.airport_service import get_airport_service
from app.services.wikimedia_photo_resolver import (
    WikimediaPhotoResolver,
    _is_title_relevant,
)


def test_search_locations_prioritizes_major_cities_over_homonymous_us_airports():
    svc = get_airport_service()

    rome_results = svc.search_locations("Rome", limit=5)
    assert len(rome_results) > 0
    assert rome_results[0]["country"] == "IT"
    assert rome_results[0]["airport_iata"] == "FCO"
    assert 41.0 <= rome_results[0]["latitude"] <= 42.5
    assert 11.5 <= rome_results[0]["longitude"] <= 13.5

    london_results = svc.search_locations("London", limit=5)
    assert len(london_results) > 0
    assert london_results[0]["country"] == "GB"

    athens_results = svc.search_locations("Athens", limit=5)
    assert len(athens_results) > 0
    assert athens_results[0]["country"] == "GR"
    assert athens_results[0]["airport_iata"] == "ATH"

    # Secondary airport-name search like 'Orly' must still work
    orly_results = svc.search_locations("Orly", limit=5)
    assert any(r["airport_iata"] == "ORY" for r in orly_results)


def test_populate_initial_anchors_blank_rome_hotel_stays_in_italy():
    itin_data = {
        "is_blank_trip": True,
        "travel_constraints": {
            "destination_city": "Rome",
            "destination_iata": "FCO",
            "origin_city": "Alicante",
            "origin_iata": "ALC",
            "departure_hour": "17:50",
            "arrival_hour": "09:30",
        },
        "days": [
            {"day": 1, "date": "2027-07-07", "itinerary": {"path": []}},
            {"day": 2, "date": "2027-07-08", "itinerary": {"path": []}},
        ],
    }

    res = _populate_initial_anchors(itin_data, "Rome", "2027-07-07", "2027-07-08")
    hotel = res.get("hotel") or {}
    assert 41.0 <= float(hotel["lat"]) <= 42.5
    assert 11.5 <= float(hotel["lng"]) <= 13.5


def test_wikimedia_relevance_rejects_generic_hotel_placeholders():
    assert not _is_title_relevant("Riviera Hotel", "Accommodation / Hotel")
    assert not _is_title_relevant("Riviera Hotel", "Accommodations / Hotel Depot")
    assert not _is_title_relevant("Riviera Hotel", "Hotel Artemide")


@pytest.mark.asyncio
async def test_resolve_photos_skips_generic_hotel_placeholder():
    with patch(
        "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.get_cached_photos",
        new=AsyncMock(
            return_value=[
                {
                    "url": "https://example.com/stale.jpg",
                    "thumbnail_url": "https://example.com/stale.jpg",
                }
            ]
        ),
    ):
        photos, extract = await WikimediaPhotoResolver.resolve_photos(
            poi_id="hotel-base",
            name="Accommodation / Hotel",
            city="Rome",
            target_lang="en",
        )
    assert photos == []
    assert extract is None


@pytest.mark.asyncio
async def test_poi_endpoints_do_not_enrich_generic_hotel_placeholder(
    async_client: AsyncClient,
):
    detail_res = await async_client.get(
        "/api/pois/hotel-base?name=Accommodation%20%2F%20Hotel&city=Rome&category=HOTEL&lat=41.89&lng=12.51&lang=en"
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["photos"] == []
    assert "Weymouth" not in detail["description"]
    assert "Riviera Hotel" not in detail["description"]

    batch_res = await async_client.post(
        "/api/pois/batch-photos",
        json={
            "pois": [
                {
                    "id": "hotel-base",
                    "name": "Accommodation / Hotel",
                    "city": "Rome",
                }
            ]
        },
    )
    assert batch_res.status_code == 200
    assert batch_res.json()["photos"].get("hotel-base") is None


@pytest.mark.asyncio
async def test_create_trip_does_not_block_on_inline_city_hydration(
    async_client: AsyncClient,
):
    async def _slow_city_ready(*args, **kwargs):
        raise AssertionError(
            "ensure_city_ready must not run synchronously inside POST /api/trips/"
        )

    with patch(
        "app.engine.city_readiness.ensure_city_ready",
        side_effect=_slow_city_ready,
    ):
        res = await async_client.post(
            "/api/trips/",
            json={
                "destination": "Rome",
                "start_date": "2027-07-07T00:00:00.000Z",
                "end_date": "2027-07-12T00:00:00.000Z",
                "itinerary_data": {
                    "title": "Trip to Rome",
                    "destination": "Rome",
                    "origin": "Alicante",
                    "is_blank_trip": True,
                    "travel_constraints": {
                        "destination_city": "Rome",
                        "destination_iata": "FCO",
                        "origin_city": "Alicante",
                        "origin_iata": "ALC",
                    },
                    "days": [
                        {
                            "day": 1,
                            "date": "2027-07-07",
                            "theme": "Day 1 Exploration",
                            "itinerary": {
                                "day_index": 0,
                                "path": [
                                    {
                                        "poi": {
                                            "id": "airport-fco",
                                            "name": "Leonardo Da Vinci (Fiumicino) International Airport",
                                            "city": "Rome",
                                            "category": "AIRPORT",
                                            "duration_mins": 120,
                                            "cost_eur": 0,
                                            "location": {
                                                "latitude": 41.8045,
                                                "longitude": 12.2508,
                                            },
                                        },
                                        "scheduled_start": "17:50",
                                        "scheduled_end": "18:50",
                                    }
                                ],
                            },
                            "activities": [],
                        }
                    ],
                },
            },
        )
    assert res.status_code == 201, res.text
    assert res.json()["id"]
