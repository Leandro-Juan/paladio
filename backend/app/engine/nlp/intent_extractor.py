import asyncio
import logging
import re
import time
import unicodedata
from typing import Any

import numpy as np
from rapidfuzz import fuzz

from app.engine.retrieval.query_rewriter import QueryRewriter
from app.engine.scoring.features import TAG_KEYS, TAG_REGEX_MAP
from app.engine.scoring.semantic_learning import (
    CATEGORY_ANCHORS,
    SemanticLearningEngine,
)
from app.infrastructure.providers.onnx_embedding_provider import OnnxEmbeddingProvider
from app.schemas.rag_schema import RAGPromptAnalysis

logger = logging.getLogger(__name__)

_NEGATION_RE = re.compile(
    r"\b(?:no|not\s+interested\s+in|not|avoid(?:ing)?|skip(?:ping)?|without|away\s+from|zero|never|don'?t\s+(?:want|visit|include))\s+([^.,;!?]+)",
    re.IGNORECASE,
)

_MANDATORY_TRIGGER_RE = re.compile(
    r"\b(?:must(?:\s+(?:visit|see))?|need\s+to\s+(?:visit|see)|have\s+to\s+(?:visit|see)|want\s+to\s+(?:visit|see)|definitely|non[- ]negotiable|mandatory|don'?t\s+miss|visit(?:ing)?)\b",
    re.IGNORECASE,
)

_FREQUENCY_EMPHASIS_RE = re.compile(
    r"\b(?:every\s+(?:single\s+)?(?:night|day|evening)|lots\s+of|mainly|mostly|obsessed)\b",
    re.IGNORECASE,
)

_GENERIC_SINGLE_WORDS = {
    "park",
    "museum",
    "museums",
    "market",
    "markets",
    "church",
    "cathedral",
    "palace",
    "castle",
    "temple",
    "garden",
    "gardens",
    "bar",
    "bars",
    "restaurant",
    "restaurants",
    "hotel",
    "center",
    "centre",
    "square",
    "plaza",
    "tower",
    "bridge",
    "shrine",
    "monastery",
    "gallery",
    "galleries",
    "building",
    "hall",
}

_FALLBACK_CUISINE_TERMS = {
    "french",
    "tapas",
    "spanish",
    "italian",
    "indian",
    "ramen",
    "sushi",
    "japanese",
    "british",
    "hungarian",
    "portuguese",
    "mexican",
    "thai",
    "chinese",
    "greek",
    "mediterranean",
    "korean",
    "vietnamese",
    "turkish",
    "lebanese",
    "vegan",
    "vegetarian",
}

_EXTRA_TAG_PATTERNS: dict[str, re.Pattern] = {
    "art_culture": re.compile(
        r"\b(?:museums?|galleries|paintings?|sculptures?|exhibitions?|artsy|cultural|modern art|renaissance|impressionist)\b",
        re.IGNORECASE,
    ),
    "history_heritage": re.compile(
        r"\b(?:historic(?:al)?|heritage|ruins?|monuments?|cathedrals?|churches|monasteries|palaces?|castles?|shrines?|temples?|ancient|medieval)\b",
        re.IGNORECASE,
    ),
    "nature_outdoors": re.compile(
        r"\b(?:parks?|gardens?|botanical|nature|outdoor|outdoors|hike|hiking|lakes?|forests?|picnic|green)\b",
        re.IGNORECASE,
    ),
    "architecture": re.compile(
        r"\b(?:architecture|architectural|facades?|bridges?|gothic|baroque|modernist|cathedrals?|palaces?|towers?|skyline|buildings?)\b",
        re.IGNORECASE,
    ),
    "food_culinary": re.compile(
        r"\b(?:food|foodie|culinary|gastronomy|cuisine|dishes?|restaurants?|bistros?|tasting|dining|dinner|eat|tapas|ramen|sushi|curry|pasta|seafood|pastries|markets?)\b",
        re.IGNORECASE,
    ),
    "nightlife": re.compile(
        r"\b(?:nightlife|bars?|pubs?|clubs?|clubbing|cocktail|speakeasy|lounges?|jazz|late[- ]night|izakaya)\b",
        re.IGNORECASE,
    ),
    "shopping": re.compile(
        r"\b(?:shopping|shops?|boutiques?|markets?|bazaars?|malls?|souvenirs?|antiques?|vintage|craft)\b",
        re.IGNORECASE,
    ),
    "scenic_views": re.compile(
        r"\b(?:scenic|views?|viewpoints?|mirador(?:es)?|miradouros?|panoramic|panorama|sunset|rooftop|horizon|skyline|overlooking|observation)\b",
        re.IGNORECASE,
    ),
}

_TAG_TASTE_LABELS: dict[str, list[str]] = {
    "art_culture": ["art", "cultural"],
    "history_heritage": ["historic", "heritage"],
    "nature_outdoors": ["nature", "outdoor"],
    "architecture": ["architecture"],
    "food_culinary": ["food", "culinary"],
    "nightlife": ["bar", "nightlife"],
    "shopping": ["shopping"],
    "scenic_views": ["scenic"],
}

_VIBE_TASTE_WORDS = (
    "relaxed",
    "relaxing",
    "calm",
    "quiet",
    "peaceful",
    "romantic",
    "lively",
    "vibrant",
    "cultural",
    "art",
    "bar",
    "historic",
    "outdoor",
    "scenic",
)


def _normalize_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = re.sub(r"[^\w\s-]", " ", ascii_only.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


class PromptIntentExtractor:
    """Deterministic, LLM-free prompt analyzer using ONNX 768D embeddings and DB catalogs."""

    _city_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
    _city_cache_ttl: float = 600.0
    _anchor_embeddings: dict[str, list[float]] | None = None
    _anchor_lock = asyncio.Lock()
    _embed_provider: OnnxEmbeddingProvider | None = None

    @classmethod
    def _get_embedder(cls) -> OnnxEmbeddingProvider:
        if cls._embed_provider is None:
            cls._embed_provider = OnnxEmbeddingProvider()
        return cls._embed_provider

    @classmethod
    async def _get_anchor_embeddings(cls) -> dict[str, list[float]]:
        if cls._anchor_embeddings is not None:
            return cls._anchor_embeddings
        async with cls._anchor_lock:
            if cls._anchor_embeddings is not None:
                return cls._anchor_embeddings
            provider = cls._get_embedder()
            tags = list(CATEGORY_ANCHORS.keys())
            texts = [CATEGORY_ANCHORS[t] for t in tags]
            vecs = await provider.embed_batch(texts, input_type="query")
            cls._anchor_embeddings = {t: v for t, v in zip(tags, vecs)}
            return cls._anchor_embeddings

    @classmethod
    async def _load_city_catalog(
        cls,
        destination_city: str,
        state: dict[str, Any] | None = None,
        candidate_pois: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        if candidate_pois is not None:
            return candidate_pois

        if state:
            for key in ("city_pois", "daily_pois_data", "test_data"):
                raw = state.get(key)
                if isinstance(raw, list) and raw:
                    flattened: list[dict[str, Any]] = []
                    for item in raw:
                        if isinstance(item, list):
                            flattened.extend(x for x in item if isinstance(x, dict))
                        elif isinstance(item, dict):
                            flattened.append(item)
                    if flattened:
                        return flattened
                elif isinstance(raw, dict) and isinstance(raw.get("pois"), list):
                    return [x for x in raw["pois"] if isinstance(x, dict)]

        city_clean = (destination_city or "").strip()
        if not city_clean or city_clean.lower() == "unknown":
            return []

        cache_key = city_clean.lower()
        cached = cls._city_cache.get(cache_key)
        if cached and (time.monotonic() - cached[0]) < cls._city_cache_ttl:
            return cached[1]

        rows: list[dict[str, Any]] = []
        try:
            from sqlalchemy import func, select
            from app.db.models import AttractionModel
            from app.db.session import async_session

            async with async_session() as session:
                stmt = select(
                    AttractionModel.name,
                    AttractionModel.aliases,
                    AttractionModel.category,
                    AttractionModel.metadata_field,
                    AttractionModel.facets,
                ).where(func.lower(AttractionModel.city) == cache_key)
                res = await session.execute(stmt)
                for name, aliases, category, meta, facets in res.all():
                    meta_dict = meta if isinstance(meta, dict) else {}
                    tags_obj = meta_dict.get("tags")
                    cuisine = None
                    if isinstance(tags_obj, dict):
                        cuisine = tags_obj.get("cuisine")
                    elif isinstance(meta_dict.get("cuisine"), str):
                        cuisine = meta_dict.get("cuisine")
                    rows.append(
                        {
                            "name": name,
                            "aliases": list(aliases or []),
                            "category": category,
                            "cuisine": cuisine,
                            "tags": tags_obj or [],
                            "facets": facets or {},
                        }
                    )
        except Exception as exc:
            logger.debug("City catalog DB lookup skipped for '%s': %s", city_clean, exc)

        cls._city_cache[cache_key] = (time.monotonic(), rows)
        return rows

    @staticmethod
    def _extract_negated_segments(prompt: str) -> tuple[str, list[str]]:
        """Separates positive prompt text from negated spans."""
        negated_spans: list[str] = []
        positive_chars = list(prompt)

        for match in _NEGATION_RE.finditer(prompt):
            span_text = match.group(1).strip()
            # Stop negation span before contrast conjunctions like "just", "only", "instead"
            contrast_split = re.split(
                r"\b(?:just|only|instead)\b", span_text, maxsplit=1, flags=re.IGNORECASE
            )
            effective_span = contrast_split[0].strip()
            if effective_span:
                negated_spans.append(effective_span)
                start_idx = match.start(1)
                end_idx = start_idx + len(effective_span)
                for i in range(match.start(0), min(end_idx, len(positive_chars))):
                    positive_chars[i] = " "

        return "".join(positive_chars), negated_spans

    @staticmethod
    def _detect_negated_tags(negated_spans: list[str]) -> set[str]:
        negated: set[str] = set()
        for span in negated_spans:
            for tag in TAG_KEYS:
                if TAG_REGEX_MAP[tag].search(span) or _EXTRA_TAG_PATTERNS[tag].search(
                    span
                ):
                    negated.add(tag)
        return negated

    @staticmethod
    def _match_surface_in_text(
        surface: str,
        norm_text: str,
        words: list[str],
        has_trigger: bool,
    ) -> int | None:
        norm_surface = _normalize_text(surface)
        if not norm_surface or len(norm_surface) < 3:
            return None
        if norm_surface in _GENERIC_SINGLE_WORDS:
            return None

        # 1. Exact phrase / word-boundary match
        exact_m = re.search(rf"\b{re.escape(norm_surface)}\b", norm_text)
        if exact_m:
            return exact_m.start()

        # 2. Fuzzy n-gram window match for multi-word or long names (typos/variants)
        surface_words = norm_surface.split()
        k = len(surface_words)
        if not words or (k == 1 and len(norm_surface) < 5):
            return None

        threshold = 83 if has_trigger else 89
        best_pos: int | None = None
        best_score = 0.0

        for win_len in {max(1, k - 1), k, min(len(words), k + 1)}:
            if win_len > len(words):
                continue
            for idx in range(len(words) - win_len + 1):
                candidate_phrase = " ".join(words[idx : idx + win_len])
                if abs(len(candidate_phrase) - len(norm_surface)) > max(
                    4, len(norm_surface) // 2
                ):
                    continue
                score = fuzz.ratio(norm_surface, candidate_phrase)
                if score >= threshold and score > best_score:
                    best_score = score
                    pos = norm_text.find(candidate_phrase)
                    best_pos = pos if pos >= 0 else idx

        return best_pos

    @classmethod
    def _extract_mandatory_pois(
        cls,
        positive_prompt: str,
        negated_spans: list[str],
        destination_city: str,
        catalog: list[dict[str, Any]],
    ) -> list[str]:
        norm_positive = _normalize_text(positive_prompt)
        if not norm_positive:
            return []

        norm_negated = " ".join(_normalize_text(s) for s in negated_spans)
        pos_words = norm_positive.split()
        has_trigger = bool(_MANDATORY_TRIGGER_RE.search(positive_prompt))

        matched: list[tuple[int, str]] = []
        seen_names: set[str] = set()

        if catalog:
            for poi in catalog:
                canonical = str(poi.get("name") or "").strip()
                if not canonical or canonical.lower() in seen_names:
                    continue

                surfaces = [canonical] + [
                    str(a).strip() for a in (poi.get("aliases") or []) if a
                ]

                # Exclude if explicitly negated
                negated_hit = False
                for s in surfaces:
                    ns = _normalize_text(s)
                    if ns and ns not in _GENERIC_SINGLE_WORDS and norm_negated:
                        if re.search(rf"\b{re.escape(ns)}\b", norm_negated):
                            negated_hit = True
                            break
                if negated_hit:
                    continue

                # Check positive prompt match across canonical name & aliases
                best_pos: int | None = None
                for s in surfaces:
                    pos = cls._match_surface_in_text(
                        s, norm_positive, pos_words, has_trigger
                    )
                    if pos is not None and (best_pos is None or pos < best_pos):
                        best_pos = pos

                if best_pos is not None:
                    seen_names.add(canonical.lower())
                    matched.append((best_pos, canonical))

            matched.sort(key=lambda pair: pair[0])
            return [name for _, name in matched]

        # Fallback when city catalog is empty (e.g. offline unit tests without DB):
        # Extract explicitly named proper-noun entities directly following mandatory triggers.
        dest_norm = _normalize_text(destination_city)
        trigger_entity_re = re.compile(
            r"\b(?:must\s+(?:visit|see)|need\s+to\s+(?:visit|see)|have\s+to\s+(?:visit|see)|want\s+to\s+(?:visit|see)|visit)\s+"
            r"(?:the\s+)?([A-Z][A-Za-z0-9'’-]+(?:\s+(?:of|the|de|del|du|d'|and\s+the)?\s*[A-Z][A-Za-z0-9'’-]+){0,4})",
        )
        extracted: list[str] = []
        for m in trigger_entity_re.finditer(positive_prompt):
            chunk = m.group(1).strip()
            # Split "Louvre and Eiffel Tower" into separate candidates when joined by " and "
            parts = re.split(r"\s+and\s+", chunk)
            for part in parts:
                clean_part = part.strip(" .,;!?")
                if not clean_part:
                    continue
                if _normalize_text(clean_part) == dest_norm:
                    continue
                if clean_part.lower() not in seen_names:
                    seen_names.add(clean_part.lower())
                    extracted.append(clean_part)
        return extracted

    @classmethod
    def _extract_cuisines(
        cls,
        positive_prompt: str,
        catalog: list[dict[str, Any]],
    ) -> tuple[list[str], int]:
        vocab: set[str] = set(_FALLBACK_CUISINE_TERMS)
        for poi in catalog:
            c = poi.get("cuisine")
            if isinstance(c, str) and c.strip():
                for token in re.split(r"[,;/]", c.lower()):
                    t = token.strip()
                    if len(t) >= 3:
                        vocab.add(t)

        norm_prompt = _normalize_text(positive_prompt)
        found: list[tuple[int, str]] = []
        for cuisine in vocab:
            c_norm = _normalize_text(cuisine)
            if not c_norm:
                continue
            m = re.search(rf"\b{re.escape(c_norm)}\b", norm_prompt)
            if m:
                found.append((m.start(), cuisine.lower()))

        found.sort(key=lambda pair: pair[0])
        cuisines = list(dict.fromkeys(c for _, c in found))

        freq = 1
        if cuisines and _FREQUENCY_EMPHASIS_RE.search(positive_prompt):
            freq = 2
        return cuisines, freq

    @classmethod
    async def _compute_tag_affinities(
        cls,
        positive_prompt: str,
        negated_tags: set[str],
    ) -> dict[str, float]:
        if not positive_prompt.strip():
            return {tag: 0.10 if tag in negated_tags else 0.50 for tag in TAG_KEYS}

        # 1. Semantic 768D anchor projection
        sem_scores: dict[str, float] = {}
        try:
            anchors = await cls._get_anchor_embeddings()
            embedder = cls._get_embedder()
            v_prompt = await embedder.embed_text(positive_prompt, input_type="query")
            p_arr = SemanticLearningEngine.normalize_vector(v_prompt)
            raw_sims = {
                tag: float(
                    np.dot(p_arr, SemanticLearningEngine.normalize_vector(anchors[tag]))
                )
                for tag in TAG_KEYS
                if tag in anchors
            }
            if raw_sims:
                min_s = min(raw_sims.values())
                max_s = max(raw_sims.values())
                span = max(max_s - min_s, 1e-4)
                for tag in TAG_KEYS:
                    # Rescale relative semantic rank into [0.20, 0.80]
                    rel = (raw_sims.get(tag, min_s) - min_s) / span
                    sem_scores[tag] = 0.20 + 0.60 * rel
        except Exception as exc:
            logger.debug("ONNX anchor projection fallback to lexical: %s", exc)
            sem_scores = {tag: 0.30 for tag in TAG_KEYS}

        # 2. Lexical keyword boost from TAG_REGEX_MAP and _EXTRA_TAG_PATTERNS
        affinities: dict[str, float] = {}
        for tag in TAG_KEYS:
            if tag in negated_tags:
                affinities[tag] = 0.10
                continue

            base = sem_scores.get(tag, 0.30)
            hits = len(TAG_REGEX_MAP[tag].findall(positive_prompt)) + len(
                _EXTRA_TAG_PATTERNS[tag].findall(positive_prompt)
            )
            if hits > 0:
                boost = min(0.45, 0.22 + 0.10 * (hits - 1))
                score = min(0.98, max(base, 0.50) + boost * 0.65)
            else:
                score = base
            affinities[tag] = round(float(np.clip(score, 0.0, 1.0)), 2)

        return affinities

    @classmethod
    def _extract_travel_tastes(
        cls,
        positive_prompt: str,
        tag_affinities: dict[str, float],
        negated_tags: set[str],
        required_facets: dict[str, Any],
    ) -> list[str]:
        tastes: list[str] = []
        norm_prompt = _normalize_text(positive_prompt)

        for word in _VIBE_TASTE_WORDS:
            if re.search(rf"\b{re.escape(word)}\b", norm_prompt):
                if word == "bar" and "nightlife" in negated_tags:
                    continue
                if word == "art" and "art_culture" in negated_tags:
                    continue
                tastes.append(word)

        for theme in required_facets.get("themes") or []:
            if theme not in tastes:
                tastes.append(theme)

        for vibe in required_facets.get("vibes") or []:
            if vibe not in tastes:
                tastes.append(vibe)

        # Add top semantic tags (>= 0.65)
        ranked_tags = sorted(
            (
                (tag, val)
                for tag, val in tag_affinities.items()
                if val >= 0.65 and tag not in negated_tags
            ),
            key=lambda kv: kv[1],
            reverse=True,
        )
        for tag, _ in ranked_tags[:3]:
            for label in _TAG_TASTE_LABELS.get(tag, []):
                if label not in tastes:
                    tastes.append(label)

        return tastes

    @classmethod
    async def extract(
        cls,
        prompt: str,
        destination_city: str = "Unknown",
        user_language: str | None = None,
        state: dict[str, Any] | None = None,
        candidate_pois: list[dict[str, Any]] | None = None,
    ) -> RAGPromptAnalysis:
        """Extracts structured travel intent deterministically without any LLM."""
        if not prompt or not prompt.strip():
            return RAGPromptAnalysis()

        catalog = await cls._load_city_catalog(
            destination_city=destination_city,
            state=state,
            candidate_pois=candidate_pois,
        )

        positive_prompt, negated_spans = cls._extract_negated_segments(prompt)
        negated_tags = cls._detect_negated_tags(negated_spans)

        mandatory_pois = cls._extract_mandatory_pois(
            positive_prompt=positive_prompt,
            negated_spans=negated_spans,
            destination_city=destination_city,
            catalog=catalog,
        )

        preferred_cuisines, cuisine_freq = cls._extract_cuisines(
            positive_prompt=positive_prompt,
            catalog=catalog,
        )

        tag_affinities = await cls._compute_tag_affinities(
            positive_prompt=positive_prompt,
            negated_tags=negated_tags,
        )

        sq = QueryRewriter.rewrite_query(
            positive_prompt.strip() or prompt,
            destination_city="" if destination_city == "Unknown" else destination_city,
        )
        required_facets = dict(sq.required_facets)
        if sq.max_tier is not None and "max_tier" not in required_facets:
            required_facets["max_tier"] = sq.max_tier
        if sq.max_cost_eur is not None and "max_cost_eur" not in required_facets:
            required_facets["max_cost_eur"] = sq.max_cost_eur

        travel_tastes = cls._extract_travel_tastes(
            positive_prompt=positive_prompt,
            tag_affinities=tag_affinities,
            negated_tags=negated_tags,
            required_facets=required_facets,
        )

        return RAGPromptAnalysis(
            mandatory_pois=mandatory_pois,
            preferred_cuisines=preferred_cuisines,
            travel_tastes=travel_tastes,
            tag_affinities=tag_affinities,
            cuisine_target_frequency=cuisine_freq,
            semantic_subqueries=sq.semantic_subqueries,
            required_facets=required_facets,
        )
