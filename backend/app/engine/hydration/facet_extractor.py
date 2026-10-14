"""Controlled Facet Extractor & Document Quality Grader.

Derives controlled themes, vibes, audience, schedule tags, and dietary options
from OSM tags, Wikidata claims, and description text. Provides a strictly grounded
local LLM generation pass for sparse Tier 1-2 POIs and calculates doc_quality (A/B/C).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import httpx
from app.core.taxonomy_config import (
    VALID_AUDIENCE,
    VALID_THEMES,
    VALID_TIME_OF_DAY,
    VALID_VIBES,
    Audience,
    IndoorOutdoor,
    PriceLevel,
    Theme,
    TimeOfDay,
    Vibe,
)

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_EXTRACTION_MODEL", "qwen2.5:7b-instruct")


def extract_facets(
    tags: dict[str, str],
    category: str,
    name: str,
    description: str | None = None,
    claims: dict[str, Any] | None = None,
    sitelinks_count: int = 0,
    cost_eur: float | None = None,
) -> dict[str, Any]:
    """Derives structured, controlled facets from raw tags and metadata."""
    tags_lower = {k.lower(): str(v).lower() for k, v in tags.items()}
    text_corpus = f"{name} {category} {description or ''}".lower()
    claims = claims or {}

    themes: set[str] = set()
    vibes: set[str] = set()
    audience: set[str] = set()
    time_of_day: set[str] = set()

    tourism = tags_lower.get("tourism", "")
    historic = tags_lower.get("historic", "")
    building = tags_lower.get("building", "")
    amenity = tags_lower.get("amenity", "")
    leisure = tags_lower.get("leisure", "")
    natural = tags_lower.get("natural", "")
    shop = tags_lower.get("shop", "")
    cuisine_raw = tags_lower.get("cuisine", "")

    # --- Themes Extraction ----------------------------------------------------
    if tourism in ("museum", "gallery") or any(
        w in text_corpus
        for w in ("art", "museum", "gallery", "pinacoteca", "painting", "arte")
    ):
        themes.add(Theme.ART_PAINTING.value)
    if (
        tourism == "artwork"
        or historic in ("monument", "memorial")
        or any(
            w in text_corpus for w in ("sculpture", "statue", "escultura", "estatua")
        )
    ):
        themes.add(Theme.SCULPTURE.value)
    if historic in ("archaeological_site", "ruins") or any(
        w in text_corpus for w in ("archaeology", "arqueologia", "ruinas", "excavation")
    ):
        themes.add(Theme.ARCHAEOLOGY_ANTIQUITIES.value)
    if (
        historic in ("castle", "palace")
        or building in ("palace", "castle")
        or any(
            w in text_corpus
            for w in ("palacio", "palace", "castillo", "alcazar", "royal")
        )
    ):
        themes.add(Theme.ROYAL_PALACE.value)
    if (
        amenity == "place_of_worship"
        or building
        in (
            "cathedral",
            "basilica",
            "church",
            "synagogue",
            "mosque",
            "temple",
            "chapel",
        )
        or any(
            w in text_corpus
            for w in (
                "cathedral",
                "catedral",
                "basilica",
                "church",
                "iglesia",
                "convento",
                "monastery",
            )
        )
    ):
        themes.add(Theme.SACRED_RELIGIOUS.value)
    if any(w in text_corpus for w in ("gothic", "gótico", "gotico")):
        themes.add(Theme.GOTHIC_ARCHITECTURE.value)
    if any(w in text_corpus for w in ("baroque", "barroco")):
        themes.add(Theme.BAROQUE_ARCHITECTURE.value)
    if any(
        w in text_corpus
        for w in ("modernist", "modernismo", "contemporary", "gaudi", "art nouveau")
    ):
        themes.add(Theme.MODERNISM_CONTEMPORARY.value)
    if historic == "fort" or any(
        w in text_corpus for w in ("fortress", "fort", "muralla", "citadel", "bastion")
    ):
        themes.add(Theme.MILITARY_FORTRESS.value)
    if any(
        w in text_corpus
        for w in (
            "science",
            "technology",
            "astronomy",
            "observatory",
            "planetarium",
            "ciencia",
        )
    ):
        themes.add(Theme.SCIENCE_TECH.value)
    if shop == "books" or any(
        w in text_corpus
        for w in (
            "bookshop",
            "libreria",
            "literary",
            "library",
            "cervantes",
            "hemingway",
        )
    ):
        themes.add(Theme.LITERARY_HISTORY.value)
    if (
        amenity == "marketplace"
        or building == "market"
        or any(w in text_corpus for w in ("mercado", "market", "bazaar", "hall"))
    ):
        themes.add(Theme.LOCAL_MARKET.value)
    if any(w in text_corpus for w in ("street art", "graffiti", "mural")):
        themes.add(Theme.STREET_ART.value)
    if tourism == "viewpoint" or any(
        w in text_corpus
        for w in ("mirador", "viewpoint", "belvedere", "panorama", "lookout")
    ):
        themes.add(Theme.PANORAMIC_VIEWPOINT.value)
    if leisure in ("park", "garden", "nature_reserve") or any(
        w in text_corpus
        for w in ("botanical", "botanico", "jardin", "garden", "parque")
    ):
        themes.add(Theme.BOTANICAL_GARDENS.value)
    if tags_lower.get("place") == "square" or any(
        w in text_corpus for w in ("plaza", "square", "praca", "piaza")
    ):
        themes.add(Theme.URBAN_PLAZA.value)
    if "michelin" in tags_lower or any(
        w in text_corpus for w in ("michelin", "fine dining", "gourmet", "alta cocina")
    ):
        themes.add(Theme.FINE_DINING.value)
    if any(
        w in text_corpus
        for w in ("taberna", "tasca", "bodega", "meson", "mesón", "tavern", "trattoria")
    ):
        themes.add(Theme.TRADITIONAL_TAVERN.value)
    if "tapas" in cuisine_raw or any(
        w in text_corpus for w in ("tapas", "pintxos", "pinchos")
    ):
        themes.add(Theme.TAPAS_PINTXOS.value)
    if (
        "coffee" in cuisine_raw
        or shop in ("coffee", "bakery", "pastry")
        or any(
            w in text_corpus
            for w in (
                "specialty coffee",
                "roastery",
                "café de especialidad",
                "espresso",
            )
        )
    ):
        themes.add(Theme.SPECIALTY_COFFEE.value)
    if any(
        w in text_corpus
        for w in ("craft beer", "cerveza artesanal", "wine bar", "vinoteca", "enoteca")
    ):
        themes.add(Theme.CRAFT_BEER_WINE.value)
    if any(w in text_corpus for w in ("rooftop", "cocktail", "azotea", "terrace bar")):
        themes.add(Theme.COCKTAIL_ROOFTOP.value)
    if amenity in ("music_venue", "theatre") or any(
        w in text_corpus
        for w in ("jazz", "live music", "concierto", "orchestra", "symphony")
    ):
        themes.add(Theme.LIVE_MUSIC_JAZZ.value)
    if any(w in text_corpus for w in ("flamenco", "tablao", "fado")):
        themes.add(Theme.FLAMENCO_FOLKLORE.value)

    # --- Vibes Extraction -----------------------------------------------------
    if sitelinks_count >= 15 or claims.get("unesco") or tags_lower.get("heritage"):
        vibes.add(Vibe.ICONIC_MUST_SEE.value)
    if (sitelinks_count < 10 and not claims.get("unesco")) and any(
        w in text_corpus
        for w in ("hidden", "secluded", "secret", "gem", "local favorite", "quiet")
    ):
        vibes.add(Vibe.HIDDEN_GEM.value)
    if (
        Theme.SACRED_RELIGIOUS.value in themes
        or Theme.BOTANICAL_GARDENS.value in themes
        or any(
            w in text_corpus
            for w in ("quiet", "contemplative", "peaceful", "tranquil", "serene")
        )
    ):
        vibes.add(Vibe.QUIET_CONTEMPLATIVE.value)
    if Theme.PANORAMIC_VIEWPOINT.value in themes or any(
        w in text_corpus for w in ("sunset", "golden hour", "romantic", "atardecer")
    ):
        vibes.add(Vibe.ROMANTIC_SUNSET.value)
    if (
        Theme.URBAN_PLAZA.value in themes
        or Theme.LOCAL_MARKET.value in themes
        or Theme.TAPAS_PINTXOS.value in themes
        or amenity in ("bar", "pub")
    ):
        vibes.add(Vibe.LIVELY_BUSTLING.value)
    if Theme.STREET_ART.value in themes or any(
        w in text_corpus for w in ("bohemian", "artistic", "hipster", "artsy")
    ):
        vibes.add(Vibe.BOHEMIAN_ARTSY.value)
    if Theme.FINE_DINING.value in themes or any(
        w in text_corpus for w in ("luxury", "upscale", "exclusive")
    ):
        vibes.add(Vibe.LUXURY_UPSCALE.value)
    if (
        Theme.TRADITIONAL_TAVERN.value in themes
        or Theme.LOCAL_MARKET.value in themes
        or any(
            w in text_corpus
            for w in ("traditional", "authentic", "castizo", "neighborhood")
        )
    ):
        vibes.add(Vibe.CASUAL_AUTHENTIC.value)
    if amenity in ("bar", "pub", "nightclub") or any(
        w in text_corpus for w in ("late night", "nightlife", "cocktail", "club")
    ):
        vibes.add(Vibe.LATE_NIGHT.value)

    # --- Audience Extraction --------------------------------------------------
    if (
        category in ("museum", "viewpoint", "cafe")
        or Theme.SPECIALTY_COFFEE.value in themes
    ):
        audience.add(Audience.SOLO_FRIENDLY.value)
    if (
        Theme.PANORAMIC_VIEWPOINT.value in themes
        or Theme.FINE_DINING.value in themes
        or Vibe.ROMANTIC_SUNSET.value in vibes
    ):
        audience.add(Audience.COUPLES.value)
    if (
        tourism in ("zoo", "aquarium", "theme_park")
        or leisure in ("park", "playground")
        or any(w in text_corpus for w in ("family", "kids", "children", "play"))
    ):
        audience.add(Audience.FAMILIES_KIDS.value)
    if tags_lower.get("wheelchair") in ("yes", "designated") or any(
        w in text_corpus for w in ("accessible", "step-free", "flat")
    ):
        audience.add(Audience.SENIORS_ACCESSIBLE.value)
    if category in ("museum", "gallery") or tags_lower.get("building") in (
        "cathedral",
        "basilica",
        "church",
    ):
        audience.add(Audience.RAINY_DAY_SHELTER.value)
    if cost_eur == 0.0 or tags_lower.get("fee") in ("no", "false", "0"):
        audience.add(Audience.BUDGET_FREE.value)

    # --- Time of Day Extraction -----------------------------------------------
    if (
        category in ("cafe", "park")
        or Theme.SPECIALTY_COFFEE.value in themes
        or Theme.LOCAL_MARKET.value in themes
    ):
        time_of_day.add(TimeOfDay.MORNING.value)
    if (
        category in ("museum", "attraction", "monument", "restaurant")
        or Theme.ART_PAINTING.value in themes
        or Theme.ROYAL_PALACE.value in themes
    ):
        time_of_day.add(TimeOfDay.AFTERNOON.value)
    if (
        Theme.PANORAMIC_VIEWPOINT.value in themes
        or Theme.COCKTAIL_ROOFTOP.value in themes
        or Vibe.ROMANTIC_SUNSET.value in vibes
    ):
        time_of_day.add(TimeOfDay.SUNSET_GOLDEN_HOUR.value)
    if (
        category in ("bar", "nightlife", "entertainment")
        or amenity in ("bar", "pub", "nightclub", "theatre")
        or Theme.TAPAS_PINTXOS.value in themes
    ):
        time_of_day.add(TimeOfDay.EVENING_NIGHT.value)

    # --- Indoor / Outdoor Classification --------------------------------------
    if (
        category in ("park", "viewpoint")
        or tags_lower.get("place") == "square"
        or natural
        or historic in ("ruins", "monument", "city_gate")
    ):
        indoor_outdoor: IndoorOutdoor = "outdoor"
    elif category in (
        "museum",
        "restaurant",
        "cafe",
        "theatre",
        "nightlife",
        "shop",
    ) or tags_lower.get("building") in ("cathedral", "basilica", "church", "market"):
        indoor_outdoor = "indoor"
    elif historic in ("castle", "palace") or tourism in (
        "zoo",
        "aquarium",
        "theme_park",
    ):
        indoor_outdoor = "mixed"
    else:
        indoor_outdoor = "indoor"

    rain_friendly = indoor_outdoor == "indoor"

    # --- Cuisines & Dietary ---------------------------------------------------
    cuisines: list[str] = []
    if cuisine_raw:
        for c in re.split(r"[,;]", cuisine_raw):
            c_clean = c.strip()
            if c_clean and c_clean not in cuisines:
                cuisines.append(c_clean)

    dietary: list[str] = []
    for k, v in tags_lower.items():
        if k.startswith("diet:") and v in ("yes", "only"):
            diet_name = k.replace("diet:", "").replace("_", " ")
            dietary.append(diet_name)

    # --- Price Level ----------------------------------------------------------
    cost_val = None
    if isinstance(cost_eur, (int, float)):
        cost_val = float(cost_eur)
    elif cost_eur is not None:
        try:
            cost_val = float(cost_eur)
        except (ValueError, TypeError):
            cost_val = None

    if cost_val == 0.0 or tags_lower.get("fee") in ("no", "false", "0"):
        price_level: PriceLevel = "free"
    elif cost_val is not None and cost_val < 10.0:
        price_level = "budget"
    elif cost_val is not None and cost_val < 25.0:
        price_level = "mid"
    elif cost_val is not None and cost_val < 60.0:
        price_level = "fine_dining"
    elif cost_val is not None and cost_val >= 60.0:
        price_level = "luxury"
    else:
        price_level = "mid"

    return {
        "themes": sorted(t for t in themes if t in VALID_THEMES),
        "vibes": sorted(v for v in vibes if v in VALID_VIBES),
        "audience": sorted(a for a in audience if a in VALID_AUDIENCE),
        "time_of_day": sorted(tod for tod in time_of_day if tod in VALID_TIME_OF_DAY),
        "indoor_outdoor": indoor_outdoor,
        "rain_friendly": rain_friendly,
        "cuisines": cuisines,
        "dietary": dietary,
        "price_level": price_level,
    }


def compute_doc_quality(
    has_encyclopedic_prose: bool,
    description_len: int,
    has_neighborhood: bool,
    validated_facets_count: int,
    distinct_semantic_tags_count: int,
    has_wikidata_desc: bool,
) -> str:
    """Computes document quality grade A, B, or C."""
    # Grade A: encyclopedic / guide-grounded prose (>= 80 chars) + neighborhood + >= 3 validated facets
    if (
        has_encyclopedic_prose
        and description_len >= 80
        and has_neighborhood
        and validated_facets_count >= 3
    ):
        return "A"
    # Grade B: Wikidata description or >= 5 distinct semantic tags + neighborhood
    if (has_wikidata_desc or distinct_semantic_tags_count >= 5) and has_neighborhood:
        return "B"
    # Grade C: Sparse tags
    return "C"


async def generate_grounded_description(
    name: str,
    category: str,
    neighborhood: str | None,
    tags: dict[str, str],
    claims: dict[str, Any] | None = None,
    client: httpx.AsyncClient | None = None,
) -> str | None:
    """Runs a strictly grounded local Ollama call for sparse Tier 1-2 POIs.

    Rejects any text containing numbers, years, or dates not present in the input facts.
    """
    facts = [f"Name: {name}", f"Category: {category}"]
    if neighborhood:
        facts.append(f"Neighborhood: {neighborhood}")
    for k in (
        "tourism",
        "historic",
        "building",
        "amenity",
        "cuisine",
        "architect",
        "style",
    ):
        if k in tags and tags[k]:
            facts.append(f"{k.title()}: {tags[k]}")
    if claims:
        for k, v in claims.items():
            if v:
                facts.append(f"{k.title()}: {v}")

    prompt = (
        "Write a concise, factual 1-sentence description for this point of interest. "
        "Strict rule: You MUST only use the given facts. Do NOT add history, dates, "
        "years, or numeric facts that are not explicitly provided.\n\n"
        "Facts:\n" + "\n".join(facts) + "\n\nDescription:"
    )

    own_client = client is None
    client = client or httpx.AsyncClient(timeout=10.0)
    try:
        resp = await client.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.0, "num_predict": 60},
            },
        )
        if resp.status_code == 200:
            result = resp.json().get("response", "").strip()
            # Strict hallucination gate: verify numbers/years
            prompt_numbers = set(re.findall(r"\b\d+\b", prompt))
            result_numbers = set(re.findall(r"\b\d+\b", result))
            hallucinated_numbers = result_numbers - prompt_numbers
            if hallucinated_numbers:
                logger.warning(
                    f"Rejected LLM description for {name} due to hallucinated numbers: {hallucinated_numbers}"
                )
                return None
            return result
    except Exception as exc:
        logger.debug(f"Local LLM grounded generation skipped for {name}: {exc}")
        return None
    finally:
        if own_client:
            await client.aclose()
    return None


class FacetExtractor:
    @staticmethod
    def extract_facets(poi: Any = None, **kwargs) -> Any:
        if isinstance(poi, dict):
            tags = poi.get("tags") or {}
            category = poi.get("category") or "attraction"
            name = poi.get("name") or ""
            desc = poi.get("description")
            claims = poi.get("claims")
            sitelinks = poi.get("sitelinks_count", 0)
            cost = poi.get("cost_eur")
            res = extract_facets(
                tags=tags,
                category=category,
                name=name,
                description=desc,
                claims=claims,
                sitelinks_count=sitelinks,
                cost_eur=cost,
            )

            class FacetWrapper(dict):
                def model_dump(self):
                    return dict(self)

            return FacetWrapper(res)
        return extract_facets(**kwargs)

    @staticmethod
    def compute_doc_quality(*args, **kwargs) -> str:
        if "poi" in kwargs:
            poi = kwargs["poi"]
            desc = poi.get("description") or ""
            has_encyclopedic = (
                kwargs.get("has_wikipedia", False)
                or kwargs.get("has_wikivoyage", False)
                or len(desc) >= 80
            )
            has_neighborhood = bool(poi.get("neighborhood"))
            has_wikidata = kwargs.get("has_wikidata", False) or bool(
                poi.get("wikidata_id")
            )
            tags = poi.get("tags") or {}
            facets = poi.get("controlled_facets") or {}
            validated_facets_count = sum(
                len(v) for v in facets.values() if isinstance(v, (list, set, tuple))
            )
            distinct_tags = len(tags)
            return compute_doc_quality(
                has_encyclopedic_prose=has_encyclopedic,
                description_len=len(desc),
                has_neighborhood=has_neighborhood,
                validated_facets_count=validated_facets_count,
                distinct_semantic_tags_count=distinct_tags,
                has_wikidata_desc=has_wikidata,
            )
        return compute_doc_quality(*args, **kwargs)
