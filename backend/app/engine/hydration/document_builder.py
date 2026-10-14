"""Versioned POI Document Builder for Paladio Itinerary Engine (VERSION = 2).

Transforms structured OpenStreetMap tags, Wikidata claims, Wikipedia extracts,
and facets into high-entropy, boilerplate-free, noise-free documents for dense vector embedding.

Rules:
1. Strict Anti-Boilerplate: No generic filler phrases ("is a notable landmark", "visitors can explore").
2. Strict Noise Exclusion: No numeric prices or opening hours (those belong in SQL filters).
3. Deterministic token budget (100-220 tokens).
"""

import hashlib
import re
from typing import Any

DOCUMENT_VERSION = 2


class PoiDocumentBuilder:
    """Builds deterministic, dense, semantic embedding texts for POIs."""

    VERSION = DOCUMENT_VERSION

    @classmethod
    def compute_hash(cls, text: str, version: int = VERSION) -> str:
        """Computes SHA-256 hex digest for versioned embedding text."""
        payload = f"v{version}:{text.strip()}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @classmethod
    def needs_reembedding(
        cls,
        poi: Any,
        current_model: str = "nomic-embed-text",
    ) -> bool:
        """Determines whether a POI requires (re-)embedding."""
        emb = (
            poi.get("embedding")
            if isinstance(poi, dict)
            else getattr(poi, "embedding", None)
        )
        if not emb:
            return True

        emb_hash = (
            poi.get("embedding_text_hash")
            if isinstance(poi, dict)
            else getattr(poi, "embedding_text_hash", None)
        )
        computed_text = cls.build_document(poi)
        computed_hash = cls.compute_hash(computed_text)
        if emb_hash != computed_hash:
            return True

        emb_model = (
            poi.get("embedding_model")
            if isinstance(poi, dict)
            else getattr(poi, "embedding_model", None)
        )
        if emb_model and emb_model != current_model:
            return True

        emb_ver = (
            poi.get("embedding_version")
            if isinstance(poi, dict)
            else getattr(poi, "embedding_version", 0)
        )
        if emb_ver < cls.VERSION:
            return True

        return False

    @classmethod
    def _duration_bucket(cls, mins: int) -> str:
        if mins <= 45:
            return "30-45 min"
        if mins <= 90:
            return "1-1.5 hours"
        if mins <= 150:
            return "2-2.5 hours"
        return "half day (3+ hours)"

    @classmethod
    def _price_tier_label(cls, is_free: bool, cost: float) -> str:
        if is_free or cost <= 0.0:
            return "free admission"
        if cost <= 10.0:
            return "budget"
        if cost <= 25.0:
            return "mid-range"
        return "premium"

    @classmethod
    def build_document(cls, poi_data: Any) -> str:
        """
        Builds a deterministic document matching the template:
        {name} ({aliases_joined}) — {specific_subtypes} in {neighborhood}, {city}.
        {grounded_description}
        Style & Era: {architectural_style}, {historic_era_or_inception}, designed by {architect}, {unesco_or_heritage_badge}.
        Cuisine & Menu: {cuisines_joined}; {specialty_tags}; dietary: {dietary_options}.
        Themes & Vibe: {facets.themes}; {facets.vibes}.
        Good for: {facets.audience}; {facets.time_of_day}; {indoor_outdoor_label}; {rain_friendly_label}; {free_or_paid_tier_label}; typical visit {duration_bucket}.
        """

        # Extract fields safely whether dict or domain Poi entity
        def get_field(k: str, default: Any = None) -> Any:
            if isinstance(poi_data, dict):
                return poi_data.get(k, default)
            return getattr(poi_data, k, default)

        name = str(get_field("name") or "Attraction").strip()
        city = str(get_field("city") or "").strip()
        category = str(get_field("category") or "attraction").strip().lower()

        aliases = get_field("aliases") or []
        if isinstance(aliases, (list, tuple)):
            clean_aliases = [
                str(a).strip()
                for a in aliases
                if str(a).strip() and str(a).strip().lower() != name.lower()
            ]
        else:
            clean_aliases = []

        neighborhood = get_field("neighborhood")
        metadata = get_field("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        tags = (
            metadata.get("tags")
            or metadata.get("osm")
            or get_field("metadata_field")
            or {}
        )
        if not isinstance(tags, dict):
            tags = {}

        facets = get_field("facets") or {}
        if not isinstance(facets, dict):
            facets = {}

        # 1. First line: Identity, sub-type, neighborhood, city
        subtypes = []
        for key in ("tourism", "historic", "amenity", "leisure", "building"):
            val = tags.get(key)
            if val and val not in ("yes", "no", category):
                subtypes.append(val.replace("_", " "))
        if not subtypes:
            subtypes.append(category.replace("_", " "))

        subtypes_str = ", ".join(dict.fromkeys(subtypes))
        aliases_part = f" ({', '.join(clean_aliases[:3])})" if clean_aliases else ""
        loc_parts = []
        if neighborhood:
            loc_parts.append(str(neighborhood))
        if city:
            loc_parts.append(city)
        loc_str = f" in {', '.join(loc_parts)}" if loc_parts else ""

        line1 = f"{name}{aliases_part} — {subtypes_str}{loc_str}."

        lines = [line1]

        # 2. Grounded description
        raw_desc = (
            get_field("description")
            or tags.get("description")
            or metadata.get("description")
        )
        if raw_desc and isinstance(raw_desc, str) and raw_desc.strip():
            # Clean noise & anti-boilerplate filters
            clean_desc = raw_desc.strip()
            # Strip numeric prices or opening hours if present
            clean_desc = re.sub(
                r"\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b", "", clean_desc
            )
            clean_desc = re.sub(
                r"\b\d+(\.\d{1,2})?\s*(EUR|€|\$|GBP|USD)\b",
                "",
                clean_desc,
                flags=re.IGNORECASE,
            )
            clean_desc = re.sub(
                r"is a (notable|historic|famous)?\s*(landmark|point of interest|attraction) in",
                "",
                clean_desc,
                flags=re.IGNORECASE,
            )
            clean_desc = re.sub(r"\s+", " ", clean_desc).strip()
            if len(clean_desc) > 20:
                lines.append(clean_desc)

        # 3. Style & Era
        style_parts = []
        arch_style = (
            tags.get("architecture")
            or tags.get("building:architecture")
            or tags.get("style")
        )
        if arch_style:
            style_parts.append(f"{arch_style.replace('_', ' ')} style")
        start_date = tags.get("start_date") or tags.get("inception")
        if start_date:
            style_parts.append(f"founded {start_date}")
        architect = tags.get("architect") or tags.get("designer")
        if architect:
            style_parts.append(f"designed by {architect}")
        heritage = tags.get("heritage") or tags.get("heritage:operator")
        unesco = (
            tags.get("heritage:website")
            or "unesco" in str(tags.get("heritage", "")).lower()
        )
        if unesco:
            style_parts.append("UNESCO World Heritage")
        elif heritage:
            style_parts.append(f"heritage site ({heritage})")

        if style_parts:
            lines.append(f"Style & Era: {', '.join(style_parts)}.")

        # 4. Cuisine & Menu (for dining / cafes)
        cuisine_parts = []
        cuisines = (
            facets.get("cuisines") or tags.get("cuisine") or metadata.get("cuisine")
        )
        if cuisines:
            if isinstance(cuisines, list):
                c_str = ", ".join(cuisines)
            else:
                c_str = str(cuisines).replace(";", ", ")
            cuisine_parts.append(c_str)

        dietary = facets.get("dietary")
        if not dietary:
            diet_keys = [
                k.replace("diet:", "")
                for k, v in tags.items()
                if k.startswith("diet:") and v == "yes"
            ]
            if diet_keys:
                dietary = diet_keys
        if dietary:
            if isinstance(dietary, list):
                d_str = ", ".join(dietary)
            else:
                d_str = str(dietary)
            cuisine_parts.append(f"dietary: {d_str}")

        specialties = tags.get("specialty") or tags.get("brewery")
        if specialties:
            cuisine_parts.append(f"specialties: {specialties}")

        if cuisine_parts:
            lines.append(f"Cuisine & Menu: {'; '.join(cuisine_parts)}.")

        # 5. Themes & Vibe
        tv_parts = []
        themes = facets.get("themes")
        if themes:
            th_str = ", ".join(themes) if isinstance(themes, list) else str(themes)
            tv_parts.append(f"Themes: {th_str.replace('_', ' ')}")
        vibes = facets.get("vibes")
        if vibes:
            vb_str = ", ".join(vibes) if isinstance(vibes, list) else str(vibes)
            tv_parts.append(f"Vibes: {vb_str.replace('_', ' ')}")

        if tv_parts:
            lines.append(f"Themes & Vibe: {'; '.join(tv_parts)}.")

        # 6. Good for & Practical contexts
        good_for = []
        audience = facets.get("audience")
        if audience:
            aud_str = (
                ", ".join(audience) if isinstance(audience, list) else str(audience)
            )
            good_for.append(aud_str.replace("_", " "))

        time_of_day = facets.get("time_of_day")
        if time_of_day:
            tod_str = (
                ", ".join(time_of_day)
                if isinstance(time_of_day, list)
                else str(time_of_day)
            )
            good_for.append(tod_str.replace("_", " "))

        indoor_outdoor = facets.get("indoor_outdoor")
        if indoor_outdoor:
            good_for.append(indoor_outdoor)

        rain_friendly = facets.get("rain_friendly")
        if rain_friendly is True:
            good_for.append("rain-friendly")

        is_free = bool(get_field("is_free", False))
        cost = float(get_field("cost_eur", 0.0) or 0.0)
        tier_label = cls._price_tier_label(is_free, cost)
        good_for.append(tier_label)

        duration = int(get_field("duration_mins", 60) or 60)
        good_for.append(f"typical visit {cls._duration_bucket(duration)}")

        if good_for:
            lines.append(f"Good for: {'; '.join(good_for)}.")

        doc = "\n".join(lines).strip()
        # Collapse excessive whitespace
        doc = re.sub(r"[ \t]+", " ", doc)
        doc = re.sub(r"\n+", "\n", doc)
        return doc
