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


@pytest.mark.asyncio
async def test_trigger_compile_when_another_city_is_building(
    async_client: AsyncClient, db_session
):
    """When another city is BUILDING in DB, trigger endpoint marks new city as QUEUED even without redis lock."""
    await db_session.execute(
        delete(TransitCacheModel).where(
            TransitCacheModel.city.in_(["testcity1", "testcity2"])
        )
    )
    city1 = TransitCacheModel(
        city="testcity1",
        status=TransitCacheStatus.BUILDING.value,
        osm_status="READY",
        gtfs_status="BUILDING",
    )
    db_session.add(city1)
    await db_session.commit()

    with patch("app.tasks.build_city_gtfs_task.delay"):
        res = await async_client.post(
            "/api/v1/trips/transit/compile",
            json={"city": "testcity2"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "queued"

        stmt = select(TransitCacheModel).where(TransitCacheModel.city == "testcity2")
        db_res = await db_session.execute(stmt)
        record = db_res.scalar_one_or_none()
        assert record is not None
        assert record.gtfs_status == "QUEUED"
        assert record.status == TransitCacheStatus.QUEUED.value

    # Cleanup
    await db_session.execute(
        delete(TransitCacheModel).where(
            TransitCacheModel.city.in_(["testcity1", "testcity2"])
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_async_trigger_when_city_gtfs_already_ready(db_session):
    """Verify async_trigger_city_gtfs_download_if_needed returns False without unpacking error when READY."""
    from datetime import datetime, timedelta, timezone
    from app.tasks import async_trigger_city_gtfs_download_if_needed

    city_name = "sevilla_ready_test"
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == city_name)
    )
    ready_entry = TransitCacheModel(
        city=city_name,
        status=TransitCacheStatus.READY.value,
        osm_status="READY",
        gtfs_status="READY",
        valid_until=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db_session.add(ready_entry)
    await db_session.commit()

    with patch("app.tasks.CITY_GTFS_MAP", {city_name: "http://example.com/gtfs.zip"}):
        # 1. With provided session
        res_with_session = await async_trigger_city_gtfs_download_if_needed(
            city_name=city_name, session=db_session
        )
        assert res_with_session is False

        # 2. Without provided session (spawns own session via _get_task_session_maker)
        from unittest.mock import AsyncMock
        from sqlalchemy.ext.asyncio import async_sessionmaker

        mock_engine = MagicMock()
        mock_engine.dispose = AsyncMock()
        with patch(
            "app.tasks._get_task_session_maker",
            return_value=(
                async_sessionmaker(db_session.bind, expire_on_commit=False),
                mock_engine,
            ),
        ):
            res_without_session = await async_trigger_city_gtfs_download_if_needed(
                city_name=city_name, session=None
            )
            assert res_without_session is False

    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == city_name)
    )
    await db_session.commit()


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
        ), patch("app.tasks._city_exists_in_transit_cache", return_value=True), patch(
            "app.tasks._publish_transit_event"
        ) as mock_publish, patch(
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


@pytest.mark.asyncio
async def test_cancelling_previous_download_advances_queued_city(
    async_client: AsyncClient, db_session
):
    """Verify that cancelling a city triggers the next queued city automatically."""
    await db_session.execute(
        delete(TransitCacheModel).where(
            (TransitCacheModel.city.in_(["city_active", "city_queued"]))
            | (TransitCacheModel.gtfs_status == "QUEUED")
        )
    )
    await db_session.commit()
    # City 1: BUILDING
    c1 = TransitCacheModel(
        city="city_active",
        status=TransitCacheStatus.BUILDING.value,
        osm_status="READY",
        gtfs_status="BUILDING",
    )
    # City 2: QUEUED
    c2 = TransitCacheModel(
        city="city_queued",
        status=TransitCacheStatus.QUEUED.value,
        osm_status="READY",
        gtfs_status="QUEUED",
    )
    db_session.add_all([c1, c2])
    await db_session.commit()

    with patch("app.tasks.build_city_gtfs_task.delay") as mock_delay:
        res = await async_client.delete("/api/v1/trips/transit/city_active")
        assert res.status_code == 200

        # Verify build_city_gtfs_task was delayed for city_queued
        mock_delay.assert_called_with(city_name="city_queued")

    await db_session.execute(
        delete(TransitCacheModel).where(
            TransitCacheModel.city.in_(["city_active", "city_queued"])
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_stale_failed_task_healed_on_trip_trigger(db_session):
    """Verify that a trip trigger auto-heals an orphaned/failed QUEUED city and dispatches a build."""
    from app.tasks import async_trigger_city_gtfs_download_if_needed

    city_name = "madrid_heal_test"
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == city_name)
    )
    stale_record = TransitCacheModel(
        city=city_name,
        status=TransitCacheStatus.QUEUED.value,
        osm_status="PENDING",
        gtfs_status="QUEUED",
    )
    db_session.add(stale_record)
    await db_session.commit()

    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    r = redis.from_url(redis_url)
    r.set(f"paladio:transit_task_id:{city_name}", "fake-failed-task-id", ex=300)

    # Mock AsyncResult so it reports FAILURE (dead task)
    mock_async_res = MagicMock()
    mock_async_res.ready.return_value = True
    mock_async_res.state = "FAILURE"

    with patch("celery.result.AsyncResult", return_value=mock_async_res), patch(
        "app.tasks.build_city_gtfs_task.delay"
    ) as mock_delay, patch(
        "app.tasks.CITY_GTFS_MAP", {city_name: "http://example.com/gtfs.zip"}
    ):
        result = await async_trigger_city_gtfs_download_if_needed(
            city_name=city_name, session=db_session
        )
        assert result is True
        mock_delay.assert_called_once()

    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == city_name)
    )
    await db_session.commit()
    r.delete(f"paladio:transit_task_id:{city_name}")
