from enum import Enum
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TripModel, TripParticipantModel, UserModel


class TripAccessLevel(str, Enum):
    VIEWER = "viewer"
    EDITOR = "editor"
    OWNER = "owner"

    # Aliases
    READ = "viewer"
    EDIT = "editor"


LEVEL_PRIORITY = {
    TripAccessLevel.VIEWER: 1,
    TripAccessLevel.EDITOR: 2,
    TripAccessLevel.OWNER: 3,
}


async def get_user_trip_role(
    user: UserModel | None,
    trip: TripModel,
    session: AsyncSession,
) -> TripAccessLevel | None:
    """
    Resolves the effective role of a user for a given trip.
    Returns None if the user has no access.
    """
    # Unowned trips in sovereign local single-user mode grant owner privileges
    if trip.user_id is None:
        return TripAccessLevel.OWNER

    # Anonymous user has no access to owned trips
    if not user:
        return None

    # Trip owner
    if user.id == trip.user_id:
        return TripAccessLevel.OWNER

    # Check participant membership
    stmt = select(TripParticipantModel).where(
        TripParticipantModel.trip_id == trip.id,
        TripParticipantModel.user_id == user.id,
    )
    result = await session.execute(stmt)
    participant = result.scalar_one_or_none()
    if participant:
        # Linked participant gets editor level
        return TripAccessLevel.EDITOR

    return None


async def assert_trip_access(
    user: UserModel | None,
    trip_id: str,
    required_level: TripAccessLevel | str,
    session: AsyncSession,
) -> TripModel:
    """
    Asserts that the user has at least the required access level on the specified trip.
    Raises HTTPException(404) if trip doesn't exist.
    Raises HTTPException(401) if unauthenticated on an owned trip.
    Raises HTTPException(403) if access level is insufficient.
    Returns the loaded TripModel.
    """
    if isinstance(required_level, str):
        try:
            req_enum = TripAccessLevel(required_level.lower())
        except ValueError:
            raise ValueError(f"Invalid required_level: {required_level}")
    else:
        req_enum = required_level

    stmt = select(TripModel).where(TripModel.id == trip_id)
    res = await session.execute(stmt)
    trip = res.scalar_one_or_none()
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found",
        )

    # If unowned trip, owner rights granted to anyone (sovereign local mode)
    if trip.user_id is None:
        return trip

    # Owned trip requires authentication
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access this trip",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_role = await get_user_trip_role(user, trip, session)
    if not user_role or LEVEL_PRIORITY[user_role] < LEVEL_PRIORITY[req_enum]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Insufficient trip permissions. Required '{req_enum.value}', got '{user_role.value if user_role else 'none'}'",
        )

    return trip
