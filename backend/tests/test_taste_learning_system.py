"""Comprehensive verification suite for the multi-signal, multi-traveler backend taste learning system."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest

from app.application.taste.taste_service import TasteService
from app.domain.entities.poi import Poi, PoiLocation
from app.domain.entities.taste import (
    BetaPosterior,
    InferredReason,
    PoiPrior,
    TasteEvent,
    TasteSignalType,
    UserTasteProfile,
)
from app.engine.candidate_pool import CandidatePoi, compute_taste_score
from app.engine.market.lodging.ranking import HotelCandidate, rank_hotels
from app.engine.market.taste_ranking import score_flight_and_deal_taste
from app.engine.nlp.intent_extractor import PromptIntentExtractor
from app.engine.scoring.features import TAG_KEYS
from app.engine.scoring.learned_ranker import TasteRankerModel
from app.engine.scoring.semantic_learning import SemanticLearningEngine
from app.engine.scoring.taste_engine import (
    ImplicitSignalExtractor,
    TasteProfileUpdater,
    TripTasteAggregator,
)
from app.engine.selection import select_trip_pois
from app.engine.trip_frame import DayFrame, TripFrame
from app.schemas.itinerary import NodeConstraint, TravelConstraints


def _unit_vec(index: int, dim: int = 768) -> list[float]:
    v = np.zeros(dim, dtype=np.float32)
    v[index % dim] = 1.0
    return v.tolist()


def _make_poi(
    pid: str,
    name: str,
    cat: str,
    tax_cat: str,
    tier: int = 2,
    cost: float = 15.0,
    iconicity: float = 0.7,
    emb: list[float] | None = None,
) -> Poi:
    return Poi(
        id=pid,
        name=name,
        city="Paris",
        category=cat,
        taxonomy_category=tax_cat,
        category_id=0,
        location=PoiLocation(latitude=48.8566, longitude=2.3522),
        duration_mins=60,
        cost_eur=cost,
        iconicity_score=iconicity,
        tier=tier,
        embedding=emb,
    )


def test_implicit_extractor_revision_context_disambiguation():
    before_doc = {
        "start_date": "2026-07-10",
        "days": [
            {
                "day_number": 1,
                "stops": [
                    {
                        "stop_id": "s1",
                        "scheduled_start": "10:00",
                        "poi": {
                            "id": "poi_louvre",
                            "name": "Louvre Museum",
                            "category": "museum",
                            "taxonomy_category": "art_culture",
                            "location": {"latitude": 48.8606, "longitude": 2.3376},
                        },
                    },
                    {
                        "stop_id": "s2",
                        "scheduled_start": "14:00",
                        "poi": {
                            "id": "poi_far_park",
                            "name": "Distant Park",
                            "category": "park",
                            "taxonomy_category": "nature_outdoors",
                            "location": {"latitude": 48.9800, "longitude": 2.5200},
                        },
                    },
                    {
                        "stop_id": "s3",
                        "scheduled_start": "16:30",
                        "poi": {
                            "id": "poi_mall",
                            "name": "Big Mall",
                            "category": "shopping_mall",
                            "taxonomy_category": "shopping",
                            "location": {"latitude": 48.8620, "longitude": 2.3400},
                        },
                    },
                ],
            }
        ],
    }
    # Swap Louvre (art_culture) for Orsay (art_culture), remove distant park (outlier),
    # add food stop (bistro)
    after_doc = {
        "start_date": "2026-07-10",
        "days": [
            {
                "day_number": 1,
                "stops": [
                    {
                        "stop_id": "s_orsay",
                        "scheduled_start": "10:00",
                        "poi": {
                            "id": "poi_orsay",
                            "name": "Musee d'Orsay",
                            "category": "museum",
                            "taxonomy_category": "art_culture",
                            "location": {"latitude": 48.8600, "longitude": 2.3266},
                        },
                    },
                    {
                        "stop_id": "s_bistro",
                        "scheduled_start": "12:30",
                        "poi": {
                            "id": "poi_bistro",
                            "name": "Le Bistro",
                            "category": "restaurant",
                            "taxonomy_category": "food_culinary",
                            "location": {"latitude": 48.8590, "longitude": 2.3300},
                        },
                    },
                ],
            }
        ],
    }
    changes = [
        {
            "kind": "lock_stop",
            "day": 1,
            "stop_id": "s_bistro",
            "after": {"locked": True},
        },
        {"kind": "set_pace", "day": 1, "after": {"pace": "relaxed"}},
    ]

    events = ImplicitSignalExtractor.extract_from_revision(
        user_id="u1",
        trip_id="t1",
        before_doc=before_doc,
        after_doc=after_doc,
        changes=changes,
    )

    by_entity = {(e.event_type, e.entity_id): e for e in events}

    # Same-category swap does NOT penalize category
    louvre_rm = by_entity[(TasteSignalType.STOP_REMOVED, "poi_louvre")]
    assert louvre_rm.inferred_reason == InferredReason.SAME_CATEGORY_SWAP
    assert louvre_rm.context["affect_category"] is False

    # Distant park removal inferred as DISTANCE_OUTLIER
    park_rm = by_entity[(TasteSignalType.STOP_REMOVED, "poi_far_park")]
    assert park_rm.inferred_reason == InferredReason.DISTANCE_OUTLIER

    # Close mall removal inferred as TASTE_DISLIKE
    mall_rm = by_entity[(TasteSignalType.STOP_REMOVED, "poi_mall")]
    assert mall_rm.inferred_reason == InferredReason.TASTE_DISLIKE
    assert mall_rm.polarity < 0

    assert (TasteSignalType.STOP_ADDED, "poi_orsay") in by_entity
    assert (TasteSignalType.STOP_LOCKED, "poi_bistro") in by_entity
    assert (TasteSignalType.PACE_CHANGED, "relaxed") in by_entity


def test_implicit_extractor_collections_tickets_deals_chat_kept():
    c_saved = ImplicitSignalExtractor.extract_from_collection(
        "u1", "p1", {"name": "Cafe Kitsune", "category": "cafe"}, "saved"
    )
    assert c_saved.event_type == TasteSignalType.COLLECTION_SAVED
    assert c_saved.polarity > 0

    c_visited = ImplicitSignalExtractor.extract_from_collection(
        "u1", "p1", {"name": "Cafe Kitsune", "category": "cafe"}, "visited"
    )
    assert c_visited.event_type == TasteSignalType.VISIT_COMPLETED

    c_skipped = ImplicitSignalExtractor.extract_from_collection(
        "u1", "p2", {"name": "Club", "category": "nightclub"}, "skipped"
    )
    assert c_skipped.event_type == TasteSignalType.VISIT_SKIPPED
    assert c_skipped.polarity < 0

    t_flight = ImplicitSignalExtractor.extract_from_ticket(
        "u1",
        "t1",
        {
            "id": "tk1",
            "ticket_type": "flight",
            "title": "CDG Flight",
            "provider": "AirFrance",
            "price": 240.0,
            "start_time": "2026-08-01T10:30:00",
            "ticket_metadata": {"stops": 0},
        },
    )
    assert len(t_flight) == 1
    assert t_flight[0].context["airline"] == "AirFrance"
    assert t_flight[0].context["departure_hour"] == 10

    t_hotel = ImplicitSignalExtractor.extract_from_ticket(
        "u1",
        "t1",
        {
            "id": "tk2",
            "ticket_type": "hotel",
            "title": "Boutique Marais",
            "price": 180.0,
            "ticket_metadata": {
                "property_id": "prop_1",
                "property_type": "boutique",
                "stars": 4,
                "amenities": ["wifi", "breakfast"],
                "free_cancellation": True,
            },
        },
    )
    assert t_hotel[0].context["property_type"] == "boutique"

    deal_ev = ImplicitSignalExtractor.extract_from_deal(
        "u1",
        {"id": "d1", "total_price_cents": 45000, "package_json": {"savings_pct": 25.0}},
        "accepted",
    )
    assert deal_ev.event_type == TasteSignalType.DEAL_ACCEPTED

    chat_ev = ImplicitSignalExtractor.extract_from_chat(
        "u1", "t1", "nightlife", "category", polarity=-1.0, hard_veto=True
    )
    assert chat_ev.event_type == TasteSignalType.CHAT_PREFERENCE
    assert chat_ev.context["hard_veto"] is True

    kept = ImplicitSignalExtractor.extract_kept_stops(
        "u1",
        "t1",
        {
            "days": [
                {
                    "stops": [
                        {
                            "poi": {
                                "id": "p_keep",
                                "name": "Sainte-Chapelle",
                                "category": "museum",
                            }
                        },
                        {
                            "poi": {
                                "id": "p_transit",
                                "name": "Gare du Nord",
                                "category": "transit",
                            }
                        },
                    ]
                }
            ]
        },
    )
    assert [k.entity_id for k in kept] == ["p_keep"]


def test_updater_signed_updates_contextual_decay_and_vetoes():
    engine = SemanticLearningEngine({t: _unit_vec(i) for i, t in enumerate(TAG_KEYS)})
    profile = UserTasteProfile(
        user_id="u1",
        embedding=SemanticLearningEngine.get_neutral_768d_prior(),
    )

    events = [
        TasteEvent(
            user_id="u1",
            entity_type="poi",
            entity_id="museum_1",
            event_type=TasteSignalType.STOP_LOCKED,
            polarity=1.0,
            weight=1.5,
            context={
                "category": "art_culture",
                "embedding": _unit_vec(0),
                "season": "season:summer",
                "time_bucket": "time_of_day:morning",
            },
        ),
        TasteEvent(
            user_id="u1",
            entity_type="category",
            entity_id="nightlife",
            event_type=TasteSignalType.CHAT_PREFERENCE,
            polarity=-1.0,
            weight=2.5,
            context={
                "category": "nightlife",
                "hard_veto": True,
                "affect_category": True,
            },
        ),
        TasteEvent(
            user_id="u1",
            entity_type="poi",
            entity_id="already_seen",
            event_type=TasteSignalType.VISIT_COMPLETED,
            polarity=0.9,
            weight=1.35,
            context={"category": "scenic_views"},
        ),
    ]

    updated = TasteProfileUpdater.apply_events(profile, events, semantic_engine=engine)
    assert updated.is_neutral is False
    assert updated.version == 2
    assert updated.category_posteriors["art_culture"].mean > 0.55
    assert "nightlife" in updated.disliked_tags
    assert "season:summer" in updated.contextual_profiles
    assert updated.poi_priors["already_seen"].visited_count == 1
    assert updated.poi_priors["already_seen"].last_visited_at is not None

    past_profile = UserTasteProfile(
        user_id="u1",
        is_neutral=False,
        embedding=_unit_vec(0),
        last_event_at=(datetime.now(timezone.utc) - timedelta(days=360)).isoformat(),
        category_posteriors={"art_culture": BetaPosterior(alpha=20.0, beta=2.0)},
    )
    decayed = TasteProfileUpdater.apply_events(
        past_profile,
        [
            TasteEvent(
                user_id="u1",
                entity_type="category",
                entity_id="food_culinary",
                event_type=TasteSignalType.COLLECTION_SAVED,
                polarity=0.8,
                weight=1.0,
                context={"category": "food_culinary"},
            )
        ],
    )
    assert decayed.category_posteriors["art_culture"].alpha < 10.0


def test_multi_traveler_merge_veto_mild_dislike_unlinked_and_bounds():
    alice = UserTasteProfile(
        user_id="alice",
        is_neutral=False,
        event_count=10,
        embedding=_unit_vec(0),
        category_posteriors={
            "art_culture": BetaPosterior(alpha=16.0, beta=2.0),
            "nightlife": BetaPosterior(alpha=14.0, beta=2.0),
            "nature_outdoors": BetaPosterior(alpha=10.0, beta=2.0),
        },
        poi_priors={"poi_bad": PoiPrior(score_delta=-10.0)},
    )
    alice.behavioral_params.pace = "packed"
    alice.behavioral_params.preferred_stops_per_day = 7
    alice.behavioral_params.walking_tolerance_km = 15.0
    alice.economic_profile.budget_tier = "luxury"

    bob = UserTasteProfile(
        user_id="bob",
        is_neutral=False,
        event_count=8,
        embedding=_unit_vec(1),
        disliked_tags=["nightlife"],  # Hard dislike from co-traveler
        category_posteriors={
            "art_culture": BetaPosterior(alpha=2.5, beta=5.0),  # Mild dislike (~0.33)
            "nature_outdoors": BetaPosterior(alpha=12.0, beta=2.0),
        },
        poi_priors={"poi_bad": PoiPrior(hard_veto=True, score_delta=-40.0)},
    )
    bob.behavioral_params.pace = "relaxed"
    bob.behavioral_params.preferred_stops_per_day = 4
    bob.behavioral_params.walking_tolerance_km = 6.0
    bob.economic_profile.budget_tier = "budget"

    # 3 total travelers (Alice + Bob + 1 unlinked guest without user_id)
    merged = TripTasteAggregator.merge_profiles(
        profiles=[alice, bob],
        organizer_user_id="alice",
        total_participant_count=3,
    )

    assert merged.traveler_count == 3
    assert merged.active_profile_count == 2
    assert "nightlife" in merged.vetoed_categories
    assert merged.poi_priors["poi_bad"].hard_veto is True
    assert "art_culture" not in merged.vetoed_categories
    assert (
        merged.tag_affinities["art_culture"]
        < alice.category_posteriors["art_culture"].mean
    )
    assert merged.tag_affinities["nature_outdoors"] > 0.78
    assert any(k.startswith("anon_") for k in merged.traveler_affinities)
    assert merged.behavioral_params.pace == "leisurely"
    assert merged.behavioral_params.preferred_stops_per_day == 4
    assert merged.behavioral_params.walking_tolerance_km == 6.0
    assert merged.economic_profile.budget_tier == "budget"

    market_prefs = merged.to_market_preferences()
    assert market_prefs["budget_tier"] == "budget"
    assert "nightlife" in market_prefs["disliked_tags"]


@pytest.mark.asyncio
async def test_prompt_override_and_candidate_scoring_veto_repeat_exploration():
    merged_dict = {
        "version": 4,
        "traveler_count": 2,
        "active_profile_count": 2,
        "embedding": _unit_vec(0),
        "tag_affinities": {t: 0.5 for t in TAG_KEYS},
        "tag_uncertainties": {t: 0.20 for t in TAG_KEYS},
        "vetoed_categories": ["shopping"],
        "preferred_cuisines": ["japanese"],
        "poi_priors": {
            "poi_seen_recently": {
                "score_delta": 0.0,
                "visited_count": 1,
                "last_visited_at": datetime.now(timezone.utc).isoformat(),
                "hard_veto": False,
            },
            "poi_vetoed": {"hard_veto": True, "score_delta": -30.0},
        },
        "contextual_profiles": {"season:summer": {"nature_outdoors": 0.90}},
        "economic_profile": {"price_sensitivity": 0.8},
    }
    merged_dict["tag_affinities"]["art_culture"] = 0.88
    merged_dict["tag_affinities"]["shopping"] = 0.05

    generic_analysis = await PromptIntentExtractor.extract(
        prompt="3 days in Paris for two people",
        destination_city="Paris",
        state={"taste_profile": merged_dict},
    )
    assert generic_analysis.tag_affinities["art_culture"] > 0.60
    assert generic_analysis.tag_affinities["shopping"] <= 0.15

    override_analysis = await PromptIntentExtractor.extract(
        prompt="No museums or art galleries please, focus on parks and gardens",
        destination_city="Paris",
        state={"taste_profile": merged_dict},
    )
    assert override_analysis.tag_affinities["art_culture"] <= 0.25
    assert override_analysis.tag_affinities["nature_outdoors"] >= 0.70

    constraints = TravelConstraints(
        destination_city="Paris",
        start_date="2026-07-10",
        end_date="2026-07-12",
        budget_tier="balanced",
        pace="balanced",
        tag_affinities=generic_analysis.tag_affinities,
        taste_profile=merged_dict,
        nodes=[NodeConstraint(poi_id="poi_forced", mandatory=True)],
    )

    vetoed_cat_poi = _make_poi("p_shop", "Galeries Mall", "shopping_mall", "shopping")
    assert compute_taste_score(vetoed_cat_poi, constraints) == 0.0

    vetoed_id_poi = _make_poi(
        "poi_vetoed", "Specific Disliked Place", "museum", "art_culture"
    )
    assert compute_taste_score(vetoed_id_poi, constraints) == 0.0

    mandatory_override = _make_poi(
        "poi_forced", "Forced Stop", "shopping_mall", "shopping"
    )
    assert compute_taste_score(mandatory_override, constraints) > 0.0

    fresh_museum = _make_poi(
        "p_fresh", "Fresh Museum", "museum", "art_culture", emb=_unit_vec(0)
    )
    seen_museum = _make_poi(
        "poi_seen_recently", "Visited Museum", "museum", "art_culture", emb=_unit_vec(0)
    )
    assert compute_taste_score(fresh_museum, constraints) > compute_taste_score(
        seen_museum, constraints
    )

    s1 = compute_taste_score(fresh_museum, constraints)
    s2 = compute_taste_score(fresh_museum, constraints)
    assert s1 == s2


def test_selection_respects_hard_veto_and_multi_traveler_satisfaction_floor():
    trip_frame = TripFrame(
        city="Paris",
        days=[
            DayFrame(
                day_index=0,
                start_time_mins=540,
                end_time_mins=1200,
                target_active_mins=240,
                max_anchors=3,
            )
        ],
        max_tier1_slots=2,
        total_anchor_slots=3,
        taste_profile={
            "version": 2,
            "traveler_affinities": {
                "alice": {
                    "art_culture": 0.95,
                    "nature_outdoors": 0.45,
                    "scenic_views": 0.55,
                },
                "bob": {
                    "art_culture": 0.25,
                    "nature_outdoors": 0.95,
                    "scenic_views": 0.85,
                },
            },
            "traveler_vectors": {},
        },
    )

    cands = [
        CandidatePoi(
            id="vetoed_tier2",
            name="Vetoed Club",
            city="Paris",
            tier=2,
            taxonomy_category="nightlife",
            taste_score=0.0,
            iconicity_score=0.9,
            duration_mins=60,
        ),
        CandidatePoi(
            id="a1",
            name="Art Gallery 1",
            city="Paris",
            tier=2,
            taxonomy_category="art_culture",
            taste_score=74.0,
            iconicity_score=0.7,
            duration_mins=60,
        ),
        CandidatePoi(
            id="a2",
            name="Art Gallery 2",
            city="Paris",
            tier=2,
            taxonomy_category="art_culture",
            taste_score=73.0,
            iconicity_score=0.7,
            duration_mins=60,
        ),
        CandidatePoi(
            id="n1",
            name="Jardin du Luxembourg",
            city="Paris",
            tier=2,
            taxonomy_category="nature_outdoors",
            taste_score=70.0,
            iconicity_score=0.8,
            duration_mins=60,
        ),
        CandidatePoi(
            id="l1",
            name="Arc de Triomphe",
            city="Paris",
            tier=2,
            taxonomy_category="scenic_views",
            taste_score=71.0,
            iconicity_score=0.8,
            duration_mins=60,
        ),
    ]

    result = select_trip_pois(cands, trip_frame)
    selected_ids = {p.poi.id for p in result.selected_pois}
    assert "vetoed_tier2" not in selected_ids
    assert ("n1" in selected_ids) or ("l1" in selected_ids)


def test_lodging_flight_deal_personalization_and_learned_ranker():
    prefs = {
        "budget_tier": "balanced",
        "pace": "balanced",
        "tag_affinities": {t: 0.5 for t in TAG_KEYS},
        "economic_profile": {
            "price_sensitivity": 0.75,
            "deal_responsiveness": {"target_discount_pct": 18.0},
            "flight_preferences": {
                "airline_affinities": {"airfrance": 0.92, "ryanair": 0.15},
                "preferred_departure_window": [8, 12],
            },
            "lodging_preferences": {
                "preferred_types": {"boutique": 0.90, "apartment": 0.30},
                "preferred_stars": 4.0,
                "amenity_affinities": {"breakfast": 0.90, "spa": 0.85},
                "free_cancellation_bias": 0.85,
                "discarded_property_ids": ["h_discarded"],
            },
        },
    }

    hotels = [
        HotelCandidate(
            property_id="h_discarded",
            name="Discarded Hotel",
            nightly_cents=9000,
            review_score=9.2,
            review_count=400,
            stars=4,
            property_type="boutique",
        ),
        HotelCandidate(
            property_id="h_generic",
            name="Standard Flat",
            nightly_cents=12000,
            review_score=8.0,
            review_count=120,
            stars=3,
            property_type="apartment",
            free_cancellation=False,
        ),
        HotelCandidate(
            property_id="h_expensive_other",
            name="Distant Villa",
            nightly_cents=28000,
            review_score=7.5,
            review_count=60,
            stars=3,
            property_type="apartment",
            free_cancellation=False,
        ),
        HotelCandidate(
            property_id="h_match",
            name="Boutique Gem",
            nightly_cents=12000,
            review_score=8.6,
            review_count=180,
            stars=4,
            property_type="boutique",
            amenities=["breakfast", "spa"],
            free_cancellation=True,
        ),
    ]
    ranked = rank_hotels(hotels, user_preferences=prefs)
    ranked_ids = [r.candidate.property_id for r in ranked]
    assert "h_discarded" not in ranked_ids
    assert ranked_ids[0] == "h_match"
    by_id = {r.candidate.property_id: r for r in ranked}
    assert by_id["h_match"].subscores["taste"] > by_id["h_generic"].subscores["taste"]

    good_deal = {
        "discount_pct": 25.0,
        "flight": {"airline": "AirFrance", "depart_time": "2026-08-01T09:30:00"},
        "lodging": {"value_score": 82.0},
    }
    poor_deal = {
        "discount_pct": 5.0,
        "flight": {"airline": "Ryanair", "depart_time": "2026-08-01T23:45:00"},
        "lodging": {"value_score": 45.0},
    }
    assert score_flight_and_deal_taste(good_deal, prefs) > score_flight_and_deal_taste(
        poor_deal, prefs
    )

    prof = UserTasteProfile(user_id="u1", embedding=_unit_vec(0))
    events = [
        TasteEvent(
            user_id="u1",
            trip_id="t1",
            entity_type="poi",
            entity_id=f"good_{i}",
            event_type=TasteSignalType.STOP_LOCKED,
            polarity=0.95,
            weight=1.4,
            context={
                "category": "art_culture",
                "embedding": _unit_vec(0),
                "cost_eur": 10.0,
                "tier": 1,
                "iconicity": 0.9,
            },
        )
        for i in range(4)
    ] + [
        TasteEvent(
            user_id="u1",
            trip_id="t1",
            entity_type="poi",
            entity_id=f"bad_{i}",
            event_type=TasteSignalType.STOP_REMOVED,
            polarity=-0.9,
            weight=1.2,
            inferred_reason=InferredReason.TASTE_DISLIKE,
            context={
                "category": "shopping",
                "embedding": _unit_vec(5),
                "cost_eur": 80.0,
                "tier": 4,
                "iconicity": 0.2,
            },
        )
        for i in range(4)
    ]
    weights = TasteRankerModel.fit(events, prof)
    assert weights["n_samples"] == 8
    good_f = TasteRankerModel.build_feature_vector(
        sim_768d=0.95, cat_affinity=0.90, iconicity=0.9, tier=1, cost_eur=10.0
    )
    bad_f = TasteRankerModel.build_feature_vector(
        sim_768d=0.20, cat_affinity=0.10, iconicity=0.2, tier=4, cost_eur=80.0
    )
    p_good = float(TasteRankerModel.predict_score(good_f, weights)[0])
    p_bad = float(TasteRankerModel.predict_score(bad_f, weights)[0])
    assert not math.isnan(p_good) and not math.isnan(p_bad)
    assert p_good > p_bad


@pytest.mark.asyncio
async def test_taste_service_disable_flag_and_forget(monkeypatch):
    monkeypatch.setenv("PALADIO_TASTE_PERSONALIZATION_ENABLED", "false")
    assert TasteService.is_personalization_enabled() is False

    mock_session = AsyncMock()
    neutral_merged = await TasteService.get_merged_trip_profile(
        mock_session,
        organizer_user_id="u1",
        participant_specs=[{"user_id": "u1"}, {"name": "Guest"}],
    )
    assert neutral_merged.active_profile_count == 0
    assert neutral_merged.traveler_count >= 2
    assert neutral_merged.vetoed_categories == []

    monkeypatch.delenv("PALADIO_TASTE_PERSONALIZATION_ENABLED", raising=False)
    assert TasteService.is_personalization_enabled() is True

    stored = UserTasteProfile(
        user_id="u1",
        version=3,
        is_neutral=False,
        disliked_tags=["shopping"],
        category_posteriors={"shopping": BetaPosterior(alpha=2.0, beta=12.0)},
        poi_priors={"shopping_center": PoiPrior(hard_veto=True, score_delta=-40.0)},
    )
    repo_mock = MagicMock()
    repo_mock.get_profile = AsyncMock(return_value=stored)
    repo_mock.save_profile = AsyncMock(side_effect=lambda p: p)

    monkeypatch.setattr(
        "app.application.taste.taste_service.SqlTasteRepository",
        lambda session: repo_mock,
    )
    updated = await TasteService.forget_user_preference(mock_session, "u1", "shopping")
    assert "shopping" not in updated.disliked_tags
    assert "shopping_center" not in updated.poi_priors
    assert math.isclose(updated.category_posteriors["shopping"].mean, 0.5, rel_tol=1e-4)
    assert updated.version == 4


def test_mcp_tools_celery_schedule_and_router_wiring():
    from app.agent.toolsets import CORE_TOOLS
    from app.api import collections, market, users
    from app.application.trip_editing import trip_service
    from app.celery_app import app as celery_app
    from app.mcp import server as mcp_server
    from app.mcp.tools import (
        describe_taste_profile,
        forget_taste_preference,
        record_taste_preference,
    )
    from app.tasks import retrain_taste_profiles_task
    from app.wallet import service as wallet_service

    assert {
        "record_taste_preference",
        "forget_taste_preference",
        "describe_taste_profile",
    }.issubset(CORE_TOOLS)
    assert callable(record_taste_preference)
    assert callable(forget_taste_preference)
    assert callable(describe_taste_profile)

    registered_names = {t.name for t in mcp_server.mcp._tool_manager.list_tools()}
    assert {
        "record_taste_preference",
        "forget_taste_preference",
        "describe_taste_profile",
    }.issubset(registered_names)

    assert "retrain-taste-profiles" in celery_app.conf.beat_schedule
    assert callable(retrain_taste_profiles_task)

    user_paths = {getattr(r, "path", "") for r in users.router.routes}
    assert "/me/taste" in user_paths
    assert "/me/taste/reset" in user_paths

    # Ensure hooked routers & services imported TasteService cleanly
    assert trip_service.TasteService is TasteService
    assert wallet_service.TasteService is TasteService
    assert collections.TasteService is TasteService
    assert market.TasteService is TasteService


@pytest.mark.asyncio
async def test_taste_service_retrain_active_profiles_ingests_kept_stops_and_refits_ranker(
    monkeypatch,
):
    from app.application.taste import taste_service as taste_service_mod

    past_trip = MagicMock()
    past_trip.id = "trip-past-1"
    past_trip.user_id = "u1"
    past_trip.status = "active"
    past_trip.end_date = "2024-01-10"
    past_trip.itinerary_data = {
        "days": [
            {
                "itinerary": {
                    "path": [
                        {
                            "id": "poi-kept-1",
                            "name": "Musée d'Orsay",
                            "category": "art_culture",
                            "embedding": _unit_vec(0),
                        }
                    ]
                }
            }
        ]
    }

    already_res = MagicMock()
    already_res.all.return_value = []
    trips_res = MagicMock()
    trips_res.scalars.return_value.all.return_value = [past_trip]
    prof_res = MagicMock()
    prof_res.all.return_value = [("u1",)]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[already_res, trips_res, prof_res])
    mock_session.commit = AsyncMock()

    profile = UserTasteProfile(
        user_id="u1", version=2, event_count=8, embedding=_unit_vec(0)
    )
    events = [
        TasteEvent(
            user_id="u1",
            trip_id="t1",
            entity_type="poi",
            entity_id=f"good_{i}",
            event_type=TasteSignalType.STOP_LOCKED,
            polarity=0.95,
            weight=1.4,
            context={
                "category": "art_culture",
                "embedding": _unit_vec(0),
                "cost_eur": 10.0,
                "tier": 1,
                "iconicity": 0.9,
            },
        )
        for i in range(4)
    ] + [
        TasteEvent(
            user_id="u1",
            trip_id="t1",
            entity_type="poi",
            entity_id=f"bad_{i}",
            event_type=TasteSignalType.STOP_REMOVED,
            polarity=-0.9,
            weight=1.2,
            inferred_reason=InferredReason.TASTE_DISLIKE,
            context={
                "category": "shopping",
                "embedding": _unit_vec(5),
                "cost_eur": 80.0,
                "tier": 4,
                "iconicity": 0.2,
            },
        )
        for i in range(4)
    ]

    fake_repo = MagicMock()
    fake_repo.get_profile = AsyncMock(return_value=profile)
    fake_repo.list_events = AsyncMock(return_value=events)
    fake_repo.save_profile = AsyncMock()

    record_mock = AsyncMock(return_value=profile)
    monkeypatch.setattr(TasteService, "record_events", record_mock)
    monkeypatch.setattr(
        taste_service_mod, "SqlTasteRepository", MagicMock(return_value=fake_repo)
    )

    summary = await TasteService.retrain_active_profiles(mock_session, max_users=50)
    assert summary == {
        "kept_trips_processed": 1,
        "kept_events_recorded": 1,
        "refitted_users": 1,
    }
    record_mock.assert_awaited_once()
    fake_repo.save_profile.assert_awaited_once()
    assert profile.version == 3
    assert profile.ranker_weights["n_samples"] == 8
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_users_me_taste_endpoints_roundtrip_with_mocked_service(monkeypatch):
    from app.api import users

    fake_user = MagicMock(id="u-api-1")
    fake_session = MagicMock()

    monkeypatch.setattr(
        TasteService,
        "export_user_taste_data",
        AsyncMock(
            return_value={
                "profile": {"user_id": "u-api-1", "version": 5},
                "recent_events": [],
            }
        ),
    )
    monkeypatch.setattr(
        TasteService,
        "reset_user_taste_profile",
        AsyncMock(
            return_value=UserTasteProfile(user_id="u-api-1", version=6, is_neutral=True)
        ),
    )
    delete_mock = AsyncMock()
    monkeypatch.setattr(TasteService, "delete_user_taste_data", delete_mock)

    exported = await users.export_my_taste_profile(
        current_user=fake_user, session=fake_session
    )
    assert exported["profile"]["user_id"] == "u-api-1"
    assert exported["profile"]["version"] == 5

    reset_resp = await users.reset_my_taste_profile(
        current_user=fake_user, session=fake_session
    )
    assert reset_resp == {
        "status": "reset",
        "user_id": "u-api-1",
        "version": 6,
        "is_neutral": True,
    }

    del_resp = await users.delete_my_taste_data(
        current_user=fake_user, session=fake_session
    )
    assert del_resp == {"status": "deleted", "user_id": "u-api-1"}
    delete_mock.assert_awaited_once_with(fake_session, "u-api-1")


@pytest.mark.asyncio
async def test_prompt_analyzer_node_attaches_taste_profile_and_participants(
    monkeypatch,
):
    from contextlib import asynccontextmanager

    import app.db.session as db_session_mod
    from app.domain.entities.taste import MergedTripTasteProfile
    from app.swarm.agents.prompt_analyzer import prompt_analyzer_node

    @asynccontextmanager
    async def _fake_async_session():
        yield MagicMock()

    monkeypatch.setattr(db_session_mod, "async_session", _fake_async_session)

    merged_prof = MergedTripTasteProfile(
        version=4,
        traveler_count=2,
        active_profile_count=2,
        embedding=_unit_vec(0),
        tag_affinities={"art_culture": 0.90, "shopping": 0.05},
        vetoed_categories=["shopping"],
        preferred_cuisines=["french"],
    )
    monkeypatch.setattr(
        TasteService,
        "get_merged_trip_profile",
        AsyncMock(return_value=merged_prof),
    )
    on_prompt_mock = AsyncMock(return_value=UserTasteProfile(user_id="u1", version=5))
    monkeypatch.setattr(TasteService, "on_prompt_analyzed", on_prompt_mock)

    state = {
        "messages": [MagicMock(content="I want museums and good food in Paris")],
        "validated_itinerary": {"destination_city": "Paris", "trip_id": "trip-9"},
        "user_id": "u1",
        "participants": [{"user_id": "u1"}, {"user_id": "u2"}],
        "city_pois": [],
    }
    result = await prompt_analyzer_node(state)

    assert result["taste_profile"]["active_profile_count"] == 2
    assert result["taste_profile"]["traveler_count"] == 2
    assert result["validated_itinerary"]["taste_profile"]["version"] == 4
    assert result["validated_itinerary"]["participants"] == [
        {"user_id": "u1"},
        {"user_id": "u2"},
    ]
    assert result["validated_itinerary"]["tag_affinities"]["shopping"] == 0.05
    on_prompt_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_audit_fixes_group_intersections_collection_and_market_feedback(
    monkeypatch,
):
    from app.agent.prompts import SYSTEM_PROMPT
    from app.api import market
    from app.domain.entities.taste import EconomicProfile
    from app.mcp.tools.trip import forget_taste_preference
    from app.schemas.collection import UpdateCollectionItemRequest

    # 1. Collection schema allows skipped, and want_to_go toggle emits no false save
    req = UpdateCollectionItemRequest(visit_status="skipped")
    assert req.visit_status == "skipped"
    assert (
        ImplicitSignalExtractor.extract_from_collection("u1", "p1", None, "want_to_go")
        is None
    )
    assert (
        ImplicitSignalExtractor.extract_from_collection("u1", "p1", None, "skipped")
        is not None
    )

    # 2. Deal accepted trains airline & lodging type preferences; direct_flight_bias & discarded properties affect ranking
    p_a = UserTasteProfile(
        user_id="u1",
        is_neutral=False,
        event_count=3,
        economic_profile=EconomicProfile(
            lodging_preferences={"preferred_types": {"boutique": 0.9, "hotel": 0.7}},
            flight_preferences={
                "preferred_departure_window": [8, 14],
                "direct_flight_bias": 0.9,
            },
        ),
    )
    p_b = UserTasteProfile(
        user_id="u2",
        is_neutral=False,
        event_count=3,
        economic_profile=EconomicProfile(
            lodging_preferences={
                "preferred_types": {"boutique": 0.8, "resort": 0.6},
                "discarded_property_ids": ["prop_bad"],
            },
            flight_preferences={
                "preferred_departure_window": [10, 18],
                "direct_flight_bias": 0.5,
            },
        ),
    )
    deal_ev = ImplicitSignalExtractor.extract_from_deal(
        "u1",
        {
            "id": "deal_1",
            "package_json": {
                "discount_pct": 25.0,
                "flight": {"airline": "Iberia"},
                "lodging": {
                    "property_id": "prop_1",
                    "property_type": "boutique",
                    "stars": 4,
                },
            },
        },
        "accepted",
    )
    TasteProfileUpdater.apply_events(p_a, [deal_ev])
    assert p_a.economic_profile.flight_preferences["airline_affinities"]["iberia"] > 0.5
    assert p_a.economic_profile.lodging_preferences["preferred_types"]["boutique"] > 0.9

    merged = TripTasteAggregator.merge_profiles([p_a, p_b], organizer_user_id="u1")
    assert list(
        merged.economic_profile.lodging_preferences["preferred_types"].keys()
    ) == ["boutique"]
    assert merged.economic_profile.flight_preferences["preferred_departure_window"] == [
        10,
        14,
    ]
    assert merged.economic_profile.flight_preferences["direct_flight_bias"] == 0.9

    m_prefs = merged.to_market_preferences()
    direct_good = score_flight_and_deal_taste(
        {
            "discount_pct": 20.0,
            "flight": {"airline": "Iberia", "depart_time": "11:00", "stops": 0},
            "lodging": {"property_id": "prop_ok", "value_score": 80.0},
        },
        m_prefs,
    )
    connecting_discarded = score_flight_and_deal_taste(
        {
            "discount_pct": 20.0,
            "flight": {"airline": "Iberia", "depart_time": "11:00", "stops": 2},
            "lodging": {"property_id": "prop_bad", "value_score": 80.0},
        },
        m_prefs,
    )
    assert direct_good > connecting_discarded

    # 3. Agent prompt documents taste tools & forget_taste_preference accepts injected trip_id
    assert "record_taste_preference" in SYSTEM_PROMPT
    assert "forget_taste_preference" in SYSTEM_PROMPT
    monkeypatch.setattr(
        TasteService,
        "forget_user_preference",
        AsyncMock(return_value=UserTasteProfile(user_id="u1", version=2)),
    )
    import app.mcp.tools.trip as mcp_trip_mod

    monkeypatch.setattr(
        mcp_trip_mod,
        "get_user_context",
        AsyncMock(return_value=MagicMock(user=MagicMock(id="u1"), session=MagicMock())),
    )
    res = await forget_taste_preference(target="shopping", trip_id="trip-123")
    assert res.ok is True

    # 4. Market feedback endpoint wired
    market_paths = {getattr(r, "path", "") for r in market.router.routes}
    assert "/deals/{deal_id}/feedback" in market_paths
