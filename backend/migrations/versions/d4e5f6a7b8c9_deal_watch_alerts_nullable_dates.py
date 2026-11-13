"""make earliest_date and latest_date nullable in deal_watch_alerts

Revision ID: d4e5f6a7b8c9
Revises: a1b2c3d4e5f9
Create Date: 2026-11-12 19:56:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d4e5f6a7b8c9"
down_revision = "a1b2c3d4e5f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "deal_watch_alerts", "earliest_date", existing_type=sa.Date(), nullable=True
    )
    op.alter_column(
        "deal_watch_alerts", "latest_date", existing_type=sa.Date(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "deal_watch_alerts", "earliest_date", existing_type=sa.Date(), nullable=False
    )
    op.alter_column(
        "deal_watch_alerts", "latest_date", existing_type=sa.Date(), nullable=False
    )
