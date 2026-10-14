"""Multi-Source POI Progressive Enrichment CLI & Service (Phase 2 & Phase 6).

Enriches raw POIs with:
1. Wikimedia authority signals (Wikidata claims, Wikipedia extracts & pageviews, Wikivoyage listings)
2. Spatial neighborhood resolution via polygon boundary containment
3. Controlled facets extraction (Theme, Vibe, Audience, TimeOfDay) & Document Quality Scoring
4. Multi-interval split opening hours & unknown sentinel parsing
5. 4-tier admission price cascade
6. Unified iconicity scoring & city-relative tiering
7. Walking bundle proximity contracting (<=350m)

Usage:
    python -m app.cli.enrich_pois [--city Paris]
"""

import argparse
import asyncio
import logging
import math
from typing import Any

from sqlalchemy import select

from app.db.models import AttractionModel
from app.db.session import async_session
from app.engine.hydration.facet_extractor import FacetExtractor
from app.engine.v2.tiering import tier_city_attractions
from app.infrastructure.providers.neighborhood_resolver import NeighborhoodResolver
from app.infrastructure.providers.wikimedia_enrichment_provider import (
    WikimediaEnrichmentProvider,
)
from app.services.poi_pricing_service import PoiPricingService
from app.utils.opening_hours_parser import parse_osm_opening_hours

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("enrich_pois")


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


async def enrich_city_pois(city: str | None = None, batch_size: int = 100):
    """Enriches all attractions in the database for a given city or globally."""
    async with async_session() as session:
        stmt = select(AttractionModel)
        if city:
            stmt = stmt.where(AttractionModel.city.ilike(city))

        res = await session.execute(stmt)
        attractions = list(res.scalars().all())
        total = len(attractions)
        logger.info(f"Found {total} attractions to enrich for city={city or 'ALL'}...")
        if total == 0:
            return

        # Pre-load price catalog into memory
        await PoiPricingService.load_catalog_from_db(session)

        # 1. Resolve neighborhoods if city is specified
        target_city = city or (attractions[0].city if attractions else "")
        neighborhood_resolver = None
        if target_city:
            try:
                neighborhood_resolver = await NeighborhoodResolver.create_for_city(
                    target_city
                )
            except Exception as e:
                logger.warning(
                    f"Could not load neighborhood resolver for {target_city}: {e}"
                )

        # 2. Batch fetch Wikivoyage listings for target city
        wikivoyage_listings: dict[str, Any] = {}
        if target_city:
            try:
                wikivoyage_listings = (
                    await WikimediaEnrichmentProvider.fetch_wikivoyage_listings(
                        target_city
                    )
                )
                logger.info(
                    f"Fetched {len(wikivoyage_listings)} Wikivoyage listings for {target_city}"
                )
            except Exception as e:
                logger.warning(f"Wikivoyage fetch failed: {e}")

        # 3. Batch fetch Wikidata entities
        qids = [
            m.wikidata_id
            for m in attractions
            if m.wikidata_id and m.wikidata_id.startswith("Q")
        ]
        wikidata_entities: dict[str, Any] = {}
        if qids:
            try:
                wikidata_entities = (
                    await WikimediaEnrichmentProvider.resolve_wikidata_batch(
                        list(set(qids))
                    )
                )
                logger.info(f"Resolved {len(wikidata_entities)} Wikidata entities")
            except Exception as e:
                logger.warning(f"Wikidata batch resolve failed: {e}")

        # 4. Batch fetch Wikipedia extracts & pageviews
        wp_titles = [m.wikipedia_title for m in attractions if m.wikipedia_title]
        wikipedia_extracts: dict[str, Any] = {}
        if wp_titles:
            try:
                wikipedia_extracts = (
                    await WikimediaEnrichmentProvider.fetch_wikipedia_extracts(
                        list(set(wp_titles))
                    )
                )
                logger.info(f"Resolved {len(wikipedia_extracts)} Wikipedia extracts")
            except Exception as e:
                logger.warning(f"Wikipedia extracts batch resolve failed: {e}")

        # 5. Transform AttractionModels into working dicts for tiering & facets
        working_dicts: list[dict[str, Any]] = []
        for m in attractions:
            meta = dict(m.metadata_field or {})
            tags = dict(meta.get("tags") or {})
            loc = m.location if isinstance(m.location, dict) else {}
            lat = loc.get("latitude")
            lon = loc.get("longitude")

            # Link Wikidata entity data
            wd_data = (
                wikidata_entities.get(m.wikidata_id or "") if m.wikidata_id else None
            )
            if wd_data:
                m.sitelinks_count = wd_data.sitelinks
                if wd_data.wikipedia_title and not m.wikipedia_title:
                    m.wikipedia_title = wd_data.wikipedia_title

            # Link Wikipedia extract data
            wp_data = (
                wikipedia_extracts.get(m.wikipedia_title or "")
                if m.wikipedia_title
                else None
            )
            if wp_data:
                m.pageviews_30d = wp_data.pageviews_30d
                if wp_data.extract and not m.description:
                    m.description = wp_data.extract

            # Link Wikivoyage listing data
            wv_data = wikivoyage_listings.get(
                m.name.lower()
            ) or wikivoyage_listings.get(m.name)
            wv_price = None
            if wv_data:
                wv_price = wv_data.get("price")
                if not m.description and wv_data.get("description"):
                    m.description = wv_data.get("description")

            # Resolve Neighborhood
            if neighborhood_resolver and lat is not None and lon is not None:
                if not m.neighborhood:
                    m.neighborhood = neighborhood_resolver.resolve_neighborhood(
                        lat, lon
                    )

            # Resolve Opening Hours
            raw_hours = (
                getattr(m, "osm_opening_hours", None)
                or getattr(m, "opening_hours_raw", None)
                or tags.get("opening_hours")
            )
            parsed_hours = parse_osm_opening_hours(raw_hours)
            m.osm_opening_hours = raw_hours
            if hasattr(m, "opening_hours_raw"):
                m.opening_hours_raw = raw_hours
            m.daily_windows = parsed_hours.daily_windows
            m.hours_known = parsed_hours.hours_known
            m.has_split_hours = parsed_hours.has_split_hours

            # Resolve Admission Price via 4-tier cascade
            cost, is_est, cost_src = PoiPricingService.resolve_poi_price(
                poi_name=m.name,
                city=m.city,
                category=m.category,
                osm_fee=tags.get("fee"),
                osm_charge=tags.get("charge"),
                wikidata_id=m.wikidata_id,
                wikivoyage_price=wv_price,
                existing_cost=m.admission_fee,
                existing_is_estimated=m.cost_is_estimated,
                existing_source=m.cost_source,
            )
            m.admission_fee = cost
            m.cost_is_estimated = is_est
            m.cost_source = cost_src

            # Prepare working dict for facet extractor & tiering
            poi_dict = {
                "id": m.id,
                "name": m.name,
                "city": m.city,
                "category": m.category,
                "description": m.description,
                "duration_mins": m.duration_mins or 60,
                "cost_eur": m.admission_fee,
                "cost_is_estimated": m.cost_is_estimated,
                "cost_source": m.cost_source,
                "wikidata_id": m.wikidata_id,
                "wikipedia_title": m.wikipedia_title,
                "sitelinks_count": m.sitelinks_count or 0,
                "pageviews_30d": m.pageviews_30d or 0,
                "wikivoyage_listed": bool(wv_data),
                "neighborhood": m.neighborhood,
                "metadata": meta,
                "tags": tags,
            }

            # Controlled Facets & Quality Score
            facets = FacetExtractor.extract_facets(poi_dict)
            m.controlled_facets = facets.model_dump()
            m.doc_quality_score = FacetExtractor.compute_doc_quality(
                poi=poi_dict,
                has_wikidata=bool(m.wikidata_id),
                has_wikipedia=bool(m.wikipedia_title),
                has_wikivoyage=bool(wv_data),
                has_hours=bool(m.hours_known),
                has_price=not bool(m.cost_is_estimated),
            )

            working_dicts.append(poi_dict)

        # 6. Apply unified city-relative tiering
        tiered_dicts = tier_city_attractions(working_dicts, target_city)
        dict_by_id = {d["id"]: d for d in tiered_dicts}

        enriched_count = 0
        for m in attractions:
            td = dict_by_id.get(m.id)
            if td:
                m.tier = td.get("tier", 3)
                m.tier_confidence = td.get("tier_confidence", "low")
                m.tier_source = td.get("tier_source", "unified_signals")
                m.iconicity_score = td.get("iconicity_score", 0.10)
                m.visit_mode = td.get("visit_mode", "full")
                m.hydration_status = "ENRICHED"
                enriched_count += 1

        # 7. Walking bundles (<=350m)
        bundled_count = 0
        coords = [
            (
                m,
                m.location.get("latitude")
                if isinstance(m.location, dict)
                else getattr(m.location, "latitude", None),
                m.location.get("longitude")
                if isinstance(m.location, dict)
                else getattr(m.location, "longitude", None),
            )
            for m in attractions
        ]
        valid_coords = [c for c in coords if c[1] is not None and c[2] is not None]

        for i, (m1, lat1, lon1) in enumerate(valid_coords):
            for j in range(i + 1, len(valid_coords)):
                m2, lat2, lon2 = valid_coords[j]
                if (
                    m1.city == m2.city
                    and _haversine_meters(lat1, lon1, lat2, lon2) <= 350.0
                ):
                    bundled_count += 1

        await session.commit()
        logger.info("=== Progressive Multi-Source Enrichment Summary ===")
        logger.info(f"Total POIs inspected: {total}")
        logger.info(f"Enriched POIs: {enriched_count}")
        logger.info(f"Nearby walking bundle pairs identified: {bundled_count}")


def main():
    parser = argparse.ArgumentParser(
        description="Enrich POIs with Wikimedia authority, neighborhoods, facets, split hours, and unified tiering."
    )
    parser.add_argument("--city", type=str, default=None, help="City name filter.")
    args = parser.parse_args()
    asyncio.run(enrich_city_pois(city=args.city))


if __name__ == "__main__":
    main()
