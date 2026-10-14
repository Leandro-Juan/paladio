"""Structured Query Understanding and Query Expansion (Phase 4).

Rewrites user travel queries into dense semantic subqueries (multilingual) and
structured facet constraints for single-roundtrip hybrid retrieval.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

CITY_LANG_MAP: dict[str, str] = {
    "madrid": "es",
    "barcelona": "es",
    "seville": "es",
    "valencia": "es",
    "paris": "fr",
    "lyon": "fr",
    "rome": "it",
    "florence": "it",
    "milan": "it",
    "lisbon": "pt",
    "porto": "pt",
    "berlin": "de",
    "munich": "de",
}

EN_TO_LOCAL_VOCAB: dict[str, dict[str, str]] = {
    "es": {
        "church": "iglesia",
        "cathedral": "catedral",
        "museum": "museo",
        "park": "parque",
        "garden": "jardín",
        "castle": "castillo",
        "palace": "palacio",
        "square": "plaza",
        "art": "arte",
        "quiet": "tranquilo",
        "historic": "histórico",
        "food": "comida tapas",
    },
    "fr": {
        "church": "église",
        "cathedral": "cathédrale",
        "museum": "musée",
        "park": "parc",
        "garden": "jardin",
        "castle": "château",
        "palace": "palais",
        "square": "place",
        "art": "art",
        "quiet": "calme",
        "historic": "historique",
        "food": "gastronomie bistrot",
    },
    "it": {
        "church": "chiesa",
        "cathedral": "duomo cattedrale",
        "museum": "museo",
        "park": "parco",
        "garden": "giardino",
        "castle": "castello",
        "palace": "palazzo",
        "square": "piazza",
        "art": "arte",
        "quiet": "tranquillo",
        "historic": "storico",
        "food": "cucina trattoria",
    },
    "pt": {
        "church": "igreja",
        "cathedral": "sé catedral",
        "museum": "museu",
        "park": "parque",
        "garden": "jardim",
        "castle": "castelo",
        "palace": "palácio",
        "square": "praça",
        "art": "arte",
        "quiet": "tranquilo",
        "historic": "histórico",
        "food": "gastronomia petiscos",
    },
    "de": {
        "church": "kirche",
        "cathedral": "dom kathedrale",
        "museum": "museum",
        "park": "park",
        "garden": "garten",
        "castle": "schloss burg",
        "palace": "palast",
        "square": "platz",
        "art": "kunst",
        "quiet": "ruhig",
        "historic": "historisch",
        "food": "essen restaurant",
    },
}


@dataclass
class StructuredQuery:
    raw_query: str
    clean_query: str
    semantic_subqueries: list[str] = field(default_factory=list)
    required_facets: dict[str, Any] = field(default_factory=dict)
    max_cost_eur: float | None = None
    max_tier: int | None = None
    require_rain_friendly: bool = False


class QueryRewriter:
    """Transforms raw user queries into structured hybrid search parameters."""

    @classmethod
    def clean_query_text(cls, query: str) -> str:
        """Removes special search operators and normalizes whitespace."""
        clean = re.sub(r"['\":*&|!()<>]", " ", query)
        clean = re.sub(r"\s+", " ", clean).strip()
        return clean

    @classmethod
    def rewrite_query(
        cls,
        query: str,
        destination_city: str = "",
    ) -> StructuredQuery:
        """Rule-based deterministic structured query understanding and multilingual expansion."""
        clean = cls.clean_query_text(query)
        q_lower = query.lower()

        required_facets: dict[str, Any] = {}
        require_rain_friendly = False
        max_cost: float | None = None
        max_tier: int | None = None

        # 1. Rain / Indoor / Outdoor constraints
        if any(w in q_lower for w in ("rain", "rainy", "raining", "indoor", "covered")):
            required_facets["rain_friendly"] = True
            required_facets["indoor_outdoor"] = "indoor"
            require_rain_friendly = True
        elif any(
            w in q_lower for w in ("outdoor", "open air", "park", "garden", "walk")
        ):
            required_facets["indoor_outdoor"] = "outdoor"

        # 2. Budget / Free constraints
        if any(w in q_lower for w in ("free", "gratis", "no cost", "without paying")):
            max_cost = 0.0
            required_facets["budget_tier"] = "free"
        elif any(w in q_lower for w in ("cheap", "budget", "affordable")):
            max_cost = 10.0
            required_facets["budget_tier"] = "budget"

        # 3. Must-see / Top tier constraints
        if any(
            w in q_lower
            for w in ("must see", "must-see", "iconic", "top", "famous", "highlight")
        ):
            max_tier = 1
        elif any(w in q_lower for w in ("major", "main attraction", "landmark")):
            max_tier = 2

        # 4. Themes & Vibes
        themes = []
        if any(w in q_lower for w in ("art", "gallery", "painting", "sculpture")):
            themes.append("art")
        if any(
            w in q_lower
            for w in ("history", "historic", "ancient", "medieval", "heritage")
        ):
            themes.append("history")
        if any(
            w in q_lower
            for w in ("architecture", "facade", "gothic", "baroque", "modernist")
        ):
            themes.append("architecture")
        if any(w in q_lower for w in ("church", "cathedral", "basilica", "monastery")):
            themes.append("religion_spirituality")
        if any(
            w in q_lower
            for w in ("food", "culinary", "tasting", "tapas", "wine", "dine")
        ):
            themes.append("culinary")
        if themes:
            required_facets["themes"] = themes

        vibes = []
        if any(
            w in q_lower for w in ("quiet", "peaceful", "calm", "relaxing", "hidden")
        ):
            vibes.append("quiet")
        if any(w in q_lower for w in ("lively", "vibrant", "bustling", "energetic")):
            vibes.append("lively")
        if any(w in q_lower for w in ("romantic", "couple")):
            vibes.append("romantic")
        if vibes:
            required_facets["vibes"] = vibes

        # 5. Multilingual Subquery Expansion
        subqueries = [clean]
        if destination_city:
            subqueries.append(f"{destination_city} {clean}".strip())

        lang = CITY_LANG_MAP.get(destination_city.lower(), "")
        if lang and lang in EN_TO_LOCAL_VOCAB:
            vocab = EN_TO_LOCAL_VOCAB[lang]
            translated_tokens = []
            for token in clean.lower().split():
                if token in vocab:
                    translated_tokens.append(vocab[token])
            if translated_tokens:
                local_query = " ".join(translated_tokens)
                if destination_city:
                    subqueries.append(f"{destination_city} {local_query}")
                else:
                    subqueries.append(local_query)

        # De-duplicate while preserving order
        seen = set()
        deduped_subqueries = []
        for sq in subqueries:
            sq_norm = sq.strip().lower()
            if sq_norm and sq_norm not in seen:
                seen.add(sq_norm)
                deduped_subqueries.append(sq.strip())

        return StructuredQuery(
            raw_query=query,
            clean_query=clean,
            semantic_subqueries=deduped_subqueries[:4],
            required_facets=required_facets,
            max_cost_eur=max_cost,
            max_tier=max_tier,
            require_rain_friendly=require_rain_friendly,
        )

    @classmethod
    async def rewrite_query_async(
        cls,
        query: str,
        destination_city: str = "",
        ollama_url: str = "http://localhost:11434",
        model: str = "qwen2.5:3b",
    ) -> StructuredQuery:
        """Attempts LLM-based query understanding via local Ollama, falling back gracefully to rule-based."""
        rule_based = cls.rewrite_query(query, destination_city)
        if not query.strip():
            return rule_based

        prompt = (
            f"Analyze this travel search query for destination: '{destination_city}'.\n"
            f"Query: '{query}'\n\n"
            "Extract:\n"
            "- clean_query: simplified search keywords\n"
            "- semantic_subqueries: 2 to 4 expanded search phrases in English and destination language\n"
            "- required_facets: object containing any explicit constraints (e.g., rain_friendly, indoor_outdoor, themes, vibes)\n"
            "- max_cost_eur: maximum budget in EUR if mentioned, else null\n"
            "- max_tier: 1 (iconic must-see) or 2 (major sights) if requested, else null\n"
            "- require_rain_friendly: boolean if indoor/rain activity explicitly needed\n\n"
            "Respond ONLY in valid JSON matching schema:\n"
            '{"clean_query": "...", "semantic_subqueries": ["...", "..."], "required_facets": {}, "max_cost_eur": null, "max_tier": null, "require_rain_friendly": false}'
        )

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                if resp.status_code == 200:
                    data = json.loads(resp.json().get("response", "{}"))
                    clean = data.get("clean_query") or rule_based.clean_query
                    subqs = (
                        data.get("semantic_subqueries")
                        or rule_based.semantic_subqueries
                    )
                    facets = data.get("required_facets") or rule_based.required_facets
                    max_cost = (
                        data.get("max_cost_eur")
                        if data.get("max_cost_eur") is not None
                        else rule_based.max_cost_eur
                    )
                    max_t = (
                        data.get("max_tier")
                        if data.get("max_tier") is not None
                        else rule_based.max_tier
                    )
                    rain = bool(
                        data.get(
                            "require_rain_friendly", rule_based.require_rain_friendly
                        )
                    )

                    return StructuredQuery(
                        raw_query=query,
                        clean_query=cls.clean_query_text(clean),
                        semantic_subqueries=subqs[:4],
                        required_facets=facets,
                        max_cost_eur=max_cost,
                        max_tier=max_t,
                        require_rain_friendly=rain,
                    )
        except Exception as e:
            logger.debug("Ollama query rewriter fallback to rule-based: %s", e)

        return rule_based
