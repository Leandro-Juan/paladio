"""Add pgvector 768 embeddings and HNSW index to attractions

Revision ID: c3d4e5f6a7b8
Revises: b1c2d3e4f5a6
Create Date: 2026-09-09 17:50:00.000000

"""

from collections.abc import Sequence
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Ensure pgvector extension is enabled
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Add 768D embedding column to attractions
    op.execute(
        "ALTER TABLE attractions ADD COLUMN IF NOT EXISTS embedding vector(768);"
    )

    # 3. Create HNSW index for ultra-fast cosine similarity search
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_attractions_embedding_hnsw
        ON attractions USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_attractions_embedding_hnsw;")
    op.execute("ALTER TABLE attractions DROP COLUMN IF EXISTS embedding;")
