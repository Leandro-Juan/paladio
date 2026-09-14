import re
from collections.abc import Mapping
from typing import Any


class PoiNaturalLanguageSynthesizer:
    """
    Translates structured OpenStreetMap / Overpass POI attributes and tags
    into coherent, semantically rich natural language sentences for dense vector embedding.
    Solves the 'Overpass Problem' by transforming raw key-value pairs into semantic context.
    """

    @classmethod
    def synthesize_description(cls, poi_data: Mapping[str, Any]) -> str:
        """
        Synthesizes a descriptive paragraph for a POI dictionary or model.
        poi_data expects fields such as:
        - name: str
        - city: str
        - category: str
        - metadata: dict (with raw tags or openstreetmap attributes)
        - financials: dict (is_free, cost, etc.)
        """
        name = str(poi_data.get("name") or "Local attraction").strip()
        city = str(poi_data.get("city") or "").strip()
        category = str(poi_data.get("category") or "attraction").lower().strip()

        metadata = poi_data.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}

        tags = metadata.get("tags") or metadata or {}
        if not isinstance(tags, dict):
            tags = {}

        financials = poi_data.get("financials") or {}
        if not isinstance(financials, dict):
            financials = {}

        components: list[str] = []

        # 1. Base Identity & Location
        loc_str = f" in {city}" if city else ""

        # Check raw tags for finer granularity
        tourism = str(tags.get("tourism") or "").lower()
        historic = str(tags.get("historic") or "").lower()
        amenity = str(tags.get("amenity") or "").lower()
        building = str(tags.get("building") or "").lower()
        cuisine = str(tags.get("cuisine") or "").lower()
        leisure = str(tags.get("leisure") or "").lower()
        arch_style = str(
            tags.get("architecture") or tags.get("building:architecture") or ""
        ).lower()

        # Classify primary nature
        is_viewpoint = (
            "miradouro" in name.lower()
            or "viewpoint" in name.lower()
            or tourism == "viewpoint"
            or "belvedere" in name.lower()
        )
        is_religious = (
            building in ("cathedral", "church", "basilica", "chapel", "monastery")
            or historic in ("monastery", "church")
            or "cathedral" in name.lower()
            or "igreja" in name.lower()
        )
        is_castle = (
            historic in ("castle", "fort", "ruins")
            or "castelo" in name.lower()
            or "castle" in name.lower()
            or "fort" in name.lower()
        )
        is_museum = (
            category == "museum"
            or tourism == "museum"
            or "museum" in name.lower()
            or "museu" in name.lower()
            or "gallery" in name.lower()
        )
        is_restaurant = category == "restaurant" or amenity in (
            "restaurant",
            "cafe",
            "bistro",
            "pub",
            "bar",
        )
        is_park = (
            leisure in ("park", "garden")
            or "park" in name.lower()
            or "jardim" in name.lower()
            or "botanical" in name.lower()
        )

        # Build intro sentence based on verified tags
        if is_viewpoint:
            components.append(
                f"{name} is a scenic panoramic viewpoint, mirador, and observation spot{loc_str}."
            )
        elif is_religious:
            arch_note = f" featuring {arch_style} architecture" if arch_style else ""
            components.append(
                f"{name} is a historical cathedral, church, or sacred religious site{loc_str}{arch_note}."
            )
        elif is_castle:
            components.append(
                f"{name} is an ancient historical fortress, castle, or monumental rampart{loc_str}."
            )
        elif is_museum:
            components.append(f"{name} is a museum and cultural institution{loc_str}.")
        elif is_restaurant:
            cuisine_str = (
                f" specializing in authentic {cuisine.replace(';', ', ')} cuisine"
                if cuisine
                else ""
            )
            components.append(
                f"{name} is a restaurant, cafe, or dining establishment{loc_str}{cuisine_str}."
            )
        elif is_park:
            components.append(
                f"{name} is a park, botanical garden, and outdoor natural space{loc_str}."
            )
        else:
            components.append(f"{name} is a {category} and point of interest{loc_str}.")

        # 2. Add real description and verified metadata attributes if available
        raw_desc = (
            tags.get("description")
            or metadata.get("description")
            or poi_data.get("description")
        )
        if raw_desc and isinstance(raw_desc, str) and raw_desc.strip():
            components.append(raw_desc.strip())

        if arch_style and not is_religious:
            components.append(
                f"The building displays {arch_style} architectural character."
            )

        if tags.get("wheelchair") in ("yes", "designated"):
            components.append("The attraction is wheelchair accessible.")

        if financials.get("is_free") or tags.get("fee") in ("no", "0"):
            components.append("Admission is free of charge to all visitors.")

        # Real opening hours if present (do not fabricate fake opening hours when missing)
        opening_hours = tags.get("opening_hours") or metadata.get("osm_opening_hours")
        if opening_hours and isinstance(opening_hours, str) and opening_hours.strip():
            components.append(f"Opening hours: {opening_hours.strip()}.")

        # Combine into cohesive narrative
        full_text = " ".join(components)
        # Normalize spaces
        full_text = re.sub(r"\s+", " ", full_text).strip()
        return full_text
