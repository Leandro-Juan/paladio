import asyncio
import csv
import logging
import os
import re
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.exc import SQLAlchemyError

from app.celery_app import app
from app.db.models import TransitCacheStatus

logger = logging.getLogger(__name__)


def _get_task_session_maker():
    """
    Creates an isolated SQLAlchemy async session factory using NullPool.
    Prevents event-loop binding errors when Celery workers invoke asyncio.run()
    multiple times across sequential task invocations.
    """
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from sqlalchemy.pool import NullPool

    from app.db.session import DATABASE_URL

    task_engine = create_async_engine(
        DATABASE_URL, poolclass=NullPool, echo=False, future=True
    )
    return async_sessionmaker(
        task_engine, class_=AsyncSession, expire_on_commit=False
    ), task_engine


def _run_async(coro):
    """Run an async coroutine safely whether or not an event loop is running in the current thread."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    return asyncio.run(coro)


@app.task(bind=True, name="app.tasks.refresh_city_pois_task")
def refresh_city_pois_task(self, city_name: str):
    """
    Background SWR task: Fetches updated POIs for a city and saves them to the DB.
    """
    logger.info(
        f"Task {self.request.id}: Background SWR refresh started for {city_name}"
    )

    # Import inside the task to prevent circular imports
    from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
    from app.infrastructure.providers.overpass_provider import OverpassProviderAdapter
    from app.services.poi_service import _fetch_and_store_pois

    try:
        session_maker, task_engine = _get_task_session_maker()

        async def run_fetch():
            try:
                async with session_maker() as session:
                    repo = SqlPoiRepository(session)
                    provider = OverpassProviderAdapter()
                    await _fetch_and_store_pois(city_name, repo, provider)
            finally:
                await task_engine.dispose()

        asyncio.run(run_fetch())
        logger.info(
            f"Task {self.request.id}: Successfully refreshed POIs for {city_name}"
        )
        return {"status": "success", "city": city_name}
    except Exception as exc:
        logger.error(
            f"Task {self.request.id}: Failed to refresh POIs for {city_name}: {exc}"
        )
        raise


# Open-data GTFS directories for supported cities
CITY_GTFS_MAP = {
    "madrid": "https://www.arcgis.com/sharing/rest/content/items/5c7f2951962540d69ffe8f640d94c246/data",
    "oporto": "https://opendata.porto.pt/transport/stcp_gtfs.zip",
    "porto": "https://opendata.porto.pt/transport/stcp_gtfs.zip",
    "paris": "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-idf-gtfs/files/gtfs.zip",
    "barcelona": "https://opendata-ajuntament.barcelona.cat/data/dataset/844c8789-f538-4e11-bf37-0205be4a1ca2/resource/cfbcbe68-54b0-466d-8692-0b2a3045df6a/download/transit.zip",
}


def extract_gtfs_expiry(gtfs_dir: str) -> datetime:
    """
    Parses feed_info.txt or calendar.txt inside the unzipped GTFS directory
    to find when the schedule expires. Bounded by a maximum of 180 days.
    """
    now = datetime.now(timezone.utc)
    max_expiry = now + timedelta(days=180)
    candidate_date = None

    feed_info_path = os.path.join(gtfs_dir, "feed_info.txt")
    if os.path.exists(feed_info_path):
        try:
            with open(feed_info_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    end_str = row.get("feed_end_date")
                    if end_str:
                        candidate_date = datetime.strptime(
                            end_str.strip(), "%Y%m%d"
                        ).replace(tzinfo=timezone.utc)
                        break
        except (OSError, csv.Error, ValueError, KeyError) as e:
            logger.warning(f"Failed parsing feed_info.txt: {e}")

    if not candidate_date:
        calendar_path = os.path.join(gtfs_dir, "calendar.txt")
        if os.path.exists(calendar_path):
            try:
                with open(calendar_path, mode="r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    max_cal_date = None
                    for row in reader:
                        end_str = row.get("end_date")
                        if end_str:
                            dt = datetime.strptime(end_str.strip(), "%Y%m%d").replace(
                                tzinfo=timezone.utc
                            )
                            if max_cal_date is None or dt > max_cal_date:
                                max_cal_date = dt
                    candidate_date = max_cal_date
            except (OSError, csv.Error, ValueError, KeyError) as e:
                logger.warning(f"Failed parsing calendar.txt: {e}")

    if candidate_date:
        return min(max(candidate_date, now + timedelta(days=7)), max_expiry)

    return now + timedelta(days=90)


async def _async_update_transit_cache(
    city_name: str,
    status: str | None = None,
    osm_status: str | None = None,
    gtfs_status: str | None = None,
    valid_until: datetime | None = None,
    feed_name: str | None = None,
):
    from sqlalchemy import select

    from app.db.models import TransitCacheModel

    session_maker, task_engine = _get_task_session_maker()
    try:
        async with session_maker() as session:
            stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_name)
            res = await session.execute(stmt)
            record = res.scalar_one_or_none()
            if not record:
                record = TransitCacheModel(
                    city=city_name,
                    status=status or TransitCacheStatus.BUILDING.value,
                    osm_status=osm_status or "PENDING",
                    gtfs_status=gtfs_status or "PENDING",
                    valid_until=valid_until,
                    gtfs_feed_name=feed_name,
                )
                session.add(record)
            else:
                if status is not None:
                    record.status = status
                if osm_status is not None:
                    record.osm_status = osm_status
                if gtfs_status is not None:
                    record.gtfs_status = gtfs_status
                if valid_until is not None:
                    record.valid_until = valid_until
                if feed_name is not None:
                    record.gtfs_feed_name = feed_name
            await session.commit()
    finally:
        await task_engine.dispose()


@app.task(
    bind=True,
    name="app.tasks.build_city_map_task",
    autoretry_for=(httpx.RequestError,),
    retry_backoff=True,
    max_retries=1,
)
def build_city_map_task(self, city_name: str, trip_id: str | None = None):
    """
    Downloads OSM road data for the city and queues the asynchronous GTFS schedule task.
    """
    logger.info(f"Task {self.request.id}: Starting OSM road ingestion for {city_name}")

    city_lower = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

    # 1. Mark cache status in DB
    try:
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                status=TransitCacheStatus.BUILDING.value,
                osm_status="BUILDING",
            )
        )
    except (SQLAlchemyError, OSError, RuntimeError) as e:
        logger.warning(f"Could not set transit_cache BUILDING status: {e}")

    try:
        from app.services.osm_map_service import OSMMapService

        url, file_name = _run_async(OSMMapService.resolve_osm_pbf_url(city_lower))
        dest_path = f"/custom_files/{file_name}"

        # Download OSM .pbf if not present
        if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
            logger.info(f"Downloading {url} to {dest_path}...")
            urllib.request.urlretrieve(url, dest_path)
            logger.info(f"Successfully downloaded {file_name}.")
        else:
            logger.info(f"OSM file {file_name} already present at {dest_path}.")

        # Mark OSM road network as READY
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                osm_status="READY",
                feed_name=file_name,
            )
        )

        # Trigger background GTFS schedule compilation
        build_city_gtfs_task.delay(city_name=city_lower, trip_id=trip_id)

        return {
            "status": "success",
            "city": city_lower,
            "osm_status": "READY",
            "file": file_name,
        }

    except (
        urllib.error.URLError,
        OSError,
        ValueError,
        httpx.HTTPError,
        RuntimeError,
        KeyError,
    ) as exc:
        logger.error(f"Failed to ingest OSM map for {city_name}: {exc}")
        try:
            asyncio.run(
                _async_update_transit_cache(
                    city_name=city_lower,
                    status=TransitCacheStatus.FAILED.value,
                    osm_status="FAILED",
                )
            )
        except (SQLAlchemyError, OSError, RuntimeError) as db_err:
            logger.warning(f"Could not update status to FAILED in DB: {db_err}")
        raise


@app.task(
    bind=True,
    name="app.tasks.build_city_gtfs_task",
    queue="transit_build",
    autoretry_for=(httpx.RequestError,),
    retry_backoff=True,
    max_retries=1,
)
def build_city_gtfs_task(self, city_name: str, trip_id: str | None = None):
    """
    Downloads GTFS public transit data in the background, extracts validity,
    and publishes the TRANSIT_TILES_READY notification to Redis.
    """
    logger.info(
        f"Task {self.request.id}: Starting background GTFS compilation for {city_name}"
    )

    city_lower = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

    try:
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                gtfs_status="BUILDING",
            )
        )
    except (SQLAlchemyError, OSError, RuntimeError) as e:
        logger.warning(f"Could not update gtfs_status to BUILDING: {e}")

    gtfs_url = CITY_GTFS_MAP.get(city_lower)
    gtfs_base = os.environ.get("GTFS_BASE_DIR", "/gtfs_feeds")
    gtfs_dest_dir = f"{gtfs_base}/{city_lower}"
    valid_until = datetime.now(timezone.utc) + timedelta(days=90)

    try:
        if gtfs_url:
            os.makedirs(gtfs_dest_dir, exist_ok=True)
            zip_tmp = f"/tmp/{city_lower}_gtfs.zip"
            logger.info(f"Downloading GTFS feed from {gtfs_url} to {zip_tmp}...")
            try:
                urllib.request.urlretrieve(gtfs_url, zip_tmp)
                with zipfile.ZipFile(zip_tmp, "r") as zip_ref:
                    target_base = os.path.abspath(gtfs_dest_dir)
                    for member in zip_ref.infolist():
                        member_path = os.path.abspath(
                            os.path.join(target_base, member.filename)
                        )
                        if (
                            os.path.commonpath([target_base, member_path])
                            != target_base
                        ):
                            raise ValueError(
                                f"Zip Slip attempt detected in member: {member.filename}"
                            )
                        zip_ref.extract(member, target_base)
                if os.path.exists(zip_tmp):
                    os.remove(zip_tmp)
                valid_until = extract_gtfs_expiry(gtfs_dest_dir)
            except (
                urllib.error.URLError,
                OSError,
                zipfile.BadZipFile,
                ValueError,
            ) as gtfs_err:
                logger.warning(
                    f"Could not extract GTFS feed for {city_name}: {gtfs_err}"
                )
                _run_async(
                    _async_update_transit_cache(
                        city_name=city_lower,
                        gtfs_status="UNAVAILABLE",
                        status=TransitCacheStatus.READY.value,
                    )
                )
                return {"status": "unavailable", "city": city_lower}

        # Update cache as READY
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                status=TransitCacheStatus.READY.value,
                gtfs_status="READY",
                valid_until=valid_until,
            )
        )

        # Publish notification to Redis
        try:
            import json

            import redis

            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
            r = redis.from_url(redis_url)
            event_payload = json.dumps(
                {
                    "event": "TRANSIT_TILES_READY",
                    "city": city_lower,
                    "city_name": city_name,
                    "trip_id": trip_id,
                }
            )
            r.publish("paladio:events", event_payload)
            logger.info(f"Published TRANSIT_TILES_READY for {city_name} to Redis.")
        except (redis.RedisError, OSError, RuntimeError) as r_err:
            logger.warning(f"Could not publish Redis event: {r_err}")

        return {
            "status": "success",
            "city": city_lower,
            "gtfs_status": "READY",
            "valid_until": valid_until.isoformat(),
        }

    except (
        urllib.error.URLError,
        OSError,
        zipfile.BadZipFile,
        ValueError,
        httpx.HTTPError,
        RuntimeError,
        KeyError,
    ) as exc:
        logger.error(f"Failed GTFS compilation for {city_name}: {exc}")
        try:
            _run_async(
                _async_update_transit_cache(
                    city_name=city_lower,
                    gtfs_status="FAILED",
                )
            )
        except (SQLAlchemyError, OSError, RuntimeError) as db_err:
            logger.warning(f"Could not update gtfs_status to FAILED: {db_err}")
        raise
