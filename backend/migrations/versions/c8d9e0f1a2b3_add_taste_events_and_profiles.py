"""add taste_events and user_taste_profiles tables

Revision ID: c8d9e0f1a2b3
Revises: b9c0d1e2f3a4
Create Date: 2026-11-15 18:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create taste_events and user_taste_profiles tables for implicit personalization."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    op.create_table(
        "taste_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("trip_id", sa.String(), nullable=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.String(length=256), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("polarity", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("inferred_reason", sa.String(length=64), nullable=True),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_taste_events_id", "taste_events", ["id"], unique=False)
    op.create_index(
        "ix_taste_events_user_id", "taste_events", ["user_id"], unique=False
    )
    op.create_index(
        "ix_taste_events_trip_id", "taste_events", ["trip_id"], unique=False
    )
    op.create_index(
        "ix_taste_events_entity_type", "taste_events", ["entity_type"], unique=False
    )
    op.create_index(
        "ix_taste_events_entity_id", "taste_events", ["entity_id"], unique=False
    )
    op.create_index(
        "ix_taste_events_event_type", "taste_events", ["event_type"], unique=False
    )
    op.create_index(
        "ix_taste_events_created_at", "taste_events", ["created_at"], unique=False
    )

    op.create_table(
        "user_taste_profiles",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedding", Vector(768), nullable=True),
        sa.Column(
            "category_posteriors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "poi_priors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "contextual_profiles",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "behavioral_params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "economic_profile",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "ranker_weights",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index(
        "ix_user_taste_profiles_user_id",
        "user_taste_profiles",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Drop user_taste_profiles and taste_events tables."""
    op.drop_index("ix_user_taste_profiles_user_id", table_name="user_taste_profiles")
    op.drop_table("user_taste_profiles")

    op.drop_index("ix_taste_events_created_at", table_name="taste_events")
    op.drop_index("ix_taste_events_event_type", table_name="taste_events")
    op.drop_index("ix_taste_events_entity_id", table_name="taste_events")
    op.drop_index("ix_taste_events_entity_type", table_name="taste_events")
    op.drop_index("ix_taste_events_trip_id", table_name="taste_events")
    op.drop_index("ix_taste_events_user_id", table_name="taste_events")
    op.drop_index("ix_taste_events_id", table_name="taste_events")
    op.drop_table("taste_events")
