from __future__ import annotations

import csv
import io
import json
import logging
import math
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.taste.taste_service import TasteService
from app.db.models import (
    AttractionModel,
    TripCollectionItemModel,
    TripCollectionModel,
    UserModel,
)
from app.infrastructure.providers.onnx_embedding_provider import (
    EmbeddingProviderError,
    OnnxEmbeddingProvider,
)

logger = logging.getLogger(__name__)


@dataclass
class ImportedPlaceCandidate:
    name: str
    lat: float
    lon: float
    description: str = ""
    category: str = "attraction"
    address: str | None = None
    city: str | None = None
    source_format: str = "import"


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _valid_coords(lat: float, lon: float) -> bool:
    return (
        math.isfinite(lat)
        and math.isfinite(lon)
        and -90.0 <= lat <= 90.0
        and -180.0 <= lon <= 180.0
        and not (lat == 0.0 and lon == 0.0)
    )


def _strip_xml_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _child_text(elem: ET.Element, target: str) -> str:
    for child in elem:
        if _strip_xml_ns(child.tag).lower() == target.lower() and child.text:
            return child.text.strip()
    return ""


def _normalize_category(raw: str | None) -> str:
    val = (raw or "").strip().lower()
    if any(
        k in val for k in ("restaurant", "food", "dining", "ramen", "sushi", "pizza")
    ):
        return "restaurant"
    if any(k in val for k in ("cafe", "coffee", "bakery", "tea")):
        return "cafe"
    if any(k in val for k in ("bar", "pub", "nightlife", "club")):
        return "bar"
    if any(k in val for k in ("hotel", "lodging", "hostel", "stay")):
        return "hotel"
    if any(k in val for k in ("museum", "gallery", "art")):
        return "museum"
    if any(
        k in val for k in ("park", "garden", "nature", "trail", "viewpoint", "peak")
    ):
        return "park"
    if any(k in val for k in ("shop", "market", "store", "mall")):
        return "shopping"
    if any(k in val for k in ("station", "transit", "airport", "train", "metro")):
        return "transit"
    return "attraction"


def parse_gpx(content: bytes) -> list[ImportedPlaceCandidate]:
    """Parses GPX 1.0/1.1 waypoints (<wpt>), route points (<rtept>), and named track points (<trkpt>)."""
    root = ET.fromstring(content)
    places: list[ImportedPlaceCandidate] = []
    seen: set[tuple[str, float, float]] = set()

    for elem in root.iter():
        tag = _strip_xml_ns(elem.tag).lower()
        if tag not in ("wpt", "rtept", "trkpt"):
            continue
        raw_lat = elem.attrib.get("lat")
        raw_lon = elem.attrib.get("lon")
        if raw_lat is None or raw_lon is None:
            continue
        try:
            lat = float(raw_lat)
            lon = float(raw_lon)
        except ValueError:
            continue
        if not _valid_coords(lat, lon):
            continue

        name = _child_text(elem, "name")
        if tag == "trkpt" and not name:
            continue
        if not name:
            name = f"Waypoint ({lat:.4f}, {lon:.4f})"
        desc = _child_text(elem, "desc") or _child_text(elem, "cmt")
        cat = _normalize_category(_child_text(elem, "type") or _child_text(elem, "sym"))

        key = (name.lower(), round(lat, 5), round(lon, 5))
        if key in seen:
            continue
        seen.add(key)
        places.append(
            ImportedPlaceCandidate(
                name=name,
                lat=lat,
                lon=lon,
                description=desc,
                category=cat,
                source_format="gpx",
            )
        )
    return places


def parse_kml_or_kmz(
    content: bytes, is_kmz: bool = False
) -> list[ImportedPlaceCandidate]:
    """Parses KML or zipped KMZ Placemarks into ImportedPlaceCandidate records."""
    kml_payloads: list[bytes] = []
    if is_kmz or content.startswith(b"PK\x03\x04"):
        with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
            for member in zf.namelist():
                if member.lower().endswith(".kml"):
                    kml_payloads.append(zf.read(member))
    else:
        kml_payloads.append(content)

    places: list[ImportedPlaceCandidate] = []
    seen: set[tuple[str, float, float]] = set()

    for kml_bytes in kml_payloads:
        root = ET.fromstring(kml_bytes)
        for elem in root.iter():
            if _strip_xml_ns(elem.tag).lower() != "placemark":
                continue
            name = _child_text(elem, "name")
            desc = _child_text(elem, "description")
            address = _child_text(elem, "address") or None

            coord_text = ""
            for sub in elem.iter():
                if _strip_xml_ns(sub.tag).lower() == "coordinates" and sub.text:
                    coord_text = sub.text.strip()
                    break
            if not coord_text:
                continue

            first_tuple = coord_text.split()[0]
            parts = first_tuple.split(",")
            if len(parts) < 2:
                continue
            try:
                lon = float(parts[0])
                lat = float(parts[1])
            except ValueError:
                continue
            if not _valid_coords(lat, lon):
                continue

            clean_name = name or f"Placemark ({lat:.4f}, {lon:.4f})"
            clean_desc = re.sub(r"<[^>]+>", " ", desc).strip()
            key = (clean_name.lower(), round(lat, 5), round(lon, 5))
            if key in seen:
                continue
            seen.add(key)

            places.append(
                ImportedPlaceCandidate(
                    name=clean_name,
                    lat=lat,
                    lon=lon,
                    description=clean_desc,
                    category=_normalize_category(clean_desc),
                    address=address,
                    source_format="kmz" if is_kmz else "kml",
                )
            )
    return places


def _extract_coords_from_google_url(url: str) -> tuple[float, float, str | None] | None:
    """Extracts (lat, lon, optional_place_name) from a Google Maps place or directions URL."""
    url = url.strip()
    if not url:
        return None
    parsed = urlparse(url)

    place_name: str | None = None
    place_match = re.search(r"/maps/place/([^/@?]+)", parsed.path)
    if place_match:
        place_name = unquote(place_match.group(1)).replace("+", " ").strip()

    # Pattern 1: !3d<lat>!4d<lon> (exact pin coordinate)
    exact_m = re.search(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)", url)
    if exact_m:
        lat, lon = float(exact_m.group(1)), float(exact_m.group(2))
        if _valid_coords(lat, lon):
            return lat, lon, place_name

    # Pattern 2: @<lat>,<lon>
    at_m = re.search(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", url)
    if at_m:
        lat, lon = float(at_m.group(1)), float(at_m.group(2))
        if _valid_coords(lat, lon):
            return lat, lon, place_name

    # Pattern 3: ?q=<lat>,<lon> or ?ll=<lat>,<lon>
    qs = parse_qs(parsed.query)
    for key in ("q", "ll", "query", "destination"):
        for val in qs.get(key, []):
            coord_m = re.match(
                r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", val
            )
            if coord_m:
                lat, lon = float(coord_m.group(1)), float(coord_m.group(2))
                if _valid_coords(lat, lon):
                    return lat, lon, place_name

    return None


def parse_google_maps_urls(urls: list[str]) -> list[ImportedPlaceCandidate]:
    """Parses Google Maps place and directions URLs into place candidates."""
    places: list[ImportedPlaceCandidate] = []
    seen: set[tuple[str, float, float]] = set()

    for raw_url in urls:
        url = raw_url.strip()
        if not url:
            continue

        # Handle /maps/dir/<stop1>/<stop2>/... with coordinate segments
        if "/maps/dir/" in url:
            parsed = urlparse(url)
            segments = [
                unquote(s).replace("+", " ").strip()
                for s in parsed.path.split("/")
                if s
            ]
            dir_coords: list[tuple[float, float, str]] = []
            for seg in segments:
                if (
                    seg in ("maps", "dir")
                    or seg.startswith("@")
                    or seg.startswith("data=")
                ):
                    continue
                coord_m = re.match(
                    r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", seg
                )
                if coord_m:
                    lat, lon = float(coord_m.group(1)), float(coord_m.group(2))
                    if _valid_coords(lat, lon):
                        dir_coords.append(
                            (lat, lon, f"Route Stop ({lat:.4f}, {lon:.4f})")
                        )
            if dir_coords:
                for lat, lon, name in dir_coords:
                    key = (name.lower(), round(lat, 5), round(lon, 5))
                    if key not in seen:
                        seen.add(key)
                        places.append(
                            ImportedPlaceCandidate(
                                name=name,
                                lat=lat,
                                lon=lon,
                                source_format="google_maps_url",
                            )
                        )
                continue

        extracted = _extract_coords_from_google_url(url)
        if not extracted:
            continue
        lat, lon, place_name = extracted
        name = place_name or f"Google Maps Pin ({lat:.4f}, {lon:.4f})"
        key = (name.lower(), round(lat, 5), round(lon, 5))
        if key in seen:
            continue
        seen.add(key)
        places.append(
            ImportedPlaceCandidate(
                name=name,
                lat=lat,
                lon=lon,
                source_format="google_maps_url",
            )
        )
    return places


def parse_google_takeout_or_json(
    content: bytes, filename: str
) -> list[ImportedPlaceCandidate]:
    """Parses Google Takeout GeoJSON (Saved Places.json) or Takeout CSV lists."""
    lower_name = filename.lower()
    if lower_name.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        places: list[ImportedPlaceCandidate] = []
        for row in reader:
            norm_row = {
                str(k).strip().lower(): (v or "").strip() for k, v in row.items() if k
            }
            if None in row and isinstance(row[None], list) and reader.fieldnames:
                last_key = str(reader.fieldnames[-1]).strip().lower()
                extra = ",".join(str(x).strip() for x in row[None] if x is not None)
                if extra:
                    norm_row[last_key] = f"{norm_row.get(last_key, '')},{extra}".strip(
                        ","
                    )
            title = (
                norm_row.get("title")
                or norm_row.get("name")
                or norm_row.get("place")
                or ""
            )
            note = (
                norm_row.get("note")
                or norm_row.get("comment")
                or norm_row.get("description")
                or ""
            )
            url = norm_row.get("url") or norm_row.get("google maps url") or ""
            lat_str = norm_row.get("latitude") or norm_row.get("lat") or ""
            lon_str = (
                norm_row.get("longitude")
                or norm_row.get("lon")
                or norm_row.get("lng")
                or ""
            )

            lat: float | None = None
            lon: float | None = None
            if lat_str and lon_str:
                try:
                    lat, lon = float(lat_str), float(lon_str)
                except ValueError:
                    lat, lon = None, None
            if (lat is None or lon is None) and url:
                extracted = _extract_coords_from_google_url(url)
                if extracted:
                    lat, lon, url_name = extracted
                    if not title and url_name:
                        title = url_name

            if lat is not None and lon is not None and _valid_coords(lat, lon):
                places.append(
                    ImportedPlaceCandidate(
                        name=title or f"Saved Place ({lat:.4f}, {lon:.4f})",
                        lat=lat,
                        lon=lon,
                        description=note,
                        category=_normalize_category(note or norm_row.get("category")),
                        source_format="google_takeout_csv",
                    )
                )
        return places

    # GeoJSON FeatureCollection (Google Takeout Saved Places.json)
    data = json.loads(content.decode("utf-8"))
    features = (
        data.get("features", [])
        if isinstance(data, dict)
        else (data if isinstance(data, list) else [])
    )
    places = []
    for feat in features:
        if not isinstance(feat, dict):
            continue
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") if isinstance(geom, dict) else None
        props = (
            feat.get("properties") if isinstance(feat.get("properties"), dict) else feat
        )
        loc = props.get("location") or props.get("Location") or {}

        lon: float | None = None
        lat: float | None = None
        if isinstance(coords, list) and len(coords) >= 2:
            try:
                lon = float(coords[0])
                lat = float(coords[1])
            except (ValueError, TypeError):
                lon, lat = None, None
        if (lat is None or lon is None) and isinstance(loc, dict):
            geo = loc.get("Geo Coordinates") or loc
            try:
                lat = float(
                    geo.get("Latitude") or geo.get("latitude") or geo.get("lat")
                )
                lon = float(
                    geo.get("Longitude") or geo.get("longitude") or geo.get("lon")
                )
            except (ValueError, TypeError):
                lat, lon = None, None

        if lat is None or lon is None or not _valid_coords(lat, lon):
            maps_url = str(
                props.get("Google Maps URL")
                or props.get("google_maps_url")
                or props.get("url")
                or ""
            )
            if maps_url:
                extracted = _extract_coords_from_google_url(maps_url)
                if extracted:
                    lat, lon, _ = extracted

        if lat is None or lon is None or not _valid_coords(lat, lon):
            continue

        title = (
            props.get("Title")
            or props.get("title")
            or props.get("name")
            or (loc.get("Business Name") if isinstance(loc, dict) else None)
            or f"Saved Place ({lat:.4f}, {lon:.4f})"
        )
        address = (
            (loc.get("Address") if isinstance(loc, dict) else None)
            or props.get("address")
            or None
        )
        desc = str(
            props.get("Comment") or props.get("Note") or props.get("description") or ""
        )
        places.append(
            ImportedPlaceCandidate(
                name=str(title).strip(),
                lat=lat,
                lon=lon,
                description=desc,
                category=_normalize_category(str(props.get("category") or desc)),
                address=str(address) if address else None,
                source_format="google_takeout_json",
            )
        )
    return places


def parse_place_import_payload(
    content: bytes | None = None,
    filename: str | None = None,
    urls_text: str | None = None,
) -> list[ImportedPlaceCandidate]:
    """Unified dispatcher for GPX, KML, KMZ, Google Takeout JSON/CSV, and Google Maps URLs."""
    candidates: list[ImportedPlaceCandidate] = []
    if content:
        fname = (filename or "").lower()
        if fname.endswith(".gpx") or b"<gpx" in content[:1024].lower():
            candidates.extend(parse_gpx(content))
        elif fname.endswith(".kmz") or content.startswith(b"PK\x03\x04"):
            candidates.extend(parse_kml_or_kmz(content, is_kmz=True))
        elif fname.endswith(".kml") or b"<kml" in content[:1024].lower():
            candidates.extend(parse_kml_or_kmz(content, is_kmz=False))
        elif (
            fname.endswith(".json")
            or fname.endswith(".geojson")
            or fname.endswith(".csv")
        ):
            candidates.extend(parse_google_takeout_or_json(content, fname))
        else:
            # Try JSON then XML fallback
            stripped = content.lstrip()
            if stripped.startswith(b"{") or stripped.startswith(b"["):
                candidates.extend(parse_google_takeout_or_json(content, "import.json"))
            else:
                raise ValueError(
                    "Unsupported file format. Upload .gpx, .kml, .kmz, .json/.geojson, or .csv."
                )

    if urls_text and urls_text.strip():
        urls = [
            line.strip() for line in re.split(r"[\r\n]+", urls_text) if line.strip()
        ]
        candidates.extend(parse_google_maps_urls(urls))

    return candidates


async def import_places_to_collection(
    session: AsyncSession,
    collection: TripCollectionModel,
    candidates: list[ImportedPlaceCandidate],
    user: UserModel | None = None,
    default_city: str | None = None,
) -> dict[str, Any]:
    """
    Deduplicates imported places against existing AttractionModel records, computes
    768-dim pgvector embeddings for new POIs via OnnxEmbeddingProvider, and adds all
    resolved POIs to the target collection.
    """
    if not candidates:
        return {
            "imported_count": 0,
            "created_pois_count": 0,
            "matched_existing_count": 0,
            "poi_ids": [],
        }

    # Fetch existing AttractionModel rows matching candidate names for fast spatial dedup
    candidate_names = {c.name.strip().lower() for c in candidates if c.name.strip()}
    existing_by_name: dict[str, list[AttractionModel]] = {}
    if candidate_names:
        stmt = select(AttractionModel).where(
            func.lower(AttractionModel.name).in_(list(candidate_names))
        )
        rows = (await session.execute(stmt)).scalars().all()
        for row in rows:
            existing_by_name.setdefault(row.name.strip().lower(), []).append(row)

    existing_item_poi_ids = {it.poi_id for it in (collection.items or [])}
    next_order_index = len(existing_item_poi_ids)

    to_create: list[ImportedPlaceCandidate] = []
    resolved_poi_ids: list[str] = []
    matched_count = 0

    for cand in candidates:
        matched_id: str | None = None
        for attr in existing_by_name.get(cand.name.strip().lower(), []):
            loc = attr.location or {}
            a_lat = loc.get("latitude") if "latitude" in loc else loc.get("lat")
            a_lon = loc.get("longitude") if "longitude" in loc else loc.get("lng")
            if a_lat is not None and a_lon is not None:
                if (
                    _haversine_meters(cand.lat, cand.lon, float(a_lat), float(a_lon))
                    <= 120.0
                ):
                    matched_id = attr.id
                    break
        if matched_id:
            matched_count += 1
            resolved_poi_ids.append(matched_id)
        else:
            to_create.append(cand)

    # Batch-compute 768D embeddings for newly created POIs
    embeddings: list[list[float] | None] = [None] * len(to_create)
    if to_create:
        texts = [
            f"{c.name}. {c.category}. {c.description or c.address or default_city or ''}".strip()
            for c in to_create
        ]
        try:
            provider = OnnxEmbeddingProvider()
            embeddings = await provider.embed_batch(texts, input_type="document")
        except (EmbeddingProviderError, Exception) as exc:
            logger.warning("Skipping ONNX embedding during place import: %s", exc)

    clean_default_city = (default_city or "").strip().lower() or "imported"
    created_count = 0
    for idx, cand in enumerate(to_create):
        new_poi_id = f"import_{uuid.uuid4().hex[:12]}"
        city_val = (cand.city or clean_default_city).strip().lower()
        location_payload: dict[str, Any] = {
            "latitude": float(cand.lat),
            "longitude": float(cand.lon),
        }
        if cand.address:
            location_payload["address"] = cand.address
        if city_val:
            location_payload["city"] = city_val

        attraction = AttractionModel(
            id=new_poi_id,
            city=city_val,
            name=cand.name.strip(),
            category=cand.category,
            embedding=embeddings[idx] if idx < len(embeddings) else None,
            location=location_payload,
            scoring={},
            metadata_field={
                "source": cand.source_format,
                "description": cand.description or None,
                "address": cand.address,
            },
            description=cand.description or None,
            doc_quality="B",
        )
        session.add(attraction)
        resolved_poi_ids.append(new_poi_id)
        created_count += 1

    await session.flush()

    added_to_collection = 0
    for pid in resolved_poi_ids:
        if pid in existing_item_poi_ids:
            continue
        existing_item_poi_ids.add(pid)
        session.add(
            TripCollectionItemModel(
                id=str(uuid.uuid4()),
                collection_id=collection.id,
                poi_id=pid,
                order_index=next_order_index,
            )
        )
        next_order_index += 1
        added_to_collection += 1
        uid = user.id if user else None
        if uid:
            await TasteService.on_collection_change(
                session=session,
                user_id=uid,
                poi_id=pid,
                action="saved",
                trip_id=collection.trip_id,
            )

    await session.commit()

    return {
        "imported_count": added_to_collection,
        "created_pois_count": created_count,
        "matched_existing_count": matched_count,
        "poi_ids": resolved_poi_ids,
    }
