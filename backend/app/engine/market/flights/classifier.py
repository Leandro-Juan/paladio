"""
Universal Flight Route Classifier.
Dynamically resolves geographic corridor regions (Americas, Europe, Intercontinental)
and appropriate local currency & localization without any hardcoded country or route tables.
Uses airportsdata (7,880+ commercial IATA airports) and geonamescache (official continent codes).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
import geonamescache

from app.services.airport_service import get_airport

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RouteClassification:
    origin_iata: str
    dest_iata: str
    origin_country: str
    dest_country: str
    origin_continent: str
    dest_continent: str
    corridor_region: str  # "intra_americas", "intra_europe", "intercontinental"
    is_americas: bool
    is_europe: bool
    suggested_currency: str
    origin_timezone: str
    dest_timezone: str


class FlightRouteClassifier:
    """
    Classifies flight corridors dynamically to configure provider ladder priority,
    search localization (gl / hl), and default currency.
    """

    def __init__(self):
        self._gc = geonamescache.GeonamesCache()
        self._countries = self._gc.get_countries()

    def classify_corridor(
        self, origin_iata: str, dest_iata: str
    ) -> RouteClassification:
        orig_clean = (origin_iata or "").strip().upper()
        dest_clean = (dest_iata or "").strip().upper()

        orig_ap = get_airport(orig_clean)
        dest_ap = get_airport(dest_clean)

        orig_country = orig_ap.country if orig_ap else ""
        dest_country = dest_ap.country if dest_ap else ""

        orig_cont = self._countries.get(orig_country, {}).get(
            "continentcode", "UNKNOWN"
        )
        dest_cont = self._countries.get(dest_country, {}).get(
            "continentcode", "UNKNOWN"
        )

        # Timezones
        orig_tz = orig_ap.timezone if orig_ap else "UTC"
        dest_tz = dest_ap.timezone if dest_ap else "UTC"

        # Determine corridor classification dynamically
        americas_continents = {"NA", "SA"}
        is_orig_americas = orig_cont in americas_continents or orig_tz.startswith(
            "America/"
        )
        is_dest_americas = dest_cont in americas_continents or dest_tz.startswith(
            "America/"
        )

        is_orig_europe = orig_cont == "EU" or orig_tz.startswith("Europe/")
        is_dest_europe = dest_cont == "EU" or dest_tz.startswith("Europe/")

        if is_orig_americas and is_dest_americas:
            corridor_region = "intra_americas"
            is_americas = True
            is_europe = False
        elif is_orig_europe and is_dest_europe:
            corridor_region = "intra_europe"
            is_americas = False
            is_europe = True
        else:
            corridor_region = "intercontinental"
            is_americas = is_orig_americas or is_dest_americas
            is_europe = is_orig_europe or is_dest_europe

        # Suggest currency dynamically
        orig_curr = self._countries.get(orig_country, {}).get("currencycode")
        dest_curr = self._countries.get(dest_country, {}).get("currencycode")

        if orig_curr and orig_curr == dest_curr:
            suggested_curr = orig_curr
        elif is_americas and (orig_country == "US" or dest_country == "US"):
            suggested_curr = "USD"
        elif is_europe and (orig_curr == "EUR" or dest_curr == "EUR"):
            suggested_curr = "EUR"
        elif is_americas:
            suggested_curr = orig_curr or dest_curr or "USD"
        elif is_europe:
            suggested_curr = orig_curr or dest_curr or "EUR"
        else:
            suggested_curr = "USD"

        return RouteClassification(
            origin_iata=orig_clean,
            dest_iata=dest_clean,
            origin_country=orig_country,
            dest_country=dest_country,
            origin_continent=orig_cont,
            dest_continent=dest_cont,
            corridor_region=corridor_region,
            is_americas=is_americas,
            is_europe=is_europe,
            suggested_currency=suggested_curr,
            origin_timezone=orig_tz,
            dest_timezone=dest_tz,
        )


route_classifier = FlightRouteClassifier()
