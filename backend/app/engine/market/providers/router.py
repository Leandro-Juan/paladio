"""
ProviderRouter manages tiered fallback, circuit breakers, daily request budgets,
and health telemetry across providers.
"""

import logging
from datetime import datetime, timezone
from typing import Any
from app.db.models import ProviderHealthModel
from app.engine.market.config import config
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    CircuitBreakerOpenError,
    DailyBudgetExhaustedError,
    NoDataError,
    ProviderBlockedError,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ProviderRouter:
    """
    Orchestrates provider execution ladder with circuit breaking, budget throttling,
    and fallback sequencing.
    """

    def __init__(self, asset_type: str, providers: list[BaseQuoteProvider]):
        self.asset_type = asset_type
        self.providers = providers

    async def _get_health(
        self, session: AsyncSession, provider_name: str
    ) -> ProviderHealthModel:
        stmt = select(ProviderHealthModel).where(
            ProviderHealthModel.provider == provider_name,
            ProviderHealthModel.asset_type == self.asset_type,
        )
        res = await session.execute(stmt)
        health = res.scalar_one_or_none()
        if not health:
            health = ProviderHealthModel(
                provider=provider_name,
                asset_type=self.asset_type,
                status="ok",
                failure_count=0,
                consecutive_failures=0,
            )
            session.add(health)
            await session.flush()
        return health

    async def _record_success(self, session: AsyncSession, provider_name: str) -> None:
        health = await self._get_health(session, provider_name)
        health.status = "ok"
        health.consecutive_failures = 0
        health.last_ok_at = datetime.now(timezone.utc)
        health.last_error = None
        await session.commit()

    async def _record_failure(
        self, session: AsyncSession, provider_name: str, error_msg: str
    ) -> None:
        health = await self._get_health(session, provider_name)
        health.failure_count += 1
        health.consecutive_failures += 1
        health.last_error = error_msg[:500]
        if health.consecutive_failures >= config.BREAKER_FAILURES:
            health.status = "open_breaker"
            logger.warning(
                f"[Router] Breaker tripped for {provider_name} ({self.asset_type}) after {health.consecutive_failures} failures."
            )
        else:
            health.status = "degraded"
        await session.commit()

    async def execute_ladder(
        self, session: AsyncSession, operation_name: str, *args, **kwargs
    ) -> Any:
        """
        Iterates over providers in ladder priority order.
        Skips broken or exhausted providers and fails fast if all fail.
        """
        now = datetime.now(timezone.utc)
        errors: list[str] = []

        for provider in self.providers:
            health = await self._get_health(session, provider.name)

            # Check circuit breaker
            if health.status == "open_breaker":
                time_since_update = (now - health.updated_at).total_seconds()
                if time_since_update < config.BREAKER_COOLDOWN_SEC:
                    logger.debug(
                        f"[Router] Skipping {provider.name}: breaker open (cooldown {int(config.BREAKER_COOLDOWN_SEC - time_since_update)}s remaining)"
                    )
                    continue
                else:
                    logger.info(f"[Router] Half-open test for {provider.name}")

            # Check if method exists on provider
            method = getattr(provider, operation_name, None)
            if not method or not callable(method):
                continue

            try:
                result = await method(*args, session=session, **kwargs)
                if result:
                    await self._record_success(session, provider.name)
                    return result
            except (
                ProviderBlockedError,
                DailyBudgetExhaustedError,
                CircuitBreakerOpenError,
            ) as p_err:
                err_msg = f"{provider.name}: {p_err}"
                logger.warning(f"[Router] Ladder degraded: {err_msg}")
                await self._record_failure(session, provider.name, str(p_err))
                errors.append(err_msg)
            except Exception as exc:
                err_msg = f"{provider.name} unexpected error: {exc}"
                logger.error(f"[Router] Ladder step failed: {err_msg}")
                await self._record_failure(session, provider.name, str(exc))
                errors.append(err_msg)

        # Terminal state: ladder exhausted
        error_summary = (
            "; ".join(errors) if errors else "No healthy providers available"
        )
        logger.error(
            f"[Router] All {self.asset_type} providers exhausted: {error_summary}"
        )
        raise NoDataError(
            f"No {self.asset_type} data obtainable across ladder: {error_summary}"
        )
