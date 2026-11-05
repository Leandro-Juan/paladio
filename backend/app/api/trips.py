import json
import logging
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from datetime import date, datetime, timezone
from typing import Any

from app.api.deps import get_optional_user
from app.api.tickets import router as tickets_router
from app.api.collections import router as collections_router
from app.application.trip_editing.expense_service import ExpenseService
from app.application.trip_editing.participant_service import ParticipantService
from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import (
    TransitCacheModel,
    TransitCacheStatus,
    TripCollectionItemModel,
    TripCollectionModel,
    TripExpenseModel,
    TripModel,
    TripParticipantModel,
    TripRevisionModel,
    TripTicketModel,
    UserModel,
)
from app.db.session import get_db
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.services.travel_document_scanner import scan_travel_document
from app.services.airport_service import get_airport_service
from app.services.photo_storage import (
    save_trip_photo,
    find_photo_file,
    delete_photo_file,
)
from app.trip_package import (
    TripPackager,
    MIMETYPE_STR,
    TripUnpacker,
    TripPackageValidationError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class TransitStatusResponse(BaseModel):
    city: str
    gtfs_status: str
    is_ready: bool


class CityGtfsItem(BaseModel):
    city: str
    display_name: str
    status: str
    osm_status: str
    gtfs_status: str
    is_ready: bool
    is_building: bool
    is_queued: bool = False
    is_downloaded: bool
    is_compiled: bool
    has_feed: bool
    feed_url: str | None = None
    valid_until: str | None = None
    gtfs_feed_name: str | None = None
    updated_at: str | None = None


class GtfsRegistryResponse(BaseModel):
    has_active_process: bool
    active_processes_count: int
    active_cities: list[str]
    total_cities: int
    compiled_cities: int
    queued_cities: int = 0
    cities: list[CityGtfsItem]


class CompileCityRequest(BaseModel):
    city: str


class PlannedTripTransitItem(BaseModel):
    trip_id: str
    destination: str
    city_clean: str
    start_date: str
    end_date: str
    gtfs_status: str
    is_downloaded: bool
    is_building: bool
    is_queued: bool


class SyncPlannedGtfsRequest(BaseModel):
    cities: list[str]


class SyncPlannedGtfsResponse(BaseModel):
    triggered: list[str]
    queued: list[str]
    already_ready: list[str]
    message: str


class TripParticipantCreate(BaseModel):
    name: str
    user_id: str | None = None
    email: str | None = None
    role: str = "traveler"


class TripParticipantResponse(BaseModel):
    id: str
    trip_id: str
    user_id: str | None = None
    name: str
    email: str | None = None
    role: str = "traveler"
    created_at: str


class TripExpenseSplit(BaseModel):
    participant_id: str
    amount: float


class TripExpenseCreate(BaseModel):
    payer_id: str
    description: str
    amount: float
    currency: str = "EUR"
    category: str = "other"  # transport, accommodation, activities, food, other
    split_type: str = "equal"  # equal, custom
    splits: list[TripExpenseSplit] = []
    expense_date: str | None = None


class TripExpenseResponse(BaseModel):
    id: str
    trip_id: str
    payer_id: str
    payer_name: str | None = None
    description: str
    amount: float
    currency: str = "EUR"
    category: str = "other"
    split_type: str = "equal"
    splits: list[TripExpenseSplit] = []
    expense_date: str | None = None
    created_at: str


class SettlementTransfer(BaseModel):
    sender_id: str
    sender_name: str
    receiver_id: str
    receiver_name: str
    amount: float


class ParticipantBalance(BaseModel):
    participant_id: str
    name: str
    total_paid: float
    total_share: float
    net_balance: float


class TripSettlementResponse(BaseModel):
    trip_id: str
    total_expenses: float
    currency: str = "EUR"
    balances: list[ParticipantBalance]
    transfers: list[SettlementTransfer]
    simplified: bool = True


def _participant_to_response(p: TripParticipantModel) -> TripParticipantResponse:
    return TripParticipantResponse(
        id=p.id,
        trip_id=p.trip_id,
        user_id=p.user_id,
        name=p.name,
        email=p.email,
        role=p.role,
        created_at=p.created_at.isoformat()
        if p.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


async def _ensure_trip_participants(
    trip: TripModel, session: AsyncSession
) -> list[TripParticipantModel]:
    stmt_p = (
        select(TripParticipantModel)
        .where(TripParticipantModel.trip_id == trip.id)
        .order_by(TripParticipantModel.created_at.asc())
    )
    res_p = await session.execute(stmt_p)
    participants = list(res_p.scalars().all())

    if not participants:
        creator_name = "Traveler 1"
        creator_email = None
        if trip.user_id:
            user_res = await session.execute(
                select(UserModel).where(UserModel.id == trip.user_id)
            )
            user = user_res.scalar_one_or_none()
            if user:
                creator_name = user.username or "Traveler 1"
                creator_email = user.email

        first_p = TripParticipantModel(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            user_id=trip.user_id,
            name=creator_name,
            email=creator_email,
            role="organizer",
        )
        session.add(first_p)
        await session.commit()
        await session.refresh(first_p)
        participants = [first_p]

    return participants


class TripCreate(BaseModel):
    destination: str
    start_date: str
    end_date: str
    itinerary_data: dict[str, Any]


class TripUpdate(BaseModel):
    destination: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    itinerary_data: dict[str, Any] | None = None
    status: str | None = None
    revision: int | None = None


class TripResponse(TripCreate):
    id: str
    user_id: str | None = None
    created_at: str
    participants: list[TripParticipantResponse] = []
    tickets_count: int = 0
    destination_timezone: str | None = None
    status: str = "active"
    revision: int = 0


class TripPhotoResponse(BaseModel):
    id: str
    url: str
    filename: str | None = None
    width: int | None = None
    height: int | None = None
    aspect_ratio: float | None = None
    size_bytes: int | None = None
    mime_type: str | None = None
    media_type: str | None = None
    created_at: str | None = None


def _resolve_trip_timezone(trip: TripModel) -> str | None:
    try:
        from app.services.airport_service import get_airport_service

        svc = get_airport_service()
        itin = trip.itinerary_data if isinstance(trip.itinerary_data, dict) else {}
        tc = itin.get("travel_constraints") or {}
        dest_iata = tc.get("destination_iata")
        if dest_iata:
            tz = svc.get_timezone_from_iata(dest_iata).key
            if tz and tz != "UTC":
                return tz
        if trip.destination:
            aps = svc.get_airports_for_city(trip.destination)
            if aps and aps[0].timezone:
                return aps[0].timezone
    except Exception:
        pass
    return None


async def _get_trip_tickets_count(trip_id: str, session: AsyncSession) -> int:
    try:
        stmt = select(func.count(TripTicketModel.id)).where(
            TripTicketModel.trip_id == trip_id,
            TripTicketModel.status != "cancelled",
        )
        res = await session.execute(stmt)
        return int(res.scalar() or 0)
    except Exception:
        return 0


class BoardingPassScanResponse(BaseModel):
    document_type: str = "flight"
    origin_city: str | None = None
    origin_iata: str | None = None
    origin_airport: str | None = None
    destination_city: str | None = None
    destination_iata: str | None = None
    destination_airport: str | None = None
    departure_date: str | None = None
    return_date: str | None = None
    departure_hour: str | None = None
    arrival_hour: str | None = None
    flight_departure_hour: str | None = None
    flight_arrival_hour: str | None = None
    return_departure_hour: str | None = None
    return_arrival_hour: str | None = None
    flight_number: str | None = None
    carrier: str | None = None
    holder_name: str | None = None
    seat: str | None = None
    reference_code: str | None = None
    hotel_name: str | None = None
    hotel_address: str | None = None
    check_in_date: str | None = None
    check_out_date: str | None = None
    check_in_hour: str | None = None
    check_out_hour: str | None = None
    excerpt: str = ""
    drafts: list[dict[str, Any]] = []


@router.post(
    "/scan-boarding-pass",
    response_model=BoardingPassScanResponse,
    summary="Scan travel document (flight boarding pass or hotel booking) to extract origin, destination, dates, and hours",
)
async def scan_new_trip_boarding_pass(
    file: UploadFile | None = File(None),
    raw_text: str | None = Form(None),
):
    content: bytes
    filename = "document.txt"

    if file:
        content = await file.read()
        filename = file.filename or "upload"
    elif raw_text and raw_text.strip():
        content = raw_text.encode("utf-8")
        filename = "pasted_text.txt"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide an uploaded document (PDF, screenshot/image, pkpass) or raw text.",
        )

    if filename.lower().endswith(".trip"):
        fd, temp_pkg_path = tempfile.mkstemp(suffix=".trip")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(content)
            unpacker = TripUnpacker(temp_pkg_path)
            manifest = unpacker.inspect_manifest()
            with zipfile.ZipFile(temp_pkg_path, "r") as zf:
                itin = json.loads(zf.read("itinerary.json").decode("utf-8"))
                wallet = json.loads(zf.read("wallet.json").decode("utf-8"))

            anchors = (
                wallet.get("booking_anchors")
                or itin.get("travel_constraints", {}).get("booking_anchors")
                or {}
            )
            outbound = anchors.get("outbound_flight") or {}
            ret_flight = anchors.get("return_flight") or {}
            hotel = anchors.get("hotel") or {}

            return BoardingPassScanResponse(
                document_type="trip_package",
                origin_city=outbound.get("origin_city"),
                origin_iata=outbound.get("origin_iata"),
                origin_airport=outbound.get("origin_airport"),
                destination_city=manifest.destination,
                destination_iata=outbound.get("destination_iata"),
                departure_date=manifest.start_date,
                return_date=manifest.end_date,
                departure_hour="09:00",
                arrival_hour="20:00",
                flight_departure_hour=outbound.get("departure_time"),
                flight_arrival_hour=outbound.get("arrival_time"),
                return_departure_hour=ret_flight.get("departure_time"),
                return_arrival_hour=ret_flight.get("arrival_time"),
                flight_number=outbound.get("flight_number"),
                carrier=outbound.get("airline"),
                hotel_name=hotel.get("name"),
                hotel_address=hotel.get("address"),
                check_in_date=hotel.get("check_in_date") or manifest.start_date,
                check_out_date=hotel.get("check_out_date") or manifest.end_date,
                check_in_hour=hotel.get("check_in_time") or "15:00",
                excerpt=f"Extracted from {manifest.destination} (.trip package)",
                drafts=[],
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to scan .trip package: {e}",
            )
        finally:
            if os.path.exists(temp_pkg_path):
                os.unlink(temp_pkg_path)

    trip_year = datetime.now(timezone.utc).year
    try:
        drafts, excerpt = await scan_travel_document(content, filename, trip_year)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error scanning travel document: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to scan travel document: {e}",
        )

    document_type = "flight"
    origin_city = None
    origin_iata = None
    origin_airport = None
    destination_city = None
    destination_iata = None
    destination_airport = None
    departure_date = None
    return_date = None
    departure_hour = None
    arrival_hour = None
    flight_departure_hour = None
    flight_arrival_hour = None
    return_departure_hour = None
    return_arrival_hour = None
    flight_number = None
    carrier = None
    holder_name = None
    seat = None
    reference_code = None
    hotel_name = None
    hotel_address = None
    check_in_date = None
    check_out_date = None
    check_in_hour = None
    check_out_hour = None

    airport_svc = get_airport_service()

    flight_drafts = [d for d in drafts if d.ticket_type == "flight"]
    hotel_drafts = [d for d in drafts if d.ticket_type == "hotel"]

    if flight_drafts:
        document_type = "flight"
        first = flight_drafts[0]
        meta = first.metadata or {}
        origin_iata = meta.get("origin_iata")
        destination_iata = meta.get("destination_iata")
        origin_city = meta.get("origin_city") or (
            airport_svc.get_city_from_iata(origin_iata) if origin_iata else None
        )
        destination_city = meta.get("destination_city") or (
            airport_svc.get_city_from_iata(destination_iata)
            if destination_iata
            else None
        )

        if origin_iata:
            ap_orig = airport_svc.get_airport(origin_iata)
            if ap_orig:
                origin_airport = ap_orig.name
        if destination_iata:
            ap_dest = airport_svc.get_airport(destination_iata)
            if ap_dest:
                destination_airport = ap_dest.name

        flight_number = meta.get("flight_number") or first.title
        carrier = meta.get("carrier") or first.provider
        holder_name = first.holder_name
        seat = first.seat_or_room
        reference_code = first.reference_code

        dep_dt = (
            meta.get("flight_date") or meta.get("departure_date") or first.start_time
        )
        if dep_dt:
            departure_date = dep_dt.split("T")[0].split(" ")[0]

        flight_departure_hour = meta.get("flight_departure_hour")
        flight_arrival_hour = meta.get("flight_arrival_hour")
        return_departure_hour = meta.get("return_departure_hour")
        return_arrival_hour = meta.get("return_arrival_hour")

        return_date = meta.get("return_date")

        if len(flight_drafts) > 1:
            second = flight_drafts[1]
            ret_meta = second.metadata or {}
            ret_dt = (
                ret_meta.get("flight_date")
                or ret_meta.get("departure_date")
                or second.start_time
            )
            if ret_dt:
                return_date = ret_dt.split("T")[0].split(" ")[0]
            if not return_departure_hour:
                return_departure_hour = ret_meta.get("flight_departure_hour")
            if not return_arrival_hour:
                return_arrival_hour = ret_meta.get("flight_arrival_hour")

        # Trip start hour in destination: flight landing arrival time on Day 1
        departure_hour = (
            flight_arrival_hour
            or meta.get("departure_hour")
            or flight_departure_hour
            or "09:00"
        )
        # Trip end hour in destination: return flight takeoff departure time
        arrival_hour = return_departure_hour or meta.get("arrival_hour") or "20:00"

    elif hotel_drafts:
        document_type = "hotel"
        first_h = hotel_drafts[0]
        h_meta = first_h.metadata or {}

        hotel_name = h_meta.get("hotel_name") or first_h.title
        hotel_address = h_meta.get("address") or first_h.location_or_venue
        reference_code = first_h.reference_code
        destination_city = h_meta.get("destination_city")
        destination_iata = h_meta.get("destination_iata")

        if destination_iata:
            ap_dest = airport_svc.get_airport(destination_iata)
            if ap_dest:
                destination_airport = ap_dest.name
        elif destination_city:
            destination_iata = airport_svc.get_iata_from_city(destination_city)
            if destination_iata:
                ap_dest = airport_svc.get_airport(destination_iata)
                if ap_dest:
                    destination_airport = ap_dest.name

        check_in_date = h_meta.get("check_in_date")
        check_out_date = h_meta.get("check_out_date")
        check_in_hour = h_meta.get("check_in_hour") or "15:00"
        check_out_hour = h_meta.get("check_out_hour") or "11:00"

        departure_date = check_in_date
        return_date = check_out_date
        departure_hour = check_in_hour
        arrival_hour = check_out_hour

    today = datetime.now(timezone.utc).date()

    # Validate departure date
    if departure_date:
        try:
            dep_d = date.fromisoformat(departure_date.split("T")[0].split(" ")[0])
            if dep_d < today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The uploaded pass contains an invalid departure date ({departure_date}) that precedes the current date ({today.isoformat()}). Past dates cannot be used for trip creation.",
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The uploaded pass contains an unparseable departure date: {departure_date}.",
            )

    # Validate check-in date
    if check_in_date:
        try:
            cin_d = date.fromisoformat(check_in_date.split("T")[0].split(" ")[0])
            if cin_d < today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The uploaded pass contains an invalid check-in date ({check_in_date}) that precedes the current date ({today.isoformat()}). Past dates cannot be used for trip creation.",
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The uploaded pass contains an unparseable check-in date: {check_in_date}.",
            )

    # Validate return date
    if return_date:
        try:
            ret_d = date.fromisoformat(return_date.split("T")[0].split(" ")[0])
            if ret_d < today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The uploaded pass contains an invalid return date ({return_date}) that precedes the current date ({today.isoformat()}). Past dates cannot be used for trip creation.",
                )
            if departure_date:
                dep_d = date.fromisoformat(departure_date.split("T")[0].split(" ")[0])
                if ret_d < dep_d:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"The uploaded pass contains an invalid date range: return date ({return_date}) precedes departure date ({departure_date}).",
                    )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The uploaded pass contains an unparseable return date: {return_date}.",
            )

    # Validate check-out date
    if check_out_date:
        try:
            cout_d = date.fromisoformat(check_out_date.split("T")[0].split(" ")[0])
            if cout_d < today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The uploaded pass contains an invalid check-out date ({check_out_date}) that precedes the current date ({today.isoformat()}). Past dates cannot be used for trip creation.",
                )
            if check_in_date:
                cin_d = date.fromisoformat(check_in_date.split("T")[0].split(" ")[0])
                if cout_d < cin_d:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"The uploaded pass contains an invalid booking window: check-out date ({check_out_date}) precedes check-in date ({check_in_date}).",
                    )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The uploaded pass contains an unparseable check-out date: {check_out_date}.",
            )

    # Validate all draft start_times (attractions, events, other tickets)
    for d in drafts:
        if d.start_time:
            dt_part = d.start_time.split("T")[0].split(" ")[0]
            try:
                st_d = date.fromisoformat(dt_part)
                if st_d < today:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"The uploaded pass contains an invalid date ({dt_part}) that precedes the current date ({today.isoformat()}). Past dates cannot be used for trip creation.",
                    )
            except ValueError:
                pass

    return BoardingPassScanResponse(
        document_type=document_type,
        origin_city=origin_city,
        origin_iata=origin_iata,
        origin_airport=origin_airport,
        destination_city=destination_city,
        destination_iata=destination_iata,
        destination_airport=destination_airport,
        departure_date=departure_date,
        return_date=return_date,
        departure_hour=departure_hour,
        arrival_hour=arrival_hour,
        flight_departure_hour=flight_departure_hour,
        flight_arrival_hour=flight_arrival_hour,
        return_departure_hour=return_departure_hour,
        return_arrival_hour=return_arrival_hour,
        flight_number=flight_number,
        carrier=carrier,
        holder_name=holder_name,
        seat=seat,
        reference_code=reference_code,
        hotel_name=hotel_name,
        hotel_address=hotel_address,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        check_in_hour=check_in_hour,
        check_out_hour=check_out_hour,
        excerpt=excerpt,
        drafts=[d.model_dump() for d in drafts],
    )


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    trip: TripCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    itin_data = trip.itinerary_data
    if itin_data and isinstance(itin_data, dict):
        try:
            from app.services.transit_service import ensure_walking_legs_populated

            itin_data = await ensure_walking_legs_populated(
                itin_data, city=trip.destination or ""
            )
        except Exception as e:
            logger.warning(f"Could not ensure walking legs in create_trip: {e}")

    new_id = str(uuid.uuid4())
    db_trip = TripModel(
        id=new_id,
        user_id=current_user.id if current_user else None,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        itinerary_data=itin_data,
    )
    session.add(db_trip)
    await session.commit()
    await session.refresh(db_trip)

    # Seed initial participant (organizer) - creator is always initial participant
    organizer_name = (
        current_user.username
        if (current_user and current_user.username)
        else "Traveler 1"
    )
    first_p = TripParticipantModel(
        id=str(uuid.uuid4()),
        trip_id=db_trip.id,
        user_id=current_user.id if current_user else None,
        name=organizer_name,
        email=current_user.email if current_user else None,
        role="organizer",
    )
    session.add(first_p)

    # Seed any additional participants chosen at trip creation
    raw_participants = itin_data.get("participants") or itin_data.get(
        "travel_constraints", {}
    ).get("participants", [])
    if isinstance(raw_participants, list):
        for p in raw_participants:
            if not isinstance(p, dict):
                continue
            p_name = p.get("name", "").strip()
            p_uid = p.get("user_id")
            p_email = p.get("email")
            if not p_name:
                continue
            if current_user and p_uid == current_user.id:
                continue
            if p_name.lower() in (organizer_name.lower(), "you"):
                continue

            valid_user_id = None
            if p_uid:
                u_check = await session.execute(
                    select(UserModel.id).where(UserModel.id == p_uid)
                )
                if u_check.scalar_one_or_none():
                    valid_user_id = p_uid

            extra_p = TripParticipantModel(
                id=str(uuid.uuid4()),
                trip_id=db_trip.id,
                user_id=valid_user_id,
                name=p_name,
                email=p_email,
                role="traveler",
            )
            session.add(extra_p)

    await session.commit()
    await session.refresh(db_trip)

    # Auto-seed tickets from itinerary if any flights or hotels exist
    try:
        from app.wallet.seeding import sync_trip_tickets

        await sync_trip_tickets(db_trip, session)
    except Exception as e:
        logger.warning(f"Could not auto-seed tickets for trip {db_trip.id}: {e}")

    # Auto-trigger GTFS download for trip destination if needed
    if db_trip.destination:
        try:
            from app.tasks import async_trigger_city_gtfs_download_if_needed

            await async_trigger_city_gtfs_download_if_needed(
                city_name=db_trip.destination,
                trip_id=db_trip.id,
                session=session,
            )
        except Exception as e:
            logger.warning(
                f"Could not auto-trigger GTFS download for {db_trip.destination}: {e}"
            )

        # Auto-seed city POIs if needed (for blank trips or newly planned destinations)
        try:
            from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
            from app.engine.city_readiness import ensure_city_ready

            poi_repo = SqlPoiRepository(session)
            await ensure_city_ready(db_trip.destination, poi_repo)
        except Exception as e:
            logger.warning(f"Could not auto-seed POIs for {db_trip.destination}: {e}")

    t_count = await _get_trip_tickets_count(db_trip.id, session)

    all_p_res = await session.execute(
        select(TripParticipantModel)
        .where(TripParticipantModel.trip_id == db_trip.id)
        .order_by(TripParticipantModel.created_at.asc())
    )
    all_p = all_p_res.scalars().all()

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
        participants=[_participant_to_response(p) for p in all_p],
        tickets_count=t_count,
        status=getattr(db_trip, "status", "active") or "active",
    )


router.include_router(collections_router)


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
        part_models = await _ensure_trip_participants(t, session)
        parts = [_participant_to_response(p) for p in part_models]
        t_count = await _get_trip_tickets_count(t.id, session)
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
                participants=parts,
                tickets_count=t_count,
                destination_timezone=_resolve_trip_timezone(t),
                status=getattr(t, "status", "active") or "active",
            )
        )
    return response


@router.get("/transit-status", response_model=TransitStatusResponse)
async def get_transit_status_by_city(
    city: str = Query(..., description="Destination city name"),
    session: AsyncSession = Depends(get_db),
):
    city_clean = city.strip().lower()
    stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()

    gtfs_status = record.gtfs_status if record else "PENDING"
    is_ready = bool(record and record.gtfs_status == "READY")

    return TransitStatusResponse(
        city=city_clean,
        gtfs_status=gtfs_status,
        is_ready=is_ready,
    )


@router.get("/{trip_id}/transit-status", response_model=TransitStatusResponse)
async def get_transit_status_by_trip(
    trip_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(TripModel).where(TripModel.id == trip_id)
    res = await session.execute(stmt)
    trip = res.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    city = (trip.destination or "").strip().lower()
    stmt_cache = select(TransitCacheModel).where(TransitCacheModel.city == city)
    res_cache = await session.execute(stmt_cache)
    record = res_cache.scalar_one_or_none()

    gtfs_status = record.gtfs_status if record else "PENDING"
    is_ready = bool(record and record.gtfs_status == "READY")

    return TransitStatusResponse(
        city=city,
        gtfs_status=gtfs_status,
        is_ready=is_ready,
    )


@router.get("/transit/planned-status", response_model=list[PlannedTripTransitItem])
async def get_planned_trips_transit_status(
    session: AsyncSession = Depends(get_db),
):
    stmt = select(TripModel).order_by(TripModel.start_date.asc())
    res = await session.execute(stmt)
    trips = res.scalars().all()

    dest_cities = {
        re.sub(r"[^a-z0-9_-]", "", (t.destination or "").strip().lower())
        for t in trips
        if t.destination
    }

    cache_records = {}
    if dest_cities:
        stmt_cache = select(TransitCacheModel).where(
            TransitCacheModel.city.in_(dest_cities)
        )
        res_cache = await session.execute(stmt_cache)
        cache_records = {r.city.lower(): r for r in res_cache.scalars().all()}

    from app.tasks import is_transit_task_alive

    results: list[PlannedTripTransitItem] = []
    for t in trips:
        city_raw = t.destination or ""
        city_clean = re.sub(r"[^a-z0-9_-]", "", city_raw.strip().lower())
        rec = cache_records.get(city_clean)

        status_val = rec.status if rec else "PENDING"
        gtfs_status_val = rec.gtfs_status if rec else "PENDING"
        osm_status_val = rec.osm_status if rec else "PENDING"

        if rec and (
            gtfs_status_val in ("BUILDING", "QUEUED")
            or status_val in ("BUILDING", "QUEUED")
        ):
            if not is_transit_task_alive(city_clean):
                gtfs_status_val = "FAILED"
                status_val = "FAILED"

        is_queued = bool(gtfs_status_val == "QUEUED" or status_val == "QUEUED")
        is_building = not is_queued and (
            gtfs_status_val == "BUILDING"
            or status_val == "BUILDING"
            or osm_status_val == "BUILDING"
        )
        is_ready = bool(rec and gtfs_status_val == "READY")
        is_downloaded = is_ready

        effective_gtfs_status = gtfs_status_val
        if not rec:
            effective_gtfs_status = "NOT_DOWNLOADED"
        elif is_ready:
            effective_gtfs_status = "READY"
        elif is_building:
            effective_gtfs_status = "BUILDING"
        elif is_queued:
            effective_gtfs_status = "QUEUED"

        results.append(
            PlannedTripTransitItem(
                trip_id=t.id,
                destination=t.destination,
                city_clean=city_clean,
                start_date=t.start_date,
                end_date=t.end_date,
                gtfs_status=effective_gtfs_status,
                is_downloaded=is_downloaded,
                is_building=is_building,
                is_queued=is_queued,
            )
        )

    return results


@router.post("/transit/sync-planned", response_model=SyncPlannedGtfsResponse)
async def sync_planned_trips_gtfs(
    req: SyncPlannedGtfsRequest,
    session: AsyncSession = Depends(get_db),
):
    import os
    import redis
    from app.tasks import (
        _publish_transit_event,
        build_city_gtfs_task,
        is_transit_task_alive,
    )

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = None
    try:
        r = redis.from_url(redis_url)
    except Exception:
        pass

    triggered: list[str] = []
    queued: list[str] = []
    already_ready: list[str] = []

    unique_cities: list[str] = []
    for c in req.cities:
        cleaned = re.sub(r"[^a-z0-9_-]", "", c.strip().lower())
        if cleaned and cleaned not in unique_cities:
            unique_cities.append(cleaned)

    for city_clean in unique_cities:
        stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
        res = await session.execute(stmt)
        record = res.scalar_one_or_none()

        if record and record.gtfs_status == "READY":
            already_ready.append(city_clean)
            continue

        if record and record.gtfs_status in ("BUILDING", "QUEUED"):
            if is_transit_task_alive(city_clean):
                if record.gtfs_status == "QUEUED":
                    queued.append(city_clean)
                else:
                    triggered.append(city_clean)
                continue

        is_locked = False
        if r:
            try:
                is_locked = r.lock(
                    "paladio:transit_compiler_lock", timeout=7200
                ).locked()
            except Exception:
                pass

        stmt_active = select(TransitCacheModel).where(
            TransitCacheModel.city != city_clean,
            TransitCacheModel.gtfs_status.in_(["BUILDING", "QUEUED"]),
        )
        res_active = await session.execute(stmt_active)
        active_records = res_active.scalars().all()
        has_active_compilation = any(
            is_transit_task_alive(ar.city) for ar in active_records
        )

        should_queue = is_locked or has_active_compilation or len(triggered) > 0

        initial_status = (
            TransitCacheStatus.QUEUED.value
            if should_queue
            else TransitCacheStatus.BUILDING.value
        )
        initial_gtfs = "QUEUED" if should_queue else "BUILDING"

        if not record:
            record = TransitCacheModel(
                city=city_clean,
                status=initial_status,
                osm_status="PENDING",
                gtfs_status=initial_gtfs,
            )
            session.add(record)
        else:
            record.status = initial_status
            record.gtfs_status = initial_gtfs
        await session.commit()

        try:
            task = build_city_gtfs_task.delay(city_clean)
            if r:
                try:
                    r.set(f"paladio:transit_task_id:{city_clean}", task.id, ex=86400)
                except Exception:
                    pass
            if should_queue:
                _publish_transit_event("TRANSIT_QUEUED", city_clean, city_clean.title())
                queued.append(city_clean)
            else:
                _publish_transit_event(
                    "TRANSIT_DOWNLOAD_STARTED", city_clean, city_clean.title()
                )
                triggered.append(city_clean)
        except Exception as exc:
            logger.warning(f"Could not dispatch celery task for {city_clean}: {exc}")
            if should_queue:
                queued.append(city_clean)
            else:
                triggered.append(city_clean)

    total_initiated = len(triggered) + len(queued)
    msg = (
        f"GTFS compilation initiated for {total_initiated} cities ({len(triggered)} active, {len(queued)} queued)."
        if total_initiated > 0
        else "All selected trips already have GTFS data or are currently compiling."
    )

    return SyncPlannedGtfsResponse(
        triggered=triggered,
        queued=queued,
        already_ready=already_ready,
        message=msg,
    )


@router.get("/transit/registry", response_model=GtfsRegistryResponse)
async def get_transit_registry(session: AsyncSession = Depends(get_db)):
    stmt = select(TransitCacheModel).order_by(TransitCacheModel.city.asc())
    res = await session.execute(stmt)
    records = {r.city.lower(): r for r in res.scalars().all()}

    all_city_keys = sorted(records.keys())

    city_items: list[CityGtfsItem] = []
    active_cities: list[str] = []
    need_commit = False

    for city_key in all_city_keys:
        rec = records.get(city_key)
        has_feed = bool(
            rec
            and (
                rec.gtfs_status in ("READY", "BUILDING", "QUEUED") or rec.gtfs_feed_name
            )
        )
        feed_url = rec.gtfs_feed_name if rec else None

        status_val = rec.status if rec else "PENDING"
        osm_status_val = rec.osm_status if rec else "PENDING"
        gtfs_status_val = rec.gtfs_status if rec else "PENDING"

        # Reconcile stale/dead tasks
        if rec and (
            gtfs_status_val in ("BUILDING", "QUEUED")
            or status_val in ("BUILDING", "QUEUED")
        ):
            from app.tasks import is_transit_task_alive

            if not is_transit_task_alive(city_key):
                status_val = TransitCacheStatus.FAILED.value
                gtfs_status_val = "FAILED"
                rec.status = status_val
                rec.gtfs_status = gtfs_status_val
                session.add(rec)
                need_commit = True

        is_queued = bool(gtfs_status_val == "QUEUED" or status_val == "QUEUED")
        is_building = not is_queued and (
            gtfs_status_val == "BUILDING"
            or status_val == "BUILDING"
            or osm_status_val == "BUILDING"
        )
        is_ready = bool(gtfs_status_val == "READY")
        is_downloaded = is_ready
        is_compiled = bool(is_ready and status_val == "READY")

        display_name = city_key.title()
        if city_key == "oporto":
            display_name = "Porto (Oporto)"

        if is_building or is_queued:
            active_cities.append(display_name)

        is_failed = bool(gtfs_status_val == "FAILED" or status_val == "FAILED")
        is_unavailable = bool(gtfs_status_val == "UNAVAILABLE")

        # List cities that have transit state (compiled, building, queued, failed, or unavailable)
        if not (is_compiled or is_building or is_queued or is_failed or is_unavailable):
            continue

        valid_until_str = (
            rec.valid_until.isoformat() if rec and rec.valid_until else None
        )
        updated_at_str = rec.updated_at.isoformat() if rec and rec.updated_at else None

        city_items.append(
            CityGtfsItem(
                city=city_key,
                display_name=display_name,
                status=status_val,
                osm_status=osm_status_val,
                gtfs_status=gtfs_status_val,
                is_ready=is_ready,
                is_building=is_building,
                is_queued=is_queued,
                is_downloaded=is_downloaded,
                is_compiled=is_compiled,
                has_feed=has_feed,
                feed_url=feed_url,
                valid_until=valid_until_str,
                gtfs_feed_name=rec.gtfs_feed_name if rec else None,
                updated_at=updated_at_str,
            )
        )

    if need_commit:
        await session.commit()

    compiled_count = sum(1 for c in city_items if c.is_compiled)
    queued_count = sum(1 for c in city_items if c.is_queued)

    return GtfsRegistryResponse(
        has_active_process=len(active_cities) > 0,
        active_processes_count=len(active_cities),
        active_cities=active_cities,
        total_cities=len(city_items),
        compiled_cities=compiled_count,
        queued_cities=queued_count,
        cities=city_items,
    )


@router.post("/transit/compile")
async def trigger_city_gtfs_compile(
    req: CompileCityRequest,
    session: AsyncSession = Depends(get_db),
):
    city_clean = re.sub(r"[^a-z0-9_-]", "", req.city.strip().lower())
    from app.db.models import TransitCacheStatus

    import os
    import redis

    # Check if compiler lock is currently held to set initial status
    is_locked = False
    try:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        r.delete(f"paladio:transit_cancelled:{city_clean}")
        is_locked = r.lock("paladio:transit_compiler_lock", timeout=7200).locked()
    except (redis.RedisError, OSError):
        pass

    stmt_active = select(TransitCacheModel).where(
        TransitCacheModel.city != city_clean,
        TransitCacheModel.gtfs_status.in_(["BUILDING", "QUEUED"]),
    )
    res_active = await session.execute(stmt_active)
    active_records = res_active.scalars().all()
    from app.tasks import is_transit_task_alive

    has_active_compilation = any(
        is_transit_task_alive(ar.city) for ar in active_records
    )

    should_queue = is_locked or has_active_compilation

    initial_status = (
        TransitCacheStatus.QUEUED.value
        if should_queue
        else TransitCacheStatus.BUILDING.value
    )
    initial_gtfs = "QUEUED" if should_queue else "BUILDING"

    stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        record = TransitCacheModel(
            city=city_clean,
            status=initial_status,
            osm_status="PENDING",
            gtfs_status=initial_gtfs,
        )
        session.add(record)
    else:
        record.status = initial_status
        record.gtfs_status = initial_gtfs
    await session.commit()

    try:
        from app.tasks import _publish_transit_event, build_city_gtfs_task

        task = build_city_gtfs_task.delay(city_clean)
        try:
            r.set(f"paladio:transit_task_id:{city_clean}", task.id, ex=86400)
        except Exception:
            pass
        if should_queue:
            _publish_transit_event("TRANSIT_QUEUED", city_clean, req.city)
        else:
            _publish_transit_event("TRANSIT_DOWNLOAD_STARTED", city_clean, req.city)
    except (OSError, RuntimeError) as exc:
        logger.warning(f"Could not dispatch celery task for {city_clean}: {exc}")

    return {
        "status": "queued" if should_queue else "triggered",
        "city": city_clean,
        "message": (
            f"GTFS compilation queued for {city_clean}."
            if should_queue
            else f"GTFS download and compilation process initiated for {city_clean}."
        ),
    }


@router.delete("/transit/{city}")
async def delete_city_gtfs(
    city: str,
    session: AsyncSession = Depends(get_db),
):
    city_clean = re.sub(r"[^a-z0-9_-]", "", city.strip().lower())
    if not city_clean:
        raise HTTPException(status_code=400, detail="Invalid city name provided")

    import base64
    import json
    import os
    import redis
    from app.celery_app import app as celery_app
    from app.tasks import _publish_transit_event, cleanup_city_gtfs_resources

    # 1. Set cancellation flag in Redis with a 10-minute TTL so in-flight/queued workers halt immediately
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = None
    try:
        r = redis.from_url(redis_url)
        r.set(f"paladio:transit_cancelled:{city_clean}", "1", ex=600)
    except Exception as r_err:
        logger.warning(f"Error setting Redis cancellation for {city_clean}: {r_err}")

    # 2. Revoke Celery task ID if stored in Redis
    if r:
        try:
            task_id = r.get(f"paladio:transit_task_id:{city_clean}")
            if task_id:
                task_id_str = (
                    task_id.decode("utf-8", errors="ignore")
                    if isinstance(task_id, bytes)
                    else str(task_id)
                )
                celery_app.control.revoke(task_id_str, terminate=True, signal="SIGKILL")
                r.delete(f"paladio:transit_task_id:{city_clean}")
        except Exception as t_err:
            logger.warning(
                f"Error checking/revoking stored task_id for {city_clean}: {t_err}"
            )

    # 3. Purge queued tasks from the Redis `transit_build` queue directly
    if r:
        try:
            raw_tasks = r.lrange("transit_build", 0, -1)
            for raw_t in raw_tasks:
                try:
                    payload = json.loads(
                        raw_t.decode("utf-8") if isinstance(raw_t, bytes) else raw_t
                    )
                    headers = payload.get("headers", {})
                    task_id = headers.get("id")
                    argsrepr = headers.get("argsrepr", "")

                    is_match = False
                    if city_clean in argsrepr:
                        is_match = True
                    else:
                        body_raw = payload.get("body", "")
                        try:
                            decoded_body = base64.b64decode(body_raw).decode(
                                "utf-8", errors="ignore"
                            )
                            if city_clean in decoded_body:
                                is_match = True
                        except Exception:
                            pass

                    if is_match:
                        if task_id:
                            celery_app.control.revoke(
                                task_id, terminate=True, signal="SIGKILL"
                            )
                        r.lrem("transit_build", 0, raw_t)
                        logger.info(
                            f"Purged queued task {task_id} for {city_clean} from transit_build queue."
                        )
                except Exception as p_err:
                    logger.debug(
                        f"Error inspecting task in transit_build queue: {p_err}"
                    )
        except Exception as q_err:
            logger.warning(
                f"Error purging transit_build queue for {city_clean}: {q_err}"
            )

    # 4. Inspect active, reserved, and scheduled Celery tasks across all workers and revoke them
    try:
        inspect = celery_app.control.inspect(timeout=1.0)
        active_tasks = inspect.active() or {}
        reserved_tasks = inspect.reserved() or {}
        scheduled_tasks = inspect.scheduled() or {}
        for worker_tasks in [active_tasks, reserved_tasks, scheduled_tasks]:
            for _, tasks in worker_tasks.items():
                for t in tasks:
                    t_name = t.get("name", "")
                    if "transit" in t_name or "city" in t_name:
                        args = t.get("args", [])
                        if args and str(args[0]).strip().lower() == city_clean:
                            celery_app.control.revoke(
                                t.get("id"), terminate=True, signal="SIGKILL"
                            )
    except Exception as inspect_err:
        logger.warning(
            f"Could not inspect/revoke Celery tasks for {city_clean}: {inspect_err}"
        )

    # 5. Direct cleanup (filesystem, Valhalla docker container, Redis lock)
    try:
        cleanup_city_gtfs_resources(city_clean)
    except Exception as clean_err:
        logger.warning(f"Direct cleanup note for {city_clean}: {clean_err}")

    # Force release compiler lock if held for this city or if stale/orphaned
    if r:
        try:
            curr = r.get("paladio:transit_compiler_current_city")
            curr_str = (
                curr.decode("utf-8", errors="ignore")
                if isinstance(curr, bytes)
                else str(curr or "")
            )
            if curr_str == city_clean or not curr_str:
                r.delete("paladio:transit_compiler_lock")
                r.delete("paladio:transit_compiler_current_city")
        except Exception:
            pass

    # 6. Remove city record from database (TransitCacheModel)
    stmt = select(TransitCacheModel).where(TransitCacheModel.city == city_clean)
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    if record:
        await session.delete(record)
        await session.commit()

    # 7. Publish real-time telemetry event to Redis
    try:
        _publish_transit_event("TRANSIT_DELETED", city_clean, city.title())
    except Exception as pub_err:
        logger.warning(f"Could not publish TRANSIT_DELETED event: {pub_err}")

    # 8. Advance the queue for any remaining cities marked QUEUED
    try:
        from app.tasks import async_trigger_next_queued_city

        await async_trigger_next_queued_city(session=session)
    except Exception as q_adv_err:
        logger.warning(
            f"Could not advance queued cities after deleting {city_clean}: {q_adv_err}"
        )

    return {
        "status": "deleted",
        "city": city_clean,
        "message": f"GTFS data for {city_clean} was deleted and compilation stopped.",
    }


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

    parts_models = await _ensure_trip_participants(trip, session)
    parts = [_participant_to_response(p) for p in parts_models]
    t_count = await _get_trip_tickets_count(trip.id, session)

    if trip.itinerary_data and isinstance(trip.itinerary_data, dict):
        has_missing_geom = False
        raw_days = trip.itinerary_data.get("days")
        days = raw_days if isinstance(raw_days, list) else []
        for day_obj in days:
            if not isinstance(day_obj, dict):
                continue
            path = day_obj.get("itinerary", {}).get("path", [])
            for p in path:
                tr = p.get("transit_from_previous")
                if (
                    isinstance(tr, dict)
                    and tr.get("mode") in ("pedestrian", "walk")
                    and not tr.get("geometry")
                ):
                    has_missing_geom = True
                    break
            if has_missing_geom:
                break

        if has_missing_geom:
            try:
                from app.services.transit_service import ensure_walking_legs_populated
                import copy

                cloned_itin = copy.deepcopy(trip.itinerary_data)
                updated_itin = await ensure_walking_legs_populated(
                    cloned_itin, city=trip.destination or ""
                )
                trip.itinerary_data = updated_itin
                session.add(trip)
                await session.commit()
                await session.refresh(trip)
            except Exception as e:
                logger.warning(
                    f"Could not lazily enrich walking geometries for trip {trip.id}: {e}"
                )

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
        participants=parts,
        tickets_count=t_count,
        destination_timezone=_resolve_trip_timezone(trip),
        status=getattr(trip, "status", "active") or "active",
    )


@router.put("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: str,
    update_data: TripUpdate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    trip = await assert_trip_access(
        current_user, trip_id, TripAccessLevel.EDITOR, session
    )

    current_rev = trip.revision if trip.revision is not None else 0
    if update_data.revision is not None and update_data.revision != current_rev:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflict: Stale trip revision. Expected revision {current_rev}, got {update_data.revision}.",
        )

    before_itinerary = trip.itinerary_data

    if update_data.destination is not None:
        trip.destination = update_data.destination
    if update_data.start_date is not None:
        trip.start_date = update_data.start_date
    if update_data.end_date is not None:
        trip.end_date = update_data.end_date
    if update_data.status is not None:
        trip.status = update_data.status
    if update_data.itinerary_data is not None:
        itin_data = update_data.itinerary_data
        try:
            from app.services.transit_service import ensure_walking_legs_populated

            itin_data = await ensure_walking_legs_populated(
                itin_data, city=trip.destination or ""
            )
        except Exception as e:
            logger.warning(f"Could not ensure walking legs in update_trip: {e}")
        trip.itinerary_data = itin_data

    new_rev = current_rev + 1
    trip.revision = new_rev

    # Create revision record
    rev_record = TripRevisionModel(
        id=str(uuid.uuid4()),
        trip_id=trip.id,
        revision=new_rev,
        actor="user" if current_user else "system",
        actor_detail={"user_id": current_user.id} if current_user else None,
        before=before_itinerary if before_itinerary is not None else {},
        after=trip.itinerary_data if trip.itinerary_data is not None else {},
        summary="Updated trip via API",
    )
    session.add(rev_record)

    session.add(trip)
    await session.commit()
    await session.refresh(trip)

    parts_models = await _ensure_trip_participants(trip, session)
    parts = [_participant_to_response(p) for p in parts_models]
    t_count = await _get_trip_tickets_count(trip.id, session)

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
        participants=parts,
        tickets_count=t_count,
        status=getattr(trip, "status", "active") or "active",
        revision=trip.revision,
    )


@router.post("/{trip_id}/reoptimize", response_model=TripResponse)
async def reoptimize_trip_route(
    trip_id: str,
    update_data: TripUpdate | None = None,
    day: int | None = Query(
        None,
        description="Specific day number to re-optimize (1-indexed). If omitted, all days are re-optimized.",
    ),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    from app.services.trip_reoptimization_service import TripReoptimizationService

    current_itin = (
        update_data.itinerary_data
        if (update_data and update_data.itinerary_data is not None)
        else trip.itinerary_data
    )
    if not current_itin or not isinstance(current_itin, dict):
        raise HTTPException(
            status_code=400, detail="Trip has no valid itinerary data to re-optimize"
        )

    try:
        optimized_itin = await TripReoptimizationService.reoptimize_trip_itinerary(
            itinerary_data=current_itin,
            destination_city=trip.destination or "",
            target_day=day,
        )
        trip.itinerary_data = optimized_itin
        session.add(trip)
        await session.commit()
        await session.refresh(trip)
    except Exception as e:
        logger.error(f"Failed to re-optimize trip {trip_id} with C++ engine: {e}")
        raise HTTPException(
            status_code=500, detail=f"C++ Route Re-optimization failed: {e}"
        ) from e

    parts_models = await _ensure_trip_participants(trip, session)
    parts = [_participant_to_response(p) for p in parts_models]
    t_count = await _get_trip_tickets_count(trip.id, session)

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
        participants=parts,
        tickets_count=t_count,
    )


@router.get("/{trip_id}/participants", response_model=list[TripParticipantResponse])
async def list_trip_participants(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    participants = await ParticipantService.list_participants(
        trip_id, current_user, session
    )
    return [_participant_to_response(p) for p in participants]


@router.post(
    "/{trip_id}/participants",
    response_model=TripParticipantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_trip_participant(
    trip_id: str,
    participant_in: TripParticipantCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    # Prevent duplicate participants on this trip
    existing = await ParticipantService.list_participants(
        trip_id, current_user, session
    )
    if participant_in.user_id:
        for ep in existing:
            if ep.user_id and ep.user_id == participant_in.user_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"User is already a participant in this trip as '{ep.name}'.",
                )
    for ep in existing:
        if ep.name.strip().lower() == participant_in.name.strip().lower():
            raise HTTPException(
                status_code=400,
                detail=f"A participant with the name '{ep.name}' is already in this trip.",
            )

    new_p = await ParticipantService.add_participant(
        trip_id=trip_id,
        name=participant_in.name,
        user=current_user,
        session=session,
        email=participant_in.email,
        linked_user_id=participant_in.user_id,
        role=participant_in.role or "traveler",
    )
    return _participant_to_response(new_p)


@router.delete("/{trip_id}/participants/{participant_id}")
async def remove_trip_participant(
    trip_id: str,
    participant_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    res = await ParticipantService.remove_participant(
        trip_id, participant_id, current_user, session
    )
    return res


@router.get("/{trip_id}/expenses", response_model=list[TripExpenseResponse])
async def list_trip_expenses(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    expenses = await ExpenseService.list_expenses(trip_id, current_user, session)
    participants = await ParticipantService.list_participants(
        trip_id, current_user, session
    )
    p_map = {p.id: p.name for p in participants}

    return [
        TripExpenseResponse(
            id=e.id,
            trip_id=e.trip_id,
            payer_id=e.payer_id,
            payer_name=p_map.get(e.payer_id, "Unknown"),
            description=e.description,
            amount=e.amount,
            currency=e.currency,
            category=e.category,
            split_type=e.split_type,
            splits=[TripExpenseSplit(**s) for s in (e.splits or [])],
            expense_date=e.expense_date,
            created_at=e.created_at.isoformat()
            if e.created_at
            else datetime.now(timezone.utc).isoformat(),
        )
        for e in expenses
    ]


@router.post(
    "/{trip_id}/expenses",
    response_model=TripExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_trip_expense(
    trip_id: str,
    expense_in: TripExpenseCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    splits_data = (
        [s.model_dump() for s in expense_in.splits] if expense_in.splits else None
    )
    new_expense = await ExpenseService.add_expense(
        trip_id=trip_id,
        payer_id=expense_in.payer_id,
        amount=expense_in.amount,
        description=expense_in.description,
        user=current_user,
        session=session,
        currency=expense_in.currency or "EUR",
        category=expense_in.category or "other",
        split_type=expense_in.split_type or "equal",
        splits=splits_data,
        expense_date=expense_in.expense_date,
    )

    # Resolve payer name
    p_res = await session.execute(
        select(TripParticipantModel).where(
            TripParticipantModel.trip_id == trip_id,
            TripParticipantModel.id == new_expense.payer_id,
        )
    )
    payer = p_res.scalar_one_or_none()

    return TripExpenseResponse(
        id=new_expense.id,
        trip_id=new_expense.trip_id,
        payer_id=new_expense.payer_id,
        payer_name=payer.name if payer else "Unknown",
        description=new_expense.description,
        amount=new_expense.amount,
        currency=new_expense.currency,
        category=new_expense.category,
        split_type=new_expense.split_type,
        splits=[TripExpenseSplit(**s) for s in (new_expense.splits or [])],
        expense_date=new_expense.expense_date,
        created_at=new_expense.created_at.isoformat()
        if new_expense.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.put(
    "/{trip_id}/expenses/{expense_id}",
    response_model=TripExpenseResponse,
)
async def update_trip_expense(
    trip_id: str,
    expense_id: str,
    expense_in: TripExpenseCreate,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    splits_data = (
        [s.model_dump() for s in expense_in.splits] if expense_in.splits else None
    )
    updated = await ExpenseService.update_expense(
        trip_id=trip_id,
        expense_id=expense_id,
        user=current_user,
        session=session,
        amount=expense_in.amount,
        description=expense_in.description,
        payer_id=expense_in.payer_id,
        category=expense_in.category,
        currency=expense_in.currency,
        split_type=expense_in.split_type,
        splits=splits_data,
        expense_date=expense_in.expense_date,
    )

    p_res = await session.execute(
        select(TripParticipantModel).where(
            TripParticipantModel.trip_id == trip_id,
            TripParticipantModel.id == updated.payer_id,
        )
    )
    payer = p_res.scalar_one_or_none()

    return TripExpenseResponse(
        id=updated.id,
        trip_id=updated.trip_id,
        payer_id=updated.payer_id,
        payer_name=payer.name if payer else "Unknown",
        description=updated.description,
        amount=updated.amount,
        currency=updated.currency,
        category=updated.category,
        split_type=updated.split_type,
        splits=[TripExpenseSplit(**s) for s in (updated.splits or [])],
        expense_date=updated.expense_date,
        created_at=updated.created_at.isoformat()
        if updated.created_at
        else datetime.now(timezone.utc).isoformat(),
    )


@router.delete("/{trip_id}/expenses/{expense_id}")
async def delete_trip_expense(
    trip_id: str,
    expense_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    await ExpenseService.delete_expense(trip_id, expense_id, current_user, session)
    return {"status": "success", "message": "Expense deleted"}


@router.get("/{trip_id}/settlement", response_model=TripSettlementResponse)
async def get_trip_settlement(
    trip_id: str,
    simplify: bool = Query(
        True, description="Whether to simplify debts into minimal net transactions"
    ),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    res = await ExpenseService.get_settlement(
        trip_id=trip_id,
        user=current_user,
        session=session,
        simplify=simplify,
        target_currency="EUR",
    )

    balances = [ParticipantBalance(**b) for b in res["balances"]]
    transfers = [
        SettlementTransfer(
            sender_id=t["sender_id"],
            sender_name=t["sender_name"],
            receiver_id=t["receiver_id"],
            receiver_name=t["receiver_name"],
            amount=t["amount"],
        )
        for t in res["transfers"]
    ]

    return TripSettlementResponse(
        trip_id=trip_id,
        total_expenses=res["total_expenses"],
        currency=res["currency"],
        balances=balances,
        transfers=transfers,
        simplified=simplify,
    )


@router.delete("/{trip_id}")
async def delete_trip(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    await assert_trip_access(current_user, trip_id, TripAccessLevel.OWNER, session)
    await session.execute(delete(TripModel).where(TripModel.id == trip_id))
    await session.commit()
    return {"status": "success", "message": "Trip deleted"}


@router.post("/{trip_id}/upgrade-transit", response_model=TripResponse)
async def upgrade_trip_transit(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    from app.services.transit_service import TransitRoutingError
    from app.use_cases.upgrade_trip_transit import UpgradeTripTransitUseCase

    use_case = UpgradeTripTransitUseCase(session)
    try:
        await use_case.execute(trip_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TransitRoutingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

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
        tickets_count=await _get_trip_tickets_count(trip.id, session),
    )


@router.post("/{trip_id}/photos", response_model=list[TripPhotoResponse])
async def upload_trip_photos(
    trip_id: str,
    files: list[UploadFile] = File(...),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    itin_data = (
        dict(trip.itinerary_data) if isinstance(trip.itinerary_data, dict) else {}
    )
    existing_photos = itin_data.get("photos")
    if not isinstance(existing_photos, list):
        existing_photos = []

    uploaded_photos = []
    for file in files:
        if not file.filename:
            continue
        content = await file.read()
        if not content:
            continue
        mime_type = file.content_type or "image/jpeg"
        photo_meta = await save_trip_photo(
            trip_id=trip_id,
            content=content,
            original_filename=file.filename,
            mime_type=mime_type,
        )
        photo_item = {
            "id": photo_meta["id"],
            "url": photo_meta["url"],
            "filename": photo_meta["filename"],
            "width": photo_meta["width"],
            "height": photo_meta["height"],
            "aspect_ratio": photo_meta["aspect_ratio"],
            "size_bytes": photo_meta["size_bytes"],
            "mime_type": photo_meta["mime_type"],
            "media_type": photo_meta.get("media_type", "image"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        uploaded_photos.append(photo_item)
        existing_photos.append(photo_item)

    itin_data["photos"] = existing_photos
    trip.itinerary_data = itin_data
    session.add(trip)
    await session.commit()
    await session.refresh(trip)

    return [TripPhotoResponse(**p) for p in uploaded_photos]


@router.get("/{trip_id}/photos/{photo_id}")
async def get_trip_photo(
    trip_id: str,
    photo_id: str,
):
    found = find_photo_file(trip_id, photo_id)
    if not found:
        raise HTTPException(status_code=404, detail="Photo not found")
    file_path, mime_type = found

    response = FileResponse(
        path=str(file_path),
        media_type=mime_type,
        filename=file_path.name,
    )
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Accept-Ranges"] = "bytes"
    return response


@router.delete("/{trip_id}/photos/{photo_id}")
async def delete_trip_photo(
    trip_id: str,
    photo_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    itin_data = (
        dict(trip.itinerary_data) if isinstance(trip.itinerary_data, dict) else {}
    )
    existing_photos = itin_data.get("photos")
    if isinstance(existing_photos, list):
        updated_photos = [
            p
            for p in existing_photos
            if (
                isinstance(p, dict)
                and p.get("id") != photo_id
                and photo_id not in str(p.get("url", ""))
            )
            or (isinstance(p, str) and photo_id not in p)
        ]
        itin_data["photos"] = updated_photos
        trip.itinerary_data = itin_data
        session.add(trip)
        await session.commit()

    delete_photo_file(trip_id, photo_id)
    return {"status": "ok", "deleted": photo_id}


@router.get("/{trip_id}/export")
async def export_trip(
    trip_id: str,
    background_tasks: BackgroundTasks,
    profile: str = Query("full_vault", pattern="^(full_vault|community_shareable)$"),
    include_attachments: bool = Query(True),
    include_photos: bool = Query(True),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Exports a trip as a self-contained, air-gappable .trip file.
    Supports 'full_vault' (all data & attachments) and 'community_shareable' (sanitized).
    """
    result = await session.execute(select(TripModel).where(TripModel.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip with ID {trip_id} not found",
        )

    res_p = await session.execute(
        select(TripParticipantModel).where(TripParticipantModel.trip_id == trip_id)
    )
    participants = list(res_p.scalars().all())

    res_e = await session.execute(
        select(TripExpenseModel).where(TripExpenseModel.trip_id == trip_id)
    )
    expenses = list(res_e.scalars().all())

    res_t = await session.execute(
        select(TripTicketModel).where(TripTicketModel.trip_id == trip_id)
    )
    tickets = list(res_t.scalars().all())

    res_c = await session.execute(
        select(TripCollectionModel).where(TripCollectionModel.trip_id == trip_id)
    )
    collections = list(res_c.scalars().all())

    packager = TripPackager(
        trip=trip,
        participants=participants,
        expenses=expenses,
        tickets=tickets,
        collections=collections,
        export_profile=profile,
        include_attachments=include_attachments,
        include_photos=include_photos,
    )

    package_path = packager.create_package()

    background_tasks.add_task(os.unlink, str(package_path))

    safe_dest = (
        re.sub(r"[^\w\s-]", "", trip.destination).strip().replace(" ", "_") or "trip"
    )
    filename = f"{safe_dest}_{trip.start_date}.trip"

    return FileResponse(
        path=package_path,
        media_type=MIMETYPE_STR,
        filename=filename,
    )


@router.post(
    "/import", response_model=TripResponse, status_code=status.HTTP_201_CREATED
)
async def import_trip(
    file: UploadFile = File(...),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Imports a full .trip archive, unpacking and reconstructing the trip,
    schedule, tickets, expenses, and collections in PostgreSQL.
    """
    if not file.filename or not file.filename.lower().endswith(".trip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a .trip extension",
        )

    fd, temp_pkg_path = tempfile.mkstemp(suffix=".trip")
    temp_dir = tempfile.mkdtemp(prefix="paladio_trip_import_")
    try:
        content = await file.read()
        with os.fdopen(fd, "wb") as f:
            f.write(content)

        unpacker = TripUnpacker(temp_pkg_path)
        unpacked = unpacker.unpack(extract_to_dir=temp_dir)

        manifest = unpacked["manifest"]
        itinerary = unpacked["itinerary"]
        wallet = unpacked["wallet"]
        expenses = unpacked["expenses"]
        collections = unpacked["collections"]

        new_trip_id = str(uuid.uuid4())
        user_id = current_user.id if current_user else None

        # Build TripModel
        db_trip = TripModel(
            id=new_trip_id,
            user_id=user_id,
            destination=manifest.destination,
            start_date=manifest.start_date,
            end_date=manifest.end_date,
            itinerary_data=itinerary,
            status="active",
        )
        session.add(db_trip)
        await session.flush()

        # Seed participants
        participant_id_map: dict[str, str] = {}
        participants_data = expenses.get("participants", [])
        if not participants_data:
            organizer_name = (
                current_user.username
                if (current_user and current_user.username)
                else "Traveler 1"
            )
            first_p = TripParticipantModel(
                id=str(uuid.uuid4()),
                trip_id=new_trip_id,
                user_id=user_id,
                name=organizer_name,
                email=current_user.email if current_user else None,
                role="organizer",
            )
            session.add(first_p)
            await session.flush()
        else:
            for p in participants_data:
                old_pid = p.get("id")
                new_pid = str(uuid.uuid4())
                if old_pid:
                    participant_id_map[old_pid] = new_pid

                is_user_org = p.get("role") == "organizer" and current_user
                p_uid = current_user.id if is_user_org else None
                p_email = current_user.email if is_user_org else p.get("email")
                p_name = (
                    current_user.username
                    if is_user_org and current_user.username
                    else p.get("name", "Traveler")
                )

                db_part = TripParticipantModel(
                    id=new_pid,
                    trip_id=new_trip_id,
                    user_id=p_uid,
                    name=p_name,
                    email=p_email,
                    role=p.get("role", "traveler"),
                )
                session.add(db_part)
            await session.flush()

        # Seed expenses
        for exp in expenses.get("expenses", []):
            mapped_payer_id = participant_id_map.get(
                exp.get("payer_id"), exp.get("payer_id")
            )
            mapped_splits = []
            for s in exp.get("splits", []):
                s_copy = dict(s)
                if "participant_id" in s_copy:
                    s_copy["participant_id"] = participant_id_map.get(
                        s_copy["participant_id"], s_copy["participant_id"]
                    )
                mapped_splits.append(s_copy)

            db_expense = TripExpenseModel(
                id=str(uuid.uuid4()),
                trip_id=new_trip_id,
                payer_id=mapped_payer_id,
                description=exp.get("description", "Imported expense"),
                amount=exp.get("amount", 0.0),
                currency=exp.get("currency", "EUR"),
                category=exp.get("category", "other"),
                split_type=exp.get("split_type", "equal"),
                splits=mapped_splits,
                expense_date=exp.get("expense_date"),
            )
            session.add(db_expense)

        # Seed tickets
        for t in wallet.get("tickets", []):
            db_ticket = TripTicketModel(
                id=str(uuid.uuid4()),
                trip_id=new_trip_id,
                ticket_type=t.get("ticket_type", "other"),
                title=t.get("title", "Imported Ticket"),
                provider=t.get("provider"),
                reference_code=t.get("reference_code"),
                holder_name=t.get("holder_name"),
                seat_or_room=t.get("seat_or_room"),
                location_or_venue=t.get("location_or_venue"),
                price=t.get("price"),
                currency=t.get("currency", "EUR"),
                status=t.get("status", "planned"),
                access_code=t.get("access_code"),
                barcode_value=t.get("barcode_value"),
                barcode_format=t.get("barcode_format"),
                ticket_metadata=t.get("metadata", {}),
                notes=t.get("notes"),
                pinned=t.get("pinned", False),
            )
            session.add(db_ticket)

        # Seed collections
        for col in collections.get("collections", []):
            new_col_id = str(uuid.uuid4())
            db_col = TripCollectionModel(
                id=new_col_id,
                trip_id=new_trip_id,
                name=col.get("name", "Favorites"),
                description=col.get("description"),
                color=col.get("color", "#0F4C5C"),
            )
            session.add(db_col)
            await session.flush()

            for it in col.get("items", []):
                db_item = TripCollectionItemModel(
                    id=str(uuid.uuid4()),
                    collection_id=new_col_id,
                    poi_id=it.get("poi_id", ""),
                    notes=it.get("notes"),
                    order_index=it.get("order_index", 0),
                )
                session.add(db_item)

        await session.commit()
        await session.refresh(db_trip)

        t_count = await _get_trip_tickets_count(db_trip.id, session)
        all_p_res = await session.execute(
            select(TripParticipantModel)
            .where(TripParticipantModel.trip_id == db_trip.id)
            .order_by(TripParticipantModel.created_at.asc())
        )
        all_p = all_p_res.scalars().all()

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
            participants=[_participant_to_response(p) for p in all_p],
            tickets_count=t_count,
            status=getattr(db_trip, "status", "active") or "active",
        )
    except TripPackageValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid .trip package: {e}",
        )
    finally:
        if os.path.exists(temp_pkg_path):
            os.unlink(temp_pkg_path)
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


router.include_router(tickets_router)
