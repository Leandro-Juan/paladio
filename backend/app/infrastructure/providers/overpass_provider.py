import asyncio
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from app.domain.interfaces.poi_provider import IPoiProvider
from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)

logger = logging.getLogger(__name__)

OVERPASS_ENDPOINTS = [
    "http://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


_nominatim_lock = asyncio.Lock()
_nominatim_last_called = 0.0


class OverpassProviderAdapter(IPoiProvider):
    async def fetch_restaurants(
        self, city: str, limit: int = 15, cuisine: str | None = None
    ) -> list[Attraction]:
        logger.info(
            f"Fetching restaurants for {city} (cuisine={cuisine}) from Overpass API (limit={limit})"
        )
        coords = await self._get_city_coordinates(city)
        if not coords:
            return []

        lat, lon = coords
        cuisine_filter = f'["cuisine"~"{cuisine}",i]' if cuisine else ""
        query = f"""
        [out:json][timeout:25];
        (
          node["amenity"~"restaurant|cafe|bar"]{cuisine_filter}(around:10000,{lat},{lon});
        );
        out center {limit};
        """

        try:
            data = await self._execute_query(query)
            elements = data.get("elements", [])

            pois = []
            for el in elements:
                parsed = self._parse_osm_element(el)
                if parsed:
                    pois.append(parsed)
            return pois
        except Exception as e:
            logger.error(f"Overpass API error: {e}")
            return []

    async def fetch_attractions(
        self, city_name: str, limit: int = 50, mandatory_names: list[str] | None = None
    ) -> list[Attraction]:
        coords = await self._get_city_coordinates(city_name)
        if not coords:
            return []
        lat, lon = coords
        query = f"""
        [out:json][timeout:25];
        (
          node["tourism"~"museum|attraction|viewpoint"](around:5000,{lat},{lon});
          way["tourism"~"museum|attraction|viewpoint"](around:5000,{lat},{lon});
          node["historic"~"monument|ruins|castle"](around:5000,{lat},{lon});
          way["historic"~"monument|ruins|castle"](around:5000,{lat},{lon});
        );
        out center {limit};
        """

        logger.info(f"Querying Overpass API for {city_name} (limit {limit})...")
        headers = {
            "Accept": "application/json",
            "User-Agent": "Paladio-Static-Ingester/1.0",
        }
        timeout = httpx.Timeout(25.0, connect=15.0)
        data = None

        for endpoint in OVERPASS_ENDPOINTS:
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        endpoint, data={"data": query}, headers=headers
                    )
                    response.raise_for_status()
                    data = response.json()
                    break
            except Exception:
                continue

        if not data:
            raise RuntimeError(
                f"All Overpass API endpoints failed or timed out for {city_name}."
            )

        elements = data.get("elements", [])
        if mandatory_names:
            for m_name in mandatory_names:
                if any(
                    m_name.lower() in str(el.get("tags", {}).get("name", "")).lower()
                    for el in elements
                ):
                    continue
                logger.info(
                    f"Mandatory POI '{m_name}' missing, fetching specifically..."
                )
                target_query = f"""
                [out:json][timeout:15];
                area["name"="{city_name}"]["admin_level"="8"]->.searchArea;
                nwr["name"~"{m_name}",i](area.searchArea);
                out center 1;
                """
                for endpoint in OVERPASS_ENDPOINTS:
                    try:
                        async with httpx.AsyncClient(timeout=15.0) as client:
                            resp = await client.post(
                                endpoint, data={"data": target_query}, headers=headers
                            )
                            resp.raise_for_status()
                            t_data = resp.json()
                            t_elements = t_data.get("elements", [])
                            if t_elements:
                                elements.extend(t_elements)
                                logger.info(
                                    f"Successfully fetched mandatory POI: {m_name}"
                                )
                            break
                    except Exception:
                        continue

        attractions = []
        for el in elements:
            parsed = self._parse_osm_element(el)
            if parsed:
                attractions.append(parsed)

        return attractions

    def _parse_osm_element(self, element: dict) -> Attraction | None:
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("name:en")
        if not name:
            return None

        # Exclude theme park attractions and rides
        attraction_tag = tags.get("attraction", "")
        excluded_attractions = {
            "amusement_ride",
            "drop_tower",
            "roller_coaster",
            "carousel",
            "water_slide",
            "dark_ride",
            "bumper_cars",
            "pendulum",
            "log_flume",
            "swing_carousel",
            "free_fall",
            "summer_toboggan",
        }
        if (
            tags.get("tourism") == "theme_park"
            or attraction_tag in excluded_attractions
        ):
            return None

        osm_id = str(element.get("id", ""))
        el_type = element.get("type", "node")
        lat = element.get("lat") or (element.get("center", {}).get("lat"))
        lon = element.get("lon") or (element.get("center", {}).get("lon"))
        if not lat or not lon:
            return None

        category = "attraction"
        if tags.get("tourism") == "museum":
            category = "museum"
        elif tags.get("historic") in ["monument", "ruins", "castle"]:
            category = "monument"
        elif tags.get("amenity") in ["restaurant", "cafe", "bar", "pub"]:
            category = "restaurant"

        opening_hours = tags.get("opening_hours")
        duration = (
            120 if category == "museum" else (60 if category == "restaurant" else 45)
        )

        fee_tag = tags.get("fee", "").lower()
        is_free = False
        estimated_cost = None
        is_estimated = True
        price_source = "category_benchmark_estimate"

        if fee_tag in ["no", "false", "0"]:
            is_free = True
            estimated_cost = 0.0
            is_estimated = False
            price_source = "osm_fee_tag_free"
        elif fee_tag in ["yes", "true"]:
            is_free = False

        charge_tag = tags.get("charge")
        if charge_tag:
            try:
                # Extract numeric value e.g. "15 EUR", "12 €", "8.50"
                cleaned = re.sub(r"[^\d.]", " ", charge_tag)
                nums = [
                    float(p)
                    for p in cleaned.split()
                    if p and p.replace(".", "", 1).isdigit()
                ]
                if nums:
                    estimated_cost = nums[0]
                    is_free = estimated_cost == 0
                    is_estimated = False
                    price_source = "osm_charge_tag"
            except Exception:
                pass

        if estimated_cost is None:
            is_estimated = True
            if is_free:
                estimated_cost = 0.0
                is_estimated = False
                price_source = "osm_fee_tag_free"
            elif category == "museum":
                estimated_cost = 14.00
                price_source = "category_benchmark_estimate"
            elif category == "monument":
                estimated_cost = 10.00
                price_source = "category_benchmark_estimate"
            elif category in ["park", "viewpoint"]:
                estimated_cost = 0.00
                is_free = True
                price_source = "category_benchmark_estimate"
            elif category == "restaurant":
                estimated_cost = 25.00
                price_source = "category_benchmark_estimate"
            else:
                estimated_cost = 5.00
                price_source = "category_benchmark_estimate"

        return Attraction(
            id=f"OSM-{el_type}-{osm_id}",
            category=category,
            name=name,
            location=Location(latitude=lat, longitude=lon),
            schedule=AttractionSchedule(
                osm_opening_hours=opening_hours, recommended_duration_minutes=duration
            ),
            financials=AttractionFinancials(
                is_free=is_free,
                estimated_cost=estimated_cost,
                currency="EUR",
                is_estimated=is_estimated,
                price_source=price_source,
            ),
            scoring=Scoring(rating=0.0, reviews=0),
            metadata=Metadata(
                scraped_at=datetime.now(timezone.utc), source="openstreetmap"
            ),
        )

    async def _get_city_coordinates(self, city: str) -> tuple[float, float] | None:
        city_clean = city.strip().lower()
        from app.use_cases.fetch_travel_context import KNOWN_CITY_CENTERS

        if city_clean in KNOWN_CITY_CENTERS:
            return KNOWN_CITY_CENTERS[city_clean]
        for k, coords in KNOWN_CITY_CENTERS.items():
            if k in city_clean or city_clean in k:
                return coords

        global _nominatim_last_called, _nominatim_lock
        try:
            import urllib.parse

            async with _nominatim_lock:
                now = time.time()
                elapsed = now - _nominatim_last_called
                if elapsed < 1.0:
                    await asyncio.sleep(1.0 - elapsed)
                _nominatim_last_called = time.time()

            q = urllib.parse.quote(city)
            url = (
                f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
            )
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    url, headers={"User-Agent": "Paladio-Static-Ingester/1.0"}
                )
                if resp.status_code == 200 and resp.json():
                    data = resp.json()[0]
                    return float(data["lat"]), float(data["lon"])
        except Exception as e:
            logger.error(f"Failed to geocode {city}: {e}")
        return None

    async def _execute_query(self, query: str) -> dict:
        headers = {
            "Accept": "application/json",
            "User-Agent": "Paladio-Static-Ingester/1.0",
        }
        timeout = httpx.Timeout(25.0, connect=15.0)

        for endpoint in OVERPASS_ENDPOINTS:
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        endpoint, data={"data": query}, headers=headers
                    )
                    response.raise_for_status()
                    return response.json()
            except Exception:
                continue

        raise RuntimeError("All Overpass API endpoints failed or timed out.")
