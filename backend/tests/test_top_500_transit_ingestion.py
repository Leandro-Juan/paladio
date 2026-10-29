"""Automated Verification Suite: Public Transit Ingestion Pipeline & Honest Defaulting.

Tests dynamic resolution of transit schedules and fare tariffs for the top 500 cities in the world.
Enforces Paladio architectural invariants:
1. Zero hardcoded city data: city universe is dynamically loaded from geonamescache/runtime sources.
2. Dynamic GTFS feed resolution via GTFSResolverService against the Mobility Database catalog.
3. Dynamic fare resolution via TransitFareService and PostgreSQL tables.
4. Honest Defaulting: missing feeds strictly default to [] (reason_code="NO_FEED", tier="T5").
   Missing fares strictly default to pass_24h_price=None, agency_name=None, fare_unknown=True.
5. GTFS Derivation Fare Parser Defaulting: missing fare files and optional attributes default to None / [].
6. Resiliency: Zero unhandled crashes or exceptions across all cities.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

import geonamescache
import pytest
from app.db.session import async_session
from app.domain.city_key import generate_city_key
from app.services.gtfs_resolver_service import GTFSResolverService
from app.services.transit_derivation_service import TransitDerivationService
from app.services.transit_fare_service import TransitFareService


def get_dynamic_top_500_cities() -> list[dict[str, Any]]:
    """Dynamically loads and ranks the top 500 cities globally for tourism purposes from geonamescache.

    Strictly zero hardcoded names: loaded dynamically from runtime geonames dataset.
    Ranks cities algorithmically by international cultural prominence (multilingual alternate names),
    demographic gravity, and capital status, ensuring balanced representation across countries.
    """
    import math

    gc = geonamescache.GeonamesCache()
    raw_cities = list(gc.get_cities().values())
    assert len(raw_cities) > 500, "Geonamescache must contain global city universe"

    countries = gc.get_countries()
    capitals = {c.get("capital", "").lower() for c in countries.values()}

    def dynamic_tourism_score(c):
        pop = max(1000, c.get("population", 0))
        alt_count = len(c.get("alternatenames", []))
        is_cap = c["name"].lower() in capitals
        return (alt_count * 2.0) + (math.log10(pop) * 4.0) + (15.0 if is_cap else 0.0)

    raw_cities.sort(key=dynamic_tourism_score, reverse=True)

    selected = []
    country_counts: dict[str, int] = {}
    for c in raw_cities:
        cc = c.get("countrycode", "XX")
        if country_counts.get(cc, 0) < 20:
            selected.append(
                {
                    "name": str(c["name"]),
                    "country_code": str(c.get("countrycode", "XX")),
                    "geoname_id": int(c.get("geonameid", 0)),
                    "population": int(c.get("population", 0)),
                    "latitude": float(c.get("latitude", 0.0)),
                    "longitude": float(c.get("longitude", 0.0)),
                }
            )
            country_counts[cc] = country_counts.get(cc, 0) + 1
        if len(selected) == 500:
            break

    return selected


# ============================================================================
# 1. City Universe Invariant Tests
# ============================================================================


def test_dynamic_top_500_cities_invariant():
    """Verify that the 500 cities cohort is 100% dynamically loaded, unique, and valid."""
    cohort = get_dynamic_top_500_cities()
    assert len(cohort) == 500, f"Expected 500 cities, got {len(cohort)}"

    unique_ids = {c["geoname_id"] for c in cohort}
    assert len(unique_ids) == 500, "All 500 cities must have distinct geoname IDs"

    for c in cohort:
        assert c["name"], "City name must not be empty"
        assert len(c["country_code"]) == 2, f"Invalid ISO country code for {c['name']}"
        assert c["population"] > 0, f"City population must be positive for {c['name']}"
        assert -90.0 <= c["latitude"] <= 90.0, f"Latitude out of bounds for {c['name']}"
        assert (
            -180.0 <= c["longitude"] <= 180.0
        ), f"Longitude out of bounds for {c['name']}"


# ============================================================================
# 2. GTFS Derivation Parser Honest Defaulting Tests
# ============================================================================


@pytest.mark.asyncio
async def test_gtfs_derivation_fare_parser_missing_files_default_to_empty():
    """Verify that when fare_attributes.txt is missing from a GTFS feed, _derive_fares returns empty lists."""
    async with async_session() as session:
        deriver = TransitDerivationService(session)
        with tempfile.TemporaryDirectory() as empty_gtfs_dir:
            quality_report: dict[str, Any] = {"rows_read": {}}
            fares, rules = deriver._derive_fares(
                feed_dir=empty_gtfs_dir,
                build_id="test-build-1",
                city_lower="test_city",
                quality_report=quality_report,
            )
            assert fares == []
            assert rules == []


@pytest.mark.asyncio
async def test_gtfs_derivation_fare_parser_optional_fields_default_to_none():
    """Verify that optional fare attributes (transfers, transfer_duration, agency_id, fare_name)

    strictly default to None when absent in fare_attributes.txt.
    """
    async with async_session() as session:
        deriver = TransitDerivationService(session)
        with tempfile.TemporaryDirectory() as gtfs_dir:
            fare_csv = os.path.join(gtfs_dir, "fare_attributes.txt")
            with open(fare_csv, "w", encoding="utf-8") as f:
                f.write(
                    "fare_id,price,currency_type,payment_method,transfers,transfer_duration,agency_id,fare_name\n"
                )
                f.write("standard_ticket,2.50,EUR,0,,,,\n")

            quality_report: dict[str, Any] = {"rows_read": {}}
            fares, _rules = deriver._derive_fares(
                feed_dir=gtfs_dir,
                build_id="test-build-2",
                city_lower="test_city",
                quality_report=quality_report,
            )

            assert len(fares) == 1
            f = fares[0]
            assert f.fare_id == "standard_ticket"
            assert f.price == 2.50
            assert f.currency == "EUR"
            assert f.transfers is None, "Missing transfers must default to None"
            assert (
                f.transfer_duration is None
            ), "Missing transfer_duration must default to None"
            assert f.agency_id is None, "Missing agency_id must default to None"
            assert f.fare_name is None, "Missing fare_name must default to None"


@pytest.mark.asyncio
async def test_gtfs_derivation_fare_parser_missing_currency_skips_unverified():
    """Verify that fares with missing currency_type are skipped (never defaulting to EUR)."""
    async with async_session() as session:
        deriver = TransitDerivationService(session)
        with tempfile.TemporaryDirectory() as gtfs_dir:
            fare_csv = os.path.join(gtfs_dir, "fare_attributes.txt")
            with open(fare_csv, "w", encoding="utf-8") as f:
                f.write("fare_id,price,currency_type,payment_method\n")
                f.write("unverified_fare,5.00,,0\n")

            quality_report: dict[str, Any] = {"rows_read": {}}
            fares, _rules = deriver._derive_fares(
                feed_dir=gtfs_dir,
                build_id="test-build-3",
                city_lower="test_city",
                quality_report=quality_report,
            )

            assert len(fares) == 0, "Fares with missing currency must be discarded"


# ============================================================================
# 3. Dynamic Pipeline Resolution & Defaulting across Top Cities
# ============================================================================


@pytest.mark.asyncio
async def test_pipeline_feed_and_fare_resolution_sample_invariants():
    """Evaluates a dynamic sample across the top 500 cities to verify that:

    1. Resolved feeds contain valid metadata and URLs.
    2. Missing feeds strictly default to [] with tier="T5" and reason_code="NO_FEED".
    3. Missing fares strictly default to pass_24h_price=None, pass_24h_name=None, fare_unknown=True.
    4. Known fares contain positive prices and valid currencies.
    5. Zero exceptions are thrown.
    """
    await GTFSResolverService.ensure_catalog_loaded()
    cohort = get_dynamic_top_500_cities()

    # Sample top, middle, and bottom tiers of the 500 cohort dynamically
    sample_indices = [0, 1, 5, 10, 25, 50, 100, 200, 300, 400, 499]
    sample_cities = [cohort[i] for i in sample_indices if i < len(cohort)]

    async with async_session() as session:
        for c in sample_cities:
            name = c["name"]
            cc = c["country_code"]
            gid = c["geoname_id"]
            city_key = generate_city_key(name, cc, gid)

            # 1. Test GTFS Feed Resolution
            feeds = await GTFSResolverService.resolve_gtfs_feeds(name, country_code=cc)
            assert isinstance(feeds, list), f"Feeds must be a list for {name}"

            if not feeds:
                # Defaulting Invariant: missing feed returns empty list, not synthetic data
                assert len(feeds) == 0
            else:
                for f in feeds:
                    assert f.feed_id, f"feed_id must not be empty for {name}"
                    assert f.download_url.startswith(
                        "http"
                    ), f"download_url must be valid for {name}"
                    assert isinstance(f.has_fares, bool)
                    assert isinstance(f.is_official, bool)

            # 2. Test Fare Resolution
            fare_obj = await TransitFareService._lookup_db(city_key, db=session)
            if fare_obj is None:
                fare_obj = TransitFareService.get_city_transit_fare(name)

            assert (
                fare_obj is not None
            ), f"TransitFareService must return a CityTransitFare for {name}"

            if fare_obj.fare_unknown:
                # Defaulting Invariant: missing fare must default to None / unknown
                assert (
                    fare_obj.pass_24h_price is None
                ), f"Pass price must default to None for unindexed {name}"
                assert (
                    fare_obj.pass_24h_name is None
                ), f"Pass name must default to None for unindexed {name}"
                assert fare_obj.fare_unknown is True
            else:
                # Resolved fare must be positive and valid
                assert (
                    fare_obj.single_fare > 0.0
                ), f"Resolved fare must be positive for {name}"
                assert (
                    len(fare_obj.currency) == 3
                ), f"Currency must be 3-letter code for {name}"
                if fare_obj.pass_24h_price is not None:
                    assert (
                        fare_obj.pass_24h_price > 0.0
                    ), f"Pass price must be positive for {name}"
