"""make trip_collections.trip_id nullable

Revision ID: a1b2c3d4e5f7
Revises: f7a8b9c0d1e2
Create Date: 2026-11-15 17:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow standalone dashboard collections without a required trip_id."""
    op.alter_column(
        "trip_collections",
        "trip_id",
        existing_type=sa.String(),
        nullable=True,
    )
    op.drop_constraint(
        "trip_collections_trip_id_fkey",
        "trip_collections",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "trip_collections_trip_id_fkey",
        "trip_collections",
        "trips",
        ["trip_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Restore non-null CASCADE foreign key on trip_collections.trip_id."""
    op.drop_constraint(
        "trip_collections_trip_id_fkey",
        "trip_collections",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "trip_collections_trip_id_fkey",
        "trip_collections",
        "trips",
        ["trip_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "trip_collections",
        "trip_id",
        existing_type=sa.String(),
        nullable=False,
    )
