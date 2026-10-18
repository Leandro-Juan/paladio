"""Phase 2 Real Deal Engine Ingestion Schema

Revision ID: c26ed6c8216f
Revises: b7c8d9e0f1a2
Create Date: 2026-10-18 12:00:00.000000

"""

from collections.abc import Sequence
from alembic import op

revision: str = "c26ed6c8216f"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create lodging_offers table
    op.execute("""
        CREATE TABLE IF NOT EXISTS lodging_offers (
            id VARCHAR PRIMARY KEY,
            destination_code VARCHAR NOT NULL,
            city VARCHAR NOT NULL,
            provider VARCHAR NOT NULL,
            property_id VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            stars DOUBLE PRECISION,
            review_score DOUBLE PRECISION,
            review_count INT,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            adults INT NOT NULL DEFAULT 2,
            price_total_cents BIGINT NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            taxes_included BOOLEAN NOT NULL DEFAULT TRUE,
            deep_link TEXT,
            observed_at TIMESTAMPTZ NOT NULL,
            content_hash BYTEA NOT NULL,
            is_live BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_lodging_offers_dest_dates
            ON lodging_offers (destination_code, check_in, check_out, observed_at DESC)
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_lodging_offers_hash_obs
            ON lodging_offers (content_hash, observed_at)
    """)

    # 2. Create provider_health tracking table
    op.execute("""
        CREATE TABLE IF NOT EXISTS provider_health (
            provider VARCHAR NOT NULL,
            asset_type VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'ok',
            last_ok_at TIMESTAMPTZ,
            failure_count INT NOT NULL DEFAULT 0,
            consecutive_failures INT NOT NULL DEFAULT 0,
            last_error TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_provider_health PRIMARY KEY (provider, asset_type)
        )
    """)

    # 3. Create fx_rates table for dynamic ECB daily rates
    op.execute("""
        CREATE TABLE IF NOT EXISTS fx_rates (
            base_currency VARCHAR(3) NOT NULL,
            quote_currency VARCHAR(3) NOT NULL,
            rate NUMERIC(12, 6) NOT NULL,
            as_of DATE NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_fx_rates PRIMARY KEY (base_currency, quote_currency, as_of)
        )
    """)

    # 4. Add baggage_budget_cents to deal_watch_alerts if not exists
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'deal_watch_alerts' AND column_name = 'baggage_budget_cents'
            ) THEN
                ALTER TABLE deal_watch_alerts ADD COLUMN baggage_budget_cents BIGINT NULL;
            END IF;
        END $$;
    """)

    # 5. Update fee_models to support provider-level learning and real sample counts
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'fee_models' AND column_name = 'provider'
            ) THEN
                ALTER TABLE fee_models ADD COLUMN provider VARCHAR NOT NULL DEFAULT 'all';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'fee_models' AND column_name = 'n_pairs'
            ) THEN
                ALTER TABLE fee_models ADD COLUMN n_pairs INT NOT NULL DEFAULT 0;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS fx_rates CASCADE")
    op.execute("DROP TABLE IF EXISTS provider_health CASCADE")
    op.execute("DROP TABLE IF EXISTS lodging_offers CASCADE")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'deal_watch_alerts' AND column_name = 'baggage_budget_cents'
            ) THEN
                ALTER TABLE deal_watch_alerts DROP COLUMN baggage_budget_cents;
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'fee_models' AND column_name = 'provider'
            ) THEN
                ALTER TABLE fee_models DROP COLUMN provider;
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'fee_models' AND column_name = 'n_pairs'
            ) THEN
                ALTER TABLE fee_models DROP COLUMN n_pairs;
            END IF;
        END $$;
    """)
