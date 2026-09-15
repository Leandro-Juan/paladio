import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class VerifiedPoiPrice:
    name: str
    city: str
    price_eur: float
    is_free: bool
    source: str = "verified_official_pricing"


# Verified Real-World Admission Pricing for Top Sights
VERIFIED_POI_PRICES: dict[tuple[str, str], VerifiedPoiPrice] = {
    # Madrid
    ("museo del prado", "madrid"): VerifiedPoiPrice(
        "Museo del Prado", "madrid", 15.00, False
    ),
    ("prado museum", "madrid"): VerifiedPoiPrice(
        "Museo del Prado", "madrid", 15.00, False
    ),
    ("museo reina sofia", "madrid"): VerifiedPoiPrice(
        "Museo Reina Sofía", "madrid", 12.00, False
    ),
    ("palacio real de madrid", "madrid"): VerifiedPoiPrice(
        "Palacio Real de Madrid", "madrid", 14.00, False
    ),
    ("royal palace of madrid", "madrid"): VerifiedPoiPrice(
        "Palacio Real de Madrid", "madrid", 14.00, False
    ),
    ("parque del retiro", "madrid"): VerifiedPoiPrice(
        "Parque del Retiro", "madrid", 0.00, True
    ),
    ("el retiro park", "madrid"): VerifiedPoiPrice(
        "Parque del Retiro", "madrid", 0.00, True
    ),
    ("puerta del sol", "madrid"): VerifiedPoiPrice(
        "Puerta del Sol", "madrid", 0.00, True
    ),
    ("plaza mayor", "madrid"): VerifiedPoiPrice("Plaza Mayor", "madrid", 0.00, True),
    ("templo de debod", "madrid"): VerifiedPoiPrice(
        "Templo de Debod", "madrid", 0.00, True
    ),
    ("santiago bernabeu", "madrid"): VerifiedPoiPrice(
        "Estadio Santiago Bernabéu", "madrid", 25.00, False
    ),
    ("estadio santiago bernabeu", "madrid"): VerifiedPoiPrice(
        "Estadio Santiago Bernabéu", "madrid", 25.00, False
    ),
    ("museo thyssen-bornemisza", "madrid"): VerifiedPoiPrice(
        "Museo Thyssen-Bornemisza", "madrid", 13.00, False
    ),
    # Paris
    ("musee du louvre", "paris"): VerifiedPoiPrice(
        "Musée du Louvre", "paris", 22.00, False
    ),
    ("louvre museum", "paris"): VerifiedPoiPrice(
        "Musée du Louvre", "paris", 22.00, False
    ),
    ("louvre", "paris"): VerifiedPoiPrice("Musée du Louvre", "paris", 22.00, False),
    ("tour eiffel", "paris"): VerifiedPoiPrice("Tour Eiffel", "paris", 29.40, False),
    ("eiffel tower", "paris"): VerifiedPoiPrice("Tour Eiffel", "paris", 29.40, False),
    ("musee d'orsay", "paris"): VerifiedPoiPrice(
        "Musée d'Orsay", "paris", 16.00, False
    ),
    ("orsay museum", "paris"): VerifiedPoiPrice("Musée d'Orsay", "paris", 16.00, False),
    ("cathedrale notre-dame de paris", "paris"): VerifiedPoiPrice(
        "Cathédrale Notre-Dame", "paris", 0.00, True
    ),
    ("notre-dame", "paris"): VerifiedPoiPrice(
        "Cathédrale Notre-Dame", "paris", 0.00, True
    ),
    ("notre-dame cathedral", "paris"): VerifiedPoiPrice(
        "Cathédrale Notre-Dame", "paris", 0.00, True
    ),
    ("basilique du sacre-coeur", "paris"): VerifiedPoiPrice(
        "Basilique du Sacré-Cœur", "paris", 0.00, True
    ),
    ("sacre-coeur", "paris"): VerifiedPoiPrice(
        "Basilique du Sacré-Cœur", "paris", 0.00, True
    ),
    ("arc de triomphe", "paris"): VerifiedPoiPrice(
        "Arc de Triomphe", "paris", 16.00, False
    ),
    ("sainte-chapelle", "paris"): VerifiedPoiPrice(
        "Sainte-Chapelle", "paris", 13.00, False
    ),
    ("jardin du luxembourg", "paris"): VerifiedPoiPrice(
        "Jardin du Luxembourg", "paris", 0.00, True
    ),
    ("centre pompidou", "paris"): VerifiedPoiPrice(
        "Centre Pompidou", "paris", 15.00, False
    ),
    # Lisbon
    ("mosteiro dos jeronimos", "lisbon"): VerifiedPoiPrice(
        "Mosteiro dos Jerónimos", "lisbon", 12.00, False
    ),
    ("jeronimos monastery", "lisbon"): VerifiedPoiPrice(
        "Mosteiro dos Jerónimos", "lisbon", 12.00, False
    ),
    ("torre de belem", "lisbon"): VerifiedPoiPrice(
        "Torre de Belém", "lisbon", 9.00, False
    ),
    ("belem tower", "lisbon"): VerifiedPoiPrice(
        "Torre de Belém", "lisbon", 9.00, False
    ),
    ("castelo de sao jorge", "lisbon"): VerifiedPoiPrice(
        "Castelo de São Jorge", "lisbon", 15.00, False
    ),
    ("saint george's castle", "lisbon"): VerifiedPoiPrice(
        "Castelo de São Jorge", "lisbon", 15.00, False
    ),
    ("praca do comercio", "lisbon"): VerifiedPoiPrice(
        "Praça do Comércio", "lisbon", 0.00, True
    ),
    ("commerce square", "lisbon"): VerifiedPoiPrice(
        "Praça do Comércio", "lisbon", 0.00, True
    ),
    ("miradouro de santa luzia", "lisbon"): VerifiedPoiPrice(
        "Miradouro de Santa Luzia", "lisbon", 0.00, True
    ),
    ("elevador de santa justa", "lisbon"): VerifiedPoiPrice(
        "Elevador de Santa Justa", "lisbon", 5.30, False
    ),
    ("oceanario de lisboa", "lisbon"): VerifiedPoiPrice(
        "Oceanário de Lisboa", "lisbon", 25.00, False
    ),
    ("lisbon oceanarium", "lisbon"): VerifiedPoiPrice(
        "Oceanário de Lisboa", "lisbon", 25.00, False
    ),
    ("museu nacional do azulejo", "lisbon"): VerifiedPoiPrice(
        "Museu Nacional do Azulejo", "lisbon", 8.00, False
    ),
    # Barcelona
    ("basilica de la sagrada familia", "barcelona"): VerifiedPoiPrice(
        "Sagrada Família", "barcelona", 26.00, False
    ),
    ("sagrada familia", "barcelona"): VerifiedPoiPrice(
        "Sagrada Família", "barcelona", 26.00, False
    ),
    ("park guell", "barcelona"): VerifiedPoiPrice(
        "Park Güell", "barcelona", 10.00, False
    ),
    ("parc guell", "barcelona"): VerifiedPoiPrice(
        "Park Güell", "barcelona", 10.00, False
    ),
    ("casa batllo", "barcelona"): VerifiedPoiPrice(
        "Casa Batlló", "barcelona", 29.00, False
    ),
    ("casa mila", "barcelona"): VerifiedPoiPrice(
        "Casa Milà", "barcelona", 28.00, False
    ),
    ("la pedrera", "barcelona"): VerifiedPoiPrice(
        "Casa Milà", "barcelona", 28.00, False
    ),
    ("barri gotic", "barcelona"): VerifiedPoiPrice(
        "Barri Gòtic", "barcelona", 0.00, True
    ),
    ("gothic quarter", "barcelona"): VerifiedPoiPrice(
        "Barri Gòtic", "barcelona", 0.00, True
    ),
    ("placa de catalunya", "barcelona"): VerifiedPoiPrice(
        "Plaça de Catalunya", "barcelona", 0.00, True
    ),
    ("catalonia square", "barcelona"): VerifiedPoiPrice(
        "Plaça de Catalunya", "barcelona", 0.00, True
    ),
    ("parc de la ciutadella", "barcelona"): VerifiedPoiPrice(
        "Parc de la Ciutadella", "barcelona", 0.00, True
    ),
    ("museu picasso", "barcelona"): VerifiedPoiPrice(
        "Museu Picasso", "barcelona", 15.00, False
    ),
    # Rome
    ("colosseo", "rome"): VerifiedPoiPrice("Colosseo", "rome", 18.00, False),
    ("colosseum", "rome"): VerifiedPoiPrice("Colosseo", "rome", 18.00, False),
    ("pantheon", "rome"): VerifiedPoiPrice("Pantheon", "rome", 5.00, False),
    ("musei vaticani", "rome"): VerifiedPoiPrice(
        "Musei Vaticani", "rome", 20.00, False
    ),
    ("vatican museums", "rome"): VerifiedPoiPrice(
        "Musei Vaticani", "rome", 20.00, False
    ),
    ("fontana di trevi", "rome"): VerifiedPoiPrice(
        "Fontana di Trevi", "rome", 0.00, True
    ),
    ("trevi fountain", "rome"): VerifiedPoiPrice(
        "Fontana di Trevi", "rome", 0.00, True
    ),
    ("piazza navona", "rome"): VerifiedPoiPrice("Piazza Navona", "rome", 0.00, True),
    ("scalinata di trinita dei monti", "rome"): VerifiedPoiPrice(
        "Spanish Steps", "rome", 0.00, True
    ),
    ("spanish steps", "rome"): VerifiedPoiPrice("Spanish Steps", "rome", 0.00, True),
    ("foro romano", "rome"): VerifiedPoiPrice("Foro Romano", "rome", 18.00, False),
    ("roman forum", "rome"): VerifiedPoiPrice("Foro Romano", "rome", 18.00, False),
    ("basilica di san pietro", "rome"): VerifiedPoiPrice(
        "Basilica di San Pietro", "rome", 0.00, True
    ),
    ("st. peter's basilica", "rome"): VerifiedPoiPrice(
        "Basilica di San Pietro", "rome", 0.00, True
    ),
    ("galleria borghese", "rome"): VerifiedPoiPrice(
        "Galleria Borghese", "rome", 13.00, False
    ),
}

# Category Benchmarks for estimating unindexed POIs
CATEGORY_BENCHMARKS: dict[str, tuple[float, bool]] = {
    "museum": (14.00, False),
    "monument": (10.00, False),
    "park": (0.00, True),
    "viewpoint": (0.00, True),
    "restaurant": (25.00, False),
    "place_of_worship": (0.00, True),
    "generic": (5.00, False),
}


def normalize_string(s: str) -> str:
    """Normalize string by replacing ligatures, removing diacritics and non-alphanumeric chars."""
    import unicodedata

    s = s.replace("œ", "oe").replace("Œ", "oe").replace("æ", "ae").replace("Æ", "ae")
    n = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("utf-8")
    return re.sub(r"[^\w\s]", "", n).lower().strip()


_NORMALIZED_VERIFIED_PRICES: dict[tuple[str, str], VerifiedPoiPrice] = {}


def _get_normalized_catalog() -> dict[tuple[str, str], VerifiedPoiPrice]:
    global _NORMALIZED_VERIFIED_PRICES
    if not _NORMALIZED_VERIFIED_PRICES:
        _NORMALIZED_VERIFIED_PRICES = {
            (normalize_string(k[0]), normalize_string(k[1])): v
            for k, v in VERIFIED_POI_PRICES.items()
        }
    return _NORMALIZED_VERIFIED_PRICES


class PoiPricingService:
    """
    Service responsible for resolving real-world admission prices for POIs across any city,
    combining official verified tariffs, OSM charge data, and transparent estimation benchmarks.
    """

    @classmethod
    def get_verified_poi_price(
        cls, poi_name: str, city: str
    ) -> VerifiedPoiPrice | None:
        """Finds verified price by normalized name and city."""
        norm_name = normalize_string(poi_name)
        norm_city = normalize_string(city)
        catalog = _get_normalized_catalog()

        # Exact match
        if (norm_name, norm_city) in catalog:
            return catalog[(norm_name, norm_city)]

        # Partial / fuzzy substring match
        for (k_name, k_city), v in catalog.items():
            if k_city == norm_city and (k_name in norm_name or norm_name in k_name):
                return v

        return None

    @classmethod
    def resolve_poi_price(
        cls,
        poi_name: str,
        city: str,
        category: str = "generic",
        osm_fee: str | None = None,
        osm_charge: str | None = None,
        existing_cost: float | None = None,
        existing_is_estimated: bool | None = None,
        existing_source: str | None = None,
    ) -> tuple[float, bool, str]:
        """
        Determines the price for any POI in any city.
        Returns: (cost_eur, is_estimated, price_source)
        Guarantees: If the price cannot be verified as real-world, cost_is_estimated=True.
        """
        # 1. Check verified catalog first
        verified = cls.get_verified_poi_price(poi_name, city)
        if verified is not None:
            return verified.price_eur, False, verified.source

        # 2. Check OSM explicit free tag
        if osm_fee and str(osm_fee).lower() in ["no", "false", "0"]:
            return 0.0, False, "osm_fee_tag_free"

        # 3. Check OSM explicit charge
        if osm_charge:
            try:
                cleaned = re.sub(r"[^\d.]", " ", str(osm_charge))
                nums = [
                    float(p)
                    for p in cleaned.split()
                    if p and p.replace(".", "", 1).isdigit()
                ]
                if nums:
                    return nums[0], False, "osm_charge_tag"
            except (ValueError, TypeError) as parse_err:
                logger.debug("Could not parse charge tag: %s", parse_err)

        # 4. Check if existing data already has a verified real price
        if (
            existing_cost is not None
            and existing_is_estimated is False
            and existing_source
            and "estimate" not in existing_source
        ):
            return existing_cost, False, existing_source

        # 5. Fallback: Category benchmark estimation
        # Mandatory Guardrail: Clearly state that this is AN ESTIMATED PRICE
        cat_key = category.lower() if category else "generic"
        benchmark_cost, is_free = CATEGORY_BENCHMARKS.get(
            cat_key, CATEGORY_BENCHMARKS["generic"]
        )

        cost = 0.0 if is_free else benchmark_cost
        return cost, True, "category_benchmark_estimate"
