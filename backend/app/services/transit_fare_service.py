import logging
from dataclasses import dataclass, field

from app.domain.entities.poi import TransitRecommendation, TransitStep

logger = logging.getLogger(__name__)


@dataclass
class CityTransitFare:
    city: str
    country: str
    currency: str = "EUR"
    single_fare: float = 1.80
    pass_24h_price: float | None = None
    pass_24h_name: str | None = None
    pass_24h_includes_airport: bool = False
    airport_surcharge: float = 0.0
    airport_station_keywords: list[str] = field(default_factory=list)
    is_estimated: bool = False
    source: str = "verified_official_tariff"


# Verified Real-World City Public Transit Tariffs (Official Transit Authorities)
VERIFIED_CITY_FARES: dict[str, CityTransitFare] = {
    "madrid": CityTransitFare(
        city="madrid",
        country="Spain",
        currency="EUR",
        single_fare=1.50,
        pass_24h_price=8.40,
        pass_24h_name="Abono Turístico 1 Día (Zona A)",
        pass_24h_includes_airport=True,
        airport_surcharge=3.00,
        airport_station_keywords=[
            "aeropuerto t1-t2-t3",
            "aeropuerto t4",
            "aeropuerto",
            "barajas",
        ],
        is_estimated=False,
        source="official_crtm_tariff",
    ),
    "paris": CityTransitFare(
        city="paris",
        country="France",
        currency="EUR",
        single_fare=2.15,
        pass_24h_price=8.45,
        pass_24h_name="Navigo Jour (Zones 1-2)",
        pass_24h_includes_airport=False,
        airport_surcharge=9.65,  # 11.80€ RER B CDG to Paris minus 2.15€ base single = 9.65€ supplement
        airport_station_keywords=[
            "aeroport charles de gaulle",
            "aeroport cdg",
            "cdg",
            "roissy",
            "aeroport d'orly",
            "orlyval",
        ],
        is_estimated=False,
        source="official_idfm_tariff",
    ),
    "lisbon": CityTransitFare(
        city="lisbon",
        country="Portugal",
        currency="EUR",
        single_fare=1.80,
        pass_24h_price=6.80,
        pass_24h_name="Bilhete 24h Carris/Metro",
        pass_24h_includes_airport=True,
        airport_surcharge=0.0,  # Standard metro fare covers Humberto Delgado Airport
        airport_station_keywords=["aeroporto", "aeroporto de lisboa"],
        is_estimated=False,
        source="official_carris_metro_tariff",
    ),
    "barcelona": CityTransitFare(
        city="barcelona",
        country="Spain",
        currency="EUR",
        single_fare=2.55,
        pass_24h_price=11.20,
        pass_24h_name="Hola Barcelona 24h Travel Card",
        pass_24h_includes_airport=True,
        airport_surcharge=2.95,  # 5.50€ Airport ticket minus 2.55€ base single = 2.95€ supplement
        airport_station_keywords=[
            "aeroport t1",
            "aeroport t2",
            "aeroport",
            "el prat",
        ],
        is_estimated=False,
        source="official_tmb_tariff",
    ),
    "rome": CityTransitFare(
        city="rome",
        country="Italy",
        currency="EUR",
        single_fare=1.50,
        pass_24h_price=7.00,
        pass_24h_name="Biglietto 24 Ore ATAC",
        pass_24h_includes_airport=False,
        airport_surcharge=12.50,  # 14.00€ Leonardo Express minus 1.50€ base single = 12.50€ supplement
        airport_station_keywords=["fiumicino", "aeroporto fiumicino", "ciampino"],
        is_estimated=False,
        source="official_atac_tariff",
    ),
}

# Generic fallback keywords for identifying airport stations across any language
GENERIC_AIRPORT_KEYWORDS = [
    "airport",
    "aeropuerto",
    "aéroport",
    "aeroporto",
    "flughafen",
    "lufthavn",
    "lotnisko",
    "havalimanı",
]


class TransitFareService:
    """
    Sovereign pricing service determining dynamic real-world public transit fares,
    airport surcharges, and 24-hour pass savings across any city.
    """

    @classmethod
    def get_city_transit_fare(cls, city: str) -> CityTransitFare:
        city_key = city.lower().strip() if city else ""

        if city_key in VERIFIED_CITY_FARES:
            return VERIFIED_CITY_FARES[city_key]

        # Automatic fallback estimation for any unindexed city
        logger.info(
            f"City '{city}' not in verified transit tariff registry. Using regional benchmark estimate."
        )
        return CityTransitFare(
            city=city_key,
            country="Unknown",
            currency="EUR",
            single_fare=2.00,
            pass_24h_price=8.00,
            pass_24h_name="Estimated 24h Transit Pass",
            pass_24h_includes_airport=False,
            airport_surcharge=3.00,
            airport_station_keywords=GENERIC_AIRPORT_KEYWORDS,
            is_estimated=True,
            source="regional_benchmark_estimate",
        )

    @classmethod
    def is_airport_station(cls, text: str, keywords: list[str]) -> bool:
        if not text:
            return False
        text_lower = text.lower()
        all_kw = set(keywords) | set(GENERIC_AIRPORT_KEYWORDS)
        return any(kw in text_lower for kw in all_kw)

    @classmethod
    def calculate_transit_leg_fare(
        cls,
        city: str,
        steps: list[TransitStep],
        fare: CityTransitFare | None = None,
    ) -> tuple[float, bool, str, bool]:
        """
        Calculates exact leg fare, detecting transport mode and airport surcharges.
        Returns: (cost_eur, is_estimated, price_source, has_airport_step)
        """
        has_transit = any(
            s.type in ("transit", "transit_board", "transit_alight") for s in steps
        )
        if not has_transit:
            return 0.0, False, "pedestrian_zero_cost", False

        if fare is None:
            fare = cls.get_city_transit_fare(city)

        has_airport = False
        for s in steps:
            for field_val in (s.station_name, s.instruction, s.headsign):
                if field_val and cls.is_airport_station(
                    field_val, fare.airport_station_keywords
                ):
                    has_airport = True
                    break
            if has_airport:
                break

        total_cost = fare.single_fare
        if has_airport:
            total_cost += fare.airport_surcharge
            logger.info(
                f"Airport transit leg detected in {city}: applied {fare.airport_surcharge:.2f} {fare.currency} surcharge (total: {total_cost:.2f} {fare.currency})."
            )

        return round(total_cost, 2), fare.is_estimated, fare.source, has_airport

    @classmethod
    def evaluate_daily_transit_savings(
        cls,
        city: str,
        leg_costs: list[float],
        has_airport_leg: bool = False,
        fare: CityTransitFare | None = None,
    ) -> TransitRecommendation:
        """
        Compares sum of individual transit rides against the city's 24h pass price.
        If the pass saves money, generates a 24H_PASS_RECOMMENDED advisory.
        """
        if fare is None:
            fare = cls.get_city_transit_fare(city)

        total_singles = round(sum(leg_costs), 2)

        # If city has a 24h pass and buying singles costs more than the pass
        if fare.pass_24h_price is not None and total_singles > fare.pass_24h_price:
            savings = round(total_singles - fare.pass_24h_price, 2)
            msg = (
                f"You have {len(leg_costs)} transit legs scheduled today totaling {total_singles:.2f} {fare.currency}. "
                f"Buying a 24h Pass ({fare.pass_24h_name} for {fare.pass_24h_price:.2f} {fare.currency}) "
                f"will save you {savings:.2f} {fare.currency} and grant unlimited rides."
            )
            if has_airport_leg and fare.pass_24h_includes_airport:
                msg += " This pass also covers the airport transit surcharge!"

            return TransitRecommendation(
                type="24H_PASS_RECOMMENDED",
                single_tickets_total_eur=total_singles,
                pass_name=fare.pass_24h_name,
                pass_price_eur=fare.pass_24h_price,
                savings_eur=savings,
                includes_airport=fare.pass_24h_includes_airport,
                message=msg,
            )

        return TransitRecommendation(
            type="SINGLE_TICKETS_OPTIMAL",
            single_tickets_total_eur=total_singles,
            pass_name=fare.pass_24h_name,
            pass_price_eur=fare.pass_24h_price,
            savings_eur=0.0,
            includes_airport=False,
            message=f"Individual single tickets ({total_singles:.2f} {fare.currency}) are more cost-effective than a day pass.",
        )
