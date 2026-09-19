import asyncio
import csv
import logging
import os
import re
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any

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


# Optional override map for direct custom GTFS URLs; dynamic resolution handles any world city via GTFSResolverService
CITY_GTFS_MAP: dict[str, str] = {}


def sanitize_gtfs_feed(gtfs_dir: str, bounds: dict[str, float] | None = None) -> None:
    """
    Sanitizes GTFS feeds to protect Valhalla from fatal crashes:
    1. Renames pathways.txt to pathways.txt.disabled to prevent missing egress pointer crashes.
    2. Discards location_type == '2' (station entrances/exits) to prevent Valhalla in/egress null-pointer segfaults.
    3. If bounds are specified, clips stops.txt, stop_times.txt, trips.txt, and transfers.txt
       to remove terminus rail/bus stations lying in neighboring regions outside the OSM road boundary.
    """
    if not os.path.exists(gtfs_dir):
        return

    # 1. Disable pathways.txt
    for root, _, files in os.walk(gtfs_dir):
        if "pathways.txt" in files:
            src_pathway = os.path.join(root, "pathways.txt")
            dst_pathway = os.path.join(root, "pathways.txt.disabled")
            logger.info(
                f"Auto-Sanitization: Renaming {src_pathway} to {dst_pathway} to prevent Valhalla segfault."
            )
            try:
                os.rename(src_pathway, dst_pathway)
            except OSError as rename_err:
                logger.warning(f"Could not rename pathways.txt: {rename_err}")

    # 2. Prune entrances and out-of-bounds stops if bounds provided
    if not bounds:
        return

    stops_file = os.path.join(gtfs_dir, "stops.txt")
    stop_times_file = os.path.join(gtfs_dir, "stop_times.txt")
    trips_file = os.path.join(gtfs_dir, "trips.txt")
    transfers_file = os.path.join(gtfs_dir, "transfers.txt")

    if not os.path.exists(stops_file) or not os.path.exists(stop_times_file):
        return

    min_lat = bounds["min_lat"]
    max_lat = bounds["max_lat"]
    min_lon = bounds["min_lon"]
    max_lon = bounds["max_lon"]

    try:
        kept_stops = {}
        with open(stops_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames_stops = reader.fieldnames
            for r in reader:
                # Discard entrances (location_type == 2) to eliminate in/egress null pointer crashes in Valhalla
                if r.get("location_type") == "2":
                    continue
                try:
                    lat = float(r["stop_lat"])
                    lon = float(r["stop_lon"])
                    zone = r.get("zone_id", "").strip()
                    if zone in ("1", "2", "3", "4", "5"):
                        if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
                            kept_stops[r["stop_id"]] = r
                    else:
                        # Stricter bounds for stops without an official IDF zone (e.g. border stations)
                        if 48.35 <= lat <= 49.10 and 1.80 <= lon <= 3.20:
                            kept_stops[r["stop_id"]] = r
                except (ValueError, KeyError):
                    pass

        valid_stop_ids = set()
        for sid, r in kept_stops.items():
            parent = r.get("parent_station")
            if not parent or parent in kept_stops:
                valid_stop_ids.add(sid)

        with open(stops_file + ".tmp", "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames_stops)
            writer.writeheader()
            for sid in valid_stop_ids:
                writer.writerow(kept_stops[sid])

        trip_stops_count: dict[str, int] = {}
        with open(stop_times_file, "r", encoding="utf-8") as in_f:
            reader = csv.DictReader(in_f)
            fieldnames_stop_times = reader.fieldnames
            for r in reader:
                if r["stop_id"] in valid_stop_ids:
                    tid = r["trip_id"]
                    trip_stops_count[tid] = trip_stops_count.get(tid, 0) + 1

        valid_trip_ids = {tid for tid, count in trip_stops_count.items() if count >= 2}

        with open(stop_times_file, "r", encoding="utf-8") as in_f, open(
            stop_times_file + ".tmp", "w", encoding="utf-8", newline=""
        ) as out_f:
            reader = csv.DictReader(in_f)
            writer = csv.DictWriter(out_f, fieldnames=fieldnames_stop_times)
            writer.writeheader()
            for r in reader:
                if r["trip_id"] in valid_trip_ids and r["stop_id"] in valid_stop_ids:
                    writer.writerow(r)

        if os.path.exists(trips_file):
            with open(trips_file, "r", encoding="utf-8") as in_f, open(
                trips_file + ".tmp", "w", encoding="utf-8", newline=""
            ) as out_f:
                reader = csv.DictReader(in_f)
                writer = csv.DictWriter(out_f, fieldnames=reader.fieldnames)
                writer.writeheader()
                for r in reader:
                    if r["trip_id"] in valid_trip_ids:
                        writer.writerow(r)

        if os.path.exists(transfers_file):
            with open(transfers_file, "r", encoding="utf-8") as in_f, open(
                transfers_file + ".tmp", "w", encoding="utf-8", newline=""
            ) as out_f:
                reader = csv.DictReader(in_f)
                writer = csv.DictWriter(out_f, fieldnames=reader.fieldnames)
                writer.writeheader()
                for r in reader:
                    if (
                        r["from_stop_id"] in valid_stop_ids
                        and r["to_stop_id"] in valid_stop_ids
                    ):
                        writer.writerow(r)

        for fname in ["stops.txt", "stop_times.txt", "trips.txt", "transfers.txt"]:
            tmp_f = os.path.join(gtfs_dir, fname + ".tmp")
            dest_f = os.path.join(gtfs_dir, fname)
            if os.path.exists(tmp_f):
                os.replace(tmp_f, dest_f)

        logger.info(
            f"Auto-Sanitization: Pruned perimeter stops for bounds {bounds} "
            f"(kept {len(valid_stop_ids)} stops, {len(valid_trip_ids)} trips)."
        )
    except Exception as e:
        logger.warning(f"Could not complete GTFS boundary sanitization: {e}")


def _publish_transit_event(
    event_name: str,
    city_clean: str,
    city_name: str,
    trip_id: str | None = None,
    **extra: Any,
) -> None:
    try:
        import json

        import redis

        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        event_payload = json.dumps(
            {
                "event": event_name,
                "city": city_clean,
                "city_name": city_name.strip().title()
                if city_name
                else city_clean.title(),
                "trip_id": trip_id,
                **extra,
            }
        )
        r.publish("paladio:events", event_payload)
        logger.info(f"Published {event_name} for {city_name} to Redis.")
    except (redis.RedisError, OSError, RuntimeError) as r_err:
        logger.warning(f"Could not publish {event_name} event: {r_err}")


def _publish_transit_started_event(
    city_clean: str, city_name: str, trip_id: str | None = None
) -> None:
    _publish_transit_event("TRANSIT_DOWNLOAD_STARTED", city_clean, city_name, trip_id)


async def async_trigger_city_gtfs_download_if_needed(
    city_name: str,
    trip_id: str | None = None,
    session: Any | None = None,
) -> bool:
    """
    Checks if GTFS data for the city is already READY and valid.
    If not, asynchronously kicks off build_city_gtfs_task and publishes
    telemetry event to Redis so frontend is notified.
    Returns True if compilation/download was initiated, False if already READY or compiling.
    """
    if not city_name:
        return False

    city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

    # Check if feed exists dynamically or via override
    gtfs_override = CITY_GTFS_MAP.get(city_clean)
    if not gtfs_override:
        from app.services.gtfs_resolver_service import GTFSResolverService

        feed_info = _run_async(GTFSResolverService.resolve_gtfs_feed(city_clean))
        if not feed_info:
            logger.info(
                f"No open GTFS transit schedule feed found for city: {city_clean}"
            )
            _run_async(
                _async_update_transit_cache(
                    city_name=city_clean,
                    status=TransitCacheStatus.READY.value,
                    gtfs_status="UNAVAILABLE",
                )
            )
            _publish_transit_event(
                "TRANSIT_UNAVAILABLE", city_clean, city_name, trip_id
            )
            return False

    from sqlalchemy import select

    from app.db.models import TransitCacheModel

    async def _do_check_and_trigger(db_session):
        stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
        res = await db_session.execute(stmt)
        entry = res.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if (
            entry
            and entry.gtfs_status == "READY"
            and entry.valid_until
            and entry.valid_until > now
        ):
            logger.info(
                f"GTFS data for {city_clean} is already READY and valid until {entry.valid_until}."
            )
            return False

        if entry and entry.gtfs_status in ("BUILDING", "QUEUED"):
            logger.info(
                f"GTFS compilation for {city_clean} is already in progress ({entry.gtfs_status})."
            )
            return False

        # Determine if compilation lock is currently held to set appropriate initial status
        initial_status = TransitCacheStatus.BUILDING.value
        initial_gtfs = "BUILDING"
        try:
            import redis

            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
            r = redis.from_url(redis_url)
            compiler_lock = r.lock("paladio:transit_compiler_lock", timeout=7200)
            if compiler_lock.locked():
                initial_status = TransitCacheStatus.QUEUED.value
                initial_gtfs = "QUEUED"
        except (redis.RedisError, OSError):
            pass

        if not entry:
            entry = TransitCacheModel(
                city=city_clean,
                status=initial_status,
                osm_status="PENDING",
                gtfs_status=initial_gtfs,
            )
            db_session.add(entry)
        else:
            entry.status = initial_status
            entry.gtfs_status = initial_gtfs
        await db_session.commit()
        return True

    try:
        if session is not None:
            should_trigger = await _do_check_and_trigger(session)
        else:
            session_maker, task_engine = _get_task_session_maker()
            try:
                async with session_maker() as new_session:
                    should_trigger = await _do_check_and_trigger(new_session)
            finally:
                await task_engine.dispose()

        if not should_trigger:
            return False

        build_city_gtfs_task.delay(city_name=city_clean, trip_id=trip_id)
        is_locked = False
        try:
            import redis

            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
            r = redis.from_url(redis_url)
            is_locked = r.lock("paladio:transit_compiler_lock", timeout=7200).locked()
        except (redis.RedisError, OSError):
            pass

        if is_locked:
            _publish_transit_event("TRANSIT_QUEUED", city_clean, city_name, trip_id)
        else:
            _publish_transit_started_event(city_clean, city_name, trip_id)
        return True
    except (SQLAlchemyError, OSError, RuntimeError) as e:
        logger.error(f"Error checking/triggering GTFS download for {city_name}: {e}")
        return False


def trigger_city_gtfs_download_if_needed(
    city_name: str,
    trip_id: str | None = None,
) -> bool:
    """Synchronous wrapper for async_trigger_city_gtfs_download_if_needed."""
    return _run_async(async_trigger_city_gtfs_download_if_needed(city_name, trip_id))


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
    Downloads GTFS public transit data in the background, sanitizes pathways,
    compiles Valhalla transit tiles sequentially using a distributed Redis lock,
    and publishes telemetry notifications to Redis.
    """
    import docker
    import redis

    logger.info(
        f"Task {self.request.id}: Starting sequential GTFS compilation for {city_name}"
    )

    city_lower = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = redis.from_url(redis_url)
    lock = r.lock("paladio:transit_compiler_lock", timeout=7200, blocking_timeout=None)

    # 1. Distributed lock handling: check if another compilation holds lock
    acquired = lock.acquire(blocking=False)
    if not acquired:
        logger.info(
            f"Transit compiler lock is held by another process. Marking {city_lower} as QUEUED."
        )
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                status=TransitCacheStatus.QUEUED.value,
                gtfs_status="QUEUED",
            )
        )
        _publish_transit_event("TRANSIT_QUEUED", city_lower, city_name, trip_id)
        # Block until lock is acquired
        lock.acquire(blocking=True)
        logger.info(
            f"Acquired transit compiler lock for {city_lower} after queue wait."
        )

    try:
        # 2. Lock is acquired: update status to BUILDING and publish events
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                status=TransitCacheStatus.BUILDING.value,
                gtfs_status="BUILDING",
            )
        )
        _publish_transit_event(
            "TRANSIT_COMPILE_STARTED", city_lower, city_name, trip_id
        )
        _publish_transit_event(
            "TRANSIT_DOWNLOAD_STARTED", city_lower, city_name, trip_id
        )

        # 3. Resolve GTFS feed URL dynamically (or via override map)
        gtfs_url = CITY_GTFS_MAP.get(city_lower)
        if not gtfs_url:
            from app.services.gtfs_resolver_service import GTFSResolverService

            feed_info = _run_async(GTFSResolverService.resolve_gtfs_feed(city_lower))
            if feed_info:
                gtfs_url = feed_info.download_url
            else:
                logger.warning(
                    f"No open GTFS schedule feed found in global catalog for {city_name}. "
                    "Skipping GTFS compilation cleanly without mocked fallbacks."
                )
                _run_async(
                    _async_update_transit_cache(
                        city_name=city_lower,
                        gtfs_status="UNAVAILABLE",
                        status=TransitCacheStatus.READY.value,
                    )
                )
                _publish_transit_event(
                    "TRANSIT_UNAVAILABLE",
                    city_lower,
                    city_name,
                    trip_id,
                    message=f"No open public transit GTFS schedule found for {city_name}. Walking and driving routing remain available.",
                )
                return {"status": "unavailable", "city": city_lower}

        gtfs_base = os.environ.get("GTFS_BASE_DIR", "/gtfs_feeds")
        gtfs_dest_dir = f"{gtfs_base}/{city_lower}"
        valid_until = datetime.now(timezone.utc) + timedelta(days=90)

        os.makedirs(gtfs_dest_dir, exist_ok=True)
        zip_tmp = f"/tmp/{city_lower}_gtfs.zip"
        logger.info(f"Downloading GTFS feed from {gtfs_url} to {zip_tmp}...")
        try:
            download_headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                ),
                "Accept": "application/zip, application/octet-stream, */*",
            }
            with httpx.Client(follow_redirects=True, timeout=60.0) as client:
                with client.stream("GET", gtfs_url, headers=download_headers) as resp:
                    resp.raise_for_status()
                    with open(zip_tmp, "wb") as out_f:
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            out_f.write(chunk)

            with zipfile.ZipFile(zip_tmp, "r") as zip_ref:
                target_base = os.path.abspath(gtfs_dest_dir)
                for member in zip_ref.infolist():
                    member_path = os.path.abspath(
                        os.path.join(target_base, member.filename)
                    )
                    if os.path.commonpath([target_base, member_path]) != target_base:
                        raise ValueError(
                            f"Zip Slip attempt detected in member: {member.filename}"
                        )
                    zip_ref.extract(member, target_base)
            if os.path.exists(zip_tmp):
                os.remove(zip_tmp)
            valid_until = extract_gtfs_expiry(gtfs_dest_dir)
        except (
            httpx.HTTPError,
            urllib.error.URLError,
            OSError,
            zipfile.BadZipFile,
            ValueError,
        ) as gtfs_err:
            logger.warning(f"Could not extract GTFS feed for {city_name}: {gtfs_err}")
            _run_async(
                _async_update_transit_cache(
                    city_name=city_lower,
                    gtfs_status="UNAVAILABLE",
                    status=TransitCacheStatus.READY.value,
                )
            )
            _publish_transit_event(
                "TRANSIT_UNAVAILABLE",
                city_lower,
                city_name,
                trip_id,
                message=f"Failed to download or extract GTFS feed for {city_name}: {gtfs_err}",
            )
            return {"status": "unavailable", "city": city_lower}

        # 4. Auto-Sanitization: dynamically resolve bounds from Geofabrik metadata
        if os.path.exists(gtfs_dest_dir):
            from app.services.osm_map_service import OSMMapService

            dynamic_bounds = _run_async(
                OSMMapService.get_city_extract_bounds(city_lower)
            )
            sanitize_gtfs_feed(gtfs_dest_dir, bounds=dynamic_bounds)

        # 4b. Valhalla container setup & timezone check
        client = docker.from_env()
        container = client.containers.get("paladio-valhalla-1")

        tz_sqlite_path = "/custom_files/timezone_data/timezones.sqlite"
        tz_missing = True
        try:
            tz_missing = (
                not os.path.exists(tz_sqlite_path)
                or os.path.getsize(tz_sqlite_path) == 0
            )
        except OSError:
            tz_missing = True

        if tz_missing:
            logger.info("Timezone database missing. Building timezones.sqlite...")
            tz_build_res = container.exec_run(
                'sh -c "mkdir -p /custom_files/timezone_data && valhalla_build_timezones > /custom_files/timezone_data/timezones.sqlite"'
            )
            if tz_build_res.exit_code != 0:
                logger.warning(
                    f"valhalla_build_timezones exit code {tz_build_res.exit_code}: {tz_build_res.output.decode('utf-8', errors='replace')}"
                )

        # 5. Resolve OSM PBF file for city
        from app.services.osm_map_service import OSMMapService

        _, city_osm_pbf = _run_async(OSMMapService.resolve_osm_pbf_url(city_lower))
        dest_pbf = f"/custom_files/{city_osm_pbf}"
        pbf_missing = True
        try:
            pbf_missing = not os.path.exists(dest_pbf) or os.path.getsize(dest_pbf) == 0
        except OSError:
            pbf_missing = True

        if pbf_missing:
            url, _ = _run_async(OSMMapService.resolve_osm_pbf_url(city_lower))
            logger.info(f"Downloading required OSM extract {url} to {dest_pbf}...")
            urllib.request.urlretrieve(url, dest_pbf)

        # 6. Sequential Valhalla Compilation Commands via docker library
        # Clean previous tiles and stale archives to avoid corrupted intermediate states
        container.exec_run(
            "rm -rf /custom_files/valhalla_tiles/* /custom_files/transit_tiles/* /custom_files/valhalla_tiles.tar"
        )

        logger.info(f"Executing Valhalla transit ingest for {city_lower}...")
        res_ingest = container.exec_run(
            "valhalla_ingest_transit -c /custom_files/valhalla.json"
        )
        if res_ingest.exit_code != 0:
            err_msg = (
                res_ingest.output.decode("utf-8", errors="replace")
                if hasattr(res_ingest.output, "decode")
                else str(res_ingest.output)
            )
            raise RuntimeError(
                f"valhalla_ingest_transit failed with code {res_ingest.exit_code}: {err_msg}"
            )

        logger.info(f"Executing Valhalla transit convert for {city_lower}...")
        res_convert = container.exec_run(
            "valhalla_convert_transit -c /custom_files/valhalla.json"
        )
        if res_convert.exit_code != 0:
            err_msg = (
                res_convert.output.decode("utf-8", errors="replace")
                if hasattr(res_convert.output, "decode")
                else str(res_convert.output)
            )
            raise RuntimeError(
                f"valhalla_convert_transit failed with code {res_convert.exit_code}: {err_msg}"
            )

        logger.info(
            f"Executing full Valhalla tile build pipeline for {city_osm_pbf}..."
        )
        res_build = container.exec_run(
            f"valhalla_build_tiles -c /custom_files/valhalla.json /custom_files/{city_osm_pbf}"
        )
        if res_build.exit_code != 0:
            err_msg = (
                res_build.output.decode("utf-8", errors="replace")
                if hasattr(res_build.output, "decode")
                else str(res_build.output)
            )
            raise RuntimeError(
                f"valhalla_build_tiles failed with code {res_build.exit_code}: {err_msg}"
            )

        logger.info(f"Executing Valhalla extract tiles for {city_lower}...")
        res_extract = container.exec_run(
            "valhalla_build_extract -c /custom_files/valhalla.json -v --overwrite"
        )
        if res_extract.exit_code != 0:
            err_msg = (
                res_extract.output.decode("utf-8", errors="replace")
                if hasattr(res_extract.output, "decode")
                else str(res_extract.output)
            )
            raise RuntimeError(
                f"valhalla_build_extract failed with code {res_extract.exit_code}: {err_msg}"
            )

        logger.info("Reloading Valhalla container...")
        container.restart()

        # 7. Update cache as READY on success
        _run_async(
            _async_update_transit_cache(
                city_name=city_lower,
                status=TransitCacheStatus.READY.value,
                osm_status="READY",
                gtfs_status="READY",
                valid_until=valid_until,
                feed_name=city_osm_pbf,
            )
        )
        _publish_transit_event("TRANSIT_TILES_READY", city_lower, city_name, trip_id)

        return {
            "status": "success",
            "city": city_lower,
            "gtfs_status": "READY",
            "valid_until": valid_until.isoformat(),
        }

    except Exception as exc:
        logger.error(f"Failed GTFS compilation for {city_name}: {exc}")
        try:
            _run_async(
                _async_update_transit_cache(
                    city_name=city_lower,
                    status=TransitCacheStatus.FAILED.value,
                    gtfs_status="FAILED",
                )
            )
        except (SQLAlchemyError, OSError, RuntimeError) as db_err:
            logger.warning(f"Could not update gtfs_status to FAILED: {db_err}")
        _publish_transit_event(
            "TRANSIT_COMPILE_FAILED", city_lower, city_name, trip_id, error=str(exc)
        )
        raise
    finally:
        try:
            lock.release()
            logger.info(f"Cleanly released transit compiler lock for {city_name}.")
        except (redis.exceptions.LockError, redis.RedisError) as lock_err:
            logger.debug(f"Lock release note for {city_name}: {lock_err}")
