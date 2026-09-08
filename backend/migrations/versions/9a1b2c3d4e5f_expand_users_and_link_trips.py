"""Expand users and link trips

Revision ID: 9a1b2c3d4e5f
Revises: 8f2c3d4e5f6a
Create Date: 2026-09-08 15:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "9a1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "8f2c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add new user columns
    op.add_column("users", sa.Column("email", sa.String(), nullable=True))
    op.add_column("users", sa.Column("username", sa.String(), nullable=True))
    op.add_column("users", sa.Column("hashed_password", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "preferences", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )
    op.alter_column("users", "embedding", nullable=True)

    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # Link trips to users
    op.add_column("trips", sa.Column("user_id", sa.String(), nullable=True))
    op.create_index(op.f("ix_trips_user_id"), "trips", ["user_id"], unique=False)
    op.create_foreign_key(
        "fk_trips_user_id_users",
        "trips",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_trips_user_id_users", "trips", type_="foreignkey")
    op.drop_index(op.f("ix_trips_user_id"), table_name="trips")
    op.drop_column("trips", "user_id")

    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_column("users", "preferences")
    op.drop_column("users", "is_active")
    op.drop_column("users", "hashed_password")
    op.drop_column("users", "username")
    op.drop_column("users", "email")
