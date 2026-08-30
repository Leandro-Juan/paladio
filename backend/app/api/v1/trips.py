import json
import os
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

TRIPS_FILE = os.path.join(os.path.dirname(__file__), "../../../data/trips.json")


class TripCreate(BaseModel):
    destination: str
    start_date: str
    end_date: str
    itinerary_data: dict[str, Any]


class TripResponse(TripCreate):
    id: str
    created_at: str


def _load_trips() -> list[dict[str, Any]]:
    if not os.path.exists(TRIPS_FILE):
        return []
    try:
        with open(TRIPS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []


def _save_trips(trips: list[dict[str, Any]]):
    os.makedirs(os.path.dirname(TRIPS_FILE), exist_ok=True)
    with open(TRIPS_FILE, "w") as f:
        json.dump(trips, f, indent=2)


@router.post("/", response_model=TripResponse)
async def create_trip(trip: TripCreate):
    trips = _load_trips()
    new_trip = trip.dict()
    new_trip["id"] = str(uuid.uuid4())
    new_trip["created_at"] = datetime.utcnow().isoformat()
    trips.append(new_trip)
    _save_trips(trips)
    return new_trip


@router.get("/", response_model=list[TripResponse])
async def get_trips():
    trips = _load_trips()
    # Sort by start_date ascending (closest first)
    trips.sort(key=lambda x: x.get("start_date", ""))
    return trips


@router.delete("/{trip_id}")
async def delete_trip(trip_id: str):
    trips = _load_trips()
    original_len = len(trips)
    trips = [t for t in trips if t.get("id") != trip_id]
    if len(trips) == original_len:
        raise HTTPException(status_code=404, detail="Trip not found")
    _save_trips(trips)
    return {"status": "success", "message": "Trip deleted"}
