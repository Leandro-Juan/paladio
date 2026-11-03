"""Add trip_collections and trip_collection_items tables

Revision ID: a2b3c4d5e6f8
Revises: 9c8d7e6f5a4b
Create Date: 2026-11-03 21:03:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f8"
down_revision: str | Sequence[str] | None = "9c8d7e6f5a4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create trip_collections table
    op.create_table(
        "trip_collections",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "trip_id",
            sa.String(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(), nullable=True, server_default="#0F4C5C"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # 2. Create trip_collection_items table
    op.create_table(
        "trip_collection_items",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "collection_id",
            sa.String(),
            sa.ForeignKey("trip_collections.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("poi_id", sa.String(), nullable=False, index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("collection_id", "poi_id", name="uq_trip_collection_poi"),
    )


def downgrade() -> None:
    op.drop_table("trip_collection_items")
    op.drop_table("trip_collections")
