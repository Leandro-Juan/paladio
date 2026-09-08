from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.schemas.itinerary import (
    BookingAnchors,
    FlightSegment,
    HotelAnchor,
)
from app.swarm.graph import graph
from langchain_core.messages import HumanMessage


@pytest.fixture(autouse=True)
def mock_embeddings():
    """Mock out the LangChain Ollama embeddings, PGVector, and RAG Agent so tests don't require the LLM backend."""
    mock_run_result = MagicMock()
    from app.schemas.rag_schema import RAGPromptAnalysis

    mock_run_result.output = RAGPromptAnalysis(
        mandatory_pois=["Louvre"],
        preferred_cuisines=[],
        travel_tastes=[],
    )
    with patch(
        "app.swarm.nodes.retriever.OllamaEmbeddings.aembed_query",
        return_value=[0.0] * 768,
    ), patch(
        "app.swarm.nodes.retriever.PGVector.asimilarity_search", return_value=[]
    ), patch(
        "app.swarm.nodes.retriever.rag_analysis_agent.run",
        new_callable=AsyncMock,
        return_value=mock_run_result,
    ):
        yield


@pytest.mark.asyncio
async def test_reactive_planning_generates_itinerary():
    """
    Test end-to-end swarm execution:
    - Tickets provide booking anchors (origin, hotel destination, dates).
    - Manual constraints provide strict budget and meal windows.
    - Human prompt is introduced in rag_node.
    - No validator LLM agent needed.
    """
    config = {
        "configurable": {
            "thread_id": "test_2",
            "engine": MagicMock(),
            "travel_data_provider": MagicMock(),
        }
    }

    booking = BookingAnchors(
        outbound_flight=FlightSegment(
            origin_iata="JFK",
            destination_iata="CDG",
            departure_time="2026-06-01 10:00",
            flight_duration_minutes=420,
        ),
        return_flight=FlightSegment(
            origin_iata="CDG",
            destination_iata="JFK",
            departure_time="2026-06-04 14:00",
            flight_duration_minutes=480,
        ),
        hotel=HotelAnchor(
            name="Paris Luxury Hotel",
            city="Paris",
            check_in_date="2026-06-01",
            check_out_date="2026-06-04",
        ),
    )

    state = {
        "booking_anchors": booking.model_dump(mode="json"),
        "manual_constraints": {
            "budget_usd": 1500.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:00"},
                {"meal_type": "DINNER", "start_time": "19:30", "end_time": "22:00"},
            ],
        },
        # Human prompt is passed in messages and only introduced in rag_node
        "messages": [
            HumanMessage(content="I want to visit the Louvre and Eiffel Tower")
        ],
    }

    with patch(
        "app.swarm.graph.FetchTravelContextUseCase.execute",
        new_callable=AsyncMock,
        return_value={"daily_pois_data": [[]]},
    ), patch(
        "app.swarm.graph.OptimizeDailyItineraryUseCase.execute",
        new_callable=AsyncMock,
        return_value={
            "days": [
                {"day": 1, "itinerary": {"path": [{"poi": {"name": "Base Hotel"}}]}}
            ]
        },
    ):
        result = await graph.ainvoke(state, config)

    # Assert
    assert "retrieved_context" in result
    assert result.get("validated_itinerary") is not None
    assert result["validated_itinerary"]["destination_city"] == "Paris"
    assert result["validated_itinerary"]["origin_city"] == "New York"
    assert result["validated_itinerary"]["budget_usd"] == 1500.0
    assert len(result["validated_itinerary"]["meals"]) == 2
    assert result.get("final_itinerary") is not None
