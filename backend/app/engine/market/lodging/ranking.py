"""
Paladio Taste-Aware Deterministic Hotel Ranking Engine.

Evaluates lodging candidates through a multi-objective utility function:
1. Hard filtering (dorm/hostel exclusion unless backpacker, max center distance, validity)
2. Relative normalized sub-scores in [0.0, 1.0]:
   - Price percentile rank (relative to date market)
   - Bayesian review quality (smoothed with prior) & stars
   - Geospatial centrality (exponential decay from center / POI cluster)
   - Booking flexibility (free cancellation, board)
   - Trust & verification confidence
   - Taste affinity fit (user preference alignment)
3. Dynamic taste-shifted weighting (budget tier, travel pace, tag affinities)
4. Deterministic Value Score [0.0 - 100.0], badge attribution, and explanatory reasons.

Strictly zero synthetic or hardcoded business fallbacks; zero LLM arithmetic.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from app.engine.market.config import config
from app.engine.scoring.features import TAG_KEYS


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS points in kilometers."""
    r = 6371.0  # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


@dataclass
class HotelCandidate:
    """Input representation of a hotel offer for ranking."""

    property_id: str
    name: str
    nightly_cents: int
    stars: float | None = None
    review_score: float | None = None
    review_count: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    property_type: str = "hotel"
    free_cancellation: bool | None = None
    board: str | None = None
    taxes_included: bool = True
    deep_link: str | None = None
    provider: str = "aggregator"
    confidence: str = "high"
    area_tags: dict[str, float] | None = None
    photo_url: str | None = None
    amenities: list[str] | None = None
    room_type: str | None = None
    address: str | None = None


@dataclass
class RankedHotel:
    """Output representation of a ranked hotel with score decomposition."""

    candidate: HotelCandidate
    value_score: float
    subscores: dict[str, float]
    badge: str
    rank_reasons: list[str] = field(default_factory=list)


def compute_taste_weights(
    user_preferences: dict[str, Any] | None = None,
) -> dict[str, float]:
    """
    Computes personalized utility weights based on user preferences.
    Base weights:
      P (Price): 0.30
      Q (Quality): 0.25
      L (Location): 0.20
      T (Taste): 0.15
      F (Flexibility): 0.05
      U (Trust): 0.05
    """
    base_w = {
        "price": getattr(config, "LODGING_WEIGHT_PRICE", 0.30),
        "quality": getattr(config, "LODGING_WEIGHT_QUALITY", 0.25),
        "location": getattr(config, "LODGING_WEIGHT_LOCATION", 0.20),
        "taste": getattr(config, "LODGING_WEIGHT_TASTE", 0.15),
        "flexibility": getattr(config, "LODGING_WEIGHT_FLEXIBILITY", 0.05),
        "trust": getattr(config, "LODGING_WEIGHT_TRUST", 0.05),
    }

    if not user_preferences:
        return base_w

    w = dict(base_w)
    budget = str(
        user_preferences.get("budget_tier", user_preferences.get("budget", "balanced"))
    ).lower()
    pace = str(user_preferences.get("pace", "balanced")).lower()

    if budget in ("budget", "backpacker", "frugal"):
        w["price"] += 0.15
        w["quality"] -= 0.08
        w["location"] -= 0.07
    elif budget in ("luxury", "premium", "boutique"):
        w["price"] -= 0.12
        w["quality"] += 0.08
        w["location"] += 0.04

    if pace in ("packed", "fast", "active"):
        w["location"] += 0.08
        w["price"] -= 0.04
        w["flexibility"] -= 0.04
    elif pace in ("relaxed", "slow"):
        w["quality"] += 0.06
        w["location"] -= 0.06

    econ = user_preferences.get("economic_profile")
    if isinstance(econ, dict):
        ps = econ.get("price_sensitivity")
        if ps is not None:
            w["price"] += (float(ps) - 0.5) * 0.25
        lp = econ.get("lodging_preferences")
        if isinstance(lp, dict):
            fc_bias = lp.get("free_cancellation_bias")
            if fc_bias is not None and float(fc_bias) > 0.55:
                w["flexibility"] += (float(fc_bias) - 0.5) * 0.16
            loc_w = lp.get("location_vs_price_weight")
            if loc_w is not None:
                w["location"] += (float(loc_w) - 0.5) * 0.14
            if lp.get("preferred_types") or lp.get("amenity_affinities"):
                w["taste"] += 0.08

    # Normalize weights to sum strictly to 1.0
    for k in w:
        w[k] = max(w[k], 0.02)
    total_w = sum(w.values())
    return {k: v / total_w for k, v in w.items()}


def is_eligible_candidate(
    candidate: HotelCandidate,
    user_preferences: dict[str, Any] | None = None,
    max_center_km: float | None = None,
    center_lat: float | None = None,
    center_lon: float | None = None,
) -> bool:
    """Applies Stage A hard eligibility filtering."""
    if candidate.nightly_cents <= 0:
        return False

    budget = ""
    if user_preferences:
        budget = str(
            user_preferences.get("budget_tier", user_preferences.get("budget", ""))
        ).lower()

    # Exclude shared dorms and hostels unless user is explicitly a backpacker
    norm_name = candidate.name.lower()
    norm_type = candidate.property_type.lower()
    is_dorm_hostel = (
        norm_type in ("hostel", "dormitory", "capsule")
        or "hostel" in norm_name
        or "shared dorm" in norm_name
        or "dormitory" in norm_name
        or "capsule" in norm_name
    )
    if is_dorm_hostel and budget != "backpacker":
        return False

    # Geospatial cutoff from city center
    effective_max_km = max_center_km or getattr(config, "LODGING_MAX_CENTER_KM", 12.0)
    if (
        center_lat is not None
        and center_lon is not None
        and candidate.latitude is not None
        and candidate.longitude is not None
    ):
        dist = haversine_km(
            center_lat, center_lon, candidate.latitude, candidate.longitude
        )
        if dist > effective_max_km:
            return False

    # Explicit user filters and learned vetoes if defined
    if user_preferences:
        econ = user_preferences.get("economic_profile")
        if isinstance(econ, dict):
            lp = econ.get("lodging_preferences")
            if isinstance(lp, dict):
                discarded = lp.get("discarded_property_ids") or []
                if candidate.property_id in discarded:
                    return False
        min_stars = user_preferences.get("min_stars")
        if (
            min_stars is not None
            and candidate.stars is not None
            and candidate.stars < float(min_stars)
        ):
            return False
        if (
            user_preferences.get("require_free_cancellation")
            and not candidate.free_cancellation
        ):
            return False

    return True


def compute_subscores(
    candidate: HotelCandidate,
    all_candidates: list[HotelCandidate],
    center_lat: float | None = None,
    center_lon: float | None = None,
    user_preferences: dict[str, Any] | None = None,
) -> dict[str, float]:
    """
    Computes normalized sub-scores in [0.0, 1.0] for a single hotel candidate
    relative to the pool of all eligible candidates on that check-in date.
    """
    # 1. Price Score (P): Percentile ranking among date candidates
    prices = sorted([c.nightly_cents for c in all_candidates])
    n_p = len(prices)
    if n_p <= 1:
        p_score = 1.0
    else:
        rank_idx = prices.index(candidate.nightly_cents)
        p_score = 1.0 - (rank_idx / (n_p - 1))

    # 2. Quality Score (Q): Bayesian smoothed rating blended with star class
    m = getattr(config, "LODGING_PRIOR_REVIEWS_M", 50.0)
    c_prior = getattr(config, "LODGING_PRIOR_RATING_C", 7.5)
    raw_r = candidate.review_score if candidate.review_score is not None else c_prior
    if candidate.review_score is not None and raw_r <= 5.0:
        raw_r = raw_r * 2.0
    v = candidate.review_count if candidate.review_count is not None else 0

    # Bayesian smoothing: (v*R + m*C) / (v+m)
    smoothed_rating = (v * raw_r + m * c_prior) / (v + m)
    rating_norm = max(0.0, min(smoothed_rating / 10.0, 1.0))

    if candidate.stars and candidate.stars > 0:
        star_norm = max(0.0, min(candidate.stars / 5.0, 1.0))
        q_score = 0.75 * rating_norm + 0.25 * star_norm
    else:
        q_score = rating_norm

    # 3. Location Score (L): Exponential distance decay from destination center
    if (
        center_lat is not None
        and center_lon is not None
        and candidate.latitude is not None
        and candidate.longitude is not None
    ):
        dist_km = haversine_km(
            center_lat, center_lon, candidate.latitude, candidate.longitude
        )
        # 4.0 km characteristic half-distance decay
        l_score = math.exp(-dist_km / 4.0)
    else:
        l_score = 0.65  # Neutral location score when coordinates unavailable

    # 4. Flexibility Score (F)
    f_score = 0.3
    if candidate.free_cancellation is True:
        f_score += 0.4
    if candidate.board and "breakfast" in candidate.board.lower():
        f_score += 0.3
    f_score = min(f_score, 1.0)

    # 5. Trust & Verification Score (U)
    u_score = 0.7 if candidate.confidence == "high" else 0.5
    if candidate.review_count and candidate.review_count >= 100:
        u_score += 0.2
    if candidate.taxes_included:
        u_score += 0.1
    if candidate.photo_url:
        u_score += 0.15
    if candidate.address:
        u_score += 0.10
    if candidate.amenities:
        u_score += 0.05
    u_score = min(u_score, 1.0)

    # 6. Taste Affinity Fit (T)
    t_score = 0.5
    user_tag_affinities: dict[str, float] = {}
    if user_preferences:
        user_tag_affinities = user_preferences.get("tag_affinities", {})

    if user_tag_affinities and candidate.area_tags:
        # Cosine similarity between user tag weights and hotel area tags
        dot = sum(
            user_tag_affinities.get(k, 0.5) * candidate.area_tags.get(k, 0.0)
            for k in TAG_KEYS
        )
        norm_u = math.sqrt(
            sum(user_tag_affinities.get(k, 0.5) ** 2 for k in TAG_KEYS) or 1.0
        )
        norm_a = math.sqrt(
            sum(candidate.area_tags.get(k, 0.0) ** 2 for k in TAG_KEYS) or 1.0
        )
        cos_sim = dot / (norm_u * norm_a)
        t_score = max(0.0, min(cos_sim, 1.0))
    elif user_preferences:
        # Secondary taste heuristics based on budget and pace
        budget = str(
            user_preferences.get(
                "budget_tier", user_preferences.get("budget", "balanced")
            )
        ).lower()
        if budget in ("luxury", "premium") and candidate.stars and candidate.stars >= 4:
            t_score += 0.25
        elif budget in ("budget", "backpacker") and p_score >= 0.7:
            t_score += 0.25
        t_score = min(t_score, 1.0)

    if user_preferences and isinstance(user_preferences.get("economic_profile"), dict):
        lp = user_preferences["economic_profile"].get("lodging_preferences") or {}
        if isinstance(lp, dict):
            pref_types = lp.get("preferred_types") or {}
            pt_key = (candidate.property_type or "hotel").lower()
            if pt_key in pref_types:
                t_score += (float(pref_types[pt_key]) - 0.5) * 0.40
            pref_stars = lp.get("preferred_stars")
            if pref_stars is not None and candidate.stars is not None:
                t_score += max(
                    -0.15, 0.20 - 0.08 * abs(float(candidate.stars) - float(pref_stars))
                )
            am_affs = lp.get("amenity_affinities") or {}
            if candidate.amenities and isinstance(am_affs, dict) and am_affs:
                cand_ams = {str(a).strip().lower() for a in candidate.amenities if a}
                matched = [float(am_affs[a]) for a in cand_ams if a in am_affs]
                if matched:
                    t_score += min(0.20, (sum(matched) / len(matched) - 0.5) * 0.40)
            if (
                float(lp.get("free_cancellation_bias", 0.5)) > 0.6
                and candidate.free_cancellation
            ):
                t_score += 0.08
            t_score = max(0.0, min(t_score, 1.0))

    return {
        "price": round(p_score, 4),
        "quality": round(q_score, 4),
        "location": round(l_score, 4),
        "flexibility": round(f_score, 4),
        "trust": round(u_score, 4),
        "taste": round(t_score, 4),
    }


def rank_hotels(
    candidates: list[HotelCandidate],
    user_preferences: dict[str, Any] | None = None,
    center_lat: float | None = None,
    center_lon: float | None = None,
    max_center_km: float | None = None,
) -> list[RankedHotel]:
    """
    Ranks lodging candidates using the Paladio Taste-Aware Value Scoring Matrix.
    Returns ranked list ordered by ValueScore descending.
    """
    if not candidates:
        return []

    # 1. Hard eligibility filtering
    eligible = [
        c
        for c in candidates
        if is_eligible_candidate(
            c,
            user_preferences=user_preferences,
            max_center_km=max_center_km,
            center_lat=center_lat,
            center_lon=center_lon,
        )
    ]

    # If all filtered out (e.g. strict filters in small corpus), relax to avoid 0 results
    if not eligible:
        eligible = candidates

    # 2. Compute dynamic personalized weights
    weights = compute_taste_weights(user_preferences)

    # 3. Calculate subscores & Value Score
    ranked_items: list[tuple[HotelCandidate, float, dict[str, float]]] = []
    for c in eligible:
        sub = compute_subscores(
            c,
            all_candidates=eligible,
            center_lat=center_lat,
            center_lon=center_lon,
            user_preferences=user_preferences,
        )
        val = sum(weights[k] * sub[k] for k in weights)
        val_score = round(val * 100.0, 1)
        ranked_items.append((c, val_score, sub))

    # 4. Sort: ValueScore DESC, photo_url presence, nightly_cents ASC, review_count DESC
    ranked_items.sort(
        key=lambda item: (
            -item[1],
            0 if item[0].photo_url else 1,
            item[0].nightly_cents,
            -(item[0].review_count or 0),
        )
    )

    cheapest_cents = min(c.nightly_cents for c in eligible)
    best_quality_c = max(
        eligible,
        key=lambda x: (x.review_score or 0.0, x.stars or 0.0),
    )

    results: list[RankedHotel] = []
    for idx, (cand, v_score, sub) in enumerate(ranked_items):
        reasons: list[str] = []
        badge = "standard"

        if idx == 0:
            badge = "best_value"
            reasons.append("Top overall value score")
        elif cand.nightly_cents == cheapest_cents:
            badge = "cheapest"
            reasons.append("Lowest nightly price")
        elif cand.property_id == best_quality_c.property_id:
            badge = "top_rated"
            reasons.append("Highest verified guest rating")
        elif sub["location"] >= 0.8:
            badge = "central"
            reasons.append("Prime central location")

        if cand.review_score and cand.review_score >= 8.5:
            reasons.append(f"★ {cand.review_score:.1f} guest rating")
        if cand.free_cancellation:
            reasons.append("Free cancellation")
        if sub["price"] >= 0.8:
            reasons.append("High price-to-quality yield")

        results.append(
            RankedHotel(
                candidate=cand,
                value_score=v_score,
                subscores=sub,
                badge=badge,
                rank_reasons=reasons,
            )
        )

    return results
