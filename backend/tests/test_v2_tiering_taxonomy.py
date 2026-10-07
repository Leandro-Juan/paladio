"""Unit tests for Paladio Itinerary v2 Taxonomy and Tiering."""

import pytest
from app.db.models import AttractionModel, PoiTravelCacheModel
from app.engine.v2.taxonomy import (
    CANONICAL_CATEGORIES,
    CATEGORY_ID_TO_NAME,
    classify_poi_taxonomy,
)
from app.engine.v2.tiering import classify_poi_tier


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


def test_classify_poi_tier_with_osm_signals():
    """Verify that a POI with strong OSM signals automatically achieves Tier 1 without any seed."""
    high_signal_poi = {
        "name": "Cathedral of Saint Mary of the See",
        "category": "monument",
        "duration_mins": 90,
        "cost_eur": 12.0,
        "metadata": {
            "osm": {
                "wikidata": True,
                "wikipedia": True,
                "n_langs": 25,
                "unesco": True,
                "heritage": "world",
                "importance_raw": 13.5,
            }
        },
    }
    res = classify_poi_tier(high_signal_poi, "Seville")
    assert res["tier"] == 1
    assert res["tier_source"] == "osm_signals"
    assert res["tier_confidence"] == "high"
    assert res["iconicity_score"] >= 0.85
    assert res["taxonomy_category"] == "architecture"


def test_tier_city_attractions_relative_ranking():
    """Verify that tier_city_attractions ranks sights by importance and creates balanced tiers."""
    from app.engine.v2.tiering import tier_city_attractions

    batch = [
        {
            "id": "1",
            "name": "World Renowned Historic Monument",
            "category": "monument",
            "duration_mins": 120,
            "cost_eur": 15.0,
            "metadata": {"osm": {"importance_raw": 12.0, "wikidata": True}},
        },
        {
            "id": "2",
            "name": "Prominent City Art Museum",
            "category": "museum",
            "duration_mins": 90,
            "cost_eur": 10.0,
            "metadata": {"osm": {"importance_raw": 8.5, "wikidata": True}},
        },
        {
            "id": "3",
            "name": "Famous Central Public Plaza",
            "category": "monument",
            "duration_mins": 45,
            "cost_eur": 0.0,
            "metadata": {"osm": {"importance_raw": 5.0, "wikidata": True}},
        },
        {
            "id": "4",
            "name": "Local District Viewpoint",
            "category": "attraction",
            "duration_mins": 30,
            "cost_eur": 0.0,
            "metadata": {"osm": {"importance_raw": 2.5}},
        },
        {
            "id": "5",
            "name": "Small Neighborhood Fountain",
            "category": "attraction",
            "duration_mins": 15,
            "cost_eur": 0.0,
            "metadata": {"osm": {"importance_raw": 0.2}},
        },
    ]

    tiered = tier_city_attractions(batch, "AnyCity")
    by_name = {r["name"]: r for r in tiered}

    assert by_name["World Renowned Historic Monument"]["tier"] == 1
    assert by_name["World Renowned Historic Monument"]["iconicity_score"] >= 0.85

    assert by_name["Prominent City Art Museum"]["tier"] == 1
    assert by_name["Prominent City Art Museum"]["iconicity_score"] >= 0.85

    assert by_name["Famous Central Public Plaza"]["tier"] == 1
    assert by_name["Famous Central Public Plaza"]["iconicity_score"] >= 0.85

    assert by_name["Local District Viewpoint"]["tier"] == 2
    assert 0.60 <= by_name["Local District Viewpoint"]["iconicity_score"] <= 0.84

    assert by_name["Small Neighborhood Fountain"]["tier"] == 4
    assert by_name["Small Neighborhood Fountain"]["iconicity_score"] == 0.10


def test_classify_poi_tier_heuristic_fallback():
    """Verify that unseeded POIs receive deterministic heuristic tiering with low confidence."""
    poi = {
        "name": "Random Local Neighborhood Park",
        "category": "attraction",
        "duration_mins": 30,
        "cost_eur": 0.0,
    }
    res = classify_poi_tier(poi, "Paris")
    assert res["tier_source"] == "heuristic"
    assert res["tier_confidence"] == "low"
    assert res["taxonomy_category"] == "nature_outdoors"
    assert res["category_id"] == 2
    assert res["visit_mode"] == "quick"
    assert res["tier"] in (3, 4)
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
    import uuid

    from app.adapters.repositories.sql_poi_travel_cache_repository import (
        SqlPoiTravelCacheRepository,
    )

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


def test_taxonomy_tag_first_classification_and_unknown_fallback():
    """Verify structured OSM tags take precedence over name patterns, and unknown venues fallback cleanly."""
    from app.engine.v2.taxonomy import UNKNOWN_CATEGORY, UNKNOWN_CATEGORY_ID

    # 1. Structured tag override: name contains 'Art' and category 'museum', but amenity tag is 'bar'
    tax_name, tax_id = classify_poi_taxonomy(
        name="Art & Culture Meeting Point",
        category="museum",
        metadata={"tags": {"amenity": "bar"}},
    )
    assert tax_name == "nightlife"
    assert tax_id == 5

    # 2. Viewpoint tag overrides generic attraction
    tax_name, tax_id = classify_poi_taxonomy(
        name="High Rise Tower Deck",
        category="attraction",
        metadata={"tags": {"tourism": "viewpoint"}},
    )
    assert tax_name == "scenic_views"
    assert tax_id == 7

    # 3. Completely unclassified spot returns unknown and 255
    tax_name, tax_id = classify_poi_taxonomy(
        name="Generic Facility 42",
        category="general",
        metadata={},
    )
    assert tax_name == UNKNOWN_CATEGORY
    assert tax_id == UNKNOWN_CATEGORY_ID
    assert tax_id == 255


def test_python_cpp_category_id_agreement():
    """Verify Python category IDs strictly conform to C++ solver bounds (0..15) and sentinel 255."""
    import paladio_core
    from app.engine.v2.taxonomy import CANONICAL_CATEGORIES, UNKNOWN_CATEGORY_ID

    # Check all canonical category IDs in [0, 15]
    for cat_name, cat_id in CANONICAL_CATEGORIES.items():
        assert (
            0 <= cat_id < 16
        ), f"Category '{cat_name}' ID {cat_id} out of C++ histogram range (0..15)"

    assert UNKNOWN_CATEGORY_ID == 255

    # Verify C++ engine binds and handles POIs with Python category IDs
    poi_unknown = paladio_core.POI(
        paladio_core.NodeType.ATTRACTION,
        0.0,
        10.0,
        480,
        1200,
        60,
        False,
        UNKNOWN_CATEGORY_ID,
    )
    assert poi_unknown.category_id == 255

    for cat_name, cat_id in CANONICAL_CATEGORIES.items():
        poi_valid = paladio_core.POI(
            paladio_core.NodeType.ATTRACTION,
            0.0,
            10.0,
            480,
            1200,
            60,
            False,
            cat_id,
        )
        assert poi_valid.category_id == cat_id
