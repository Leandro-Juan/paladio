import logging
from datetime import datetime, timezone
from typing import Any

from app.db.models import AttractionModel
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
from sqlalchemy import func, select
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

    return Poi(
        id=model.id,
        city=model.city,
        name=model.name,
        category=model.category,
        location=loc,
        scoring=sc,
        metadata=meta,
        open_time_mins_by_day=model.open_time_mins_by_day or [480] * 7,
        close_time_mins_by_day=model.close_time_mins_by_day or [1320] * 7,
        duration_mins=int(model.duration_mins) if model.duration_mins else 60,
        cost_eur=float(model.cost_eur) if model.cost_eur is not None else 0.0,
        cost_is_estimated=bool(model.cost_is_estimated),
        cost_source=model.cost_source,
        osm_opening_hours=model.osm_opening_hours,
        embedding=emb,
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

    osm_h = sched.get("osm_opening_hours")
    parsed_hours = parse_osm_opening_hours(osm_h)
    dur = sched.get("recommended_duration_minutes", 60)
    raw_cost = fin.get("estimated_cost", 0.0) or 0.0
    raw_is_estimated = fin.get("is_estimated", True) if isinstance(fin, dict) else True
    raw_price_source = fin.get("price_source", None) if isinstance(fin, dict) else None

    cost, is_estimated, price_source = PoiPricingService.resolve_poi_price(
        poi_name=attraction.name,
        city=city or "",
        category=attraction.category,
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


class SqlPoiRepository(IPoiRepository):
    """
    SQLAlchemy implementation of the IPoiRepository port.
    Translates between domain Poi entities and persistence/scraper schemas.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def find_by_city(self, city_name: str) -> list[Poi]:
        stmt = select(AttractionModel).where(
            func.lower(AttractionModel.city) == city_name.strip().lower()
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [model_to_poi(model) for model in models]

    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float], limit: int = 150
    ) -> list[tuple[Poi, float]]:
        """
        Retrieves candidate attractions in the city ordered by pgvector cosine similarity (<=>)
        to the user's 768D semantic vector. Returns tuples of (Poi, semantic_affinity).
        """
        if not user_vector or len(user_vector) != 768:
            raise ValueError(
                "A valid 768-dimensional user_vector is required for semantic candidate search."
            )

        dist_col = AttractionModel.embedding.cosine_distance(user_vector)
        stmt = (
            select(AttractionModel, dist_col.label("distance"))
            .where(func.lower(AttractionModel.city) == city_name.strip().lower())
            .where(AttractionModel.embedding.isnot(None))
            .order_by(dist_col.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        candidates: list[tuple[Poi, float]] = []
        for model, dist in rows:
            dist_val = float(dist) if dist is not None else 1.0
            # Cosine similarity in [0.0, 1.0]
            sim = float(max(0.0, min(1.0, 1.0 - dist_val)))
            poi = model_to_poi(model)
            candidates.append((poi, sim))

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

    async def save_all_for_city(self, city_name: str, pois: list[Any]) -> None:
        if not pois:
            return

        values = []
        for p in pois:
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
