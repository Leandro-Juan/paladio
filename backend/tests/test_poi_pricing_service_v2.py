from unittest.mock import patch

import httpx
import pytest
from app.services.poi_pricing_service import (
    PoiPricingService,
    normalize_string,
    parse_wikivoyage_price,
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
    assert 9.0 <= cost <= 12.0
    assert is_est is False
    assert src == "osm_charge_tag"

    # Test Tokyo JPY charge (Ueno Zoo 600 JPY -> ~3.50 - 4.50 EUR)
    tokyo_cost, tokyo_est, tokyo_src = PoiPricingService.resolve_poi_price(
        poi_name="Ueno Zoological Gardens",
        city="Tokyo",
        category="park",
        osm_charge="600 JPY",
    )
    assert 3.0 <= tokyo_cost <= 5.0
    assert tokyo_est is False
    assert tokyo_src == "osm_charge_tag"


def test_resolve_price_wikivoyage():
    cost, is_est, src = PoiPricingService.resolve_poi_price(
        poi_name="Local Art Space",
        city="Prague",
        category="museum",
        wikivoyage_price="CZK 200 (~8 EUR)",
    )
    assert cost == 8.0  # prioritized EUR equivalent in parentheses
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

    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        cost, is_est, src = await PoiPricingService.scrape_and_verify_official_price(
            website_url="https://modernart.example.com",
            poi_name="Modern Art Museum",
            city="Madrid",
        )
        assert cost == 14.50
        assert is_est is False
        assert src == "official_website_literal_verified"


@pytest.mark.asyncio
async def test_official_website_jsonld_and_free_extraction():
    html_jsonld = (
        '<html><head><script type="application/ld+json">'
        '{"@type": "TouristAttraction", "offers": {"price": "18.00", "priceCurrency": "EUR"}}'
        "</script></head><body><h1>Gallery</h1></body></html>"
    )
    mock_resp_jsonld = httpx.Response(
        200,
        text=html_jsonld,
        request=httpx.Request("GET", "https://gallery.example.com"),
    )
    with patch("httpx.AsyncClient.get", return_value=mock_resp_jsonld):
        cost, is_est, src = await PoiPricingService.scrape_and_verify_official_price(
            website_url="https://gallery.example.com",
            poi_name="National Gallery",
            city="Madrid",
        )
        assert cost == 18.00
        assert is_est is False
        assert src == "official_website_literal_verified"

    html_free = "<html><body><p>Museum entry is free admission daily for all visitors.</p></body></html>"
    mock_resp_free = httpx.Response(
        200,
        text=html_free,
        request=httpx.Request("GET", "https://free-museum.example.com"),
    )
    with patch("httpx.AsyncClient.get", return_value=mock_resp_free):
        cost, is_est, src = await PoiPricingService.scrape_and_verify_official_price(
            website_url="https://free-museum.example.com",
            poi_name="Free Museum",
            city="London",
        )
        assert cost == 0.0
        assert is_est is False
        assert src == "official_website_literal_verified"


@pytest.mark.asyncio
async def test_official_website_missing_or_unverified_price_rejected():
    # Text mentions tickets without any numeric price -> must return no_price_extracted
    html_content = "<html><body><h1>Welcome to Modern Art</h1><p>Enjoy our exhibits with a day ticket.</p></body></html>"
    mock_resp = httpx.Response(
        200,
        text=html_content,
        request=httpx.Request("GET", "https://modernart.example.com"),
    )

    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        cost, is_est, src = await PoiPricingService.scrape_and_verify_official_price(
            website_url="https://modernart.example.com",
            poi_name="Modern Art Museum",
            city="Madrid",
        )
        assert cost is None
        assert is_est is True
        assert src == "no_price_extracted"
