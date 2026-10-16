"""Live dynamic currency exchange service for Paladio Itinerary engine.

Fetches and caches live exchange rates dynamically from the European Central Bank
via the open-source Frankfurter API. Zero hardcoded rates.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# In-memory cache for live rates: base -> (timestamp, rates_dict)
_RATES_CACHE: dict[str, tuple[float, dict[str, float]]] = {}
_CACHE_TTL_SECONDS = 3600.0  # 1 hour cache

SNAPSHOT_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "domain"
    / "reference"
    / "fx_rates_snapshot.json"
)


def _load_snapshot_rates(base: str) -> dict[str, float] | None:
    """Loads rates from local air-gapped snapshot file when network is offline."""
    if not SNAPSHOT_PATH.exists():
        return None
    try:
        data = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
        snapshot_base = data.get("base", "USD").upper()
        rates = data.get("rates", {})
        if snapshot_base == base:
            return dict(rates)
        if base in rates and rates[base] > 0:
            scale = 1.0 / rates[base]
            res = {k: v * scale for k, v in rates.items()}
            res[base] = 1.0
            return res
    except (
        json.JSONDecodeError,
        OSError,
        KeyError,
        TypeError,
        ZeroDivisionError,
    ) as err:
        logger.warning(f"Failed reading FX snapshot from {SNAPSHOT_PATH}: {err}")
    return None


class CurrencyRateError(RuntimeError):
    """Raised when currency exchange rates cannot be dynamically resolved."""


async def fetch_live_rates(base_currency: str = "USD") -> dict[str, float]:
    """Dynamically fetches real live exchange rates from the live API or local snapshot."""
    base = base_currency.upper().strip()
    now = time.time()

    if base in _RATES_CACHE:
        cached_time, rates = _RATES_CACHE[base]
        if now - cached_time < _CACHE_TTL_SECONDS:
            return rates

    url = f"https://api.frankfurter.app/latest?from={base}"
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "PaladioApp/1.0"})
            if resp.status_code == 200:
                data: dict[str, Any] = resp.json()
                rates = data.get("rates", {})
                rates[base] = 1.0
                _RATES_CACHE[base] = (now, rates)
                logger.info(
                    f"Dynamically fetched {len(rates)} live currency rates for base {base}"
                )
                return rates
            raise CurrencyRateError(
                f"Currency API returned HTTP {resp.status_code} for base {base}"
            )
    except Exception as e:
        if base in _RATES_CACHE:
            logger.warning(f"Live currency fetch failed ({e}); using expired cache.")
            return _RATES_CACHE[base][1]
        snapshot = _load_snapshot_rates(base)
        if snapshot is not None:
            logger.info(
                f"Live currency fetch failed ({e}); loaded local air-gapped FX snapshot."
            )
            _RATES_CACHE[base] = (now, snapshot)
            return snapshot
        raise CurrencyRateError(
            f"Could not dynamically acquire live currency rates for {base}: {e}"
        ) from e


def fetch_live_rates_sync(base_currency: str = "USD") -> dict[str, float]:
    """Synchronously fetches real live exchange rates from the live Frankfurter API or local snapshot."""
    base = base_currency.upper().strip()
    now = time.time()

    if base in _RATES_CACHE:
        cached_time, rates = _RATES_CACHE[base]
        if now - cached_time < _CACHE_TTL_SECONDS:
            return rates

    url = f"https://api.frankfurter.app/latest?from={base}"
    try:
        with httpx.Client(timeout=6.0, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": "PaladioApp/1.0"})
            if resp.status_code == 200:
                data: dict[str, Any] = resp.json()
                rates = data.get("rates", {})
                rates[base] = 1.0
                _RATES_CACHE[base] = (now, rates)
                logger.info(
                    f"Dynamically fetched {len(rates)} live currency rates (sync) for base {base}"
                )
                return rates
            raise CurrencyRateError(
                f"Currency API returned HTTP {resp.status_code} for base {base}"
            )
    except Exception as e:
        if base in _RATES_CACHE:
            logger.warning(
                f"Live currency sync fetch failed ({e}); using expired cache."
            )
            return _RATES_CACHE[base][1]
        snapshot = _load_snapshot_rates(base)
        if snapshot is not None:
            logger.info(
                f"Live currency sync fetch failed ({e}); loaded local air-gapped FX snapshot."
            )
            _RATES_CACHE[base] = (now, snapshot)
            return snapshot
        raise CurrencyRateError(
            f"Could not dynamically acquire live currency rates for {base}: {e}"
        ) from e


def set_cached_rates(base: str, rates: dict[str, float]) -> None:
    """Explicitly seeds cache for testing or prefetching."""
    base_c = base.upper().strip()
    rates_copy = dict(rates)
    rates_copy[base_c] = 1.0
    _RATES_CACHE[base_c] = (time.time(), rates_copy)


def get_cached_rate(
    from_currency: str, to_currency: str, auto_fetch: bool = True
) -> float | None:
    """Returns the exchange rate if available; optionally fetches live synchronously."""
    from_c = from_currency.upper().strip()
    to_c = to_currency.upper().strip()
    if from_c == to_c:
        return 1.0

    if from_c in _RATES_CACHE:
        rate = _RATES_CACHE[from_c][1].get(to_c)
        if rate is not None:
            return rate

    if "USD" in _RATES_CACHE:
        usd_rates = _RATES_CACHE["USD"][1]
        from_rate = usd_rates.get(from_c)
        to_rate = usd_rates.get(to_c)
        if from_rate and to_rate and from_rate > 0:
            return to_rate / from_rate

    if auto_fetch:
        try:
            fetch_live_rates_sync(from_c)
            if from_c in _RATES_CACHE:
                return _RATES_CACHE[from_c][1].get(to_c)
        except Exception:
            try:
                fetch_live_rates_sync("USD")
                usd_rates = _RATES_CACHE["USD"][1]
                from_rate = usd_rates.get(from_c)
                to_rate = usd_rates.get(to_c)
                if from_rate and to_rate and from_rate > 0:
                    return to_rate / from_rate
            except Exception:
                pass

    return None


def convert_currency(
    amount: float,
    from_currency: str = "USD",
    to_currency: str = "EUR",
    custom_rate: float | None = None,
    exchange_rate: float | None = None,
) -> float:
    """Converts monetary amounts between currencies.

    Uses custom_rate/exchange_rate if provided; otherwise uses dynamic live rate from cache or live API.
    Raises CurrencyRateError if no live rate is available and no custom rate provided.
    """
    from_c = from_currency.upper().strip()
    to_c = to_currency.upper().strip()

    effective_rate = custom_rate if custom_rate is not None else exchange_rate

    if from_c == to_c:
        return round(amount, 2)

    if effective_rate is not None and effective_rate > 0:
        return round(amount * effective_rate, 2)

    cached = get_cached_rate(from_c, to_c, auto_fetch=True)
    if cached is not None:
        return round(amount * cached, 2)

    raise CurrencyRateError(
        f"No live exchange rate available for {from_c} -> {to_c}. Rates must be fetched from API."
    )


def usd_to_eur(usd: float, rate: float | None = None) -> float:
    return convert_currency(
        usd, from_currency="USD", to_currency="EUR", custom_rate=rate
    )


def eur_to_usd(eur: float, rate: float | None = None) -> float:
    return convert_currency(
        eur, from_currency="EUR", to_currency="USD", custom_rate=rate
    )
