import pytest
from app.swarm.agents.validator import validator_node
from langchain_core.messages import HumanMessage


@pytest.mark.asyncio
async def test_validator_node_execution():
    """Test the validator node execution using the real LLM."""
    # A simple prompt matching what the user is typing
    state = {
        "messages": [
            HumanMessage(content="My budget is 3000 USD and I must visit the Louvre.")
        ],
        "booking_anchors": None,
    }

    print("\nStarting LLM validation... this might take several minutes on CPU.")
    result = await validator_node(state)

    validated = result.get("validated_itinerary")
    print("\nValidator Result:", validated)

    assert validated is not None
    assert validated.get("budget_usd") == 3000.0

    # Verify that the LLM identified the Louvre
    nodes = validated.get("nodes", [])
    assert any(
        "louvre" in n.get("poi_id", "").lower() for n in nodes
    ), "Louvre was not extracted as a mandatory node."
    print("Validator test passed successfully!")
