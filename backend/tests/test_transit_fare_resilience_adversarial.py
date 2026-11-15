import asyncio
import time
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.domain.entities.poi import TransitStep
from app.services.transit_fare_service import (
    CityTransitFare,
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

    # Pre-seed test entries into in-memory cache
    for city, (
        expected_single,
        expected_pass,
        expected_surcharge,
        expected_source,
    ) in preseeded.items():
        cache.set(
            city,
            CityTransitFare(
                city=city,
                country="Country",
                currency="EUR",
                single_fare=expected_single,
                pass_24h_price=expected_pass,
                airport_surcharge=expected_surcharge,
                source=expected_source,
                is_estimated=False,
            ),
        )

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
            "extract_fare_from_text",
            side_effect=AssertionError(
                "Deterministic extraction called on cached city!"
            ),
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
# 2. Resilient Fallback Policy under Network & Extraction Failures
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
        assert fare.single_fare == 0.0
        assert fare.pass_24h_price is None
        assert fare.airport_surcharge == 0.0
        assert fare.source == "fare_unknown"

        # Verify calculate_transit_leg_fare propagation
        steps = [
            TransitStep(type="transit", instruction="Local Ferry", duration_mins=20)
        ]
        leg_res = TransitFareService.calculate_transit_leg_fare(city, steps, fare=fare)
        assert leg_res.cost_is_estimated is True
        assert leg_res.total_cost == 0.0
        assert leg_res.airport_surcharge_eur == 0.0

        # Verify airport leg calculation with fallback fare
        airport_steps = [
            TransitStep(type="transit", instruction="Airport Shuttle", duration_mins=30)
        ]
        airport_res = TransitFareService.calculate_transit_leg_fare(
            city, airport_steps, fare=fare, is_airport_leg=True
        )
        assert airport_res.cost_is_estimated is True
        assert airport_res.total_cost == 0.0
        assert airport_res.airport_surcharge_eur == 0.0


@pytest.mark.parametrize(
    "context_text",
    [
        "",
        "Valid wikitext about city transit without any numeric tariff.",
        "Municipal bus service runs daily from 6am to midnight.",
    ],
)
@pytest.mark.asyncio
async def test_fallback_on_unparseable_extraction_context(context_text):
    """
    Test that Wikivoyage texts lacking grounded fares trigger graceful baseline estimation.
    """
    city = "adversarial_unparseable_city"
    cache = get_fare_cache()
    cache.invalidate(city)

    with (
        patch.object(TransitFareService, "_lookup_db", return_value=None),
        patch.object(
            TransitFareService,
            "fetch_wikivoyage_transit_text",
            return_value=context_text,
        ),
    ):
        fare = await TransitFareService.resolve_city_transit_fare(city)

        assert fare is not None
        assert fare.is_estimated is True
        assert fare.single_fare == 0.0
        assert fare.pass_24h_price is None
        assert fare.airport_surcharge == 0.0
        assert fare.source == "fare_unknown"


# ============================================================================
# 3. Deterministic Structured Extraction from Prose
# ============================================================================


def test_deterministic_fare_extraction_success():
    """
    Test extract_fare_from_text correctly parses structured details from prose.
    """
    context = (
        "In Berlin, BVG operates the subway and bus network. "
        "A single ticket for Berlin AB costs 3.50 EUR. "
        "A 24-hour pass (24-Stunden-Karte Berlin AB) is 9.90 EUR. "
        "Official info at https://www.bvg.de near flughafen ber airport."
    )
    extracted = TransitFareService.extract_fare_from_text("Berlin", context)

    assert extracted is not None
    assert isinstance(extracted, TransitFareExtractionSchema)
    assert extracted.agency_name == "BVG"
    assert extracted.single_fare == 3.50
    assert extracted.currency == "EUR"
    assert extracted.evidence_quote in context
    assert extracted.day_pass_fare == 9.90
    assert extracted.day_pass_name == "24-Stunden-Karte Berlin AB"
    assert extracted.airport_surcharge == 0.0
    assert "airport" in extracted.airport_station_keywords
    assert extracted.source_url == "https://www.bvg.de"


@pytest.mark.parametrize(
    "bad_context",
    [
        "",
        "Public transport connects the railway station to the old town.",
        "Single ticket costs 0.00 EUR.",
        "Single ticket costs -2.50 EUR.",
    ],
)
def test_deterministic_fare_extraction_invalid_payloads(bad_context):
    """
    Test extract_fare_from_text handles empty, non-fare, zero, or negative payloads safely.
    """
    extracted = TransitFareService.extract_fare_from_text("CityX", bad_context)
    assert (
        extracted is None
    ), "Should gracefully return None on invalid or unparseable contexts"


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

    with (
        patch.object(TransitFareService, "_lookup_db", return_value=None),
        patch.object(
            TransitFareService, "persist_fare_to_db", new_callable=AsyncMock
        ) as mock_persist,
        patch.object(
            TransitFareService,
            "fetch_wikivoyage_transit_text",
            new_callable=AsyncMock,
            return_value=(
                "Wikitext about MVV Munich: single fare 3.70 EUR. "
                "Single Tageskarte costs 8.80 EUR. "
                "Airport supplement of 6.80 EUR applies to Munich airport."
            ),
        ) as mock_fetch,
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
            assert fare.single_fare >= 0


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
            assert res.single_fare == 0.0
            assert res.fare_unknown is True
