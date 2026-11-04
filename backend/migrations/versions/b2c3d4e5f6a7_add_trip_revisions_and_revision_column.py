"""Add revision column to trips, create trip_revisions and agent_actions tables

Revision ID: b2c3d4e5f6a7
Revises: a2b3c4d5e6f8
Create Date: 2026-11-04 18:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a2b3c4d5e6f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add revision to trips
    op.add_column(
        "trips",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
    )

    # 2. Create trip_revisions
    op.create_table(
        "trip_revisions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "trip_id",
            sa.String(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(length=32), nullable=False),
        sa.Column(
            "actor_detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("before", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("after", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_trip_revisions_id", "trip_revisions", ["id"], unique=False)
    op.create_index(
        "ix_trip_revisions_trip_id", "trip_revisions", ["trip_id"], unique=False
    )
    op.create_index(
        "ix_trip_revisions_trip_revision",
        "trip_revisions",
        ["trip_id", "revision"],
        unique=False,
    )

    # 3. Create agent_actions
    op.create_table(
        "agent_actions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "trip_id",
            sa.String(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("tool", sa.String(length=64), nullable=False),
        sa.Column("args_hash", sa.String(length=64), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_agent_actions_id", "agent_actions", ["id"], unique=False)
    op.create_index(
        "ix_agent_actions_user_id", "agent_actions", ["user_id"], unique=False
    )
    op.create_index(
        "ix_agent_actions_trip_id", "agent_actions", ["trip_id"], unique=False
    )
    op.create_index("ix_agent_actions_tool", "agent_actions", ["tool"], unique=False)


def downgrade() -> None:
    op.drop_table("agent_actions")
    op.drop_table("trip_revisions")
    op.drop_column("trips", "revision")
