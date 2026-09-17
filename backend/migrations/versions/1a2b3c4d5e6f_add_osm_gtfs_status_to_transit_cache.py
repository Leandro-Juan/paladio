"""Add osm_status and gtfs_status to transit_cache table

Revision ID: 1a2b3c4d5e6f
Revises: f1a2b3c4d5e6
Create Date: 2026-09-17 11:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1a2b3c4d5e6f"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transit_cache",
        sa.Column(
            "osm_status",
            sa.String(),
            nullable=False,
            server_default="PENDING",
        ),
    )
    op.add_column(
        "transit_cache",
        sa.Column(
            "gtfs_status",
            sa.String(),
            nullable=False,
            server_default="PENDING",
        ),
    )
    op.execute(
        "UPDATE transit_cache SET osm_status = 'READY', gtfs_status = 'READY' WHERE status = 'READY'"
    )


def downgrade() -> None:
    op.drop_column("transit_cache", "gtfs_status")
    op.drop_column("transit_cache", "osm_status")
