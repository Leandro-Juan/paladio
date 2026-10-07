"""Unit tests for City domain entity and SqlCityRepository adapter."""

import pytest

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.domain.entities.city import City


@pytest.mark.asyncio
async def test_city_repository_crud(db_session):
    repo = SqlCityRepository(db_session)

    valencia = City(
        id="valencia_es",
        name="Valencia",
        aliases=["valencia", "València", "Valencia, Spain"],
        country_code="ES",
        center_lat=39.4699,
        center_lon=-0.3763,
        bbox=[39.40, -0.42, 39.52, -0.32],
        radius_km=6.5,
        timezone="Europe/Madrid",
        currency="EUR",
        profile={"source": "test"},
    )

    # 1. Save / Insert
    saved = await repo.save_city(valencia)
    assert saved.id == "valencia_es"

    # 2. Get by ID
    fetched = await repo.get_by_id("valencia_es")
    assert fetched is not None
    assert fetched.name == "Valencia"
    assert fetched.country_code == "ES"
    assert fetched.currency == "EUR"
    assert fetched.center == (39.4699, -0.3763)

    # 3. Find by exact name case-insensitive
    by_name = await repo.find_by_name_or_alias("valencia")
    assert by_name is not None
    assert by_name.id == "valencia_es"

    # 4. Find by alias
    by_alias = await repo.find_by_name_or_alias("València")
    assert by_alias is not None
    assert by_alias.id == "valencia_es"

    # 5. Non-existent city returns None
    assert await repo.find_by_name_or_alias("non_existent_city_xyz") is None

    # 6. Upsert / Update
    valencia.radius_km = 8.0
    await repo.save_city(valencia)
    updated = await repo.get_by_id("valencia_es")
    assert updated.radius_km == 8.0

    # 7. List cities
    all_cities = await repo.list_cities()
    assert any(c.id == "valencia_es" for c in all_cities)
