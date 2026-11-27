"""add trip_generation_jobs table

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-11-26 17:30:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create trip_generation_jobs table for detached background trip generation."""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS trip_generation_jobs (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR NULL REFERENCES users(id) ON DELETE CASCADE,
            thread_id VARCHAR(128) NOT NULL UNIQUE,
            destination VARCHAR NOT NULL,
            title VARCHAR NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            stage VARCHAR(64) NOT NULL DEFAULT 'STARTING_INFERENCE',
            stage_message TEXT NULL,
            prompt TEXT NOT NULL,
            request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            interrupt_type VARCHAR(64) NULL,
            interrupt_payload JSONB NULL,
            guardrail_errors JSONB NULL,
            error_message TEXT NULL,
            trip_id VARCHAR NULL REFERENCES trips(id) ON DELETE SET NULL,
            acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at TIMESTAMPTZ NULL
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_trip_generation_jobs_id ON trip_generation_jobs (id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_trip_generation_jobs_user_id ON trip_generation_jobs (user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_trip_generation_jobs_thread_id ON trip_generation_jobs (thread_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_trip_generation_jobs_status ON trip_generation_jobs (status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_trip_generation_jobs_trip_id ON trip_generation_jobs (trip_id);"
    )


def downgrade() -> None:
    """Drop trip_generation_jobs table."""
    op.execute("DROP TABLE IF EXISTS trip_generation_jobs;")
