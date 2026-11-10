"""
Calendar and Holiday API Router.
100% Dynamic, Self-Hosted & Air-Gappable:
Provides statutory and public holidays dynamically for any country, subdivision, or city.
"""

from __future__ import annotations

import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import get_optional_user
from app.db.models import UserModel
from app.services.holiday_service import HolidayItem, HolidayService

router = APIRouter()


class CalendarHolidaysResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str = Field(description="Resolved 2-letter ISO country code")
    country_name: str | None = Field(default=None, description="Country display name")
    year: int = Field(description="Calendar year")
    subdivision: str | None = Field(
        default=None, description="Subdivision or state code if applicable"
    )
    holidays: list[HolidayItem] = Field(
        default_factory=list, description="Chronological public holidays"
    )
    total: int = Field(description="Total count of public holidays")


@router.get(
    "/holidays",
    response_model=CalendarHolidaysResponse,
    summary="Get public holidays for country, city, or user home jurisdiction",
)
async def get_calendar_holidays(
    country: str | None = Query(
        None, description="2-letter ISO country code (e.g. ES, US, FR)"
    ),
    city: str | None = Query(
        None,
        description="City name (e.g. Madrid, Paris, Tokyo) to resolve country from",
    ),
    year: int | None = Query(
        None, description="Calendar year (defaults to current year)"
    ),
    subdivision: str | None = Query(
        None, description="Subdivision or state code if applicable"
    ),
    current_user: UserModel | None = Depends(get_optional_user),
) -> CalendarHolidaysResponse:
    """
    Returns statutory public holidays for a given country or city and year.
    If country is not passed:
      1. Resolves dynamically from city if provided.
      2. Or resolves from the authenticated user's home_country preference.
    """
    active_year = year if isinstance(year, int) else datetime.date.today().year
    target_country = (
        country.strip().upper()
        if isinstance(country, str) and country.strip()
        else None
    )
    target_city = city.strip() if isinstance(city, str) and city.strip() else None
    target_subdiv = (
        subdivision.strip().upper()
        if isinstance(subdivision, str) and subdivision.strip()
        else None
    )

    # Check user preferences if country is not explicitly provided
    if (
        not target_country
        and not target_city
        and isinstance(current_user, UserModel)
        and current_user.preferences
    ):
        target_country = current_user.preferences.get("home_country")
        if not target_subdiv:
            target_subdiv = current_user.preferences.get("home_subdivision")
        if not target_country and current_user.preferences.get("home_city"):
            target_city = current_user.preferences.get("home_city")

    holidays_list = HolidayService.get_holidays(
        country_code=target_country,
        year=active_year,
        city=target_city,
        subdivision=target_subdiv,
    )

    resolved_country = target_country
    country_name = None
    if holidays_list:
        resolved_country = holidays_list[0].country_code
        country_name = holidays_list[0].country_name
    elif target_country:
        resolved_country = target_country

    return CalendarHolidaysResponse(
        country=resolved_country or "UNKNOWN",
        country_name=country_name,
        year=active_year,
        subdivision=target_subdiv,
        holidays=holidays_list,
        total=len(holidays_list),
    )


@router.get("/countries", summary="List supported countries for public holiday sync")
async def get_supported_countries() -> list[dict[str, str]]:
    """Returns list of supported ISO country codes and display names for holiday calculation."""
    return HolidayService.get_supported_countries()
