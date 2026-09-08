import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete

from app.db.session import get_db
from app.db.models import TripModel

router = APIRouter()


class TripCreate(BaseModel):
    destination: str
    start_date: str
    end_date: str
    itinerary_data: dict[str, Any]


class TripResponse(TripCreate):
    id: str
    created_at: str


@router.post("/", response_model=TripResponse)
async def create_trip(trip: TripCreate, session: AsyncSession = Depends(get_db)):
    new_id = str(uuid.uuid4())
    db_trip = TripModel(
        id=new_id,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        itinerary_data=trip.itinerary_data,
    )
    session.add(db_trip)
    await session.commit()
    await session.refresh(db_trip)

    return TripResponse(
        id=db_trip.id,
        destination=db_trip.destination,
        start_date=db_trip.start_date,
        end_date=db_trip.end_date,
        itinerary_data=db_trip.itinerary_data,
        created_at=db_trip.created_at.isoformat()
        if db_trip.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.get("/", response_model=list[TripResponse])
async def get_trips(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(TripModel).order_by(TripModel.start_date.asc())
    )
    trips = result.scalars().all()

    response = []
    for t in trips:
        response.append(
            TripResponse(
                id=t.id,
                destination=t.destination,
                start_date=t.start_date,
                end_date=t.end_date,
                itinerary_data=t.itinerary_data,
                created_at=t.created_at.isoformat()
                if t.created_at
                else datetime.now(timezone.utc).isoformat(),
            )
        )
    return response


@router.delete("/{trip_id}")
async def delete_trip(trip_id: str, session: AsyncSession = Depends(get_db)):
    result = await session.execute(delete(TripModel).where(TripModel.id == trip_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Trip not found")
    await session.commit()
    return {"status": "success", "message": "Trip deleted"}
