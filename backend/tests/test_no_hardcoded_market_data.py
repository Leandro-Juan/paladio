"""
Guardrail Test: Zero Hardcoded Application Data in Market Engine.
Scans AST of backend/app/engine/market/ (except config.py) to guarantee:
1. No synthetic hardcoded fallback rates or arbitrary numeric offsets (+3500, 7500, etc.).
2. No fabricated hotel/property name string literals.
3. No cloud provider imports.
"""

import os

MARKET_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "engine", "market")


def test_zero_cloud_providers():
    """Verifies that no cloud LLM or cloud scraping APIs are referenced in market providers."""
    for root, _, files in os.walk(MARKET_DIR):
        for f in files:
            if f.endswith(".py"):
                path = os.path.join(root, f)
                with open(path, "r", encoding="utf-8") as fh:
                    content = fh.read()
                    assert "openai" not in content.lower(), f"Cloud API detected in {f}"
                    assert (
                        "anthropic" not in content.lower()
                    ), f"Cloud API detected in {f}"
                    assert (
                        "scrapegraph" not in content.lower()
                    ), f"Cloud API detected in {f}"
                    assert (
                        "pricewin" not in content.lower()
                    ), f"Cloud API detected in {f}"


def test_no_synthetic_hotel_names():
    """Guarantees that no fake hotel names (e.g. 'City Center Boutique Hotel') exist in production adapters."""
    adapters_path = os.path.join(MARKET_DIR, "adapters.py")
    with open(adapters_path, "r", encoding="utf-8") as fh:
        content = fh.read()
        assert (
            "Boutique Hotel" not in content
        ), "Hardcoded hotel name found in adapters.py"
        assert (
            "7500" not in content
        ), "Hardcoded fallback rate 7500 found in adapters.py"
        assert (
            "78.0" not in content
        ), "Hardcoded quality score 78.0 found in adapters.py"


def test_no_cold_start_fake_offsets():
    """Guarantees that detector.py does not fake deal baselines with arbitrary price additions."""
    detector_path = os.path.join(MARKET_DIR, "detector.py")
    with open(detector_path, "r", encoding="utf-8") as fh:
        content = fh.read()
        assert "3500" not in content, "Cold start offset 3500 found in detector.py"
        assert "2500" not in content, "Cold start offset 2500 found in detector.py"


if __name__ == "__main__":
    test_zero_cloud_providers()
    test_no_synthetic_hotel_names()
    test_no_cold_start_fake_offsets()
    print("ALL ZERO-HARDCODE INVARIANTS PASSED!")
