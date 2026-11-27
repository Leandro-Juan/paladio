"""
Paladio Deal Engine Configuration.
All behavioral numbers live here as a frozen dataclass MarketConfig,
overridable by environment variables named MARKET_<FIELD>.
"""

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class MarketConfig:
    # Travelpayouts / Aviasales data API configuration (Phase 0 / Phase 2)
    # Token is never printed in repr or logged
    TRAVELPAYOUTS_TOKEN: str = field(
        default_factory=lambda: os.getenv("TRAVELPAYOUTS_TOKEN")
        or os.getenv("AVIASALES_TOKEN", ""),
        repr=False,
    )
    AVIASALES_MARKET: str = os.getenv("AVIASALES_MARKET", "es")
    AVIASALES_CURRENCY: str = os.getenv("AVIASALES_CURRENCY", "EUR")
    AVIASALES_MAX_RPM: int = int(os.getenv("AVIASALES_MAX_RPM", "60"))
    MARKET_DAILY_TOP_N: int = int(os.getenv("MARKET_DAILY_TOP_N", "3"))
    MARKET_MAX_OBSERVATION_AGE_DAYS: int = int(
        os.getenv("MARKET_MAX_OBSERVATION_AGE_DAYS", "7")
    )
    FX_MAX_AGE_DAYS: int = int(os.getenv("MARKET_FX_MAX_AGE_DAYS", "7"))

    # Baselines and detector (Phase 3)
    LEAD_BUCKETS: tuple[tuple[int, int | None], ...] = (
        (0, 7),
        (8, 21),
        (22, 60),
        (61, 120),
        (121, 240),
        (241, None),
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
    SCAN_HORIZON_DAYS: int = int(
        os.getenv("MARKET_SCAN_HORIZON_DAYS", "330")
    )  # 11-month horizon
    SCAN_INTERVAL_MIN: int = int(os.getenv("MARKET_SCAN_INTERVAL_MIN", "15"))
    SWEEP_DAILY_BUDGET_SECONDS: float = float(
        os.getenv("MARKET_SWEEP_DAILY_BUDGET_SECONDS", str(22 * 3600))
    )
    SWEEP_NEXT_RUN_BUFFER_SECONDS: float = float(
        os.getenv("MARKET_SWEEP_NEXT_RUN_BUFFER_SECONDS", str(2 * 3600))
    )
    SWEEP_JITTER_RATIO: float = float(os.getenv("MARKET_SWEEP_JITTER_RATIO", "0.35"))

    # Pipeline & Provider Kill Switches (Phase 6)
    ENABLE_SWEEP: bool = os.getenv("MARKET_ENABLE_SWEEP", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    ENABLE_BASELINES: bool = os.getenv("MARKET_ENABLE_BASELINES", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    ENABLE_DETECTION: bool = os.getenv("MARKET_ENABLE_DETECTION", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    ENABLE_VERIFICATION: bool = os.getenv(
        "MARKET_ENABLE_VERIFICATION", "true"
    ).lower() in ("true", "1", "yes")
    ENABLE_AVIASALES: bool = os.getenv("MARKET_ENABLE_AVIASALES", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    ENABLE_RYANAIR: bool = os.getenv("MARKET_ENABLE_RYANAIR", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    ENABLE_GOOGLE_FLIGHTS: bool = os.getenv(
        "MARKET_ENABLE_GOOGLE_FLIGHTS", "true"
    ).lower() in ("true", "1", "yes")
    ENABLE_LODGING: bool = os.getenv("MARKET_ENABLE_LODGING", "true").lower() in (
        "true",
        "1",
        "yes",
    )

    # Google Flights live provider (fast-flights + primp)
    GOOGLE_FLIGHTS_MAX_RPM: int = int(os.getenv("MARKET_GOOGLE_FLIGHTS_MAX_RPM", "12"))
    GOOGLE_FLIGHTS_DAILY_BUDGET: int = int(
        os.getenv("MARKET_GOOGLE_FLIGHTS_DAILY_BUDGET", "200")
    )
    GOOGLE_FLIGHTS_MAX_RANGE_DAYS: int = int(
        os.getenv("MARKET_GOOGLE_FLIGHTS_MAX_RANGE_DAYS", "14")
    )
    GOOGLE_FLIGHTS_MONTH_SAMPLE_DAYS: int = int(
        os.getenv("MARKET_GOOGLE_FLIGHTS_MONTH_SAMPLE_DAYS", "4")
    )
    GOOGLE_FLIGHTS_CACHE_TTL_SEC: int = int(
        os.getenv("MARKET_GOOGLE_FLIGHTS_CACHE_TTL_SEC", "7200")
    )
    GOOGLE_FLIGHTS_SWEEP_CACHE_TTL_SEC: int = int(
        os.getenv("MARKET_GOOGLE_FLIGHTS_SWEEP_CACHE_TTL_SEC", "43200")
    )
    GOOGLE_FLIGHTS_SOCS_COOKIE: str = os.getenv(
        "MARKET_GOOGLE_FLIGHTS_SOCS_COOKIE",
        "CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg",
    )

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

    # Budgets and provider hygiene (Phase 5A / Phase 6)
    LIVE_DAILY_BUDGET_TIER2: int = int(
        os.getenv("MARKET_LIVE_DAILY_BUDGET_TIER2", "200")
    )
    LIVE_DAILY_BUDGET_TIER3: int = int(
        os.getenv("MARKET_LIVE_DAILY_BUDGET_TIER3", "50")
    )
    BUDGET_WARN_FRACTION: float = float(os.getenv("MARKET_BUDGET_WARN_FRACTION", "0.8"))
    BREAKER_FAILURES: int = int(os.getenv("MARKET_BREAKER_FAILURES", "5"))
    BREAKER_COOLDOWN_HOURS: int = int(os.getenv("MARKET_BREAKER_COOLDOWN_HOURS", "24"))
    BREAKER_COOLDOWN_SEC: int = int(
        os.getenv("MARKET_BREAKER_COOLDOWN_SEC", str(24 * 3600))
    )
    BACKOFF_BASE: int = int(os.getenv("MARKET_BACKOFF_BASE", "2"))
    MAX_RETRIES: int = int(os.getenv("MARKET_MAX_RETRIES", "4"))
    MAX_ALERTS_PER_USER_PER_DAY: int = int(
        os.getenv("MARKET_MAX_ALERTS_PER_USER_PER_DAY", "3")
    )

    # Lodging taste-aware ranking configuration
    LODGING_MIN_REVIEWS: int = int(os.getenv("MARKET_LODGING_MIN_REVIEWS", "15"))
    LODGING_PRIOR_REVIEWS_M: float = float(
        os.getenv("MARKET_LODGING_PRIOR_REVIEWS_M", "50.0")
    )
    LODGING_PRIOR_RATING_C: float = float(
        os.getenv("MARKET_LODGING_PRIOR_RATING_C", "7.5")
    )
    LODGING_MAX_CENTER_KM: float = float(
        os.getenv("MARKET_LODGING_MAX_CENTER_KM", "12.0")
    )
    LODGING_WEIGHT_PRICE: float = float(
        os.getenv("MARKET_LODGING_WEIGHT_PRICE", "0.30")
    )
    LODGING_WEIGHT_QUALITY: float = float(
        os.getenv("MARKET_LODGING_WEIGHT_QUALITY", "0.25")
    )
    LODGING_WEIGHT_LOCATION: float = float(
        os.getenv("MARKET_LODGING_WEIGHT_LOCATION", "0.20")
    )
    LODGING_WEIGHT_TASTE: float = float(
        os.getenv("MARKET_LODGING_WEIGHT_TASTE", "0.15")
    )
    LODGING_WEIGHT_FLEXIBILITY: float = float(
        os.getenv("MARKET_LODGING_WEIGHT_FLEXIBILITY", "0.05")
    )
    LODGING_WEIGHT_TRUST: float = float(
        os.getenv("MARKET_LODGING_WEIGHT_TRUST", "0.05")
    )


config = MarketConfig()
CORPUS_HORIZON_MONTHS = config.CORPUS_HORIZON_MONTHS

_runtime_aviasales_token: str | None = None


def get_travelpayouts_token() -> str:
    """Returns runtime configured Aviasales/Travelpayouts token if set, otherwise falls back to config."""
    global _runtime_aviasales_token
    if _runtime_aviasales_token is not None:
        return _runtime_aviasales_token
    return config.TRAVELPAYOUTS_TOKEN


def set_runtime_aviasales_token(token: str | None) -> None:
    """Sets or clears the runtime Aviasales/Travelpayouts token dynamically."""
    global _runtime_aviasales_token
    _runtime_aviasales_token = token
