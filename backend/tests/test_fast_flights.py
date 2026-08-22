from fast_flights import get_flights, FlightQuery, Passengers, create_query

query = create_query(
    flights=[FlightQuery(date="2027-03-31", from_airport="ALC", to_airport="BCN")],
    trip="one-way",
    seat="economy",
    passengers=Passengers(adults=1)
)
print("Fetching...")
result = get_flights(query)
print("Result:", result)
if result and hasattr(result, "flights"):
    for f in result.flights:
        print(f)
