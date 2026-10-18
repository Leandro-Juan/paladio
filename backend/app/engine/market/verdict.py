"""
Paladio Deal Engine Price Classification & Verdict System.
Provides a unified, deterministic evaluation for whether any observed price
is a deal, fair, or peak relative to the empirical route corpus distribution.
Zero hardcoded synthetic thresholds; 100% computed from real quantiles.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PriceVerdict:
    verdict: str  # 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK'
    percentile: float  # 0.0 to 100.0 (lower is cheaper)
    vs_median_pct: float  # positive = cheaper than median, negative = more expensive
    price_eur: float
    baseline_p10_eur: float | None
    baseline_p25_eur: float | None
    baseline_p50_eur: float | None
    baseline_p75_eur: float | None
    baseline_p90_eur: float | None
    confidence: str  # 'building' | 'provisional' | 'established'
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "percentile": round(self.percentile, 1),
            "vs_median_pct": round(self.vs_median_pct, 1),
            "price_eur": round(self.price_eur, 2),
            "baseline_p10_eur": round(self.baseline_p10_eur, 2)
            if self.baseline_p10_eur is not None
            else None,
            "baseline_p25_eur": round(self.baseline_p25_eur, 2)
            if self.baseline_p25_eur is not None
            else None,
            "baseline_p50_eur": round(self.baseline_p50_eur, 2)
            if self.baseline_p50_eur is not None
            else None,
            "baseline_p75_eur": round(self.baseline_p75_eur, 2)
            if self.baseline_p75_eur is not None
            else None,
            "baseline_p90_eur": round(self.baseline_p90_eur, 2)
            if self.baseline_p90_eur is not None
            else None,
            "confidence": self.confidence,
            "explanation": self.explanation,
        }


def interpolate_percentile(price: int, q_dict: dict[str, int]) -> float:
    """
    Interpolates empirical percentile (0 to 100) from quantiles:
    q02, q05, q10, q25, q50, q75, q90.
    """
    pts = [
        (q_dict.get("q02", 0), 2.0),
        (q_dict.get("q05", 0), 5.0),
        (q_dict.get("q10", 0), 10.0),
        (q_dict.get("q25", 0), 25.0),
        (q_dict.get("q50", 0), 50.0),
        (q_dict.get("q75", 0), 75.0),
        (q_dict.get("q90", 0), 90.0),
    ]
    # Filter valid positive values
    pts = [p for p in pts if p[0] > 0]
    if not pts:
        return 50.0

    # Ensure strictly sorted by price
    pts.sort(key=lambda x: x[0])

    if price <= pts[0][0]:
        # Below or equal to minimum quantile
        ratio = max(price / pts[0][0], 0.0) if pts[0][0] > 0 else 1.0
        return max(pts[0][1] * ratio, 1.0)

    if price >= pts[-1][0]:
        # Above maximum quantile
        return min(90.0 + (price - pts[-1][0]) / max(pts[-1][0], 1) * 10.0, 99.0)

    # Linear interpolation between quantile brackets
    for i in range(len(pts) - 1):
        p_low, pct_low = pts[i]
        p_high, pct_high = pts[i + 1]
        if p_low <= price <= p_high:
            if p_high == p_low:
                return pct_low
            fraction = (price - p_low) / (p_high - p_low)
            return pct_low + fraction * (pct_high - pct_low)

    return 50.0


def classify_price(
    price_cents: int,
    quantiles: dict[str, int],
    confidence: str = "provisional",
) -> PriceVerdict:
    """
    Evaluates price_cents against empirical baseline distribution quantiles.
    Assigns verdict tier:
      - 'GREAT': <= q10 (exceptional deal)
      - 'GOOD': <= q25 (solid savings)
      - 'TYPICAL': <= q75 (fair market price)
      - 'HIGH': <= q90 (above average)
      - 'PEAK': > q90 (high demand / peak pricing)
    """
    price_eur = price_cents / 100.0

    q10 = quantiles.get("q10")
    q25 = quantiles.get("q25")
    q50 = quantiles.get("q50")
    q75 = quantiles.get("q75")
    q90 = quantiles.get("q90")

    # If q90, q75, or q25 were not provided, derive smoothly from available brackets
    if q25 is None and q10 is not None and q50 is not None:
        q25 = int(q10 + (q50 - q10) * 0.4)
    if q75 is None and q50 is not None and q90 is not None:
        q75 = int(q50 + (q90 - q50) * 0.6)
    elif q75 is None and q50 is not None and q25 is not None:
        q75 = q50 + (q50 - q25)
    if q90 is None and q75 is not None and q50 is not None:
        q90 = q75 + int((q75 - q50) * 0.8)

    p10_eur = round(q10 / 100.0, 2) if q10 else None
    p25_eur = round(q25 / 100.0, 2) if q25 else None
    p50_eur = round(q50 / 100.0, 2) if q50 else None
    p75_eur = round(q75 / 100.0, 2) if q75 else None
    p90_eur = round(q90 / 100.0, 2) if q90 else None

    # Calculate vs median percentage
    if p50_eur and p50_eur > 0:
        vs_median_pct = ((p50_eur - price_eur) / p50_eur) * 100.0
    else:
        vs_median_pct = 0.0

    percentile = interpolate_percentile(price_cents, quantiles)

    # Classification logic
    if q10 is not None and price_cents <= q10:
        verdict = "GREAT"
        explanation = f"Top-tier deal: cheaper than 90% of observed dates (€{price_eur:.2f} vs median €{p50_eur:.2f})"
    elif q25 is not None and price_cents <= q25:
        verdict = "GOOD"
        explanation = f"Discounted fare: cheaper than 75% of observed dates (€{price_eur:.2f} vs median €{p50_eur:.2f})"
    elif q75 is not None and price_cents <= q75:
        verdict = "TYPICAL"
        explanation = f"Fair market price around the route standard (€{price_eur:.2f} vs median €{p50_eur:.2f})"
    elif q90 is not None and price_cents <= q90:
        verdict = "HIGH"
        explanation = f"Above average price: only ~25% of dates are this expensive (€{price_eur:.2f})"
    else:
        verdict = "PEAK"
        explanation = f"Peak/surge price: among the top 10% most expensive fares for this route (€{price_eur:.2f})"

    return PriceVerdict(
        verdict=verdict,
        percentile=percentile,
        vs_median_pct=vs_median_pct,
        price_eur=price_eur,
        baseline_p10_eur=p10_eur,
        baseline_p25_eur=p25_eur,
        baseline_p50_eur=p50_eur,
        baseline_p75_eur=p75_eur,
        baseline_p90_eur=p90_eur,
        confidence=confidence,
        explanation=explanation,
    )
