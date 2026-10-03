"""Unit tests for Paladio Itinerary v2 Taxonomy and Tiering."""

import pytest

from app.db.models import AttractionModel, PoiTravelCacheModel
from app.engine.v2.taxonomy import (
    CANONICAL_CATEGORIES,
    CATEGORY_ID_TO_NAME,
    classify_poi_taxonomy,
)
from app.engine.v2.tiering import classify_poi_tier, get_seed_store


def test_taxonomy_canonical_categories():
    """Verify that canonical taxonomy has exactly 8 categories matching IDs 0 to 7."""
    assert len(CANONICAL_CATEGORIES) == 8
    expected_categories = [
        "art_culture",
        "history_heritage",
        "nature_outdoors",
        "architecture",
        "food_culinary",
        "nightlife",
        "shopping",
        "scenic_views",
    ]
    for idx, cat_name in enumerate(expected_categories):
        assert CANONICAL_CATEGORIES[cat_name] == idx
        assert CATEGORY_ID_TO_NAME[idx] == cat_name


def test_taxonomy_classification_keywords():
    """Verify keyword patterns correctly map POIs to taxonomy categories."""
    cases = [
        ("Miradouro de Santa Luzia", "attraction", "scenic_views", 7),
        ("Shibuya Crossing", "attraction", "scenic_views", 7),
        ("Musée d'Orsay", "museum", "art_culture", 0),
        ("Catacombes de Paris", "monument", "history_heritage", 1),
        ("Parc des Buttes-Chaumont", "attraction", "nature_outdoors", 2),
        ("Aqueduto das Águas Livres", "monument", "architecture", 3),
        ("Bistrot Paul Bert", "restaurant", "food_culinary", 4),
        ("Red Frog Speakeasy Bar", "bar", "nightlife", 5),
        ("Mercado da Ribeira", "shopping", "shopping", 6),
    ]
    for name, cat, expected_tax, expected_id in cases:
        tax_name, tax_id = classify_poi_taxonomy(name, cat)
        assert (
            tax_name == expected_tax
        ), f"Failed for {name}: got {tax_name}, expected {expected_tax}"
        assert tax_id == expected_id


def test_city_seed_store_loading():
    """Verify that seed files load properly across all 5 cities."""
    store = get_seed_store()
    for city in ["Paris", "Madrid", "Lisbon", "Porto", "Tokyo"]:
        # Each city should have at least 10 curated seeds
        assert (
            len(store._cache.get(city.lower(), {})) >= 10
        ), f"City {city} has too few seeds in store"


def test_classify_poi_tier_seeded():
    """Verify that seeded POIs receive high confidence and exact seed data."""
    store = get_seed_store()

    # Paris Tier 1
    res_paris = classify_poi_tier({"name": "Catacombes de Paris"}, "Paris", store)
    assert res_paris["tier"] == 1
    assert res_paris["tier_source"] == "seed"
    assert res_paris["tier_confidence"] == "high"
    assert res_paris["iconicity_score"] >= 0.90
    assert res_paris["taxonomy_category"] == "history_heritage"
    assert res_paris["category_id"] == 1

    # Tokyo Tier 1
    res_tokyo = classify_poi_tier({"name": "Watch Shibuya Crossing"}, "Tokyo", store)
    assert res_tokyo["tier"] == 1
    assert res_tokyo["tier_source"] == "seed"
    assert res_tokyo["visit_mode"] == "quick"
    assert res_tokyo["taxonomy_category"] == "scenic_views"
    assert res_tokyo["category_id"] == 7

    # Lisbon Tier 1
    res_lisbon = classify_poi_tier(
        {"name": "Miradouro do Castelo de São Jorge"}, "Lisbon", store
    )
    assert res_lisbon["tier"] == 1
    assert res_lisbon["visit_mode"] == "quick"

    # Madrid Tier 2
    res_madrid = classify_poi_tier({"name": "Museo Sorolla"}, "Madrid", store)
    assert res_madrid["tier"] == 2
    assert res_madrid["tier_source"] == "seed"
    assert res_madrid["tier_confidence"] == "high"


def test_classify_poi_tier_heuristic_fallback():
    """Verify that unseeded POIs receive deterministic heuristic tiering with low confidence."""
    store = get_seed_store()

    poi = {
        "name": "Random Local Neighborhood Park",
        "category": "attraction",
        "duration_mins": 30,
        "cost_eur": 0.0,
    }
    res = classify_poi_tier(poi, "Paris", store)
    assert res["tier_source"] == "heuristic"
    assert res["tier_confidence"] == "low"
    assert res["taxonomy_category"] == "nature_outdoors"
    assert res["category_id"] == 2
    assert res["visit_mode"] == "quick"
    assert 0.10 <= res["iconicity_score"] <= 0.65


def test_attraction_model_v2_columns():
    """Verify AttractionModel has the new v2 columns with expected defaults."""
    model = AttractionModel(
        id="test-poi-1",
        city="Paris",
        name="Test Attraction",
        category="attraction",
        location={"latitude": 48.8566, "longitude": 2.3522},
        scoring={"rating": 0.0, "reviews": 0},
        metadata_field={"source": "test"},
    )
    assert hasattr(model, "tier")
    assert hasattr(model, "tier_confidence")
    assert hasattr(model, "tier_source")
    assert hasattr(model, "iconicity_score")
    assert hasattr(model, "taxonomy_category")
    assert hasattr(model, "category_id")
    assert hasattr(model, "visit_mode")


def test_poi_travel_cache_model():
    """Verify PoiTravelCacheModel schema."""
    entry = PoiTravelCacheModel(
        origin_id="poi-1",
        destination_id="poi-2",
        mode="transit",
        duration_mins=22.5,
        cost_eur=2.15,
        distance_km=4.8,
    )
    assert entry.origin_id == "poi-1"
    assert entry.destination_id == "poi-2"
    assert entry.mode == "transit"
    assert entry.duration_mins == 22.5
    assert entry.cost_eur == 2.15
    assert entry.distance_km == 4.8


@pytest.mark.asyncio
async def test_sql_poi_travel_cache_repository(db_session):
    """Verify SqlPoiTravelCacheRepository saves and retrieves pairwise cached travel."""
    from app.adapters.repositories.sql_poi_travel_cache_repository import (
        SqlPoiTravelCacheRepository,
    )

    import uuid

    uid1 = f"test-cache-poi-{uuid.uuid4().hex[:8]}"
    uid2 = f"test-cache-poi-{uuid.uuid4().hex[:8]}"

    p1 = AttractionModel(
        id=uid1,
        city="Paris",
        name="Test Cache POI 1",
        category="attraction",
        location={"latitude": 48.85, "longitude": 2.35},
        scoring={"rating": 0.0, "reviews": 0},
        metadata_field={"source": "test"},
    )
    p2 = AttractionModel(
        id=uid2,
        city="Paris",
        name="Test Cache POI 2",
        category="attraction",
        location={"latitude": 48.86, "longitude": 2.36},
        scoring={"rating": 0.0, "reviews": 0},
        metadata_field={"source": "test"},
    )
    db_session.add_all([p1, p2])
    await db_session.flush()

    repo = SqlPoiTravelCacheRepository(db_session)

    # Save test pair
    test_entries = [
        {
            "origin_id": p1.id,
            "destination_id": p2.id,
            "mode": "transit",
            "duration_mins": 18.5,
            "cost_eur": 2.10,
            "distance_km": 3.4,
        },
        {
            "origin_id": p2.id,
            "destination_id": p1.id,
            "mode": "transit",
            "duration_mins": 19.0,
            "cost_eur": 2.10,
            "distance_km": 3.4,
        },
    ]
    await repo.save_travel_pairs(test_entries)

    # Retrieve
    cached = await repo.get_cached_pairs([p1.id, p2.id], mode="transit")
    assert (p1.id, p2.id) in cached
    assert cached[(p1.id, p2.id)]["duration_mins"] == 18.5
    assert cached[(p1.id, p2.id)]["cost_eur"] == 2.10
    assert (p2.id, p1.id) in cached
    assert cached[(p2.id, p1.id)]["duration_mins"] == 19.0
