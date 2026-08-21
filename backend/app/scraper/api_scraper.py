import os
import httpx
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

async def get_flights_aviationstack(origin: str, destination: str) -> Dict[str, Any]:
    """
    Fetch real-time flight data using Aviationstack (Free tier available).
    Requires AVIATIONSTACK_API_KEY environment variable.
    """
    api_key = os.environ.get("AVIATIONSTACK_API_KEY")
    if not api_key:
        raise RuntimeError("AVIATIONSTACK_API_KEY not set. Cannot fetch real flight data.")
    
    url = "http://api.aviationstack.com/v1/flights"
    params = {
        "access_key": api_key,
        "dep_iata": origin,
        "arr_iata": destination
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return {"status": "success", "data": response.json().get("data", [])}


async def get_hotels_amadeus(city_code: str) -> Dict[str, Any]:
    """
    Fetch hotel data using Amadeus API (Free sandbox available).
    Requires AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET.
    """
    client_id = os.environ.get("AMADEUS_CLIENT_ID")
    client_secret = os.environ.get("AMADEUS_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise RuntimeError("Amadeus credentials not set. Cannot fetch real hotel data.")

    # 1. Get access token
    auth_url = "https://test.api.amadeus.com/v1/security/oauth2/token"
    auth_data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }
    
    async with httpx.AsyncClient() as client:
        auth_response = await client.post(auth_url, data=auth_data)
        auth_response.raise_for_status()
        token = auth_response.json().get("access_token")
        
        # 2. Search hotels by city
        hotels_url = "https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city"
        headers = {"Authorization": f"Bearer {token}"}
        params = {"cityCode": city_code, "radius": 5, "radiusUnit": "KM"}
        
        hotels_response = await client.get(hotels_url, headers=headers, params=params)
        hotels_response.raise_for_status()
        return {"status": "success", "data": hotels_response.json().get("data", [])}
