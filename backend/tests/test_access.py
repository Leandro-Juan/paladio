import uuid
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import TripModel, TripParticipantModel, UserModel


@pytest.mark.asyncio
async def test_assert_trip_access_not_found(db_session: AsyncSession):
    with pytest.raises(HTTPException) as exc_info:
        await assert_trip_access(
            None, "non_existent_trip_id", TripAccessLevel.VIEWER, db_session
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_trip_access_unowned_trip(db_session: AsyncSession):
    trip_id = f"trip_{uuid.uuid4().hex[:8]}"
    trip = TripModel(
        id=trip_id,
        user_id=None,
        destination="Madrid",
        start_date="2026-10-10",
        end_date="2026-10-12",
        itinerary_data={"days": []},
    )
    db_session.add(trip)
    await db_session.commit()

    # Anonymous user gets access to unowned trip
    result = await assert_trip_access(None, trip_id, TripAccessLevel.OWNER, db_session)
    assert result.id == trip_id


@pytest.mark.asyncio
async def test_assert_trip_access_owned_trip_scoping(db_session: AsyncSession):
    owner = UserModel(
        id=f"usr_owner_{uuid.uuid4().hex[:6]}",
        email=f"owner_{uuid.uuid4().hex[:6]}@example.com",
        username=f"owner_{uuid.uuid4().hex[:6]}",
        hashed_password="pw",
    )
    editor_user = UserModel(
        id=f"usr_editor_{uuid.uuid4().hex[:6]}",
        email=f"editor_{uuid.uuid4().hex[:6]}@example.com",
        username=f"editor_{uuid.uuid4().hex[:6]}",
        hashed_password="pw",
    )
    stranger = UserModel(
        id=f"usr_stranger_{uuid.uuid4().hex[:6]}",
        email=f"stranger_{uuid.uuid4().hex[:6]}@example.com",
        username=f"stranger_{uuid.uuid4().hex[:6]}",
        hashed_password="pw",
    )
    trip = TripModel(
        id=f"trip_{uuid.uuid4().hex[:8]}",
        user_id=owner.id,
        destination="Paris",
        start_date="2026-11-01",
        end_date="2026-11-05",
        itinerary_data={"days": []},
    )
    participant = TripParticipantModel(
        id=f"part_{uuid.uuid4().hex[:8]}",
        trip_id=trip.id,
        user_id=editor_user.id,
        name="Editor Participant",
    )
    db_session.add_all([owner, editor_user, stranger])
    await db_session.flush()
    db_session.add(trip)
    await db_session.flush()
    db_session.add(participant)
    await db_session.commit()

    # 1. Anonymous fails on owned trip
    with pytest.raises(HTTPException) as exc:
        await assert_trip_access(None, trip.id, TripAccessLevel.VIEWER, db_session)
    assert exc.value.status_code == 401

    # 2. Stranger fails on owned trip (403)
    with pytest.raises(HTTPException) as exc:
        await assert_trip_access(stranger, trip.id, TripAccessLevel.VIEWER, db_session)
    assert exc.value.status_code == 403

    # 3. Editor has editor access, but not owner access
    editor_res = await assert_trip_access(
        editor_user, trip.id, TripAccessLevel.EDITOR, db_session
    )
    assert editor_res.id == trip.id

    with pytest.raises(HTTPException) as exc:
        await assert_trip_access(
            editor_user, trip.id, TripAccessLevel.OWNER, db_session
        )
    assert exc.value.status_code == 403

    # 4. Owner has all levels
    owner_viewer = await assert_trip_access(
        owner, trip.id, TripAccessLevel.VIEWER, db_session
    )
    assert owner_viewer.id == trip.id
    owner_editor = await assert_trip_access(
        owner, trip.id, TripAccessLevel.EDITOR, db_session
    )
    assert owner_editor.id == trip.id
    owner_owner = await assert_trip_access(
        owner, trip.id, TripAccessLevel.OWNER, db_session
    )
    assert owner_owner.id == trip.id
