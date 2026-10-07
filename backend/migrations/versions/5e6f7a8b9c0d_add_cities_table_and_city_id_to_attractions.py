"""Add cities table and city_id to attractions with automatic backfill

Revision ID: 5e6f7a8b9c0d
Revises: 4d5e6f7a8b9c
Create Date: 2026-10-04 18:56:00.000000

"""

from collections.abc import Sequence
import json
import statistics

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "5e6f7a8b9c0d"
down_revision: str | Sequence[str] | None = "4d5e6f7a8b9c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ_TO_COUNTRY = {
    "Europe/Madrid": "ES",
    "Europe/Lisbon": "PT",
    "Europe/Paris": "FR",
    "Europe/Brussels": "BE",
    "Europe/London": "GB",
    "Europe/Vienna": "AT",
    "Europe/Rome": "IT",
    "Asia/Tokyo": "JP",
}

COUNTRY_TO_CURRENCY = {
    "ES": "EUR",
    "PT": "EUR",
    "FR": "EUR",
    "BE": "EUR",
    "AT": "EUR",
    "IT": "EUR",
    "DE": "EUR",
    "GB": "GBP",
    "JP": "JPY",
    "US": "USD",
}


def upgrade() -> None:
    # 1. Create cities table
    op.create_table(
        "cities",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "aliases", sa.ARRAY(sa.String()), nullable=False, server_default="{}"
        ),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("center_lat", sa.Float(), nullable=False),
        sa.Column("center_lon", sa.Float(), nullable=False),
        sa.Column("bbox", sa.ARRAY(sa.Float()), nullable=False),
        sa.Column("radius_km", sa.Float(), nullable=False, server_default="15.0"),
        sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="EUR"
        ),
        sa.Column(
            "profile",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_cities_id", "cities", ["id"])
    op.create_index("ix_cities_name", "cities", ["name"])
    op.create_index("ix_cities_country_code", "cities", ["country_code"])

    # 2. Add city_id column to attractions
    op.add_column(
        "attractions",
        sa.Column(
            "city_id",
            sa.String(),
            sa.ForeignKey("cities.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_attractions_city_id", "attractions", ["city_id"])

    # 3. Backfill cities from existing attractions
    bind = op.get_bind()
    try:
        from timezonefinder import TimezoneFinder

        tf = TimezoneFinder()
    except Exception:
        tf = None

    res = bind.execute(
        sa.text(
            "SELECT DISTINCT lower(city) FROM attractions WHERE city IS NOT NULL AND city != ''"
        )
    )
    raw_cities = [r[0] for r in res.fetchall()]

    for city_lower in raw_cities:
        coords_res = bind.execute(
            sa.text("""
            SELECT (location->>'latitude')::float, (location->>'longitude')::float
            FROM attractions
            WHERE lower(city) = :c AND location->>'latitude' IS NOT NULL AND location->>'longitude' IS NOT NULL
        """),
            {"c": city_lower},
        )
        coords = coords_res.fetchall()
        if not coords:
            continue

        lats = [c[0] for c in coords]
        lons = [c[1] for c in coords]
        med_lat = round(float(statistics.median(lats)), 6)
        med_lon = round(float(statistics.median(lons)), 6)
        bbox = [
            round(min(lats), 6),
            round(min(lons), 6),
            round(max(lats), 6),
            round(max(lons), 6),
        ]

        tz = "UTC"
        if tf:
            tz = tf.timezone_at(lat=med_lat, lng=med_lon) or "UTC"

        country = TZ_TO_COUNTRY.get(tz, "ES")
        currency = COUNTRY_TO_CURRENCY.get(country, "EUR")
        display_name = city_lower.title()
        canon_id = f"{city_lower}_{country.lower()}"

        bind.execute(
            sa.text("""
            INSERT INTO cities (id, name, aliases, country_code, center_lat, center_lon, bbox, radius_km, timezone, currency, profile, ingested_at)
            VALUES (:id, :name, :aliases, :country_code, :center_lat, :center_lon, :bbox, :radius_km, :timezone, :currency, :profile, NOW())
            ON CONFLICT (id) DO NOTHING
        """),
            {
                "id": canon_id,
                "name": display_name,
                "aliases": [city_lower, display_name],
                "country_code": country,
                "center_lat": med_lat,
                "center_lon": med_lon,
                "bbox": bbox,
                "radius_km": 15.0,
                "timezone": tz,
                "currency": currency,
                "profile": json.dumps({"source": "backfill_from_attractions"}),
            },
        )

        bind.execute(
            sa.text("""
            UPDATE attractions
            SET city_id = :cid
            WHERE lower(city) = :c
        """),
            {"cid": canon_id, "c": city_lower},
        )


def downgrade() -> None:
    op.drop_index("ix_attractions_city_id", table_name="attractions")
    op.drop_column("attractions", "city_id")
    op.drop_index("ix_cities_country_code", table_name="cities")
    op.drop_index("ix_cities_name", table_name="cities")
    op.drop_index("ix_cities_id", table_name="cities")
    op.drop_table("cities")
