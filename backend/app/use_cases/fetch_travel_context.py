import logging
import os
from typing import Any

from app.schemas.itinerary import TravelConstraints
from app.services.poi_service import get_attractions_for_city
from app.services.travel_data_service import (
    fetch_restaurants,
)

logger = logging.getLogger(__name__)


class FetchTravelContextUseCase:
    """
    Use Case responsible for fetching and formatting all travel context
    (POIs, flights, hotels, restaurants). Extracts data fetching logic from LangGraph nodes.
    """

    async def execute(
        self, constraints: TravelConstraints, test_data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        city = constraints.destination_city

        mandatory_names = (
            [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
        )

        # 1. Fetch POIs
        if test_data and "pois" in test_data:
            db_pois = test_data["pois"]
        else:
            from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
            from app.infrastructure.providers.overpass_provider import (
                OverpassProviderAdapter,
            )

            repo = SqlPoiRepository()
            provider = OverpassProviderAdapter()
            db_pois = await get_attractions_for_city(
                city,
                poi_repo=repo,
                poi_provider=provider,
                mandatory_names=mandatory_names,
            )

        # Determine city center from db_pois for snapping
        center_lat, center_lon = None, None
        if db_pois and db_pois[0].get("location"):
            center_lat = db_pois[0]["location"].get("latitude")
            center_lon = db_pois[0]["location"].get("longitude")

        if center_lat is None or center_lon is None:
            try:
                import urllib.parse

                import httpx

                query = urllib.parse.quote(city)
                url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        url, headers={"User-Agent": "PaladioApp/1.0"}
                    )
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()[0]
                        center_lat = float(data["lat"])
                        center_lon = float(data["lon"])
            except Exception as e:
                logger.warning(f"Failed to geocode {city}: {e}")

            if center_lat is None or center_lon is None:
                raise RuntimeError(
                    f"Could not geocode destination city: {city}. Missing data."
                )

        # --- TEST MODE OVERRIDE ---
        if os.getenv("TEST_MODE") == "1":
            logger.info(
                "TEST_MODE=1 detected. Generating dynamic mocked data for flights, hotels, and restaurants."
            )
            from app.utils.mock_generator import generate_dynamic_mock_data

            dynamic_test_data = generate_dynamic_mock_data(
                city,
                center_lat,
                center_lon,
                constraints.start_date,
                constraints.end_date,
            )
            # Re-fetch from dynamic data so we have a ton of mock items
            if not test_data:
                test_data = {}
            test_data.update(dynamic_test_data)

        # 2. Extract Anchors & Geocode
        booking_anchors = constraints.booking_anchors
        hotel_anchor = booking_anchors.hotel if booking_anchors else None

        hotel_lat, hotel_lon = center_lat + 0.005, center_lon + 0.005  # default offset
        hotel_name = "Hotel"

        if hotel_anchor:
            hotel_name = hotel_anchor.name
            query = f"{hotel_anchor.name}, {hotel_anchor.address or ''}, {hotel_anchor.city}"
            try:
                import urllib.parse

                import httpx

                q = urllib.parse.quote(query)
                url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        url, headers={"User-Agent": "PaladioApp/1.0"}
                    )
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()[0]
                        hotel_lat = float(data["lat"])
                        hotel_lon = float(data["lon"])
                        logger.info(
                            f"Geocoded hotel {hotel_name} to {hotel_lat}, {hotel_lon}"
                        )
                    else:
                        logger.warning(
                            f"Nominatim returned no results for hotel: {query}"
                        )
            except Exception as e:
                logger.warning(f"Failed to geocode hotel {hotel_name}: {e}")

        outbound_flight = booking_anchors.outbound_flight if booking_anchors else None
        return_flight = booking_anchors.return_flight if booking_anchors else None

        airport_lat, airport_lon = center_lat + 0.1, center_lon + 0.1
        airport_name = f"{city.title()} International Airport"

        if outbound_flight:
            iata = outbound_flight.destination_iata
            airport_name = f"{iata} Airport"
            query = f"{iata} airport"
            try:
                import urllib.parse

                import httpx

                q = urllib.parse.quote(query)
                url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        url, headers={"User-Agent": "PaladioApp/1.0"}
                    )
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()[0]
                        airport_lat = float(data["lat"])
                        airport_lon = float(data["lon"])
                        logger.info(
                            f"Geocoded airport {iata} to {airport_lat}, {airport_lon}"
                        )
                    else:
                        logger.warning(
                            f"Nominatim returned no results for airport: {query}"
                        )
            except Exception as e:
                logger.warning(f"Failed to geocode airport {iata}: {e}")

        # 3. Fetch Restaurants
        restaurants_data = await fetch_restaurants(city, test_data)

        # Apply Spatial-Affinity Clustering to filter POIs
        from app.engine.cluster_selector import ClusterSelector

        selector = ClusterSelector(
            max_pois=30
        )  # leave room for hotels/restaurants (max 64)

        num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
        daily_clusters = selector.select_n_clusters(
            db_pois, hotel_lat, hotel_lon, mandatory_names, num_days
        )

        # 4. Build combined POIs data per day
        daily_pois_data = []

        for day in range(num_days):
            day_pois = []

            day_pois.append(
                {
                    "name": hotel_name,
                    "city": city,
                    "category": "HOTEL",
                    "cost_eur": 0.0,
                    "duration_mins": 60,
                    "location": {"latitude": hotel_lat, "longitude": hotel_lon},
                    "schedule": {"open_time_mins": 0, "close_time_mins": 1440},
                    "financials": {},
                }
            )

            for p in daily_clusters[day]:
                raw_cost = p.get("financials", {}).get("estimated_cost", 0.0)
                cost = float(raw_cost) if raw_cost is not None else 0.0
                p_lat = p.get("location", {}).get("latitude", hotel_lat)
                p_lon = p.get("location", {}).get("longitude", hotel_lon)
                day_pois.append(
                    {
                        "name": p.get("name", "Unknown"),
                        "city": city,
                        "category": p.get("category", "ATTRACTION"),
                        "cost_eur": cost,
                        "duration_mins": p.get("schedule", {}).get(
                            "recommended_duration_minutes", 60
                        ),
                        "location": {"latitude": p_lat, "longitude": p_lon},
                        "schedule": p.get("schedule", {}),
                        "financials": p.get("financials", {}),
                        "scoring": p.get("scoring")
                        or {"google_rating": 4.5, "reviews": 100},
                    }
                )

            if day == 0 or day == num_days - 1:
                day_pois.append(
                    {
                        "name": airport_name,
                        "city": city,
                        "category": "AIRPORT",
                        "cost_eur": 0.0,
                        "duration_mins": 120,
                        "location": {"latitude": airport_lat, "longitude": airport_lon},
                        "schedule": {"open_time_mins": 0, "close_time_mins": 1440},
                        "financials": {},
                        "scoring": {"google_rating": 4.5, "reviews": 500},
                    }
                )

            start_idx = (
                (day * 3) % max(1, len(restaurants_data)) if restaurants_data else 0
            )
            end_idx = start_idx + 3
            day_restaurants = restaurants_data[start_idx:end_idx]
            if len(day_restaurants) < 3 and restaurants_data:
                day_restaurants += restaurants_data[: 3 - len(day_restaurants)]

            for i, r in enumerate(day_restaurants):
                r_loc = r.get("location", {})
                r_lat = r_loc.get("latitude", hotel_lat)
                r_lon = r_loc.get("longitude", hotel_lon)

                sched = r.get("schedule") or {
                    "open_time_mins": 480,
                    "close_time_mins": 1320,
                }
                fin = r.get("financials") or {"estimated_cost": 20.0}
                scoring = r.get("scoring") or {"google_rating": 4.2, "reviews": 150}

                day_pois.append(
                    {
                        "name": r.get("name", f"Restaurant {day}-{i}"),
                        "city": city,
                        "category": "RESTAURANT",
                        "cost_eur": 20.0,
                        "duration_mins": 60,
                        "location": {"latitude": r_lat, "longitude": r_lon},
                        "schedule": sched,
                        "financials": fin,
                        "scoring": scoring,
                    }
                )

            daily_pois_data.append(day_pois)

        return {
            "daily_pois_data": daily_pois_data,
            "outbound_flight": outbound_flight.model_dump()
            if outbound_flight
            else None,
            "return_flight": return_flight.model_dump() if return_flight else None,
        }
