"""orchestration and provider health telemetry

Revision ID: a1b2c3d4e5f9
Revises: f3a4b5c6d7e8
Create Date: 2026-11-12 12:15:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "provider_health",
        sa.Column(
            "consecutive_failure_days", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "provider_health",
        sa.Column("last_failure_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "provider_health",
        sa.Column("last_coverage", sa.Float(), nullable=True),
    )
    op.add_column(
        "provider_health",
        sa.Column("last_run_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("provider_health", "last_run_id")
    op.drop_column("provider_health", "last_coverage")
    op.drop_column("provider_health", "last_failure_date")
    op.drop_column("provider_health", "consecutive_failure_days")
