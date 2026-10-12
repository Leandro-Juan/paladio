import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wallet_encryption import decrypt_wallet_secret, encrypt_wallet_secret
from app.db.models import (
    TripModel,
    TripParticipantModel,
    TripTicketAttachmentModel,
    TripTicketModel,
    UserModel,
)
from app.schemas.ticket import (
    TripTicketAttachmentResponse,
    TripTicketCreate,
    TripTicketResponse,
    TripTicketUpdate,
    validate_type_metadata,
)
from app.services.wallet_storage import (
    delete_ticket_attachments_files,
    promote_temp_upload,
)


async def check_trip_access(
    trip_id: str,
    user: UserModel | None,
    session: AsyncSession,
    require_write: bool = False,
) -> tuple[TripModel, str]:
    stmt = select(TripModel).where(TripModel.id == trip_id)
    res = await session.execute(stmt)
    trip = res.scalar_one_or_none()
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )

    # Determine role
    user_role = "viewer"
    if not user:
        # Anonymous user / local dev mode: allow access if trip has no owner or guest access
        if trip.user_id is None:
            user_role = "organizer"
        else:
            user_role = "viewer"
    elif user.id == trip.user_id:
        user_role = "organizer"
    else:
        # Check participants
        stmt_p = select(TripParticipantModel).where(
            TripParticipantModel.trip_id == trip_id,
            TripParticipantModel.user_id == user.id,
        )
        p_res = await session.execute(stmt_p)
        participant = p_res.scalar_one_or_none()
        if participant:
            user_role = participant.role
        elif trip.user_id is None:
            user_role = "organizer"
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a collaborator on this trip",
            )

    if require_write and user_role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers have read-only access to tickets",
        )

    return trip, user_role


def serialize_ticket_model(ticket: TripTicketModel) -> TripTicketResponse:
    decrypted_access_code = decrypt_wallet_secret(ticket.access_code)
    decrypted_barcode = decrypt_wallet_secret(ticket.barcode_value)

    attachments_resp = [
        TripTicketAttachmentResponse(
            id=a.id,
            ticket_id=a.ticket_id,
            filename=a.filename,
            mime_type=a.mime_type,
            size_bytes=a.size_bytes,
            sha256=a.sha256,
            created_at=a.created_at.isoformat()
            if a.created_at
            else datetime.now(timezone.utc).isoformat(),
        )
        for a in (ticket.attachments or [])
    ]

    return TripTicketResponse(
        id=ticket.id,
        trip_id=ticket.trip_id,
        ticket_type=ticket.ticket_type,
        title=ticket.title,
        provider=ticket.provider,
        reference_code=ticket.reference_code,
        holder_name=ticket.holder_name,
        start_time=ticket.start_time.isoformat() if ticket.start_time else None,
        end_time=ticket.end_time.isoformat() if ticket.end_time else None,
        start_tz=ticket.start_tz,
        end_tz=ticket.end_tz,
        seat_or_room=ticket.seat_or_room,
        location_or_venue=ticket.location_or_venue,
        price=float(ticket.price) if ticket.price is not None else None,
        currency=ticket.currency or "EUR",
        status=ticket.status,
        access_code=decrypted_access_code,
        barcode_value=decrypted_barcode,
        barcode_format=ticket.barcode_format,
        metadata=ticket.ticket_metadata or {},
        notes=ticket.notes,
        source=ticket.source,
        source_ref=ticket.source_ref,
        user_modified=ticket.user_modified,
        visibility=ticket.visibility,
        holder_user_id=ticket.holder_user_id,
        created_by=ticket.created_by,
        pinned=ticket.pinned,
        drift=False,
        created_at=ticket.created_at.isoformat()
        if ticket.created_at
        else datetime.now(timezone.utc).isoformat(),
        updated_at=ticket.updated_at.isoformat()
        if ticket.updated_at
        else datetime.now(timezone.utc).isoformat(),
        attachments=attachments_resp,
    )


async def list_tickets(
    trip_id: str,
    user: UserModel | None,
    ticket_type: str | None,
    status_filter: str | None,
    session: AsyncSession,
) -> list[TripTicketResponse]:
    await check_trip_access(trip_id, user, session, require_write=False)

    stmt = (
        select(TripTicketModel)
        .where(TripTicketModel.trip_id == trip_id)
        .order_by(
            TripTicketModel.pinned.desc(), TripTicketModel.start_time.asc().nulls_last()
        )
    )

    if ticket_type:
        stmt = stmt.where(TripTicketModel.ticket_type == ticket_type)
    if status_filter:
        stmt = stmt.where(TripTicketModel.status == status_filter)

    res = await session.execute(stmt)
    tickets = res.scalars().all()

    # Filter private tickets
    out: list[TripTicketResponse] = []
    current_uid = user.id if user else None
    for t in tickets:
        if t.visibility == "private" and t.created_by and t.created_by != current_uid:
            continue
        out.append(serialize_ticket_model(t))

    return out


async def get_ticket(
    trip_id: str,
    ticket_id: str,
    user: UserModel | None,
    session: AsyncSession,
) -> TripTicketResponse:
    await check_trip_access(trip_id, user, session, require_write=False)

    stmt = select(TripTicketModel).where(
        TripTicketModel.id == ticket_id,
        TripTicketModel.trip_id == trip_id,
    )
    res = await session.execute(stmt)
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    current_uid = user.id if user else None
    if (
        ticket.visibility == "private"
        and ticket.created_by
        and ticket.created_by != current_uid
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    return serialize_ticket_model(ticket)


async def create_ticket(
    trip_id: str,
    data: TripTicketCreate,
    user: UserModel | None,
    session: AsyncSession,
) -> TripTicketResponse:
    await check_trip_access(trip_id, user, session, require_write=True)

    ticket_id = str(uuid.uuid4())
    enc_access = encrypt_wallet_secret(data.access_code)
    enc_barcode = encrypt_wallet_secret(data.barcode_value)

    new_ticket = TripTicketModel(
        id=ticket_id,
        trip_id=trip_id,
        ticket_type=data.ticket_type,
        title=data.title,
        provider=data.provider,
        reference_code=data.reference_code,
        holder_name=data.holder_name,
        start_time=data.start_time,
        end_time=data.end_time,
        start_tz=data.start_tz,
        end_tz=data.end_tz,
        seat_or_room=data.seat_or_room,
        location_or_venue=data.location_or_venue,
        price=data.price,
        currency=data.currency or "EUR",
        status=data.status,
        access_code=enc_access,
        barcode_value=enc_barcode,
        barcode_format=data.barcode_format,
        ticket_metadata=data.metadata or {},
        notes=data.notes,
        source=data.source,
        source_ref=data.source_ref,
        user_modified=True if data.source != "itinerary" else False,
        visibility=data.visibility,
        holder_user_id=data.holder_user_id,
        created_by=user.id if user else None,
        pinned=data.pinned,
    )
    session.add(new_ticket)
    await session.commit()
    await session.refresh(new_ticket)

    # If upload_id was passed, promote temporary upload
    if data.upload_id:
        await promote_temp_upload(data.upload_id, new_ticket.id, session)
        await session.refresh(new_ticket)

    return serialize_ticket_model(new_ticket)


async def update_ticket(
    trip_id: str,
    ticket_id: str,
    data: TripTicketUpdate,
    user: UserModel | None,
    session: AsyncSession,
) -> TripTicketResponse:
    await check_trip_access(trip_id, user, session, require_write=True)

    stmt = select(TripTicketModel).where(
        TripTicketModel.id == ticket_id,
        TripTicketModel.trip_id == trip_id,
    )
    res = await session.execute(stmt)
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    current_uid = user.id if user else None
    if (
        ticket.visibility == "private"
        and ticket.created_by
        and ticket.created_by != current_uid
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    update_dict = data.model_dump(exclude_unset=True)

    if "ticket_type" in update_dict and update_dict["ticket_type"] is not None:
        ticket.ticket_type = update_dict["ticket_type"]
    if "title" in update_dict and update_dict["title"] is not None:
        ticket.title = update_dict["title"]
    if "provider" in update_dict:
        ticket.provider = update_dict["provider"]
    if "reference_code" in update_dict:
        ticket.reference_code = update_dict["reference_code"]
    if "holder_name" in update_dict:
        ticket.holder_name = update_dict["holder_name"]
    if "start_time" in update_dict:
        ticket.start_time = update_dict["start_time"]
    if "end_time" in update_dict:
        ticket.end_time = update_dict["end_time"]
    if "start_tz" in update_dict:
        ticket.start_tz = update_dict["start_tz"]
    if "end_tz" in update_dict:
        ticket.end_tz = update_dict["end_tz"]
    if "seat_or_room" in update_dict:
        ticket.seat_or_room = update_dict["seat_or_room"]
    if "location_or_venue" in update_dict:
        ticket.location_or_venue = update_dict["location_or_venue"]
    if "price" in update_dict:
        ticket.price = update_dict["price"]
    if "currency" in update_dict and update_dict["currency"] is not None:
        ticket.currency = update_dict["currency"]
    if "status" in update_dict and update_dict["status"] is not None:
        ticket.status = update_dict["status"]
    if "access_code" in update_dict:
        ticket.access_code = encrypt_wallet_secret(update_dict["access_code"])
    if "barcode_value" in update_dict:
        ticket.barcode_value = encrypt_wallet_secret(update_dict["barcode_value"])
    if "barcode_format" in update_dict:
        ticket.barcode_format = update_dict["barcode_format"]
    if "metadata" in update_dict and update_dict["metadata"] is not None:
        ticket.ticket_metadata = validate_type_metadata(
            ticket.ticket_type, update_dict["metadata"]
        )
    if "notes" in update_dict:
        ticket.notes = update_dict["notes"]
    if "visibility" in update_dict and update_dict["visibility"] is not None:
        ticket.visibility = update_dict["visibility"]
    if "holder_user_id" in update_dict:
        ticket.holder_user_id = update_dict["holder_user_id"]
    if "pinned" in update_dict and update_dict["pinned"] is not None:
        ticket.pinned = update_dict["pinned"]

    ticket.user_modified = True
    await session.commit()
    await session.refresh(ticket)
    return serialize_ticket_model(ticket)


async def delete_ticket(
    trip_id: str,
    ticket_id: str,
    user: UserModel | None,
    session: AsyncSession,
) -> bool:
    await check_trip_access(trip_id, user, session, require_write=True)

    stmt = select(TripTicketModel).where(
        TripTicketModel.id == ticket_id,
        TripTicketModel.trip_id == trip_id,
    )
    res = await session.execute(stmt)
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    current_uid = user.id if user else None
    if (
        ticket.visibility == "private"
        and ticket.created_by
        and ticket.created_by != current_uid
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    await delete_ticket_attachments_files(ticket_id, session)
    await session.delete(ticket)
    await session.commit()
    return True


async def get_attachment_file(
    trip_id: str,
    ticket_id: str,
    attachment_id: str,
    user: UserModel | None,
    session: AsyncSession,
) -> tuple[Path, str, str]:
    await check_trip_access(trip_id, user, session, require_write=False)

    stmt = select(TripTicketModel).where(
        TripTicketModel.id == ticket_id,
        TripTicketModel.trip_id == trip_id,
    )
    t_res = await session.execute(stmt)
    ticket = t_res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    current_uid = user.id if user else None
    if (
        ticket.visibility == "private"
        and ticket.created_by
        and ticket.created_by != current_uid
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )

    att_stmt = select(TripTicketAttachmentModel).where(
        TripTicketAttachmentModel.id == attachment_id,
        TripTicketAttachmentModel.ticket_id == ticket_id,
    )
    att_res = await session.execute(att_stmt)
    attachment = att_res.scalar_one_or_none()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
        )

    file_path = Path(attachment.storage_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File on disk not found"
        )

    return file_path, attachment.filename, attachment.mime_type
