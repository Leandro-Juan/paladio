import logging
from datetime import datetime, timezone

from app.domain.interfaces.poi_provider import IPoiProvider
from app.domain.interfaces.poi_repository import IPoiRepository
from app.schemas.scraper import Attraction
from app.tasks import refresh_city_pois_task

logger = logging.getLogger(__name__)

STALE_TTL_DAYS = 180


def is_poi_match(mandatory_name: str, poi_name: str) -> bool:
    m_lower = mandatory_name.lower()
    p_lower = poi_name.lower()
    if m_lower in p_lower or p_lower in m_lower:
        return True
    m_words = [
        w
        for w in m_lower.split()
        if len(w) >= 3
        and w not in ("museum", "the", "del", "de", "la", "el", "of", "and")
    ]
    return bool(m_words and any(w in p_lower for w in m_words))


async def get_attractions_for_city(
    city_name: str,
    poi_repo: IPoiRepository,
    poi_provider: IPoiProvider,
    mandatory_names: list[str] | None = None,
) -> list[dict]:
    """
    Retrieves POIs for a city using a Stale-While-Revalidate (SWR) pattern.
    Uses Dependency Injection for the repository and provider to allow in-memory testing.
    """
    city_name = city_name.strip().title()
    logger.info(f"Retrieving POIs for {city_name}...")

    # 1. Query the repository
    pois = await poi_repo.find_by_city(city_name)

    # 2. Cache Miss or Missing Mandatory POIs
    missing_mandatory = []
    if pois and mandatory_names:
        for m_name in mandatory_names:
            if not any(is_poi_match(m_name, p.name) for p in pois):
                missing_mandatory.append(m_name)

    if not pois or missing_mandatory:
        logger.warning(
            f"Cache miss or missing mandatory POIs for {city_name}. Blocking to fetch fresh data..."
        )
        new_pois = await _fetch_and_store_pois(
            city_name, poi_repo, poi_provider, mandatory_names
        )

        # If we already had pois, append the newly fetched ones
        if pois:
            # We only really care about the new mandatory ones to return, but let's just
            # return the union of the old ones + new ones.
            # (In a real app, _fetch_and_store_pois might fetch everything again, so
            # we just re-query the repo to get the complete merged list)
            pois = await poi_repo.find_by_city(city_name)
        else:
            pois = new_pois

        return [poi.model_dump(mode="json") for poi in pois]

    first_poi_date = pois[0].metadata.scraped_at
    if first_poi_date.tzinfo is None:
        first_poi_date = first_poi_date.replace(tzinfo=timezone.utc)

    age_days = (datetime.now(timezone.utc) - first_poi_date).days

    # 3. Cache Hit (Fresh)
    if age_days <= STALE_TTL_DAYS:
        logger.info(
            f"Cache hit for {city_name} (Age: {age_days} days). Returning instantly."
        )
        return [poi.model_dump(mode="json") for poi in pois]

    # 4. Stale-While-Revalidate (Stale)
    logger.info(
        f"Stale data for {city_name} (Age: {age_days} days). Returning stale data and triggering background SWR refresh."
    )
    refresh_city_pois_task.delay(city_name)

    return [poi.model_dump(mode="json") for poi in pois]


async def _fetch_and_store_pois(
    city_name: str,
    poi_repo: IPoiRepository,
    poi_provider: IPoiProvider,
    mandatory_names: list[str] | None = None,
) -> list[Attraction]:
    """
    Invokes the provider API logic, parses the POIs, and saves them via the repository port.
    """
    attractions = await poi_provider.fetch_attractions(
        city_name, limit=150, mandatory_names=mandatory_names
    )

    if attractions:
        await poi_repo.save_all_for_city(city_name, attractions)
        try:
            import asyncio
            from app.cli.hydrate_pois import hydrate_attractions

            asyncio.create_task(hydrate_attractions(force_all=False))
        except Exception as e:
            logger.debug(f"Could not trigger background POI hydration: {e}")
    return attractions
