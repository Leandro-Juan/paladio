"""Unit tests for the Paladio taste-aware hotel ranking engine."""

from app.engine.market.lodging.ranking import (
    HotelCandidate,
    compute_subscores,
    compute_taste_weights,
    haversine_km,
    is_eligible_candidate,
    rank_hotels,
)


def test_haversine_distance():
    """Verifies great-circle distance accuracy."""
    # Madrid Puerta del Sol (40.4168, -3.7038) to Retiro (40.4153, -3.6844) ~1.6 km
    d = haversine_km(40.4168, -3.7038, 40.4153, -3.6844)
    assert 1.4 < d < 1.8


def test_dorm_hostel_hard_filtering():
    """Verifies that shared dorms and hostels are filtered out unless user is a backpacker."""
    hotel = HotelCandidate(
        property_id="h1",
        name="Gran Hotel Madrid",
        nightly_cents=10000,
        property_type="hotel",
    )
    hostel = HotelCandidate(
        property_id="h2",
        name="Mad Youth Hostel & Dormitory",
        nightly_cents=2000,
        property_type="hostel",
    )

    # Standard / Balanced traveler
    assert is_eligible_candidate(hotel, user_preferences={"budget": "balanced"}) is True
    assert (
        is_eligible_candidate(hostel, user_preferences={"budget": "balanced"}) is False
    )

    # Backpacker explicitly permits hostels
    assert (
        is_eligible_candidate(hostel, user_preferences={"budget": "backpacker"}) is True
    )


def test_geospatial_cutoff_filtering():
    """Verifies that properties outside the allowed radius are filtered out."""
    center_lat, center_lon = 41.9028, 12.4964  # Rome center
    close_hotel = HotelCandidate(
        property_id="c1",
        name="Central Hotel",
        nightly_cents=9000,
        latitude=41.9050,
        longitude=12.4980,  # ~0.3 km
    )
    far_hotel = HotelCandidate(
        property_id="c2",
        name="Motorway Motel",
        nightly_cents=4000,
        latitude=41.7500,
        longitude=12.3000,  # ~23 km away
    )

    assert (
        is_eligible_candidate(
            close_hotel,
            max_center_km=10.0,
            center_lat=center_lat,
            center_lon=center_lon,
        )
        is True
    )
    assert (
        is_eligible_candidate(
            far_hotel,
            max_center_km=10.0,
            center_lat=center_lat,
            center_lon=center_lon,
        )
        is False
    )


def test_bayesian_quality_damps_fake_single_review():
    """Verifies that an established hotel with 8.6 (1500 reviews) outranks a single 10.0 review."""
    h_fake = HotelCandidate(
        property_id="fake",
        name="Sketchy 1-Review Place",
        nightly_cents=7000,
        review_score=10.0,
        review_count=1,
    )
    h_solid = HotelCandidate(
        property_id="solid",
        name="Verified Boutique Hotel",
        nightly_cents=7000,
        review_score=8.6,
        review_count=1500,
        stars=4.0,
    )

    sub_fake = compute_subscores(h_fake, [h_fake, h_solid])
    sub_solid = compute_subscores(h_solid, [h_fake, h_solid])

    # Solid hotel's Bayesian rating should be much higher than the damped 1-review fake
    assert sub_solid["quality"] > sub_fake["quality"]


def test_taste_shifts_weights():
    """Verifies that budget and pace shift the multi-objective utility weights."""
    w_default = compute_taste_weights(None)
    w_budget = compute_taste_weights({"budget": "budget"})
    w_luxury = compute_taste_weights({"budget": "luxury"})
    w_packed = compute_taste_weights({"pace": "packed"})

    # Budget traveler cares more about price
    assert w_budget["price"] > w_default["price"]
    assert w_budget["quality"] < w_default["quality"]

    # Luxury traveler cares less about price, more about quality
    assert w_luxury["price"] < w_default["price"]
    assert w_luxury["quality"] > w_default["quality"]

    # Packed pace traveler cares more about location proximity
    assert w_packed["location"] > w_default["location"]


def test_rank_hotels_winner_and_badges():
    """Verifies full multi-objective ranking, badge assignment, and explanations."""
    candidates = [
        HotelCandidate(
            property_id="budget_motel",
            name="Cheapest Outskirts Inn",
            nightly_cents=3500,
            review_score=7.2,
            review_count=80,
            stars=2.0,
            latitude=48.8200,
            longitude=2.3000,  # ~5.5 km from Paris center
            free_cancellation=False,
        ),
        HotelCandidate(
            property_id="top_value",
            name="Hotel Le Marais",
            nightly_cents=8500,
            review_score=9.1,
            review_count=1200,
            stars=4.0,
            latitude=48.8570,
            longitude=2.3550,  # Central Paris
            free_cancellation=True,
            board="breakfast included",
        ),
        HotelCandidate(
            property_id="luxury_palace",
            name="The Grand Palace",
            nightly_cents=45000,
            review_score=9.5,
            review_count=800,
            stars=5.0,
            latitude=48.8600,
            longitude=2.3300,
            free_cancellation=True,
        ),
    ]

    center_lat, center_lon = 48.8566, 2.3522  # Paris center

    # Balanced traveler
    ranked = rank_hotels(
        candidates,
        user_preferences={"budget": "balanced", "pace": "balanced"},
        center_lat=center_lat,
        center_lon=center_lon,
    )

    assert len(ranked) == 3
    # Le Marais should win best_value due to strong Q, L, F and reasonable price
    assert ranked[0].candidate.property_id == "top_value"
    assert ranked[0].badge == "best_value"
    assert "Top overall value score" in ranked[0].rank_reasons

    # Check badges for other properties
    badge_map = {r.candidate.property_id: r.badge for r in ranked}
    assert badge_map["budget_motel"] == "cheapest"

    # Extreme budget traveler preference flips winner to cheapest
    ranked_budget = rank_hotels(
        candidates,
        user_preferences={"budget": "budget", "pace": "relaxed"},
        center_lat=center_lat,
        center_lon=center_lon,
    )
    assert ranked_budget[0].candidate.nightly_cents <= ranked[0].candidate.nightly_cents
