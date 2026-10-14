import logging
from datetime import datetime, timezone
from typing import Any

from app.db.models import AttractionModel, CityModel
from app.domain.entities.poi import Poi
from app.domain.interfaces.poi_repository import IPoiRepository
from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)
from app.services.poi_pricing_service import PoiPricingService
from app.utils.opening_hours_parser import parse_osm_opening_hours
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AttrDict(dict):
    """A dictionary supporting attribute dot-access for nested properties."""

    def __getattr__(self, name: str) -> Any:
        try:
            val = self[name]
            if isinstance(val, dict) and not isinstance(val, AttrDict):
                val = AttrDict(val)
                self[name] = val
            return val
        except KeyError:
            raise AttributeError(f"'AttrDict' object has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


def _to_attr_dict(val: Any) -> Any:
    if isinstance(val, dict):
        return AttrDict({k: _to_attr_dict(v) for k, v in val.items()})
    return val


def model_to_poi(model: AttractionModel) -> Poi:
    """Translates an AttractionModel ORM object to a domain Poi entity."""
    loc = _to_attr_dict(model.location) if isinstance(model.location, dict) else {}
    sc = _to_attr_dict(model.scoring) if isinstance(model.scoring, dict) else {}
    meta = (
        _to_attr_dict(model.metadata_field)
        if isinstance(model.metadata_field, dict)
        else {}
    )

    emb = None
    if model.embedding is not None:
        emb = (
            model.embedding.tolist()
            if hasattr(model.embedding, "tolist")
            else list(model.embedding)
        )

    open_vec = list(model.open_time_mins_by_day or [480] * 7)
    close_vec = list(model.close_time_mins_by_day or [1320] * 7)
    for i in range(min(len(open_vec), len(close_vec))):
        if open_vec[i] != -1 and close_vec[i] != -1 and open_vec[i] >= close_vec[i]:
            close_vec[i] = open_vec[i] + 60

    return Poi(
        id=model.id,
        city=model.city,
        name=model.name,
        category=model.category,
        location=loc,
        scoring=sc,
        metadata=meta,
        open_time_mins_by_day=open_vec,
        close_time_mins_by_day=close_vec,
        duration_mins=int(model.duration_mins) if model.duration_mins else 60,
        cost_eur=float(model.cost_eur) if model.cost_eur is not None else 0.0,
        cost_is_estimated=bool(model.cost_is_estimated),
        cost_source=model.cost_source,
        osm_opening_hours=model.osm_opening_hours,
        embedding=emb,
        tier=getattr(model, "tier", 3),
        tier_confidence=getattr(model, "tier_confidence", "low"),
        tier_source=getattr(model, "tier_source", "heuristic"),
        iconicity_score=getattr(model, "iconicity_score", 0.0),
        taxonomy_category=getattr(model, "taxonomy_category", "art_culture"),
        category_id=getattr(model, "category_id", 0),
        visit_mode=getattr(model, "visit_mode", "full"),
        aliases=list(getattr(model, "aliases", []) or []),
        neighborhood=getattr(model, "neighborhood", None),
        wikidata_id=getattr(model, "wikidata_id", None),
        wikipedia_title=getattr(model, "wikipedia_title", None),
        website=getattr(model, "website", None),
        description=getattr(model, "description", None),
        description_source=getattr(model, "description_source", None),
        doc_quality=getattr(model, "doc_quality", "C"),
        facets=dict(getattr(model, "facets", {}) or {}),
        sitelinks_count=getattr(model, "sitelinks_count", 0),
        pageviews_30d=getattr(model, "pageviews_30d", 0),
        hours_known=bool(getattr(model, "hours_known", False)),
        daily_windows=list(getattr(model, "daily_windows", []) or []),
        has_split_hours=bool(getattr(model, "has_split_hours", False)),
        embedding_text=getattr(model, "embedding_text", None),
        embedding_text_hash=getattr(model, "embedding_text_hash", None),
        embedding_model=getattr(model, "embedding_model", None),
        embedding_version=getattr(model, "embedding_version", 0),
        embedded_at=getattr(model, "embedded_at", None),
        provenance=dict(getattr(model, "provenance", {}) or {}),
        hydration_status=getattr(model, "hydration_status", "RAW"),
    )


def attraction_to_poi(attraction: Attraction, city: str = "") -> Poi:
    """Translates a scraper Attraction schema into a domain Poi entity."""
    loc = (
        attraction.location.model_dump(mode="json")
        if hasattr(attraction.location, "model_dump")
        else dict(attraction.location)
    )
    sched = (
        attraction.schedule.model_dump(mode="json")
        if hasattr(attraction.schedule, "model_dump")
        else dict(attraction.schedule)
    )
    fin = (
        attraction.financials.model_dump(mode="json")
        if hasattr(attraction.financials, "model_dump")
        else dict(attraction.financials)
    )
    sc = (
        attraction.scoring.model_dump(mode="json")
        if hasattr(attraction.scoring, "model_dump")
        else dict(attraction.scoring)
    )
    meta = (
        attraction.metadata.model_dump(mode="json")
        if hasattr(attraction.metadata, "model_dump")
        else dict(attraction.metadata)
    )

    osm_h = getattr(attraction, "opening_hours_raw", None) or sched.get(
        "osm_opening_hours"
    )
    parsed_hours = parse_osm_opening_hours(osm_h)
    dur = sched.get("recommended_duration_minutes", 60)
    raw_cost = getattr(attraction, "admission_fee", None)
    if raw_cost is None:
        raw_cost = fin.get("estimated_cost", 0.0) or 0.0
    raw_is_estimated = getattr(attraction, "cost_is_estimated", None)
    if raw_is_estimated is None:
        raw_is_estimated = (
            fin.get("is_estimated", True) if isinstance(fin, dict) else True
        )
    raw_price_source = getattr(attraction, "cost_source", None)
    if raw_price_source is None:
        raw_price_source = (
            fin.get("price_source", None) if isinstance(fin, dict) else None
        )

    cost, is_estimated, price_source = PoiPricingService.resolve_poi_price(
        poi_name=attraction.name,
        city=city or "",
        category=attraction.category,
        wikidata_id=getattr(attraction, "wikidata_id", None),
        existing_cost=raw_cost,
        existing_is_estimated=raw_is_estimated,
        existing_source=raw_price_source,
    )

    return Poi(
        id=attraction.id,
        city=city or "",
        name=attraction.name,
        category=attraction.category,
        location=_to_attr_dict(loc),
        scoring=_to_attr_dict(sc),
        metadata=_to_attr_dict(meta),
        open_time_mins_by_day=parsed_hours.open_time_mins_by_day,
        close_time_mins_by_day=parsed_hours.close_time_mins_by_day,
        duration_mins=int(dur) if dur and int(dur) > 0 else 60,
        cost_eur=float(cost) if cost and float(cost) >= 0 else 0.0,
        cost_is_estimated=bool(is_estimated),
        cost_source=price_source,
        osm_opening_hours=osm_h,
        embedding=attraction.embedding,
    )


def poi_to_attraction(poi: Poi) -> Attraction:
    """Translates a domain Poi entity into a scraper Attraction schema."""
    loc = poi.location
    lat = (
        loc.get("latitude", 0.0)
        if isinstance(loc, dict)
        else getattr(loc, "latitude", 0.0)
    )
    lon = (
        loc.get("longitude", 0.0)
        if isinstance(loc, dict)
        else getattr(loc, "longitude", 0.0)
    )
    location_obj = Location(latitude=float(lat), longitude=float(lon))

    schedule_obj = AttractionSchedule(
        osm_opening_hours=poi.osm_opening_hours,
        recommended_duration_minutes=int(poi.duration_mins),
    )

    financials_obj = AttractionFinancials(
        is_free=bool(poi.cost_eur <= 0.0),
        estimated_cost=float(poi.cost_eur),
        currency="EUR",
        is_estimated=bool(poi.cost_is_estimated),
        price_source=poi.cost_source,
    )

    sc = poi.scoring
    rating = sc.get("rating") if isinstance(sc, dict) else getattr(sc, "rating", None)
    reviews = (
        sc.get("reviews") if isinstance(sc, dict) else getattr(sc, "reviews", None)
    )
    scoring_obj = Scoring(
        rating=float(rating) if rating is not None else None,
        reviews=int(reviews) if reviews is not None else None,
    )

    meta = poi.metadata
    scraped_at = (
        meta.get("scraped_at")
        if isinstance(meta, dict)
        else getattr(meta, "scraped_at", None)
    )
    source = (
        meta.get("source", "osm")
        if isinstance(meta, dict)
        else getattr(meta, "source", "osm")
    )
    if isinstance(scraped_at, str):
        try:
            scraped_at = datetime.fromisoformat(scraped_at)
        except (ValueError, TypeError):
            scraped_at = datetime.now(timezone.utc)
    elif not isinstance(scraped_at, datetime):
        scraped_at = datetime.now(timezone.utc)
    metadata_obj = Metadata(scraped_at=scraped_at, source=str(source))

    cat = poi.category
    valid_categories = {
        "museum",
        "monument",
        "historic_site",
        "landmark",
        "attraction",
        "restaurant",
        "cafe",
        "bar",
        "pub",
    }
    safe_category = cat if cat in valid_categories else "attraction"

    return Attraction(
        id=poi.id or "unknown",
        type="attraction",
        category=safe_category,
        name=poi.name,
        location=location_obj,
        schedule=schedule_obj,
        financials=financials_obj,
        scoring=scoring_obj,
        metadata=metadata_obj,
        embedding=poi.embedding,
    )


def dict_to_poi(d: dict[str, Any]) -> Poi:
    from app.engine.retrieval.hybrid_retriever import _parse_vector

    loc = d.get("location") or {}
    sc = d.get("scoring") or {}
    meta = (
        d.get("metadata")
        if isinstance(d.get("metadata"), dict)
        else (d.get("metadata_field") or {})
    )

    dur = d.get("duration_mins", 60)
    cost = float(d.get("cost_eur") or 0.0)
    is_est = bool(d.get("cost_is_estimated", True))
    src = d.get("cost_source")

    return Poi(
        id=str(d.get("id")),
        city=str(d.get("city")),
        name=str(d.get("name")),
        category=str(d.get("category", "attraction")),
        location=_to_attr_dict(loc),
        scoring=_to_attr_dict(sc),
        metadata=_to_attr_dict(meta),
        duration_mins=int(dur or 60),
        cost_eur=cost,
        cost_is_estimated=is_est,
        cost_source=src,
        tier=int(d.get("tier", 3)),
        tier_confidence=str(d.get("tier_confidence", "low")),
        tier_source=str(d.get("tier_source", "heuristic")),
        iconicity_score=float(d.get("iconicity_score") or 0.0),
        taxonomy_category=str(d.get("taxonomy_category", "art_culture")),
        category_id=int(d.get("category_id", 0)),
        visit_mode=str(d.get("visit_mode", "full")),
        aliases=list(d.get("aliases") or []),
        neighborhood=d.get("neighborhood"),
        wikidata_id=d.get("wikidata_id"),
        wikipedia_title=d.get("wikipedia_title"),
        website=d.get("website"),
        description=d.get("description"),
        description_source=d.get("description_source"),
        doc_quality=str(d.get("doc_quality") or "C"),
        facets=dict(d.get("facets") or {}),
        sitelinks_count=int(d.get("sitelinks_count") or 0),
        pageviews_30d=int(d.get("pageviews_30d") or 0),
        hours_known=bool(d.get("hours_known", False)),
        daily_windows=list(d.get("daily_windows") or []),
        has_split_hours=bool(d.get("has_split_hours", False)),
        embedding=_parse_vector(d.get("embedding")),
        hydration_status=str(d.get("hydration_status", "RAW")),
    )


class SqlPoiRepository(IPoiRepository):
    """
    SQLAlchemy implementation of the IPoiRepository port.
    Translates between domain Poi entities and persistence/scraper schemas.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_city_filter(self, city_name: str):
        city_clean = city_name.strip().lower()
        if not city_clean:
            return or_(False)

        stmt = select(CityModel).where(
            or_(
                CityModel.id == city_clean,
                func.lower(CityModel.name) == city_clean,
                func.lower(func.array_to_string(CityModel.aliases, " ")).like(
                    f"%{city_clean}%"
                ),
            )
        )
        res = await self.session.execute(stmt)
        cities = res.scalars().all()

        city_ids = {c.id for c in cities}
        city_names = {city_clean}
        for c in cities:
            if c.name:
                city_names.add(c.name.strip().lower())
            if c.aliases:
                for a in c.aliases:
                    if a and len(a.strip()) <= 50:
                        city_names.add(a.strip().lower())

        clauses = [
            func.lower(AttractionModel.city).in_(city_names),
            AttractionModel.city_id == city_clean,
        ]
        if city_ids:
            clauses.append(AttractionModel.city_id.in_(city_ids))

        return or_(*clauses)

    async def find_by_city(self, city_name: str) -> list[Poi]:
        filter_clause = await self._get_city_filter(city_name)
        stmt = select(AttractionModel).where(filter_clause)
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [model_to_poi(model) for model in models]

    async def find_tiered_pois(self, city_name: str, max_tier: int = 2) -> list[Poi]:
        filter_clause = await self._get_city_filter(city_name)
        stmt = (
            select(AttractionModel)
            .where(filter_clause)
            .where(AttractionModel.tier <= max_tier)
            .order_by(
                AttractionModel.tier.asc(),
                AttractionModel.iconicity_score.desc(),
            )
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [model_to_poi(model) for model in models]

    async def find_meal_spots(self, city_name: str, limit: int = 400) -> list[Poi]:
        filter_clause = await self._get_city_filter(city_name)
        stmt = (
            select(AttractionModel)
            .where(filter_clause)
            .where(
                func.lower(AttractionModel.category).in_(
                    ("restaurant", "cafe", "food", "bistrot")
                )
            )
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return [model_to_poi(model) for model in result.scalars().all()]

    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float], limit: int = 150
    ) -> list[tuple[Poi, float]]:
        """
        Retrieves candidate attractions in the city ordered by pgvector cosine similarity (<=>)
        with pgvector 0.8+ iterative scan optimization.
        """
        if not user_vector or len(user_vector) != 768:
            raise ValueError(
                "A valid 768-dimensional user_vector is required for semantic candidate search."
            )

        from app.engine.retrieval.hybrid_retriever import HybridRetriever

        results = await HybridRetriever.search_hybrid(
            session=self.session,
            city=city_name,
            query_vec=user_vector,
            clean_query="",
            limit=limit,
            w_vec=1.0,
            w_fts=0.0,
            w_trgm=0.0,
            apply_mmr=True,
        )

        candidates: list[tuple[Poi, float]] = []
        for d in results:
            poi = dict_to_poi(d)
            sim = float(d.get("vec_sim", d.get("composite_score", 0.0)))
            candidates.append((poi, sim))
        return candidates

    async def find_hybrid_candidates(
        self,
        city_name: str,
        user_vector: list[float] | None = None,
        clean_query: str = "",
        required_facets: dict[str, Any] | None = None,
        max_tier: int | None = None,
        max_cost_eur: float | None = None,
        require_rain_friendly: bool = False,
        limit: int = 150,
        apply_mmr: bool = True,
    ) -> list[tuple[Poi, float]]:
        """Executes full Hybrid Retrieval (Dense Vector + FTS + Trigram RRF + MMR) for candidate pool."""
        from app.engine.retrieval.hybrid_retriever import HybridRetriever

        results = await HybridRetriever.search_hybrid(
            session=self.session,
            city=city_name,
            query_vec=user_vector,
            clean_query=clean_query,
            required_facets=required_facets,
            max_tier=max_tier,
            max_cost_eur=max_cost_eur,
            require_rain_friendly=require_rain_friendly,
            limit=limit,
            apply_mmr=apply_mmr,
        )

        candidates: list[tuple[Poi, float]] = []
        for d in results:
            poi = dict_to_poi(d)
            score = float(d.get("composite_score", d.get("vec_sim", 0.0)))
            candidates.append((poi, score))
        return candidates

    async def update_poi_embeddings(
        self, updates: list[tuple[str, list[float]]]
    ) -> None:
        """Updates 768D semantic embeddings for attractions in batch."""
        if not updates:
            return

        from sqlalchemy import update

        for poi_id, emb in updates:
            stmt = (
                update(AttractionModel)
                .where(AttractionModel.id == poi_id)
                .values(embedding=emb)
            )
            await self.session.execute(stmt)
        await self.session.commit()
        logger.info(f"Updated embeddings for {len(updates)} attractions in database.")

    async def save_tiered_for_city(
        self, city_name: str, records: list[dict[str, Any]]
    ) -> None:
        """Upserts ingested POI records together with their v2 tier/taxonomy fields."""
        if not records:
            return
        values = []
        for r in records:
            open_vec = r.get("open_time_mins_by_day")
            close_vec = r.get("close_time_mins_by_day")
            if not open_vec or len(open_vec) != 7:
                parsed = parse_osm_opening_hours(r.get("osm_opening_hours"))
                open_vec = parsed.open_time_mins_by_day
                close_vec = parsed.close_time_mins_by_day
            values.append(
                {
                    "id": r["id"],
                    "city": city_name,
                    "city_id": r.get("city_id"),
                    "name": r["name"],
                    "category": r["category"],
                    "location": r["location"],
                    "open_time_mins_by_day": open_vec,
                    "close_time_mins_by_day": close_vec,
                    "duration_mins": int(r["duration_mins"]),
                    "cost_eur": float(r["cost_eur"]),
                    "cost_is_estimated": bool(r.get("cost_is_estimated", True)),
                    "cost_source": r.get("cost_source"),
                    "osm_opening_hours": r.get("osm_opening_hours"),
                    "scoring": r.get("scoring", {"rating": 0.0, "reviews": 0}),
                    "metadata_field": r.get("metadata", {}),
                    "tier": int(r["tier"]),
                    "tier_confidence": r["tier_confidence"],
                    "tier_source": r["tier_source"],
                    "iconicity_score": float(r["iconicity_score"]),
                    "taxonomy_category": r["taxonomy_category"],
                    "category_id": int(r["category_id"]),
                    "visit_mode": r["visit_mode"],
                    "embedding": r.get("embedding"),
                    "aliases": list(r.get("aliases", []) or []),
                    "neighborhood": r.get("neighborhood"),
                    "wikidata_id": r.get("wikidata_id"),
                    "wikipedia_title": r.get("wikipedia_title"),
                    "website": r.get("website"),
                    "description": r.get("description"),
                    "description_source": r.get("description_source"),
                    "doc_quality": r.get("doc_quality", "C"),
                    "facets": dict(r.get("facets", {}) or {}),
                    "sitelinks_count": int(r.get("sitelinks_count", 0)),
                    "pageviews_30d": int(r.get("pageviews_30d", 0)),
                    "hours_known": bool(r.get("hours_known", False)),
                    "daily_windows": list(r.get("daily_windows", []) or []),
                    "has_split_hours": bool(r.get("has_split_hours", False)),
                    "embedding_text": r.get("embedding_text"),
                    "embedding_text_hash": r.get("embedding_text_hash"),
                    "embedding_model": r.get("embedding_model"),
                    "embedding_version": int(r.get("embedding_version", 0)),
                    "embedded_at": r.get("embedded_at"),
                    "provenance": dict(r.get("provenance", {}) or {}),
                    "hydration_status": r.get("hydration_status", "RAW"),
                }
            )

        from sqlalchemy.dialects.postgresql import insert

        for start in range(0, len(values), 200):
            chunk = values[start : start + 200]
            stmt = insert(AttractionModel).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    col: getattr(stmt.excluded, col)
                    for col in (
                        "name",
                        "city_id",
                        "category",
                        "location",
                        "open_time_mins_by_day",
                        "close_time_mins_by_day",
                        "duration_mins",
                        "cost_eur",
                        "cost_is_estimated",
                        "cost_source",
                        "osm_opening_hours",
                        "scoring",
                        "tier",
                        "tier_confidence",
                        "tier_source",
                        "iconicity_score",
                        "taxonomy_category",
                        "category_id",
                        "visit_mode",
                        "embedding",
                        "aliases",
                        "neighborhood",
                        "wikidata_id",
                        "wikipedia_title",
                        "website",
                        "description",
                        "description_source",
                        "doc_quality",
                        "facets",
                        "sitelinks_count",
                        "pageviews_30d",
                        "hours_known",
                        "daily_windows",
                        "has_split_hours",
                        "embedding_text",
                        "embedding_text_hash",
                        "embedding_model",
                        "embedding_version",
                        "embedded_at",
                        "provenance",
                        "hydration_status",
                    )
                }
                | {"metadata": stmt.excluded.metadata},
            )
            await self.session.execute(stmt)
        await self.session.commit()
        logger.info(f"Saved {len(values)} tiered POIs for {city_name}.")

    async def save_all_for_city(self, city_name: str, pois: list[Any]) -> None:
        if not pois:
            return

        values = []
        for p in pois:
            if isinstance(p, Attraction):
                p = attraction_to_poi(p, city_name)

            if isinstance(p, dict):
                p_id = p.get("id")
                p_name = p.get("name", "")
                p_cat = p.get("category", "attraction")
                loc = p.get("location", {})
                sc = p.get("scoring", {})
                meta = p.get("metadata", {})

                osm_h = p.get("osm_opening_hours") or (
                    p.get("schedule", {}).get("osm_opening_hours")
                    if isinstance(p.get("schedule"), dict)
                    else None
                )
                if (
                    p.get("open_time_mins_by_day")
                    and len(p["open_time_mins_by_day"]) == 7
                ):
                    open_vec = p["open_time_mins_by_day"]
                    close_vec = p["close_time_mins_by_day"]
                else:
                    parsed = parse_osm_opening_hours(osm_h)
                    open_vec = parsed.open_time_mins_by_day
                    close_vec = parsed.close_time_mins_by_day

                dur = p.get("duration_mins") or (
                    p.get("schedule", {}).get("recommended_duration_minutes", 60)
                    if isinstance(p.get("schedule"), dict)
                    else 60
                )
                raw_cost = p.get("cost_eur")
                if raw_cost is None and isinstance(p.get("financials"), dict):
                    raw_cost = p["financials"].get("estimated_cost", 0.0)

                cost, is_est, src = PoiPricingService.resolve_poi_price(
                    poi_name=p_name,
                    city=city_name,
                    category=p_cat,
                    existing_cost=float(raw_cost) if raw_cost is not None else 0.0,
                    existing_is_estimated=p.get("cost_is_estimated", True),
                    existing_source=p.get("cost_source"),
                )
            elif isinstance(p, Poi):
                p_id = p.id
                p_name = p.name
                p_cat = p.category
                loc = (
                    p.location.model_dump(mode="json")
                    if hasattr(p.location, "model_dump")
                    else dict(p.location)
                )
                sc = (
                    p.scoring.model_dump(mode="json")
                    if hasattr(p.scoring, "model_dump")
                    else dict(p.scoring)
                )
                meta = (
                    p.metadata.model_dump(mode="json")
                    if hasattr(p.metadata, "model_dump")
                    else dict(p.metadata)
                )
                open_vec = p.open_time_mins_by_day
                close_vec = p.close_time_mins_by_day
                dur = p.duration_mins
                cost = p.cost_eur
                is_est = p.cost_is_estimated
                src = p.cost_source
                osm_h = p.osm_opening_hours
            else:
                p_id = getattr(p, "id", None)
                p_name = getattr(p, "name", "")
                p_cat = getattr(p, "category", "attraction")
                loc_raw = getattr(p, "location", {})
                sc_raw = getattr(p, "scoring", {})
                meta_raw = getattr(p, "metadata", {})
                loc = (
                    loc_raw.model_dump(mode="json")
                    if hasattr(loc_raw, "model_dump")
                    else (dict(loc_raw) if isinstance(loc_raw, dict) else {})
                )
                sc = (
                    sc_raw.model_dump(mode="json")
                    if hasattr(sc_raw, "model_dump")
                    else (dict(sc_raw) if isinstance(sc_raw, dict) else {})
                )
                meta = (
                    meta_raw.model_dump(mode="json")
                    if hasattr(meta_raw, "model_dump")
                    else (dict(meta_raw) if isinstance(meta_raw, dict) else {})
                )

                open_vec = getattr(p, "open_time_mins_by_day", None)
                close_vec = getattr(p, "close_time_mins_by_day", None)
                osm_h = getattr(p, "osm_opening_hours", None)
                if not open_vec or len(open_vec) != 7:
                    parsed = parse_osm_opening_hours(osm_h)
                    open_vec = parsed.open_time_mins_by_day
                    close_vec = parsed.close_time_mins_by_day
                dur = getattr(p, "duration_mins", 60)
                cost = getattr(p, "cost_eur", 0.0)
                is_est = getattr(p, "cost_is_estimated", True)
                src = getattr(p, "cost_source", None)

            values.append(
                {
                    "id": p_id,
                    "city": city_name,
                    "name": p_name,
                    "category": p_cat,
                    "location": loc,
                    "open_time_mins_by_day": open_vec,
                    "close_time_mins_by_day": close_vec,
                    "duration_mins": dur,
                    "cost_eur": cost,
                    "cost_is_estimated": is_est,
                    "cost_source": src,
                    "osm_opening_hours": osm_h,
                    "scoring": sc,
                    "metadata_field": meta,
                }
            )

        from sqlalchemy.dialects.postgresql import insert

        stmt = insert(AttractionModel).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": stmt.excluded.name,
                "category": stmt.excluded.category,
                "location": stmt.excluded.location,
                "open_time_mins_by_day": stmt.excluded.open_time_mins_by_day,
                "close_time_mins_by_day": stmt.excluded.close_time_mins_by_day,
                "duration_mins": stmt.excluded.duration_mins,
                "cost_eur": stmt.excluded.cost_eur,
                "cost_is_estimated": stmt.excluded.cost_is_estimated,
                "cost_source": stmt.excluded.cost_source,
                "osm_opening_hours": stmt.excluded.osm_opening_hours,
                "scoring": stmt.excluded.scoring,
                "metadata": stmt.excluded.metadata,
            },
        )

        await self.session.execute(stmt)
        await self.session.commit()

        logger.info(f"Saved {len(pois)} fresh POIs to the database for {city_name}.")

    async def check_city_staleness(
        self, city_name: str
    ) -> tuple[datetime | None, bool]:
        """
        Checks ingestion timestamp and whether any attractions have outdated embedding versions.
        Returns (ingested_at, has_outdated_embeddings).
        """
        from app.engine.hydration.document_builder import PoiDocumentBuilder

        city_clean = city_name.strip().lower()
        city_filter = await self._get_city_filter(city_name)

        # 1. City ingested_at
        city_stmt = (
            select(CityModel.ingested_at)
            .where(
                or_(
                    CityModel.id == city_clean,
                    func.lower(CityModel.name) == city_clean,
                )
            )
            .limit(1)
        )
        city_res = await self.session.execute(city_stmt)
        ingested_at = city_res.scalar_one_or_none()

        # 2. Outdated or missing embeddings
        version_stmt = select(func.count(AttractionModel.id)).where(
            city_filter,
            or_(
                AttractionModel.embedding_version < PoiDocumentBuilder.VERSION,
                AttractionModel.embedding.is_(None),
            ),
        )
        ver_res = await self.session.execute(version_stmt)
        outdated_count = ver_res.scalar_one() or 0
        return ingested_at, outdated_count > 0
