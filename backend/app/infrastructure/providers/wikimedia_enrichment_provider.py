"""Multi-Source Wikimedia Enrichment Provider.

Fetches structured claims and sitelinks from Wikidata, lead encyclopedic prose
from Wikipedia (EN + local fallback), and traveler tips/prices from Wikivoyage.
100% sovereign, zero cloud LLMs, fully compliant with Paladio air-gap guardrails.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "PaladioTravelSolver/1.0 (sovereign travel planner; contact@paladio.org)"


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _clean_wikipedia_prose(text: str) -> str:
    """Strips phonetic brackets, citation leftovers, and collapses whitespace."""
    if not text:
        return ""
    # Strip IPA phonetic pronunciations e.g. (/prɑːdoʊ/, Spanish: [muˈseo ðel ˈpɾaðo])
    cleaned = re.sub(r"\s*\([^\)]*[\u0250-\u02AF][^\)]*\)", "", text)
    # Strip lingering reference brackets e.g. [1], [note 2]
    cleaned = re.sub(r"\[(?:\d+|note\s*\d+)\]", "", cleaned)
    # Collapse whitespace
    cleaned = " ".join(cleaned.split())
    return cleaned.strip()


@dataclass
class WikidataEntitySummary:
    qid: str
    aliases: list[str] = field(default_factory=list)
    description: str | None = None
    claims: dict[str, Any] = field(default_factory=dict)
    sitelinks_count: int = 0
    enwiki_title: str | None = None
    localwiki_title: str | None = None
    official_website: str | None = None
    image_filename: str | None = None

    @property
    def sitelinks(self) -> int:
        return self.sitelinks_count

    @property
    def wikipedia_title(self) -> str | None:
        if self.enwiki_title:
            return self.enwiki_title
        if self.localwiki_title:
            return (
                self.localwiki_title.split(":", 1)[1]
                if ":" in self.localwiki_title
                else self.localwiki_title
            )
        return None


@dataclass
class WikivoyageListing:
    name: str
    alt: str | None = None
    wikidata_id: str | None = None
    lat: float | None = None
    lon: float | None = None
    hours: str | None = None
    price: str | None = None
    content: str | None = None


class WikimediaEnrichmentProvider:
    """Enriches POIs with authoritative Wikidata, Wikipedia, and Wikivoyage data."""

    @classmethod
    async def fetch_wikidata_batch(
        cls,
        qids: list[str],
        languages: list[str] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> dict[str, WikidataEntitySummary]:
        """Queries Wikidata wbgetentities in chunks of 50 IDs."""
        valid_qids = [
            q.strip().upper() for q in qids if re.match(r"^Q\d+$", q.strip().upper())
        ]

        if not valid_qids:
            return {}

        langs = languages or ["en", "es", "fr", "it", "pt", "de"]
        langs_str = "|".join(langs)
        results: dict[str, WikidataEntitySummary] = {}

        own_client = client is None
        client = client or httpx.AsyncClient(timeout=15.0)

        chunk_size = 50
        try:
            for i in range(0, len(valid_qids), chunk_size):
                chunk = valid_qids[i : i + chunk_size]
                params = {
                    "action": "wbgetentities",
                    "ids": "|".join(chunk),
                    "props": "labels|descriptions|claims|sitelinks",
                    "languages": langs_str,
                    "format": "json",
                }
                resp = await client.get(
                    "https://www.wikidata.org/w/api.php",
                    params=params,
                    headers={"User-Agent": USER_AGENT},
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                entities = data.get("entities", {})

                for qid, ent in entities.items():
                    if "missing" in ent:
                        continue
                    # Labels & aliases
                    labels_dict = ent.get("labels", {})
                    alias_candidates: list[str] = []
                    for lang in langs:
                        if lang in labels_dict and "value" in labels_dict[lang]:
                            val = labels_dict[lang]["value"].strip()
                            if val and val not in alias_candidates:
                                alias_candidates.append(val)

                    # Descriptions (prefer EN then local)
                    desc_dict = ent.get("descriptions", {})
                    best_desc: str | None = None
                    for lang in ["en", "es", "fr", "it", "pt", "de"]:
                        if lang in desc_dict and "value" in desc_dict[lang]:
                            best_desc = desc_dict[lang]["value"].strip()
                            if best_desc:
                                break

                    # Sitelinks
                    sitelinks = ent.get("sitelinks", {})
                    sitelinks_count = len(sitelinks)
                    enwiki = sitelinks.get("enwiki", {}).get("title")

                    # Claims: P31 (instance), P571 (inception), P84 (architect), P149 (style),
                    # P1435 (heritage), P856 (official website), P18 (image)
                    claims_raw = ent.get("claims", {})
                    extracted_claims: dict[str, Any] = {}

                    # P856 official website
                    website = None
                    if "P856" in claims_raw and claims_raw["P856"]:
                        mainsnak = claims_raw["P856"][0].get("mainsnak", {})
                        website = mainsnak.get("datavalue", {}).get("value")

                    # P18 image
                    image_name = None
                    if "P18" in claims_raw and claims_raw["P18"]:
                        mainsnak = claims_raw["P18"][0].get("mainsnak", {})
                        image_name = mainsnak.get("datavalue", {}).get("value")

                    # P571 inception
                    if "P571" in claims_raw and claims_raw["P571"]:
                        mainsnak = claims_raw["P571"][0].get("mainsnak", {})
                        val = mainsnak.get("datavalue", {}).get("value")
                        if isinstance(val, dict) and "time" in val:
                            extracted_claims["inception"] = val["time"]

                    # Heritage designation / UNESCO
                    unesco = False
                    if "P1435" in claims_raw:
                        unesco = any(
                            c.get("mainsnak", {})
                            .get("datavalue", {})
                            .get("value", {})
                            .get("id")
                            == "Q9259"
                            for c in claims_raw["P1435"]
                        )
                    extracted_claims["unesco"] = unesco

                    local_wiki: str | None = None
                    for lang in ["es", "fr", "it", "pt", "de"]:
                        key = f"{lang}wiki"
                        if key in sitelinks and "title" in sitelinks[key]:
                            local_wiki = f"{lang}:{sitelinks[key]['title']}"
                            break

                    results[qid] = WikidataEntitySummary(
                        qid=qid,
                        aliases=alias_candidates,
                        description=best_desc,
                        claims=extracted_claims,
                        sitelinks_count=sitelinks_count,
                        enwiki_title=enwiki,
                        localwiki_title=local_wiki,
                        official_website=website,
                        image_filename=image_name,
                    )
        except Exception as exc:
            logger.warning(f"Wikidata batch enrichment encountered error: {exc}")
        finally:
            if own_client:
                await client.aclose()

        return results

    @classmethod
    async def fetch_wikipedia_lead_extracts(
        cls,
        titles_by_lang: dict[str, list[str]] | list[str],
        client: httpx.AsyncClient | None = None,
    ) -> dict[str, str]:
        """Queries Wikipedia Action API for clean lead section extracts in batches of 20."""
        extracts: dict[str, str] = {}
        own_client = client is None
        client = client or httpx.AsyncClient(timeout=12.0)

        if isinstance(titles_by_lang, list):
            titles_by_lang = {"en": titles_by_lang, "es": titles_by_lang}

        try:
            for lang, titles in titles_by_lang.items():
                if not titles:
                    continue
                clean_titles = [t.strip() for t in titles if t and t.strip()]
                for i in range(0, len(clean_titles), 20):
                    batch = clean_titles[i : i + 20]
                    params = {
                        "action": "query",
                        "prop": "extracts",
                        "exintro": 1,
                        "explaintext": 1,
                        "exsentences": 3,
                        "titles": "|".join(batch),
                        "redirects": 1,
                        "format": "json",
                    }
                    api_url = f"https://{lang}.wikipedia.org/w/api.php"
                    resp = await client.get(
                        api_url,
                        params=params,
                        headers={"User-Agent": USER_AGENT},
                    )
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    pages = data.get("query", {}).get("pages", {})
                    for page_id, page in pages.items():
                        if "extract" in page and page["extract"]:
                            t = page.get("title")
                            clean_text = _clean_wikipedia_prose(page["extract"])
                            if t and clean_text:
                                extracts[f"{lang}:{t}"] = clean_text
                                if t not in extracts:
                                    extracts[t] = clean_text
        except Exception as exc:
            logger.warning(f"Wikipedia extracts fetch encountered error: {exc}")
        finally:
            if own_client:
                await client.aclose()

        return extracts

    @classmethod
    async def fetch_wikivoyage_listings(
        cls,
        city: str,
        languages: list[str] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> list[WikivoyageListing]:
        """Parses See, Do, Buy, Eat, Drink listing templates from Wikivoyage."""
        langs = languages or ["en", "es"]
        listings: list[WikivoyageListing] = []
        city_clean = city.split(",")[0].strip()

        own_client = client is None
        client = client or httpx.AsyncClient(timeout=15.0)

        template_regex = re.compile(
            r"\{\{\s*(see|do|buy|eat|drink|listing)\s*\|([^}]+)\}\}",
            re.IGNORECASE | re.DOTALL,
        )

        try:
            for lang in langs:
                api_url = f"https://{lang}.wikivoyage.org/w/api.php"
                resp = await client.get(
                    api_url,
                    params={
                        "action": "parse",
                        "page": city_clean,
                        "prop": "wikitext",
                        "format": "json",
                    },
                    headers={"User-Agent": USER_AGENT},
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")
                if not wikitext:
                    continue

                for match in template_regex.finditer(wikitext):
                    raw_params = match.group(2)
                    params: dict[str, str] = {}
                    for part in raw_params.split("|"):
                        if "=" in part:
                            k, v = part.split("=", 1)
                            params[k.strip().lower()] = v.strip()

                    name = params.get("name")
                    if not name:
                        continue

                    # Extract coordinates if present
                    lat, lon = None, None
                    try:
                        if params.get("lat"):
                            lat = float(params["lat"])
                        if params.get("long"):
                            lon = float(params["long"])
                    except ValueError:
                        pass

                    listings.append(
                        WikivoyageListing(
                            name=name,
                            alt=params.get("alt"),
                            wikidata_id=params.get("wikidata"),
                            lat=lat,
                            lon=lon,
                            hours=params.get("hours"),
                            price=params.get("price"),
                            content=params.get("content"),
                        )
                    )
        except Exception as exc:
            logger.warning(
                f"Wikivoyage listings fetch for {city} encountered error: {exc}"
            )
        finally:
            if own_client:
                await client.aclose()

        return listings

    @classmethod
    async def enrich_pois(
        cls,
        city_name: str,
        pois: list[dict[str, Any]],
        client: httpx.AsyncClient | None = None,
    ) -> list[dict[str, Any]]:
        """Orchestrates multi-source enrichment across Wikidata, Wikipedia, and Wikivoyage."""
        own_client = client is None
        client = client or httpx.AsyncClient(timeout=30.0)

        try:
            # 1. Collect QIDs
            qids_to_fetch = set()
            for p in pois:
                qid = (
                    p.get("wikidata_id")
                    or (p.get("metadata", {}).get("tags", {}) or {}).get("wikidata")
                    or (p.get("metadata", {}).get("osm", {}) or {}).get("wikidata")
                )
                if qid and re.match(r"^Q\d+$", str(qid).strip().upper()):
                    qids_to_fetch.add(str(qid).strip().upper())

            # 2. Batch Wikidata fetch
            wikidata_map = await cls.fetch_wikidata_batch(
                list(qids_to_fetch), client=client
            )

            # 3. Collect Wikipedia titles for lead extract fetch
            titles_en: list[str] = []
            titles_local: dict[str, list[str]] = {
                "es": [],
                "fr": [],
                "it": [],
                "pt": [],
                "de": [],
            }

            for qid, ent in wikidata_map.items():
                if ent.enwiki_title:
                    titles_en.append(ent.enwiki_title)
                if ent.localwiki_title and ":" in ent.localwiki_title:
                    l_lang, l_title = ent.localwiki_title.split(":", 1)
                    if l_lang in titles_local:
                        titles_local[l_lang].append(l_title)

            query_dict = {"en": titles_en}
            for l_lang, t_list in titles_local.items():
                if t_list:
                    query_dict[l_lang] = t_list

            wikipedia_extracts = await cls.fetch_wikipedia_lead_extracts(
                query_dict, client=client
            )

            # 4. Fetch Wikivoyage city guide listings
            wv_listings = await cls.fetch_wikivoyage_listings(city_name, client=client)

            # 5. Apply enrichments to POIs
            for p in pois:
                p_tags = p.get("metadata", {}).get("tags", {}) or {}
                qid = (
                    p.get("wikidata_id")
                    or p_tags.get("wikidata")
                    or (p.get("metadata", {}).get("osm", {}) or {}).get("wikidata")
                )
                qid_clean = str(qid).strip().upper() if qid else None

                ent = wikidata_map.get(qid_clean) if qid_clean else None
                if ent:
                    p["wikidata_id"] = ent.qid
                    p["sitelinks_count"] = ent.sitelinks_count
                    if ent.aliases:
                        existing_aliases = set(p.get("aliases") or [])
                        existing_aliases.update(ent.aliases)
                        p["aliases"] = list(existing_aliases)
                    if not p.get("website") and ent.official_website:
                        p["website"] = ent.official_website

                    # Check Wikipedia lead extract (prefer EN, fallback to local)
                    desc = None
                    desc_src = None
                    if (
                        ent.enwiki_title
                        and f"en:{ent.enwiki_title}" in wikipedia_extracts
                    ):
                        desc = wikipedia_extracts[f"en:{ent.enwiki_title}"]
                        desc_src = "wikipedia_en"
                    elif (
                        ent.localwiki_title
                        and ent.localwiki_title in wikipedia_extracts
                    ):
                        desc = wikipedia_extracts[ent.localwiki_title]
                        desc_src = "wikipedia_local"
                    elif ent.description:
                        desc = ent.description
                        desc_src = "wikidata"

                    if desc:
                        p["description"] = desc
                        p["description_source"] = desc_src

                # Match Wikivoyage listing
                p_name_norm = p["name"].strip().lower()
                p_lat = p.get("location", {}).get("latitude")
                p_lon = p.get("location", {}).get("longitude")

                matched_wv: WikivoyageListing | None = None
                for wv in wv_listings:
                    if (
                        qid_clean
                        and wv.wikidata_id
                        and wv.wikidata_id.upper() == qid_clean
                    ):
                        matched_wv = wv
                        break
                    if (
                        wv.name.strip().lower() == p_name_norm
                        and p_lat is not None
                        and p_lon is not None
                    ):
                        if wv.lat is not None and wv.lon is not None:
                            if _haversine_m(p_lat, p_lon, wv.lat, wv.lon) <= 250.0:
                                matched_wv = wv
                                break

                if matched_wv:
                    p["metadata"]["wikivoyage_matched"] = True
                    if matched_wv.content:
                        if not p.get("description"):
                            p["description"] = matched_wv.content
                            p["description_source"] = "wikivoyage"
                        elif p.get("description_source") == "wikidata":
                            p["description"] = (
                                f"{p['description']}. {matched_wv.content}"
                            )
                            p["description_source"] = "wikivoyage"
                    if matched_wv.price and not p.get("cost_eur"):
                        p["metadata"]["wikivoyage_price_raw"] = matched_wv.price
                    if matched_wv.hours and not p.get("osm_opening_hours"):
                        p["metadata"]["wikivoyage_hours_raw"] = matched_wv.hours

        finally:
            if own_client:
                await client.aclose()

        return pois

    # Convenience aliases
    resolve_wikidata_batch = fetch_wikidata_batch
    fetch_wikipedia_extracts = fetch_wikipedia_lead_extracts
