import json
import random
from datetime import datetime, date, timedelta, timezone
import sys
import os

# Add the project root to path so we can import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.schemas.scraper import (
    Flight, Route, FlightSchedule, Financials, Booking, Metadata,
    Hotel, Location, Stay, HotelFinancials, Scoring,
    FoodAndDrink, Schedule, MealSuitability, FoodFinancials,
    Attraction, AttractionSchedule, AttractionFinancials
)

def generate_test_data():
    data = {
        "flights": [],
        "return_flights": [],
        "hotels": [],
        "restaurants": [],
        "pois": []
    }
    
    cities = ["Barcelona", "Madrid", "Paris", "London", "Rome", "Berlin", "Amsterdam"]
    airlines = ["Vueling", "Ryanair", "EasyJet", "Lufthansa", "British Airways", "Air France", "KLM"]
    hotel_chains = ["Hilton", "Marriott", "Ibis", "NH Hotels", "Melia", "Ritz", "Holiday Inn"]
    restaurant_types = ["Tapas", "Italian", "Sushi", "Burger", "Vegan", "Steakhouse", "Seafood", "Cafe", "Bar"]
    attraction_types = ["museum", "monument", "historic_site", "landmark", "attraction"]

    today = date.today()
    now_utc = datetime.now(timezone.utc)
    
    # Generate Flights
    for i in range(50):
        # Outbound
        price = round(random.uniform(20.0, 500.0), 2)
        dep_hour = random.randint(5, 20)
        dep_min = random.choice([0, 15, 30, 45])
        dur_mins = random.randint(60, 240)
        
        dep_dt = datetime(now_utc.year, now_utc.month, now_utc.day, dep_hour, dep_min, tzinfo=timezone.utc)
        arr_dt = dep_dt + timedelta(minutes=dur_mins)
        
        data["flights"].append(Flight(
            id=f"FLIGHT-OUT-{i}",
            airline=random.choice(airlines),
            flight_number=f"FL{random.randint(100, 999)}",
            route=Route(origin_iata="LON", destination_iata="BCN"),
            schedule=FlightSchedule(departure_utc=dep_dt, arrival_utc=arr_dt, duration_minutes=dur_mins),
            financials=Financials(price=price, currency="EUR"),
            booking=Booking(provider_url="http://mock.flight"),
            metadata=Metadata(source="MockGenerator")
        ).model_dump(mode='json'))
        
        # Return
        ret_price = round(random.uniform(20.0, 500.0), 2)
        r_dep_hour = random.randint(5, 20)
        r_dep_min = random.choice([0, 15, 30, 45])
        r_dur_mins = random.randint(60, 240)
        r_dep_dt = dep_dt + timedelta(days=5) # 5 days later
        r_arr_dt = r_dep_dt + timedelta(minutes=r_dur_mins)
        
        data["return_flights"].append(Flight(
            id=f"FLIGHT-RET-{i}",
            airline=random.choice(airlines),
            flight_number=f"FL{random.randint(100, 999)}",
            route=Route(origin_iata="BCN", destination_iata="LON"),
            schedule=FlightSchedule(departure_utc=r_dep_dt, arrival_utc=r_arr_dt, duration_minutes=r_dur_mins),
            financials=Financials(price=ret_price, currency="EUR"),
            booking=Booking(provider_url="http://mock.flight.return"),
            metadata=Metadata(source="MockGenerator")
        ).model_dump(mode='json'))

    # Generate Hotels
    for i in range(100):
        lat = 41.38 + random.uniform(-0.05, 0.05)
        lon = 2.16 + random.uniform(-0.05, 0.05)
        price_pn = round(random.uniform(50.0, 500.0), 2)
        nights = 5
        data["hotels"].append(Hotel(
            id=f"HOTEL-{i}",
            name=f"{random.choice(hotel_chains)} {random.choice(cities)} {i}",
            location=Location(latitude=lat, longitude=lon),
            stay=Stay(check_in_date=today, check_out_date=today + timedelta(days=nights), nights=nights, capacity=2),
            financials=HotelFinancials(total_price=price_pn * nights, price_per_night=price_pn, currency="EUR"),
            scoring=Scoring(rating=round(random.uniform(3.0, 5.0), 1), reviews=random.randint(10, 1000)),
            amenities=["Wifi", "Pool", "Breakfast"],
            booking=Booking(provider_url="http://mock.hotel"),
            metadata=Metadata(source="MockGenerator")
        ).model_dump(mode='json'))

    # Generate Restaurants/Cafes/Bars
    for i in range(200):
        lat = 41.38 + random.uniform(-0.05, 0.05)
        lon = 2.16 + random.uniform(-0.05, 0.05)
        rtype = random.choice(restaurant_types)
        is_bf = "Cafe" in rtype
        
        data["restaurants"].append(FoodAndDrink(
            id=f"REST-{i}",
            category="cafe_bakery" if is_bf else "restaurant",
            name=f"The {random.choice(['Golden', 'Silver', 'Happy'])} {random.choice(['Spoon', 'Fork'])} {i}",
            location=Location(latitude=lat, longitude=lon),
            schedule=Schedule(opening_time_local="08:00" if is_bf else "12:00", closing_time_local="18:00" if is_bf else "23:00", recommended_duration_minutes=45 if is_bf else 90),
            meal_suitability=MealSuitability(is_breakfast=is_bf, is_lunch=True, is_dinner=not is_bf, is_snack=is_bf),
            financials=FoodFinancials(price_tier=random.choice(["$", "$$", "$$$"]), currency="EUR"),
            scoring=Scoring(rating=round(random.uniform(3.0, 5.0), 1), reviews=random.randint(10, 1000)),
            cuisine=[rtype],
            dietary_options=["Vegetarian friendly"],
            metadata=Metadata(source="MockGenerator")
        ).model_dump(mode='json'))

    # Generate POIs
    for i in range(200):
        lat = 41.38 + random.uniform(-0.05, 0.05)
        lon = 2.16 + random.uniform(-0.05, 0.05)
        cost = round(random.uniform(0.0, 50.0), 2)
        
        data["pois"].append(Attraction(
            id=f"POI-{i}",
            category=random.choice(attraction_types),
            name=f"{random.choice(['National', 'Royal', 'City'])} Attraction {i}",
            location=Location(latitude=lat, longitude=lon),
            schedule=AttractionSchedule(osm_opening_hours="Mo-Su 09:00-18:00", recommended_duration_minutes=random.choice([60, 90, 120])),
            financials=AttractionFinancials(is_free=cost == 0, estimated_cost=cost, currency="EUR"),
            scoring=Scoring(rating=round(random.uniform(4.0, 5.0), 1), reviews=random.randint(50, 5000)),
            metadata=Metadata(source="MockGenerator")
        ).model_dump(mode='json'))

    with open("test_data.json", "w") as f:
        json.dump(data, f, indent=4)
        
if __name__ == "__main__":
    generate_test_data()
