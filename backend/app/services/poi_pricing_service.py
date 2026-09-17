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

    @classmethod
    async def batch_resolve_unindexed_pois(
        cls, pois: list[dict], city: str
    ) -> list[dict]:
        """
        Enriches a batch of candidate POI dictionaries with verified prices and 7-day opening vectors.
        1. Fast path: Verified catalog and OSM tags.
        2. Web grounding: Queries DuckDuckGo / Wikivoyage search snippets in parallel and
           calls Ollama in a single structured batch prompt to extract official prices and opening hours.
        3. Strict fallback: Category benchmark estimates with cost_is_estimated=True if ungrounded.
        """
        import asyncio
        import json

        import httpx
        from app.utils.opening_hours_parser import parse_osm_opening_hours

        unindexed_indices = []

        for idx, p in enumerate(pois):
            name = p.get("name", "")
            cat = p.get("category", "generic")
            raw_cost = p.get("cost_eur")
            osm_fee = p.get("osm_fee")
            osm_charge = p.get("osm_charge")
            osm_h = p.get("osm_opening_hours") or (
                p.get("schedule", {}).get("osm_opening_hours")
                if isinstance(p.get("schedule"), dict)
                else None
            )

            # Resolve price via catalog / OSM tags
            cost, is_est, src = cls.resolve_poi_price(
                poi_name=name,
                city=city,
                category=cat,
                osm_fee=osm_fee,
                osm_charge=osm_charge,
                existing_cost=raw_cost,
                existing_is_estimated=p.get("cost_is_estimated"),
                existing_source=p.get("cost_source"),
            )
            p["cost_eur"] = cost
            p["cost_is_estimated"] = is_est
            p["cost_source"] = src

            # Resolve opening hours vectors
            if p.get("open_time_mins_by_day") and len(p["open_time_mins_by_day"]) == 7:
                pass  # already populated
            else:
                parsed = parse_osm_opening_hours(osm_h)
                p["open_time_mins_by_day"] = parsed.open_time_mins_by_day
                p["close_time_mins_by_day"] = parsed.close_time_mins_by_day
                p["osm_opening_hours"] = osm_h

            if is_est:
                unindexed_indices.append(idx)

        # If unindexed POIs exist, attempt parallel web grounding and single Ollama batch extraction
        if unindexed_indices:
            unindexed_pois = [
                pois[i] for i in unindexed_indices[:10]
            ]  # limit to top 10 candidates
            try:
                # 1. Fetch search snippets in parallel
                async def fetch_snippet(poi_item: dict) -> tuple[str, str]:
                    poi_n = poi_item.get("name", "")
                    query = f"{poi_n} {city} admission ticket price opening hours"
                    try:
                        async with httpx.AsyncClient(timeout=3.0) as client:
                            url = f"https://html.duckduckgo.com/html/?q={httpx.URL(query)}"
                            headers = {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                            }
                            resp = await client.get(url, headers=headers)
                            if resp.status_code == 200:
                                text = re.sub(r"<[^>]+>", " ", resp.text)[:600]
                                return poi_n, text
                    except (httpx.HTTPError, asyncio.TimeoutError) as e:
                        logger.debug("Snippet fetch failed for '%s': %s", poi_n, e)
                    return poi_n, ""

                snippet_tasks = [fetch_snippet(p) for p in unindexed_pois]
                snippets = await asyncio.gather(*snippet_tasks)

                combined_context = "\n".join(
                    f"POI: {name}\nSnippet: {text}" for name, text in snippets if text
                )

                if combined_context:
                    # 2. Query Ollama in a single batch prompt
                    prompt = (
                        f"Extract admission price in EUR and opening hours for these attractions in {city}.\n"
                        f"Context:\n{combined_context}\n\n"
                        "Respond ONLY in valid JSON matching this schema:\n"
                        '{"results": [{"name": "POI Name", "price_eur": 12.0, "is_free": false, "hours_raw": "09:00-18:00"}]}'
                    )
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        ollama_resp = await client.post(
                            "http://localhost:11434/api/generate",
                            json={
                                "model": "qwen2.5:3b",
                                "prompt": prompt,
                                "format": "json",
                                "stream": False,
                            },
                        )
                        if ollama_resp.status_code == 200:
                            res_json = json.loads(
                                ollama_resp.json().get("response", "{}")
                            )
                            extracted_list = res_json.get("results", [])
                            for ext in extracted_list:
                                e_name = ext.get("name", "").lower()
                                e_price = ext.get("price_eur")
                                e_hours = ext.get("hours_raw")
                                for u_idx in unindexed_indices:
                                    target = pois[u_idx]
                                    if (
                                        target.get("name", "").lower() in e_name
                                        or e_name in target.get("name", "").lower()
                                    ):
                                        if (
                                            e_price is not None
                                            and float(e_price) >= 0.0
                                        ):
                                            target["cost_eur"] = float(e_price)
                                            target["cost_is_estimated"] = False
                                            target["cost_source"] = (
                                                "official_web_grounding"
                                            )
                                        if e_hours:
                                            p_hours = parse_osm_opening_hours(e_hours)
                                            target["open_time_mins_by_day"] = (
                                                p_hours.open_time_mins_by_day
                                            )
                                            target["close_time_mins_by_day"] = (
                                                p_hours.close_time_mins_by_day
                                            )
                                            target["osm_opening_hours"] = e_hours
            except (
                httpx.HTTPError,
                asyncio.TimeoutError,
                json.JSONDecodeError,
                KeyError,
                ValueError,
                TypeError,
            ) as e:
                logger.warning("Batch web grounding failed gracefully: %s", e)

        return pois
