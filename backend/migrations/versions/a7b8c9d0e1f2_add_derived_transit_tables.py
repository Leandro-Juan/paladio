"""Add derived transit tables and cache extensions

Revision ID: a7b8c9d0e1f2
Revises: e4f5a6b7c8d9
Create Date: 2026-10-28 11:15:00.000000

"""

from collections.abc import Sequence
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Extend transit_cache with derived build lifecycle and capabilities
    op.execute("""
        ALTER TABLE transit_cache
        ADD COLUMN IF NOT EXISTS derived_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS derived_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS active_build_id VARCHAR(36) NULL,
        ADD COLUMN IF NOT EXISTS capabilities JSONB NULL,
        ADD COLUMN IF NOT EXISTS feed_valid_from TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS feed_valid_to TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS quality JSONB NULL;
    """)

    # 2. transit_agencies
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_agencies (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            agency_id VARCHAR(128) NOT NULL,
            name VARCHAR(256) NOT NULL,
            url VARCHAR(512),
            timezone VARCHAR(64),
            phone VARCHAR(64),
            fare_url VARCHAR(512),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (build_id, city, agency_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_agencies_city ON transit_agencies(city, build_id);"
    )

    # 3. transit_lines
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_lines (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            line_id VARCHAR(128) NOT NULL,
            agency_id VARCHAR(128),
            short_name VARCHAR(64),
            long_name VARCHAR(256),
            mode VARCHAR(32) NOT NULL,
            color VARCHAR(16) NOT NULL,
            text_color VARCHAR(16) NOT NULL,
            color_source VARCHAR(16) NOT NULL DEFAULT 'gtfs',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (build_id, city, line_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_lines_city ON transit_lines(city, build_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_lines_mode ON transit_lines(build_id, city, mode);"
    )

    # 4. transit_stations (collapsed physical stations)
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_stations (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            station_id VARCHAR(128) NOT NULL,
            name VARCHAR(256) NOT NULL,
            original_name VARCHAR(256),
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            wheelchair_boarding INTEGER,
            stop_count INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (build_id, city, station_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_stations_spatial ON transit_stations(build_id, city, lat, lon);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_stations_name ON transit_stations(build_id, city, name);"
    )

    # 5. transit_patterns
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_patterns (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            pattern_id VARCHAR(64) NOT NULL,
            line_id VARCHAR(128) NOT NULL,
            direction_id INTEGER NOT NULL DEFAULT 0,
            headsign VARCHAR(256),
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,
            stop_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (build_id, city, pattern_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_patterns_line ON transit_patterns(build_id, city, line_id, direction_id);"
    )

    # 6. transit_pattern_stops
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_pattern_stops (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            pattern_id VARCHAR(64) NOT NULL,
            stop_sequence INTEGER NOT NULL,
            station_id VARCHAR(128) NOT NULL,
            time_offset_seconds INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (build_id, city, pattern_id, stop_sequence)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_pattern_stops_station ON transit_pattern_stops(build_id, city, station_id);"
    )

    # 7. transit_pattern_trips
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_pattern_trips (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            pattern_id VARCHAR(64) NOT NULL,
            service_id VARCHAR(128) NOT NULL,
            departure_seconds INTEGER NOT NULL,
            trip_id VARCHAR(128),
            PRIMARY KEY (build_id, city, pattern_id, service_id, departure_seconds)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_trips_pattern_dep ON transit_pattern_trips(build_id, city, pattern_id, departure_seconds);"
    )

    # 8. transit_station_lines
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_station_lines (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            station_id VARCHAR(128) NOT NULL,
            line_id VARCHAR(128) NOT NULL,
            direction_id INTEGER NOT NULL DEFAULT 0,
            headsign VARCHAR(256),
            PRIMARY KEY (build_id, city, station_id, line_id, direction_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_station_lines_station ON transit_station_lines(build_id, city, station_id);"
    )

    # 9. transit_service_summary
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_service_summary (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            station_id VARCHAR(128) NOT NULL,
            line_id VARCHAR(128) NOT NULL,
            direction_id INTEGER NOT NULL DEFAULT 0,
            day_type VARCHAR(16) NOT NULL,
            first_departure_seconds INTEGER,
            last_departure_seconds INTEGER,
            headways_by_band JSONB,
            PRIMARY KEY (build_id, city, station_id, line_id, direction_id, day_type)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_service_sum ON transit_service_summary(build_id, city, station_id, day_type);"
    )

    # 10. transit_service_days
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_service_days (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            service_id VARCHAR(128) NOT NULL,
            start_date INTEGER NOT NULL,
            end_date INTEGER NOT NULL,
            monday INTEGER NOT NULL DEFAULT 0,
            tuesday INTEGER NOT NULL DEFAULT 0,
            wednesday INTEGER NOT NULL DEFAULT 0,
            thursday INTEGER NOT NULL DEFAULT 0,
            friday INTEGER NOT NULL DEFAULT 0,
            saturday INTEGER NOT NULL DEFAULT 0,
            sunday INTEGER NOT NULL DEFAULT 0,
            exception_dates JSONB,
            PRIMARY KEY (build_id, city, service_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_service_dates ON transit_service_days(build_id, city, start_date, end_date);"
    )

    # 11. transit_shapes
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_shapes (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            shape_id VARCHAR(128) NOT NULL,
            line_id VARCHAR(128),
            coordinates JSONB NOT NULL,
            PRIMARY KEY (build_id, city, shape_id)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transit_shapes_line ON transit_shapes(build_id, city, line_id);"
    )

    # 12. transit_transfers
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_transfers (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            from_station_id VARCHAR(128) NOT NULL,
            to_station_id VARCHAR(128) NOT NULL,
            transfer_type INTEGER NOT NULL DEFAULT 0,
            min_transfer_time INTEGER,
            PRIMARY KEY (build_id, city, from_station_id, to_station_id)
        );
    """)

    # 13. transit_fares
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_fares (
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            fare_id VARCHAR(128) NOT NULL,
            price DOUBLE PRECISION NOT NULL,
            currency VARCHAR(8) NOT NULL DEFAULT 'EUR',
            payment_method INTEGER NOT NULL DEFAULT 0,
            transfers INTEGER,
            transfer_duration INTEGER,
            PRIMARY KEY (build_id, city, fare_id)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS transit_fares;")
    op.execute("DROP TABLE IF EXISTS transit_transfers;")
    op.execute("DROP TABLE IF EXISTS transit_shapes;")
    op.execute("DROP TABLE IF EXISTS transit_service_days;")
    op.execute("DROP TABLE IF EXISTS transit_service_summary;")
    op.execute("DROP TABLE IF EXISTS transit_station_lines;")
    op.execute("DROP TABLE IF EXISTS transit_pattern_trips;")
    op.execute("DROP TABLE IF EXISTS transit_pattern_stops;")
    op.execute("DROP TABLE IF EXISTS transit_patterns;")
    op.execute("DROP TABLE IF EXISTS transit_stations;")
    op.execute("DROP TABLE IF EXISTS transit_lines;")
    op.execute("DROP TABLE IF EXISTS transit_agencies;")
    op.execute("""
        ALTER TABLE transit_cache
        DROP COLUMN IF EXISTS quality,
        DROP COLUMN IF EXISTS feed_valid_to,
        DROP COLUMN IF EXISTS feed_valid_from,
        DROP COLUMN IF EXISTS capabilities,
        DROP COLUMN IF EXISTS active_build_id,
        DROP COLUMN IF EXISTS derived_at,
        DROP COLUMN IF EXISTS derived_status;
    """)
