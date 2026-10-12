"""create trip tickets

Revision ID: 31038eead2dd
Revises: 5e6f7a8b9c0d
Create Date: 2026-10-12 12:33:02.120100

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "31038eead2dd"
down_revision: Union[str, Sequence[str], None] = "5e6f7a8b9c0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create trip_tickets table
    op.create_table(
        "trip_tickets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("trip_id", sa.String(), nullable=False),
        sa.Column("ticket_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("provider", sa.String(length=200), nullable=True),
        sa.Column("reference_code", sa.String(length=64), nullable=True),
        sa.Column("holder_name", sa.String(length=200), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_tz", sa.String(length=64), nullable=True),
        sa.Column("end_tz", sa.String(length=64), nullable=True),
        sa.Column("seat_or_room", sa.String(length=64), nullable=True),
        sa.Column("location_or_venue", sa.String(length=300), nullable=True),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True, server_default="EUR"),
        sa.Column("status", sa.String(), nullable=False, server_default="planned"),
        sa.Column("access_code", sa.Text(), nullable=True),
        sa.Column("barcode_value", sa.Text(), nullable=True),
        sa.Column("barcode_format", sa.String(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("source_ref", sa.String(), nullable=True),
        sa.Column(
            "user_modified", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("visibility", sa.String(), nullable=False, server_default="trip"),
        sa.Column("holder_user_id", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('planned', 'confirmed', 'used', 'cancelled')",
            name="check_trip_ticket_status",
        ),
        sa.CheckConstraint(
            "ticket_type IN ('flight', 'hotel', 'attraction', 'transit', 'other')",
            name="check_trip_ticket_type",
        ),
        sa.CheckConstraint(
            "end_time IS NULL OR end_time >= start_time",
            name="check_trip_ticket_time_range",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["holder_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_trip_tickets_itinerary_unique",
        "trip_tickets",
        ["trip_id", "source", "source_ref"],
        unique=True,
        postgresql_where=sa.text("source = 'itinerary'"),
    )
    op.create_index(
        "idx_trip_tickets_trip_start",
        "trip_tickets",
        ["trip_id", "start_time"],
        unique=False,
    )
    op.create_index(
        op.f("ix_trip_tickets_created_by"), "trip_tickets", ["created_by"], unique=False
    )
    op.create_index(
        op.f("ix_trip_tickets_holder_user_id"),
        "trip_tickets",
        ["holder_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_trip_tickets_id"), "trip_tickets", ["id"], unique=False)
    op.create_index(
        op.f("ix_trip_tickets_trip_id"), "trip_tickets", ["trip_id"], unique=False
    )

    # 2. Create trip_ticket_attachments table
    op.create_table(
        "trip_ticket_attachments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("ticket_id", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["ticket_id"], ["trip_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_trip_ticket_attachments_id"),
        "trip_ticket_attachments",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_trip_ticket_attachments_ticket_id"),
        "trip_ticket_attachments",
        ["ticket_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_trip_ticket_attachments_ticket_id"),
        table_name="trip_ticket_attachments",
    )
    op.drop_index(
        op.f("ix_trip_ticket_attachments_id"), table_name="trip_ticket_attachments"
    )
    op.drop_table("trip_ticket_attachments")

    op.drop_index(op.f("ix_trip_tickets_trip_id"), table_name="trip_tickets")
    op.drop_index(op.f("ix_trip_tickets_id"), table_name="trip_tickets")
    op.drop_index(op.f("ix_trip_tickets_holder_user_id"), table_name="trip_tickets")
    op.drop_index(op.f("ix_trip_tickets_created_by"), table_name="trip_tickets")
    op.drop_index("idx_trip_tickets_trip_start", table_name="trip_tickets")
    op.drop_index("idx_trip_tickets_itinerary_unique", table_name="trip_tickets")
    op.drop_table("trip_tickets")
