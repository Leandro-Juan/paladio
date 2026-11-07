from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import (
    TripCollectionItemModel,
    TripCollectionModel,
    UserModel,
)

logger = logging.getLogger(__name__)


class CollectionService:
    """
    Manages custom trip collections (bookmarks, packing lists, curated places).
    """

    @classmethod
    async def list_collections(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> list[TripCollectionModel]:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)
        stmt = (
            select(TripCollectionModel)
            .where(TripCollectionModel.trip_id == trip_id)
            .options(selectinload(TripCollectionModel.items))
            .order_by(TripCollectionModel.created_at.asc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    @classmethod
    async def create_collection(
        cls,
        trip_id: str,
        name: str,
        user: UserModel | None,
        session: AsyncSession,
        description: Optional[str] = None,
        color: Optional[str] = "#0F4C5C",
    ) -> TripCollectionModel:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Collection name cannot be empty.",
            )

        col = TripCollectionModel(
            id=str(uuid.uuid4()),
            trip_id=trip_id,
            name=clean_name,
            description=description.strip() if description else None,
            color=color or "#0F4C5C",
        )
        session.add(col)
        await session.commit()
        await session.refresh(col)
        return col

    @classmethod
    async def add_item(
        cls,
        trip_id: str,
        collection_id: str,
        poi_id: str,
        user: UserModel | None,
        session: AsyncSession,
        notes: Optional[str] = None,
    ) -> TripCollectionItemModel:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)

        c_stmt = select(TripCollectionModel).where(
            TripCollectionModel.trip_id == trip_id,
            TripCollectionModel.id == collection_id,
        )
        c_res = await session.execute(c_stmt)
        col = c_res.scalar_one_or_none()
        if not col:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Collection '{collection_id}' not found.",
            )

        # Check if item already exists in this collection
        existing_stmt = select(TripCollectionItemModel).where(
            TripCollectionItemModel.collection_id == collection_id,
            TripCollectionItemModel.poi_id == poi_id,
        )
        existing_res = await session.execute(existing_stmt)
        existing = existing_res.scalar_one_or_none()
        if existing:
            if notes:
                existing.notes = notes.strip()
                await session.commit()
                await session.refresh(existing)
            return existing

        # Get highest position
        pos_stmt = (
            select(TripCollectionItemModel.position)
            .where(TripCollectionItemModel.collection_id == collection_id)
            .order_by(TripCollectionItemModel.position.desc())
            .limit(1)
        )
        pos_res = await session.execute(pos_stmt)
        max_pos = pos_res.scalar_one_or_none() or 0

        item = TripCollectionItemModel(
            id=str(uuid.uuid4()),
            collection_id=collection_id,
            poi_id=poi_id,
            position=max_pos + 1,
            notes=notes.strip() if notes else None,
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item

    @classmethod
    async def remove_item(
        cls,
        trip_id: str,
        collection_id: str,
        item_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> None:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        stmt = select(TripCollectionItemModel).where(
            TripCollectionItemModel.collection_id == collection_id,
            TripCollectionItemModel.id == item_id,
        )
        res = await session.execute(stmt)
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item '{item_id}' not found in collection.",
            )

        await session.delete(item)
        await session.commit()
