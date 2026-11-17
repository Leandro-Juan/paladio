"""
Dynamic Holiday Service.
100% Dynamic, Self-Hosted & Deterministic.
Calculates official public and bank holidays dynamically for any country, subdivision, or city.
Uses python-holidays combined with AirportService geocoding.
"""

from __future__ import annotations

import datetime
import logging
from pydantic import BaseModel, ConfigDict, Field

import holidays

from app.services.airport_service import get_airport_service

logger = logging.getLogger(__name__)


class HolidayItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str = Field(description="ISO 8601 date string (YYYY-MM-DD)")
    name: str = Field(description="Official/localized public holiday name")
    country_code: str = Field(description="2-letter ISO country code (e.g. ES, US, FR)")
    country_name: str | None = Field(default=None, description="Country display name")
    subdivision: str | None = Field(
        default=None, description="Subdivision or state code if applicable"
    )
    is_public_holiday: bool = Field(
        default=True, description="True for statutory/official public holidays"
    )


class HolidayService:
    """Service to compute and query public holidays for countries and cities worldwide."""

    @classmethod
    def resolve_country_from_city(cls, city: str) -> tuple[str | None, str | None]:
        """
        Dynamically resolves the 2-letter ISO country code and country display name
        from a city or place name using Paladio's AirportService.
        """
        if not city or not city.strip():
            return None, None

        clean_city = city.strip()
        airport_svc = get_airport_service()

        # Check resolve_airport_for_city first (scores national capitals & major metropolises with highest priority)
        ap = airport_svc.resolve_airport_for_city(clean_city)
        if ap and ap.country:
            country_iso = ap.country.upper()
            country_names = getattr(airport_svc, "_country_iso_to_name", {})
            return country_iso, country_names.get(country_iso, country_iso)

        # Fallback to search_locations if resolve_airport_for_city did not match
        locations = airport_svc.search_locations(clean_city, limit=5)
        if locations:
            loc = locations[0]
            country_code = loc.get("country")
            country_name = loc.get("country_name")
            if country_code:
                return str(country_code).upper(), str(
                    country_name
                ) if country_name else None

        return None, None

    @classmethod
    def get_holidays(
        cls,
        country_code: str | None = None,
        year: int | None = None,
        city: str | None = None,
        subdivision: str | None = None,
    ) -> list[HolidayItem]:
        """
        Computes public holidays for a given country, year, and optional subdivision.
        If country_code is not provided but city is, resolves country dynamically.
        """
        current_year = year or datetime.date.today().year
        resolved_country = (
            country_code.strip().upper()
            if country_code and country_code.strip()
            else None
        )
        country_name: str | None = None

        if not resolved_country and city:
            resolved_country, country_name = cls.resolve_country_from_city(city)

        if not resolved_country:
            return []

        if not country_name:
            airport_svc = get_airport_service()
            country_names = getattr(airport_svc, "_country_iso_to_name", {})
            country_name = country_names.get(resolved_country, resolved_country)

        # Attempt to load holidays with subdivision if specified
        holiday_map = None
        used_subdiv = (
            subdivision.strip().upper() if subdivision and subdivision.strip() else None
        )

        if used_subdiv:
            try:
                holiday_map = holidays.country_holidays(
                    resolved_country,
                    subdiv=used_subdiv,
                    years=current_year,
                )
            except (NotImplementedError, KeyError, ValueError, Exception) as e:
                logger.debug(
                    "Could not load subdivision %s for %s: %s; falling back to national",
                    used_subdiv,
                    resolved_country,
                    e,
                )
                holiday_map = None

        if holiday_map is None:
            try:
                holiday_map = holidays.country_holidays(
                    resolved_country, years=current_year
                )
            except (NotImplementedError, KeyError, ValueError, Exception) as e:
                logger.warning(
                    "Unsupported or invalid country code for holidays: %s (%s)",
                    resolved_country,
                    e,
                )
                return []

        results: list[HolidayItem] = []
        for hol_date, hol_name in holiday_map.items():
            date_str = (
                hol_date.isoformat()
                if hasattr(hol_date, "isoformat")
                else str(hol_date)
            )
            results.append(
                HolidayItem(
                    date=date_str,
                    name=str(hol_name),
                    country_code=resolved_country,
                    country_name=country_name,
                    subdivision=used_subdiv,
                    is_public_holiday=True,
                )
            )

        # Sort chronologically
        results.sort(key=lambda h: h.date)
        return results

    @classmethod
    def get_supported_countries(cls) -> list[dict[str, str]]:
        """
        Returns list of all ISO 3166-1 alpha-2 country codes supported by python-holidays,
        enriched with country display names and sorted alphabetically.
        """
        airport_svc = get_airport_service()
        airport_svc._ensure_countries_loaded()
        country_names = getattr(airport_svc, "_country_iso_to_name", {})

        supported = holidays.list_supported_countries()
        results: list[dict[str, str]] = []
        for code in supported.keys():
            iso_code = str(code).upper().strip()
            # Standardize strictly on ISO 3166-1 alpha-2 (2-letter) codes
            if len(iso_code) != 2:
                continue
            name = country_names.get(iso_code, iso_code)
            results.append({"code": iso_code, "name": name})

        # Sort alphabetically by country display name
        results.sort(key=lambda x: x["name"])
        return results
