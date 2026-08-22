import os
import requests
from dotenv import load_dotenv

load_dotenv()
DUFFEL_TOKEN = os.getenv("DUFFEL_TOKEN")

headers = {
    "Authorization": f"Bearer {DUFFEL_TOKEN}",
    "Duffel-Version": "beta",
    "Content-Type": "application/json"
}

print("Testing Flights API LHR -> CDG...")
flight_payload = {
    "data": {
        "passengers": [{"type": "adult"}],
        "slices": [{"origin": "LHR", "destination": "CDG", "departure_date": "2027-03-31"}]
    }
}
resp = requests.post("https://api.duffel.com/air/offer_requests", headers=headers, json=flight_payload)
print(resp.status_code)
if resp.status_code == 200 or resp.status_code == 201:
    data = resp.json()
    print("Offers:", len(data['data'].get('offers', [])))
else:
    print(resp.text)

print("Testing Stays API for Barcelona...")
stays_payload = {
    "data": {
        "location": {
            "geographic_coordinates": {
                "latitude": 41.3851,
                "longitude": 2.1734
            },
            "radius": 5
        },
        "check_in_date": "2027-03-31",
        "check_out_date": "2027-04-05",
        "rooms": 1,
        "adults": 1
    }
}
resp_stays = requests.post("https://api.duffel.com/stays/search", headers=headers, json=stays_payload)
print("Stays Status:", resp_stays.status_code)
if resp_stays.status_code in [200, 201]:
    data = resp_stays.json()
    print("Stays results:", len(data.get('data', {}).get('results', [])))
else:
    print(resp_stays.text)

