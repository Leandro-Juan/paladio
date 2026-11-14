"""add photo_url and amenities to hotel_properties

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-11-14 11:55:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add photo_url and amenities columns to hotel_properties."""
    op.execute("ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS photo_url TEXT;")
    op.execute(
        "ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS amenities VARCHAR[];"
    )


def downgrade() -> None:
    """Drop photo_url and amenities columns from hotel_properties."""
    op.execute("ALTER TABLE hotel_properties DROP COLUMN IF EXISTS amenities;")
    op.execute("ALTER TABLE hotel_properties DROP COLUMN IF EXISTS photo_url;")
