"""Global City Identity and Key Normalization.

Implements the standard city_key = {ascii_slug}-{iso2}-{geonames_or_wikidata_id}
per PLAN.md Phase 0 (City Identity and Coverage Ledger).
Guarantees path safety, collision avoidance (e.g., Cordoba AR vs ES),
non-empty strings for non-Latin scripts, and process-independent stability.
"""

from __future__ import annotations

import hashlib
import logging
import re
import unicodedata
from typing import Any

logger = logging.getLogger(__name__)

# Cache for Geonames lookup to keep identity resolution <1ms
_GC_INSTANCE = None
_ALTERNATE_NAME_INDEX: dict[str, list[dict[str, Any]]] | None = None


def _get_geonamescache():
    global _GC_INSTANCE, _ALTERNATE_NAME_INDEX
    if _GC_INSTANCE is None:
        try:
            import geonamescache

            _GC_INSTANCE = geonamescache.GeonamesCache()
            # Build lowercase fast-lookup index over names and alternatenames
            alt_index: dict[str, list[dict[str, Any]]] = {}
            for city in _GC_INSTANCE.get_cities().values():
                # Primary name
                p_name = city["name"].strip().lower()
                alt_index.setdefault(p_name, []).append(city)
                # Alternate names
                for alt in city.get("alternatenames", []):
                    if alt:
                        alt_index.setdefault(alt.strip().lower(), []).append(city)
            _ALTERNATE_NAME_INDEX = alt_index
        except Exception as exc:
            logger.debug(f"geonamescache index could not be loaded: {exc}")
            _GC_INSTANCE = False
            _ALTERNATE_NAME_INDEX = {}
    return _GC_INSTANCE if _GC_INSTANCE is not False else None


def clean_ascii_slug(text: str) -> str:
    """Produces a clean [a-z0-9_-] slug from arbitrary text using NFKD normalization."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text.strip())
    ascii_text = nfkd.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return slug


def resolve_city_identity(
    name: str,
    country_code: str | None = None,
) -> tuple[str, str, int | None]:
    """Resolves arbitrary city name (including native scripts like 東京, Москва)

    and optional country code to (normalized_name, iso2_country, geonames_id).
    """
    raw_name = (name or "").strip()
    if not raw_name:
        return ("unknown", "XX", None)

    target_cc = country_code.strip().upper() if country_code else None

    # Check GeoNames index if available
    _get_geonamescache()
    if _ALTERNATE_NAME_INDEX:
        candidates = _ALTERNATE_NAME_INDEX.get(raw_name.lower())
        if not candidates and ("-" in raw_name or "_" in raw_name):
            candidates = _ALTERNATE_NAME_INDEX.get(
                raw_name.lower().replace("-", " ").replace("_", " ").strip()
            )
        if candidates:
            # Filter by country if supplied
            if target_cc:
                matched = [c for c in candidates if c.get("countrycode") == target_cc]
                if matched:
                    # Pick largest population
                    best = max(matched, key=lambda c: c.get("population", 0))
                    return (best["name"], best["countrycode"], int(best["geonameid"]))
            # If no country filter or no exact match with country, pick highest population candidate
            best = max(candidates, key=lambda c: c.get("population", 0))
            return (best["name"], best["countrycode"], int(best["geonameid"]))

    # Fallback to direct ASCII slug and provided/default country
    ascii_slug = clean_ascii_slug(raw_name)
    resolved_name = ascii_slug if ascii_slug else raw_name
    return (resolved_name, target_cc or "XX", None)


def generate_city_key(
    name: str,
    country_code: str | None = None,
    geonames_or_wikidata_id: str | int | None = None,
) -> str:
    """Generates a stable, collision-free, path-safe city key:

    {ascii_slug}-{iso2}-{geonames_or_wikidata_id}
    Ensures:
      1. Non-empty output for any Unicode input (e.g. 東京 -> tokyo-jp-1850147).
      2. No path traversal (no slashes, no '..', strictly [a-z0-9_-]).
      3. Disambiguates identical city names across countries or states (Cordoba AR vs ES).
      4. Deterministic and salt-free (stable across Python processes/PYTHONHASHSEED).
    """
    clean_name = (name or "").strip()
    iso2 = re.sub(r"[^A-Z0-9]", "", (country_code or "XX").strip().upper())[:2] or "XX"
    gid = str(geonames_or_wikidata_id).strip() if geonames_or_wikidata_id else None

    # If geonames id is not provided or name is non-Latin, resolve via identity lookup
    ascii_slug = clean_ascii_slug(clean_name)
    if not ascii_slug or not gid:
        resolved_name, resolved_cc, resolved_gid = resolve_city_identity(
            clean_name, country_code=iso2 if iso2 != "XX" else None
        )
        if not ascii_slug:
            ascii_slug = clean_ascii_slug(resolved_name)
        if iso2 == "XX" and resolved_cc != "XX":
            iso2 = resolved_cc
        if not gid and resolved_gid is not None:
            gid = str(resolved_gid)

    # If still no ascii slug (e.g. random non-Latin string outside GeoNames), use deterministic sha256
    if not ascii_slug:
        h = hashlib.sha256(clean_name.encode("utf-8")).hexdigest()[:8]
        ascii_slug = f"city-{h}"

    # If still no ID, create deterministic name+country fingerprint
    if not gid:
        raw_fingerprint = f"{clean_name.lower()}:{iso2.lower()}"
        gid = hashlib.sha256(raw_fingerprint.encode("utf-8")).hexdigest()[:8]

    clean_gid = re.sub(r"[^a-z0-9_-]", "", gid.lower())
    clean_iso2 = iso2.lower()

    key = f"{ascii_slug}-{clean_iso2}-{clean_gid}"
    # Final path-safety enforcement
    key = re.sub(r"[^a-z0-9_-]", "-", key).strip("-")
    while "--" in key:
        key = key.replace("--", "-")
    return key


LEGACY_ALIASES: dict[str, str] = {}


def normalize_to_canonical_city_key(city_input: str) -> str:
    """Normalizes any city input (legacy slug, raw city name, or city_key) to canonical city_key."""
    raw = (city_input or "").strip().lower()
    if not raw:
        return ""
    if raw in LEGACY_ALIASES:
        return LEGACY_ALIASES[raw]
    # Check if already a valid city_key pattern: {slug}-{iso2}-{id}
    parts = raw.split("-")
    if len(parts) >= 3 and len(parts[-2]) == 2 and parts[-1].isdigit():
        return raw
    return generate_city_key(raw)
