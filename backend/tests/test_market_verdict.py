"""Unit tests for Deal Engine Market Verdict & Price Classification."""

from app.engine.market.verdict import classify_price, interpolate_percentile


def test_classify_price_tiers():
    quantiles = {
        "q02": 1500,  # 15.00 EUR
        "q05": 2000,  # 20.00 EUR
        "q10": 2500,  # 25.00 EUR
        "q25": 3500,  # 35.00 EUR
        "q50": 5000,  # 50.00 EUR
        "q75": 7500,  # 75.00 EUR
        "q90": 11000,  # 110.00 EUR
    }

    # Great deal (<= q10)
    v_great = classify_price(2200, quantiles, confidence="provisional")
    assert v_great.verdict == "GREAT"
    assert v_great.percentile < 10.0
    assert v_great.vs_median_pct > 50.0
    assert v_great.confidence == "provisional"

    # Good deal (<= q25)
    v_good = classify_price(3000, quantiles, confidence="provisional")
    assert v_good.verdict == "GOOD"
    assert 10.0 <= v_good.percentile <= 25.0
    assert v_good.vs_median_pct > 0

    # Typical (<= q75)
    v_typical = classify_price(5500, quantiles, confidence="established")
    assert v_typical.verdict == "TYPICAL"
    assert 25.0 < v_typical.percentile <= 75.0
    assert v_typical.confidence == "established"

    # High (<= q90)
    v_high = classify_price(9000, quantiles, confidence="established")
    assert v_high.verdict == "HIGH"
    assert 75.0 < v_high.percentile <= 90.0
    assert v_high.vs_median_pct < 0

    # Peak (> q90)
    v_peak = classify_price(15000, quantiles, confidence="established")
    assert v_peak.verdict == "PEAK"
    assert v_peak.percentile >= 90.0


def test_interpolate_percentile_boundaries():
    quantiles = {
        "q02": 2000,
        "q10": 3000,
        "q50": 6000,
        "q90": 12000,
    }
    # Below minimum
    assert interpolate_percentile(1000, quantiles) <= 2.0
    # Exact median
    assert interpolate_percentile(6000, quantiles) == 50.0
    # Far above peak
    assert interpolate_percentile(20000, quantiles) >= 90.0


def test_verdict_to_dict():
    quantiles = {
        "q10": 2000,
        "q50": 5000,
        "q90": 10000,
    }
    v = classify_price(2500, quantiles, confidence="provisional")
    d = v.to_dict()
    assert d["verdict"] in ("GREAT", "GOOD", "TYPICAL")
    assert "percentile" in d
    assert "price_eur" in d
    assert d["baseline_p50_eur"] == 50.0
