import random
from datetime import datetime
from typing import Any

from app.schemas.scraper import (
    FoodAndDrink,
    FoodFinancials,
    Location,
    MealSuitability,
    Metadata,
    Schedule,
    Scoring,
)


def generate_dynamic_mock_data(
    city: str,
    center_lat: float,
    center_lon: float,
    start_date: datetime,
    end_date: datetime,
) -> dict[str, Any]:
    """
    Generates a large amount of mocked travel data for a specific city and coordinates,
    adhering strictly to the scraper JSON formats.
    """
    data = {
        "flights": [],
        "return_flights": [],
        "hotels": [],
        "restaurants": [],
    }

    restaurant_types = [
        "Tapas",
        "Italian",
        "Sushi",
        "Burger",
        "Vegan",
        "Steakhouse",
        "Seafood",
        "Cafe",
        "Bar",
    ]

    # Generate 100 Restaurants
    for i in range(100):
        lat = center_lat + random.uniform(-0.02, 0.02)
        lon = center_lon + random.uniform(-0.02, 0.02)
        rtype = random.choice(restaurant_types)
        is_bf = "Cafe" in rtype or "Bakery" in rtype

        data["restaurants"].append(
            FoodAndDrink(
                id=f"REST-{i}",
                category="cafe_bakery" if is_bf else "restaurant",
                name=f"{city.title()} {rtype} {random.choice(['Bistro', 'Kitchen', 'Bar', 'Grill', 'Place'])} {i}",
                location=Location(latitude=lat, longitude=lon),
                schedule=Schedule(
                    opening_time_local="07:00" if is_bf else "12:00",
                    closing_time_local="15:00" if is_bf else "23:00",
                    recommended_duration_minutes=45 if is_bf else 90,
                ),
                meal_suitability=MealSuitability(
                    is_breakfast=is_bf,
                    is_lunch=True,
                    is_dinner=not is_bf,
                    is_snack=is_bf,
                ),
                financials=FoodFinancials(
                    price_tier=random.choice(["$", "$$", "$$$"]), currency="EUR"
                ),
                scoring=Scoring(
                    rating=round(random.uniform(3.8, 5.0), 1),
                    reviews=random.randint(20, 800),
                ),
                cuisine=[rtype],
                dietary_options=["Vegetarian friendly", "Gluten-free options"],
                metadata=Metadata(source="DynamicMockGenerator"),
            ).model_dump(mode="json")
        )

    return data
