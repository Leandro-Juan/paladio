import pytest
from unittest.mock import patch
import httpx
from app.services.poi_pricing_service import (
    PoiPricingService,
    parse_wikivoyage_price,
    normalize_string,
)


def test_normalize_string():
    assert normalize_string("Musée du Louvre!") == "musee du louvre"
    assert normalize_string("São Jorge Castle") == "sao jorge castle"


def test_parse_wikivoyage_price():
    val, is_free = parse_wikivoyage_price("Free admission")
    assert val == 0.0
    assert is_free is True

    val, is_free = parse_wikivoyage_price("€15 (adults)")
    assert val == 15.0
    assert is_free is False

    val, is_free = parse_wikivoyage_price("12.50 EUR")
    assert val == 12.50
    assert is_free is False

    val, is_free = parse_wikivoyage_price("invalid")
    assert val is None
    assert is_free is False


def test_resolve_price_wikidata_id():
    # Q160112 is Museo del Prado (15.0 EUR)
    cost, is_est, src = PoiPricingService.resolve_poi_price(
        poi_name="Random Prado Copy",
        city="madrid",
        wikidata_id="Q160112",
    )
    assert cost == 15.0
    assert is_est is False
    assert src == "verified_official_pricing"


def test_resolve_price_osm_fee_no():
    cost, is_est, src = PoiPricingService.resolve_poi_price(
        poi_name="Unknown Public Park",
        city="Berlin",
        category="park",
        osm_fee="no",
    )
    assert cost == 0.0
    assert is_est is False
    assert src == "osm_fee_no"


def test_resolve_price_osm_charge():
    cost, is_est, src = PoiPricingService.resolve_poi_price(
        poi_name="Castle Tower",
        city="Edinburgh",
        category="monument",
        osm_charge="8.50 GBP",
    )
    assert cost == 8.50
    assert is_est is False
    assert src == "osm_charge_tag"


def test_resolve_price_wikivoyage():
    cost, is_est, src = PoiPricingService.resolve_poi_price(
        poi_name="Local Art Space",
        city="Prague",
        category="museum",
        wikivoyage_price="CZK 200 (~8 EUR)",
    )
    assert cost == 200.0  # first parsed number
    assert is_est is False
    assert src == "wikivoyage_listing"


@pytest.mark.asyncio
async def test_official_website_literal_verification_success():
    html_content = "<html><body><h1>Welcome to Modern Art</h1><p>General admission ticket: 14.50 EUR for adults.</p></body></html>"
    mock_resp = httpx.Response(
        200,
        text=html_content,
        request=httpx.Request("GET", "https://modernart.example.com"),
    )
    ollama_resp = httpx.Response(
        200,
        json={"response": '{"price_eur": 14.50, "is_free": false}'},
        request=httpx.Request("POST", "http://localhost:11434/api/generate"),
    )

    with patch("httpx.AsyncClient.get", return_value=mock_resp), patch(
        "httpx.AsyncClient.post", return_value=ollama_resp
    ):
        cost, is_est, src = await PoiPricingService.scrape_and_verify_official_price(
            website_url="https://modernart.example.com",
            poi_name="Modern Art Museum",
            city="Madrid",
        )
        assert cost == 14.50
        assert is_est is False
        assert src == "official_website_literal_verified"


@pytest.mark.asyncio
async def test_official_website_literal_verification_rejection():
    # Ollama returns a hallucinated price that does not appear in source text!
    html_content = "<html><body><h1>Welcome to Modern Art</h1><p>Enjoy our exhibits with a day ticket.</p></body></html>"
    mock_resp = httpx.Response(
        200,
        text=html_content,
        request=httpx.Request("GET", "https://modernart.example.com"),
    )
    # 25.00 never appears in HTML!
    ollama_resp = httpx.Response(
        200,
        json={"response": '{"price_eur": 25.00, "is_free": false}'},
        request=httpx.Request("POST", "http://localhost:11434/api/generate"),
    )

    with patch("httpx.AsyncClient.get", return_value=mock_resp), patch(
        "httpx.AsyncClient.post", return_value=ollama_resp
    ):
        cost, is_est, src = await PoiPricingService.scrape_and_verify_official_price(
            website_url="https://modernart.example.com",
            poi_name="Modern Art Museum",
            city="Madrid",
        )
        # Must be rejected!
        assert cost is None
        assert is_est is True
        assert src == "literal_verification_failed"
