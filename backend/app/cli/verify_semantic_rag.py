#!/usr/bin/env python3
"""
Manual Verification Utility for 768D Semantic RAG & Taste Vector Extraction.
Demonstrates end-to-end vector generation, pgvector cosine similarity extraction,
and semantic discrimination across multiple cities.
"""

import asyncio
import os

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
    vector = await provider.embed_text(query_prompt)
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
