from app.quality.itinerary_metrics import (
    evaluate_day_quality,
    evaluate_itinerary_quality,
)


def test_evaluate_day_quality_detects_early_ending():
    # Day ending at 15:30 on a full day
    day_data = {
        "day": 2,
        "itinerary": {
            "path": [
                {
                    "poi": {
                        "category": "HOTEL",
                        "location": {"latitude": 40.4, "longitude": -3.7},
                    },
                    "scheduled_start": "08:00",
                    "scheduled_end": "08:00",
                },
                {
                    "poi": {
                        "category": "ATTRACTION",
                        "name": "Museum A",
                        "location": {"latitude": 40.41, "longitude": -3.71},
                    },
                    "scheduled_start": "09:00",
                    "scheduled_end": "11:00",
                },
                {
                    "poi": {
                        "category": "RESTAURANT",
                        "name": "Tapas B",
                        "location": {"latitude": 40.412, "longitude": -3.712},
                    },
                    "scheduled_start": "13:00",
                    "scheduled_end": "14:15",
                },
                {
                    "poi": {
                        "category": "ATTRACTION",
                        "name": "Park C",
                        "location": {"latitude": 40.415, "longitude": -3.705},
                    },
                    "scheduled_start": "14:30",
                    "scheduled_end": "15:30",
                },
                {
                    "poi": {
                        "category": "HOTEL",
                        "location": {"latitude": 40.4, "longitude": -3.7},
                    },
                    "scheduled_start": "16:00",
                    "scheduled_end": "16:00",
                },
            ]
        },
    }
    m = evaluate_day_quality(day_data, is_arrival=False, is_departure=False)
    assert m.ends_before_dinner is True
    assert m.sights_count == 2
    assert m.meals_count == 1
    assert m.last_visit_end == "15:30"
    assert any("ended early" in v for v in m.violations)


def test_evaluate_itinerary_quality_flags_synthetic_venues():
    payload = {
        "destination": "TestCity",
        "itinerary_data": {
            "days": [
                {
                    "day": 1,
                    "itinerary": {
                        "path": [
                            {
                                "poi": {
                                    "category": "RESTAURANT",
                                    "name": "Bistró de la Plaza",
                                    "location": {"latitude": 40.0, "longitude": 0.0},
                                },
                                "scheduled_start": "13:00",
                                "scheduled_end": "14:00",
                            }
                        ]
                    },
                }
            ]
        },
    }
    rep = evaluate_itinerary_quality(payload)
    assert rep.total_synthetic_meals == 1
    assert rep.gates_passed is False
    assert any("synthetic" in f for f in rep.gate_failures)
