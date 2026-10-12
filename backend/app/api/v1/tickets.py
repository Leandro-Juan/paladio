import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_user
from app.db.models import UserModel
from app.db.session import get_db
from app.schemas.ticket import (
    AttractionSuggestion,
    ScanResponse,
    TripTicketCreate,
    TripTicketResponse,
    TripTicketsListResponse,
    TripTicketUpdate,
)
from app.services.wallet_storage import save_temp_upload
from app.wallet.scan import scan_ticket_document
from app.wallet.seeding import extract_itinerary_seeds, sync_trip_tickets
from app.wallet.service import (
    check_trip_access,
    create_ticket,
    delete_ticket,
    get_attachment_file,
    get_ticket,
    list_tickets,
    update_ticket,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{trip_id}/tickets",
    response_model=list[TripTicketResponse] | TripTicketsListResponse,
    summary="List tickets for a trip",
)
async def get_trip_tickets(
    trip_id: str,
    ticket_type: str | None = Query(None, alias="type"),
    status_filter: str | None = Query(None, alias="status"),
    include: str | None = Query(None),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    tickets = await list_tickets(
        trip_id, current_user, ticket_type, status_filter, session
    )

    if include == "suggestions":
        trip, _ = await check_trip_access(
            trip_id, current_user, session, require_write=False
        )
        _, suggestions = extract_itinerary_seeds(trip)
        return TripTicketsListResponse(
            tickets=tickets,
            suggestions=suggestions,
            has_drift=any(t.drift for t in tickets),
        )

    return tickets


@router.get(
    "/{trip_id}/tickets/suggestions",
    response_model=list[AttractionSuggestion],
    summary="Get non-persisted attraction ticket suggestions from itinerary",
)
async def get_ticket_suggestions(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    trip, _ = await check_trip_access(
        trip_id, current_user, session, require_write=False
    )
    _, suggestions = extract_itinerary_seeds(trip)
    return suggestions


@router.post(
    "/{trip_id}/tickets",
    response_model=TripTicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a ticket manually or from confirmed scan draft",
)
async def create_trip_ticket(
    trip_id: str,
    ticket_in: TripTicketCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    return await create_ticket(trip_id, ticket_in, current_user, session)


@router.get(
    "/{trip_id}/tickets/{ticket_id}",
    response_model=TripTicketResponse,
    summary="Get single ticket",
)
async def get_single_ticket(
    trip_id: str,
    ticket_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    return await get_ticket(trip_id, ticket_id, current_user, session)


@router.put(
    "/{trip_id}/tickets/{ticket_id}",
    response_model=TripTicketResponse,
    summary="Update an existing ticket",
)
async def update_trip_ticket(
    trip_id: str,
    ticket_id: str,
    ticket_in: TripTicketUpdate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    return await update_ticket(trip_id, ticket_id, ticket_in, current_user, session)


@router.delete(
    "/{trip_id}/tickets/{ticket_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete ticket and associated attachment files",
)
async def delete_trip_ticket(
    trip_id: str,
    ticket_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    await delete_ticket(trip_id, ticket_id, current_user, session)
    return {"status": "success", "message": "Ticket deleted"}


@router.post(
    "/{trip_id}/tickets/sync",
    summary="Idempotently reconcile tickets with trip itinerary_data",
)
async def sync_tickets_from_itinerary(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    trip, _ = await check_trip_access(
        trip_id, current_user, session, require_write=True
    )
    res = await sync_trip_tickets(trip, session)
    tickets = await list_tickets(trip_id, current_user, None, None, session)
    return {
        "status": "success",
        "created_count": res["created_count"],
        "updated_count": res["updated_count"],
        "has_drift": res["has_drift"],
        "tickets": tickets,
    }


@router.post(
    "/{trip_id}/tickets/scan",
    response_model=ScanResponse,
    summary="Scan document file or raw text to generate unpersisted ticket drafts",
)
async def scan_ticket(
    trip_id: str,
    file: UploadFile | None = File(None),
    raw_text: str | None = Form(None),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    trip, _ = await check_trip_access(
        trip_id, current_user, session, require_write=True
    )

    content: bytes
    filename = "document.txt"
    mime_type = "text/plain"

    if file:
        content = await file.read()
        filename = file.filename or "upload"
        mime_type = file.content_type or "application/octet-stream"
    elif raw_text and raw_text.strip():
        content = raw_text.encode("utf-8")
        filename = "pasted_text.txt"
        mime_type = "text/plain"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide an uploaded file or raw text to scan",
        )

    # Resolve trip start year for Julian date resolution
    trip_year = 2026
    if trip.start_date:
        try:
            trip_year = int(trip.start_date[:4])
        except Exception:
            pass

    try:
        drafts, excerpt = await scan_ticket_document(content, filename, trip_year)
    except ValueError as e:
        err_msg = str(e)
        if "maximum size limit" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=err_msg
            )
        if "Unsupported file format" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=err_msg
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
    except Exception as e:
        logger.error(f"Error scanning document: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to scan document: {e}",
        )

    # Stage upload in temp storage
    upload_id = await save_temp_upload(content, filename, mime_type)

    return ScanResponse(
        drafts=drafts,
        upload_id=upload_id,
        raw_text_excerpt=excerpt,
    )


@router.get(
    "/{trip_id}/tickets/{ticket_id}/attachments/{attachment_id}",
    summary="Download or stream an authenticated ticket attachment",
)
async def download_ticket_attachment(
    trip_id: str,
    ticket_id: str,
    attachment_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    file_path, filename, mime_type = await get_attachment_file(
        trip_id, ticket_id, attachment_id, current_user, session
    )

    response = FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=mime_type,
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response
