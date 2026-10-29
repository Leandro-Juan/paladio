"""ODPT (Open Data Challenge for Public Transportation in Tokyo) Fare Adapter.

Queries official Tokyo RailwayFare datasets (odpt:RailwayFare) for station-to-station
ticket and IC-card fares in JPY.
Fails gracefully when no API key is configured or the host is blocked.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any

from app.adapters.fares.base_fare_adapter import BaseFareAdapter
from app.db.models import TransitFareQuoteModel
from app.domain.reference.iso_currencies import to_minor_units
from app.services.transit_fare_resilient_http import ResilientHttp

logger = logging.getLogger(__name__)

DEFAULT_ODPT_BASE_URL = "https://api.odpt.org/api/v4"


class ODPTFareAdapter(BaseFareAdapter):
    """Adapter for Tokyo ODPT RailwayFare open data API."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.api_key = (
            api_key or os.getenv("ODPT_API_KEY") or os.getenv("ODPT_CONSUMER_KEY") or ""
        )
        self.base_url = (
            base_url or os.getenv("ODPT_BASE_URL") or DEFAULT_ODPT_BASE_URL
        ).rstrip("/")

    async def fetch_station_pair_fares(
        self,
        city: str,
        from_station_id: str | None = None,
        to_station_id: str | None = None,
    ) -> list[TransitFareQuoteModel]:
        if city.lower() != "tokyo":
            return []

        if not self.api_key:
            logger.info(
                "ODPT API key not configured; skipping Tier 1 ODPT station-pair lookup."
            )
            return []

        endpoint = f"{self.base_url}/odpt:RailwayFare"
        params: dict[str, Any] = {"acl:consumerKey": self.api_key}
        if from_station_id:
            params["odpt:fromStation"] = from_station_id
        if to_station_id:
            params["odpt:toStation"] = to_station_id

        try:
            status, data, _ = await ResilientHttp.get(
                endpoint,
                params=params,
                timeout=8.0,
                max_retries=2,
                provider_id="odpt_tokyo",
            )
            if status != 200 or not isinstance(data, list):
                logger.warning(f"ODPT returned status {status} or non-list response.")
                return []

            return self._parse_odpt_records(data, city)
        except Exception as exc:
            logger.warning(f"ODPT query failed gracefully: {exc}")
            return []

    async def fetch_city_quotes(self, city: str) -> list[TransitFareQuoteModel]:
        """Fetches active sample or catalog quotes from ODPT."""
        return await self.fetch_station_pair_fares(city)

    def _parse_odpt_records(
        self, records: list[dict[str, Any]], city: str
    ) -> list[TransitFareQuoteModel]:
        quotes: list[TransitFareQuoteModel] = []
        now = datetime.now(timezone.utc)

        for rec in records:
            from_st = rec.get("odpt:fromStation") or rec.get("from_station")
            to_st = rec.get("odpt:toStation") or rec.get("to_station")
            operator_raw = rec.get("odpt:operator") or "TokyoOperator"
            operator = str(operator_raw).split(":")[-1]

            # 1. Adult Ticket Fare
            ticket_price = rec.get("odpt:ticketFare")
            if ticket_price is not None:
                try:
                    price_val = float(ticket_price)
                    h = hashlib.sha256(
                        f"odpt_ticket_{from_st}_{to_st}_{price_val}".encode()
                    ).hexdigest()
                    quotes.append(
                        TransitFareQuoteModel(
                            city=city.lower(),
                            operator=operator,
                            product_type="single",
                            rider="adult",
                            medium="ticket",
                            from_station_id=from_st,
                            to_station_id=to_st,
                            amount_minor=to_minor_units(price_val, "JPY"),
                            currency="JPY",
                            tier=1,
                            source_url=f"{self.base_url}/odpt:RailwayFare",
                            fetched_at=now,
                            evidence_hash=h,
                            evidence_quote=f"ODPT ticketFare: {price_val} JPY between {from_st} and {to_st}",
                            confidence=0.98,
                            status="active",
                        )
                    )
                except ValueError:
                    pass

            # 2. Adult IC Card Fare
            ic_price = rec.get("odpt:icCardFare")
            if ic_price is not None:
                try:
                    price_val = float(ic_price)
                    h = hashlib.sha256(
                        f"odpt_ic_{from_st}_{to_st}_{price_val}".encode()
                    ).hexdigest()
                    quotes.append(
                        TransitFareQuoteModel(
                            city=city.lower(),
                            operator=operator,
                            product_type="single",
                            rider="adult",
                            medium="ic",
                            from_station_id=from_st,
                            to_station_id=to_st,
                            amount_minor=to_minor_units(price_val, "JPY"),
                            currency="JPY",
                            tier=1,
                            source_url=f"{self.base_url}/odpt:RailwayFare",
                            fetched_at=now,
                            evidence_hash=h,
                            evidence_quote=f"ODPT icCardFare: {price_val} JPY between {from_st} and {to_st}",
                            confidence=0.98,
                            status="active",
                        )
                    )
                except ValueError:
                    pass

        return quotes
