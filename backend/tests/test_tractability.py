from app.bench.tractability import run_single_probe, derive_tractable_nodes_table


def test_run_single_probe():
    # Probe with 8 nodes, 240 window, BALANCED pace, 1 repeat
    result = run_single_probe(
        node_count=8,
        window_mins=240,
        pace="BALANCED",
        with_realism=True,
        timeout_ms=5000,
        repeats=1,
    )
    assert "p50_ms" in result
    assert "p95_ms" in result
    assert result["p50_ms"] >= 0.0
    assert result["timed_out"] is False


def test_derive_tractable_nodes_table():
    sample_records = [
        {"window_mins": 240, "node_count": 8, "p95_ms": 10.0, "timed_out": False},
        {"window_mins": 240, "node_count": 16, "p95_ms": 40.0, "timed_out": False},
        {"window_mins": 240, "node_count": 32, "p95_ms": 1200.0, "timed_out": True},
        {"window_mins": 480, "node_count": 16, "p95_ms": 25.0, "timed_out": False},
        {"window_mins": 480, "node_count": 24, "p95_ms": 80.0, "timed_out": False},
    ]
    table = derive_tractable_nodes_table(sample_records, max_p95_ms=500.0)
    assert table[240] == 16
    assert table[480] == 24
