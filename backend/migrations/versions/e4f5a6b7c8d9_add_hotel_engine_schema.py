"""Add comprehensive hotel engine schema

Revision ID: e4f5a6b7c8d9
Revises: d37fa8e19b01
Create Date: 2026-10-21 16:45:00.000000

"""

from collections.abc import Sequence
from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | Sequence[str] | None = "d37fa8e19b01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. hotel_properties table (canonical property entity)
    op.execute("""
        CREATE TABLE IF NOT EXISTS hotel_properties (
            id VARCHAR PRIMARY KEY,
            destination_code VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            name_norm VARCHAR NOT NULL,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            geohash7 VARCHAR(12),
            stars DOUBLE PRECISION,
            property_type VARCHAR(32) NOT NULL DEFAULT 'hotel',
            osm_id VARCHAR(64),
            address TEXT,
            first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_properties_dest ON hotel_properties (destination_code)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_properties_name_norm ON hotel_properties (destination_code, name_norm)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_properties_geohash ON hotel_properties (geohash7)"
    )

    # 2. hotel_property_sources table (maps provider property IDs to canonical hotel_properties)
    op.execute("""
        CREATE TABLE IF NOT EXISTS hotel_property_sources (
            id VARCHAR PRIMARY KEY,
            property_id VARCHAR NOT NULL REFERENCES hotel_properties(id) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL,
            provider_property_id VARCHAR(128) NOT NULL,
            deep_link TEXT,
            confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_hotel_provider_source UNIQUE (provider, provider_property_id)
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_property_sources_prop_id ON hotel_property_sources (property_id)"
    )

    # 3. hotel_rate_observations table (append-only observation ticks)
    op.execute("""
        CREATE TABLE IF NOT EXISTS hotel_rate_observations (
            id VARCHAR PRIMARY KEY,
            property_id VARCHAR NOT NULL REFERENCES hotel_properties(id) ON DELETE CASCADE,
            destination_code VARCHAR NOT NULL,
            provider VARCHAR(32) NOT NULL,
            scan_run_id VARCHAR(64) NOT NULL,
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            nights INT NOT NULL,
            adults INT NOT NULL DEFAULT 2,
            price_total_cents BIGINT NOT NULL,
            price_nightly_cents BIGINT NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            taxes_included BOOLEAN NOT NULL DEFAULT TRUE,
            free_cancellation BOOLEAN,
            board VARCHAR(32),
            room_type VARCHAR(128),
            review_score DOUBLE PRECISION,
            review_count INT,
            available BOOLEAN NOT NULL DEFAULT TRUE,
            deep_link TEXT,
            content_hash BYTEA NOT NULL,
            confidence VARCHAR(16) NOT NULL DEFAULT 'high',
            observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_obs_dest_dates ON hotel_rate_observations (destination_code, check_in, nights, observed_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_obs_scan_run ON hotel_rate_observations (scan_run_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_obs_property ON hotel_rate_observations (property_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_obs_hash_obs ON hotel_rate_observations (content_hash, observed_at)"
    )

    # 4. hotel_scan_runs table (telemetry and audit for each stay ingestion run)
    op.execute("""
        CREATE TABLE IF NOT EXISTS hotel_scan_runs (
            id VARCHAR(64) PRIMARY KEY,
            destination_code VARCHAR NOT NULL,
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            stay_spec JSONB,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            provider_counts JSONB,
            properties_seen INT NOT NULL DEFAULT 0,
            universe_size INT,
            coverage_ratio DOUBLE PRECISION,
            error_message TEXT
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hotel_scan_runs_dest_dates ON hotel_scan_runs (destination_code, check_in, check_out)"
    )

    # 5. lodging_providers table (dynamic provider registry & quota manager)
    op.execute("""
        CREATE TABLE IF NOT EXISTS lodging_providers (
            name VARCHAR(32) PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            priority INT NOT NULL DEFAULT 1,
            daily_budget INT NOT NULL DEFAULT 1000,
            rate_limit_per_min INT NOT NULL DEFAULT 30,
            min_parse_yield DOUBLE PRECISION NOT NULL DEFAULT 0.5,
            last_yield DOUBLE PRECISION,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS lodging_providers CASCADE")
    op.execute("DROP TABLE IF EXISTS hotel_scan_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS hotel_rate_observations CASCADE")
    op.execute("DROP TABLE IF EXISTS hotel_property_sources CASCADE")
    op.execute("DROP TABLE IF EXISTS hotel_properties CASCADE")
