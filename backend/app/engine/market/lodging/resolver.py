"""
Cross-provider entity resolution for lodging properties.
Ensures identical hotels from different scrapers (Booking, Google Travel, etc.)
are mapped to a single canonical identity with persistent telemetry.
"""

import difflib
import logging
import math
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import HotelPropertyModel, HotelPropertySourceModel
from app.engine.market.lodging.normalize import normalize_property_name

logger = logging.getLogger(__name__)

# Standard Base32 Geohash alphabet
_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def encode_geohash(latitude: float, longitude: float, precision: int = 7) -> str:
    """Encodes latitude and longitude into a geohash string."""
    lat_interval = (-90.0, 90.0)
    lon_interval = (-180.0, 180.0)
    geohash = []
    bits = [16, 8, 4, 2, 1]
    bit = 0
    ch = 0
    even = True

    while len(geohash) < precision:
        if even:
            mid = (lon_interval[0] + lon_interval[1]) / 2.0
            if longitude >= mid:
                ch |= bits[bit]
                lon_interval = (mid, lon_interval[1])
            else:
                lon_interval = (lon_interval[0], mid)
        else:
            mid = (lat_interval[0] + lat_interval[1]) / 2.0
            if latitude >= mid:
                ch |= bits[bit]
                lat_interval = (mid, lat_interval[1])
            else:
                lat_interval = (lat_interval[0], mid)
        even = not even
        if bit < 4:
            bit += 1
        else:
            geohash.append(_BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)


def haversine_distance_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculates great-circle distance between two points on the earth in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


class EntityResolver:
    """
    Resolves raw property citations across providers to canonical hotel entities.
    """

    def __init__(self, name_similarity_threshold: float = 0.85):
        self.similarity_threshold = name_similarity_threshold

    async def resolve_or_create(
        self,
        session: AsyncSession,
        destination_code: str,
        provider: str,
        provider_property_id: str,
        name: str,
        latitude: float | None = None,
        longitude: float | None = None,
        stars: float | None = None,
        deep_link: str | None = None,
        address: str | None = None,
    ) -> tuple[str, bool]:
        """
        Resolves property to canonical hotel_properties.id.
        Returns (canonical_property_id, is_new_property).
        """
        dest = destination_code.upper().strip()
        p_id = str(provider_property_id).strip()
        norm_name = normalize_property_name(name)
        now = datetime.now(timezone.utc)

        # 1. Check exact match in hotel_property_sources
        stmt_src = select(HotelPropertySourceModel).where(
            HotelPropertySourceModel.provider == provider,
            HotelPropertySourceModel.provider_property_id == p_id,
        )
        res_src = await session.execute(stmt_src)
        existing_src = res_src.scalar_one_or_none()
        if existing_src:
            existing_src.last_seen = now
            if deep_link:
                existing_src.deep_link = deep_link
            return existing_src.property_id, False

        # 2. Check candidate matches in destination by normalized name
        stmt_cands = select(HotelPropertyModel).where(
            HotelPropertyModel.destination_code == dest
        )
        res_cands = await session.execute(stmt_cands)
        candidates = res_cands.scalars().all()

        matched_prop: HotelPropertyModel | None = None
        best_score = 0.0

        for cand in candidates:
            # Name similarity
            sim = difflib.SequenceMatcher(None, norm_name, cand.name_norm).ratio()
            if sim >= self.similarity_threshold:
                # If both have coordinates, verify spatial proximity
                if (
                    latitude is not None
                    and longitude is not None
                    and cand.latitude is not None
                    and cand.longitude is not None
                ):
                    dist = haversine_distance_meters(
                        latitude, longitude, cand.latitude, cand.longitude
                    )
                    if (
                        dist > 800.0
                    ):  # More than 800 meters apart -> likely different properties
                        continue

                if sim > best_score:
                    best_score = sim
                    matched_prop = cand

        gh7 = (
            encode_geohash(latitude, longitude, 7)
            if (latitude is not None and longitude is not None)
            else None
        )

        if matched_prop:
            # Link candidate to provider source
            canonical_id = matched_prop.id
            matched_prop.last_seen = now
            if matched_prop.stars is None and stars is not None:
                matched_prop.stars = stars
            if matched_prop.latitude is None and latitude is not None:
                matched_prop.latitude = latitude
                matched_prop.longitude = longitude
                matched_prop.geohash7 = gh7

            new_src = HotelPropertySourceModel(
                id=str(uuid.uuid4()),
                property_id=canonical_id,
                provider=provider,
                provider_property_id=p_id,
                deep_link=deep_link,
                confidence=best_score,
                last_seen=now,
            )
            session.add(new_src)
            return canonical_id, False

        # 3. Create new canonical entity
        canonical_id = f"hp_{dest.lower()}_{uuid.uuid4().hex[:12]}"
        new_prop = HotelPropertyModel(
            id=canonical_id,
            destination_code=dest,
            name=name.strip(),
            name_norm=norm_name,
            latitude=latitude,
            longitude=longitude,
            geohash7=gh7,
            stars=stars,
            property_type="hotel",
            address=address,
            first_seen=now,
            last_seen=now,
        )
        session.add(new_prop)

        new_src = HotelPropertySourceModel(
            id=str(uuid.uuid4()),
            property_id=canonical_id,
            provider=provider,
            provider_property_id=p_id,
            deep_link=deep_link,
            confidence=1.0,
            last_seen=now,
        )
        session.add(new_src)

        return canonical_id, True
