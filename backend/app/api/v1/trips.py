import uuid
from datetime import datetime, timezone
from typing import Any

from app.api.deps import get_optional_user
from app.db.models import TripModel, UserModel
from app.db.session import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

router = APIRouter()


class TripCreate(BaseModel):
    destination: str
    start_date: str
    end_date: str
    itinerary_data: dict[str, Any]


class TripResponse(TripCreate):
    id: str
    user_id: str | None = None
    created_at: str


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    trip: TripCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    new_id = str(uuid.uuid4())
    db_trip = TripModel(
        id=new_id,
        user_id=current_user.id if current_user else None,
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
        user_id=db_trip.user_id,
        destination=db_trip.destination,
        start_date=db_trip.start_date,
        end_date=db_trip.end_date,
        itinerary_data=db_trip.itinerary_data,
        created_at=db_trip.created_at.isoformat()
        if db_trip.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.get("/", response_model=list[TripResponse])
async def get_trips(
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    stmt = select(TripModel).order_by(TripModel.start_date.asc())

    result = await session.execute(stmt)
    trips = result.scalars().all()

    response = []
    for t in trips:
        response.append(
            TripResponse(
                id=t.id,
                user_id=t.user_id,
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


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return TripResponse(
        id=trip.id,
        user_id=trip.user_id,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        itinerary_data=trip.itinerary_data,
        created_at=trip.created_at.isoformat()
        if trip.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.delete("/{trip_id}")
async def delete_trip(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    await session.execute(delete(TripModel).where(TripModel.id == trip_id))
    await session.commit()
    return {"status": "success", "message": "Trip deleted"}
