"""flight pipeline rebuild schema: aviasales-first zero synthetic data

Revision ID: f3a4b5c6d7e8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-12 11:15:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f3a4b5c6d7e8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update market_price_ticks
    op.alter_column(
        "market_price_ticks", "return_date", existing_type=sa.Date(), nullable=True
    )
    op.alter_column(
        "market_price_ticks", "nights", existing_type=sa.Integer(), nullable=True
    )

    op.add_column(
        "market_price_ticks",
        sa.Column(
            "trip_type", sa.String(length=16), server_default="one_way", nullable=False
        ),
    )
    op.add_column(
        "market_price_ticks",
        sa.Column("market", sa.String(length=16), server_default="es", nullable=False),
    )
    op.add_column(
        "market_price_ticks",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "market_price_ticks",
        sa.Column("original_price_cents", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "market_price_ticks",
        sa.Column("original_currency", sa.String(length=3), nullable=True),
    )
    op.add_column("market_price_ticks", sa.Column("fx_rate", sa.Float(), nullable=True))
    op.add_column(
        "market_price_ticks", sa.Column("fx_rate_date", sa.Date(), nullable=True)
    )

    # 2. Create market_sweep_runs
    op.create_table(
        "market_sweep_runs",
        sa.Column("run_id", sa.String(), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("routes_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("routes_ok", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("calls_made", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("calls_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
    )

    # 3. Create route_month_coverage
    op.create_table(
        "route_month_coverage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("run_date", sa.Date(), nullable=False),
        sa.Column("origin", sa.String(length=3), nullable=False),
        sa.Column("dest", sa.String(length=3), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("days_in_month", sa.Integer(), nullable=False),
        sa.Column("days_with_price", sa.Integer(), nullable=False),
        sa.Column("newest_found_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("oldest_found_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("market", sa.String(), nullable=False, server_default="es"),
    )
    op.create_index(
        "ix_route_month_coverage_lookup",
        "route_month_coverage",
        ["origin", "dest", "month", "run_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_route_month_coverage_lookup", table_name="route_month_coverage")
    op.drop_table("route_month_coverage")
    op.drop_table("market_sweep_runs")

    op.drop_column("market_price_ticks", "fx_rate_date")
    op.drop_column("market_price_ticks", "fx_rate")
    op.drop_column("market_price_ticks", "original_currency")
    op.drop_column("market_price_ticks", "original_price_cents")
    op.drop_column("market_price_ticks", "last_seen_at")
    op.drop_column("market_price_ticks", "market")
    op.drop_column("market_price_ticks", "trip_type")

    op.alter_column(
        "market_price_ticks", "nights", existing_type=sa.Integer(), nullable=False
    )
    op.alter_column(
        "market_price_ticks", "return_date", existing_type=sa.Date(), nullable=False
    )
