import json
import os
import random
import sys

# Add the project root to path so we can import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    FoodAndDrink,
    FoodFinancials,
    Location,
    MealSuitability,
    Metadata,
    Schedule,
    Scoring,
)


def generate_test_data():
    data = {
        "flights": [],
        "return_flights": [],
        "hotels": [],
        "restaurants": [],
        "pois": [],
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
    attraction_types = ["museum", "monument", "historic_site", "landmark", "attraction"]

    # Generate Restaurants/Cafes/Bars
    for i in range(200):
        lat = 41.38 + random.uniform(-0.05, 0.05)
        lon = 2.16 + random.uniform(-0.05, 0.05)
        rtype = random.choice(restaurant_types)
        is_bf = "Cafe" in rtype

        data["restaurants"].append(
            FoodAndDrink(
                id=f"REST-{i}",
                category="cafe_bakery" if is_bf else "restaurant",
                name=f"The {random.choice(['Golden', 'Silver', 'Happy'])} {random.choice(['Spoon', 'Fork'])} {i}",
                location=Location(latitude=lat, longitude=lon),
                schedule=Schedule(
                    opening_time_local="08:00" if is_bf else "12:00",
                    closing_time_local="18:00" if is_bf else "23:00",
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
                    rating=round(random.uniform(3.0, 5.0), 1),
                    reviews=random.randint(10, 1000),
                ),
                cuisine=[rtype],
                dietary_options=["Vegetarian friendly"],
                metadata=Metadata(source="MockGenerator"),
            ).model_dump(mode="json")
        )

    # Generate POIs
    for i in range(200):
        lat = 41.38 + random.uniform(-0.05, 0.05)
        lon = 2.16 + random.uniform(-0.05, 0.05)
        cost = round(random.uniform(0.0, 50.0), 2)

        data["pois"].append(
            Attraction(
                id=f"POI-{i}",
                category=random.choice(attraction_types),
                name=f"{random.choice(['National', 'Royal', 'City'])} Attraction {i}",
                location=Location(latitude=lat, longitude=lon),
                schedule=AttractionSchedule(
                    osm_opening_hours="Mo-Su 09:00-18:00",
                    recommended_duration_minutes=random.choice([60, 90, 120]),
                ),
                financials=AttractionFinancials(
                    is_free=cost == 0, estimated_cost=cost, currency="EUR"
                ),
                scoring=Scoring(
                    rating=round(random.uniform(4.0, 5.0), 1),
                    reviews=random.randint(50, 5000),
                ),
                metadata=Metadata(source="MockGenerator"),
            ).model_dump(mode="json")
        )

    with open("test_data.json", "w") as f:
        json.dump(data, f, indent=4)


if __name__ == "__main__":
    generate_test_data()
