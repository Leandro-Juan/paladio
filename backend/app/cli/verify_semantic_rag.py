#!/usr/bin/env python3
"""
Manual Verification Utility for 768D Semantic RAG & Taste Vector Extraction.
Demonstrates end-to-end vector generation, pgvector cosine similarity extraction,
and semantic discrimination across multiple cities.
"""

import argparse
import asyncio
import os

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/paladio"
)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)


async def generate_health_report(city: str | None = None) -> None:
    """Computes comprehensive vector health and city coverage diagnostics."""
    print("\n" + "=" * 80)
    print(
        f"📊 PALADIO VECTOR HEALTH & CITY COVERAGE DIAGNOSTIC: {city or 'ALL CITIES'}"
    )
    print("=" * 80)

    engine = create_async_engine(DATABASE_URL, poolclass=NullPool, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        city_clause = "WHERE lower(city) = lower(:city)" if city else ""
        params = {"city": city} if city else {}

        # 1. Volume and Tier breakdown
        query_overview = text(
            f"""
            SELECT 
                COUNT(*) as total_pois,
                COUNT(CASE WHEN tier = 1 THEN 1 END) as t1,
                COUNT(CASE WHEN tier = 2 THEN 1 END) as t2,
                COUNT(CASE WHEN tier = 3 THEN 1 END) as t3,
                COUNT(CASE WHEN tier = 4 THEN 1 END) as t4,
                COUNT(CASE WHEN lower(category) IN ('restaurant', 'cafe', 'bar', 'food', 'bistrot', 'nightlife') THEN 1 END) as dining_nightlife,
                COUNT(CASE WHEN embedding IS NULL THEN 1 END) as null_embeddings
            FROM attractions
            {city_clause}
            """
        )
        res = await session.execute(query_overview, params)
        overview = res.mappings().one()

        total = overview["total_pois"]
        if total == 0:
            print(f"⚠️ No attractions found for scope: {city or 'all'}")
            await engine.dispose()
            return

        sights = total - overview["dining_nightlife"]
        null_emb = overview["null_embeddings"]
        pct_null = (null_emb / total) * 100.0

        print(f"Total POIs:              {total}")
        print(f"Sights:                  {sights}")
        print(f"Dining / Nightlife:      {overview['dining_nightlife']}")
        print(
            f"Tier Breakdown:          T1: {overview['t1']} | T2: {overview['t2']} | T3: {overview['t3']} | T4: {overview['t4']}"
        )
        print(f"NULL Embeddings:         {null_emb} ({pct_null:.2f}%)")

        # 2. Vector inspection (Uniform vector check & embedding distribution)
        query_vectors = text(
            f"""
            SELECT id, name, category, embedding
            FROM attractions
            {city_clause}
            AND embedding IS NOT NULL
            """
        )
        v_res = await session.execute(query_vectors, params)
        rows = v_res.fetchall()

        uniform_count = 0
        vectors_by_id = {}
        names_by_id = {}
        target_uniform_val = 1.0 / np.sqrt(768)

        for row in rows:
            p_id, p_name, p_cat, emb = row
            if emb is not None:
                arr = np.asarray(emb, dtype=np.float32)
                if len(arr) == 768:
                    if np.max(np.abs(arr - target_uniform_val)) < 1e-4:
                        uniform_count += 1
                    else:
                        vectors_by_id[p_id] = arr
                        names_by_id[p_id] = p_name

        pct_uniform = (uniform_count / total) * 100.0
        print(f"Uniform / Fake Vectors:  {uniform_count} ({pct_uniform:.2f}%)")

        # 3. Embedding text stats if column exists
        try:
            query_text_stats = text(
                f"""
                SELECT 
                    COUNT(DISTINCT embedding_text) as distinct_texts,
                    COUNT(embedding_text_hash) - COUNT(DISTINCT embedding_text_hash) as dup_hashes
                FROM attractions
                {city_clause}
                WHERE embedding_text IS NOT NULL
                """
            )
            t_res = await session.execute(query_text_stats, params)
            t_stats = t_res.mappings().one()
            d_texts = t_stats["distinct_texts"] or 0
            dup_h = t_stats["dup_hashes"] or 0
            print(
                f"Distinct Texts / Total:  {d_texts} / {total} (Ratio: {d_texts / max(1, total):.2f})"
            )
            print(f"Duplicate Text Hashes:   {dup_h}")
        except Exception:
            # Columns not yet migrated in Phase 0
            pass

        # 4. Nearest-Neighbor Cosine Similarity Distribution (Boilerplate collapse detection)
        if len(vectors_by_id) >= 10:
            print(
                "\nCalculating Nearest-Neighbor Cosine Similarity distribution across differently named POIs..."
            )
            sample_ids = list(vectors_by_id.keys())[:250]
            top1_similarities = []

            for sid in sample_ids:
                s_vec = vectors_by_id[sid]
                s_name = names_by_id[sid].lower().strip()
                best_sim = -1.0

                for oid in sample_ids:
                    if oid == sid:
                        continue
                    o_name = names_by_id[oid].lower().strip()
                    if s_name == o_name:
                        continue
                    o_vec = vectors_by_id[oid]
                    sim = float(np.dot(s_vec, o_vec))
                    best_sim = max(best_sim, sim)

                if best_sim > -1.0:
                    top1_similarities.append(best_sim)

            if top1_similarities:
                arr_sim = np.asarray(top1_similarities)
                p10 = float(np.percentile(arr_sim, 10))
                p50 = float(np.percentile(arr_sim, 50))
                p90 = float(np.percentile(arr_sim, 90))
                print(
                    f"Top-1 NN Cosine Similarity: p10={p10:.4f} | median(p50)={p50:.4f} | p90={p90:.4f}"
                )
                if p50 > 0.85:
                    print(
                        "⚠️ WARNING: High median similarity (> 0.85) indicates potential BOILERPLATE COLLAPSE!"
                    )
                else:
                    print("✓ Semantic discrimination is healthy (median < 0.85).")

    await engine.dispose()
    print("=" * 80 + "\n")


async def verify_invented_vector(
    city: str, query_label: str, query_prompt: str, limit: int = 6
):
    provider = OllamaEmbeddingProvider()
    print(f"\n{'=' * 80}")
    print(f"🎯 INVENTED TASTE VECTOR: [{query_label}]")
    print(f"   City Scope:    {city}")
    print(f'   Prompt Text:   "{query_prompt}"')
    print(f"{'=' * 80}")

    print("⚡ Generating 768D dense embedding via Ollama (nomic-embed-text)...")
    vector = await provider.embed_text(query_prompt, input_type="query")
    print(
        f"✓ Vector generated: dim={len(vector)}, L2-norm={sum(x*x for x in vector)**0.5:.4f}"
    )

    engine = create_async_engine(DATABASE_URL, poolclass=NullPool, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        repo = SqlPoiRepository(session)
        print(
            f"🔍 Querying PostgreSQL pgvector HNSW index (attractions <=> vector) in '{city}'..."
        )
        candidates = await repo.find_semantic_candidates(city, vector, limit=limit)

    await engine.dispose()

    print(
        f"\n🏆 Top {len(candidates)} Extracted Candidates (Ranked by Cosine Similarity):"
    )
    print("-" * 80)
    print(f"{'Rank':<5} | {'Similarity':<10} | {'Category':<12} | {'Name'}")
    print("-" * 80)

    for rank, (attraction, similarity) in enumerate(candidates, 1):
        bar_len = int(similarity * 20)
        sim_bar = "█" * bar_len + "░" * (20 - bar_len)
        print(
            f"#{rank:<4} | {similarity:.4f} {sim_bar} | {attraction.category:<12} | {attraction.name}"
        )

    print("-" * 80)
    return candidates


async def main():
    parser = argparse.ArgumentParser(
        description="Paladio Semantic RAG Verification & Health Diagnostic"
    )
    parser.add_argument(
        "--health-report",
        action="store_true",
        help="Generate vector health and coverage report",
    )
    parser.add_argument(
        "--city", type=str, default=None, help="Optional city to filter diagnostic"
    )
    args = parser.parse_args()

    if args.health_report:
        await generate_health_report(city=args.city)
        return

    print(
        "================================================================================"
    )
    print(
        "      PALADIO 768D SEMANTIC RAG MANUAL VERIFICATION & AUDIT RUNNER             "
    )
    print(
        "================================================================================"
    )

    # Scenario 1: Invented Vector - Royal Dynasties & Palatial Monuments
    await verify_invented_vector(
        city="Madrid",
        query_label="ROYAL PALACES & MONARCHIC MONUMENTS",
        query_prompt=(
            "grandiose royal palace state rooms, ornate monarchic architecture, "
            "bourbon kingdom monuments, and majestic historical thrones"
        ),
        limit=6,
    )

    # Scenario 2: Invented Vector - Panoramic Sunset Viewpoints
    await verify_invented_vector(
        city="Lisbon",
        query_label="PANORAMIC SCENIC MIRADOUROS",
        query_prompt=(
            "panoramic scenic viewpoints, elevated hilltop miradors, "
            "city skyline observation decks, and sunset terraces"
        ),
        limit=6,
    )

    # Scenario 3: Invented Vector - Avant-Garde & Contemporary Fine Arts
    await verify_invented_vector(
        city="Paris",
        query_label="FINE ARTS & AVANT-GARDE GALLERIES",
        query_prompt=(
            "fine arts museum, surrealist paintings, modern sculpture galleries, "
            "and bohemian artistic exhibitions"
        ),
        limit=6,
    )


if __name__ == "__main__":
    asyncio.run(main())
