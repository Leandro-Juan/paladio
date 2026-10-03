import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from app.schemas.itinerary import (
    BookingAnchors,
    FlightSegment,
    HotelAnchor,
    NodeConstraint,
    TravelConstraints,
)

FIXTURES_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "tests"
    / "fixtures"
    / "bench_pois.json"
)

CITY_CENTERS = {
    "Paris": {
        "lat": 48.8566,
        "lon": 2.3522,
        "airport": "CDG",
        "airport_lat": 49.0097,
        "airport_lon": 2.5479,
    },
    "Madrid": {
        "lat": 40.4168,
        "lon": -3.7038,
        "airport": "MAD",
        "airport_lat": 40.4839,
        "airport_lon": -3.5679,
    },
    "Lisbon": {
        "lat": 38.7223,
        "lon": -9.1393,
        "airport": "LIS",
        "airport_lat": 38.7756,
        "airport_lon": -9.1354,
    },
}

MANDATORY_POIS = {
    "Paris": "Catacombes de Paris",
    "Madrid": "Museo Arqueológico Nacional",
    "Lisbon": "Aqueduto das Águas Livres",
}

TASTE_PROFILES = {
    "culture": ["art_culture", "history_heritage"],
    "food": ["food_culinary"],
    "general": ["art_culture", "architecture", "food_culinary", "scenic_views"],
}


def load_bench_fixtures() -> dict[str, list[dict[str, Any]]]:
    """Loads hermetic benchmark POIs fixture from JSON file."""
    if not FIXTURES_PATH.exists():
        raise FileNotFoundError(f"Fixture file not found at {FIXTURES_PATH}")
    with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_scenario_matrix(
    cities: list[str] | None = None,
    durations: list[int] | None = None,
    paces: list[str] | None = None,
    profiles: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Builds the Cartesian product scenario matrix for benchmarking."""
    if cities is None:
        cities = ["Paris", "Madrid", "Lisbon"]
    if durations is None:
        durations = [1, 3, 5, 7, 14]
    if paces is None:
        paces = ["LEISURELY", "BALANCED", "INTENSE"]
    if profiles is None:
        profiles = ["culture", "food", "general"]

    scenarios = []
    for c in cities:
        for d in durations:
            for p in paces:
                for prof in profiles:
                    scenarios.append(
                        {
                            "city": c,
                            "duration": d,
                            "pace": p,
                            "profile": prof,
                            "scenario_id": f"{c.lower()}_{d}d_{p.lower()}_{prof}",
                        }
                    )
    return scenarios


def build_scenario_constraints(
    city: str,
    duration: int,
    pace: str = "BALANCED",
    profile: str = "general",
    base_date: date | None = None,
) -> TravelConstraints:
    """Builds hermetic TravelConstraints for a scenario."""
    if base_date is None:
        base_date = date(2026, 6, 1)

    end_d = base_date + timedelta(days=max(0, duration - 1))
    c_info = CITY_CENTERS.get(city, CITY_CENTERS["Madrid"])
    mand_poi = MANDATORY_POIS.get(city, "Central Landmark")
    tastes = TASTE_PROFILES.get(profile, ["general"])

    # Base budget: 150 USD per day + 100 USD buffer
    budget = 100.0 + (150.0 * duration)

    return TravelConstraints(
        origin_city="New York",
        destination_city=city,
        budget_usd=budget,
        flight_cost=0.0,
        start_date=base_date,
        end_date=end_d,
        preferred_cuisines=["local", "traditional"],
        travel_tastes=tastes,
        nodes=[NodeConstraint(poi_id=mand_poi, mandatory=True)],
        booking_anchors=BookingAnchors(
            hotel=HotelAnchor(
                name=f"Central Hotel {city}",
                city=city,
                address="Center",
                check_in_date=str(base_date),
                check_out_date=str(end_d),
            ),
            outbound_flight=FlightSegment(
                origin_iata="JFK",
                destination_iata=c_info["airport"],
                departure_time=f"{base_date} 08:00",
                arrival_time=f"{base_date} 11:00",
                flight_number="AA100",
                airline="American Airlines",
            ),
            return_flight=FlightSegment(
                origin_iata=c_info["airport"],
                destination_iata="JFK",
                departure_time=f"{end_d} 18:00",
                arrival_time=f"{end_d} 21:00",
                flight_number="AA101",
                airline="American Airlines",
            ),
        ),
    )
