"""
Phase 6 Integration Tests: Celery Beat Orchestration, Redis Locking, Kill Switches, and Resilience.

Gates:
- Celery beat schedule runs daily-market-pipeline at 03:00 UTC.
- Redis lock prevents concurrent pipeline executions.
- Kill switches disable stages and providers cleanly.
- Hourly circuit breaker cooldown and consecutive failure days tracking.
- Gate: Two consecutive unattended daily runs complete, with a failure injected into one provider and one route.
"""

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
import pytest
import redis
from sqlalchemy import select

from app.celery_app import app as celery_app, redis_url
from app.db.models import (
    ProviderHealthModel,
)
from app.db.session import async_session
from app.engine.market.config import config
from app.engine.market.ports import FareObservation
from app.engine.market.providers.base import BaseQuoteProvider, NoDataError
from app.engine.market.providers.router import ProviderRouter
from app.tasks import (
    daily_baseline_compute_task,
    daily_deal_detection_task,
    daily_flight_sweep_task,
    daily_market_pipeline_task,
)


@pytest.fixture(autouse=True)
def _clean_daily_pipeline_redis_lock():
    """Ensure no stale lock from prior runs poisons pipeline orchestration tests."""
    r = redis.Redis.from_url(redis_url)
    r.delete("paladio:market:daily_chain_lock")
    try:
        yield
    finally:
        r.delete("paladio:market:daily_chain_lock")


@pytest.mark.asyncio
async def test_celery_beat_schedule_configuration():
    """Verify that celery beat_schedule configures daily-market-pipeline at 03:00 UTC."""
    schedule = celery_app.conf.beat_schedule
    assert "daily-market-pipeline" in schedule
    assert "periodic-route-market-scan" not in schedule

    task_entry = schedule["daily-market-pipeline"]
    assert task_entry["task"] == "app.tasks.daily_market_pipeline_task"
    # Verify crontab schedule at hour=3, minute=0
    sched = task_entry["schedule"]
    assert hasattr(sched, "hour")
    assert 3 in sched.hour
    assert 0 in sched.minute


def test_daily_market_pipeline_redis_lock():
    """Verify that Redis lock prevents concurrent / overlapping runs of daily pipeline."""
    r = redis.Redis.from_url(redis_url)
    lock_key = "paladio:market:daily_chain_lock"

    # Pre-acquire the lock manually to simulate an active pipeline run
    manual_lock = r.lock(lock_key, timeout=60, blocking=False)
    acquired = manual_lock.acquire()
    assert acquired is True, "Failed to acquire test lock"

    try:
        # Calling daily_market_pipeline_task should immediately skip with 'lock_acquired'
        res = daily_market_pipeline_task()
        assert res["status"] == "skipped"
        assert res["reason"] == "lock_acquired"
    finally:
        manual_lock.release()


def test_pipeline_kill_switches(monkeypatch):
    """Verify that pipeline stage kill switches disable stages cleanly."""
    disabled_config = replace(
        config,
        ENABLE_SWEEP=False,
        ENABLE_BASELINES=False,
        ENABLE_DETECTION=False,
    )
    monkeypatch.setattr("app.engine.market.config.config", disabled_config)

    sweep_res = daily_flight_sweep_task()
    assert sweep_res["status"] == "disabled"

    baselines_res = daily_baseline_compute_task()
    assert baselines_res["status"] == "disabled"

    detection_res = daily_deal_detection_task()
    assert detection_res["status"] == "disabled"

    # Full pipeline with all disabled returns completed without crashing
    pipeline_res = daily_market_pipeline_task()
    assert pipeline_res["status"] == "completed"
    assert pipeline_res["sweep"]["status"] == "disabled"
    assert pipeline_res["baselines"]["status"] == "disabled"
    assert pipeline_res["detection"]["status"] == "disabled"


@pytest.mark.asyncio
async def test_router_provider_kill_switch(monkeypatch):
    """Verify that router skips providers disabled via kill switches."""
    mock_provider = MagicMock(spec=BaseQuoteProvider)
    mock_provider.name = "aviasales"
    mock_provider.fetch_cached_flights = AsyncMock(return_value=[])

    router = ProviderRouter(asset_type="flight", providers=[mock_provider])

    disabled_config = replace(config, ENABLE_AVIASALES=False)
    monkeypatch.setattr("app.engine.market.config.config", disabled_config)
    monkeypatch.setattr("app.engine.market.providers.router.config", disabled_config)

    async with async_session() as session:
        with pytest.raises(NoDataError) as exc_info:
            await router.execute_ladder(
                session,
                "fetch_cached_flights",
                "MAD",
                "BCN",
                date.today(),
                date.today() + timedelta(days=3),
            )
        assert "no flight data obtainable" in str(exc_info.value).lower()
        mock_provider.fetch_cached_flights.assert_not_called()


@pytest.mark.asyncio
async def test_router_hourly_cooldown_and_consecutive_failure_days(monkeypatch):
    """Verify router tracks consecutive failure days and enforces hourly cooldown on open breaker."""
    provider_name = f"test_prov_{int(datetime.now().timestamp())}"
    mock_provider = MagicMock(spec=BaseQuoteProvider)
    mock_provider.name = provider_name
    mock_provider.fetch_cached_flights = AsyncMock(
        side_effect=Exception("API service down")
    )

    router = ProviderRouter(asset_type="flight", providers=[mock_provider])

    breaker_config = replace(config, BREAKER_FAILURES=2, BREAKER_COOLDOWN_HOURS=24)
    monkeypatch.setattr("app.engine.market.config.config", breaker_config)
    monkeypatch.setattr("app.engine.market.providers.router.config", breaker_config)

    now = datetime.now(timezone.utc)
    yesterday = now.date() - timedelta(days=1)

    async with async_session() as session:
        # Pre-seed provider_health as having failed yesterday
        health = ProviderHealthModel(
            provider=provider_name,
            asset_type="flight",
            status="ok",
            failure_count=1,
            consecutive_failures=1,
            consecutive_failure_days=1,
            last_failure_date=yesterday,
        )
        session.add(health)
        await session.commit()

        # Call execute_ladder which triggers second failure (today)
        with pytest.raises(NoDataError):
            await router.execute_ladder(
                session,
                "fetch_cached_flights",
                "MAD",
                "BCN",
                date.today(),
                date.today() + timedelta(days=3),
            )

        # Inspect updated health row
        stmt = select(ProviderHealthModel).where(
            ProviderHealthModel.provider == provider_name,
            ProviderHealthModel.asset_type == "flight",
        )
        res = await session.execute(stmt)
        updated = res.scalar_one()

        assert updated.consecutive_failures == 2
        assert updated.status == "open_breaker"
        assert (
            updated.consecutive_failure_days == 2
        )  # Yesterday + Today = 2 consecutive days!
        assert updated.last_failure_date == now.date()

        # Subsequent call during 24h cooldown should be blocked by open breaker without calling provider
        mock_provider.fetch_cached_flights.reset_mock()
        with pytest.raises(NoDataError):
            await router.execute_ladder(
                session,
                "fetch_cached_flights",
                "MAD",
                "BCN",
                date.today(),
                date.today() + timedelta(days=3),
            )
        mock_provider.fetch_cached_flights.assert_not_called()


@pytest.mark.asyncio
async def test_gate_two_consecutive_unattended_daily_runs_with_injected_failures(
    monkeypatch,
):
    """
    Phase 6 Gate: Two consecutive unattended daily runs complete,
    with a failure injected into one provider and one route.
    """
    now = datetime.now(timezone.utc)

    # Define two pilot routes: one good, one injected with error
    pilot_routes = [["OK1", "DEST"], ["ERR", "DEST"]]

    # Mock provider: succeeds for OK1, raises exception for ERR
    from app.engine.market.sweep import FareProvider

    class InjectedMockProvider(FareProvider):
        @property
        def name(self) -> str:
            return "injected_aviasales"

        async def fetch_month(
            self, origin: str, dest: str, month: date, trip_type: str = "one_way"
        ) -> list[FareObservation]:
            if origin == "ERR" or dest == "ERR":
                raise ConnectionResetError(
                    "Simulated provider upstream failure for route ERR"
                )
            # Successful route
            return [
                FareObservation(
                    origin=origin,
                    destination=dest,
                    depart_date=month,
                    depart_time=None,
                    arrival_time=None,
                    return_date=None,
                    trip_type="one_way",
                    price_cents=4500,
                    currency="EUR",
                    carrier="OK",
                    flight_number="OK100",
                    stops=0,
                    deep_link=None,
                    source="injected_aviasales",
                    source_class="cache",
                    market="es",
                    found_at=now,
                    fetched_at=now,
                )
            ]

    mock_provider = InjectedMockProvider()
    monkeypatch.setattr(
        "app.engine.market.adapters.CompositeFlightFeed", lambda *a, **kw: mock_provider
    )

    r = redis.Redis.from_url(redis_url)
    r.delete("paladio:market:daily_chain_lock")
    try:
        # RUN 1
        run1_res = daily_market_pipeline_task(
            pilot_routes=pilot_routes, spread_across_day=False
        )
        assert run1_res["status"] == "completed", f"Run 1 failed: {run1_res}"
        assert run1_res["sweep"]["status"] == "completed"
        assert run1_res["sweep"]["routes_ok"] > 0
        assert run1_res["sweep"]["calls_failed"] > 0  # Failed route was isolated!

        # RUN 2 (Consecutive unattended run)
        run2_res = daily_market_pipeline_task(
            pilot_routes=pilot_routes, spread_across_day=False
        )
        assert run2_res["status"] == "completed", f"Run 2 failed: {run2_res}"
        assert run2_res["sweep"]["status"] == "completed"
        assert run2_res["sweep"]["routes_ok"] > 0
        assert run2_res["sweep"]["calls_failed"] > 0
    finally:
        r.delete("paladio:market:daily_chain_lock")
