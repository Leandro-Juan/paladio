import os

from dotenv import load_dotenv
from duffel_api import Duffel

load_dotenv()
DUFFEL_TOKEN = os.getenv("DUFFEL_TOKEN")
print("Token:", DUFFEL_TOKEN[:10] if DUFFEL_TOKEN else None)

client = Duffel(access_token=DUFFEL_TOKEN, api_version="v2")

try:
    print("Testing Flights...")
    offer_request = (
        client.offer_requests.create()
        .slices(
            [{"origin": "ALC", "destination": "BCN", "departure_date": "2027-03-31"}]
        )
        .passengers([{"type": "adult"}])
        .execute()
    )
    print(f"Got {len(offer_request.offers)} flight offers for ALC -> BCN")

    print("Testing Flights MAD -> BCN...")
    offer_request = (
        client.offer_requests.create()
        .slices(
            [{"origin": "MAD", "destination": "BCN", "departure_date": "2027-03-31"}]
        )
        .passengers([{"type": "adult"}])
        .execute()
    )
    print(f"Got {len(offer_request.offers)} flight offers for MAD -> BCN")
except Exception as e:
    print(f"Flight error: {e}")

try:
    print("Testing Stays...")
    # Duffel Stays search requires coordinates and a radius, or property IDs.
    # Let's search by coordinates for Barcelona (e.g. 41.3851, 2.1734)
    stays_search = (
        client.stays.search.create()
        .location(
            radius=5, geographic_coordinates={"latitude": 41.3851, "longitude": 2.1734}
        )
        .check_in("2027-03-31")
        .check_out("2027-04-05")
        .rooms(1)
        .adults(1)
        .execute()
    )
    print(f"Got {len(stays_search.results)} stays")
except Exception as e:
    print(f"Stays error: {e}")
