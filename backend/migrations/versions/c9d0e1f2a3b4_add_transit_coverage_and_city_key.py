"""Add transit_coverage table, city_key to transit_cache, and is_interpolated to transit_pattern_stops.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-29 18:25:00
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update transit_cache: add city_key column
    op.execute("""
        ALTER TABLE transit_cache
        ADD COLUMN IF NOT EXISTS city_key VARCHAR(128);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_cache_city_key
        ON transit_cache(city_key);
    """)

    # 2. Update transit_pattern_stops: add is_interpolated column
    op.execute("""
        ALTER TABLE transit_pattern_stops
        ADD COLUMN IF NOT EXISTS is_interpolated BOOLEAN DEFAULT FALSE NOT NULL;
    """)

    # 3. Create transit_coverage table
    op.execute("""
        CREATE TABLE IF NOT EXISTS transit_coverage (
            city_key VARCHAR(128) PRIMARY KEY,
            city_name VARCHAR(256) NOT NULL,
            country_code VARCHAR(2) NOT NULL,
            tier VARCHAR(16) NOT NULL,
            reason_code VARCHAR(64),
            feed_ids TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
            stage_reached VARCHAR(32) DEFAULT 'RESOLVED' NOT NULL,
            quality JSONB DEFAULT '{}'::JSONB NOT NULL,
            polygon JSONB,
            population INTEGER DEFAULT 0 NOT NULL,
            last_checked_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_coverage_country
        ON transit_coverage(country_code);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transit_coverage_tier
        ON transit_coverage(tier);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS transit_coverage;")
    op.execute(
        "ALTER TABLE transit_pattern_stops DROP COLUMN IF EXISTS is_interpolated;"
    )
    op.execute("DROP INDEX IF EXISTS idx_transit_cache_city_key;")
    op.execute("ALTER TABLE transit_cache DROP COLUMN IF EXISTS city_key;")
