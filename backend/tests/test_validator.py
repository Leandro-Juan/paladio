import pytest
import os
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11435/v1")
os.environ.setdefault("VALIDATOR_MODEL", "llama3.1:latest")

from app.swarm.agents.validator import validator_agent, get_validator_model

@pytest.mark.asyncio
async def test_validator_extraction():
    model = get_validator_model()
    res = await validator_agent.run("Context: \\n\\nUser Request: Plan a 5-day trip to barcelona starting tomorrow with a budget of 2500. i want to visit the sagrada familia", model=model)
    assert res is not None
    assert res.output is not None
    assert res.output.destination_city.lower() == "barcelona"
    assert res.output.budget_usd == 2500.0
    # Sagrada Familia should be a mandatory node
    assert any("sagrada familia" in node.poi_id.lower() for node in res.output.nodes)

