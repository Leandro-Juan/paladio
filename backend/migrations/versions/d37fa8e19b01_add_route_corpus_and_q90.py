"""Add route_corpus_status table and q90/confidence to route_baselines

Revision ID: d37fa8e19b01
Revises: c26ed6c8216f
Create Date: 2026-10-18 14:35:00.000000

"""

from collections.abc import Sequence
from alembic import op

revision: str = "d37fa8e19b01"
down_revision: str | Sequence[str] | None = "c26ed6c8216f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add q90 and confidence to route_baselines
    op.execute("""
        ALTER TABLE route_baselines 
        ADD COLUMN IF NOT EXISTS q90 BIGINT,
        ADD COLUMN IF NOT EXISTS confidence VARCHAR(32) DEFAULT 'provisional';
    """)

    # 2. Create route_corpus_status table
    op.execute("""
        CREATE TABLE IF NOT EXISTS route_corpus_status (
            origin_iata VARCHAR(3) NOT NULL,
            destination_code VARCHAR NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'building',
            confidence VARCHAR(32) NOT NULL DEFAULT 'provisional',
            ticks_ingested INT NOT NULL DEFAULT 0,
            depart_dates_count INT NOT NULL DEFAULT 0,
            min_price_cents BIGINT,
            max_price_cents BIGINT,
            median_price_cents BIGINT,
            last_backfill_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            error_message TEXT,
            PRIMARY KEY (origin_iata, destination_code)
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_route_corpus_status_lookup
        ON route_corpus_status (origin_iata, destination_code, status);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS route_corpus_status;")
    op.execute("""
        ALTER TABLE route_baselines 
        DROP COLUMN IF EXISTS q90,
        DROP COLUMN IF EXISTS confidence;
    """)
