"""add deal_watch_alerts participants column and traveler limit

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-11-24 20:52:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Align deal_watch_alerts schema with DealWatchAlertModel."""
    op.execute(
        "ALTER TABLE deal_watch_alerts ADD COLUMN IF NOT EXISTS participants JSONB NULL;"
    )
    op.execute("ALTER TABLE deal_watch_alerts ALTER COLUMN max_nights SET DEFAULT 30;")
    op.execute(
        "ALTER TABLE deal_watch_alerts DROP CONSTRAINT IF EXISTS ck_deal_watch_alerts_travelers;"
    )
    op.execute(
        "ALTER TABLE deal_watch_alerts ADD CONSTRAINT ck_deal_watch_alerts_travelers CHECK (travelers >= 1 AND travelers <= 16);"
    )


def downgrade() -> None:
    """Revert deal_watch_alerts schema changes."""
    op.execute(
        "ALTER TABLE deal_watch_alerts DROP CONSTRAINT IF EXISTS ck_deal_watch_alerts_travelers;"
    )
    op.execute(
        "ALTER TABLE deal_watch_alerts ADD CONSTRAINT ck_deal_watch_alerts_travelers CHECK (travelers >= 1 AND travelers <= 2);"
    )
    op.execute("ALTER TABLE deal_watch_alerts ALTER COLUMN max_nights SET DEFAULT 7;")
    op.execute("ALTER TABLE deal_watch_alerts DROP COLUMN IF EXISTS participants;")
