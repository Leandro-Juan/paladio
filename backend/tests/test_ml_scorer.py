import numpy as np
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.domain.entities.poi import Poi
from app.engine.scoring.features import PoiEncoder, TAG_KEYS
from app.infrastructure.engine.ml_scorer import MLScorer
from app.infrastructure.scoring.hybrid_scorer import HybridSovereignScorer


def test_bayesian_rating_smoothing_aaa():
    # Arrange:
    # POI 1 has 5.0 rating with only 1 review (low confidence)
    # POI 2 has 4.9 rating with 20,000 reviews (world-class landmark)
    # POI 3 has 0 reviews (edge case: division by zero safeguard)
    scorer = HybridSovereignScorer()
    params = scorer.init_params()
    user_weights = np.full(len(TAG_KEYS), 0.5, dtype=np.float32)

    poi_low_rev = {
        "name": "Random Stall",
        "category": "RESTAURANT",
        "scoring": {"google_rating": 5.0, "reviews": 1},
        "duration_mins": 60,
    }
    poi_high_rev = {
        "name": "Prado Museum",
        "category": "MUSEUM",
        "scoring": {"google_rating": 4.9, "reviews": 20000},
        "duration_mins": 60,
    }
    poi_zero_rev = {
        "name": "Brand New Spot",
        "category": "ATTRACTION",
        "scoring": {"google_rating": 5.0, "reviews": 0},
        "duration_mins": 60,
    }

    embs = np.stack(
        [
            PoiEncoder.encode(poi_low_rev),
            PoiEncoder.encode(poi_high_rev),
            PoiEncoder.encode(poi_zero_rev),
        ]
    )

    # Act:
    scores = scorer.batch_score(params, user_weights, embs)

    # Assert:
    score_low = float(scores[0, 0])
    score_high = float(scores[1, 0])
    score_zero = float(scores[2, 0])

    # Massive review volume with 4.9 stars should decisively beat a 1-review 5.0 star spot
    assert score_high > score_low
    # Zero reviews spot should compute safely without division by zero
    assert 0.0 <= score_zero <= 100.0
    assert not np.isnan(score_zero)


def test_tag_affinity_matching_aaa():
    # Arrange:
    # User profile with high affinity for Art & Culture (1.0), zero for Nightlife (0.0)
    scorer = HybridSovereignScorer()
    params = scorer.init_params()

    user_weights = np.full(len(TAG_KEYS), 0.5, dtype=np.float32)
    user_weights[TAG_KEYS.index("art_culture")] = 1.0
    user_weights[TAG_KEYS.index("nightlife")] = 0.0

    art_museum = {
        "name": "Contemporary Art Gallery",
        "category": "MUSEUM",
        "scoring": {"google_rating": 4.5, "reviews": 500},
        "duration_mins": 60,
    }
    nightclub = {
        "name": "Underground Nightclub",
        "category": "BAR",
        "scoring": {"google_rating": 4.5, "reviews": 500},
        "duration_mins": 60,
    }

    embs = np.stack([PoiEncoder.encode(art_museum), PoiEncoder.encode(nightclub)])

    # Act:
    scores = scorer.batch_score(params, user_weights, embs)

    # Assert:
    art_score = float(scores[0, 0])
    club_score = float(scores[1, 0])
    assert art_score > club_score + 15.0  # Significant preference margin


def test_online_learning_sgd_feedback_aaa():
    # Arrange:
    # User starts neutral on food (0.5).
    scorer = HybridSovereignScorer()
    params = scorer.init_params()
    user_weights = np.full(len(TAG_KEYS), 0.5, dtype=np.float32)

    restaurant = {
        "name": "Traditional Tapas Bar",
        "category": "RESTAURANT",
        "scoring": {"google_rating": 4.2, "reviews": 300},
        "duration_mins": 60,
    }
    emb = PoiEncoder.encode(restaurant)
    initial_score = float(scorer.batch_score(params, user_weights, emb)[0, 0])

    # Act:
    # User gives strong positive feedback (target_score = 100.0)
    target_score = 100.0
    updated_weights = scorer.update_user(
        params, user_weights, emb, target_score, learning_rate=0.3
    )
    new_score = float(scorer.batch_score(params, updated_weights, emb)[0, 0])

    # Assert:
    assert abs(new_score - target_score) < abs(initial_score - target_score)
    assert new_score > initial_score


def test_feedback_non_interference_aaa():
    # Arrange:
    # User has initial equal affinities across all categories.
    scorer = HybridSovereignScorer()
    params = scorer.init_params()
    initial_weights = np.full(len(TAG_KEYS), 0.5, dtype=np.float32)

    nightclub = {
        "name": "Electronic Dance Club",
        "category": "BAR",
        "scoring": {"google_rating": 4.0, "reviews": 100},
        "duration_mins": 120,
    }
    emb = PoiEncoder.encode(nightclub)

    # Act:
    # User gives negative feedback (target_score = 0.0) on Nightclub
    updated_weights = np.asarray(
        scorer.update_user(
            params, initial_weights, emb, target_score=0.0, learning_rate=0.3
        )
    )

    # Assert:
    nightlife_idx = TAG_KEYS.index("nightlife")
    nature_idx = TAG_KEYS.index("nature_outdoors")
    art_idx = TAG_KEYS.index("art_culture")

    # Nightlife affinity decreased
    assert updated_weights[nightlife_idx] < initial_weights[nightlife_idx]
    # Nature and Art affinities remain completely untouched (no catastrophic forgetting!)
    assert np.isclose(updated_weights[nature_idx], initial_weights[nature_idx])
    assert np.isclose(updated_weights[art_idx], initial_weights[art_idx])


def test_robustness_edge_cases_aaa():
    # Arrange:
    scorer = HybridSovereignScorer()
    params = scorer.init_params()
    user_weights = np.full(len(TAG_KEYS), 0.5, dtype=np.float32)

    # Edge cases: None ratings, negative costs, zero duration, empty metadata
    poi_edge = {
        "name": "Edge Case Place",
        "category": "UNKNOWN_CATEGORY",
        "cost_eur": -10.0,
        "duration_mins": -5,
        "scoring": {"google_rating": None, "reviews": None},
        "metadata": {},
    }

    # Act:
    emb = PoiEncoder.encode(poi_edge)
    score = float(scorer.batch_score(params, user_weights, emb)[0, 0])

    # Assert:
    assert 0.0 <= score <= 100.0
    assert not np.isnan(score)
    assert not np.isinf(score)


@pytest.mark.asyncio
async def test_ml_scorer_service_orchestration_aaa():
    # Arrange:
    ml_model = MagicMock()
    ml_model.batch_score.return_value = np.array([[95.0], [80.0]])
    ml_params = {}

    user_repo = MagicMock()
    user_repo.get_embedding = AsyncMock(return_value=None)
    user_repo.get_by_id = AsyncMock(return_value=None)

    scorer = MLScorer(ml_model, ml_params, user_repo)

    pois = [
        Poi(city="Rome", name="Colosseum", category="ATTRACTION"),
        Poi(city="Rome", name="Roman Forum", category="ATTRACTION"),
    ]

    # Act:
    scored_pois = await scorer.score_pois(pois, "test_user")

    # Assert:
    assert len(scored_pois) == 2
    assert scored_pois[0].poi.name == "Colosseum"
    assert scored_pois[0].score == 95.0
    assert scored_pois[1].poi.name == "Roman Forum"
    assert scored_pois[1].score == 80.0
    ml_model.batch_score.assert_called_once()


def test_multilingual_keywords_and_word_boundary_isolation():
    # 1. Word boundary isolation: "baroque" must NOT trigger nightlife ("bar")
    baroque_palace = {
        "name": "Baroque Palace of the Nobles",
        "description": "Exquisite baroque architecture with ornate ceilings.",
        "category": "LANDMARK",
        "cost_eur": 10.0,
        "duration_mins": 60,
    }
    features_baroque = PoiEncoder.encode(baroque_palace)
    nightlife_idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index("nightlife")
    arch_idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index("architecture")
    history_idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index("history_heritage")

    assert (
        features_baroque[nightlife_idx] == 0.0
    ), "Word 'baroque' falsely triggered nightlife tag!"
    assert features_baroque[arch_idx] == 1.0
    assert features_baroque[history_idx] == 1.0

    # 2. Multilingual: "basilica" (Italian/Spanish), "mirador" (Spanish), "osteria" (Italian)
    basilica = {"name": "Basilica di San Giovanni", "category": "ATTRACTION"}
    mirador = {
        "name": "Mirador de San Nicolás",
        "description": "Vistas panorámicas espectaculares",
        "category": "ATTRACTION",
    }
    osteria = {
        "name": "Osteria Da Enzo",
        "description": "Cucina romana tradicional",
        "category": "RESTAURANT",
    }

    f_basilica = PoiEncoder.encode(basilica)
    f_mirador = PoiEncoder.encode(mirador)
    f_osteria = PoiEncoder.encode(osteria)

    scenic_idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index("scenic_views")
    food_idx = PoiEncoder.TAG_START_IDX + TAG_KEYS.index("food_culinary")

    assert f_basilica[history_idx] == 1.0
    assert f_mirador[scenic_idx] == 1.0
    assert f_osteria[food_idx] == 1.0


def test_pace_sensitive_scoring_leisurely_vs_intense():
    scorer = HybridSovereignScorer()
    params = scorer.init_params()

    # Long museum visit (150 mins) vs compact visit (30 mins)
    long_poi = {"name": "Grand Gallery", "category": "MUSEUM", "duration_mins": 150}
    short_poi = {"name": "Quick Landmark", "category": "LANDMARK", "duration_mins": 30}

    embs = np.stack([PoiEncoder.encode(long_poi), PoiEncoder.encode(short_poi)])

    user_leisurely = {"pace": "leisurely", "tag_affinities": {t: 0.5 for t in TAG_KEYS}}
    user_intense = {"pace": "intense", "tag_affinities": {t: 0.5 for t in TAG_KEYS}}

    scores_leisurely = scorer.batch_score(params, user_leisurely, embs)
    scores_intense = scorer.batch_score(params, user_intense, embs)

    # Leisurely user scores the long, unhurried visit higher than the rushed visit
    assert scores_leisurely[0, 0] > scores_leisurely[1, 0]

    # Intense user scores the compact highlight visit higher than the long 150-min time sink
    assert scores_intense[1, 0] > scores_intense[0, 0]


def test_budget_sensitive_scoring_budget_vs_luxury():
    scorer = HybridSovereignScorer()
    params = scorer.init_params()

    expensive_poi = {
        "name": "Luxury Tasting Menu",
        "category": "RESTAURANT",
        "cost_eur": 120.0,
        "duration_mins": 60,
    }
    free_poi = {
        "name": "Historic City Plaza",
        "category": "LANDMARK",
        "cost_eur": 0.0,
        "duration_mins": 60,
    }

    embs = np.stack([PoiEncoder.encode(expensive_poi), PoiEncoder.encode(free_poi)])

    user_budget = {
        "budget_tier": "budget",
        "tag_affinities": {t: 0.5 for t in TAG_KEYS},
    }
    user_luxury = {
        "budget_tier": "luxury",
        "tag_affinities": {t: 0.5 for t in TAG_KEYS},
    }

    scores_budget = scorer.batch_score(params, user_budget, embs)
    scores_luxury = scorer.batch_score(params, user_luxury, embs)

    # For budget traveler, free attraction decisively beats 120 EUR attraction
    assert scores_budget[1, 0] > scores_budget[0, 0] + 8.0

    # For luxury traveler, 120 EUR attraction has significantly higher relative score than for budget traveler
    budget_expensive_score = float(scores_budget[0, 0])
    luxury_expensive_score = float(scores_luxury[0, 0])
    assert luxury_expensive_score > budget_expensive_score + 8.0


def test_semantic_affinity_scoring():
    scorer = HybridSovereignScorer()
    params = scorer.init_params()

    poi1 = {"name": "Gothic Cathedral", "category": "MONUMENT", "duration_mins": 60}
    poi2 = {"name": "Generic Shop", "category": "SHOPPING", "duration_mins": 60}
    embs = np.stack([PoiEncoder.encode(poi1), PoiEncoder.encode(poi2)])

    # POI 1 has high semantic affinity 0.95, POI 2 has low semantic affinity 0.15
    params["semantic_affinities"] = [0.95, 0.15]
    user_neutral = {"tag_affinities": {t: 0.5 for t in TAG_KEYS}}

    scores = scorer.batch_score(params, user_neutral, embs)
    assert scores[0, 0] > scores[1, 0] + 25.0
