"""Add role to users

Revision ID: b1c2d3e4f5a6
Revises: 9a1b2c3d4e5f
Create Date: 2026-09-09 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "9a1b2c3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role", sa.String(), server_default=sa.text("'user'"), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "role")
