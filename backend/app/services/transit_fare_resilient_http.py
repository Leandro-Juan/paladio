"""Resilient HTTP client for transit fare discovery and operator APIs.

Features:
- Per-host exponential backoff with random jitter.
- Retry-After header parsing and respect.
- Per-host in-memory & DB circuit breaker tracking.
- Conditional GET (ETag / If-None-Match / If-Modified-Since).
- Sovereign User-Agent with contact header.
- Schema drift detection and minimum record count guards.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
from app.db.models import TransitProviderHealthModel
from app.db.session import async_session
from app.engine.market.providers.base import CircuitBreakerOpenError, ParseDriftError
from sqlalchemy import select

logger = logging.getLogger(__name__)

USER_AGENT = "PaladioTransit/1.0 (+https://paladio.local; contact@paladio.local)"


@dataclass
class HostCircuitState:
    consecutive_failures: int = 0
    failure_threshold: int = 4
    cooldown_seconds: float = 60.0
    last_failure_time: float = 0.0
    is_open: bool = False

    def can_request(self) -> bool:
        if not self.is_open:
            return True
        if time.time() - self.last_failure_time > self.cooldown_seconds:
            # Half-open: allow a single probe
            return True
        return False

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.is_open = False

    def record_failure(self) -> None:
        self.consecutive_failures += 1
        self.last_failure_time = time.time()
        if self.consecutive_failures >= self.failure_threshold:
            self.is_open = True


class ResilientHttp:
    _circuits: dict[str, HostCircuitState] = {}
    _etags: dict[str, str] = {}
    _last_modified: dict[str, str] = {}

    @classmethod
    def get_circuit(cls, host: str) -> HostCircuitState:
        if host not in cls._circuits:
            cls._circuits[host] = HostCircuitState()
        return cls._circuits[host]

    @classmethod
    async def get(
        cls,
        url: str,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: float = 12.0,
        max_retries: int = 3,
        provider_id: str | None = None,
        expected_keys: list[str] | None = None,
        min_records: int = 0,
    ) -> tuple[int, Any, dict[str, str]]:
        """Executes a resilient GET request with circuit breaker, retries, and schema drift validation.

        Returns: (status_code, parsed_body_or_text, response_headers)
        """
        parsed = urlparse(url)
        host = parsed.netloc or "default"
        circuit = cls.get_circuit(host)

        if not circuit.can_request():
            logger.warning(f"Circuit breaker OPEN for host {host}. Failing fast.")
            raise CircuitBreakerOpenError(f"Circuit open for host {host}")

        req_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/html, */*",
        }
        if headers:
            req_headers.update(headers)

        # Conditional GET
        if url in cls._etags:
            req_headers["If-None-Match"] = cls._etags[url]
        if url in cls._last_modified:
            req_headers["If-Modified-Since"] = cls._last_modified[url]

        attempt = 0
        last_exc: Exception | None = None
        start_time = time.perf_counter()

        while attempt < max_retries:
            attempt += 1
            try:
                async with httpx.AsyncClient(
                    timeout=timeout, follow_redirects=True
                ) as client:
                    resp = await client.get(url, headers=req_headers, params=params)

                elapsed_ms = (time.perf_counter() - start_time) * 1000.0

                # 304 Not Modified
                if resp.status_code == 304:
                    circuit.record_success()
                    await cls._record_health(
                        provider_id or host, success=True, latency_ms=elapsed_ms
                    )
                    return 304, None, dict(resp.headers)

                # 429 Too Many Requests / 503 Service Unavailable -> respect Retry-After
                if resp.status_code in (429, 503):
                    circuit.record_failure()
                    retry_after = resp.headers.get("Retry-After")
                    sleep_sec = (
                        float(retry_after)
                        if retry_after and retry_after.isdigit()
                        else (2**attempt + random.uniform(0.1, 0.5))
                    )
                    logger.warning(
                        f"Rate limited by {host} (HTTP {resp.status_code}). Backing off {sleep_sec:.2f}s..."
                    )
                    await asyncio.sleep(min(sleep_sec, 10.0))
                    continue

                if resp.status_code >= 500:
                    circuit.record_failure()
                    sleep_sec = 2**attempt + random.uniform(0.1, 0.5)
                    await asyncio.sleep(sleep_sec)
                    continue

                if resp.status_code >= 400:
                    circuit.record_failure()
                    await cls._record_health(
                        provider_id or host,
                        success=False,
                        error=f"HTTP {resp.status_code}",
                        latency_ms=elapsed_ms,
                    )
                    return resp.status_code, resp.text, dict(resp.headers)

                # Store conditional headers
                if "etag" in resp.headers:
                    cls._etags[url] = resp.headers["etag"]
                if "last-modified" in resp.headers:
                    cls._last_modified[url] = resp.headers["last-modified"]

                circuit.record_success()
                await cls._record_health(
                    provider_id or host, success=True, latency_ms=elapsed_ms
                )

                # Parse JSON or return text
                content_type = resp.headers.get("content-type", "")
                parsed_data: Any = None
                if "application/json" in content_type:
                    parsed_data = resp.json()
                    # Schema drift check
                    if expected_keys:
                        if isinstance(parsed_data, dict):
                            missing = [k for k in expected_keys if k not in parsed_data]
                            if missing:
                                raise ParseDriftError(
                                    f"Missing expected keys in payload from {host}: {missing}"
                                )
                        elif isinstance(parsed_data, list):
                            if min_records > 0 and len(parsed_data) < min_records:
                                raise ParseDriftError(
                                    f"Payload from {host} has {len(parsed_data)} items, below minimum {min_records}"
                                )
                            if parsed_data and isinstance(parsed_data[0], dict):
                                missing = [
                                    k for k in expected_keys if k not in parsed_data[0]
                                ]
                                if missing:
                                    raise ParseDriftError(
                                        f"First record missing expected keys from {host}: {missing}"
                                    )
                else:
                    parsed_data = resp.text

                return resp.status_code, parsed_data, dict(resp.headers)

            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exc = exc
                circuit.record_failure()
                sleep_sec = 2**attempt + random.uniform(0.1, 0.5)
                logger.warning(
                    f"ResilientHttp request failed for {url} (attempt {attempt}/{max_retries}): {exc}. Retrying in {sleep_sec:.2f}s..."
                )
                await asyncio.sleep(sleep_sec)

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        await cls._record_health(
            provider_id or host,
            success=False,
            error=str(last_exc),
            latency_ms=elapsed_ms,
        )
        raise last_exc or RuntimeError(
            f"Failed to fetch {url} after {max_retries} retries"
        )

    @classmethod
    async def _record_health(
        cls,
        provider_id: str,
        success: bool,
        error: str | None = None,
        latency_ms: float = 0.0,
    ) -> None:
        try:
            async with async_session() as db:
                stmt = select(TransitProviderHealthModel).where(
                    TransitProviderHealthModel.provider_id == provider_id
                )
                res = await db.execute(stmt)
                health = res.scalars().first()
                now = datetime.now(timezone.utc)
                if not health:
                    health = TransitProviderHealthModel(
                        provider_id=provider_id,
                        provider_name=provider_id,
                        success_count=1 if success else 0,
                        failure_count=0 if success else 1,
                        consecutive_failures=0 if success else 1,
                        circuit_open=False,
                        last_error=error,
                        last_latency_ms=latency_ms,
                        last_checked_at=now,
                    )
                    db.add(health)
                else:
                    if success:
                        health.success_count += 1
                        health.consecutive_failures = 0
                        health.circuit_open = False
                    else:
                        health.failure_count += 1
                        health.consecutive_failures += 1
                        health.last_error = error
                        if health.consecutive_failures >= 4:
                            health.circuit_open = True
                            health.circuit_opened_at = now
                    health.last_latency_ms = latency_ms
                    health.last_checked_at = now
                await db.commit()
        except Exception as e:
            logger.debug(f"Could not persist provider health for {provider_id}: {e}")
