import csv
import os
import tempfile
import pytest
from sqlalchemy import select

from app.db.models import (
    TransitCacheModel,
    TransitLineModel,
    TransitPatternStopModel,
    TransitServiceSummaryModel,
    TransitStationModel,
)
from app.services.transit_derivation_service import (
    TransitDerivationService,
    map_gtfs_route_type,
    parse_gtfs_time_seconds,
    compute_contrast_text_color,
)


def test_gtfs_helper_utilities():
    assert parse_gtfs_time_seconds("08:30:00") == 8 * 3600 + 30 * 60
    assert parse_gtfs_time_seconds("25:15:30") == 25 * 3600 + 15 * 60 + 30
    assert parse_gtfs_time_seconds("invalid") is None
    assert parse_gtfs_time_seconds(None) is None

    # route_type mapping
    assert map_gtfs_route_type(0) == "Tram"
    assert map_gtfs_route_type(1) == "Metro"
    assert map_gtfs_route_type(2) == "Rail"
    assert map_gtfs_route_type(3) == "Bus"
    assert map_gtfs_route_type(4) == "Ferry"
    # Extended codes
    assert map_gtfs_route_type(108) == "Rail"
    assert map_gtfs_route_type(200) == "Rail"
    assert map_gtfs_route_type(401) == "Metro"
    assert map_gtfs_route_type(702) == "Bus"
    assert map_gtfs_route_type(900) == "Tram"
    assert map_gtfs_route_type(9999) == "Other"
    assert map_gtfs_route_type(None) == "Other"

    # Contrast colors
    assert compute_contrast_text_color("#FFFFFF") == "#000000"
    assert compute_contrast_text_color("#000000") == "#FFFFFF"
    assert compute_contrast_text_color("#FFCC00") == "#000000"
    assert compute_contrast_text_color("#003399") == "#FFFFFF"


@pytest.mark.asyncio
async def test_transit_derivation_full_pipeline(db_session):
    with tempfile.TemporaryDirectory() as tmp_base:
        city = "synthcity"
        feed_dir = os.path.join(tmp_base, city)
        os.makedirs(feed_dir, exist_ok=True)

        # 1. agency.txt
        with open(
            os.path.join(feed_dir, "agency.txt"), "w", encoding="utf-8", newline=""
        ) as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "agency_id",
                    "agency_name",
                    "agency_url",
                    "agency_timezone",
                ],
            )
            w.writeheader()
            w.writerow(
                {
                    "agency_id": "A1",
                    "agency_name": "Synth Transit",
                    "agency_url": "https://transit.synth",
                    "agency_timezone": "UTC",
                }
            )

        # 2. routes.txt
        with open(
            os.path.join(feed_dir, "routes.txt"), "w", encoding="utf-8", newline=""
        ) as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "route_id",
                    "agency_id",
                    "route_short_name",
                    "route_long_name",
                    "route_type",
                    "route_color",
                ],
            )
            w.writeheader()
            w.writerow(
                {
                    "route_id": "M1",
                    "agency_id": "A1",
                    "route_short_name": "M1",
                    "route_long_name": "Red Line",
                    "route_type": "1",
                    "route_color": "FF0000",
                }
            )
            w.writerow(
                {
                    "route_id": "R1",
                    "agency_id": "A1",
                    "route_short_name": "R1",
                    "route_long_name": "Express Rail",
                    "route_type": "108",
                    "route_color": "",
                }
            )

        # 3. stops.txt (with parent station collapsing)
        with open(
            os.path.join(feed_dir, "stops.txt"), "w", encoding="utf-8", newline=""
        ) as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "stop_id",
                    "stop_name",
                    "stop_lat",
                    "stop_lon",
                    "location_type",
                    "parent_station",
                    "wheelchair_boarding",
                ],
            )
            w.writeheader()
            w.writerow(
                {
                    "stop_id": "P_CENTRAL",
                    "stop_name": "Central Station",
                    "stop_lat": "48.8566",
                    "stop_lon": "2.3522",
                    "location_type": "1",
                    "parent_station": "",
                    "wheelchair_boarding": "1",
                }
            )
            w.writerow(
                {
                    "stop_id": "PL_1",
                    "stop_name": "Central Station Track 1",
                    "stop_lat": "48.8567",
                    "stop_lon": "2.3523",
                    "location_type": "0",
                    "parent_station": "P_CENTRAL",
                    "wheelchair_boarding": "1",
                }
            )
            w.writerow(
                {
                    "stop_id": "PL_2",
                    "stop_name": "Central Station Track 2",
                    "stop_lat": "48.8565",
                    "stop_lon": "2.3521",
                    "location_type": "0",
                    "parent_station": "P_CENTRAL",
                    "wheelchair_boarding": "1",
                }
            )
            w.writerow(
                {
                    "stop_id": "S_NORTH",
                    "stop_name": "North Gate",
                    "stop_lat": "48.8666",
                    "stop_lon": "2.3622",
                    "location_type": "0",
                    "parent_station": "",
                    "wheelchair_boarding": "0",
                }
            )
            w.writerow(
                {
                    "stop_id": "S_SOUTH",
                    "stop_name": "South Park",
                    "stop_lat": "48.8466",
                    "stop_lon": "2.3422",
                    "location_type": "0",
                    "parent_station": "",
                    "wheelchair_boarding": "",
                }
            )

        # 4. calendar.txt
        with open(
            os.path.join(feed_dir, "calendar.txt"), "w", encoding="utf-8", newline=""
        ) as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "service_id",
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                    "start_date",
                    "end_date",
                ],
            )
            w.writeheader()
            w.writerow(
                {
                    "service_id": "SRV_WD",
                    "monday": 1,
                    "tuesday": 1,
                    "wednesday": 1,
                    "thursday": 1,
                    "friday": 1,
                    "saturday": 0,
                    "sunday": 0,
                    "start_date": 20260101,
                    "end_date": 20261231,
                }
            )

        # 5. trips.txt
        with open(
            os.path.join(feed_dir, "trips.txt"), "w", encoding="utf-8", newline=""
        ) as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "trip_id",
                    "route_id",
                    "service_id",
                    "trip_headsign",
                    "direction_id",
                ],
            )
            w.writeheader()
            w.writerow(
                {
                    "trip_id": "T1",
                    "route_id": "M1",
                    "service_id": "SRV_WD",
                    "trip_headsign": "Northbound",
                    "direction_id": 0,
                }
            )
            w.writerow(
                {
                    "trip_id": "T2",
                    "route_id": "M1",
                    "service_id": "SRV_WD",
                    "trip_headsign": "Northbound",
                    "direction_id": 0,
                }
            )
            w.writerow(
                {
                    "trip_id": "T3",
                    "route_id": "M1",
                    "service_id": "SRV_WD",
                    "trip_headsign": "Northbound",
                    "direction_id": 0,
                }
            )

        # 6. stop_times.txt (times with headway sequence)
        with open(
            os.path.join(feed_dir, "stop_times.txt"), "w", encoding="utf-8", newline=""
        ) as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "trip_id",
                    "stop_id",
                    "stop_sequence",
                    "arrival_time",
                    "departure_time",
                ],
            )
            w.writeheader()
            # T1 at 08:00
            w.writerow(
                {
                    "trip_id": "T1",
                    "stop_id": "PL_1",
                    "stop_sequence": 1,
                    "arrival_time": "08:00:00",
                    "departure_time": "08:00:00",
                }
            )
            w.writerow(
                {
                    "trip_id": "T1",
                    "stop_id": "S_NORTH",
                    "stop_sequence": 2,
                    "arrival_time": "08:10:00",
                    "departure_time": "08:10:00",
                }
            )
            # T2 at 08:15
            w.writerow(
                {
                    "trip_id": "T2",
                    "stop_id": "PL_1",
                    "stop_sequence": 1,
                    "arrival_time": "08:15:00",
                    "departure_time": "08:15:00",
                }
            )
            w.writerow(
                {
                    "trip_id": "T2",
                    "stop_id": "S_NORTH",
                    "stop_sequence": 2,
                    "arrival_time": "08:25:00",
                    "departure_time": "08:25:00",
                }
            )
            # T3 at 08:30
            w.writerow(
                {
                    "trip_id": "T3",
                    "stop_id": "PL_1",
                    "stop_sequence": 1,
                    "arrival_time": "08:30:00",
                    "departure_time": "08:30:00",
                }
            )
            w.writerow(
                {
                    "trip_id": "T3",
                    "stop_id": "S_NORTH",
                    "stop_sequence": 2,
                    "arrival_time": "08:40:00",
                    "departure_time": "08:40:00",
                }
            )

        session = db_session
        service = TransitDerivationService(session, gtfs_base_dir=tmp_base)
        res = await service.derive_city(city)
        assert res["status"] == "success"
        build_id_1 = res["build_id"]

        # Verify collapsed stations: P_CENTRAL, S_NORTH, S_SOUTH
        st_res = await session.execute(
            select(TransitStationModel).where(
                TransitStationModel.build_id == build_id_1
            )
        )
        stations = {s.station_id: s for s in st_res.scalars().all()}
        assert len(stations) == 3
        assert "P_CENTRAL" in stations
        assert stations["P_CENTRAL"].stop_count == 3  # P_CENTRAL + PL_1 + PL_2
        assert stations["P_CENTRAL"].wheelchair_boarding == 1

        # Verify lines
        ln_res = await session.execute(
            select(TransitLineModel).where(TransitLineModel.build_id == build_id_1)
        )
        lines = {line.line_id: line for line in ln_res.scalars().all()}
        assert len(lines) == 2
        assert lines["M1"].mode == "Metro"
        assert lines["M1"].color == "#FF0000"
        assert lines["M1"].color_source == "gtfs"
        assert lines["R1"].mode == "Rail"
        assert lines["R1"].color_source == "fallback"

        # Verify pattern stops & time offsets
        ps_res = await session.execute(
            select(TransitPatternStopModel).where(
                TransitPatternStopModel.build_id == build_id_1
            )
        )
        pst = sorted(ps_res.scalars().all(), key=lambda p: p.stop_sequence)
        assert len(pst) == 2
        assert pst[0].station_id == "P_CENTRAL"
        assert pst[0].time_offset_seconds == 0
        assert pst[1].station_id == "S_NORTH"
        assert pst[1].time_offset_seconds == 600  # 10 minutes

        # Verify headways in service summary
        sm_res = await session.execute(
            select(TransitServiceSummaryModel).where(
                TransitServiceSummaryModel.build_id == build_id_1,
                TransitServiceSummaryModel.station_id == "P_CENTRAL",
            )
        )
        summary = sm_res.scalars().first()
        assert summary is not None
        assert summary.first_departure_seconds == 8 * 3600
        assert summary.last_departure_seconds == 8 * 3600 + 30 * 60
        assert summary.headways_by_band["morning"] == 15  # 15 minutes average

        # Verify cache active_build_id
        c_res = await session.execute(
            select(TransitCacheModel).where(TransitCacheModel.city == city)
        )
        cache_row = c_res.scalars().first()
        assert cache_row is not None
        assert cache_row.active_build_id == build_id_1
        assert cache_row.derived_status == "READY"
        assert cache_row.capabilities["has_headsigns"] is True
        assert cache_row.capabilities["has_wheelchair_info"] is True

        # Re-run derivation (simulate new feed update)
        res_2 = await service.derive_city(city)
        build_id_2 = res_2["build_id"]
        assert build_id_2 != build_id_1

        # Cache active_build_id should be updated to build_id_2
        c_res_2 = await session.execute(
            select(TransitCacheModel).where(TransitCacheModel.city == city)
        )
        cache_row_2 = c_res_2.scalars().first()
        assert cache_row_2.active_build_id == build_id_2

        # Old build rows should be cleanly purged
        old_st = await session.execute(
            select(TransitStationModel).where(
                TransitStationModel.build_id == build_id_1
            )
        )
        assert len(old_st.scalars().all()) == 0

        # New build rows exist
        new_st = await session.execute(
            select(TransitStationModel).where(
                TransitStationModel.build_id == build_id_2
            )
        )
        assert len(new_st.scalars().all()) == 3


@pytest.mark.asyncio
async def test_commit_build_rejects_severe_coverage_regression(db_session):
    import uuid

    suffix = uuid.uuid4().hex[:8]
    city = f"metrotown_{suffix}"
    old_build_id = f"old-rich-build-{suffix}"
    new_build_id = f"new-partial-build-{suffix}"
    session = db_session

    session.add(
        TransitCacheModel(
            city=city,
            status="READY",
            gtfs_status="READY",
            derived_status="READY",
            active_build_id=old_build_id,
        )
    )
    for i in range(25):
        session.add(
            TransitLineModel(
                build_id=old_build_id,
                city=city,
                line_id=f"L{i}",
                mode="Metro",
                color="#0F4C5C",
                text_color="#FFFFFF",
                color_source="gtfs",
            )
        )
    for i in range(40):
        session.add(
            TransitStationModel(
                build_id=old_build_id,
                city=city,
                station_id=f"S{i}",
                name=f"Station {i}",
                lat=35.68 + i * 0.001,
                lon=139.76 + i * 0.001,
                stop_count=1,
            )
        )
    await session.commit()

    service = TransitDerivationService(session)
    partial_lines = [
        TransitLineModel(
            build_id=new_build_id,
            city=city,
            line_id="L0",
            mode="Metro",
            color="#0F4C5C",
            text_color="#FFFFFF",
            color_source="gtfs",
        )
    ]
    partial_stations = [
        TransitStationModel(
            build_id=new_build_id,
            city=city,
            station_id="S0",
            name="Station 0",
            lat=35.68,
            lon=139.76,
            stop_count=1,
        )
    ]

    with pytest.raises(ValueError, match="Refusing to overwrite rich transit build"):
        await service._commit_build(
            build_id=new_build_id,
            city_lower=city,
            agencies=[],
            lines=partial_lines,
            stations=partial_stations,
            patterns=[],
            pattern_stops=[],
            pattern_trips=[],
            station_lines=[],
            service_summaries=[],
            service_days={},
            shapes=[],
            transfers=[],
            fares=[],
            fare_rules=[],
            capabilities={},
            quality_report={},
            feed_valid_from=None,
            feed_valid_to=None,
        )

    cache_row = (
        (
            await session.execute(
                select(TransitCacheModel).where(TransitCacheModel.city == city)
            )
        )
        .scalars()
        .first()
    )
    assert cache_row is not None
    assert cache_row.active_build_id == old_build_id
