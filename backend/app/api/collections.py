import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_optional_user
from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import (
    AttractionModel,
    TripCollectionItemModel,
    TripCollectionModel,
    TripModel,
    UserModel,
)
from app.db.session import get_db
from app.schemas.collection import (
    AddItemRequest,
    CollectionCreate,
    CollectionItemResponse,
    CollectionResponse,
    CollectionUpdate,
    PoiCollectionsResponse,
    PoiSummary,
    ToggleCollectionRequest,
    ToggleCollectionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_trip_or_404(
    trip_id: str,
    session: AsyncSession,
    user: UserModel | None = None,
    level: TripAccessLevel = TripAccessLevel.VIEWER,
) -> TripModel:
    return await assert_trip_access(user, trip_id, level, session)


async def _hydrate_poi_summaries(
    poi_ids: set[str], session: AsyncSession
) -> dict[str, PoiSummary]:
    if not poi_ids:
        return {}

    stmt = select(AttractionModel).where(AttractionModel.id.in_(poi_ids))
    res = await session.execute(stmt)
    attractions = res.scalars().all()

    poi_map: dict[str, PoiSummary] = {}
    for attr in attractions:
        loc = attr.location or {}
        lat = loc.get("latitude") if "latitude" in loc else loc.get("lat")
        lng = loc.get("longitude") if "longitude" in loc else loc.get("lng")
        meta = attr.metadata_field or {}
        scoring = attr.scoring or {}

        photo = (
            meta.get("photo_url")
            or meta.get("image_url")
            or (
                meta.get("photos", [None])[0]
                if isinstance(meta.get("photos"), list) and meta.get("photos")
                else None
            )
        )
        thumb = meta.get("thumbnail_url") or photo

        poi_map[attr.id] = PoiSummary(
            id=attr.id,
            name=attr.name,
            category=attr.category or "attraction",
            cost_eur=float(attr.cost_eur or 0.0),
            duration_mins=int(attr.duration_mins or 60),
            lat=float(lat) if lat is not None else None,
            lng=float(lng) if lng is not None else None,
            photo_url=photo,
            thumbnail_url=thumb,
            rating=float(scoring.get("rating"))
            if scoring.get("rating") is not None
            else None,
            formatted_address=loc.get("address") or loc.get("formatted_address"),
            description=meta.get("description"),
        )

    # For any POI not found in attractions (e.g. transit stations or custom IDs)
    for pid in poi_ids:
        if pid not in poi_map:
            if pid.startswith("gtfs:") or pid.lower().startswith("osm-transit-"):
                label = pid.split(":")[-1] if ":" in pid else pid
                poi_map[pid] = PoiSummary(
                    id=pid,
                    name=f"Station {label}",
                    category="transit",
                    cost_eur=0.0,
                    duration_mins=15,
                )
            else:
                poi_map[pid] = PoiSummary(
                    id=pid,
                    name=f"Place {pid}",
                    category="attraction",
                    cost_eur=0.0,
                    duration_mins=60,
                )

    return poi_map


def _collection_to_response(
    col: TripCollectionModel,
    poi_map: dict[str, PoiSummary],
    trip_destination: str | None = None,
    trip_title: str | None = None,
) -> CollectionResponse:
    item_responses: list[CollectionItemResponse] = []
    for item in col.items:
        item_responses.append(
            CollectionItemResponse(
                id=item.id,
                collection_id=item.collection_id,
                poi_id=item.poi_id,
                notes=item.notes,
                order_index=item.order_index,
                created_at=(
                    item.created_at.isoformat()
                    if item.created_at
                    else datetime.now(timezone.utc).isoformat()
                ),
                poi=poi_map.get(item.poi_id),
            )
        )

    dest = trip_destination
    if not dest and "trip" in col.__dict__ and col.__dict__["trip"]:
        dest = getattr(col.__dict__["trip"], "destination", None)
    title = trip_title or dest

    return CollectionResponse(
        id=col.id,
        trip_id=col.trip_id,
        name=col.name,
        description=col.description,
        color=col.color or "#0F4C5C",
        created_at=(
            col.created_at.isoformat()
            if col.created_at
            else datetime.now(timezone.utc).isoformat()
        ),
        updated_at=(
            col.updated_at.isoformat()
            if col.updated_at
            else datetime.now(timezone.utc).isoformat()
        ),
        items_count=len(item_responses),
        items=item_responses,
        trip_destination=dest,
        trip_title=title,
    )


@router.get("/saved-collections", response_model=list[CollectionResponse])
async def list_all_saved_collections(
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    stmt = (
        select(TripCollectionModel)
        .outerjoin(TripModel, TripModel.id == TripCollectionModel.trip_id)
        .options(
            selectinload(TripCollectionModel.items),
            selectinload(TripCollectionModel.trip),
        )
        .order_by(TripCollectionModel.updated_at.desc())
    )
    res = await session.execute(stmt)
    collections = res.scalars().all()

    # Collect all unique POI IDs
    all_poi_ids: set[str] = set()
    for col in collections:
        for item in col.items:
            all_poi_ids.add(item.poi_id)

    poi_map = await _hydrate_poi_summaries(all_poi_ids, session)

    return [
        _collection_to_response(
            c,
            poi_map,
            trip_destination=c.trip.destination if getattr(c, "trip", None) else None,
            trip_title=c.trip.destination if getattr(c, "trip", None) else None,
        )
        for c in collections
    ]


@router.get("/{trip_id}/collections", response_model=list[CollectionResponse])
async def list_trip_collections(
    trip_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    stmt = (
        select(TripCollectionModel)
        .outerjoin(TripModel, TripModel.id == TripCollectionModel.trip_id)
        .options(
            selectinload(TripCollectionModel.items),
            selectinload(TripCollectionModel.trip),
        )
        .order_by(TripCollectionModel.created_at.asc())
    )
    res = await session.execute(stmt)
    collections = res.scalars().all()

    # Collect all unique POI IDs
    all_poi_ids: set[str] = set()
    for col in collections:
        for item in col.items:
            all_poi_ids.add(item.poi_id)

    poi_map = await _hydrate_poi_summaries(all_poi_ids, session)

    return [
        _collection_to_response(
            c,
            poi_map,
            trip_destination=c.trip.destination if getattr(c, "trip", None) else None,
            trip_title=c.trip.destination if getattr(c, "trip", None) else None,
        )
        for c in collections
    ]


@router.post(
    "/{trip_id}/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_trip_collection(
    trip_id: str,
    payload: CollectionCreate,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    trip = await _get_trip_or_404(
        trip_id, session, current_user, TripAccessLevel.EDITOR
    )

    collection_id = str(uuid.uuid4())
    col = TripCollectionModel(
        id=collection_id,
        trip_id=trip_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        color=payload.color or "#0F4C5C",
    )
    session.add(col)
    await session.commit()
    await session.refresh(col)

    # Empty collection response
    return _collection_to_response(
        col, {}, trip_destination=trip.destination, trip_title=trip.destination
    )


@router.put(
    "/{trip_id}/collections/{collection_id}",
    response_model=CollectionResponse,
)
async def update_trip_collection(
    trip_id: str,
    collection_id: str,
    payload: CollectionUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    stmt = (
        select(TripCollectionModel)
        .where(TripCollectionModel.id == collection_id)
        .options(
            selectinload(TripCollectionModel.items),
            selectinload(TripCollectionModel.trip),
        )
    )
    res = await session.execute(stmt)
    col = res.scalar_one_or_none()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    if payload.name is not None:
        col.name = payload.name.strip()
    if payload.description is not None:
        col.description = payload.description.strip() if payload.description else None
    if payload.color is not None:
        col.color = payload.color

    await session.commit()
    await session.refresh(col)

    all_poi_ids = {it.poi_id for it in col.items}
    poi_map = await _hydrate_poi_summaries(all_poi_ids, session)

    dest = col.trip.destination if getattr(col, "trip", None) else None
    return _collection_to_response(col, poi_map, trip_destination=dest, trip_title=dest)


@router.delete(
    "/{trip_id}/collections/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_trip_collection(
    trip_id: str,
    collection_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    stmt = select(TripCollectionModel).where(
        TripCollectionModel.id == collection_id,
    )
    res = await session.execute(stmt)
    col = res.scalar_one_or_none()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    await session.delete(col)
    await session.commit()
    return None


@router.post(
    "/{trip_id}/collections/{collection_id}/items",
    response_model=CollectionItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_item_to_collection(
    trip_id: str,
    collection_id: str,
    payload: AddItemRequest,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    col_stmt = select(TripCollectionModel).where(
        TripCollectionModel.id == collection_id,
    )
    col = (await session.execute(col_stmt)).scalar_one_or_none()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Check if item already exists in this collection
    existing_stmt = select(TripCollectionItemModel).where(
        TripCollectionItemModel.collection_id == collection_id,
        TripCollectionItemModel.poi_id == payload.poi_id,
    )
    existing_item = (await session.execute(existing_stmt)).scalar_one_or_none()
    if existing_item:
        if payload.notes is not None:
            existing_item.notes = payload.notes
            await session.commit()
            await session.refresh(existing_item)

        poi_map = await _hydrate_poi_summaries({existing_item.poi_id}, session)
        return CollectionItemResponse(
            id=existing_item.id,
            collection_id=existing_item.collection_id,
            poi_id=existing_item.poi_id,
            notes=existing_item.notes,
            order_index=existing_item.order_index,
            created_at=(
                existing_item.created_at.isoformat()
                if existing_item.created_at
                else datetime.now(timezone.utc).isoformat()
            ),
            poi=poi_map.get(existing_item.poi_id),
        )

    # Determine order index
    count_stmt = select(TripCollectionItemModel).where(
        TripCollectionItemModel.collection_id == collection_id
    )
    existing_count = len((await session.execute(count_stmt)).scalars().all())

    item = TripCollectionItemModel(
        id=str(uuid.uuid4()),
        collection_id=collection_id,
        poi_id=payload.poi_id,
        notes=payload.notes,
        order_index=payload.order_index
        if payload.order_index is not None
        else existing_count,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)

    poi_map = await _hydrate_poi_summaries({item.poi_id}, session)
    return CollectionItemResponse(
        id=item.id,
        collection_id=item.collection_id,
        poi_id=item.poi_id,
        notes=item.notes,
        order_index=item.order_index,
        created_at=(
            item.created_at.isoformat()
            if item.created_at
            else datetime.now(timezone.utc).isoformat()
        ),
        poi=poi_map.get(item.poi_id),
    )


@router.delete(
    "/{trip_id}/collections/{collection_id}/items/{poi_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_item_from_collection(
    trip_id: str,
    collection_id: str,
    poi_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    col_stmt = select(TripCollectionModel).where(
        TripCollectionModel.id == collection_id,
    )
    col = (await session.execute(col_stmt)).scalar_one_or_none()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    del_stmt = delete(TripCollectionItemModel).where(
        TripCollectionItemModel.collection_id == collection_id,
        TripCollectionItemModel.poi_id == poi_id,
    )
    await session.execute(del_stmt)
    await session.commit()
    return None


@router.get(
    "/{trip_id}/pois/{poi_id}/collections",
    response_model=PoiCollectionsResponse,
)
async def get_poi_collections(
    trip_id: str,
    poi_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    stmt = select(TripCollectionItemModel.collection_id).where(
        TripCollectionItemModel.poi_id == poi_id
    )
    res = await session.execute(stmt)
    c_ids = [str(row[0]) for row in res.fetchall()]

    return PoiCollectionsResponse(poi_id=poi_id, collection_ids=c_ids)


@router.post(
    "/{trip_id}/pois/{poi_id}/toggle",
    response_model=ToggleCollectionResponse,
)
async def toggle_poi_in_collection(
    trip_id: str,
    poi_id: str,
    payload: ToggleCollectionRequest,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    await _get_trip_or_404(trip_id, session, current_user)

    col_stmt = select(TripCollectionModel).where(
        TripCollectionModel.id == payload.collection_id,
    )
    col = (await session.execute(col_stmt)).scalar_one_or_none()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Check if item exists
    item_stmt = select(TripCollectionItemModel).where(
        TripCollectionItemModel.collection_id == payload.collection_id,
        TripCollectionItemModel.poi_id == poi_id,
    )
    item = (await session.execute(item_stmt)).scalar_one_or_none()

    if item:
        await session.delete(item)
        await session.commit()
        is_saved = False
    else:
        new_item = TripCollectionItemModel(
            id=str(uuid.uuid4()),
            collection_id=payload.collection_id,
            poi_id=poi_id,
            order_index=0,
        )
        session.add(new_item)
        await session.commit()
        is_saved = True

    # Get all active collection IDs for this POI across all shared collections
    active_stmt = select(TripCollectionItemModel.collection_id).where(
        TripCollectionItemModel.poi_id == poi_id
    )
    active_res = await session.execute(active_stmt)
    active_ids = [str(row[0]) for row in active_res.fetchall()]

    return ToggleCollectionResponse(
        poi_id=poi_id,
        collection_id=payload.collection_id,
        saved=is_saved,
        collection_ids=active_ids,
    )
