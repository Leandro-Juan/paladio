import pytest
from unittest.mock import patch
from app.swarm.agents.validator import validator_agent, validator_node
from langchain_core.messages import HumanMessage
from pydantic_ai.models.test import TestModel


@pytest.mark.asyncio
async def test_validator_node_execution():
    """Test the validator node execution using TestModel."""
    test_model = TestModel(
        custom_output_args={
            "origin_city": "Unknown",
            "destination_city": "Paris",
            "budget_usd": 3000.0,
            "start_date": "2026-06-01",
            "end_date": "2026-06-05",
            "nodes": [
                {
                    "poi_id": "Louvre Museum",
                    "mandatory": True,
                    "min_duration_minutes": 120,
                }
            ],
            "meals": [],
        }
    )

    state = {
        "messages": [
            HumanMessage(content="My budget is 3000 USD and I must visit the Louvre.")
        ],
        "booking_anchors": None,
    }

    with patch(
        "app.swarm.agents.validator.get_validator_model", return_value=test_model
    ):
        with validator_agent.override(model=test_model):
            result = await validator_node(state)

    validated = result.get("validated_itinerary")
    assert validated is not None
    assert validated.get("budget_usd") == 3000.0

    nodes = validated.get("nodes", [])
    assert any(
        "louvre" in n.get("poi_id", "").lower() for n in nodes
    ), "Louvre was not extracted as a mandatory node."
