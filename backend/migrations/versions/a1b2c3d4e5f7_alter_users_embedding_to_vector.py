"""Alter users embedding column from jsonb to vector(768)

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-15 20:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f7"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Ensure pgvector extension is enabled
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Convert users.embedding from jsonb to vector(768) if currently jsonb
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'users'
                  AND column_name = 'embedding'
                  AND data_type = 'jsonb'
            ) THEN
                UPDATE users SET embedding = NULL WHERE jsonb_array_length(embedding) != 768;
                ALTER TABLE users ALTER COLUMN embedding TYPE vector(768) USING (embedding::text::vector);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE users ALTER COLUMN embedding TYPE jsonb USING (embedding::text::jsonb);
        """
    )
