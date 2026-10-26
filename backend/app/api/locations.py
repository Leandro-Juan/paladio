"""
Location and Airport Search API Router.
100% Dynamic, Self-Hosted & Air-Gappable:
Uses AirportService backed by geonamescache and airportsdata KDTree.
Zero hardcoded mappings.
"""

from typing import Any
from fastapi import APIRouter, Query

from app.services.airport_service import search_locations

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
    return search_locations(q, limit=limit)
