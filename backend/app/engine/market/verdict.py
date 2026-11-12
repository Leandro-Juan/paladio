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
    verdict: str  # 'GREAT' | 'GOOD' | 'TYPICAL' | 'HIGH' | 'PEAK' | 'INSUFFICIENT_DATA'
    percentile: float | None  # 0.0 to 100.0, None if insufficient baseline quantiles
    vs_median_pct: float  # positive = cheaper than median, negative = more expensive
    price_eur: float
    baseline_p10_eur: float | None
    baseline_p25_eur: float | None
    baseline_p50_eur: float | None
    baseline_p75_eur: float | None
    baseline_p90_eur: float | None
    confidence: str  # 'building' | 'provisional' | 'established'
    explanation: str
    is_clamped: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "percentile": round(self.percentile, 1)
            if self.percentile is not None
            else None,
            "vs_median_pct": round(self.vs_median_pct, 1),
            "price_eur": round(self.price_eur, 2),
            "baseline_p10_eur": (
                round(self.baseline_p10_eur, 2)
                if self.baseline_p10_eur is not None
                else None
            ),
            "baseline_p25_eur": (
                round(self.baseline_p25_eur, 2)
                if self.baseline_p25_eur is not None
                else None
            ),
            "baseline_p50_eur": (
                round(self.baseline_p50_eur, 2)
                if self.baseline_p50_eur is not None
                else None
            ),
            "baseline_p75_eur": (
                round(self.baseline_p75_eur, 2)
                if self.baseline_p75_eur is not None
                else None
            ),
            "baseline_p90_eur": (
                round(self.baseline_p90_eur, 2)
                if self.baseline_p90_eur is not None
                else None
            ),
            "confidence": self.confidence,
            "explanation": self.explanation,
            "is_clamped": self.is_clamped,
        }


def interpolate_percentile(
    price: int, q_dict: dict[str, int], return_clamped_flag: bool = False
) -> Any:
    """
    Interpolates empirical percentile (0 to 100) from observed quantiles:
    q02, q05, q10, q25, q50, q75, q90.
    Clamps at the observed range boundaries per PLAN.md P4.2.
    """
    pts = [
        (q_dict.get("q02"), 2.0),
        (q_dict.get("q05"), 5.0),
        (q_dict.get("q10"), 10.0),
        (q_dict.get("q25"), 25.0),
        (q_dict.get("q50"), 50.0),
        (q_dict.get("q75"), 75.0),
        (q_dict.get("q90"), 90.0),
    ]
    # Filter valid positive values
    valid_pts = [(p, pct) for p, pct in pts if p is not None and p > 0]
    if len(valid_pts) < 2:
        return (None, False) if return_clamped_flag else None

    # Ensure strictly sorted by price
    valid_pts.sort(key=lambda x: x[0])

    if price <= valid_pts[0][0]:
        # Clamped at minimum observed quantile
        res = (valid_pts[0][1], True)
        return res if return_clamped_flag else res[0]

    if price >= valid_pts[-1][0]:
        # Clamped at maximum observed quantile
        res = (valid_pts[-1][1], True)
        return res if return_clamped_flag else res[0]

    # Linear interpolation between observed quantile brackets
    for i in range(len(valid_pts) - 1):
        p_low, pct_low = valid_pts[i]
        p_high, pct_high = valid_pts[i + 1]
        if p_low <= price <= p_high:
            if p_high == p_low:
                res = (pct_low, False)
                return res if return_clamped_flag else res[0]
            fraction = (price - p_low) / (p_high - p_low)
            res = (pct_low + fraction * (pct_high - pct_low), False)
            return res if return_clamped_flag else res[0]

    res = (50.0, False)
    return res if return_clamped_flag else res[0]


def classify_price(
    price_cents: int,
    quantiles: dict[str, int],
    confidence: str = "provisional",
) -> PriceVerdict:
    """
    Evaluates price_cents against empirical baseline distribution quantiles.
    Zero synthetic quantile derivation per PLAN.md P4.2:
    Returns INSUFFICIENT_DATA when baseline quantiles are missing.
    Assigns verdict tier:
      - 'GREAT': <= q10 (exceptional deal)
      - 'GOOD': <= q25 (solid savings)
      - 'TYPICAL': <= q75 (fair market price)
      - 'HIGH': <= q90 (above average)
      - 'PEAK': > q90 (high demand / peak pricing)
      - 'INSUFFICIENT_DATA': missing empirical quantiles
    """
    price_eur = price_cents / 100.0

    q10 = quantiles.get("q10")
    q25 = quantiles.get("q25")
    q50 = quantiles.get("q50")
    q75 = quantiles.get("q75")
    q90 = quantiles.get("q90")

    # P4.2: Zero quantile synthesis. If essential quantiles missing, report INSUFFICIENT_DATA
    if q50 is None or (q10 is None and q25 is None and q75 is None):
        return PriceVerdict(
            verdict="INSUFFICIENT_DATA",
            percentile=None,
            vs_median_pct=0.0,
            price_eur=price_eur,
            baseline_p10_eur=None,
            baseline_p25_eur=None,
            baseline_p50_eur=None,
            baseline_p75_eur=None,
            baseline_p90_eur=None,
            confidence=confidence,
            explanation="Insufficient empirical baseline quantiles to evaluate price.",
            is_clamped=False,
        )

    percentile, is_clamped = interpolate_percentile(
        price_cents, quantiles, return_clamped_flag=True
    )

    p10_eur = round(q10 / 100.0, 2) if q10 is not None else None
    p25_eur = round(q25 / 100.0, 2) if q25 is not None else None
    p50_eur = round(q50 / 100.0, 2) if q50 is not None else None
    p75_eur = round(q75 / 100.0, 2) if q75 is not None else None
    p90_eur = round(q90 / 100.0, 2) if q90 is not None else None

    # Calculate vs median percentage
    if p50_eur and p50_eur > 0:
        vs_median_pct = ((p50_eur - price_eur) / p50_eur) * 100.0
    else:
        vs_median_pct = 0.0

    # Classification logic based on empirical quantiles
    if q10 is not None and price_cents <= q10:
        verdict = "GREAT"
        explanation = f"Top-tier deal: cheaper than 90% of observed dates (€{price_eur:.2f} vs median €{p50_eur:.2f})"
    elif q25 is not None and price_cents <= q25:
        verdict = "GOOD"
        explanation = f"Discounted fare: cheaper than 75% of observed dates (€{price_eur:.2f} vs median €{p50_eur:.2f})"
    elif price_cents <= q50 or (q75 is not None and price_cents <= q75):
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
        is_clamped=is_clamped,
    )
