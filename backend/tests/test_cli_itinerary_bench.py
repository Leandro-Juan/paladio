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
async def test_cli_itinerary_bench_baseline(tmp_path):
    # Run baseline mode on small filtered slice
    out_file = str(tmp_path / "baseline_test.json")
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
            "--output",
            out_file,
        ],
    ):
        code = await main_async()
        assert code == 0


@pytest.mark.asyncio
async def test_cli_itinerary_bench_compare(tmp_path):
    out_file = str(tmp_path / "compare_test.json")
    with patch(
        "sys.argv",
        [
            "itinerary_bench",
            "--mode",
            "compare",
            "--quick",
            "--output",
            out_file,
        ],
    ):
        code = await main_async()
        assert code == 0
