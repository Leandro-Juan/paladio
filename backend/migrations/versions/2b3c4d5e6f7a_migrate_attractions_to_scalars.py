"""Migrate attractions to typed scalar and array columns and drop legacy JSONB

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-09-19 22:05:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2b3c4d5e6f7a"
down_revision: str | Sequence[str] | None = "1a2b3c4d5e6f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add scalar and vector columns if not exist
    op.execute(
        """
        ALTER TABLE attractions
        ADD COLUMN IF NOT EXISTS open_time_mins_by_day INTEGER[] NOT NULL DEFAULT '{480,480,480,480,480,480,480}',
        ADD COLUMN IF NOT EXISTS close_time_mins_by_day INTEGER[] NOT NULL DEFAULT '{1320,1320,1320,1320,1320,1320,1320}',
        ADD COLUMN IF NOT EXISTS duration_mins INTEGER NOT NULL DEFAULT 60,
        ADD COLUMN IF NOT EXISTS cost_eur FLOAT NOT NULL DEFAULT 0.0,
        ADD COLUMN IF NOT EXISTS cost_is_estimated BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS cost_source VARCHAR,
        ADD COLUMN IF NOT EXISTS osm_opening_hours VARCHAR;
        """
    )

    # 2. Drop legacy schedule and financials columns if they exist
    op.execute(
        """
        ALTER TABLE attractions
        DROP COLUMN IF EXISTS schedule,
        DROP COLUMN IF EXISTS financials;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE attractions
        ADD COLUMN IF NOT EXISTS schedule JSONB NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS financials JSONB NOT NULL DEFAULT '{}';
        """
    )
    op.execute(
        """
        ALTER TABLE attractions
        DROP COLUMN IF EXISTS open_time_mins_by_day,
        DROP COLUMN IF EXISTS close_time_mins_by_day,
        DROP COLUMN IF EXISTS duration_mins,
        DROP COLUMN IF EXISTS cost_eur,
        DROP COLUMN IF EXISTS cost_is_estimated,
        DROP COLUMN IF EXISTS cost_source,
        DROP COLUMN IF EXISTS osm_opening_hours;
        """
    )
