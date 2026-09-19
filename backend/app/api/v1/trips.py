import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.api.deps import get_optional_user
from app.db.models import TransitCacheModel, TripModel, UserModel
from app.db.session import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

logger = logging.getLogger(__name__)

router = APIRouter()


class TransitStatusResponse(BaseModel):
    city: str
    gtfs_status: str
    is_ready: bool


class CityGtfsItem(BaseModel):
    city: str
    display_name: str
    status: str
    osm_status: str
    gtfs_status: str
    is_ready: bool
    is_building: bool
    is_queued: bool = False
    is_downloaded: bool
    is_compiled: bool
    has_feed: bool
    feed_url: str | None = None
    valid_until: str | None = None
    gtfs_feed_name: str | None = None
    updated_at: str | None = None


class GtfsRegistryResponse(BaseModel):
    has_active_process: bool
    active_processes_count: int
    active_cities: list[str]
    total_cities: int
    compiled_cities: int
    queued_cities: int = 0
    cities: list[CityGtfsItem]


class CompileCityRequest(BaseModel):
    city: str


class TripCreate(BaseModel):
    destination: str
    start_date: str
    end_date: str
    itinerary_data: dict[str, Any]


class TripResponse(TripCreate):
    id: str
    user_id: str | None = None
    created_at: str


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    trip: TripCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    new_id = str(uuid.uuid4())
    db_trip = TripModel(
        id=new_id,
        user_id=current_user.id if current_user else None,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        itinerary_data=trip.itinerary_data,
    )
    session.add(db_trip)
    await session.commit()
    await session.refresh(db_trip)

    # Auto-trigger GTFS download for trip destination if needed
    if db_trip.destination:
        try:
            from app.tasks import async_trigger_city_gtfs_download_if_needed

            await async_trigger_city_gtfs_download_if_needed(
                city_name=db_trip.destination,
                trip_id=db_trip.id,
                session=session,
            )
        except (SQLAlchemyError, OSError, RuntimeError) as e:
            logger.warning(
                f"Could not auto-trigger GTFS download for {db_trip.destination}: {e}"
            )

    return TripResponse(
        id=db_trip.id,
        user_id=db_trip.user_id,
        destination=db_trip.destination,
        start_date=db_trip.start_date,
        end_date=db_trip.end_date,
        itinerary_data=db_trip.itinerary_data,
        created_at=db_trip.created_at.isoformat()
        if db_trip.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.get("/", response_model=list[TripResponse])
async def get_trips(
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    stmt = select(TripModel).order_by(TripModel.start_date.asc())

    result = await session.execute(stmt)
    trips = result.scalars().all()

    response = []
    for t in trips:
        response.append(
            TripResponse(
                id=t.id,
                user_id=t.user_id,
                destination=t.destination,
                start_date=t.start_date,
                end_date=t.end_date,
                itinerary_data=t.itinerary_data,
                created_at=t.created_at.isoformat()
                if t.created_at
                else datetime.now(timezone.utc).isoformat(),
            )
        )
    return response


@router.get("/transit-status", response_model=TransitStatusResponse)
async def get_transit_status_by_city(
    city: str = Query(..., description="Destination city name"),
    session: AsyncSession = Depends(get_db),
):
    city_clean = city.strip().lower()
    stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()

    gtfs_status = record.gtfs_status if record else "PENDING"
    is_ready = bool(record and record.gtfs_status == "READY")

    return TransitStatusResponse(
        city=city_clean,
        gtfs_status=gtfs_status,
        is_ready=is_ready,
    )


@router.get("/{trip_id}/transit-status", response_model=TransitStatusResponse)
async def get_transit_status_by_trip(
    trip_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(TripModel).where(TripModel.id == trip_id)
    res = await session.execute(stmt)
    trip = res.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    city = (trip.destination or "").strip().lower()
    stmt_cache = select(TransitCacheModel).where(TransitCacheModel.city == city)
    res_cache = await session.execute(stmt_cache)
    record = res_cache.scalar_one_or_none()

    gtfs_status = record.gtfs_status if record else "PENDING"
    is_ready = bool(record and record.gtfs_status == "READY")

    return TransitStatusResponse(
        city=city,
        gtfs_status=gtfs_status,
        is_ready=is_ready,
    )


@router.get("/transit/registry", response_model=GtfsRegistryResponse)
async def get_transit_registry(session: AsyncSession = Depends(get_db)):
    stmt = select(TransitCacheModel).order_by(TransitCacheModel.city.asc())
    res = await session.execute(stmt)
    records = {r.city.lower(): r for r in res.scalars().all()}

    all_city_keys = sorted(records.keys())

    city_items: list[CityGtfsItem] = []
    active_cities: list[str] = []

    for city_key in all_city_keys:
        rec = records.get(city_key)
        has_feed = bool(
            rec
            and (
                rec.gtfs_status in ("READY", "BUILDING", "QUEUED") or rec.gtfs_feed_name
            )
        )
        feed_url = rec.gtfs_feed_name if rec else None

        status_val = rec.status if rec else "PENDING"
        osm_status_val = rec.osm_status if rec else "PENDING"
        gtfs_status_val = rec.gtfs_status if rec else "PENDING"

        is_queued = bool(gtfs_status_val == "QUEUED" or status_val == "QUEUED")
        is_building = not is_queued and (
            gtfs_status_val == "BUILDING"
            or status_val == "BUILDING"
            or osm_status_val == "BUILDING"
        )
        is_ready = bool(gtfs_status_val == "READY")
        is_downloaded = is_ready
        is_compiled = bool(is_ready and status_val == "READY")

        display_name = city_key.title()
        if city_key == "oporto":
            display_name = "Porto (Oporto)"

        if is_building or is_queued:
            active_cities.append(display_name)

        # ONLY list cities that are already compiled OR currently downloading/building OR queued
        if not (is_compiled or is_building or is_queued):
            continue

        valid_until_str = (
            rec.valid_until.isoformat() if rec and rec.valid_until else None
        )
        updated_at_str = rec.updated_at.isoformat() if rec and rec.updated_at else None

        city_items.append(
            CityGtfsItem(
                city=city_key,
                display_name=display_name,
                status=status_val,
                osm_status=osm_status_val,
                gtfs_status=gtfs_status_val,
                is_ready=is_ready,
                is_building=is_building,
                is_queued=is_queued,
                is_downloaded=is_downloaded,
                is_compiled=is_compiled,
                has_feed=has_feed,
                feed_url=feed_url,
                valid_until=valid_until_str,
                gtfs_feed_name=rec.gtfs_feed_name if rec else None,
                updated_at=updated_at_str,
            )
        )

    compiled_count = sum(1 for c in city_items if c.is_compiled)
    queued_count = sum(1 for c in city_items if c.is_queued)

    return GtfsRegistryResponse(
        has_active_process=len(active_cities) > 0,
        active_processes_count=len(active_cities),
        active_cities=active_cities,
        total_cities=len(city_items),
        compiled_cities=compiled_count,
        queued_cities=queued_count,
        cities=city_items,
    )


@router.post("/transit/compile")
async def trigger_city_gtfs_compile(
    req: CompileCityRequest,
    session: AsyncSession = Depends(get_db),
):
    city_clean = req.city.strip().lower()
    from app.db.models import TransitCacheStatus

    import os
    import redis

    # Check if compiler lock is currently held to set initial status
    is_locked = False
    try:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        is_locked = r.lock("paladio:transit_compiler_lock", timeout=7200).locked()
    except (redis.RedisError, OSError):
        pass

    initial_status = (
        TransitCacheStatus.QUEUED.value
        if is_locked
        else TransitCacheStatus.BUILDING.value
    )
    initial_gtfs = "QUEUED" if is_locked else "BUILDING"

    stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        record = TransitCacheModel(
            city=city_clean,
            status=initial_status,
            osm_status="PENDING",
            gtfs_status=initial_gtfs,
        )
        session.add(record)
    else:
        record.status = initial_status
        record.gtfs_status = initial_gtfs
    await session.commit()

    try:
        from app.tasks import _publish_transit_event, build_city_gtfs_task

        build_city_gtfs_task.delay(city_clean)
        if is_locked:
            _publish_transit_event("TRANSIT_QUEUED", city_clean, req.city)
        else:
            _publish_transit_event("TRANSIT_DOWNLOAD_STARTED", city_clean, req.city)
    except (OSError, RuntimeError) as exc:
        logger.warning(f"Could not dispatch celery task for {city_clean}: {exc}")

    return {
        "status": "queued" if is_locked else "triggered",
        "city": city_clean,
        "message": (
            f"GTFS compilation queued for {city_clean}."
            if is_locked
            else f"GTFS download and compilation process initiated for {city_clean}."
        ),
    }


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return TripResponse(
        id=trip.id,
        user_id=trip.user_id,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        itinerary_data=trip.itinerary_data,
        created_at=trip.created_at.isoformat()
        if trip.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.delete("/{trip_id}")
async def delete_trip(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    await session.execute(delete(TripModel).where(TripModel.id == trip_id))
    await session.commit()
    return {"status": "success", "message": "Trip deleted"}


@router.post("/{trip_id}/upgrade-transit", response_model=TripResponse)
async def upgrade_trip_transit(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    from app.services.transit_service import TransitRoutingError
    from app.use_cases.upgrade_trip_transit import UpgradeTripTransitUseCase

    use_case = UpgradeTripTransitUseCase(session)
    try:
        await use_case.execute(trip_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TransitRoutingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return TripResponse(
        id=trip.id,
        user_id=trip.user_id,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        itinerary_data=trip.itinerary_data,
        created_at=trip.created_at.isoformat()
        if trip.created_at
        else datetime.now(timezone.utc).isoformat(),
    )
