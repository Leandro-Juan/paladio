import pytest
import numpy as np
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.schemas.rag_schema import RAGPromptAnalysis
from app.schemas.itinerary import TravelConstraints, NodeConstraint
from app.domain.entities.poi import Poi, ScoredPoi
from app.engine.scoring.features import TAG_KEYS
from app.infrastructure.engine.ml_scorer import MLScorer
from app.swarm.agents.prompt_analyzer import prompt_analyzer_node
from app.swarm.state import SwarmState
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase


def test_rag_prompt_analysis_schema_default_and_custom():
    analysis = RAGPromptAnalysis(
        mandatory_pois=["Museo del Prado"],
        preferred_cuisines=["tapas"],
        travel_tastes=["art"],
        tag_affinities={"art_culture": 0.95, "nightlife": 0.1},
    )
    assert analysis.mandatory_pois == ["Museo del Prado"]
    assert analysis.tag_affinities["art_culture"] == 0.95
    assert analysis.tag_affinities["nightlife"] == 0.1

    default_analysis = RAGPromptAnalysis()
    assert default_analysis.tag_affinities == {}


def test_travel_constraints_tag_affinities_deserialization():
    # Direct dict
    constraints = TravelConstraints(
        destination_city="Madrid",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 3),
        tag_affinities={"art_culture": 0.85, "food_culinary": 0.9},
    )
    assert constraints.tag_affinities["art_culture"] == 0.85
    assert constraints.tag_affinities["food_culinary"] == 0.9

    # Stringified JSON dict
    raw_dict = {
        "destination_city": "Madrid",
        "start_date": "2026-06-01",
        "end_date": "2026-06-03",
        "tag_affinities": '{"nature_outdoors": 0.75, "scenic_views": 0.8}',
    }
    parsed = TravelConstraints(**raw_dict)
    assert parsed.tag_affinities["nature_outdoors"] == 0.75
    assert parsed.tag_affinities["scenic_views"] == 0.8


@pytest.mark.asyncio
@patch("app.swarm.agents.prompt_analyzer.prompt_analysis_agent")
async def test_prompt_analyzer_node_extracts_tag_affinities_and_preserves_mandatory_pois(
    mock_agent,
):
    mock_run_result = MagicMock()
    mock_run_result.output = RAGPromptAnalysis(
        mandatory_pois=["Prado Museum"],
        preferred_cuisines=["spanish"],
        travel_tastes=["museums"],
        tag_affinities={"art_culture": 0.92, "history_heritage": 0.88},
    )
    mock_agent.run = AsyncMock(return_value=mock_run_result)

    state: SwarmState = {
        "messages": [
            MagicMock(content="I must visit Prado Museum. I love art and history.")
        ],
        "validated_itinerary": {"destination_city": "Madrid"},
        "retrieved_context": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
        "booking_text": None,
        "booking_anchors": None,
        "manual_constraints": None,
        "prompt_analysis": None,
    }

    result = await prompt_analyzer_node(state)
    val_it = result["validated_itinerary"]

    # Assert mandatory POIs preserved
    assert any(
        n["poi_id"] == "Prado Museum" and n["mandatory"] for n in val_it["nodes"]
    )
    # Assert tag affinities populated
    assert val_it["tag_affinities"]["art_culture"] == 0.92
    assert val_it["tag_affinities"]["history_heritage"] == 0.88


@pytest.mark.asyncio
async def test_ml_scorer_blends_and_persists_user_tastes_aaa():
    # Arrange
    ml_model = MagicMock()
    ml_model.batch_score.return_value = np.array([[88.0]])
    ml_params = {}

    user_repo = MagicMock()
    user_repo.get_by_id = AsyncMock(return_value=None)
    user_repo.get_embedding = AsyncMock(return_value=None)
    user_repo.update_preferences = AsyncMock(return_value=None)
    user_repo.save_embedding = AsyncMock(return_value=None)

    scorer = MLScorer(ml_model, ml_params, user_repo)
    pois = [Poi(city="Madrid", name="Prado Museum", category="MUSEUM")]

    # Act: Prompt strongly indicates art & culture (1.0)
    prompt_affinities = {"art_culture": 1.0}
    scored = await scorer.score_pois(
        pois, user_id="test_user_persistent", prompt_affinities=prompt_affinities
    )

    # Assert
    assert len(scored) == 1
    assert scored[0].score == 88.0

    # Base affinity is 0.5 (default for neutral user).
    # alpha = 0.35
    # w_new = (1 - 0.35) * 0.5 + 0.35 * 1.0 = 0.325 + 0.35 = 0.675
    expected_art = round(0.675, 4)

    # Check persistence was called
    user_repo.update_preferences.assert_called_once()
    called_user_id, called_pref = user_repo.update_preferences.call_args[0]
    assert called_user_id == "test_user_persistent"
    assert called_pref["tag_affinities"]["art_culture"] == expected_art
    # Unmentioned tags should stay at baseline
    assert called_pref["tag_affinities"]["nightlife"] == 0.5

    user_repo.save_embedding.assert_called_once()
    called_user_id_emb, called_emb = user_repo.save_embedding.call_args[0]
    assert called_user_id_emb == "test_user_persistent"
    art_idx = TAG_KEYS.index("art_culture")
    assert called_emb[art_idx] == expected_art

    # Check in-memory cache
    assert "test_user_persistent" in scorer._cached_user_prefs
    assert (
        scorer._cached_user_prefs["test_user_persistent"]["tag_affinities"][
            "art_culture"
        ]
        == expected_art
    )


@pytest.mark.asyncio
async def test_fetch_travel_context_forwards_prompt_affinities():
    mock_provider = MagicMock()
    mock_provider.get_pois = AsyncMock(
        return_value=[
            {
                "name": "Prado",
                "category": "MUSEUM",
                "location": {"latitude": 40.4138, "longitude": -3.6921},
            }
        ]
    )
    mock_provider.generate_mock_context = AsyncMock(return_value={})
    mock_provider.get_restaurants = AsyncMock(return_value=[])

    mock_ml_scorer = MagicMock()
    mock_ml_scorer.score_pois = AsyncMock(
        return_value=[
            ScoredPoi(
                poi=Poi(city="Madrid", name="Prado", category="MUSEUM"),
                score=92.5,
            )
        ]
    )

    use_case = FetchTravelContextUseCase(
        data_provider=mock_provider, ml_scorer=mock_ml_scorer
    )

    constraints = TravelConstraints(
        destination_city="Madrid",
        origin_city="Unknown",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=1),
        nodes=[NodeConstraint(poi_id="Prado", mandatory=True)],
        tag_affinities={"art_culture": 0.95},
    )

    result = await use_case.execute(constraints, user_id="user_abc")

    # Assert ml_scorer was called with prompt_affinities forwarded from constraints
    mock_ml_scorer.score_pois.assert_called_once()
    call_args, call_kwargs = mock_ml_scorer.score_pois.call_args
    assert call_kwargs.get("user_id") == "user_abc"
    assert call_kwargs.get("prompt_affinities") == {"art_culture": 0.95}

    # Assert result contains daily_pois_data with ml_affinity_score attached
    assert "daily_pois_data" in result
    day_0 = result["daily_pois_data"][0]
    prado_poi = next(p for p in day_0 if p.get("name") == "Prado")
    assert prado_poi.get("ml_affinity_score") == 92.5
