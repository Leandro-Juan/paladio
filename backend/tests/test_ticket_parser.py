import pytest
import urllib.request
import urllib.error
import os
from app.swarm.agents.ticket_parser import ticket_parser_node

def is_ollama_running():
    try:
        url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        if url.endswith("/"): url = url[:-1]
        urllib.request.urlopen(f"{url}/", timeout=1)
        return True
    except Exception:
        return False


@pytest.mark.asyncio
@pytest.mark.skipif(
    not is_ollama_running(),
    reason="Requires a live local Ollama container"
)
async def test_ticket_parser_llm_execution():
    """Test the actual LLM agent with unstructured text."""
    # Using text that does NOT trigger the regex bypass
    llm_booking_text = "I have a delta flight from JFK to LHR on Oct 10th 2026 at 5pm (duration 420m). Coming back from LHR to JFK on Oct 20th 2026 at 9am (duration 480m). Booked at the Savoy hotel in London."
    state = {"booking_text": llm_booking_text}

    print("\nStarting LLM extraction... this might take several minutes on CPU.")
    result = await ticket_parser_node(state)

    anchors = result.get("booking_anchors")
    print("\nLLM Result:", anchors)
    assert anchors is not None
    assert anchors["outbound_flight"] is not None
    assert anchors["outbound_flight"]["origin_iata"] == "JFK"
    assert anchors["outbound_flight"]["destination_iata"] == "LHR"
    assert anchors["return_flight"] is not None
    assert anchors["hotel"] is not None
    assert "Savoy" in anchors["hotel"]["name"]
