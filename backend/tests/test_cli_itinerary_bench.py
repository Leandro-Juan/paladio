import pytest
from app.cli.itinerary_bench import main_async
from unittest.mock import patch


@pytest.mark.asyncio
async def test_cli_itinerary_bench_tractability():
    # Run tractability mode with minimal params
    with patch("sys.argv", ["itinerary_bench", "--mode", "tractability", "--quick"]):
        code = await main_async()
        assert code == 0


@pytest.mark.asyncio
async def test_cli_itinerary_bench_baseline():
    # Run baseline mode on small filtered slice
    with patch(
        "sys.argv",
        [
            "itinerary_bench",
            "--mode",
            "baseline",
            "--cities",
            "Madrid",
            "--durations",
            "2",
            "--paces",
            "BALANCED",
            "--profiles",
            "culture",
        ],
    ):
        code = await main_async()
        assert code == 0
