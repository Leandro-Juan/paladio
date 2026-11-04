from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import TripExpenseModel, TripParticipantModel, UserModel

logger = logging.getLogger(__name__)


class ParticipantService:
    """
    Manages trip participants, roles, and collaboration memberships.
    Enforces the invariant: Never remove the last participant.
    """

    @classmethod
    async def list_participants(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> list[TripParticipantModel]:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)
        stmt = (
            select(TripParticipantModel)
            .where(TripParticipantModel.trip_id == trip_id)
            .order_by(TripParticipantModel.created_at.asc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    @classmethod
    async def add_participant(
        cls,
        trip_id: str,
        name: str,
        user: UserModel | None,
        session: AsyncSession,
        email: Optional[str] = None,
        linked_user_id: Optional[str] = None,
        role: str = "traveler",
    ) -> TripParticipantModel:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)

        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Participant name cannot be empty.",
            )

        # Validate linked user if specified
        valid_user_id = None
        if linked_user_id:
            u_res = await session.execute(
                select(UserModel).where(UserModel.id == linked_user_id)
            )
            linked_user = u_res.scalar_one_or_none()
            if not linked_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"User '{linked_user_id}' does not exist.",
                )
            valid_user_id = linked_user.id
            if not email:
                email = linked_user.email

        participant = TripParticipantModel(
            id=str(uuid.uuid4()),
            trip_id=trip_id,
            user_id=valid_user_id,
            name=clean_name,
            email=email.strip().lower() if email else None,
            role=role,
        )
        session.add(participant)
        await session.commit()
        await session.refresh(participant)
        return participant

    @classmethod
    async def remove_participant(
        cls,
        trip_id: str,
        participant_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> dict[str, Any]:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)

        # Check total participants
        stmt = select(TripParticipantModel).where(
            TripParticipantModel.trip_id == trip_id
        )
        res = await session.execute(stmt)
        all_participants = list(res.scalars().all())

        if len(all_participants) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last participant from a trip.",
            )

        target = next((p for p in all_participants if p.id == participant_id), None)
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Participant '{participant_id}' not found in this trip.",
            )

        # Check if participant paid expenses
        exp_res = await session.execute(
            select(TripExpenseModel).where(
                TripExpenseModel.trip_id == trip_id,
                TripExpenseModel.payer_id == participant_id,
            )
        )
        paid_expenses = list(exp_res.scalars().all())
        warning_msg = None
        if paid_expenses:
            warning_msg = f"Participant '{target.name}' has paid {len(paid_expenses)} recorded expenses."

        await session.delete(target)
        await session.commit()

        return {
            "status": "success",
            "message": f"Removed participant '{target.name}'.",
            "warning": warning_msg,
        }
