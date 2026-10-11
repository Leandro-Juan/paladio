"""
End-to-End Trip Generation Test (Exact Frontend Contract Fidelity).

This test replicates the EXACT data structures, user inputs, WebSocket protocol,
Human-in-the-Loop verification auto-resumes, and Trip Vault persistence executed by the
Paladio frontend (TripPreparationForm.tsx, usePaladioSocket.ts, engine/page.tsx, and useTrips.ts).

Exempt from CI/CD pipeline runs via:
  pytestmark = [pytest.mark.slow, pytest.mark.live_integration]
"""

import os

import httpx

try:
    import pytest

    pytestmark = [pytest.mark.slow, pytest.mark.live_integration]
except ImportError:
    pytest = None
    pytestmark = []

from scripts.generate_trip_e2e import (
    DEFAULT_API_URL,
    TRIP_SCENARIOS,
    execute_frontend_trip_e2e,
    format_itinerary_summary,
    main,
)


def is_live_stack_online() -> bool:
    """Check if the backend HTTP gateway is reachable."""
    try:
        resp = httpx.get(f"{DEFAULT_API_URL}/trips/", timeout=2.0)
        return resp.status_code in (200, 401, 403)
    except Exception:
        return False


if pytest:
    live_stack_required = pytest.mark.skipif(
        not is_live_stack_online(),
        reason=f"Live backend stack is not reachable at {DEFAULT_API_URL}. Start stack with docker-compose.",
    )
    test_async = pytest.mark.asyncio
    test_param = pytest.mark.parametrize
else:

    def live_stack_required(f):
        return f

    def test_async(f):
        return f

    def test_param(*args, **kwargs):
        def deco(f):
            return f

        return deco


# ==============================================================================
# Pytest Test Cases
# ==============================================================================


@live_stack_required
@test_async
async def test_e2e_trip_generation_custom_env():
    """
    Ad-hoc E2E trip generation using optional environment variable overrides.
    Example:
      PALADIO_TEST_ORIGIN="Madrid" PALADIO_TEST_CITY="Sevilla" PALADIO_TEST_DAYS="2" pytest backend/tests/test_trip_generation_e2e.py -s -m live_integration
    """
    origin = os.getenv("PALADIO_TEST_ORIGIN", "Madrid")
    destination = os.getenv("PALADIO_TEST_CITY", "Sevilla")
    days = int(os.getenv("PALADIO_TEST_DAYS", "2"))
    budget = float(os.getenv("PALADIO_TEST_BUDGET", "800.0"))
    prompt = os.getenv(
        "PALADIO_TEST_PROMPT",
        "Visit Alcazar, Cathedral, and enjoy tapas and flamenco.",
    )

    result = await execute_frontend_trip_e2e(
        origin_city=origin,
        destination_city=destination,
        duration_days=days,
        prompt=prompt,
        budget_usd=budget,
    )

    assert result["trip_id"] is not None
    assert len(result["itinerary"]["days"]) == days
    format_itinerary_summary(result["itinerary"])


@live_stack_required
@test_async
@test_param("scenario", TRIP_SCENARIOS, ids=lambda s: s["name"])
async def test_e2e_trip_generation_matrix(scenario: dict):
    """
    Parameterized matrix of diverse trips verifying different cities, durations,
    and prompt preferences.
    """
    result = await execute_frontend_trip_e2e(
        origin_city=scenario["origin_city"],
        destination_city=scenario["destination_city"],
        duration_days=scenario["days"],
        prompt=scenario["prompt"],
        budget_usd=scenario["budget_usd"],
    )

    assert result["trip_id"] is not None
    assert len(result["itinerary"]["days"]) == scenario["days"]
    format_itinerary_summary(result["itinerary"])


# ==============================================================================
# Standalone CLI Entrypoint
# ==============================================================================

if __name__ == "__main__":
    main()
