import os
import shutil
import tempfile
import zipfile
from unittest.mock import MagicMock, patch

import pytest
import redis
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.db.models import TransitCacheModel, TransitCacheStatus
from app.tasks import build_city_gtfs_task

pytestmark = [pytest.mark.slow]


def test_transit_cache_status_enum():
    """Verify TransitCacheStatus contains all required enum members."""
    assert TransitCacheStatus.PENDING == "PENDING"
    assert TransitCacheStatus.QUEUED == "QUEUED"
    assert TransitCacheStatus.BUILDING == "BUILDING"
    assert TransitCacheStatus.READY == "READY"
    assert TransitCacheStatus.FAILED == "FAILED"


@pytest.mark.asyncio
async def test_gtfs_registry_response_with_queued_city(
    async_client: AsyncClient, db_session
):
    """Verify GtfsRegistryResponse and CityGtfsItem return QUEUED and is_queued."""
    # Clean up test city
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "porto")
    )
    porto_cache = TransitCacheModel(
        city="porto",
        status=TransitCacheStatus.QUEUED.value,
        osm_status="READY",
        gtfs_status="QUEUED",
    )
    db_session.add(porto_cache)
    await db_session.commit()

    res = await async_client.get("/api/v1/trips/transit/registry")
    assert res.status_code == 200
    data = res.json()

    assert data["has_active_process"] is True
    assert data["queued_cities"] >= 1

    porto_item = next((c for c in data["cities"] if c["city"] == "porto"), None)
    assert porto_item is not None
    assert porto_item["gtfs_status"] == "QUEUED"
    assert porto_item["is_queued"] is True
    assert porto_item["is_ready"] is False
    assert porto_item["is_building"] is False


@pytest.mark.asyncio
async def test_trigger_compile_when_lock_held(async_client: AsyncClient, db_session):
    """When lock is held, trigger endpoint marks city as QUEUED."""
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    r = redis.from_url(redis_url)
    lock = r.lock("paladio:transit_compiler_lock", timeout=60)
    lock.acquire()

    try:
        res = await async_client.post(
            "/api/v1/trips/transit/compile",
            json={"city": "oporto"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "queued"
        assert "queued" in data["message"].lower()

        # Check DB
        stmt = select(TransitCacheModel).where(TransitCacheModel.city == "oporto")
        db_res = await db_session.execute(stmt)
        record = db_res.scalar_one_or_none()
        assert record is not None
        assert record.gtfs_status == "QUEUED"
    finally:
        try:
            lock.release()
        except Exception:
            pass


def test_build_city_gtfs_task_execution_and_sanitization():
    """Verify build_city_gtfs_task performs pathways auto-sanitization, timezone check, docker compilation, and releases lock."""
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    r = redis.from_url(redis_url)
    r.delete("paladio:transit_compiler_lock")

    temp_gtfs_dir = tempfile.mkdtemp()
    real_exists = os.path.exists

    try:
        zip_path = os.path.join(temp_gtfs_dir, "test.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("pathways.txt", "pathway_id,from_stop_id,to_stop_id\n1,A,B\n")
            zf.writestr(
                "calendar.txt",
                "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n1,1,1,1,1,1,1,1,20260101,20261231\n",
            )

        mock_container = MagicMock()
        mock_exec_result = MagicMock()
        mock_exec_result.exit_code = 0
        mock_exec_result.output = b"Success"
        mock_container.exec_run.return_value = mock_exec_result

        mock_docker_client = MagicMock()
        mock_docker_client.containers.get.return_value = mock_container

        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        with open(zip_path, "rb") as zf:
            zip_bytes = zf.read()
        mock_resp.iter_bytes.return_value = [zip_bytes]

        mock_http_client = MagicMock()
        mock_http_client.__enter__.return_value = mock_http_client
        mock_http_client.__exit__.return_value = None
        mock_http_client.stream.return_value.__enter__.return_value = mock_resp
        mock_http_client.stream.return_value.__exit__.return_value = None

        with patch("docker.from_env", return_value=mock_docker_client), patch(
            "app.tasks._async_update_transit_cache"
        ), patch("app.tasks._publish_transit_event") as mock_publish, patch(
            "app.tasks.CITY_GTFS_MAP", {"mockcity": "http://example.com/gtfs.zip"}
        ), patch("httpx.Client", return_value=mock_http_client), patch(
            "urllib.request.urlretrieve"
        ), patch(
            "app.services.osm_map_service.OSMMapService.resolve_osm_pbf_url",
            return_value=("http://example.com/osm.pbf", "mockcity-latest.osm.pbf"),
        ), patch.dict(
            os.environ, {"GTFS_BASE_DIR": temp_gtfs_dir, "REDIS_URL": redis_url}
        ):
            res = build_city_gtfs_task(city_name="mockcity")

            assert res["status"] == "success"
            assert res["gtfs_status"] == "READY"

            dest_dir = os.path.join(temp_gtfs_dir, "mockcity")
            assert real_exists(os.path.join(dest_dir, "pathways.txt.disabled"))
            assert not real_exists(os.path.join(dest_dir, "pathways.txt"))

            calls = [call.args[0] for call in mock_container.exec_run.call_args_list]
            assert any("valhalla_ingest_transit" in cmd for cmd in calls)
            assert any("valhalla_convert_transit" in cmd for cmd in calls)
            assert any("valhalla_build_tiles" in cmd for cmd in calls)
            assert any("valhalla_build_extract" in cmd for cmd in calls)
            assert mock_container.restart.called

            published_events = [call.args[0] for call in mock_publish.call_args_list]
            assert "TRANSIT_COMPILE_STARTED" in published_events
            assert "TRANSIT_DOWNLOAD_STARTED" in published_events
            assert "TRANSIT_TILES_READY" in published_events

            lock = r.lock("paladio:transit_compiler_lock", timeout=60)
            assert not lock.locked()

    finally:
        shutil.rmtree(temp_gtfs_dir, ignore_errors=True)
        r.delete("paladio:transit_compiler_lock")
