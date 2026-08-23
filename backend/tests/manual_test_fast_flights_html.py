from fast_flights import get_flights, FlightQuery, Passengers, create_query
import httpx
from fast_flights.fetcher import get_flights as orig_get_flights, _API

query = create_query(
    flights=[FlightQuery(date="2027-03-31", from_airport="ALC", to_airport="BCN")],
    trip="one-way",
    seat="economy",
    passengers=Passengers(adults=1)
)

url = f"{_API}?{query}"
print(url)
resp = httpx.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"})
print("Status:", resp.status_code)
html = resp.text
print(html[:500])
if "Consent" in html or "Our systems have detected" in html:
    print("BLOCKED/CONSENT")
