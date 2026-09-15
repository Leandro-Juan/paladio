import asyncio
import math
import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import asyncpg
import httpx
import numpy as np
import pytest
import pytest_asyncio
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.domain.entities.poi import Poi
from app.engine.scoring.semantic_learning import (
    CATEGORY_ANCHORS,
    SemanticLearningEngine,
)
from app.infrastructure.engine.ml_scorer import MLScorer
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)
from app.infrastructure.scoring.hybrid_scorer import HybridSovereignScorer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
MAIN_DATABASE_URL = os.getenv(
    "MAIN_DATABASE_URL",
    f"postgresql+asyncpg://postgres:postgres@{postgres_host}:5432/paladio",
)
if MAIN_DATABASE_URL.startswith("postgresql://"):
    MAIN_DATABASE_URL = MAIN_DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


def is_ollama_online() -> bool:
    """Checks if Ollama is accessible and has nomic-embed-text ready across host or Docker container."""
    env_base = os.getenv("OLLAMA_BASE_URL")
    if env_base:
        urls_to_try = [env_base.rstrip("/")]
    else:
        urls_to_try = [
            "http://127.0.0.1:11435",
            "http://localhost:11435",
            "http://llm:11434",
            "http://localhost:11434",
        ]
    for base in urls_to_try:
        if not base:
            continue
        try:
            resp = httpx.get(f"{base}/api/tags", timeout=1.5)
            if resp.status_code == 200:
                models = [m.get("name", "") for m in resp.json().get("models", [])]
                if any("nomic-embed-text" in m for m in models):
                    return True
        except (httpx.HTTPError, OSError):
            continue
    return False


def is_live_seeded_db_ready() -> bool:
    """Checks whether the database at MAIN_DATABASE_URL contains the attractions table and seeded POIs."""

    async def _check() -> bool:
        try:
            url = MAIN_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(url, timeout=2.0)
            try:
                exists = await conn.fetchval(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'attractions'"
                )
                if not exists:
                    return False
                count = await conn.fetchval("SELECT count(*) FROM attractions")
                return (count or 0) >= 10
            finally:
                await conn.close()
        except Exception:
            return False

    try:
        return asyncio.run(_check())
    except Exception:
        return False


ollama_required = pytest.mark.skipif(
    not is_ollama_online(),
    reason="Requires live Ollama container running nomic-embed-text embedding model",
)

live_db_and_ollama_required = pytest.mark.skipif(
    not is_live_seeded_db_ready() or not is_ollama_online(),
    reason="Requires live Docker PostgreSQL with seeded attractions table and live Ollama container",
)


@pytest.fixture(scope="module")
def embedding_provider():
    return OllamaEmbeddingProvider()


@pytest_asyncio.fixture
async def live_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides a fresh isolated connection per test using NullPool to prevent event loop collisions."""
    engine = create_async_engine(MAIN_DATABASE_URL, poolclass=NullPool, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
    await engine.dispose()


# ---------------------------------------------------------------------------
# 1. Mathematical Invariants & Extreme Numerical Stress Tests
# ---------------------------------------------------------------------------
class TestVectorMathematicalInvariantsAndStress:
    """
    Exhaustive tests for vector algebra, L2-normalization, boundary conditions,
    and numerical stability under extreme inputs and drift.
    """

    @ollama_required
    @pytest.mark.asyncio
    async def test_ollama_vector_dimensionality_and_l2_norm(self, embedding_provider):
        """Arrange, Act, Assert: Verify strict 768D size and exact L2-norm."""
        prompts = [
            "short prompt",
            "A medium length travel description of historic castles and bridges.",
            "Detailed culinary journey through traditional markets, wine cellars, and bakeries.",
        ]
        vectors = await embedding_provider.embed_batch(prompts)
        assert len(vectors) == len(prompts)

        for vec in vectors:
            assert len(vec) == 768, f"Expected 768D, got {len(vec)}"
            norm = np.linalg.norm(vec)
            assert abs(norm - 1.0) < 1e-4, f"Vector not unit-normalized: {norm}"

    @ollama_required
    @pytest.mark.asyncio
    async def test_extreme_and_adversarial_text_inputs(self, embedding_provider):
        """Stress-tests Ollama with extreme lengths, unicode, emojis, and injection strings."""
        adversarial_inputs = [
            # Extreme length: 1,200 repeated words (~8,000 characters)
            "historic gothic cathedral stained glass stone arches " * 240,
            # Multilingual and emojis
            "🏛️ 🎨 🍷 ☕ 日本語の庭園と神社 древний римский акведук معبد مصري قديم",
            # Code injection and special characters
            "'; DROP TABLE attractions; SELECT * FROM users WHERE '1'='1' -- \x00\n\r\t",
            # Whitespace padded
            "     \n\n\t   museum of classical antiquity   \t\n\n     ",
        ]

        for text in adversarial_inputs:
            vec = await embedding_provider.embed_text(text)
            assert len(vec) == 768
            assert not any(math.isnan(x) or math.isinf(x) for x in vec)
            norm = np.linalg.norm(vec)
            assert abs(norm - 1.0) < 1e-4

    def test_ema_numerical_stability_under_100_iterations(self):
        """Tests that 100 sequential EMA updates never denormalize or blow up."""
        rng = np.random.default_rng(seed=42)
        # Start with random unit vector
        v = rng.standard_normal(768)
        v = (v / np.linalg.norm(v)).tolist()

        for _ in range(100):
            prompt_v = rng.standard_normal(768)
            prompt_v = (prompt_v / np.linalg.norm(prompt_v)).tolist()
            v = SemanticLearningEngine.apply_ema_update(v, prompt_v, gamma=0.20)

            assert len(v) == 768
            norm = np.linalg.norm(v)
            assert abs(norm - 1.0) < 1e-4
            assert not any(math.isnan(x) or math.isinf(x) for x in v)

    def test_ema_boundary_conditions_and_edge_cases(self):
        """Tests gamma boundaries (0.0, 1.0), identical vectors, and antipodal vectors."""
        v1 = [1.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0]

        # Gamma = 0.0: No change
        res_zero = SemanticLearningEngine.apply_ema_update(v1, v2, gamma=0.0)
        assert np.allclose(res_zero, v1)

        # Gamma = 1.0: Full replacement
        res_one = SemanticLearningEngine.apply_ema_update(v1, v2, gamma=1.0)
        assert np.allclose(res_one, v2)

        # Identical vectors: Idempotent
        res_ident = SemanticLearningEngine.apply_ema_update(v1, v1, gamma=0.20)
        assert np.allclose(res_ident, v1)

        # Antipodal vectors: v2 = -v1 -> (1-gamma)*v1 + gamma*(-v1) = (1-2*gamma)*v1
        v_anti = [-1.0, 0.0, 0.0]
        res_anti = SemanticLearningEngine.apply_ema_update(v1, v_anti, gamma=0.20)
        assert np.linalg.norm(res_anti) > 0.0
        assert np.allclose(np.linalg.norm(res_anti), 1.0)


# ---------------------------------------------------------------------------
# 2. Semantic Discrimination & Contrastive Separation
# ---------------------------------------------------------------------------
@live_db_and_ollama_required
class TestSemanticDiscriminationAndContrastiveSeparation:
    """
    Tests that distinct invented semantic taste vectors accurately extract
    and discriminate matching POIs in real PostgreSQL pgvector collections.
    """

    @pytest.mark.asyncio
    async def test_lisbon_viewpoint_invented_vector_discrimination(
        self, embedding_provider, live_db_session
    ):
        """
        Invented Vector: Scenic Viewpoints and Panoramic Miradors.
        Expectation:
        - Top candidates retrieved from Lisbon are predominantly miradouros/viewpoints.
        - Similarity scores for viewpoints are significantly higher than unrelated attractions.
        """
        invented_query = (
            "panoramic scenic viewpoints, elevated hilltop miradors, "
            "city skyline observation decks, and sunset terraces"
        )
        invented_vector = await embedding_provider.embed_text(invented_query)

        repo = SqlPoiRepository(live_db_session)
        candidates = await repo.find_semantic_candidates(
            "Lisbon", invented_vector, limit=10
        )

        assert len(candidates) >= 5, "Should retrieve candidate POIs in Lisbon"

        # Verify sorted order
        sims = [sim for _, sim in candidates]
        assert sims == sorted(
            sims, reverse=True
        ), "Candidates must be sorted descending by similarity"

        # Verify top candidate is an authentic viewpoint
        _top_poi, top_sim = candidates[0]
        assert top_sim >= 0.65, f"Expected strong semantic affinity, got {top_sim}"
        poi_names = [p.name.lower() for p, _ in candidates[:5]]
        viewpoint_matches = [
            name
            for name in poi_names
            if "miradouro" in name or "viewpoint" in name or "panorâmico" in name
        ]
        assert (
            len(viewpoint_matches) >= 3
        ), f"Expected at least 3 viewpoints in top 5, found: {poi_names}"

    @pytest.mark.asyncio
    async def test_paris_art_museum_invented_vector_discrimination(
        self, embedding_provider, live_db_session
    ):
        """
        Invented Vector: Fine Arts, Canvas Paintings, and Sculptures.
        Expectation:
        - Top candidates retrieved in Paris are museums / art galleries.
        - Contrastive: Art query scores art museums higher than a nightlife query does.
        """
        art_query = (
            "fine arts museum, impressionist canvas paintings, classical marble sculptures, "
            "and avant-garde artistic gallery exhibitions"
        )
        nightlife_query = (
            "underground techno nightclub, electronic music DJ, craft cocktail bar, "
            "and late night dance party"
        )

        art_vec = await embedding_provider.embed_text(art_query)
        nightlife_vec = await embedding_provider.embed_text(nightlife_query)

        repo = SqlPoiRepository(live_db_session)
        art_candidates = await repo.find_semantic_candidates("Paris", art_vec, limit=5)
        nightlife_candidates = await repo.find_semantic_candidates(
            "Paris", nightlife_vec, limit=5
        )

        # 1. Art candidates are all museums
        for poi, sim in art_candidates:
            assert (
                poi.category == "museum"
            ), f"Expected museum for art query, got {poi.category} ({poi.name})"
            assert sim > 0.60

        # 2. Contrastive discrimination: Top art museum under art query vs nightlife query
        top_art_poi, art_sim = art_candidates[0]
        nightlife_sim_lookup = {p.id: s for p, s in nightlife_candidates}
        nightlife_sim = nightlife_sim_lookup.get(top_art_poi.id, 0.0)

        assert art_sim > nightlife_sim + 0.10, (
            f"Art similarity ({art_sim}) must exceed nightlife similarity ({nightlife_sim}) "
            f"for art museum '{top_art_poi.name}'"
        )

    @pytest.mark.asyncio
    async def test_madrid_archaeology_invented_vector_discrimination(
        self, embedding_provider, live_db_session
    ):
        """
        Invented Vector: Ancient Archaeology, Prehistory, and Antiquities.
        Expectation:
        - Retrieves archaeological sites / museums in Madrid in the top 8.
        """
        archaeology_query = (
            "ancient archaeological artifacts, prehistoric excavations, "
            "historical Egyptian and Roman antiquities, and ancient relics"
        )
        arch_vec = await embedding_provider.embed_text(archaeology_query)

        repo = SqlPoiRepository(live_db_session)
        candidates = await repo.find_semantic_candidates("Madrid", arch_vec, limit=8)

        assert len(candidates) > 0
        candidate_names = [p.name.lower() for p, _ in candidates]

        archaeological_hits = [
            name
            for name in candidate_names
            if "arqueológico" in name
            or "paleontológico" in name
            or "historia" in name
            or "moneda" in name
            or "armería" in name
        ]
        assert (
            len(archaeological_hits) >= 1
        ), f"Expected archaeological museum in top results, found: {candidate_names}"


# ---------------------------------------------------------------------------
# 3. Hybrid Scorer & Taste Evolution Integration Tests
# ---------------------------------------------------------------------------
@ollama_required
class TestEndToEndScorerAndTasteEvolution:
    """
    Tests end-to-end integration: User taste vector directly steers the MLScorer
    composite utility score, and consecutive prompts monotonically steer the taste vector.
    """

    @pytest.mark.asyncio
    async def test_user_vector_steers_composite_scoring_utility(
        self, embedding_provider
    ):
        """
        Verifies that when an invented taste vector is supplied to MLScorer,
        the corresponding POI utility scores shift significantly and predictably.
        """
        viewpoint_desc = (
            "Panoramic scenic viewpoint overlooking Lisbon with open terrace views."
        )
        museum_desc = "Fine arts museum displaying paintings and classical sculptures."

        v_emb = await embedding_provider.embed_text(viewpoint_desc)
        m_emb = await embedding_provider.embed_text(museum_desc)

        poi_viewpoint = Poi(
            id="viewpoint-1",
            city="Lisbon",
            name="Miradouro Alto",
            category="ATTRACTION",
            location={"lat": 38.71, "lon": -9.14},
            schedule={"opening_hours": "00:00-24:00"},
            financials={"is_free": True, "cost": 0.0},
            scoring={"google_rating": 4.8, "reviews": 500},
            metadata={"description": viewpoint_desc},
            duration_mins=60,
            cost_eur=0.0,
            embedding=v_emb,
        )

        poi_museum = Poi(
            id="museum-1",
            city="Lisbon",
            name="Museu de Belas Artes",
            category="MUSEUM",
            location={"lat": 38.72, "lon": -9.13},
            schedule={"opening_hours": "09:00-18:00"},
            financials={"is_free": False, "cost": 10.0},
            scoring={"google_rating": 4.8, "reviews": 500},
            metadata={"description": museum_desc},
            duration_mins=60,
            cost_eur=10.0,
            embedding=m_emb,
        )

        hybrid_model = HybridSovereignScorer()
        mock_user_repo = AsyncMock()

        neutral_vector = [1.0 / math.sqrt(768)] * 768
        mock_user_repo.get_by_id = AsyncMock(return_value=None)
        mock_user_repo.get_embedding = AsyncMock(return_value=neutral_vector)
        mock_user_repo.save_embedding = AsyncMock(return_value=None)
        mock_user_repo.update_preferences = AsyncMock(return_value=None)

        scorer = MLScorer(
            ml_model=hybrid_model,
            ml_params=hybrid_model.init_params(),
            user_repo=mock_user_repo,
            embedding_provider=embedding_provider,
        )

        # Act 1: Score with neutral taste vector
        neutral_results = await scorer.score_pois(
            [poi_viewpoint, poi_museum],
            user_id="test_user",
        )
        neutral_scores = {sp.poi.id: sp.score for sp in neutral_results}

        # Act 2: Score with prompt steering towards scenic viewpoints
        viewpoint_prompt = "I want to visit scenic viewpoints, elevated miradors, and enjoy sunset views."
        viewpoint_results = await scorer.score_pois(
            [poi_viewpoint, poi_museum],
            user_id="test_user",
            prompt_text=viewpoint_prompt,
        )
        steered_scores = {sp.poi.id: sp.score for sp in viewpoint_results}

        # Assert: Viewpoint score must increase significantly with viewpoint prompt
        assert (
            steered_scores["viewpoint-1"] > neutral_scores["viewpoint-1"]
        ), f"Viewpoint score did not increase: {steered_scores['viewpoint-1']} vs {neutral_scores['viewpoint-1']}"
        assert steered_scores["viewpoint-1"] > steered_scores["museum-1"]

    @pytest.mark.asyncio
    async def test_taste_evolution_monotonic_convergence(self, embedding_provider):
        """
        Tests that 3 consecutive thematic prompts monotonically increase the user's
        projected 8D affinity for that specific theme.
        """
        anchors = {}
        for k, text in CATEGORY_ANCHORS.items():
            anchors[k] = await embedding_provider.embed_text(text)
        engine = SemanticLearningEngine(anchors)

        # Start with neutral unit vector
        user_vector = [1.0 / math.sqrt(768)] * 768
        initial_harmonics = engine.project_to_8d_harmonics(user_vector)
        h_history = [initial_harmonics["nature_outdoors"]]

        prompts = [
            "green natural parks, botanical garden flora, and scenic forest walks",
            "lush botanical trails, lake gardens, and outdoor landscape greenery",
            "botanical arboretum, exotic plants, flower gardens, and open air parks",
        ]

        for p in prompts:
            p_vec = await embedding_provider.embed_text(p)
            user_vector = SemanticLearningEngine.apply_ema_update(
                user_vector, p_vec, gamma=0.25
            )
            harmonics = engine.project_to_8d_harmonics(user_vector)
            h_history.append(harmonics["nature_outdoors"])

        # Assert monotonic increase
        for i in range(len(h_history) - 1):
            assert (
                h_history[i + 1] > h_history[i]
            ), f"Step {i} -> {i + 1} did not increase: {h_history[i]} -> {h_history[i + 1]}"

        final_harmonics = engine.project_to_8d_harmonics(user_vector)
        assert final_harmonics["nature_outdoors"] > final_harmonics["nightlife"]
        assert final_harmonics["nature_outdoors"] > final_harmonics["shopping"]
