"""Phase 1 Deal Engine Storage Layer

Revision ID: b7c8d9e0f1a2
Revises: 4a5b6c7d8e9f
Create Date: 2026-10-16 20:00:00.000000

"""

from collections.abc import Sequence
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "4a5b6c7d8e9f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add status column to trips table for deal proposal tracking
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'trips' AND column_name = 'status'
            ) THEN
                ALTER TABLE trips ADD COLUMN status VARCHAR NOT NULL DEFAULT 'active';
            END IF;
        END $$;
    """)

    # 2. Create raw market price ticks table (partitioned by observed_at)
    op.execute("""
        CREATE TABLE IF NOT EXISTS market_price_ticks (
            id VARCHAR NOT NULL,
            observed_at TIMESTAMPTZ NOT NULL,
            asset_type VARCHAR NOT NULL,
            origin_iata VARCHAR(3),
            destination_code VARCHAR NOT NULL,
            dest_airport_iata VARCHAR(3),
            depart_date DATE NOT NULL,
            return_date DATE NOT NULL,
            nights INT NOT NULL,
            lead_time_days INT NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            base_price_cents BIGINT NOT NULL,
            landed_price_cents BIGINT,
            stat VARCHAR NOT NULL DEFAULT 'single',
            sample_n INT,
            quality_tier VARCHAR,
            source VARCHAR NOT NULL,
            source_class VARCHAR NOT NULL DEFAULT 'cache',
            is_aggregated BOOLEAN NOT NULL DEFAULT FALSE,
            source_observed_at TIMESTAMPTZ,
            content_hash BYTEA NOT NULL,
            ingest_run_id VARCHAR,
            is_exploration BOOLEAN NOT NULL DEFAULT FALSE,
            metadata_json JSONB,
            CONSTRAINT pk_market_price_ticks PRIMARY KEY (id, observed_at)
        );
    """)

    # 3. Enable TimescaleDB Hypertable on market_price_ticks
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable(
                    'market_price_ticks',
                    'observed_at',
                    chunk_time_interval => INTERVAL '3 days',
                    if_not_exists => TRUE
                );
            END IF;
        END $$;
    """)

    # 4. Create explicit indexes on market_price_ticks
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_ticks_route_date_desc 
        ON market_price_ticks (asset_type, origin_iata, destination_code, depart_date, observed_at DESC);
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_ticks_content_hash_obs 
        ON market_price_ticks (content_hash, observed_at);
    """)

    # 5. Add compression and retention policies
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                BEGIN
                    ALTER TABLE market_price_ticks SET (
                        timescaledb.compress,
                        timescaledb.compress_segmentby = 'asset_type, origin_iata, destination_code',
                        timescaledb.compress_orderby = 'observed_at DESC'
                    );
                    PERFORM add_compression_policy('market_price_ticks', INTERVAL '7 days', if_not_exists => TRUE);
                    PERFORM add_retention_policy('market_price_ticks', INTERVAL '540 days', if_not_exists => TRUE);
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE 'Compression or retention policy setup skipped or already active: %', SQLERRM;
                END;
            END IF;
        END $$;
    """)

    # 6. Create price_daily rollup table
    op.execute("""
        CREATE TABLE IF NOT EXISTS price_daily (
            bucket DATE NOT NULL,
            asset_type VARCHAR NOT NULL,
            origin_iata VARCHAR(3) NOT NULL DEFAULT '',
            destination_code VARCHAR NOT NULL,
            depart_date DATE NOT NULL,
            nights INT NOT NULL,
            source_class VARCHAR NOT NULL,
            source VARCHAR NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            min_base BIGINT NOT NULL,
            n_ticks INT NOT NULL,
            CONSTRAINT pk_price_daily PRIMARY KEY (
                bucket, asset_type, origin_iata, destination_code, 
                depart_date, nights, source_class, source, currency
            )
        );
    """)

    # 7. Create route_baselines table
    op.execute("""
        CREATE TABLE IF NOT EXISTS route_baselines (
            asset_type VARCHAR NOT NULL,
            origin_iata VARCHAR(3) NOT NULL DEFAULT '',
            destination_code VARCHAR NOT NULL,
            depart_month INT NOT NULL DEFAULT 0,
            lead_bucket VARCHAR NOT NULL DEFAULT 'all',
            source_class VARCHAR NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            level VARCHAR NOT NULL,
            n_rows INT NOT NULL,
            n_obs_days INT NOT NULL,
            n_depart_dates INT NOT NULL,
            q02 BIGINT NOT NULL,
            q05 BIGINT NOT NULL,
            q10 BIGINT NOT NULL,
            q25 BIGINT NOT NULL,
            q50 BIGINT NOT NULL,
            q75 BIGINT NOT NULL,
            window_start DATE NOT NULL,
            window_end DATE NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_route_baselines PRIMARY KEY (
                asset_type, origin_iata, destination_code, 
                depart_month, lead_bucket, source_class, currency, level
            )
        );
    """)

    # 8. Create fee_models table
    op.execute("""
        CREATE TABLE IF NOT EXISTS fee_models (
            asset_type VARCHAR NOT NULL,
            source VARCHAR NOT NULL,
            destination_code VARCHAR NOT NULL DEFAULT 'ALL',
            ratio_p50 NUMERIC(5, 3) NOT NULL,
            n INT NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT pk_fee_models PRIMARY KEY (asset_type, source, destination_code)
        );
    """)

    # 9. Create destination_airports mapping table
    op.execute("""
        CREATE TABLE IF NOT EXISTS destination_airports (
            city_id VARCHAR NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
            iata VARCHAR(3) NOT NULL,
            is_primary BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT pk_destination_airports PRIMARY KEY (city_id, iata)
        );
    """)

    # 10. Create deal_watch_alerts table
    op.execute("""
        CREATE TABLE IF NOT EXISTS deal_watch_alerts (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            origin_iata VARCHAR(3) NOT NULL,
            destinations TEXT[] NOT NULL,
            earliest_date DATE NOT NULL,
            latest_date DATE NOT NULL,
            min_nights INT NOT NULL DEFAULT 1,
            max_nights INT NOT NULL DEFAULT 7,
            travelers INT NOT NULL DEFAULT 1,
            bags_needed INT NOT NULL DEFAULT 0,
            max_budget_cents BIGINT NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            max_package_ratio NUMERIC(4, 2),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_scanned_at TIMESTAMPTZ,
            CONSTRAINT ck_deal_watch_alerts_dates CHECK (earliest_date <= latest_date),
            CONSTRAINT ck_deal_watch_alerts_nights CHECK (min_nights <= max_nights),
            CONSTRAINT ck_deal_watch_alerts_budget CHECK (max_budget_cents > 0),
            CONSTRAINT ck_deal_watch_alerts_travelers CHECK (travelers >= 1 AND travelers <= 2)
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_deal_watch_alerts_gin_dest 
        ON deal_watch_alerts USING gin (destinations);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_deal_watch_alerts_scan 
        ON deal_watch_alerts (origin_iata, is_active, earliest_date, latest_date);
    """)

    # 11. Create deal_candidates table
    op.execute("""
        CREATE TABLE IF NOT EXISTS deal_candidates (
            id VARCHAR PRIMARY KEY,
            idempotency_key VARCHAR UNIQUE NOT NULL,
            asset_type VARCHAR NOT NULL DEFAULT 'package',
            origin_iata VARCHAR(3) NOT NULL,
            destination_code VARCHAR NOT NULL,
            depart_date DATE NOT NULL,
            return_date DATE NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            cached_flight_base_cents BIGINT NOT NULL,
            lodging_estimate_cents BIGINT NOT NULL,
            est_total_cents BIGINT NOT NULL,
            est_savings_cents BIGINT NOT NULL,
            package_ratio NUMERIC(5, 3) NOT NULL,
            baseline_level_used VARCHAR NOT NULL,
            confidence VARCHAR NOT NULL DEFAULT 'medium',
            detector_version VARCHAR NOT NULL DEFAULT 'v3',
            status VARCHAR NOT NULL DEFAULT 'candidate',
            reject_reason TEXT,
            live_queries_used INT NOT NULL DEFAULT 0,
            live_cost_cents BIGINT NOT NULL DEFAULT 0,
            verification_json JSONB,
            is_exploration BOOLEAN NOT NULL DEFAULT FALSE,
            detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            verified_at TIMESTAMPTZ
        );
    """)

    # 12. Create deal_events table
    op.execute("""
        CREATE TABLE IF NOT EXISTS deal_events (
            id VARCHAR PRIMARY KEY,
            candidate_id VARCHAR NOT NULL REFERENCES deal_candidates(id) ON DELETE CASCADE,
            alert_id VARCHAR NOT NULL REFERENCES deal_watch_alerts(id) ON DELETE CASCADE,
            user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR NOT NULL DEFAULT 'pending',
            package_json JSONB NOT NULL,
            alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            user_feedback TEXT,
            feedback_at TIMESTAMPTZ
        );
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_events_alert_candidate 
        ON deal_events (alert_id, candidate_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_deal_events_status_alerted 
        ON deal_events (status, alerted_at);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS deal_events CASCADE;")
    op.execute("DROP TABLE IF EXISTS deal_candidates CASCADE;")
    op.execute("DROP TABLE IF EXISTS deal_watch_alerts CASCADE;")
    op.execute("DROP TABLE IF EXISTS destination_airports CASCADE;")
    op.execute("DROP TABLE IF EXISTS fee_models CASCADE;")
    op.execute("DROP TABLE IF EXISTS route_baselines CASCADE;")
    op.execute("DROP TABLE IF EXISTS price_daily CASCADE;")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                BEGIN
                    PERFORM remove_retention_policy('market_price_ticks', if_exists => TRUE);
                    PERFORM remove_compression_policy('market_price_ticks', if_exists => TRUE);
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;
            END IF;
        END $$;
    """)
    op.execute("DROP TABLE IF EXISTS market_price_ticks CASCADE;")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'trips' AND column_name = 'status'
            ) THEN
                ALTER TABLE trips DROP COLUMN status;
            END IF;
        END $$;
    """)
