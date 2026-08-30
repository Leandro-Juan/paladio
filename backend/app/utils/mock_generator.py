import random
from datetime import datetime, timedelta, timezone
from typing import Any

from app.schemas.scraper import (
    Booking,
    Financials,
    Flight,
    FlightSchedule,
    FoodAndDrink,
    FoodFinancials,
    Hotel,
    HotelFinancials,
    Location,
    MealSuitability,
    Metadata,
    Route,
    Schedule,
    Scoring,
    Stay,
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

    airlines = [
        "Vueling",
        "Ryanair",
        "EasyJet",
        "Lufthansa",
        "British Airways",
        "Air France",
        "KLM",
    ]
    hotel_chains = [
        "Hilton",
        "Marriott",
        "Ibis",
        "NH Hotels",
        "Melia",
        "Ritz",
        "Holiday Inn",
        "Grand",
        "Central",
    ]
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

    now_utc = datetime.now(timezone.utc)

    # Generate 50 Outbound and 50 Return Flights
    for i in range(50):
        # Outbound
        price = round(random.uniform(50.0, 400.0), 2)
        dur_mins = random.randint(90, 300)
        dep_hour = random.randint(6, 20)
        dep_min = random.choice([0, 15, 30, 45])

        # start_date could be date or datetime. Handle accordingly.
        if hasattr(start_date, "year"):
            dep_dt = datetime(
                start_date.year,
                start_date.month,
                start_date.day,
                dep_hour,
                dep_min,
                tzinfo=timezone.utc,
            )
        else:
            dep_dt = now_utc + timedelta(days=1)

        arr_dt = dep_dt + timedelta(minutes=dur_mins)

        data["flights"].append(
            Flight(
                id=f"FLIGHT-OUT-{i}",
                airline=random.choice(airlines),
                flight_number=f"FL{random.randint(100, 999)}",
                route=Route(origin_iata="ORG", destination_iata="DST"),
                schedule=FlightSchedule(
                    departure_utc=dep_dt, arrival_utc=arr_dt, duration_minutes=dur_mins
                ),
                financials=Financials(price=price, currency="EUR"),
                booking=Booking(provider_url="http://mock.flight"),
                metadata=Metadata(source="DynamicMockGenerator"),
            ).model_dump(mode="json")
        )

        # Return
        ret_price = round(random.uniform(50.0, 400.0), 2)
        r_dur_mins = random.randint(90, 300)
        r_dep_hour = random.randint(6, 20)
        r_dep_min = random.choice([0, 15, 30, 45])

        if hasattr(end_date, "year"):
            r_dep_dt = datetime(
                end_date.year,
                end_date.month,
                end_date.day,
                r_dep_hour,
                r_dep_min,
                tzinfo=timezone.utc,
            )
        else:
            r_dep_dt = now_utc + timedelta(days=5)

        r_arr_dt = r_dep_dt + timedelta(minutes=r_dur_mins)

        data["return_flights"].append(
            Flight(
                id=f"FLIGHT-RET-{i}",
                airline=random.choice(airlines),
                flight_number=f"FL{random.randint(100, 999)}",
                route=Route(origin_iata="DST", destination_iata="ORG"),
                schedule=FlightSchedule(
                    departure_utc=r_dep_dt,
                    arrival_utc=r_arr_dt,
                    duration_minutes=r_dur_mins,
                ),
                financials=Financials(price=ret_price, currency="EUR"),
                booking=Booking(provider_url="http://mock.flight"),
                metadata=Metadata(source="DynamicMockGenerator"),
            ).model_dump(mode="json")
        )

    # Generate 50 Hotels
    for i in range(50):
        lat = center_lat + random.uniform(-0.02, 0.02)
        lon = center_lon + random.uniform(-0.02, 0.02)
        price_pn = round(random.uniform(70.0, 300.0), 2)
        nights = 3

        data["hotels"].append(
            Hotel(
                id=f"HOTEL-{i}",
                name=f"{random.choice(hotel_chains)} {city.title()} {i}",
                location=Location(latitude=lat, longitude=lon),
                stay=Stay(
                    check_in_date=start_date
                    if hasattr(start_date, "year")
                    else now_utc.date(),
                    check_out_date=end_date
                    if hasattr(end_date, "year")
                    else now_utc.date() + timedelta(days=nights),
                    nights=nights,
                    capacity=2,
                ),
                financials=HotelFinancials(
                    total_price=price_pn * nights,
                    price_per_night=price_pn,
                    currency="EUR",
                ),
                scoring=Scoring(
                    rating=round(random.uniform(3.5, 5.0), 1),
                    reviews=random.randint(50, 1000),
                ),
                amenities=["Wifi", "Pool", "Breakfast", "Gym"],
                booking=Booking(provider_url="http://mock.hotel"),
                metadata=Metadata(source="DynamicMockGenerator"),
            ).model_dump(mode="json")
        )

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
