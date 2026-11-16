"""Trip-Level Submodular Selection for Paladio Itinerary v2.

Selects the global set of POIs for the entire trip before day assignment:
1. Guaranteed forced set (User mandatories + Tier 1 iconic items up to ~55% anchor slots)
2. Deterministic submodular greedy selection balancing taste, tier, diversity, and time
3. Graceful visit mode downgrade before dropping
4. Typed reason codes for all selected and dropped candidates
"""

from __future__ import annotations

import math
import unicodedata
from enum import Enum

from app.engine.candidate_pool import CandidatePoi
from app.engine.trip_frame import TripFrame
from app.schemas.user import PacePreference
from pydantic import BaseModel


def is_quick_landmark(cand: CandidatePoi) -> bool:
    """True if POI is an open-air plaza, viewpoint, monument, or brief stop."""
    if getattr(cand, "visit_mode", "full") in ("quick", "walk_by"):
        return True
    return bool(
        getattr(cand, "duration_mins", 60) <= 45
        and getattr(cand, "cost_eur", 0.0) == 0.0
    )


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    )
    return 2.0 * r * math.asin(math.sqrt(max(0.0, min(1.0, a))))


_CANONICAL_NAME_ROOTS: dict[str, str] = {
    "palace": "palacio",
    "royal": "real",
    "museum": "museo",
    "cathedral": "catedral",
    "church": "iglesia",
    "square": "plaza",
    "gate": "puerta",
    "garden": "jardin",
    "gardens": "jardin",
    "park": "parque",
    "castle": "castillo",
    "tower": "torre",
    "bridge": "puente",
    "temple": "templo",
    "market": "mercado",
    "basilica": "basilica",
    "monastery": "monasterio",
}
_CANONICAL_STOPWORDS: set[str] = {
    "of",
    "the",
    "in",
    "at",
    "and",
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "y",
    "en",
    "da",
    "di",
}


def _get_name_roots(name: str) -> set[str]:
    import re

    words = re.findall(r"[a-z0-9]+", name.lower())
    roots = set()
    for w in words:
        if w in _CANONICAL_STOPWORDS or len(w) <= 1:
            continue
        roots.add(_CANONICAL_NAME_ROOTS.get(w, w))
    return roots


def _is_spatial_duplicate(
    cand: CandidatePoi, selected: list[SelectedPoi], threshold_km: float = 0.25
) -> bool:
    c_loc = getattr(cand, "location", None) or {}
    c_lat = (
        c_loc.get("latitude")
        if isinstance(c_loc, dict)
        else getattr(c_loc, "latitude", None)
    )
    c_lon = (
        c_loc.get("longitude")
        if isinstance(c_loc, dict)
        else getattr(c_loc, "longitude", None)
    )
    if c_lat is None or c_lon is None:
        return False
    c_roots = _get_name_roots(getattr(cand, "name", ""))
    c_cat = getattr(cand, "taxonomy_category", None) or getattr(
        cand, "category_id", None
    )

    for s in selected:
        s_loc = getattr(s.poi, "location", None) or {}
        s_lat = (
            s_loc.get("latitude")
            if isinstance(s_loc, dict)
            else getattr(s_loc, "latitude", None)
        )
        s_lon = (
            s_loc.get("longitude")
            if isinstance(s_loc, dict)
            else getattr(s_loc, "longitude", None)
        )
        if s_lat is None or s_lon is None:
            continue
        dist = _haversine_km(float(c_lat), float(c_lon), float(s_lat), float(s_lon))
        if dist > threshold_km:
            continue
        # Immediate physical duplicate if virtually identical location (<= 50m)
        if dist <= 0.05:
            return True
        # Translation or naming duplicate within threshold
        s_roots = _get_name_roots(getattr(s.poi, "name", ""))
        if c_roots and s_roots and (c_roots & s_roots):
            return True
        # Same exact taxonomy category and very close (<= 100m)
        s_cat = getattr(s.poi, "taxonomy_category", None) or getattr(
            s.poi, "category_id", None
        )
        if dist <= 0.10 and c_cat is not None and s_cat is not None and c_cat == s_cat:
            return True
    return False


def normalize_poi_name(name: str) -> str:
    """Canonical name normalization removing diacritics, accents, and excessive spacing."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_clean = nfkd.encode("ASCII", "ignore").decode("utf-8")
    return " ".join(ascii_clean.strip().lower().split())


class SelectionReasonCode(str, Enum):
    SELECTED_USER_MANDATORY = "SELECTED_USER_MANDATORY"
    SELECTED_TIER_1_MUST_SEE = "SELECTED_TIER_1_MUST_SEE"
    SELECTED_HIGH_TASTE_MATCH = "SELECTED_HIGH_TASTE_MATCH"
    SELECTED_DIVERSE_ANCHOR = "SELECTED_DIVERSE_ANCHOR"
    DOWNGRADED_VISIT_MODE_TIME_BUDGET = "DOWNGRADED_VISIT_MODE_TIME_BUDGET"
    DROPPED_CATEGORY_SATURATION = "DROPPED_CATEGORY_SATURATION"
    DROPPED_REDUNDANT_CONTENT = "DROPPED_REDUNDANT_CONTENT"
    DROPPED_TIME_BUDGET_EXCEEDED = "DROPPED_TIME_BUDGET_EXCEEDED"
    DROPPED_LOW_TASTE_AND_TIER = "DROPPED_LOW_TASTE_AND_TIER"
    DROPPED_CLOSED_ON_TRIP_DATES = "DROPPED_CLOSED_ON_TRIP_DATES"


class SelectedPoi(BaseModel):
    poi: CandidatePoi
    reason_code: SelectionReasonCode
    visit_mode: str
    effective_duration_mins: int
    marginal_gain: float


class DroppedPoi(BaseModel):
    poi: CandidatePoi
    reason_code: SelectionReasonCode
    explanation: str


class SelectionResult(BaseModel):
    selected_pois: list[SelectedPoi]
    dropped_pois: list[DroppedPoi]
    total_time_mins: int
    total_estimated_cost_eur: float
    total_score: float


def _cosine_similarity(v1: list[float], v2: list[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    return dot / (norm1 * norm2) if (norm1 > 0 and norm2 > 0) else 0.0


def is_poi_open_any_trip_day(cand: CandidatePoi, trip_weekdays: list[int]) -> bool:
    """Checks whether the candidate is open on at least one day of the trip."""
    if not cand.open_time_mins_by_day or not trip_weekdays:
        return True
    return any(
        w < len(cand.open_time_mins_by_day) and cand.open_time_mins_by_day[w] != -1
        for w in trip_weekdays
    )


def _cand_traveler_affinity(
    uid: str,
    cand: CandidatePoi,
    traveler_affinities: dict[str, dict[str, float]],
    traveler_vectors: dict[str, list[float]],
) -> float:
    aff_map = traveler_affinities.get(uid) or {}
    tag_aff = float(aff_map.get(cand.taxonomy_category, 0.5))
    vec = traveler_vectors.get(uid)
    if vec and cand.embedding and len(vec) == len(cand.embedding):
        cos = (_cosine_similarity(vec, cand.embedding) + 1.0) / 2.0
        return 0.65 * tag_aff + 0.35 * cos
    return tag_aff


def select_trip_pois(
    candidate_pool: list[CandidatePoi],
    trip_frame: TripFrame,
) -> SelectionResult:
    """Performs deterministic submodular selection over the candidate pool."""
    selected: list[SelectedPoi] = []
    selected_ids: set[str] = set()
    selected_names: set[str] = set()
    current_time_mins = 0
    current_cost_eur = 0.0
    total_score = 0.0

    tp = getattr(trip_frame, "taste_profile", None) or {}
    traveler_affinities: dict[str, dict[str, float]] = (
        tp.get("traveler_affinities")
        if isinstance(tp, dict) and isinstance(tp.get("traveler_affinities"), dict)
        else {}
    )
    traveler_vectors: dict[str, list[float]] = (
        tp.get("traveler_vectors")
        if isinstance(tp, dict) and isinstance(tp.get("traveler_vectors"), dict)
        else {}
    )
    trav_scores: dict[str, list[float]] = {uid: [] for uid in traveler_affinities}

    max_anchor_slots = trip_frame.total_anchor_slots
    max_tier1_slots = trip_frame.max_tier1_slots
    max_active_time = sum(d.target_active_mins for d in trip_frame.days)
    trip_weekdays = [
        d.calendar_date.weekday() if d.calendar_date else d.day_index % 7
        for d in trip_frame.days
    ]

    # 1. Forced Set: User Mandatories
    for cand in candidate_pool:
        c_norm = normalize_poi_name(cand.name)
        if (
            cand.is_mandatory
            and cand.id not in selected_ids
            and c_norm not in selected_names
        ):
            dur = cand.duration_mins
            selected.append(
                SelectedPoi(
                    poi=cand,
                    reason_code=SelectionReasonCode.SELECTED_USER_MANDATORY,
                    visit_mode=cand.visit_mode,
                    effective_duration_mins=dur,
                    marginal_gain=100.0,
                )
            )
            selected_ids.add(cand.id)
            selected_names.add(c_norm)
            for uid in trav_scores:
                trav_scores[uid].append(
                    _cand_traveler_affinity(
                        uid, cand, traveler_affinities, traveler_vectors
                    )
                )
            current_time_mins += dur
            current_cost_eur += cand.cost_eur
            total_score += 100.0

    # 2. Forced Set: Tier 1 Iconic POIs (blended iconicity and user taste; filters out taste < 35.0)
    t1_candidates = sorted(
        [
            c
            for c in candidate_pool
            if c.tier == 1
            and c.id not in selected_ids
            and normalize_poi_name(c.name) not in selected_names
            and not c.is_meal_spot
            and is_poi_open_any_trip_day(c, trip_weekdays)
            and c.taste_score >= 35.0
        ],
        key=lambda x: 0.5 * (x.iconicity_score * 100.0) + 0.5 * x.taste_score,
        reverse=True,
    )
    pace = getattr(trip_frame, "pace", PacePreference.BALANCED)
    if pace == PacePreference.LEISURELY:
        quick_per_day = 2
    elif pace == PacePreference.INTENSE:
        quick_per_day = 4
    else:  # BALANCED
        quick_per_day = 3

    n_days = max(1, len(trip_frame.days))
    max_quick_t1 = max(2, n_days * quick_per_day)

    heavy_t1_count = sum(
        1 for s in selected if s.poi.tier == 1 and not is_quick_landmark(s.poi)
    )
    quick_t1_count = sum(
        1 for s in selected if s.poi.tier == 1 and is_quick_landmark(s.poi)
    )

    for cand in t1_candidates:
        if _is_spatial_duplicate(cand, selected):
            continue
        cand_is_quick = is_quick_landmark(cand)
        if cand_is_quick:
            if quick_t1_count >= max_quick_t1:
                continue
        else:
            if heavy_t1_count >= max_tier1_slots:
                continue

        dur = cand.duration_mins
        if current_time_mins + dur > max_active_time:
            continue

        gain = 80.0 + cand.iconicity_score * 20.0
        selected.append(
            SelectedPoi(
                poi=cand,
                reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
                visit_mode=cand.visit_mode,
                effective_duration_mins=dur,
                marginal_gain=gain,
            )
        )
        selected_ids.add(cand.id)
        selected_names.add(normalize_poi_name(cand.name))
        for uid in trav_scores:
            trav_scores[uid].append(
                _cand_traveler_affinity(
                    uid, cand, traveler_affinities, traveler_vectors
                )
            )
        current_time_mins += dur
        current_cost_eur += cand.cost_eur
        total_score += gain

        if cand_is_quick:
            quick_t1_count += 1
        else:
            heavy_t1_count += 1

    # 3. Submodular Greedy Selection Loop
    while (
        sum(1 for s in selected if not is_quick_landmark(s.poi)) < max_anchor_slots
        and current_time_mins < max_active_time
    ):
        best_cand: CandidatePoi | None = None
        best_gain = -1.0
        best_mode = "full"
        best_dur = 60

        u_min: str | None = None
        min_sat = 0.5
        g_mean = 0.5
        if len(trav_scores) > 1:
            avg_s = {
                uid: (sum(vals) / len(vals) if vals else 0.5)
                for uid, vals in trav_scores.items()
            }
            g_mean = sum(avg_s.values()) / len(avg_s)
            u_min = min(avg_s, key=avg_s.get)
            min_sat = avg_s[u_min]

        current_tier1_count = sum(
            1 for s in selected if s.poi.tier == 1 and not is_quick_landmark(s.poi)
        )
        prefers_offbeat = bool(getattr(trip_frame, "prefers_offbeat", False))

        for cand in candidate_pool:
            c_norm = normalize_poi_name(cand.name)
            if cand.id in selected_ids or c_norm in selected_names or cand.is_meal_spot:
                continue
            if not cand.is_mandatory and cand.taste_score <= 0.0:
                continue
            if not cand.is_mandatory and cand.tier == 1 and cand.taste_score < 35.0:
                continue
            if not cand.is_mandatory and not is_poi_open_any_trip_day(
                cand, trip_weekdays
            ):
                continue
            if not cand.is_mandatory and _is_spatial_duplicate(cand, selected):
                continue

            # A. Base taste & quality
            base_score = cand.taste_score

            # B. Tier bonus (moderate iconic Tier 1 dominance when user prefers offbeat/neighborhoods)
            if prefers_offbeat:
                tier_weights = {1: 15.0, 2: 40.0, 3: 25.0, 4: -15.0}
                tier_bonus = tier_weights.get(cand.tier, 0.0)
                if cand.tier == 1 and current_tier1_count >= max_tier1_slots:
                    tier_bonus -= 50.0
            else:
                tier_weights = {1: 40.0, 2: 25.0, 3: 5.0, 4: -15.0}
                tier_bonus = tier_weights.get(cand.tier, 0.0)

            # C. Category saturation penalty (scaled by trip duration; ignored for unknown category 255)
            cat_penalty = 0.0
            if cand.category_id != 255:
                n_days = max(1, len(trip_frame.days))
                same_cat_count = sum(
                    1 for s in selected if s.poi.category_id == cand.category_id
                )
                cat_allowance = max(1, n_days)
                excess = max(0, same_cat_count - cat_allowance)
                cat_penalty = excess * 15.0 + (same_cat_count / cat_allowance) * 4.0

            # D. Cosine redundancy penalty
            redundancy_penalty = 0.0
            if cand.embedding:
                for s in selected:
                    if s.poi.embedding:
                        sim = _cosine_similarity(cand.embedding, s.poi.embedding)
                        if sim > 0.85:
                            redundancy_penalty = max(
                                redundancy_penalty, (sim - 0.80) * 100.0
                            )

            # E. Time cost penalty
            dur = cand.duration_mins
            time_penalty = (dur / 60.0) * 5.0

            # F. Multi-traveler satisfaction floor & mild-dislike fairness balancing
            group_fairness_adj = 0.0
            if u_min is not None and len(trav_scores) > 1:
                cand_affs = [
                    _cand_traveler_affinity(
                        uid, cand, traveler_affinities, traveler_vectors
                    )
                    for uid in trav_scores
                ]
                u_min_aff = _cand_traveler_affinity(
                    u_min, cand, traveler_affinities, traveler_vectors
                )
                if min_sat < 0.50 or (g_mean - min_sat) > 0.10:
                    group_fairness_adj += 18.0 * u_min_aff
                min_cand_aff = min(cand_affs) if cand_affs else 0.5
                if min_cand_aff < 0.25:
                    group_fairness_adj -= (0.25 - min_cand_aff) * 20.0

            marginal = (
                base_score
                + tier_bonus
                + group_fairness_adj
                - cat_penalty
                - redundancy_penalty
                - time_penalty
            )

            # Check time feasibility and potential visit mode downgrade
            mode = cand.visit_mode
            eff_dur = dur
            if current_time_mins + dur > max_active_time:
                # Attempt downgrade to quick if duration > 45m
                if dur > 45 and current_time_mins + 30 <= max_active_time:
                    mode = "quick"
                    eff_dur = 30
                    marginal -= 10.0  # Slight penalty for quick mode
                else:
                    continue

            if marginal > best_gain:
                best_gain = marginal
                best_cand = cand
                best_mode = mode
                best_dur = eff_dur

        if not best_cand or best_gain <= 0:
            break

        reason = (
            SelectionReasonCode.DOWNGRADED_VISIT_MODE_TIME_BUDGET
            if best_mode != best_cand.visit_mode
            else (
                SelectionReasonCode.SELECTED_HIGH_TASTE_MATCH
                if best_cand.taste_score >= 70
                else SelectionReasonCode.SELECTED_DIVERSE_ANCHOR
            )
        )

        selected.append(
            SelectedPoi(
                poi=best_cand,
                reason_code=reason,
                visit_mode=best_mode,
                effective_duration_mins=best_dur,
                marginal_gain=round(best_gain, 2),
            )
        )
        selected_ids.add(best_cand.id)
        selected_names.add(normalize_poi_name(best_cand.name))
        for uid in trav_scores:
            trav_scores[uid].append(
                _cand_traveler_affinity(
                    uid, best_cand, traveler_affinities, traveler_vectors
                )
            )
        current_time_mins += best_dur
        current_cost_eur += best_cand.cost_eur
        total_score += best_gain

    # 4. Reason Assignment for All Dropped Candidates
    dropped: list[DroppedPoi] = []
    for cand in candidate_pool:
        if (
            cand.id in selected_ids
            or normalize_poi_name(cand.name) in selected_names
            or cand.is_meal_spot
        ):
            continue

        same_cat_count = (
            sum(1 for s in selected if s.poi.category_id == cand.category_id)
            if cand.category_id != 255
            else 0
        )
        if not cand.is_mandatory and not is_poi_open_any_trip_day(cand, trip_weekdays):
            code = SelectionReasonCode.DROPPED_CLOSED_ON_TRIP_DATES
            exp = f"POI is closed on all trip days (weekdays: {trip_weekdays})."
        elif cand.tier == 1 and cand.taste_score < 35:
            code = SelectionReasonCode.DROPPED_LOW_TASTE_AND_TIER
            exp = (
                f"Tier 1 attraction omitted due to low taste match ({cand.taste_score:.1f}) "
                f"for category '{cand.taxonomy_category}'."
            )
        elif cand.tier == 4 or cand.taste_score < 30:
            code = SelectionReasonCode.DROPPED_LOW_TASTE_AND_TIER
            exp = f"Low taste score ({cand.taste_score:.1f}) and low priority tier ({cand.tier})."
        elif same_cat_count >= 3:
            code = SelectionReasonCode.DROPPED_CATEGORY_SATURATION
            exp = f"Category '{cand.taxonomy_category}' already has {same_cat_count} selected POIs."
        elif current_time_mins >= max_active_time:
            code = SelectionReasonCode.DROPPED_TIME_BUDGET_EXCEEDED
            exp = f"Trip active time budget exhausted ({current_time_mins}m / {max_active_time}m)."
        else:
            code = SelectionReasonCode.DROPPED_REDUNDANT_CONTENT
            exp = "Candidate ranked lower in marginal submodular gain than selected anchors."

        dropped.append(DroppedPoi(poi=cand, reason_code=code, explanation=exp))

    return SelectionResult(
        selected_pois=selected,
        dropped_pois=dropped,
        total_time_mins=current_time_mins,
        total_estimated_cost_eur=round(current_cost_eur, 2),
        total_score=round(total_score, 2),
    )
