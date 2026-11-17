import logging
import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TripModel, TripTicketModel
from app.schemas.ticket import AttractionSuggestion
from app.services.airport_service import get_airport_service
from app.utils.timezone_utils import (
    get_timezone_for_city,
    parse_flexible_datetime,
)

logger = logging.getLogger(__name__)


def _make_aware(dt: datetime, tz: ZoneInfo) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(tz)
    return dt.replace(tzinfo=tz)


def _safe_parse_aware_datetime(
    dt_str: str | None, iata_or_city: str | None
) -> tuple[datetime | None, str | None]:
    if not dt_str:
        return None, None

    tz_info: ZoneInfo | None = None
    tz_str: str | None = None

    if iata_or_city:
        clean = iata_or_city.strip().upper()
        airport_svc = get_airport_service()
        if airport_svc.is_valid_iata(clean):
            ap = airport_svc.get_airport(clean)
            if ap and ap.timezone:
                tz_str = ap.timezone
                tz_info = ap.zoneinfo
        else:
            try:
                tz_info = get_timezone_for_city(iata_or_city)
                tz_str = str(tz_info)
            except Exception:
                pass

    if not tz_info:
        tz_info = ZoneInfo("UTC")
        tz_str = None

    try:
        dt, _ = parse_flexible_datetime(dt_str)
        return _make_aware(dt, tz_info), tz_str
    except Exception as e:
        logger.debug(f"Could not parse datetime string '{dt_str}': {e}")
        return None, None


def extract_itinerary_seeds(
    trip: TripModel,
) -> tuple[list[dict[str, Any]], list[AttractionSuggestion]]:
    """
    Extracts structured seeds for flights and hotels, and non-persisted suggestions for attractions.
    """
    seeds: list[dict[str, Any]] = []
    suggestions: list[AttractionSuggestion] = []

    itin = trip.itinerary_data if isinstance(trip.itinerary_data, dict) else {}
    raw_days = itin.get("days")
    days = raw_days if isinstance(raw_days, list) else []

    # 1. Flights Extraction
    flight_records: list[dict[str, Any]] = []

    # Direct top-level flights
    if itin.get("outbound_flight"):
        f = itin["outbound_flight"]
        flight_records.append(
            {"flight": f, "ref": "flight:outbound", "default_direction": "arrival"}
        )
    if itin.get("inbound_flight") or itin.get("return_flight"):
        f = itin.get("inbound_flight") or itin.get("return_flight")
        flight_records.append(
            {"flight": f, "ref": "flight:return", "default_direction": "departure"}
        )

    # Days flight_info
    for d_idx, day in enumerate(days):
        if not isinstance(day, dict):
            continue
        day_num = day.get("day", d_idx + 1)
        day_f = day.get("flight_info")
        if day_f:
            ref = f"day_{day_num}:flight_info"
            direction = day_f.get("direction") or (
                "arrival" if d_idx == 0 else "departure"
            )
            flight_records.append(
                {"flight": day_f, "ref": ref, "default_direction": direction}
            )

    # Deduplicate flights by (origin_iata, destination_iata, departure_time)
    seen_flights = set()
    for fr in flight_records:
        f = fr["flight"]
        if not isinstance(f, dict):
            continue
        orig = f.get("origin_iata") or "DEP"
        dest = f.get("destination_iata") or "ARR"
        dep_str = f.get("departure_time")
        arr_str = f.get("arrival_time")
        flight_num = f.get("flight_number") or f.get("airline") or ""
        airline_name = f.get("airline") or (
            f"Airline {flight_num}" if flight_num else None
        )

        key = f"{orig}-{dest}-{dep_str}"
        if key in seen_flights:
            continue
        seen_flights.add(key)

        start_dt, start_tz = _safe_parse_aware_datetime(dep_str, orig)
        end_dt, end_tz = _safe_parse_aware_datetime(arr_str, dest)

        title = f"{orig} → {dest} Flight"
        if flight_num:
            title = f"{flight_num} {orig} → {dest}"

        seeds.append(
            {
                "source_ref": fr["ref"],
                "ticket_type": "flight",
                "title": title,
                "provider": airline_name,
                "reference_code": f.get("pnr") or f.get("booking_ref"),
                "holder_name": f.get("holder_name") or f.get("passenger_name"),
                "start_time": start_dt,
                "end_time": end_dt,
                "start_tz": start_tz,
                "end_tz": end_tz,
                "seat_or_room": f.get("seat"),
                "location_or_venue": f"Airport {dest}",
                "status": f.get("status") or "planned",
                "barcode_value": f.get("barcode_value"),
                "barcode_format": f.get("barcode_format"),
                "source": "itinerary",
                "metadata": {
                    "airline_code": f.get("airline_code")
                    or (flight_num[:2] if len(flight_num) >= 2 else None),
                    "airline_name": airline_name,
                    "flight_number": flight_num,
                    "origin_iata": orig,
                    "destination_iata": dest,
                    "origin_city": f.get("origin_city"),
                    "destination_city": f.get("destination_city") or trip.destination,
                    "terminal": f.get("terminal"),
                    "gate": f.get("gate"),
                    "cabin_class": f.get("cabin_class", "Economy"),
                },
            }
        )

    # 2. Hotel Anchor Extraction
    hotel_info = itin.get("travel_constraints", {}).get("hotel") or itin.get("hotel")
    hotel_name = None
    hotel_address = None
    if isinstance(hotel_info, dict):
        hotel_name = hotel_info.get("name")
        hotel_address = hotel_info.get("address")

    # If no top-level hotel, look in POIs
    if not hotel_name:
        for day in days:
            path = day.get("itinerary", {}).get("path") or []
            for sp in path:
                p = sp.get("poi") or {}
                cat = str(p.get("category", "")).upper()
                name = p.get("name", "")
                if (
                    cat in ("HOTEL", "ACCOMMODATION", "LODGING")
                    or "hotel" in name.lower()
                ):
                    hotel_name = name
                    hotel_address = p.get("address")
                    break
            if hotel_name:
                break

    if hotel_name:
        dest_city = trip.destination or "Destination"
        h_dict = hotel_info if isinstance(hotel_info, dict) else {}
        cin_date = str(h_dict.get("check_in_date") or trip.start_date or "")[:10]
        cout_date = str(h_dict.get("check_out_date") or trip.end_date or "")[:10]
        cin_time = str(h_dict.get("check_in_time") or "15:00")[:5]
        cout_time = str(h_dict.get("check_out_time") or "11:00")[:5]
        start_dt, start_tz = _safe_parse_aware_datetime(
            f"{cin_date} {cin_time}:00", dest_city
        )
        end_dt, end_tz = _safe_parse_aware_datetime(
            f"{cout_date} {cout_time}:00", dest_city
        )

        seeds.append(
            {
                "source_ref": f"hotel:{hotel_name.lower().replace(' ', '_')[:32]}",
                "ticket_type": "hotel",
                "title": f"{hotel_name} Stay & Access",
                "provider": hotel_name,
                "reference_code": None,
                "start_time": start_dt,
                "end_time": end_dt,
                "start_tz": start_tz,
                "end_tz": end_tz,
                "seat_or_room": None,
                "location_or_venue": hotel_address or dest_city,
                "status": "planned",
                "metadata": {
                    "address": hotel_address or dest_city,
                    "checkin_time": cin_time,
                    "checkout_time": cout_time,
                    "check_in_date": cin_date,
                    "check_out_date": cout_date,
                },
                "source": "itinerary",
            }
        )

    # 3. Scanned Travel Documents Extraction
    scanned_docs = (
        itin.get("scanned_documents")
        or itin.get("wallet_documents")
        or itin.get("documents")
        or []
    )
    if isinstance(scanned_docs, list):
        for idx, doc in enumerate(scanned_docs):
            if not isinstance(doc, dict):
                continue
            doc_type = doc.get("ticket_type") or doc.get("document_type") or "other"
            ref_code = doc.get("reference_code") or doc.get("booking_reference")
            provider = doc.get("provider") or doc.get("carrier")
            title = doc.get("title") or f"Scanned {doc_type.title()}"
            holder_name = doc.get("holder_name")
            seat = doc.get("seat_or_room") or doc.get("seat")
            start_str = doc.get("start_time") or doc.get("departure_date")
            end_str = doc.get("end_time") or doc.get("return_date")

            city_context = (
                doc.get("metadata", {}).get("origin_iata")
                or doc.get("origin_city")
                or trip.destination
            )
            dest_context = (
                doc.get("metadata", {}).get("destination_iata")
                or doc.get("destination_city")
                or trip.destination
            )
            start_dt, start_tz = _safe_parse_aware_datetime(start_str, city_context)
            end_dt, end_tz = _safe_parse_aware_datetime(end_str, dest_context)

            source_ref = f"scanned:{doc_type}:{ref_code or idx}"

            meta = dict(doc.get("metadata") or {})
            for k in (
                "origin_iata",
                "destination_iata",
                "origin_city",
                "destination_city",
                "flight_number",
                "carrier",
                "seat",
                "flight_date",
                "departure_date",
                "departure_hour",
                "arrival_hour",
                "address",
            ):
                if k in doc and k not in meta and doc[k] is not None:
                    meta[k] = doc[k]

            seeds.append(
                {
                    "source_ref": source_ref,
                    "ticket_type": doc_type,
                    "title": title,
                    "provider": provider,
                    "reference_code": ref_code,
                    "holder_name": holder_name,
                    "start_time": start_dt,
                    "end_time": end_dt,
                    "start_tz": start_tz,
                    "end_tz": end_tz,
                    "seat_or_room": seat,
                    "location_or_venue": (
                        doc.get("location_or_venue")
                        or doc.get("hotel_address")
                        or (
                            f"Airport {meta.get('destination_iata')}"
                            if meta.get("destination_iata")
                            else trip.destination
                        )
                    ),
                    "status": doc.get("status") or "confirmed",
                    "barcode_value": doc.get("barcode_value"),
                    "barcode_format": doc.get("barcode_format"),
                    "metadata": meta,
                    "source": "scan",
                }
            )

    # 4. Attraction Suggestions Extraction (non-persisted)
    seen_pois = set()
    for d_idx, day in enumerate(days):
        day_num = day.get("day", d_idx + 1)
        path = day.get("itinerary", {}).get("path") or []
        for sp in path:
            p = sp.get("poi") or {}
            poi_id = str(p.get("id") or p.get("poi_id") or p.get("name") or "")
            name = p.get("name") or "Attraction"
            cat = str(p.get("category", "")).lower()
            if not poi_id or poi_id in seen_pois:
                continue

            # Check if likely requires ticket / pass
            if any(
                k in cat
                for k in (
                    "museum",
                    "monument",
                    "attraction",
                    "viewpoint",
                    "gallery",
                    "theatre",
                    "zoo",
                )
            ):
                seen_pois.add(poi_id)
                suggestions.append(
                    AttractionSuggestion(
                        poi_id=poi_id,
                        name=name,
                        category=cat,
                        city=trip.destination or "Destination",
                        cost_eur=float(p.get("cost_eur") or 0.0),
                        day=day_num,
                        suggested_time=sp.get("arrival_time")
                        or sp.get("scheduled_start"),
                    )
                )

    return seeds, suggestions


async def sync_trip_tickets(trip: TripModel, session: AsyncSession) -> dict[str, Any]:
    """
    Idempotent synchronization between itinerary_data and trip_tickets.
    Preserves user_modified tickets and reports drift if itinerary conflicts with user edits.
    """
    seeds, suggestions = extract_itinerary_seeds(trip)

    stmt = select(TripTicketModel).where(
        TripTicketModel.trip_id == trip.id,
        TripTicketModel.source == "itinerary",
    )
    existing_tickets = (await session.execute(stmt)).scalars().all()
    existing_by_ref = {t.source_ref: t for t in existing_tickets if t.source_ref}

    created_count = 0
    updated_count = 0
    drift_detected = False

    active_refs = set()

    for s in seeds:
        ref = s["source_ref"]
        active_refs.add(ref)
        if ref in existing_by_ref:
            existing = existing_by_ref[ref]
            if existing.user_modified:
                # Check for drift (e.g. times or provider differed)
                if (
                    s["start_time"]
                    and existing.start_time
                    and s["start_time"] != existing.start_time
                ) or (s["title"] and s["title"] != existing.title):
                    drift_detected = True
                continue

            # Update from fresh itinerary
            existing.title = s["title"]
            existing.provider = s["provider"]
            existing.reference_code = s.get("reference_code") or existing.reference_code
            existing.holder_name = s.get("holder_name") or existing.holder_name
            existing.start_time = s["start_time"]
            existing.end_time = s["end_time"]
            existing.start_tz = s["start_tz"]
            existing.end_tz = s["end_tz"]
            existing.seat_or_room = s.get("seat_or_room") or existing.seat_or_room
            existing.location_or_venue = s["location_or_venue"]
            existing.barcode_value = s.get("barcode_value") or existing.barcode_value
            existing.barcode_format = s.get("barcode_format") or existing.barcode_format
            existing.ticket_metadata = s["metadata"]
            updated_count += 1
        else:
            # Insert new seed ticket
            new_ticket = TripTicketModel(
                id=str(uuid.uuid4()),
                trip_id=trip.id,
                ticket_type=s["ticket_type"],
                title=s["title"],
                provider=s["provider"],
                reference_code=s["reference_code"],
                holder_name=s.get("holder_name"),
                start_time=s["start_time"],
                end_time=s["end_time"],
                start_tz=s["start_tz"],
                end_tz=s["end_tz"],
                seat_or_room=s["seat_or_room"],
                location_or_venue=s["location_or_venue"],
                price=None,
                currency="EUR",
                status=s.get("status", "planned"),
                barcode_value=s.get("barcode_value"),
                barcode_format=s.get("barcode_format"),
                ticket_metadata=s["metadata"],
                source=s.get("source", "itinerary"),
                source_ref=ref,
                user_modified=False,
                visibility="trip",
            )
            session.add(new_ticket)
            created_count += 1

    # Cleanup removed seeds only if not user-modified and has no attachments
    for ref, existing in existing_by_ref.items():
        if (
            ref not in active_refs
            and not existing.user_modified
            and not existing.attachments
        ):
            await session.delete(existing)

    await session.commit()

    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "has_drift": drift_detected,
        "suggestions": suggestions,
    }
