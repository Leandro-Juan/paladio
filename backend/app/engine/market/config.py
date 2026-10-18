"""
Paladio Deal Engine Configuration.
All behavioral numbers live here as a frozen dataclass MarketConfig,
overridable by environment variables named MARKET_<FIELD>.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketConfig:
    # Baselines and detector (Phase 3)
    LEAD_BUCKETS: tuple[tuple[int, int | None], ...] = (
        (0, 7),
        (8, 21),
        (22, 60),
        (61, None),
    )
    BASELINE_QUANTILES: tuple[float, ...] = (0.02, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90)
    CORPUS_HORIZON_MONTHS: int = int(os.getenv("MARKET_CORPUS_HORIZON_MONTHS", "11"))
    BASELINE_WINDOW_DAYS: int = 540
    MIN_BASELINE_ROWS: int = int(os.getenv("MARKET_MIN_BASELINE_ROWS", "200"))
    MIN_BASELINE_OBS_DAYS: int = int(os.getenv("MARKET_MIN_BASELINE_OBS_DAYS", "21"))
    MIN_BASELINE_DEPART_DATES: int = int(
        os.getenv("MARKET_MIN_BASELINE_DEPART_DATES", "10")
    )
    FALLBACK_ORDER: tuple[str, ...] = ("full", "drop_lead", "drop_month")
    R_MAX: float = float(os.getenv("MARKET_R_MAX", "0.75"))
    P_ANCHOR: float = float(os.getenv("MARKET_P_ANCHOR", "0.25"))
    MIN_ABS_SAVINGS_CENTS: int = int(
        os.getenv("MARKET_MIN_ABS_SAVINGS_CENTS", "3000")
    )  # 30.00 EUR
    K_PER_SCAN: int = int(os.getenv("MARKET_K_PER_SCAN", "20"))
    MAX_PER_ROUTE_PER_SCAN: int = int(os.getenv("MARKET_MAX_PER_ROUTE_PER_SCAN", "2"))
    SCAN_HORIZON_DAYS: int = int(os.getenv("MARKET_SCAN_HORIZON_DAYS", "90"))
    SCAN_INTERVAL_MIN: int = int(os.getenv("MARKET_SCAN_INTERVAL_MIN", "15"))

    # Cheap feasibility (Phase 5B)
    DEAD_WINDOW_LOCAL: tuple[tuple[int, int], tuple[int, int]] = ((0, 0), (5, 0))
    ARRIVAL_BUFFER_MIN: int = int(os.getenv("MARKET_ARRIVAL_BUFFER_MIN", "120"))
    DEPARTURE_BUFFER_MIN: int = int(os.getenv("MARKET_DEPARTURE_BUFFER_MIN", "180"))
    MIN_ON_GROUND_HOURS: int = int(os.getenv("MARKET_MIN_ON_GROUND_HOURS", "36"))

    # Verification and gates (Phase 5)
    VERIFY_TOLERANCE: float = float(os.getenv("MARKET_VERIFY_TOLERANCE", "0.05"))
    LODGING_MIN_QUALITY: float = float(os.getenv("MARKET_LODGING_MIN_QUALITY", "70.0"))
    REALISM_MIN: float = float(os.getenv("MARKET_REALISM_MIN", "8.0"))
    GATE_CACHE_TTL_HOURS: int = int(os.getenv("MARKET_GATE_CACHE_TTL_HOURS", "24"))

    # Budgets and provider hygiene (Phase 5A)
    LIVE_DAILY_BUDGET_TIER2: int = int(
        os.getenv("MARKET_LIVE_DAILY_BUDGET_TIER2", "200")
    )
    LIVE_DAILY_BUDGET_TIER3: int = int(
        os.getenv("MARKET_LIVE_DAILY_BUDGET_TIER3", "50")
    )
    BUDGET_WARN_FRACTION: float = float(os.getenv("MARKET_BUDGET_WARN_FRACTION", "0.8"))
    BREAKER_FAILURES: int = int(os.getenv("MARKET_BREAKER_FAILURES", "5"))
    BREAKER_COOLDOWN_SEC: int = int(os.getenv("MARKET_BREAKER_COOLDOWN_SEC", "900"))
    BACKOFF_BASE: int = int(os.getenv("MARKET_BACKOFF_BASE", "2"))
    MAX_RETRIES: int = int(os.getenv("MARKET_MAX_RETRIES", "4"))
    MAX_ALERTS_PER_USER_PER_DAY: int = int(
        os.getenv("MARKET_MAX_ALERTS_PER_USER_PER_DAY", "3")
    )


config = MarketConfig()
CORPUS_HORIZON_MONTHS = config.CORPUS_HORIZON_MONTHS
