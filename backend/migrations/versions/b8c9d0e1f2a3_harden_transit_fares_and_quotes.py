"""Harden transit fares schema, add transit_fare_rules, transit_fare_quotes, transit_feeds, and transit_provider_health.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-29 17:35:00
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update transit_fares: add agency_id, fare_name, remove default on currency
    op.execute("""
        ALTER TABLE transit_fares
        ADD COLUMN IF NOT EXISTS agency_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS fare_name VARCHAR(256);
    """)
    op.execute("""
        ALTER TABLE transit_fares
        ALTER COLUMN currency DROP DEFAULT;
    """)

    # 2. Create transit_fare_rules
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_fare_rules (
            id BIGSERIAL PRIMARY KEY,
            build_id VARCHAR(36) NOT NULL,
            city VARCHAR(128) NOT NULL,
            fare_id VARCHAR(128) NOT NULL,
            route_id VARCHAR(128),
            origin_id VARCHAR(128),
            destination_id VARCHAR(128),
            contains_id VARCHAR(128),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_fare_rules_fare
        ON transit_fare_rules(build_id, city, fare_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_fare_rules_zones
        ON transit_fare_rules(build_id, city, origin_id, destination_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_fare_rules_route
        ON transit_fare_rules(build_id, city, route_id);
    """)

    # 3. Create transit_fare_quotes
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_fare_quotes (
            id BIGSERIAL PRIMARY KEY,
            city VARCHAR(128) NOT NULL,
            operator VARCHAR(128),
            product_type VARCHAR(64) NOT NULL,
            rider VARCHAR(32) NOT NULL DEFAULT 'adult',
            medium VARCHAR(32) NOT NULL DEFAULT 'ticket',
            from_station_id VARCHAR(128),
            to_station_id VARCHAR(128),
            zone_from VARCHAR(64),
            zone_to VARCHAR(64),
            amount_minor INTEGER NOT NULL,
            currency VARCHAR(8) NOT NULL,
            tier INTEGER NOT NULL,
            source_url TEXT,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            valid_from TIMESTAMPTZ,
            valid_to TIMESTAMPTZ,
            evidence_hash VARCHAR(64) NOT NULL,
            evidence_quote TEXT,
            confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            amount_eur_at_fetch DOUBLE PRECISION
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_fare_quotes_city_status
        ON transit_fare_quotes(city, status, tier);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_fare_quotes_stations
        ON transit_fare_quotes(city, from_station_id, to_station_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_fare_quotes_evidence
        ON transit_fare_quotes(evidence_hash);
    """)

    # 4. Create transit_feeds
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_feeds (
            id VARCHAR(128) PRIMARY KEY,
            city VARCHAR(128) NOT NULL,
            operator VARCHAR(128),
            feed_name VARCHAR(256) NOT NULL,
            feed_url TEXT NOT NULL,
            auth_type VARCHAR(32) NOT NULL DEFAULT 'none',
            bbox JSONB,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            last_fetched_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_feeds_city
        ON transit_feeds(city, is_active);
    """)

    # 5. Create transit_provider_health
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_provider_health (
            provider_id VARCHAR(128) PRIMARY KEY,
            provider_name VARCHAR(128) NOT NULL,
            success_count INTEGER NOT NULL DEFAULT 0,
            failure_count INTEGER NOT NULL DEFAULT 0,
            consecutive_failures INTEGER NOT NULL DEFAULT 0,
            circuit_open BOOLEAN NOT NULL DEFAULT FALSE,
            circuit_opened_at TIMESTAMPTZ,
            last_error TEXT,
            last_latency_ms DOUBLE PRECISION,
            last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)

    # 6. Drop default values from city_transit_fares
    op.execute("""
        ALTER TABLE city_transit_fares
        ALTER COLUMN currency DROP DEFAULT,
        ALTER COLUMN single_fare DROP DEFAULT,
        ALTER COLUMN airport_surcharge DROP DEFAULT;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS transit_provider_health;")
    op.execute("DROP TABLE IF EXISTS transit_feeds;")
    op.execute("DROP TABLE IF EXISTS transit_fare_quotes;")
    op.execute("DROP TABLE IF EXISTS transit_fare_rules;")
    op.execute("""
        ALTER TABLE transit_fares
        DROP COLUMN IF EXISTS fare_name,
        DROP COLUMN IF EXISTS agency_id;
    """)
