import jax.numpy as jnp
from app.engine.scoring.features import PoiEncoder
from app.infrastructure.scoring.jax_ml_model import JaxScoringModel, forward_pass
from unittest.mock import MagicMock
from app.domain.entities.poi import Poi
from app.infrastructure.engine.ml_scorer import MLScorer
import pytest


@pytest.mark.ml
def test_ml_forward_pass():
    ml_model = JaxScoringModel()
    params = ml_model.init_params()
    user_emb = jnp.ones((64,)) * 0.1

    poi = {
        "name": "Test Restaurant",
        "category": "RESTAURANT",
        "cost_eur": 50.0,
        "duration_mins": 90.0,
    }
    poi_emb = PoiEncoder.encode(poi)

    score = float(forward_pass(params, user_emb, poi_emb)[0])
    assert 0.0 <= score <= 100.0


@pytest.mark.ml
def test_ml_batch_pass():
    ml_model = JaxScoringModel()
    params = ml_model.init_params()
    user_emb = jnp.ones((64,)) * 0.1

    poi1 = {"name": "Test Restaurant", "category": "RESTAURANT", "cost_eur": 50.0}
    poi2 = {"name": "Test Park", "category": "PARK", "cost_eur": 0.0}

    poi_embs = jnp.stack([PoiEncoder.encode(poi1), PoiEncoder.encode(poi2)])

    scores = ml_model.batch_score(params, user_emb, poi_embs)
    assert scores.shape == (2, 1)
    assert 0.0 <= float(scores[0][0]) <= 100.0
    assert 0.0 <= float(scores[1][0]) <= 100.0


@pytest.mark.ml
def test_ml_backward_pass():
    ml_model = JaxScoringModel()
    params = ml_model.init_params()
    user_emb = jnp.ones((64,)) * 0.1

    poi = {"name": "Expensive Sushi", "category": "RESTAURANT", "cost_eur": 250.0}
    poi_emb = PoiEncoder.encode(poi)

    initial_score = float(forward_pass(params, user_emb, poi_emb)[0])

    # We want a much higher score, let's say 100.0
    target_score = 100.0

    updated_user_emb = ml_model.update_user(
        params, user_emb, poi_emb, target_score, learning_rate=0.5
    )

    new_score = float(forward_pass(params, updated_user_emb, poi_emb)[0])

    # The new score should be closer to target_score than the initial_score was
    assert abs(new_score - target_score) < abs(initial_score - target_score)


@pytest.mark.asyncio
async def test_ml_scorer_score_pois():
    # Arrange
    from unittest.mock import AsyncMock

    ml_model = MagicMock()
    ml_model.batch_score.return_value = [[95.0], [80.0]]
    ml_params = {}

    user_repo = MagicMock()
    user_repo.get_embedding = AsyncMock(return_value=None)

    scorer = MLScorer(ml_model, ml_params, user_repo)

    pois = [
        Poi(city="Rome", name="Colosseum", category="ATTRACTION"),
        Poi(city="Rome", name="Roman Forum", category="ATTRACTION"),
    ]

    # Act
    scored_pois = await scorer.score_pois(pois, "test_user")

    # Assert
    assert len(scored_pois) == 2
    assert scored_pois[0].poi.name == "Colosseum"
    assert scored_pois[0].score == 95.0
    assert scored_pois[1].poi.name == "Roman Forum"
    assert scored_pois[1].score == 80.0

    ml_model.batch_score.assert_called_once()
