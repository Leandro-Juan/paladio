"""Drop legacy city_transit_fares table.

Revision ID: 9c8d7e6f5a4b
Revises: e5f6a7b8c9d0
Create Date: 2026-10-31 16:40:00
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "9c8d7e6f5a4b"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS city_transit_fares CASCADE;")


def downgrade() -> None:
    pass
