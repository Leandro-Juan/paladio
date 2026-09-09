import re
from typing import Any, Mapping


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

        # Build intro sentence
        if is_viewpoint:
            components.append(
                f"{name} is a scenic panoramic viewpoint, mirador, and observation spot{loc_str}."
            )
            components.append(
                "It offers sweeping horizons, elevated skyline vistas, and picturesque terrace lookouts."
            )
        elif is_religious:
            arch_note = (
                f" featuring magnificent {arch_style} architecture"
                if arch_style
                else " of monumental architecture"
            )
            components.append(
                f"{name} is a sacred historical cathedral, basilica, or church{loc_str}{arch_note}."
            )
            components.append(
                "It represents profound spiritual heritage, religious art, ancient stone carvings, and sacred history."
            )
        elif is_castle:
            components.append(
                f"{name} is an ancient historical fortress, castle, or monumental rampart{loc_str}."
            )
            components.append(
                "It boasts fortified walls, medieval stonework, ancient battlements, and historic defense heritage."
            )
        elif is_museum:
            components.append(
                f"{name} is an inspiring museum and cultural institution{loc_str}."
            )
            components.append(
                "It exhibits historic artifacts, fine art collections, cultural exhibitions, and educational heritage."
            )
        elif is_restaurant:
            cuisine_str = (
                f" specializing in authentic {cuisine.replace(';', ', ')} cuisine"
                if cuisine
                else " offering local culinary gastronomy"
            )
            components.append(
                f"{name} is a welcoming restaurant, cafe, or dining establishment{loc_str}{cuisine_str}."
            )
            components.append(
                "It features delicious food, traditional dishes, artisan drinks, and relaxed culinary ambiance."
            )
        elif is_park:
            components.append(
                f"{name} is a lush green park, botanical garden, and outdoor natural retreat{loc_str}."
            )
            components.append(
                "It provides tree-lined walking paths, natural landscape, flora, and a tranquil outdoor sanctuary."
            )
        else:
            components.append(
                f"{name} is a notable {category} and point of interest{loc_str}."
            )
            components.append(
                "It provides sightseeing, architectural interest, and cultural discovery."
            )

        # 2. Add extra details from tags if available
        if arch_style and not is_religious:
            components.append(
                f"The building displays distinctive {arch_style} architectural character."
            )

        if tags.get("wheelchair") in ("yes", "designated"):
            components.append("The attraction is wheelchair accessible.")

        if financials.get("is_free") or tags.get("fee") in ("no", "0"):
            components.append("Admission is free of charge to all visitors.")

        # Combine into cohesive narrative
        full_text = " ".join(components)
        # Normalize spaces
        full_text = re.sub(r"\s+", " ", full_text).strip()
        return full_text
