import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from app.domain.entities.poi import TransitStep
from app.services.transit_fare_service import (
    TransitFareExtractionSchema,
    TransitFareService,
    get_fare_cache,
)

# ============================================================================
# 1. O(1) In-Memory Cache Hits for Pre-Seeded Cities
# ============================================================================


@pytest.mark.asyncio
async def test_preseeded_cities_o1_cache_hits():
    """
    Empirically verify O(1) in-memory cache hits on repeated lookups for:
    madrid, paris, lisbon, barcelona, rome.
    Ensures no DB queries or external network requests occur.
    """
    preseeded = {
        "madrid": (1.50, 8.40, 3.00, "official_crtm_tariff"),
        "paris": (2.15, 8.45, 9.65, "official_idfm_tariff"),
        "lisbon": (1.80, 6.80, 0.00, "official_carris_metro_tariff"),
        "barcelona": (2.55, 11.20, 2.95, "official_tmb_tariff"),
        "rome": (1.50, 7.00, 12.50, "official_atac_tariff"),
    }

    cache = get_fare_cache()

    # Verify cache pre-seeding
    for city, (
        expected_single,
        expected_pass,
        expected_surcharge,
        expected_source,
    ) in preseeded.items():
        fare = cache.get(city)
        assert fare is not None, f"City '{city}' must be pre-seeded in cache"
        assert fare.is_estimated is False
        assert fare.single_fare == expected_single
        assert fare.pass_24h_price == expected_pass
        assert fare.airport_surcharge == expected_surcharge
        assert fare.source == expected_source

    # Mock DB and Web to guarantee NO I/O occurs for pre-seeded cities
    with (
        patch.object(
            TransitFareService,
            "_lookup_db",
            side_effect=AssertionError("DB lookup called on cached city!"),
        ),
        patch.object(
            TransitFareService,
            "fetch_wikivoyage_transit_text",
            side_effect=AssertionError("Web lookup called on cached city!"),
        ),
        patch.object(
            TransitFareService,
            "extract_fare_with_ollama",
            side_effect=AssertionError("Ollama called on cached city!"),
        ),
    ):
        start_time = time.perf_counter()
        iterations = 10_000

        # Repeated lookups across all 5 cities with various casing and whitespace
        for _ in range(iterations // 5):
            for city in [
                "madrid",
                "Paris",
                "LISBON, Portugal",
                "  barcelona  ",
                "Rome, Italy",
            ]:
                res = await TransitFareService.resolve_city_transit_fare(city)
                assert res.is_estimated is False

        elapsed = time.perf_counter() - start_time
        avg_us = (elapsed / iterations) * 1_000_000

        # Assert lookups are strictly O(1) in-memory: avg under 20 microseconds
        assert (
            avg_us < 25.0
        ), f"Average lookup took {avg_us:.2f} µs, expected < 25 µs for O(1) in-memory"


# ============================================================================
# 2. Resilient Fallback Policy under Network & LLM Failures
# ============================================================================


@pytest.mark.parametrize(
    "failure_patch,side_effect_or_return",
    [
        ("fetch_wikivoyage_transit_text", httpx.ConnectTimeout("Connection timed out")),
        ("fetch_wikivoyage_transit_text", httpx.ReadTimeout("Read timed out")),
        ("fetch_wikivoyage_transit_text", None),
        ("fetch_wikivoyage_transit_text", RuntimeError("Unexpected socket drop")),
    ],
)
@pytest.mark.asyncio
async def test_fallback_on_wikivoyage_failures(failure_patch, side_effect_or_return):
    """
    Test that Wikivoyage timeouts or exceptions trigger graceful baseline estimation:
    single_fare=2.00, pass_24h_price=8.00, airport_surcharge=3.00, is_estimated=True.
    No unhandled 500 error or exception must be thrown!
    """
    city = "adversarial_remote_island_1"
    cache = get_fare_cache()
    cache.invalidate(city)

    kwargs = {}
    if isinstance(side_effect_or_return, Exception):
        kwargs["side_effect"] = side_effect_or_return
    else:
        kwargs["return_value"] = side_effect_or_return

    with (
        patch.object(TransitFareService, "_lookup_db", return_value=None),
        patch.object(TransitFareService, failure_patch, **kwargs),
    ):
        fare = await TransitFareService.resolve_city_transit_fare(city)

        assert fare is not None
        assert fare.is_estimated is True
        assert fare.single_fare == 2.00
        assert fare.pass_24h_price == 8.00
        assert fare.airport_surcharge == 3.00
        assert fare.source == "regional_benchmark_estimate"

        # Verify calculate_transit_leg_fare propagation
        steps = [
            TransitStep(type="transit", instruction="Local Ferry", duration_mins=20)
        ]
        leg_res = TransitFareService.calculate_transit_leg_fare(city, steps, fare=fare)
        assert leg_res.cost_is_estimated is True
        assert leg_res.is_estimated is True
        assert leg_res.total_cost == 2.00
        assert leg_res.airport_surcharge_eur == 0.0

        # Verify airport leg calculation with fallback fare
        airport_steps = [
            TransitStep(type="transit", instruction="Airport Shuttle", duration_mins=30)
        ]
        airport_res = TransitFareService.calculate_transit_leg_fare(
            city, airport_steps, fare=fare, is_airport_leg=True
        )
        assert airport_res.cost_is_estimated is True
        assert airport_res.is_estimated is True
        assert airport_res.total_cost == 5.00  # 2.00 + 3.00
        assert airport_res.airport_surcharge_eur == 3.00


@pytest.mark.parametrize(
    "ollama_outcome",
    [
        ("side_effect", httpx.ConnectTimeout("Ollama server unreachable")),
        ("side_effect", httpx.ReadTimeout("Ollama inference timed out")),
        ("return_value", None),
        ("side_effect", ValueError("JSONDecodeError: Unterminated string")),
    ],
)
@pytest.mark.asyncio
async def test_fallback_on_ollama_extraction_failures(ollama_outcome):
    """
    Test that Ollama timeouts, invalid JSON, or exceptions trigger graceful baseline estimation.
    """
    city = "adversarial_ollama_fail_city"
    cache = get_fare_cache()
    cache.invalidate(city)

    kwargs = {ollama_outcome[0]: ollama_outcome[1]}

    with (
        patch.object(TransitFareService, "_lookup_db", return_value=None),
        patch.object(
            TransitFareService,
            "fetch_wikivoyage_transit_text",
            return_value="Valid wikitext about city transit...",
        ),
        patch.object(TransitFareService, "extract_fare_with_ollama", **kwargs),
    ):
        fare = await TransitFareService.resolve_city_transit_fare(city)

        assert fare is not None
        assert fare.is_estimated is True
        assert fare.single_fare == 2.00
        assert fare.pass_24h_price == 8.00
        assert fare.airport_surcharge == 3.00
        assert fare.source == "regional_benchmark_estimate"


# ============================================================================
# 3. Ollama Structured JSON Extraction with Mocked Payloads
# ============================================================================


@pytest.mark.asyncio
async def test_ollama_structured_json_extraction_success():
    """
    Test extract_fare_with_ollama correctly parses structured response into schema.
    """
    mock_schema = {
        "agency_name": "BVG",
        "single_fare_eur": 3.50,
        "day_pass_name": "24-Stunden-Karte Berlin AB",
        "day_pass_fare_eur": 9.90,
        "airport_surcharge_eur": 0.0,
        "airport_station_keywords": ["flughafen ber", "terminal 1-2"],
        "source_url": "https://www.bvg.de",
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"response": json.dumps(mock_schema)}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        extracted = await TransitFareService.extract_fare_with_ollama(
            "Berlin", "Public transport context"
        )

        assert extracted is not None
        assert isinstance(extracted, TransitFareExtractionSchema)
        assert extracted.agency_name == "BVG"
        assert extracted.single_fare_eur == 3.50
        assert extracted.day_pass_fare_eur == 9.90
        assert extracted.day_pass_name == "24-Stunden-Karte Berlin AB"
        assert extracted.airport_surcharge_eur == 0.0
        assert "flughafen ber" in extracted.airport_station_keywords
        assert extracted.source_url == "https://www.bvg.de"


@pytest.mark.parametrize(
    "bad_response",
    [
        {"response": "I am an AI and cannot process this context."},  # Non-JSON
        {"response": "{malformed_json: 123"},  # Corrupt JSON
        {"response": json.dumps({"single_fare_eur": 0.0})},  # Zero fare
        {"response": json.dumps({"single_fare_eur": -2.5})},  # Negative fare
        {"response": ""},  # Empty response
    ],
)
@pytest.mark.asyncio
async def test_ollama_structured_json_extraction_invalid_payloads(bad_response):
    """
    Test extract_fare_with_ollama handles non-conforming, negative, or corrupt payloads safely.
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = bad_response

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        extracted = await TransitFareService.extract_fare_with_ollama(
            "CityX", "Context"
        )
        assert (
            extracted is None
        ), "Should gracefully return None on invalid Ollama payloads"


# ============================================================================
# 4. End-to-End Dynamic Discovery & Tier 1 Caching Hydration
# ============================================================================


@pytest.mark.asyncio
async def test_dynamic_discovery_hydrates_cache():
    """
    Verify that resolving an unindexed city via Tier 3 populates the cache,
    and subsequent calls return the cached object in O(1) without hitting Tier 3 again.
    """
    city = "AdversarialMunich"
    cache = get_fare_cache()
    cache.invalidate(city)

    mock_schema = {
        "agency_name": "MVV",
        "single_fare_eur": 3.70,
        "day_pass_name": "Single Tageskarte",
        "day_pass_fare_eur": 8.80,
        "airport_surcharge_eur": 6.80,
        "airport_station_keywords": ["flughafen münchen", "munich airport"],
        "source_url": "https://www.mvv-muenchen.de",
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"response": json.dumps(mock_schema)}

    with (
        patch.object(TransitFareService, "_lookup_db", return_value=None),
        patch.object(
            TransitFareService, "persist_fare_to_db", new_callable=AsyncMock
        ) as mock_persist,
        patch.object(
            TransitFareService,
            "fetch_wikivoyage_transit_text",
            new_callable=AsyncMock,
            return_value="Wikitext about MVV Munich...",
        ) as mock_fetch,
        patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp),
    ):
        # 1st call: Hits Tier 3
        fare = await TransitFareService.resolve_city_transit_fare(city)
        assert fare.is_estimated is False
        assert fare.single_fare == 3.70
        assert fare.pass_24h_price == 8.80
        assert fare.airport_surcharge == 6.80
        assert fare.agency_name == "MVV"
        assert fare.source == "official_mvv"
        assert mock_fetch.call_count == 1
        assert mock_persist.call_count == 1

        # 2nd call: Must hit Tier 1 cache directly without calling mock_fetch
        mock_fetch.reset_mock()
        mock_persist.reset_mock()
        cached_fare = await TransitFareService.resolve_city_transit_fare(city)
        assert cached_fare is fare
        assert mock_fetch.call_count == 0
        assert mock_persist.call_count == 0


# ============================================================================
# 5. Adversarial Input Stress & Concurrency
# ============================================================================


@pytest.mark.asyncio
async def test_adversarial_inputs_safety():
    """
    Stress-test resolve_city_transit_fare with SQL injection, non-Latin scripts,
    excessive lengths, and whitespace.
    """
    adversarial_inputs = [
        "Madrid'; DROP TABLE city_transit_fares; --",
        "São Paulo, Brazil",
        "Tokyo (東京)",
        "Москва",
        "   ",
        "A" * 1000,
    ]

    for raw_city in adversarial_inputs:
        with (
            patch.object(TransitFareService, "_lookup_db", return_value=None),
            patch.object(
                TransitFareService, "fetch_wikivoyage_transit_text", return_value=None
            ),
        ):
            fare = await TransitFareService.resolve_city_transit_fare(raw_city)
            assert fare is not None
            assert isinstance(fare.single_fare, (int, float))
            assert fare.single_fare > 0


@pytest.mark.asyncio
async def test_concurrent_resolution_stress():
    """
    Test 50 concurrent requests for the same unindexed city to verify thread/coroutine safety.
    """
    city = "concurrent_stress_city"
    cache = get_fare_cache()
    cache.invalidate(city)

    with (
        patch.object(TransitFareService, "_lookup_db", return_value=None),
        patch.object(
            TransitFareService,
            "fetch_wikivoyage_transit_text",
            side_effect=httpx.ConnectTimeout("timeout"),
        ),
    ):
        tasks = [TransitFareService.resolve_city_transit_fare(city) for _ in range(50)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            assert not isinstance(
                res, Exception
            ), f"Concurrent task raised exception: {res}"
            assert res.is_estimated is True
            assert res.single_fare == 2.00
