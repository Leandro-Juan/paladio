from app.engine.hydration.document_builder import PoiDocumentBuilder


def test_document_builder_noise_exclusion():
    poi_data = {
        "name": "Museo del Prado",
        "city": "Madrid",
        "category": "museum",
        "aliases": ["El Prado", "Prado Museum"],
        "neighborhood": "Jerónimos",
        "description": "Premier national art museum housing masterpiece European paintings. Open 10:00-20:00. Admission 15.00 EUR.",
        "cost_eur": 15.0,
        "is_free": False,
        "duration_mins": 120,
        "metadata": {
            "tags": {
                "tourism": "museum",
                "architecture": "neoclassical",
                "architect": "Juan de Villanueva",
                "start_date": "1819",
                "heritage": "UNESCO",
            }
        },
        "facets": {
            "themes": ["art_culture", "renaissance_paintings"],
            "vibes": ["iconic_must_see", "grand_scale"],
            "audience": ["couples", "solo_friendly", "families"],
            "indoor_outdoor": "indoor",
            "rain_friendly": True,
        },
    }

    doc = PoiDocumentBuilder.build_document(poi_data)

    # 1. Verify noise exclusion: no opening hours and no currency
    assert "10:00-20:00" not in doc
    assert "15.00 EUR" not in doc
    assert "EUR" not in doc

    # 2. Verify anti-boilerplate
    assert "is a notable landmark" not in doc
    assert "visitors can explore" not in doc

    # 3. Verify key elements are present
    assert "Museo del Prado" in doc
    assert "El Prado" in doc
    assert "Jerónimos, Madrid" in doc
    assert "neoclassical style" in doc
    assert "Juan de Villanueva" in doc
    assert "UNESCO World Heritage" in doc
    assert "mid-range" in doc
    assert "typical visit 2-2.5 hours" in doc

    # 4. Token length check (rough estimate: words * 1.3)
    words = doc.split()
    estimated_tokens = len(words) * 1.3
    assert 50 <= estimated_tokens <= 260


def test_document_builder_hash_trigger():
    poi_data = {
        "name": "Templo de Debod",
        "city": "Madrid",
        "category": "attraction",
        "cost_eur": 0.0,
        "is_free": True,
    }

    text = PoiDocumentBuilder.build_document(poi_data)
    h = PoiDocumentBuilder.compute_hash(text)

    assert isinstance(h, str)
    assert len(h) == 64

    # Requires reembedding if hash doesn't match
    poi_obj = dict(poi_data)
    poi_obj["embedding"] = [0.1] * 768
    poi_obj["embedding_text_hash"] = "stale_hash"
    assert PoiDocumentBuilder.needs_reembedding(poi_obj) is True

    # If hash matches and version matches, doesn't need reembedding
    poi_obj["embedding_text_hash"] = h
    poi_obj["embedding_version"] = 2
    poi_obj["embedding_model"] = "nomic-embed-text"
    assert PoiDocumentBuilder.needs_reembedding(poi_obj) is False
