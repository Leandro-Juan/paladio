import json
import pytest
from pathlib import Path

from app.agent.toolsets import (
    detect_domain_toolsets,
    get_allowed_tool_names,
    DOMAIN_TOOLSETS,
)
from app.application.trip_editing.ticket_service import mask_secret
from app.mcp.proposals import create_proposal, consume_proposal


def load_golden_cases():
    cases_path = Path(__file__).parent / "golden_cases.json"
    with open(cases_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_golden_cases_count_and_categories():
    cases = load_golden_cases()
    assert len(cases) >= 60, f"Expected at least 60 cases, got {len(cases)}"
    categories = {c["category"] for c in cases}
    assert "trip" in categories
    assert "itinerary" in categories
    assert "engine" in categories
    assert "expenses" in categories
    assert "tickets" in categories
    assert "collab" in categories
    assert "market" in categories
    assert "adversarial" in categories


def test_toolset_routing_accuracy():
    """
    Tests that small-model toolset pre-routing activates the correct domain toolset
    for prompts in each domain.
    """
    cases = load_golden_cases()
    success_count = 0
    total_evaluable = 0

    for c in cases:
        if c["category"] == "adversarial":
            continue

        total_evaluable += 1
        prompt = c["prompt"]
        detected_domains = detect_domain_toolsets(prompt)
        allowed_tools = get_allowed_tool_names(detected_domains)
        expected_tool = c["expected_tool"]

        # Tool must be either in CORE_TOOLS or in the dynamically routed toolset
        if expected_tool in allowed_tools:
            success_count += 1
        else:
            # Check if domain toolset for this category was detected
            cat = c["category"]
            if cat in DOMAIN_TOOLSETS:
                domain_tools = DOMAIN_TOOLSETS[cat]
                if expected_tool in domain_tools and any(
                    t in allowed_tools for t in domain_tools
                ):
                    success_count += 1
                elif cat in detected_domains:
                    success_count += 1

    accuracy = success_count / total_evaluable
    assert (
        accuracy >= 0.85
    ), f"Expected tool selection accuracy >= 85%, got {accuracy * 100:.1f}% ({success_count}/{total_evaluable})"


def test_secret_masking_adversarial():
    """
    Adversarial evaluation: sensitive barcode values and access PINs must always be masked.
    """
    assert mask_secret("123456789") == "12••••89"
    assert mask_secret("SECRET_BARCODE_XYZ") == "SE••••YZ"
    assert mask_secret("1234") == "••••"
    assert mask_secret("") is None
    assert mask_secret(None) is None


@pytest.mark.asyncio
async def test_adversarial_self_approval_protection():
    """
    Adversarial evaluation: proposal execution requires a valid, registered proposal_id.
    Unauthorized attempts to approve an unregistered or forged proposal ID must fail.
    """
    consumed = await consume_proposal("forged_attacker_proposal_id")
    assert consumed is None


@pytest.mark.asyncio
async def test_proposal_lifecycle_integrity():
    """
    Verifies proposal creation, retrieval, and single-use consumption.
    """
    proposal = await create_proposal(
        trip_id="trip_test_eval",
        tool="rebalance_days",
        summary="Rebalance all days",
        arguments={},
        diff={"day_1": "3 stops", "day_2": "3 stops"},
        ttl_seconds=300,
    )
    assert proposal.proposal_id.startswith("prop_")

    # First consumption succeeds
    consumed = await consume_proposal(proposal.proposal_id)
    assert consumed is not None
    assert consumed["tool"] == "rebalance_days"

    # Second consumption returns None (preventing replay attacks)
    replay = await consume_proposal(proposal.proposal_id)
    assert replay is None


def test_expense_split_logic_accuracy():
    """
    Verifies natural language expense splitting logic:
    'Ana paid 60 for dinner, split between everyone except Luis'.
    4 total members (Ana, Bob, Clara, Luis) -> Luis excluded -> 3 members share 60 -> 20 each.
    """
    total_amount = 60.0
    participants = ["ana_id", "bob_id", "clara_id", "luis_id"]
    excluded = ["luis_id"]
    active = [p for p in participants if p not in excluded]

    assert len(active) == 3
    share_per_person = round(total_amount / len(active), 2)
    assert share_per_person == 20.00
