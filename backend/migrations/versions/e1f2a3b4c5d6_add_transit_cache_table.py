"""Add transit_cache table for public transit schedule and tile caching

Revision ID: e1f2a3b4c5d6
Revises: c3d4e5f6a7b8
Create Date: 2026-09-09 18:55:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transit_cache",
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="BUILDING"),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gtfs_feed_name", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("city"),
    )
    op.create_index(
        op.f("ix_transit_cache_city"), "transit_cache", ["city"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_transit_cache_city"), table_name="transit_cache")
    op.drop_table("transit_cache")
