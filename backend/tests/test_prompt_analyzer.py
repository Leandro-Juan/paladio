from unittest.mock import MagicMock

import pytest
from app.swarm.agents.prompt_analyzer import prompt_analyzer_node
from app.swarm.state import SwarmState


@pytest.mark.asyncio
async def test_prompt_analyzer_node_extracts_preferences():
    state: SwarmState = {
        "messages": [
            MagicMock(
                content="I need to visit Louvre Museum. I love french cuisine and art."
            )
        ],
        "validated_itinerary": {"destination_city": "Paris"},
        "city_pois": [
            {
                "name": "Louvre Museum",
                "aliases": ["The Louvre", "Louvre"],
                "category": "MUSEUM",
                "cuisine": None,
                "tags": ["art_culture"],
            },
            {
                "name": "Le Marais Bistro",
                "aliases": [],
                "category": "RESTAURANT",
                "cuisine": "french",
                "tags": ["food_culinary"],
            },
        ],
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

    assert "validated_itinerary" in result
    assert "prompt_analysis" in result
    val_it = result["validated_itinerary"]
    assert any(
        n["poi_id"] == "Louvre Museum" and n["mandatory"] for n in val_it["nodes"]
    )
    assert "french" in val_it["preferred_cuisines"]
    assert "art" in val_it["travel_tastes"]
    assert val_it["tag_affinities"]["art_culture"] >= 0.65
    assert val_it["cuisine_target_frequency"] == 1
    assert result["prompt_analysis"]["mandatory_pois"] == ["Louvre Museum"]


@pytest.mark.asyncio
async def test_prompt_analyzer_node_empty_prompt():
    state: SwarmState = {
        "messages": [],
        "validated_itinerary": {"destination_city": "Paris"},
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
    assert "validated_itinerary" in result
    assert "prompt_analysis" in result
    assert result["prompt_analysis"]["mandatory_pois"] == []


@pytest.mark.asyncio
async def test_prompt_analyzer_node_general_prompt_without_named_pois():
    state: SwarmState = {
        "messages": [MagicMock(content="Some relaxing cultural trip message in Rome")],
        "validated_itinerary": {"destination_city": "Rome"},
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
    assert "validated_itinerary" in result
    assert "prompt_analysis" in result
    assert result["validated_itinerary"]["destination_city"] == "Rome"
    assert result["prompt_analysis"]["mandatory_pois"] == []


@pytest.mark.asyncio
async def test_prompt_analyzer_filters_cross_city_hallucinations():
    state: SwarmState = {
        "messages": [
            MagicMock(
                content="We love modern art like MoMA and tapas in Madrid, and want to visit Museo del Prado"
            )
        ],
        "validated_itinerary": {"destination_city": "Madrid"},
        "destination_city": "Madrid",
        "city_pois": [
            {
                "name": "Museo del Prado",
                "aliases": ["El Prado"],
                "category": "MUSEUM",
                "cuisine": None,
                "tags": ["art_culture"],
            },
            {
                "name": "Mercado de San Miguel",
                "aliases": [],
                "category": "RESTAURANT",
                "cuisine": "tapas",
                "tags": ["food_culinary"],
            },
        ],
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
    assert not any(n["poi_id"] == "MoMA" for n in val_it.get("nodes", []))
    assert any(n["poi_id"] == "Museo del Prado" for n in val_it.get("nodes", []))
    assert result["prompt_analysis"]["mandatory_pois"] == ["Museo del Prado"]
    assert "tapas" in result["prompt_analysis"]["preferred_cuisines"]
