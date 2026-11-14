"""add visit_status to trip_collection_items

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-11-14 20:50:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add visit_status column to trip_collection_items."""
    op.add_column(
        "trip_collection_items",
        sa.Column(
            "visit_status",
            sa.String(),
            server_default="want_to_go",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Remove visit_status column from trip_collection_items."""
    op.drop_column("trip_collection_items", "visit_status")
