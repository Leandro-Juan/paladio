import logging
from typing import Any

from app.schemas.itinerary import TravelConstraints

logger = logging.getLogger(__name__)


class FetchTravelContextUseCase:
    """
    Use Case responsible for fetching and formatting all travel context
    (POIs, flights, hotels, restaurants). Extracts data fetching logic from LangGraph nodes.
    """

    def __init__(self, data_provider=None, ml_scorer=None):
        if data_provider is None:
            from app.infrastructure.providers.travel_data import LiveTravelDataProvider

            self.data_provider = LiveTravelDataProvider()
        else:
            self.data_provider = data_provider

        self.ml_scorer = ml_scorer

    async def execute(
        self,
        constraints: TravelConstraints,
        test_data: dict[str, Any] | None = None,
        user_id: str = "default_user",
    ) -> dict[str, Any]:
        city = constraints.destination_city

        mandatory_names = (
            [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
        )

        # 1. Fetch POIs
        db_pois = await self.data_provider.get_pois(city, mandatory_names)

        # 1.5 Score POIs with ML Model to provide true user affinity before spatial clustering
        if self.ml_scorer and db_pois:
            from app.domain.entities.poi import Poi

            for p in db_pois:
                if "city" not in p:
                    p["city"] = city

            domain_pois = [Poi(**p) for p in db_pois]
            prompt_affinities = getattr(constraints, "tag_affinities", None) or {}
            scored_pois = await self.ml_scorer.score_pois(
                domain_pois, user_id=user_id, prompt_affinities=prompt_affinities
            )
            # Reattach the ml score into the raw dictionaries for the clustering algorithm
            for p, sp in zip(db_pois, scored_pois):
                p["ml_affinity_score"] = sp.score

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

        # 2. Extract Anchors & Geocode
        booking_anchors = constraints.booking_anchors
        hotel_anchor = booking_anchors.hotel if booking_anchors else None

        hotel_lat, hotel_lon = center_lat, center_lon

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

        airport_lat, airport_lon = center_lat, center_lon
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

        # Calculate trip duration strictly from real dates
        if not constraints.start_date or not constraints.end_date:
            raise ValueError(
                "Missing start_date or end_date in TravelConstraints to calculate trip duration."
            )

        num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)

        total_meal_slots = num_days * 2
        # Math formula: 20% of meal slots, bounded between 1 and 3
        calculated_target = max(1, min(3, int(total_meal_slots * 0.2)))

        # 3. Fetch Restaurants
        preferred_cuisines = getattr(constraints, "preferred_cuisines", []) or []
        restaurants_data = await self.data_provider.get_restaurants(
            city,
            preferred_cuisines=preferred_cuisines,
            target_frequency=calculated_target,
        )

        # Apply Spatial-Affinity Clustering to filter POIs
        from app.engine.cluster_selector import ClusterSelector

        selector = ClusterSelector(
            max_pois=30
        )  # leave room for hotels/restaurants (max 64)

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
                        "ml_affinity_score": p.get("ml_affinity_score"),
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
