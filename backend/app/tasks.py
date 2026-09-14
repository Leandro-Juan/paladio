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
        # Run the async ingestion script synchronously in the Celery worker
        from app.db.session import async_session

        async def run_fetch():
            async with async_session() as session:
                repo = SqlPoiRepository(session)
                provider = OverpassProviderAdapter()
                await _fetch_and_store_pois(city_name, repo, provider)

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
    "madrid": "https://data.crtm.es/gtfs/google_transit.zip",
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
    status: str,
    valid_until: datetime | None = None,
    feed_name: str | None = None,
):
    from sqlalchemy import select

    from app.db.models import TransitCacheModel
    from app.db.session import async_session

    async with async_session() as session:
        stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_name)
        res = await session.execute(stmt)
        record = res.scalar_one_or_none()
        if not record:
            record = TransitCacheModel(
                city=city_name,
                status=status,
                valid_until=valid_until,
                gtfs_feed_name=feed_name,
            )
            session.add(record)
        else:
            record.status = status
            if valid_until is not None:
                record.valid_until = valid_until
            if feed_name is not None:
                record.gtfs_feed_name = feed_name
        await session.commit()


@app.task(
    bind=True,
    name="app.tasks.build_city_map_task",
    autoretry_for=(httpx.RequestError,),
    retry_backoff=True,
    max_retries=1,
)
def build_city_map_task(self, city_name: str):
    """
    Downloads OSM map data and GTFS public transit data for the city,
    unpacks feeds, extracts expiry dates, and triggers a Valhalla tile rebuild.
    """
    logger.info(
        f"Task {self.request.id}: Starting Valhalla map and GTFS build for {city_name}"
    )

    city_lower = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

    # 1. Mark cache status as BUILDING in DB
    try:
        asyncio.run(
            _async_update_transit_cache(
                city_name=city_lower, status=TransitCacheStatus.BUILDING.value
            )
        )
    except (SQLAlchemyError, OSError, RuntimeError) as e:
        logger.warning(f"Could not set transit_cache BUILDING status: {e}")

    # Map cities to their Geofabrik paths
    geofabrik_map = {
        "oporto": "europe/portugal-latest.osm.pbf",
        "porto": "europe/portugal-latest.osm.pbf",
        "madrid": "europe/spain/madrid-latest.osm.pbf",
        "paris": "europe/france/ile-de-france-latest.osm.pbf",
        "barcelona": "europe/spain/cataluna-latest.osm.pbf",
    }

    path = geofabrik_map.get(city_lower)
    if not path:
        logger.error(f"No Geofabrik mapping found for {city_name}.")
        asyncio.run(
            _async_update_transit_cache(
                city_name=city_lower, status=TransitCacheStatus.FAILED.value
            )
        )
        return {"status": "error", "message": f"Unknown city mapping: {city_name}"}

    url = f"http://download.geofabrik.de/{path}"
    file_name = path.split("/")[-1]
    dest_path = f"/custom_files/{file_name}"

    try:
        # Download OSM .pbf if not present
        if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
            logger.info(f"Downloading {url} to {dest_path}...")
            urllib.request.urlretrieve(url, dest_path)
            logger.info(f"Successfully downloaded {file_name}.")
        else:
            logger.info(f"OSM file {file_name} already present at {dest_path}.")

        # Download & extract GTFS feed if available
        gtfs_url = CITY_GTFS_MAP.get(city_lower)
        gtfs_dest_dir = f"/gtfs_feeds/{city_lower}"
        valid_until = datetime.now(timezone.utc) + timedelta(days=90)

        if gtfs_url:
            os.makedirs(gtfs_dest_dir, exist_ok=True)
            zip_tmp = f"/tmp/{city_lower}_gtfs.zip"
            logger.info(f"Downloading GTFS feed from {gtfs_url} to {zip_tmp}...")
            urllib.request.urlretrieve(gtfs_url, zip_tmp)

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
            logger.info(f"Extracted GTFS feed into {gtfs_dest_dir}.")

            valid_until = extract_gtfs_expiry(gtfs_dest_dir)
            logger.info(
                f"Calculated GTFS schedule validity for {city_name}: {valid_until.isoformat()}"
            )

        # Trigger Valhalla rebuild webhook
        logger.info("Triggering Valhalla map rebuild via internal webhook...")
        try:
            webhook_url = os.getenv(
                "VALHALLA_REBUILD_WEBHOOK", "http://host.docker.internal:8080/rebuild"
            )
            response = httpx.post(
                webhook_url, json={"file": file_name, "city": city_lower}, timeout=10.0
            )
            response.raise_for_status()
            logger.info("Webhook triggered successfully.")
        except httpx.HTTPError as webhook_err:
            logger.warning(
                f"Valhalla webhook not reachable ({webhook_err}), relying on container restart or file reload."
            )

        # Update cache as READY
        asyncio.run(
            _async_update_transit_cache(
                city_name=city_lower,
                status=TransitCacheStatus.READY.value,
                valid_until=valid_until,
                feed_name=file_name,
            )
        )

        return {
            "status": "success",
            "city": city_lower,
            "file": file_name,
            "valid_until": valid_until.isoformat(),
        }

    except Exception as exc:
        logger.error(f"Failed to build map & transit for {city_name}: {exc}")
        asyncio.run(
            _async_update_transit_cache(
                city_name=city_lower, status=TransitCacheStatus.FAILED.value
            )
        )
        raise
