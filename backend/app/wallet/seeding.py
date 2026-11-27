import logging
import re
import uuid
from datetime import date, datetime, timedelta
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
    dt_str: str | None,
    iata_or_city: str | None,
    default_date: Any = None,
) -> tuple[datetime | None, str | None]:
    if not dt_str:
        return None, None

    raw = dt_str.strip()
    if default_date is not None and re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", raw):
        date_prefix: str | None = None
        if isinstance(default_date, (datetime, date)):
            date_prefix = default_date.strftime("%Y-%m-%d")
        elif isinstance(default_date, str):
            m = re.match(r"(\d{4}-\d{2}-\d{2})", default_date.strip())
            if m:
                date_prefix = m.group(1)
        if date_prefix:
            raw = f"{date_prefix} {raw}"

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
        dt, _ = parse_flexible_datetime(raw)
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

    scanned_docs = (
        itin.get("scanned_documents")
        or itin.get("wallet_documents")
        or itin.get("documents")
        or []
    )
    scanned_list = scanned_docs if isinstance(scanned_docs, list) else []
    scanned_flight_keys: set[tuple[str, str]] = set()
    scanned_flight_numbers: set[str] = set()
    has_scanned_hotel = False
    for doc in scanned_list:
        if not isinstance(doc, dict):
            continue
        dt = doc.get("ticket_type") or doc.get("document_type") or "other"
        dmeta = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
        if dt == "flight":
            d_orig = str(
                dmeta.get("origin_iata") or doc.get("origin_iata") or ""
            ).upper()
            d_dest = str(
                dmeta.get("destination_iata") or doc.get("destination_iata") or ""
            ).upper()
            d_num = (
                str(dmeta.get("flight_number") or doc.get("flight_number") or "")
                .strip()
                .upper()
            )
            if d_orig and d_dest:
                scanned_flight_keys.add((d_orig, d_dest))
            if d_num:
                scanned_flight_numbers.add(d_num)
        elif dt == "hotel":
            has_scanned_hotel = True

    # 1. Flights Extraction
    flight_records: list[dict[str, Any]] = []

    # Direct top-level flights
    if itin.get("outbound_flight"):
        f = itin["outbound_flight"]
        flight_records.append(
            {
                "flight": f,
                "ref": "flight:outbound",
                "default_direction": "arrival",
                "default_date": trip.start_date,
            }
        )
    if itin.get("inbound_flight") or itin.get("return_flight"):
        f = itin.get("inbound_flight") or itin.get("return_flight")
        flight_records.append(
            {
                "flight": f,
                "ref": "flight:return",
                "default_direction": "departure",
                "default_date": trip.end_date or trip.start_date,
            }
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
                {
                    "flight": day_f,
                    "ref": ref,
                    "default_direction": direction,
                    "default_date": day.get("date")
                    or (
                        trip.start_date
                        if d_idx == 0
                        else trip.end_date or trip.start_date
                    ),
                }
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

        norm_num = str(flight_num).strip().upper()
        if (str(orig).upper(), str(dest).upper()) in scanned_flight_keys or (
            norm_num and norm_num in scanned_flight_numbers
        ):
            continue

        key = f"{orig}-{dest}-{dep_str}"
        if key in seen_flights:
            continue
        seen_flights.add(key)

        default_dt = fr.get("default_date")
        start_dt, start_tz = _safe_parse_aware_datetime(
            dep_str, orig, default_date=default_dt
        )
        end_dt, end_tz = _safe_parse_aware_datetime(
            arr_str, dest, default_date=default_dt
        )
        if start_dt and end_dt and end_dt < start_dt:
            end_dt = end_dt + timedelta(days=1)

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

    if hotel_name and not has_scanned_hotel:
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
        if start_dt and end_dt and end_dt < start_dt:
            end_dt = end_dt + timedelta(days=1)

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


def _find_matching_existing_ticket(
    seed: dict[str, Any],
    existing_tickets: list[TripTicketModel],
    matched_ids: set[str],
) -> TripTicketModel | None:
    """Fallback matcher reconciling itinerary seeds with pre-seeded fixture tickets."""
    seed_type = seed.get("ticket_type")
    meta = seed.get("metadata") or {}
    if seed_type == "flight":
        fnum = str(meta.get("flight_number") or "").strip().upper()
        orig = str(meta.get("origin_iata") or "").strip().upper()
        dest = str(meta.get("destination_iata") or "").strip().upper()
        pnr = str(seed.get("reference_code") or "").strip().upper()
        for t in existing_tickets:
            if t.id in matched_ids or t.ticket_type != "flight":
                continue
            tmeta = t.ticket_metadata or {}
            t_fnum = str(tmeta.get("flight_number") or "").strip().upper()
            if fnum and (t_fnum == fnum or fnum in (t.title or "").upper()):
                return t
            t_orig = str(tmeta.get("origin_iata") or "").strip().upper()
            t_dest = str(tmeta.get("destination_iata") or "").strip().upper()
            t_pnr = str(t.reference_code or "").strip().upper()
            if (
                orig
                and dest
                and t_orig == orig
                and t_dest == dest
                and (not pnr or not t_pnr or pnr == t_pnr)
            ):
                return t
    elif seed_type == "hotel":
        provider_name = str(seed.get("provider") or "").strip().lower()
        if provider_name:
            for t in existing_tickets:
                if t.id in matched_ids or t.ticket_type != "hotel":
                    continue
                t_title = (t.title or "").strip().lower()
                t_prov = (t.provider or "").strip().lower()
                if (
                    provider_name in t_title
                    or t_title in provider_name
                    or provider_name == t_prov
                ):
                    return t
    return None


async def sync_trip_tickets(trip: TripModel, session: AsyncSession) -> dict[str, Any]:
    """
    Idempotent synchronization between itinerary_data and trip_tickets.
    Preserves user_modified tickets and reports drift if itinerary conflicts with user edits.
    """
    seeds, suggestions = extract_itinerary_seeds(trip)

    stmt = select(TripTicketModel).where(
        TripTicketModel.trip_id == trip.id,
        TripTicketModel.source.in_(["itinerary", "scan"]),
    )
    existing_tickets = list((await session.execute(stmt)).scalars().all())
    existing_by_ref = {t.source_ref: t for t in existing_tickets if t.source_ref}

    created_count = 0
    updated_count = 0
    drift_detected = False

    active_refs: set[str] = set()
    matched_ids: set[str] = set()

    for s in seeds:
        ref = s["source_ref"]
        active_refs.add(ref)
        existing = existing_by_ref.get(ref)
        if existing is None:
            existing = _find_matching_existing_ticket(s, existing_tickets, matched_ids)
        if existing is not None:
            matched_ids.add(existing.id)
            if existing.source_ref:
                active_refs.add(existing.source_ref)
            if existing.user_modified:
                # Check for drift (e.g. times or provider differed)
                if (
                    s["start_time"]
                    and existing.start_time
                    and s["start_time"] != existing.start_time
                ) or (s["title"] and s["title"] != existing.title):
                    drift_detected = True
                continue

            is_fixture_seed = bool(
                existing.source_ref and f"{trip.id}-tkt-" in existing.source_ref
            )
            # Update from fresh itinerary without clobbering richer pre-seeded fixture metadata
            if not is_fixture_seed or not existing.title:
                existing.title = s["title"]
            if not is_fixture_seed or not existing.provider:
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
            existing.ticket_metadata = {
                **(existing.ticket_metadata or {}),
                **(s["metadata"] or {}),
            }
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

    # Cleanup removed generated seeds only if not user-modified and has no attachments
    for ref, existing in existing_by_ref.items():
        is_generated_seed_ref = ref.startswith(
            ("day_", "flight:", "hotel:", "scanned:")
        )
        if (
            is_generated_seed_ref
            and existing.id not in matched_ids
            and ref not in active_refs
            and (
                existing.source == "itinerary"
                or (existing.source_ref or "").startswith("scanned:")
            )
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
