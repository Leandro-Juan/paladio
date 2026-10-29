"""Add system_config table for sovereign dynamic system configuration and auto-updater state.

Revision ID: e5f6a7b8c9d0
Revises: c9d0e1f2a3b4
Create Date: 2026-10-29 18:38:00
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS system_config (
            key VARCHAR(128) PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS system_config CASCADE;")
