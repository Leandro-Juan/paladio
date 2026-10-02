"""Add itinerary v2 tiering columns and poi_travel_cache table

Revision ID: 4d5e6f7a8b9c
Revises: 3c4d5e6f7a8b
Create Date: 2026-10-02 21:55:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4d5e6f7a8b9c"
down_revision: str | Sequence[str] | None = "3c4d5e6f7a8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add v2 tiering and taxonomy columns to attractions
    op.add_column(
        "attractions",
        sa.Column(
            "tier",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "tier_confidence",
            sa.String(),
            nullable=False,
            server_default="low",
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "tier_source",
            sa.String(),
            nullable=False,
            server_default="heuristic",
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "iconicity_score",
            sa.Float(),
            nullable=False,
            server_default="0.0",
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "taxonomy_category",
            sa.String(),
            nullable=False,
            server_default="art_culture",
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "category_id",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "visit_mode",
            sa.String(),
            nullable=False,
            server_default="full",
        ),
    )

    # Index on (city, tier) for fast candidate pool queries
    op.create_index(
        "ix_attractions_city_tier",
        "attractions",
        ["city", "tier"],
        unique=False,
    )

    # 2. Create poi_travel_cache table
    op.create_table(
        "poi_travel_cache",
        sa.Column(
            "origin_id",
            sa.String(),
            sa.ForeignKey("attractions.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "destination_id",
            sa.String(),
            sa.ForeignKey("attractions.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "mode",
            sa.String(),
            primary_key=True,
            nullable=False,
            server_default="transit",
        ),
        sa.Column(
            "duration_mins",
            sa.Float(),
            nullable=False,
        ),
        sa.Column(
            "cost_eur",
            sa.Float(),
            nullable=False,
            server_default="0.0",
        ),
        sa.Column(
            "distance_km",
            sa.Float(),
            nullable=False,
            server_default="0.0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Index on (origin_id, destination_id) for bidirectional pair lookups
    op.create_index(
        "idx_poi_travel_cache_pair",
        "poi_travel_cache",
        ["origin_id", "destination_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_poi_travel_cache_pair", table_name="poi_travel_cache")
    op.drop_table("poi_travel_cache")

    op.drop_index("ix_attractions_city_tier", table_name="attractions")
    op.drop_column("attractions", "visit_mode")
    op.drop_column("attractions", "category_id")
    op.drop_column("attractions", "taxonomy_category")
    op.drop_column("attractions", "iconicity_score")
    op.drop_column("attractions", "tier_source")
    op.drop_column("attractions", "tier_confidence")
    op.drop_column("attractions", "tier")
