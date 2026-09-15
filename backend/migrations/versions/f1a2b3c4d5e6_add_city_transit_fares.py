"""Add city_transit_fares table for dynamic public transit pricing

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-09-15 16:35:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "city_transit_fares",
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("country", sa.String(), nullable=True),
        sa.Column("currency", sa.String(), nullable=False, server_default="EUR"),
        sa.Column("single_fare", sa.Float(), nullable=False),
        sa.Column("pass_24h_price", sa.Float(), nullable=True),
        sa.Column("pass_24h_name", sa.String(), nullable=True),
        sa.Column(
            "pass_24h_includes_airport",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "airport_surcharge",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
        sa.Column(
            "airport_station_keywords",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "is_estimated",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("source", sa.String(), nullable=True),
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
        op.f("ix_city_transit_fares_city"), "city_transit_fares", ["city"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_city_transit_fares_city"), table_name="city_transit_fares")
    op.drop_table("city_transit_fares")
