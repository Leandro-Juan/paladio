import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage

os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.swarm.graph import graph


@pytest.mark.asyncio
async def test_full_trip_generation():
    """Verify full free-text booking + prompt trip generation runs offline with zero LLM calls."""
    today = datetime.now(timezone.utc).date()
    start_dt = today + timedelta(days=10)
    end_dt = today + timedelta(days=12)
    start_str = start_dt.isoformat()
    end_str = end_dt.isoformat()

    booking_text = (
        f"Flight BA482 from LHR to OPO departing {start_str} 08:30 arriving {start_str} 10:50. "
        f"Return OPO to LHR on {end_str} 18:00. "
        f"Booked at The Yeatman Hotel in Porto from {start_str} to {end_str}."
    )
    prompt = (
        "Plan a 2 day trip to Porto with scenic riverfront views, historic architecture, "
        "and Portuguese seafood dinner."
    )

    state = {
        "booking_text": booking_text,
        "manual_constraints": {
            "budget_usd": 500.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:30", "end_time": "14:00"},
                {"meal_type": "DINNER", "start_time": "19:30", "end_time": "21:30"},
            ],
        },
        "messages": [HumanMessage(content=prompt)],
        "auto_verify": True,
        "error_count": 0,
    }

    config = {
        "configurable": {
            "thread_id": "test_offline_e2e",
            "user_id": "test_offline_user",
            "engine": MagicMock(),
            "travel_data_provider": MagicMock(),
        }
    }

    offline_error = AssertionError(
        "Offline trip generation must not invoke LLM or network"
    )

    with (
        patch(
            "app.services.llm_service.LLMService.run_structured_extraction",
            new_callable=AsyncMock,
            side_effect=offline_error,
        ),
        patch("urllib.request.urlopen", side_effect=offline_error),
        patch(
            "app.swarm.nodes.guardrails._find_overlapping_trip",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.swarm.graph.FetchTravelContextUseCase.execute",
            new_callable=AsyncMock,
            return_value={"daily_pois_data": [[], []]},
        ),
        patch(
            "app.swarm.graph.OptimizeDailyItineraryUseCase.execute",
            new_callable=AsyncMock,
            return_value={
                "days": [
                    {
                        "day": 1,
                        "itinerary": {"path": [{"poi": {"name": "The Yeatman Hotel"}}]},
                    },
                    {
                        "day": 2,
                        "itinerary": {"path": [{"poi": {"name": "Ribeira District"}}]},
                    },
                ]
            },
        ),
    ):
        final_state = await graph.ainvoke(state, config=config)

    assert final_state.get("booking_anchors") is not None
    assert final_state["booking_anchors"]["outbound_flight"]["origin_iata"] == "LHR"
    assert (
        final_state["booking_anchors"]["outbound_flight"]["destination_iata"] == "OPO"
    )
    assert final_state["booking_anchors"]["hotel"]["city"] == "Porto"

    assert final_state.get("validated_itinerary") is not None
    assert final_state["validated_itinerary"]["destination_city"] == "Porto"
    assert final_state["validated_itinerary"]["origin_city"] == "London"

    assert final_state.get("prompt_analysis") is not None
    assert "scenic_views" in final_state["prompt_analysis"]["tag_affinities"]

    assert final_state.get("final_itinerary") is not None
    assert len(final_state["final_itinerary"]["days"]) == 2
