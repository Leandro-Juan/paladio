import logging
from typing import Any

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.db.session import get_db
from app.domain.reference.iso_currencies import (
    COUNTRY_TO_CURRENCY,
    get_country_currency,
)
from app.engine.currency import fetch_live_rates
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()

CITY_TO_COUNTRY_CODE: dict[str, str] = {
    "madrid": "ES",
    "barcelona": "ES",
    "seville": "ES",
    "sevilla": "ES",
    "valencia": "ES",
    "paris": "FR",
    "nice": "FR",
    "lyon": "FR",
    "rome": "IT",
    "milan": "IT",
    "florence": "IT",
    "venice": "IT",
    "berlin": "DE",
    "munich": "DE",
    "hamburg": "DE",
    "amsterdam": "NL",
    "rotterdam": "NL",
    "london": "GB",
    "edinburgh": "GB",
    "manchester": "GB",
    "dublin": "IE",
    "lisbon": "PT",
    "porto": "PT",
    "vienna": "AT",
    "brussels": "BE",
    "geneva": "CH",
    "zurich": "CH",
    "oslo": "NO",
    "stockholm": "SE",
    "copenhagen": "DK",
    "warsaw": "PL",
    "krakow": "PL",
    "prague": "CZ",
    "budapest": "HU",
    "athens": "GR",
    "tokyo": "JP",
    "kyoto": "JP",
    "osaka": "JP",
    "new york": "US",
    "san francisco": "US",
    "los angeles": "US",
    "chicago": "US",
    "toronto": "CA",
    "vancouver": "CA",
    "sydney": "AU",
    "melbourne": "AU",
    "singapore": "SG",
    "seoul": "KR",
    "bangkok": "TH",
    "dubai": "AE",
    "istanbul": "TR",
    "mexico city": "MX",
    "cancun": "MX",
    "buenos aires": "AR",
    "sao paulo": "BR",
    "rio de janeiro": "BR",
}


class LiveRatesResponse(BaseModel):
    base: str
    rates: dict[str, float]
    source: str = "ECB_Frankfurter"


class DestinationCurrencyResponse(BaseModel):
    destination: str
    country_code: str
    currency: str


@router.get("/rates", response_model=LiveRatesResponse)
async def get_live_rates(
    base: str = Query(default="EUR", max_length=5),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Dynamically fetches real live exchange rates from European Central Bank (via Frankfurter API)
    with air-gapped cache fallback.
    """
    base_clean = base.upper().strip()
    try:
        rates = await fetch_live_rates(base_clean)
        try:
            from app.engine.currency import sync_fx_rates_to_db

            await sync_fx_rates_to_db(base_clean, rates, session)
        except Exception:
            pass
        return LiveRatesResponse(base=base_clean, rates=rates)
    except Exception as e:
        logger.warning(f"Failed to fetch live rates for {base_clean}: {e}")
        return LiveRatesResponse(base=base_clean, rates={base_clean: 1.0})


@router.get("/destination-currency", response_model=DestinationCurrencyResponse)
async def get_destination_currency(
    destination: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Resolves destination city or region to its ISO country code and ISO-4217 currency."""
    dest_clean = destination.strip()
    dest_lower = dest_clean.lower()

    # 1. Check City Repository in DB
    try:
        repo = SqlCityRepository(session)
        city = await repo.find_by_name_or_alias(dest_clean)
        if city:
            curr = city.currency or get_country_currency(city.country_code)
            return DestinationCurrencyResponse(
                destination=dest_clean,
                country_code=city.country_code,
                currency=curr,
            )
    except Exception as e:
        logger.debug(f"Database city lookup error for '{dest_clean}': {e}")

    # 2. Check known city mapping
    if dest_lower in CITY_TO_COUNTRY_CODE:
        c_code = CITY_TO_COUNTRY_CODE[dest_lower]
        return DestinationCurrencyResponse(
            destination=dest_clean,
            country_code=c_code,
            currency=get_country_currency(c_code),
        )

    # 3. Check direct ISO alpha-2 country code
    upper_two = dest_clean.upper()
    if len(upper_two) == 2 and upper_two in COUNTRY_TO_CURRENCY:
        return DestinationCurrencyResponse(
            destination=dest_clean,
            country_code=upper_two,
            currency=get_country_currency(upper_two),
        )

    # Default fallback to EUR
    return DestinationCurrencyResponse(
        destination=dest_clean,
        country_code="ES",
        currency="EUR",
    )
