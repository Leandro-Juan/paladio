"""Unit tests for Phase 5 high-volume PBF extractor and 6-stream signal gates."""

from app.infrastructure.providers.pbf_poi_extractor import (
    approx_polygon_area_m2,
    classify_stream,
    is_fast_food_chain,
    spatial_deduplicate,
)


def test_fast_food_chain_blocklist():
    assert is_fast_food_chain({"brand:wikidata": "Q380"}, "Some Diner") is True
    assert is_fast_food_chain({"wikidata": "Q177054"}, "Burger King") is True
    assert is_fast_food_chain({"brand": "Starbucks Coffee"}, "Starbucks") is True
    assert is_fast_food_chain({}, "McDonald's Gran Via") is True
    assert is_fast_food_chain({}, "Subway Plaza Mayor") is True
    assert is_fast_food_chain({}, "100 Montaditos Atocha") is True
    assert is_fast_food_chain({"cuisine": "tapas"}, "Taberna El Sur") is False


def test_classify_stream_anchor_sights_stream1():
    # Museum with wikidata
    tags = {"tourism": "museum", "name": "Museo del Prado", "wikidata": "Q160112"}
    assert classify_stream(tags, "Museo del Prado") == 1

    # Cathedral building
    tags_cath = {"building": "cathedral", "name": "Catedral de la Almudena"}
    assert classify_stream(tags_cath, "Catedral de la Almudena") == 1

    # Memorial without wikidata/wikipedia or multilingual name -> rejected
    tags_mem_sparse = {"historic": "memorial", "name": "Placa conmemorativa"}
    assert classify_stream(tags_mem_sparse, "Placa conmemorativa") is None

    # Memorial with wikidata -> accepted
    tags_mem_rich = {
        "historic": "memorial",
        "name": "Monumento a Cervantes",
        "wikidata": "Q12345",
    }
    assert classify_stream(tags_mem_rich, "Monumento a Cervantes") == 1


def test_classify_stream_parks_plazas_stream2():
    # Large park
    tags_park = {"leisure": "park", "name": "Parque del Retiro", "wikidata": "Q1131940"}
    assert classify_stream(tags_park, "Parque del Retiro", area_m2=1200000.0) == 2

    # Plaza/Square
    tags_square = {"place": "square", "name": "Plaza Mayor", "wikidata": "Q1131940"}
    assert classify_stream(tags_square, "Plaza Mayor") == 2

    # Tiny bare square with < 3 tags and no wikidata -> rejected
    tags_tiny = {"place": "square", "name": "Placita"}
    assert classify_stream(tags_tiny, "Placita", area_m2=100.0) is None


def test_classify_stream_dining_stream3():
    # Quality restaurant with cuisine and opening hours
    tags = {
        "amenity": "restaurant",
        "name": "Restaurante Sobrino de Botín",
        "cuisine": "spanish",
        "opening_hours": "Mo-Su 13:00-16:00, 20:00-23:30",
    }
    assert classify_stream(tags, "Restaurante Sobrino de Botín") == 3

    # Bare restaurant with no quality signals -> rejected
    tags_bare = {"amenity": "restaurant", "name": "Random Food"}
    assert classify_stream(tags_bare, "Random Food") is None

    # Fast food chain restaurant -> rejected by blocklist
    tags_chain = {
        "amenity": "restaurant",
        "name": "Burger King",
        "brand:wikidata": "Q177054",
    }
    assert classify_stream(tags_chain, "Burger King") is None


def test_classify_stream_cafes_bakeries_stream4():
    tags = {"amenity": "cafe", "name": "Café Central", "cuisine": "coffee_shop"}
    assert classify_stream(tags, "Café Central") == 4

    tags_bakery = {
        "shop": "bakery",
        "name": "Panadería La Tahona",
        "opening_hours": "Mo-Sa 07:00-20:00",
    }
    assert classify_stream(tags_bakery, "Panadería La Tahona") == 4


def test_classify_stream_nightlife_stream5():
    # Bars, pubs, nightclubs, theatres, live music venues
    assert (
        classify_stream({"amenity": "bar", "name": "La Venencia"}, "La Venencia") == 5
    )
    assert (
        classify_stream({"amenity": "theatre", "name": "Teatro Real"}, "Teatro Real")
        == 5
    )
    assert (
        classify_stream(
            {"amenity": "music_venue", "name": "Café Berlín"}, "Café Berlín"
        )
        == 5
    )
    assert (
        classify_stream(
            {"amenity": "nightclub", "name": "Teatro Kapital"}, "Teatro Kapital"
        )
        == 5
    )


def test_classify_stream_markets_crafts_stream6():
    # Marketplaces
    tags_mkt = {"amenity": "marketplace", "name": "Mercado de San Miguel"}
    assert classify_stream(tags_mkt, "Mercado de San Miguel") == 6

    # Historic bookshop with website and hours
    tags_books = {
        "shop": "books",
        "name": "Librería San Ginés",
        "opening_hours": "Mo-Sa 10:00-20:00",
        "website": "https://libreriasangines.com",
    }
    assert classify_stream(tags_books, "Librería San Ginés") == 6


def test_approx_polygon_area_m2():
    # 100m x 100m box around latitude 40.0
    # 0.001 deg lat ~ 111.13m, 0.001 deg lon ~ 85.13m
    lats = [40.0, 40.001, 40.001, 40.0, 40.0]
    lons = [-3.0, -3.0, -3.001, -3.001, -3.0]
    area = approx_polygon_area_m2(lats, lons)
    assert 9000.0 < area < 10000.0


def test_spatial_deduplicate_and_tag_merging():
    # Node and Way representing the same museum:
    # Node has opening hours, Way has website and higher score
    rec_way = {
        "id": "OSM-way-12345",
        "name": "Museo del Prado",
        "category": "museum",
        "stream": 1,
        "location": {"latitude": 40.4138, "longitude": -3.6921},
        "score": 15.0,
        "osm_opening_hours": None,
        "open_time_mins_by_day": [540] * 7,
        "close_time_mins_by_day": [1200] * 7,
        "metadata": {
            "tags": {"wikidata": "Q160112", "website": "https://museodelprado.es"},
            "hours_source": "assumed_default",
        },
    }
    rec_node = {
        "id": "OSM-node-67890",
        "name": "Museo Nacional del Prado",
        "category": "museum",
        "stream": 1,
        "location": {"latitude": 40.4139, "longitude": -3.6922},
        "score": 8.0,
        "osm_opening_hours": "Mo-Sa 10:00-20:00, Su 10:00-19:00",
        "open_time_mins_by_day": [600] * 7,
        "close_time_mins_by_day": [1200] * 7,
        "metadata": {
            "tags": {"wikidata": "Q160112", "wheelchair": "yes"},
            "hours_source": "osm",
        },
    }

    deduped = spatial_deduplicate([rec_node, rec_way], dedup_distance_m=60.0)
    assert len(deduped) == 1
    winner = deduped[0]
    assert winner["id"] == "OSM-way-12345"
    assert winner["metadata"]["tags"]["website"] == "https://museodelprado.es"
    assert winner["metadata"]["tags"]["wheelchair"] == "yes"
    assert winner["osm_opening_hours"] == "Mo-Sa 10:00-20:00, Su 10:00-19:00"
    assert winner["metadata"]["hours_source"] == "osm"
