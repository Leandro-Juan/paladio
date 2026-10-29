import logging
from typing import Any

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.db.session import get_db
from app.domain.reference.iso_currencies import (
    COUNTRY_TO_CURRENCY,
    get_country_currency,
)
from app.engine.currency import fetch_live_rates
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


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

    # 2. Check direct ISO alpha-2 country code
    upper_two = dest_clean.upper()
    if len(upper_two) == 2 and upper_two in COUNTRY_TO_CURRENCY:
        return DestinationCurrencyResponse(
            destination=dest_clean,
            country_code=upper_two,
            currency=get_country_currency(upper_two),
        )

    # 3. Dynamically resolve city identity via GeoNames
    from app.domain.city_key import resolve_city_identity

    resolved_name, cc, _ = resolve_city_identity(dest_clean)
    if cc and cc != "XX":
        curr = get_country_currency(cc)
        return DestinationCurrencyResponse(
            destination=dest_clean,
            country_code=cc,
            currency=curr,
        )

    raise HTTPException(
        status_code=404,
        detail=f"Destination '{dest_clean}' could not be resolved to a known country or currency.",
    )
