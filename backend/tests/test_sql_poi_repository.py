import pytest
from datetime import datetime, timezone
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)


@pytest.mark.asyncio
async def test_sql_poi_repository_save_and_find(db_session):
    repo = SqlPoiRepository(db_session)

    attraction = Attraction(
        id="test-poi-paris-1",
        category="museum",
        name="The Louvre Test",
        location=Location(latitude=48.8606, longitude=2.3376),
        schedule=AttractionSchedule(
            osm_opening_hours="09:00-18:00", recommended_duration_minutes=180
        ),
        financials=AttractionFinancials(
            is_free=False, estimated_cost=17.0, currency="EUR"
        ),
        scoring=Scoring(rating=4.8, reviews=50000),
        metadata=Metadata(scraped_at=datetime.now(timezone.utc), source="osm"),
    )

    # First save (insert)
    await repo.save_all_for_city("Paris", [attraction])

    # Second save (upsert on conflict)
    await repo.save_all_for_city("Paris", [attraction])

    # Find
    found = await repo.find_by_city("Paris")
    assert len(found) >= 1
    louvre = next((p for p in found if p.id == "test-poi-paris-1"), None)
    assert louvre is not None
    assert louvre.name == "The Louvre Test"
    assert louvre.category == "museum"
    assert louvre.location.latitude == pytest.approx(48.8606)
    assert louvre.metadata.source == "osm"
