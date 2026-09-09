from app.engine.hydration.poi_synthesizer import PoiNaturalLanguageSynthesizer


def test_viewpoint_synthesis():
    data = {
        "name": "Miradouro de São Pedro de Alcântara",
        "city": "Lisbon",
        "category": "attraction",
        "metadata": {"tags": {"tourism": "viewpoint"}},
    }
    desc = PoiNaturalLanguageSynthesizer.synthesize_description(data)
    assert "Miradouro de São Pedro de Alcântara" in desc
    assert "viewpoint" in desc.lower() or "mirador" in desc.lower()
    assert "Lisbon" in desc


def test_religious_cathedral_synthesis():
    data = {
        "name": "Sé de Lisboa",
        "city": "Lisbon",
        "category": "monument",
        "metadata": {
            "tags": {
                "historic": "monument",
                "building": "cathedral",
                "architecture": "romanesque",
            }
        },
    }
    desc = PoiNaturalLanguageSynthesizer.synthesize_description(data)
    assert "Sé de Lisboa" in desc
    assert "cathedral" in desc.lower() or "church" in desc.lower()
    assert "romanesque" in desc.lower()


def test_restaurant_synthesis():
    data = {
        "name": "Cervejaria Ramiro",
        "city": "Lisbon",
        "category": "restaurant",
        "metadata": {"tags": {"amenity": "restaurant", "cuisine": "seafood"}},
        "financials": {"is_free": False},
    }
    desc = PoiNaturalLanguageSynthesizer.synthesize_description(data)
    assert "Cervejaria Ramiro" in desc
    assert "restaurant" in desc.lower()
    assert "seafood" in desc.lower()
