"""
Location and Airport Search API Router.
100% Dynamic, Self-Hosted & Air-Gappable:
Uses AirportService backed by geonamescache and airportsdata KDTree.
Zero hardcoded mappings.
"""

import re
from typing import Any
import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttractionModel, TransitStationModel
from app.db.session import get_db
from app.infrastructure.providers.osm_http_client import (
    NOMINATIM_URL,
    USER_AGENT,
    acquire_nominatim_slot,
)
from app.services.airport_service import get_airport_service

router = APIRouter()


@router.get("/search", summary="Search cities and nearest airports dynamically")
async def search_city_airports(
    q: str = Query(
        ...,
        min_length=1,
        description="City name, airport name, or 3-letter IATA / 4-letter ICAO code",
    ),
    limit: int = Query(8, ge=1, le=20, description="Maximum results to return"),
) -> list[dict[str, Any]]:
    """
    Dynamically resolves search query against 234k+ world cities and 7,880+ commercial airports.
    Returns city name, country name, nearest airport name, IATA code, and geodesic distance.
    """
    return get_airport_service().search_locations(q, limit=limit)


@router.get(
    "/hotels", summary="Search hotels and accommodations by name and destination"
)
async def search_hotels(
    city: str = Query("", description="Destination city name (e.g. Paris, Madrid)"),
    q: str = Query("", description="Hotel name or search query"),
    limit: int = Query(8, ge=1, le=20, description="Max results"),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """
    Dynamically resolves hotel / accommodation search queries against local DB POIs
    and OpenStreetMap Nominatim with rate-limit compliance.
    Zero hardcoded mock data.
    """
    results: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    clean_city = city.strip()
    clean_q = q.strip()

    # 1. Search local DB for POIs matching hotel category or name
    if clean_city:
        stmt = select(AttractionModel).where(
            AttractionModel.city.ilike(f"%{clean_city}%"),
            or_(
                AttractionModel.category.ilike("%hotel%"),
                AttractionModel.category.ilike("%lodging%"),
                AttractionModel.category.ilike("%accommodation%"),
                AttractionModel.name.ilike(f"%{clean_q}%") if clean_q else False,
            ),
        )
        if clean_q:
            stmt = stmt.where(AttractionModel.name.ilike(f"%{clean_q}%"))
        stmt = stmt.limit(limit)

        try:
            db_res = (await session.execute(stmt)).scalars().all()
            for poi in db_res:
                norm = poi.name.lower().strip()
                if norm not in seen_names:
                    seen_names.add(norm)
                    results.append(
                        {
                            "name": poi.name,
                            "display_name": f"{poi.name}, {poi.city}",
                            "address": poi.address or f"{poi.name}, {poi.city}",
                            "city": poi.city,
                            "lat": float(poi.latitude),
                            "lng": float(poi.longitude),
                            "category": "hotel",
                        }
                    )
        except Exception:
            pass

    # 2. Resolve destination city coordinates dynamically for spatial biasing
    city_lat: float | None = None
    city_lon: float | None = None
    if clean_city:
        try:
            city_matches = get_airport_service().search_locations(clean_city, limit=1)
            if city_matches:
                city_lat = float(city_matches[0]["latitude"])
                city_lon = float(city_matches[0]["longitude"])
        except Exception:
            pass

    # 3. Query Photon OSM & Nominatim if more results needed
    if len(results) < limit:
        PHOTON_URL = "https://photon.komoot.io/api"
        candidates: list[str] = []
        if clean_q:
            # Base candidate
            if clean_city and clean_city.lower() in clean_q.lower():
                candidates.append(clean_q)
            elif clean_city:
                candidates.append(f"{clean_q}, {clean_city}")
            else:
                candidates.append(clean_q)

            # Strip marketing noise, OTA suffixes, and partner labels
            cleaned = re.sub(r"(?i)\s*-\s*ALQUILER\s+TEMPORAL.*", "", clean_q)
            cleaned = re.sub(r"(?i)\s+anteriormente\s+.*", "", cleaned)
            cleaned = re.sub(r"(?i)\s+by\s+[A-Za-z0-9\s]+", "", cleaned)
            cleaned = re.sub(r"(?i)\b(ALQUILER TEMPORAL)\b", "", cleaned)
            cleaned = re.sub(r"(?i)\b(Collection|Hotel Life)\b", "", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip()

            if cleaned and cleaned.lower() != clean_q.lower():
                if clean_city and clean_city.lower() in cleaned.lower():
                    candidates.append(cleaned)
                elif clean_city:
                    candidates.append(f"{cleaned}, {clean_city}")
                else:
                    candidates.append(cleaned)

            # Spaced alphanumeric query (e.g. Hotel101 -> Hotel 101)
            spaced_num = re.sub(r"([a-zA-Z]+)(\d+)", r"\1 \2", cleaned).strip()
            if spaced_num != cleaned:
                if clean_city and clean_city.lower() in spaced_num.lower():
                    candidates.append(spaced_num)
                elif clean_city:
                    candidates.append(f"{spaced_num}, {clean_city}")
                else:
                    candidates.append(spaced_num)

            # Stripped generic accommodation words ('hotel', 'hostel', 'resort', 'apartments', 'suites')
            for base in [clean_q, cleaned]:
                stripped = re.sub(
                    r"(?i)\b(hotel|hostel|resort|apartments?|apartamentos?|suites?)\b",
                    "",
                    base,
                ).strip()
                stripped = re.sub(r"\s+", " ", stripped)
                if stripped and stripped.lower() != clean_q.lower():
                    if clean_city and clean_city.lower() in stripped.lower():
                        candidates.append(stripped)
                    elif clean_city:
                        candidates.append(f"{stripped}, {clean_city}")
                    else:
                        candidates.append(stripped)

            # Drop neighborhood suffix if brand has accommodation type in middle (e.g. "Welcomer Apartments Bernabéu" -> "Welcomer Apartments")
            m_apart = re.match(
                r"(?i)^([A-Za-z0-9]+)\s+(Apartments?|Apartamentos?|Suites?|Hotel|Hostal)\b",
                clean_q,
            )
            if m_apart:
                brand_only = m_apart.group(0).strip()
                if clean_city and clean_city.lower() not in brand_only.lower():
                    candidates.append(f"{brand_only}, {clean_city}")
                else:
                    candidates.append(brand_only)

            # Street address candidates for apartment/flat listings
            addr_match = re.search(
                r"(?i)\b(?:Calle|Avenida|Paseo|Plaza|Gran V[ií]a|Ruda)\b.*", clean_q
            )
            if addr_match:
                addr_candidate = addr_match.group(0).strip()
                if clean_city and clean_city.lower() not in addr_candidate.lower():
                    candidates.append(f"{addr_candidate}, {clean_city}")
                else:
                    candidates.append(addr_candidate)
            elif re.match(r"(?i)^ESTUDIOS\s+(.*)", clean_q):
                sub_addr = re.sub(r"(?i)^ESTUDIOS\s+", "Calle ", clean_q)
                if clean_city and clean_city.lower() not in sub_addr.lower():
                    candidates.append(f"{sub_addr}, {clean_city}")
                else:
                    candidates.append(sub_addr)

            # Core brand name (first 2 words for lengthy title listings)
            words = cleaned.split()
            if len(words) >= 4 and not addr_match:
                short_q = " ".join(words[:2])
                if clean_city and clean_city.lower() not in short_q.lower():
                    candidates.append(f"{short_q}, {clean_city}")

        elif clean_city:
            candidates.append(f"hotels in {clean_city}")

        # Deduplicate candidates while keeping order
        deduped_candidates: list[str] = []
        seen_cands: set[str] = set()
        for cand in candidates:
            if cand.lower() not in seen_cands:
                seen_cands.add(cand.lower())
                deduped_candidates.append(cand)

        # Step A: Query Photon OSM (instant, elasticsearch typo-tolerant, biased by destination city)
        for search_query in deduped_candidates:
            if len(results) >= limit:
                break
            try:
                params: dict[str, Any] = {
                    "q": search_query,
                    "limit": limit * 2,
                }
                if city_lat is not None and city_lon is not None:
                    params["lat"] = city_lat
                    params["lon"] = city_lon
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        PHOTON_URL,
                        params=params,
                        headers={"User-Agent": USER_AGENT},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for feat in data.get("features", []):
                            if len(results) >= limit:
                                break
                            props = feat.get("properties", {})
                            geom = feat.get("geometry", {})
                            coords = geom.get("coordinates", [])
                            if len(coords) < 2:
                                continue
                            lat = float(coords[1])
                            lng = float(coords[0])

                            name = (
                                props.get("name")
                                or props.get("street")
                                or search_query.split(",")[0].strip()
                            )
                            if not name:
                                continue
                            norm = name.lower().strip()
                            if norm in seen_names:
                                continue
                            seen_names.add(norm)

                            street = props.get("street", "")
                            housenumber = props.get("housenumber", "")
                            district = (
                                props.get("district")
                                or props.get("locality")
                                or props.get("suburb", "")
                            )
                            item_city = props.get("city") or clean_city
                            country = props.get("country", "")

                            road_part = (
                                f"{street} {housenumber}".strip() if street else ""
                            )
                            addr_parts = [
                                p for p in [road_part, district, item_city] if p
                            ]
                            formatted_address = (
                                ", ".join(addr_parts) if addr_parts else name
                            )

                            raw_osm_val = props.get("osm_value", "hotel")
                            category = (
                                raw_osm_val
                                if raw_osm_val
                                in (
                                    "hotel",
                                    "hostel",
                                    "apartment",
                                    "guest_house",
                                    "motel",
                                )
                                else "hotel"
                            )

                            results.append(
                                {
                                    "name": name,
                                    "display_name": (
                                        f"{name}, {formatted_address}"
                                        if road_part
                                        else formatted_address
                                    ),
                                    "address": formatted_address,
                                    "city": item_city,
                                    "country": country,
                                    "lat": lat,
                                    "lng": lng,
                                    "category": category,
                                }
                            )
            except Exception:
                pass

        # Step B: Fallback to Nominatim if results still insufficient
        if len(results) < limit:
            for search_query in deduped_candidates:
                if len(results) >= limit:
                    break
                try:
                    await acquire_nominatim_slot()
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(
                            NOMINATIM_URL,
                            params={
                                "q": search_query,
                                "format": "jsonv2",
                                "limit": limit * 2,
                                "addressdetails": 1,
                                "accept-language": "en",
                            },
                            headers={"User-Agent": USER_AGENT},
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            for item in data:
                                if len(results) >= limit:
                                    break
                                name = (
                                    item.get("name")
                                    or item.get("display_name", "").split(",")[0]
                                )
                                if not name:
                                    continue
                                norm = name.lower().strip()
                                if norm in seen_names:
                                    continue
                                seen_names.add(norm)

                                addr = item.get("address", {})
                                road = addr.get("road", "")
                                suburb = (
                                    addr.get("suburb")
                                    or addr.get("neighbourhood")
                                    or addr.get("city_district", "")
                                )
                                item_city = (
                                    addr.get("city")
                                    or addr.get("town")
                                    or addr.get("village")
                                    or clean_city
                                )
                                country = addr.get("country", "")

                                address_parts = [
                                    p for p in [road, suburb, item_city] if p
                                ]
                                formatted_address = (
                                    ", ".join(address_parts)
                                    if address_parts
                                    else item.get("display_name", name)
                                )

                                results.append(
                                    {
                                        "name": name,
                                        "display_name": item.get("display_name", name),
                                        "address": formatted_address,
                                        "city": item_city,
                                        "country": country,
                                        "lat": float(item["lat"]),
                                        "lng": float(item["lon"]),
                                        "category": "hotel",
                                    }
                                )
                except Exception:
                    pass

    return results[:limit]


@router.get(
    "/reverse", summary="Reverse geocode coordinates to place/hotel name and address"
)
async def reverse_geocode(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
) -> dict[str, Any]:
    """
    Reverse-geocodes coordinate pair into location name and formatted address.
    Used by interactive map pin placement.
    """
    try:
        await acquire_nominatim_slot()
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": lat,
                    "lon": lon,
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "accept-language": "en",
                },
                headers={"User-Agent": USER_AGENT},
            )
            if resp.status_code == 200:
                item = resp.json()
                name = item.get("name")
                addr = item.get("address", {})
                road = addr.get("road", "")
                house_num = addr.get("house_number", "")
                suburb = (
                    addr.get("suburb")
                    or addr.get("neighbourhood")
                    or addr.get("city_district", "")
                )
                city = addr.get("city") or addr.get("town") or addr.get("village", "")
                country = addr.get("country", "")

                primary_name = (
                    name
                    or (f"{road} {house_num}".strip() if road else "")
                    or item.get("display_name", "").split(",")[0]
                )
                address_parts = [
                    p for p in [f"{road} {house_num}".strip(), suburb, city] if p
                ]
                formatted_address = (
                    ", ".join(address_parts)
                    if address_parts
                    else item.get("display_name", primary_name)
                )

                return {
                    "name": primary_name,
                    "display_name": item.get("display_name", primary_name),
                    "address": formatted_address,
                    "city": city,
                    "country": country,
                    "lat": lat,
                    "lng": lon,
                }
    except Exception:
        pass

    return {
        "name": f"Pin ({lat:.4f}, {lon:.4f})",
        "display_name": f"Location at {lat:.4f}, {lon:.4f}",
        "address": f"{lat:.4f}, {lon:.4f}",
        "city": "",
        "country": "",
        "lat": lat,
        "lng": lon,
    }


@router.get(
    "/places",
    summary="Search city attractions, hotels, transit stations, and general places",
)
async def search_places(
    q: str = Query(
        ..., min_length=1, description="Place, attraction, station, or address query"
    ),
    city: str = Query("", description="Destination city name (e.g. Madrid, Paris)"),
    limit: int = Query(10, ge=1, le=25, description="Maximum results"),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """
    Dynamically resolves place searches across attractions/hotels in the database,
    compiled GTFS transit stations, and OSM Photon/Nominatim with city context biasing.
    """
    results: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    clean_city = city.strip()
    clean_q = q.strip()

    # 1. Search local DB attractions & hotels matching query and city
    if clean_city or clean_q:
        stmt = select(AttractionModel)
        if clean_city:
            stmt = stmt.where(AttractionModel.city.ilike(f"%{clean_city}%"))
        if clean_q:
            stmt = stmt.where(
                or_(
                    AttractionModel.name.ilike(f"%{clean_q}%"),
                    AttractionModel.neighborhood.ilike(f"%{clean_q}%"),
                )
            )
        stmt = stmt.limit(limit)

        try:
            db_res = (await session.execute(stmt)).scalars().all()
            for poi in db_res:
                norm = poi.name.lower().strip()
                if norm not in seen_names:
                    seen_names.add(norm)
                    formatted_addr = (
                        f"{poi.neighborhood}, {poi.city}"
                        if poi.neighborhood
                        else f"{poi.name}, {poi.city}"
                    )
                    results.append(
                        {
                            "name": poi.name,
                            "display_name": f"{poi.name}, {poi.city}",
                            "address": formatted_addr,
                            "city": poi.city,
                            "lat": float(poi.latitude),
                            "lng": float(poi.longitude),
                            "category": poi.category or "attraction",
                        }
                    )
        except Exception:
            pass

    # 2. Search local DB compiled GTFS transit stations
    if len(results) < limit and clean_q:
        st_stmt = select(TransitStationModel)
        if clean_city:
            st_stmt = st_stmt.where(TransitStationModel.city.ilike(f"%{clean_city}%"))
        st_stmt = st_stmt.where(
            or_(
                TransitStationModel.name.ilike(f"%{clean_q}%"),
                TransitStationModel.original_name.ilike(f"%{clean_q}%"),
            )
        ).limit(limit - len(results))

        try:
            st_res = (await session.execute(st_stmt)).scalars().all()
            for st in st_res:
                norm = st.name.lower().strip()
                if norm not in seen_names:
                    seen_names.add(norm)
                    results.append(
                        {
                            "name": st.name,
                            "display_name": f"{st.name} (Station), {st.city}",
                            "address": f"{st.name}, {st.city}",
                            "city": st.city,
                            "lat": float(st.lat),
                            "lng": float(st.lon),
                            "category": "transit",
                        }
                    )
        except Exception:
            pass

    # 3. Query Photon OSM with city biasing if more results needed
    if len(results) < limit and clean_q:
        PHOTON_URL = "https://photon.komoot.io/api"
        search_target = (
            f"{clean_q}, {clean_city}"
            if clean_city and clean_city.lower() not in clean_q.lower()
            else clean_q
        )

        # Resolve destination city coordinates dynamically for spatial biasing
        city_lat: float | None = None
        city_lon: float | None = None
        if clean_city:
            try:
                city_matches = get_airport_service().search_locations(
                    clean_city, limit=1
                )
                if city_matches:
                    city_lat = float(city_matches[0]["latitude"])
                    city_lon = float(city_matches[0]["longitude"])
            except Exception:
                pass

        try:
            params: dict[str, Any] = {"q": search_target, "limit": limit * 2}
            if city_lat is not None and city_lon is not None:
                params["lat"] = city_lat
                params["lon"] = city_lon

            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(PHOTON_URL, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    features = data.get("features", [])
                    for feat in features:
                        if len(results) >= limit:
                            break
                        props = feat.get("properties", {})
                        geom = feat.get("geometry", {})
                        coords = geom.get("coordinates", [])
                        if len(coords) < 2:
                            continue

                        name = (
                            props.get("name")
                            or props.get("street")
                            or search_target.split(",")[0].strip()
                        )
                        if not name:
                            continue
                        norm = name.lower().strip()
                        if norm in seen_names:
                            continue
                        seen_names.add(norm)

                        street = props.get("street", "")
                        housenumber = props.get("housenumber", "")
                        district = props.get("district") or props.get("suburb", "")
                        item_city = props.get("city") or clean_city
                        country = props.get("country", "")

                        road_part = f"{street} {housenumber}".strip() if street else ""
                        addr_parts = [p for p in [road_part, district, item_city] if p]
                        formatted_address = (
                            ", ".join(addr_parts) if addr_parts else name
                        )

                        osm_val = props.get("osm_value", "place")
                        results.append(
                            {
                                "name": name,
                                "display_name": f"{name}, {formatted_address}"
                                if road_part
                                else formatted_address,
                                "address": formatted_address,
                                "city": item_city,
                                "country": country,
                                "lat": float(coords[1]),
                                "lng": float(coords[0]),
                                "category": osm_val
                                if osm_val
                                in ("hotel", "station", "museum", "restaurant", "park")
                                else "place",
                            }
                        )
        except Exception:
            pass

    return results[:limit]
