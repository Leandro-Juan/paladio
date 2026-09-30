"""Add trip_participants and trip_expenses tables

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
Create Date: 2026-09-29 17:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "3c4d5e6f7a8b"
down_revision: str | Sequence[str] | None = "2b3c4d5e6f7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create trip_participants table
    op.create_table(
        "trip_participants",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "trip_id",
            sa.String(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False, server_default="traveler"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # 2. Create trip_expenses table
    op.create_table(
        "trip_expenses",
        sa.Column("id", sa.String(), primary_key=True, index=True),
        sa.Column(
            "trip_id",
            sa.String(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "payer_id",
            sa.String(),
            sa.ForeignKey("trip_participants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="EUR"),
        sa.Column("category", sa.String(), nullable=False, server_default="other"),
        sa.Column("split_type", sa.String(), nullable=False, server_default="equal"),
        sa.Column("splits", JSONB, nullable=False, server_default="[]"),
        sa.Column("expense_date", sa.String(), nullable=True),
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
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("trip_expenses")
    op.drop_table("trip_participants")
