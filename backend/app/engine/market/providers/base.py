"""
Base classes, protocols, and exceptions for market data providers.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from app.engine.market.ports import FlightQuote, LodgingQuote


class MarketProviderError(Exception):
    """Base error for all market provider operations."""

    pass


class ProviderBlockedError(MarketProviderError):
    """Provider rate limited, anti-bot blocked, or Cloudflare/Akamai challenged."""

    pass


class ParseDriftError(MarketProviderError):
    """Provider returned unexpected payload structure or schema drift."""

    pass


class CircuitBreakerOpenError(MarketProviderError):
    """Circuit breaker is currently open due to consecutive failures."""

    pass


class DailyBudgetExhaustedError(MarketProviderError):
    """Daily request budget exhausted for this tier."""

    pass


class NoDataError(MarketProviderError):
    """No quotes found from provider or entire provider ladder."""

    pass


@dataclass
class ProviderResult:
    quotes: list[FlightQuote] | list[LodgingQuote]
    source: str
    observed_at: datetime
    is_live: bool
    raw_hash: bytes
    metadata: dict[str, Any]


class BaseQuoteProvider(ABC):
    """
    Abstract base for all market providers.
    Enforces cloud sovereignty guard (cloud=False).
    """

    def __init__(self, name: str, asset_type: str, cloud: bool = False):
        if cloud:
            raise ValueError(
                f"Provider '{name}' is flagged as cloud=True. Cloud services are strictly forbidden by sovereignty rules."
            )
        self.name = name
        self.asset_type = asset_type
        self.cloud = cloud

    @abstractmethod
    async def is_healthy(self) -> bool:
        """Check if provider dependencies are available."""
        pass
