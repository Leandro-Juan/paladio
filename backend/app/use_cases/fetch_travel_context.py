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

        # 1.1 Pre-warm destination city transit fare
        try:
            from app.services.transit_fare_service import TransitFareService

            await TransitFareService.prewarm_city_fare(city)
        except (RuntimeError, ValueError, KeyError, OSError, TimeoutError) as tf_err:
            logger.debug(f"Prewarming transit fare for '{city}' failed: {tf_err}")

        # 1.5 Score POIs with ML Model to provide true user affinity before spatial clustering
        if self.ml_scorer and db_pois:
            from app.domain.entities.poi import Poi

            for p in db_pois:
                if "city" not in p:
                    p["city"] = city

            domain_pois = [Poi(**p) for p in db_pois]
            prompt_affinities = getattr(constraints, "tag_affinities", None) or {}
            prompt_text = getattr(constraints, "prompt", None) or getattr(
                constraints, "user_prompt", None
            )
            scored_pois = await self.ml_scorer.score_pois(
                domain_pois,
                user_id=user_id,
                prompt_affinities=prompt_affinities,
                prompt_text=prompt_text,
            )
            # Reattach the ml score into the raw dictionaries for the clustering algorithm
            for p, sp in zip(db_pois, scored_pois):
                p["ml_affinity_score"] = sp.score

        # Determine city center dynamically from median of located db_pois
        center_lat, center_lon = None, None
        located_pts = [
            (
                float(p["location"]["latitude"]),
                float(p["location"]["longitude"]),
            )
            for p in db_pois
            if isinstance(p.get("location"), dict)
            and p["location"].get("latitude") is not None
            and p["location"].get("longitude") is not None
        ]
        if located_pts:
            lats = sorted(pt[0] for pt in located_pts)
            lons = sorted(pt[1] for pt in located_pts)
            center_lat = lats[len(lats) // 2]
            center_lon = lons[len(lons) // 2]

        if center_lat is None or center_lon is None:
            try:
                import urllib.parse
                import httpx

                query = urllib.parse.quote(city)
                url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(
                        url, headers={"User-Agent": "PaladioApp/1.0"}
                    )
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()[0]
                        center_lat = float(data["lat"])
                        center_lon = float(data["lon"])
            except (
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                KeyError,
                RuntimeError,
                OSError,
            ) as e:
                logger.warning(f"Failed to geocode city {city}: {e}")

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
            if (
                hotel_anchor.city
                and hotel_anchor.city.strip().lower() != city.strip().lower()
            ):
                logger.warning(
                    f"Hotel anchor city '{hotel_anchor.city}' mismatches destination city '{city}'. Snapping hotel to destination city center."
                )
                hotel_lat, hotel_lon = center_lat, center_lon
                hotel_name = f"Hotel in {city.title()}"
            else:
                hotel_name = hotel_anchor.name
                query = f"{hotel_anchor.name}, {hotel_anchor.address or ''}, {hotel_anchor.city}"
            try:
                import urllib.parse

                import httpx

                q = urllib.parse.quote(query)
                url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
                async with httpx.AsyncClient(timeout=5.0) as client:
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
            except (
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                KeyError,
                RuntimeError,
                OSError,
            ) as e:
                logger.warning(f"Failed to geocode hotel {hotel_name}: {e}")

        outbound_flight = booking_anchors.outbound_flight if booking_anchors else None
        return_flight = booking_anchors.return_flight if booking_anchors else None

        airport_lat, airport_lon = center_lat, center_lon
        airport_name = f"{city.title()} International Airport"

        if outbound_flight:
            iata = outbound_flight.destination_iata
            from app.utils.iata_mapping import get_city_from_iata

            airport_city = get_city_from_iata(iata.upper())
            if (
                airport_city
                and airport_city.lower() != "unknown"
                and airport_city.lower() != city.strip().lower()
            ):
                logger.warning(
                    f"Outbound flight destination airport '{iata}' ({airport_city}) mismatches destination city '{city}'. Ignoring misaligned airport."
                )
                outbound_flight = None
                return_flight = None
            else:
                airport_name = f"{iata.upper()} Airport"
                query = f"{iata} airport"
                try:
                    import urllib.parse
                    import httpx

                    q = urllib.parse.quote(query)
                    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
                    async with httpx.AsyncClient(timeout=5.0) as client:
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
                                f"Nominatim returned no results for airport: {query}. Snapping to city center."
                            )
                except (
                    httpx.HTTPError,
                    TimeoutError,
                    ValueError,
                    KeyError,
                    RuntimeError,
                    OSError,
                ) as e:
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

        # Stage 1-4: V2 Selection and Day Assignment (Agency-Grade Pipeline)
        from app.engine.v2.candidate_pool import CandidatePoi
        from app.engine.v2.day_assignment import assign_pois_to_days
        from app.engine.v2.selection import select_trip_pois
        from app.engine.v2.tiering import classify_poi_tier
        from app.engine.v2.trip_frame import build_trip_frame
        from app.utils.text import is_poi_mandatory

        candidate_pool: list[CandidatePoi] = []
        for p in db_pois:
            tier_info = classify_poi_tier(p, city)
            p_name = p.get("name", "Attraction")
            p_id = str(p.get("id") or p_name)
            p_loc = p.get("location") or {
                "latitude": hotel_lat,
                "longitude": hotel_lon,
            }
            p_lat = p_loc.get("latitude", hotel_lat)
            p_lon = p_loc.get("longitude", hotel_lon)
            is_mand = is_poi_mandatory(p_name, mandatory_names)
            open_v = p.get("open_time_mins_by_day") or [480] * 7
            close_v = p.get("close_time_mins_by_day") or [1320] * 7
            dur = p.get("duration_mins") or 60
            raw_c = p.get("cost_eur", 0.0)
            c_cand = CandidatePoi(
                id=p_id,
                name=p_name,
                city=city,
                tier=tier_info["tier"],
                tier_confidence=tier_info["tier_confidence"],
                tier_source=tier_info["tier_source"],
                iconicity_score=tier_info["iconicity_score"],
                taxonomy_category=tier_info["taxonomy_category"],
                category_id=tier_info["category_id"],
                visit_mode=tier_info["visit_mode"],
                duration_mins=int(dur),
                cost_eur=float(raw_c) if raw_c is not None else 0.0,
                location={"latitude": p_lat, "longitude": p_lon},
                open_time_mins_by_day=open_v,
                close_time_mins_by_day=close_v,
                taste_score=float(p.get("ml_affinity_score", 50.0)),
                is_mandatory=is_mand,
                is_meal_spot=False,
                raw_dict=p,
            )
            candidate_pool.append(c_cand)

        trip_frame = build_trip_frame(
            constraints=constraints,
            outbound_flight=outbound_flight.model_dump() if outbound_flight else None,
            return_flight=return_flight.model_dump() if return_flight else None,
            city_center=(hotel_lat, hotel_lon),
        )

        selection_res = select_trip_pois(
            candidate_pool=candidate_pool,
            trip_frame=trip_frame,
        )

        assignment_res = assign_pois_to_days(
            selected_pois=selection_res.selected_pois,
            trip_frame=trip_frame,
        )

        daily_clusters = []
        for d_idx in range(num_days):
            day_match = next(
                (d for d in assignment_res.assigned_days if d.day_index == d_idx), None
            )
            if day_match and day_match.pois:
                day_cluster = []
                for sp in day_match.pois:
                    orig_p = getattr(sp.poi, "raw_dict", None)
                    if orig_p is not None:
                        day_cluster.append(orig_p)
                    else:
                        day_cluster.append(
                            {
                                "id": sp.poi.id,
                                "name": sp.poi.name,
                                "city": city,
                                "category": "ATTRACTION",
                                "cost_eur": sp.poi.cost_eur,
                                "open_time_mins_by_day": sp.poi.open_time_mins_by_day,
                                "close_time_mins_by_day": sp.poi.close_time_mins_by_day,
                                "duration_mins": sp.poi.duration_mins,
                                "location": sp.poi.location,
                                "tier": sp.poi.tier,
                                "category_id": sp.poi.category_id,
                                "ml_affinity_score": sp.poi.taste_score,
                            }
                        )
                daily_clusters.append(day_cluster)
            else:
                daily_clusters.append([])

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
                    "cost_is_estimated": False,
                    "cost_source": "hotel_booking",
                    "duration_mins": 60,
                    "open_time_mins_by_day": [0] * 7,
                    "close_time_mins_by_day": [1440] * 7,
                    "location": {"latitude": hotel_lat, "longitude": hotel_lon},
                }
            )

            for p in daily_clusters[day]:
                raw_cost = p.get("cost_eur")
                if raw_cost is None and isinstance(p.get("financials"), dict):
                    raw_cost = p["financials"].get("estimated_cost", 0.0)
                cost = float(raw_cost) if raw_cost is not None else 0.0
                p_lat = p.get("location", {}).get("latitude", hotel_lat)
                p_lon = p.get("location", {}).get("longitude", hotel_lon)
                open_vec = p.get("open_time_mins_by_day") or [480] * 7
                close_vec = p.get("close_time_mins_by_day") or [1320] * 7
                dur = p.get("duration_mins") or p.get("schedule", {}).get(
                    "recommended_duration_minutes", 60
                )
                day_pois.append(
                    {
                        "name": p.get("name", "Unknown"),
                        "city": city,
                        "category": p.get("category", "ATTRACTION"),
                        "cost_eur": cost,
                        "cost_is_estimated": p.get("cost_is_estimated", True),
                        "cost_source": p.get("cost_source"),
                        "open_time_mins_by_day": open_vec,
                        "close_time_mins_by_day": close_vec,
                        "osm_opening_hours": p.get("osm_opening_hours"),
                        "duration_mins": int(dur) if dur else 60,
                        "location": {"latitude": p_lat, "longitude": p_lon},
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
                        "cost_is_estimated": False,
                        "cost_source": "official_airport_free_entry",
                        "duration_mins": 120,
                        "open_time_mins_by_day": [0] * 7,
                        "close_time_mins_by_day": [1440] * 7,
                        "location": {"latitude": airport_lat, "longitude": airport_lon},
                        "scoring": {"google_rating": 4.5, "reviews": 500},
                    }
                )

            # Separate breakfast-appropriate venues (cafes/bakeries) from lunch/dinner restaurants
            cafes = [
                r
                for r in restaurants_data
                if str(r.get("category", "")).lower() in ("cafe", "bakery")
            ]
            dining_places = [
                r
                for r in restaurants_data
                if str(r.get("category", "")).lower() not in ("cafe", "bakery")
            ]
            if not cafes:
                cafes = restaurants_data
            if not dining_places:
                dining_places = restaurants_data

            b_spot = cafes[day % max(1, len(cafes))] if cafes else None
            l_spot = (
                dining_places[(day * 2) % max(1, len(dining_places))]
                if dining_places
                else None
            )
            d_spot = (
                dining_places[(day * 2 + 1) % max(1, len(dining_places))]
                if dining_places
                else None
            )
            day_restaurants = [r for r in (b_spot, l_spot, d_spot) if r]

            for i, r in enumerate(day_restaurants):
                r_loc = r.get("location", {})
                r_lat = r_loc.get("latitude", hotel_lat)
                r_lon = r_loc.get("longitude", hotel_lon)
                scoring = r.get("scoring") or {"google_rating": 4.2, "reviews": 150}

                # Meal-specific windows: Breakfast (0), Lunch (1), Dinner (2)
                if i == 0:
                    r_name = r.get("name", f"Breakfast Spot {day}")
                    r_cat = "CAFE"
                    r_open = [480] * 7  # 08:00
                    r_close = [630] * 7  # 10:30
                    r_dur = 45
                    r_cost = 8.0
                elif i == 1:
                    r_name = r.get("name", f"Lunch Bistro {day}")
                    r_cat = "RESTAURANT"
                    r_open = [750] * 7  # 12:30
                    r_close = [930] * 7  # 15:30
                    r_dur = 75
                    r_cost = 18.0
                else:
                    r_name = r.get("name", f"Dinner Restaurant {day}")
                    r_cat = "RESTAURANT"
                    r_open = [1170] * 7  # 19:30
                    r_close = [1380] * 7  # 23:00
                    r_dur = 90
                    r_cost = 25.0

                day_pois.append(
                    {
                        "name": r_name,
                        "city": city,
                        "category": r_cat,
                        "cost_eur": r_cost,
                        "cost_is_estimated": True,
                        "cost_source": "meal_service_benchmark_estimate",
                        "duration_mins": r_dur,
                        "open_time_mins_by_day": r_open,
                        "close_time_mins_by_day": r_close,
                        "location": {"latitude": r_lat, "longitude": r_lon},
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
