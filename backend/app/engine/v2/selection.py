"""Trip-Level Submodular Selection for Paladio Itinerary v2.

Selects the global set of POIs for the entire trip before day assignment:
1. Guaranteed forced set (User mandatories + Tier 1 iconic items up to ~55% anchor slots)
2. Deterministic submodular greedy selection balancing taste, tier, diversity, and time
3. Graceful visit mode downgrade before dropping
4. Typed reason codes for all selected and dropped candidates
"""

import math
from enum import Enum

from app.engine.v2.candidate_pool import CandidatePoi
from app.engine.v2.trip_frame import TripFrame
from pydantic import BaseModel


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


def select_trip_pois(
    candidate_pool: list[CandidatePoi],
    trip_frame: TripFrame,
) -> SelectionResult:
    """Performs deterministic submodular selection over the candidate pool."""
    selected: list[SelectedPoi] = []
    selected_ids: set[str] = set()
    current_time_mins = 0
    current_cost_eur = 0.0
    total_score = 0.0

    max_anchor_slots = trip_frame.total_anchor_slots
    max_tier1_slots = trip_frame.max_tier1_slots
    max_active_time = sum(d.target_active_mins for d in trip_frame.days)
    trip_weekdays = [
        d.calendar_date.weekday() if d.calendar_date else d.day_index % 7
        for d in trip_frame.days
    ]

    # 1. Forced Set: User Mandatories
    for cand in candidate_pool:
        if cand.is_mandatory and cand.id not in selected_ids:
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
            current_time_mins += dur
            current_cost_eur += cand.cost_eur
            total_score += 100.0

    # 2. Forced Set: Tier 1 Iconic POIs by iconicity score (up to max_tier1_slots)
    t1_candidates = sorted(
        [
            c
            for c in candidate_pool
            if c.tier == 1
            and c.id not in selected_ids
            and not c.is_meal_spot
            and is_poi_open_any_trip_day(c, trip_weekdays)
        ],
        key=lambda x: x.iconicity_score,
        reverse=True,
    )
    for cand in t1_candidates:
        if len([s for s in selected if s.poi.tier == 1]) >= max_tier1_slots:
            break
        dur = cand.duration_mins
        selected.append(
            SelectedPoi(
                poi=cand,
                reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
                visit_mode=cand.visit_mode,
                effective_duration_mins=dur,
                marginal_gain=80.0 + cand.iconicity_score * 20.0,
            )
        )
        selected_ids.add(cand.id)
        current_time_mins += dur
        current_cost_eur += cand.cost_eur
        total_score += 80.0 + cand.iconicity_score * 20.0

    # 3. Submodular Greedy Selection Loop
    while len(selected) < max_anchor_slots and current_time_mins < max_active_time:
        best_cand: CandidatePoi | None = None
        best_gain = -1.0
        best_mode = "full"
        best_dur = 60

        for cand in candidate_pool:
            if cand.id in selected_ids or cand.is_meal_spot:
                continue
            if not cand.is_mandatory and not is_poi_open_any_trip_day(
                cand, trip_weekdays
            ):
                continue

            # A. Base taste & quality
            base_score = cand.taste_score

            # B. Tier bonus
            tier_weights = {1: 40.0, 2: 25.0, 3: 5.0, 4: -15.0}
            tier_bonus = tier_weights.get(cand.tier, 0.0)

            # C. Category saturation penalty
            same_cat_count = sum(
                1 for s in selected if s.poi.category_id == cand.category_id
            )
            cat_penalty = same_cat_count * 18.0

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

            marginal = (
                base_score
                + tier_bonus
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
        current_time_mins += best_dur
        current_cost_eur += best_cand.cost_eur
        total_score += best_gain

    # 4. Reason Assignment for All Dropped Candidates
    dropped: list[DroppedPoi] = []
    for cand in candidate_pool:
        if cand.id in selected_ids or cand.is_meal_spot:
            continue

        same_cat_count = sum(
            1 for s in selected if s.poi.category_id == cand.category_id
        )
        if not cand.is_mandatory and not is_poi_open_any_trip_day(cand, trip_weekdays):
            code = SelectionReasonCode.DROPPED_CLOSED_ON_TRIP_DATES
            exp = f"POI is closed on all trip days (weekdays: {trip_weekdays})."
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
