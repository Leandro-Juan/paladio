import logging
from datetime import datetime
from typing import Any

from app.db.models import (
    AttractionModel,
    TransitAgencyModel,
    TransitCacheModel,
    TransitLineModel,
    TransitPatternModel,
    TransitPatternStopModel,
    TransitPatternTripModel,
    TransitServiceDayModel,
    TransitServiceSummaryModel,
    TransitStationLineModel,
    TransitStationModel,
    TransitTransferModel,
)
from app.domain.interfaces.transit_repository import ITransitRepository
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class SQLTransitRepository(ITransitRepository):
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_transit_cache(self, city: str) -> dict[str, Any] | None:
        city_lower = city.strip().lower()
        stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_lower)
        result = await self.db.execute(stmt)
        row = result.scalars().first()
        if not row:
            return None
        return {
            "city": row.city,
            "status": row.status,
            "gtfs_status": row.gtfs_status,
            "osm_status": row.osm_status,
            "derived_status": row.derived_status or "PENDING",
            "derived_at": row.derived_at.isoformat() if row.derived_at else None,
            "active_build_id": row.active_build_id,
            "capabilities": row.capabilities or {},
            "valid_until": row.valid_until.isoformat() if row.valid_until else None,
            "feed_valid_from": row.feed_valid_from.isoformat()
            if row.feed_valid_from
            else None,
            "feed_valid_to": row.feed_valid_to.isoformat()
            if row.feed_valid_to
            else None,
            "quality": row.quality or {},
        }

    async def get_active_build_id(self, city: str) -> str | None:
        cache = await self.get_transit_cache(city)
        if cache and cache.get("derived_status") == "READY":
            return cache.get("active_build_id")
        return None

    async def get_agencies(self, city: str, build_id: str) -> list[dict[str, Any]]:
        stmt = select(TransitAgencyModel).where(
            TransitAgencyModel.build_id == build_id,
            TransitAgencyModel.city == city,
        )
        res = await self.db.execute(stmt)
        return [
            {
                "id": a.agency_id,
                "name": a.name,
                "url": a.url,
                "timezone": a.timezone,
                "phone": a.phone,
                "fare_url": a.fare_url,
            }
            for a in res.scalars().all()
        ]

    async def get_lines(
        self, city: str, build_id: str, mode: str | None = None
    ) -> list[dict[str, Any]]:
        stmt = select(TransitLineModel).where(
            TransitLineModel.build_id == build_id,
            TransitLineModel.city == city,
        )
        if mode:
            stmt = stmt.where(TransitLineModel.mode.ilike(mode))
        stmt = stmt.order_by(TransitLineModel.sort_order, TransitLineModel.line_id)
        res = await self.db.execute(stmt)
        lines = res.scalars().all()

        # Station count per line
        # Map through transit_station_lines
        sl_stmt = (
            select(
                TransitStationLineModel.line_id,
                TransitStationLineModel.station_id,
            )
            .where(
                TransitStationLineModel.build_id == build_id,
                TransitStationLineModel.city == city,
            )
            .distinct()
        )
        sl_res = await self.db.execute(sl_stmt)
        station_counts: dict[str, int] = {}
        for r_id, _ in sl_res.all():
            station_counts[r_id] = station_counts.get(r_id, 0) + 1

        out = []
        for line in lines:
            out.append(
                {
                    "id": line.line_id,
                    "agency_id": line.agency_id,
                    "short_name": line.short_name,
                    "long_name": line.long_name,
                    "mode": line.mode,
                    "color": line.color,
                    "text_color": line.text_color,
                    "color_source": line.color_source,
                    "station_count": station_counts.get(line.line_id, 0),
                }
            )
        return out

    async def get_line_detail(
        self, city: str, build_id: str, line_id: str
    ) -> dict[str, Any] | None:
        # 1. Line info
        l_stmt = select(TransitLineModel).where(
            TransitLineModel.build_id == build_id,
            TransitLineModel.city == city,
            or_(
                TransitLineModel.line_id == line_id,
                TransitLineModel.short_name == line_id,
                TransitLineModel.long_name.ilike(line_id),
            ),
        )
        l_res = await self.db.execute(l_stmt)
        line = l_res.scalars().first()
        if not line:
            return None

        # 2. Patterns
        p_stmt = (
            select(TransitPatternModel)
            .where(
                TransitPatternModel.build_id == build_id,
                TransitPatternModel.city == city,
                TransitPatternModel.line_id == line.line_id,
            )
            .order_by(
                TransitPatternModel.direction_id, TransitPatternModel.is_primary.desc()
            )
        )
        p_res = await self.db.execute(p_stmt)
        patterns = p_res.scalars().all()

        patterns_out = []
        for pat in patterns:
            # Pattern stops with station names & coordinates
            ps_stmt = (
                select(
                    TransitPatternStopModel.stop_sequence,
                    TransitPatternStopModel.time_offset_seconds,
                    TransitStationModel.station_id,
                    TransitStationModel.name,
                    TransitStationModel.original_name,
                    TransitStationModel.lat,
                    TransitStationModel.lon,
                )
                .join(
                    TransitStationModel,
                    and_(
                        TransitStationModel.build_id
                        == TransitPatternStopModel.build_id,
                        TransitStationModel.city == TransitPatternStopModel.city,
                        TransitStationModel.station_id
                        == TransitPatternStopModel.station_id,
                    ),
                )
                .where(
                    TransitPatternStopModel.build_id == build_id,
                    TransitPatternStopModel.city == city,
                    TransitPatternStopModel.pattern_id == pat.pattern_id,
                )
                .order_by(TransitPatternStopModel.stop_sequence)
            )

            ps_res = await self.db.execute(ps_stmt)
            stops = [
                {
                    "sequence": r[0],
                    "time_offset_seconds": r[1],
                    "station_id": r[2],
                    "name": r[3],
                    "original_name": r[4],
                    "lat": r[5],
                    "lon": r[6],
                }
                for r in ps_res.all()
            ]

            # Try to find a shape for this pattern if one exists in TransitShapeModel
            # Otherwise construct fallback stop-sequence polyline
            fallback_coords = [[s["lat"], s["lon"]] for s in stops]
            geometry_source = "stop_sequence"
            coordinates = fallback_coords

            patterns_out.append(
                {
                    "pattern_id": pat.pattern_id,
                    "direction_id": pat.direction_id,
                    "headsign": pat.headsign or (stops[-1]["name"] if stops else None),
                    "is_primary": pat.is_primary,
                    "stop_count": pat.stop_count,
                    "stops": stops,
                    "geometry": {
                        "source": geometry_source,
                        "coordinates": coordinates,
                    },
                }
            )

        return {
            "id": line.line_id,
            "agency_id": line.agency_id,
            "short_name": line.short_name,
            "long_name": line.long_name,
            "mode": line.mode,
            "color": line.color,
            "text_color": line.text_color,
            "color_source": line.color_source,
            "patterns": patterns_out,
        }

    async def get_stations_by_bbox(
        self,
        city: str,
        build_id: str,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(TransitStationModel)
            .where(
                TransitStationModel.build_id == build_id,
                TransitStationModel.city == city,
                TransitStationModel.lat >= min_lat,
                TransitStationModel.lat <= max_lat,
                TransitStationModel.lon >= min_lon,
                TransitStationModel.lon <= max_lon,
            )
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        stations = res.scalars().all()
        if not stations:
            return []

        station_ids = [s.station_id for s in stations]

        # Fetch line chips for all these stations
        lines_stmt = (
            select(
                TransitStationLineModel.station_id,
                TransitLineModel.line_id,
                TransitLineModel.short_name,
                TransitLineModel.mode,
                TransitLineModel.color,
                TransitLineModel.text_color,
            )
            .join(
                TransitLineModel,
                and_(
                    TransitLineModel.build_id == TransitStationLineModel.build_id,
                    TransitLineModel.city == TransitStationLineModel.city,
                    TransitLineModel.line_id == TransitStationLineModel.line_id,
                ),
            )
            .where(
                TransitStationLineModel.build_id == build_id,
                TransitStationLineModel.city == city,
                TransitStationLineModel.station_id.in_(station_ids),
            )
            .distinct()
        )

        lines_res = await self.db.execute(lines_stmt)
        lines_by_station: dict[str, list[dict[str, Any]]] = {}
        for row in lines_res.all():
            st_id = row[0]
            if st_id not in lines_by_station:
                lines_by_station[st_id] = []
            lines_by_station[st_id].append(
                {
                    "line_id": row[1],
                    "short_name": row[2],
                    "mode": row[3],
                    "color": row[4],
                    "text_color": row[5],
                }
            )

        return [
            {
                "id": s.station_id,
                "name": s.name,
                "original_name": s.original_name,
                "lat": s.lat,
                "lon": s.lon,
                "wheelchair_boarding": s.wheelchair_boarding,
                "stop_count": s.stop_count,
                "lines": lines_by_station.get(s.station_id, []),
            }
            for s in stations
        ]

    async def get_station_detail(
        self, city: str, build_id: str, station_id: str
    ) -> dict[str, Any] | None:
        city = city.strip().lower()
        # 1. Station basic info
        clean_name = (
            station_id.removesuffix(" Station")
            .removesuffix(" station")
            .removesuffix("駅")
            .strip()
        )
        st_stmt = select(TransitStationModel).where(
            TransitStationModel.build_id == build_id,
            TransitStationModel.city == city,
            or_(
                TransitStationModel.station_id == station_id,
                TransitStationModel.name.ilike(station_id),
                TransitStationModel.original_name.ilike(station_id),
                TransitStationModel.name.ilike(clean_name),
                TransitStationModel.name.ilike(f"{clean_name} Station"),
                TransitStationModel.original_name.ilike(clean_name),
                TransitStationModel.original_name.ilike(f"{clean_name}駅"),
            ),
        )
        st_res = await self.db.execute(st_stmt)
        station = st_res.scalars().first()
        if not station:
            return None

        actual_station_id = station.station_id

        # 2. Serving lines with directions & headsigns
        lines_stmt = (
            select(
                TransitStationLineModel.line_id,
                TransitStationLineModel.direction_id,
                TransitStationLineModel.headsign,
                TransitLineModel.short_name,
                TransitLineModel.long_name,
                TransitLineModel.mode,
                TransitLineModel.color,
                TransitLineModel.text_color,
            )
            .join(
                TransitLineModel,
                and_(
                    TransitLineModel.build_id == TransitStationLineModel.build_id,
                    TransitLineModel.city == TransitStationLineModel.city,
                    TransitLineModel.line_id == TransitStationLineModel.line_id,
                ),
            )
            .where(
                TransitStationLineModel.build_id == build_id,
                TransitStationLineModel.city == city,
                TransitStationLineModel.station_id == actual_station_id,
            )
        )
        lines_res = await self.db.execute(lines_stmt)
        serving_lines = [
            {
                "line_id": r[0],
                "direction_id": r[1],
                "headsign": r[2],
                "short_name": r[3],
                "long_name": r[4],
                "mode": r[5],
                "color": r[6],
                "text_color": r[7],
            }
            for r in lines_res.all()
        ]

        # 3. Service summary (typical headways & spans)
        sum_stmt = select(TransitServiceSummaryModel).where(
            TransitServiceSummaryModel.build_id == build_id,
            TransitServiceSummaryModel.city == city,
            TransitServiceSummaryModel.station_id == actual_station_id,
        )
        sum_res = await self.db.execute(sum_stmt)
        summaries = [
            {
                "line_id": sm.line_id,
                "direction_id": sm.direction_id,
                "day_type": sm.day_type,
                "first_departure_seconds": sm.first_departure_seconds,
                "last_departure_seconds": sm.last_departure_seconds,
                "headways_by_band": sm.headways_by_band,
            }
            for sm in sum_res.scalars().all()
        ]

        # 4. Transfers if present
        tr_stmt = (
            select(
                TransitTransferModel.to_station_id,
                TransitTransferModel.transfer_type,
                TransitTransferModel.min_transfer_time,
                TransitStationModel.name,
            )
            .join(
                TransitStationModel,
                and_(
                    TransitStationModel.build_id == TransitTransferModel.build_id,
                    TransitStationModel.city == TransitTransferModel.city,
                    TransitStationModel.station_id
                    == TransitTransferModel.to_station_id,
                ),
            )
            .where(
                TransitTransferModel.build_id == build_id,
                TransitTransferModel.city == city,
                TransitTransferModel.from_station_id == actual_station_id,
            )
        )
        tr_res = await self.db.execute(tr_stmt)
        transfers = [
            {
                "to_station_id": r[0],
                "transfer_type": r[1],
                "min_transfer_time": r[2],
                "to_station_name": r[3],
            }
            for r in tr_res.all()
        ]

        return {
            "id": station.station_id,
            "name": station.name,
            "original_name": station.original_name,
            "lat": station.lat,
            "lon": station.lon,
            "wheelchair_boarding": station.wheelchair_boarding,
            "stop_count": station.stop_count,
            "serving_lines": serving_lines,
            "service_summary": summaries,
            "transfers": transfers if transfers else None,
        }

    async def get_station_departures(
        self,
        city: str,
        build_id: str,
        station_id: str,
        target_date: str,
        target_seconds: int,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        # Resolve day of week and active service_ids for target_date
        try:
            dt = datetime.strptime(target_date, "%Y-%m-%d")
            date_int = int(dt.strftime("%Y%m%d"))
            weekday_idx = dt.weekday()  # 0=Monday, 6=Sunday
        except ValueError:
            return []

        # Find active service_ids from transit_service_days
        sd_stmt = select(TransitServiceDayModel).where(
            TransitServiceDayModel.build_id == build_id,
            TransitServiceDayModel.city == city,
            TransitServiceDayModel.start_date <= date_int,
            TransitServiceDayModel.end_date >= date_int,
        )
        sd_res = await self.db.execute(sd_stmt)
        active_services: set[str] = set()
        day_cols = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
        current_day_col = day_cols[weekday_idx]

        for s_day in sd_res.scalars().all():
            ex_dates = s_day.exception_dates or {}
            # Exception check: 1 = service added, 2 = service removed
            if str(date_int) in ex_dates:
                if ex_dates[str(date_int)] == 1:
                    active_services.add(s_day.service_id)
            else:
                if getattr(s_day, current_day_col, 0) == 1:
                    active_services.add(s_day.service_id)

        if not active_services:
            return []

        # Find patterns serving this station and get pattern_stop offset
        pst_stmt = (
            select(
                TransitPatternStopModel.pattern_id,
                TransitPatternStopModel.time_offset_seconds,
                TransitPatternModel.line_id,
                TransitPatternModel.headsign,
                TransitLineModel.short_name,
                TransitLineModel.mode,
                TransitLineModel.color,
                TransitLineModel.text_color,
            )
            .join(
                TransitPatternModel,
                and_(
                    TransitPatternModel.build_id == TransitPatternStopModel.build_id,
                    TransitPatternModel.city == TransitPatternStopModel.city,
                    TransitPatternModel.pattern_id
                    == TransitPatternStopModel.pattern_id,
                ),
            )
            .join(
                TransitLineModel,
                and_(
                    TransitLineModel.build_id == TransitPatternModel.build_id,
                    TransitLineModel.city == TransitPatternModel.city,
                    TransitLineModel.line_id == TransitPatternModel.line_id,
                ),
            )
            .where(
                TransitPatternStopModel.build_id == build_id,
                TransitPatternStopModel.city == city,
                TransitPatternStopModel.station_id == station_id,
            )
        )
        pst_res = await self.db.execute(pst_stmt)
        pattern_offsets: dict[str, dict[str, Any]] = {}
        for r in pst_res.all():
            pattern_offsets[r[0]] = {
                "offset": r[1],
                "line_id": r[2],
                "headsign": r[3],
                "short_name": r[4],
                "mode": r[5],
                "color": r[6],
                "text_color": r[7],
            }

        if not pattern_offsets:
            return []

        # Query pattern trips for active services and patterns
        pt_stmt = select(
            TransitPatternTripModel.pattern_id,
            TransitPatternTripModel.departure_seconds,
        ).where(
            TransitPatternTripModel.build_id == build_id,
            TransitPatternTripModel.city == city,
            TransitPatternTripModel.pattern_id.in_(list(pattern_offsets.keys())),
            TransitPatternTripModel.service_id.in_(list(active_services)),
        )
        pt_res = await self.db.execute(pt_stmt)

        departures = []
        for pat_id, dep_sec in pt_res.all():
            meta = pattern_offsets[pat_id]
            st_dep = dep_sec + meta["offset"]
            if st_dep >= target_seconds:
                departures.append(
                    {
                        "line_id": meta["line_id"],
                        "line_short_name": meta["short_name"] or meta["line_id"],
                        "mode": meta["mode"],
                        "color": meta["color"],
                        "text_color": meta["text_color"],
                        "headsign": meta["headsign"],
                        "departure_seconds": st_dep,
                    }
                )

        departures.sort(key=lambda d: d["departure_seconds"])
        return departures[:limit]

    async def get_osm_stations_by_bbox(
        self,
        city: str,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(AttractionModel)
            .where(
                AttractionModel.city.ilike(city),
                AttractionModel.category == "transit",
                AttractionModel.latitude >= min_lat,
                AttractionModel.latitude <= max_lat,
                AttractionModel.longitude >= min_lon,
                AttractionModel.longitude <= max_lon,
            )
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        return [
            {
                "id": a.id,
                "name": a.name,
                "lat": a.latitude,
                "lon": a.longitude,
                "mode": "Transit",
                "source": "osm",
            }
            for a in res.scalars().all()
        ]
