import logging
from typing import Any

from app.domain.interfaces.poi_repository import IPoiRepository

logger = logging.getLogger(__name__)


async def fetch_restaurants(
    city: str,
    poi_repo: IPoiRepository | None = None,
    test_data: dict[str, Any] | None = None,
    preferred_cuisines: list[str] | None = None,
    target_frequency: int = 1,
) -> list[dict[str, Any]]:
    """Fetches authentic local dining venues for any city from PostgreSQL or live OSM."""
    if test_data and "restaurants" in test_data:
        return test_data["restaurants"]

    result: list[dict[str, Any]] = []

    # 1. Fetch real dining venues from PostgreSQL repository
    db_meals = []
    if poi_repo:
        try:
            db_meals = await poi_repo.find_meal_spots(city, limit=200)
        except Exception as e:
            logger.warning(f"Failed to find meal spots from repository for {city}: {e}")
    else:
        try:
            from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
            from app.db.session import async_session

            async with async_session() as session:
                repo = SqlPoiRepository(session)
                db_meals = await repo.find_meal_spots(city, limit=200)
        except Exception as e:
            logger.warning(f"Failed to query database for meal spots: {e}")

    for m in db_meals:
        loc = (
            m.location
            if isinstance(m.location, dict)
            else {
                "latitude": getattr(m.location, "latitude", 0.0),
                "longitude": getattr(m.location, "longitude", 0.0),
            }
        )
        meta = m.metadata if isinstance(m.metadata, dict) else {}
        result.append(
            {
                "id": m.id,
                "name": m.name,
                "city": city,
                "category": m.category,
                "cuisine": meta.get("cuisine"),
                "location": loc,
                "duration_mins": m.duration_mins or 60,
                "cost_eur": m.cost_eur or 18.0,
                "open_time_mins_by_day": m.open_time_mins_by_day,
                "close_time_mins_by_day": m.close_time_mins_by_day,
                "price_tier": "$$" if (m.cost_eur or 18.0) >= 20 else "$",
                "scoring": (
                    m.scoring
                    if isinstance(m.scoring, dict)
                    else {"rating": 4.5, "reviews": 150}
                ),
                "financials": {"estimated_cost": m.cost_eur or 18.0},
            }
        )

    # 2. If DB has few dining venues, supplement with live Overpass query
    if len(result) < 12:
        from app.infrastructure.providers.overpass_provider import (
            OverpassProviderAdapter,
        )

        provider = OverpassProviderAdapter()
        try:
            extra = await provider.fetch_restaurants(city, limit=30)
            for p in extra:
                if not any(p.name == r["name"] for r in result):
                    result.append(
                        {
                            "id": p.id,
                            "name": p.name,
                            "city": city,
                            "category": p.category,
                            "location": {
                                "latitude": p.location.latitude,
                                "longitude": p.location.longitude,
                            },
                            "price_tier": "$$",
                            "cost_eur": 18.0,
                            "duration_mins": 60,
                            "scoring": {"rating": 4.5, "reviews": 100},
                            "financials": {"estimated_cost": 18.0},
                        }
                    )
        except Exception as e:
            logger.warning(f"Overpass live restaurant fetch failed for {city}: {e}")

    # Prioritize preferred cuisines if specified
    if preferred_cuisines:
        pref = []
        rest = []
        for r in result:
            c = str(r.get("cuisine") or "").lower()
            if any(pc.lower() in c for pc in preferred_cuisines):
                pref.append(r)
            else:
                rest.append(r)
        result = pref + rest

    return result
