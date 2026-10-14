"""poi hydration v2 schema

Revision ID: 4a5b6c7d8e9f
Revises: 31038eead2dd
Create Date: 2026-10-14 16:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4a5b6c7d8e9f"
down_revision: str | Sequence[str] | None = "31038eead2dd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Enable required PostgreSQL extensions and immutable unaccent function
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent;")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
          SELECT public.unaccent('public.unaccent', $1)
        $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
        """
    )

    # 2. Add rich document columns to attractions table
    op.add_column(
        "attractions",
        sa.Column(
            "aliases",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column("neighborhood", sa.String(), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("wikidata_id", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("wikipedia_title", sa.String(), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("website", sa.String(), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("description_source", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "doc_quality",
            sa.String(length=1),
            server_default="C",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "facets",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "sitelinks_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "pageviews_30d",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "hours_known",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "daily_windows",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "has_split_hours",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column("embedding_text", sa.Text(), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("embedding_text_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column("embedding_model", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "embedding_version",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column("embedded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "provenance",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "attractions",
        sa.Column(
            "hydration_status",
            sa.String(length=16),
            server_default="RAW",
            nullable=False,
        ),
    )

    # 3. Create indices on attractions
    op.create_index("ix_attractions_neighborhood", "attractions", ["neighborhood"])
    op.create_index("ix_attractions_wikidata_id", "attractions", ["wikidata_id"])
    op.create_index("ix_attractions_doc_quality", "attractions", ["doc_quality"])
    op.create_index(
        "ix_attractions_hydration_status", "attractions", ["hydration_status"]
    )
    op.create_index(
        "ix_attractions_embedding_text_hash", "attractions", ["embedding_text_hash"]
    )

    # Trigram, FTS, Facets JSONB, and HNSW indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_attractions_name_trgm 
        ON attractions USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_attractions_fts 
        ON attractions USING gin (
          to_tsvector('simple', immutable_unaccent(coalesce(name, '') || ' ' || coalesce(neighborhood, '') || ' ' || coalesce(description, '')))
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_attractions_facets_gin 
        ON attractions USING gin (facets jsonb_path_ops);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_attractions_embedding_hnsw 
        ON attractions USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128);
        """
    )

    # 4. Create poi_price_catalog table
    op.create_table(
        "poi_price_catalog",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("city_id", sa.String(), nullable=True),
        sa.Column("normalized_name", sa.String(), nullable=False),
        sa.Column("wikidata_id", sa.String(length=32), nullable=True),
        sa.Column("price_eur", sa.Float(), nullable=False),
        sa.Column("is_free", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column(
            "verified_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_poi_price_catalog_id", "poi_price_catalog", ["id"])
    op.create_index("ix_poi_price_catalog_city_id", "poi_price_catalog", ["city_id"])
    op.create_index(
        "ix_poi_price_catalog_normalized_name", "poi_price_catalog", ["normalized_name"]
    )
    op.create_index(
        "ix_poi_price_catalog_wikidata_id", "poi_price_catalog", ["wikidata_id"]
    )
    op.create_index(
        "ix_poi_price_catalog_city_name",
        "poi_price_catalog",
        ["city_id", "normalized_name"],
    )


def downgrade() -> None:
    op.drop_table("poi_price_catalog")
    op.execute("DROP INDEX IF EXISTS ix_attractions_embedding_hnsw;")
    op.execute("DROP INDEX IF EXISTS ix_attractions_facets_gin;")
    op.execute("DROP INDEX IF EXISTS ix_attractions_fts;")
    op.execute("DROP INDEX IF EXISTS ix_attractions_name_trgm;")
    op.drop_index("ix_attractions_embedding_text_hash", table_name="attractions")
    op.drop_index("ix_attractions_hydration_status", table_name="attractions")
    op.drop_index("ix_attractions_doc_quality", table_name="attractions")
    op.drop_index("ix_attractions_wikidata_id", table_name="attractions")
    op.drop_index("ix_attractions_neighborhood", table_name="attractions")

    for col in (
        "hydration_status",
        "provenance",
        "embedded_at",
        "embedding_version",
        "embedding_model",
        "embedding_text_hash",
        "embedding_text",
        "has_split_hours",
        "daily_windows",
        "hours_known",
        "pageviews_30d",
        "sitelinks_count",
        "facets",
        "doc_quality",
        "description_source",
        "description",
        "website",
        "wikipedia_title",
        "wikidata_id",
        "neighborhood",
        "aliases",
    ):
        op.drop_column("attractions", col)

    op.execute("DROP FUNCTION IF EXISTS immutable_unaccent(text);")
