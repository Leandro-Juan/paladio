"""TripPackager engine assembling self-contained .trip archive containers."""

import hashlib
import json
import logging
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.db.models import (
    TripCollectionModel,
    TripExpenseModel,
    TripModel,
    TripParticipantModel,
    TripTicketModel,
)
from app.services.photo_storage import find_photo_file
from app.trip_package.sanitizer import TripSanitizer
from app.trip_package.schemas import (
    BoundingBox,
    FileManifestItem,
    GeneratorInfo,
    TripPackageManifest,
)

logger = logging.getLogger(__name__)

MIMETYPE_STR = "application/vnd.paladio.trip+zip"
PACKAGE_VERSION = "1.0.0"


class TripPackager:
    """Assembles a full-fidelity or sanitized .trip file package."""

    def __init__(
        self,
        trip: TripModel,
        participants: list[TripParticipantModel] | None = None,
        expenses: list[TripExpenseModel] | None = None,
        tickets: list[TripTicketModel] | None = None,
        collections: list[TripCollectionModel] | None = None,
        export_profile: str = "full_vault",
        include_attachments: bool = True,
        include_photos: bool = True,
    ) -> None:
        self.trip = trip
        self.participants = participants or []
        self.expenses = expenses or []
        self.tickets = tickets or []
        self.collections = collections or []
        self.export_profile = export_profile
        self.include_attachments = include_attachments
        self.include_photos = include_photos

    def build_itinerary_payload(self) -> dict[str, Any]:
        itin_data = (
            self.trip.itinerary_data
            if isinstance(self.trip.itinerary_data, dict)
            else {}
        )
        days = itin_data.get("days", [])
        routes = itin_data.get("routes", [])
        travel_constraints = itin_data.get("travel_constraints", {})

        return {
            "trip_id": self.trip.id,
            "destination": self.trip.destination,
            "start_date": self.trip.start_date,
            "end_date": self.trip.end_date,
            "days": days,
            "routes": routes,
            "travel_constraints": travel_constraints,
        }

    def build_wallet_payload(self) -> dict[str, Any]:
        itin_data = (
            self.trip.itinerary_data
            if isinstance(self.trip.itinerary_data, dict)
            else {}
        )
        booking_anchors = itin_data.get("booking_anchors", {})

        ticket_list = []
        attachment_manifest = []

        for t in self.tickets:
            t_dict = {
                "id": t.id,
                "ticket_type": t.ticket_type,
                "title": t.title,
                "provider": t.provider,
                "reference_code": t.reference_code,
                "holder_name": t.holder_name,
                "start_time": t.start_time.isoformat() if t.start_time else None,
                "end_time": t.end_time.isoformat() if t.end_time else None,
                "start_tz": t.start_tz,
                "end_tz": t.end_tz,
                "seat_or_room": t.seat_or_room,
                "location_or_venue": t.location_or_venue,
                "price": float(t.price) if t.price is not None else None,
                "currency": t.currency,
                "status": t.status,
                "access_code": t.access_code,
                "barcode_value": t.barcode_value,
                "barcode_format": t.barcode_format,
                "metadata": t.ticket_metadata or {},
                "notes": t.notes,
                "pinned": t.pinned,
            }
            ticket_list.append(t_dict)

            if self.include_attachments and hasattr(t, "attachments") and t.attachments:
                for att in t.attachments:
                    attachment_manifest.append(
                        {
                            "ticket_id": t.id,
                            "attachment_id": att.id,
                            "filename": att.filename,
                            "mime_type": att.mime_type,
                            "size_bytes": att.size_bytes,
                            "storage_path": att.storage_path,
                            "archive_path": f"attachments/tickets/{att.id}_{att.filename}",
                        }
                    )

        return {
            "tickets": ticket_list,
            "booking_anchors": booking_anchors,
            "attachments": attachment_manifest,
        }

    def build_expenses_payload(self) -> dict[str, Any]:
        participant_list = []
        for p in self.participants:
            participant_list.append(
                {
                    "id": p.id,
                    "user_id": p.user_id,
                    "name": p.name,
                    "email": p.email,
                    "role": p.role,
                }
            )

        expense_list = []
        for e in self.expenses:
            expense_list.append(
                {
                    "id": e.id,
                    "payer_id": e.payer_id,
                    "description": e.description,
                    "amount": float(e.amount) if e.amount is not None else 0.0,
                    "currency": e.currency,
                    "category": e.category,
                    "split_type": e.split_type,
                    "splits": e.splits or [],
                    "expense_date": e.expense_date,
                }
            )

        return {
            "currency": "EUR",
            "participants": participant_list,
            "expenses": expense_list,
            "settlement": {},
        }

    def build_collections_payload(self) -> dict[str, Any]:
        collection_list = []
        for col in self.collections:
            items = []
            if hasattr(col, "items") and col.items:
                for it in col.items:
                    items.append(
                        {
                            "id": it.id,
                            "poi_id": it.poi_id,
                            "notes": it.notes,
                            "order_index": getattr(it, "order_index", 0),
                        }
                    )
            collection_list.append(
                {
                    "id": col.id,
                    "name": col.name,
                    "description": col.description,
                    "color": col.color,
                    "items": items,
                }
            )

        return {
            "collections": collection_list,
            "notes": [],
        }

    def calculate_bounding_box(self, itinerary: dict[str, Any]) -> BoundingBox | None:
        lats: list[float] = []
        lons: list[float] = []

        days = itinerary.get("days", [])
        for day in days:
            slots = day.get("slots", []) if isinstance(day, dict) else []
            for slot in slots:
                if not isinstance(slot, dict):
                    continue
                # Activity coordinates
                coords = slot.get("coordinates") or slot.get("location") or {}
                if isinstance(coords, dict):
                    lat = coords.get("lat") or coords.get("latitude")
                    lon = (
                        coords.get("lon")
                        or coords.get("lng")
                        or coords.get("longitude")
                    )
                    if lat is not None and lon is not None:
                        try:
                            lats.append(float(lat))
                            lons.append(float(lon))
                        except (ValueError, TypeError):
                            pass

        if lats and lons:
            return BoundingBox(
                min_lat=round(min(lats), 6),
                max_lat=round(max(lats), 6),
                min_lon=round(min(lons), 6),
                max_lon=round(max(lons), 6),
            )
        return None

    def create_package(self, output_path: str | Path | None = None) -> Path:
        """Generates the .trip package file and returns its Path."""
        itinerary = self.build_itinerary_payload()
        wallet = self.build_wallet_payload()
        expenses = self.build_expenses_payload()
        collections = self.build_collections_payload()

        if self.export_profile == "community_shareable":
            itinerary, wallet, expenses, collections = (
                TripSanitizer.sanitize_for_sharing(
                    itinerary=itinerary,
                    wallet=wallet,
                    expenses=expenses,
                    collections=collections,
                )
            )

        if output_path is None:
            safe_dest = (
                "".join(
                    c for c in self.trip.destination if c.isalnum() or c in ("-", "_")
                ).strip()
                or "trip"
            )
            fd, tmp_file = tempfile.mkstemp(suffix=".trip", prefix=f"{safe_dest}_")
            os.close(fd)
            target = Path(tmp_file)
        else:
            target = Path(output_path)

        file_manifest: dict[str, FileManifestItem] = {}

        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            # 1. mimetype MUST be first and uncompressed (ZIP_STORED)
            mimetype_bytes = MIMETYPE_STR.encode("ascii")
            zf.writestr("mimetype", mimetype_bytes, compress_type=zipfile.ZIP_STORED)

            def _write_json_member(arcname: str, data: dict[str, Any]) -> None:
                encoded = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
                zf.writestr(arcname, encoded, compress_type=zipfile.ZIP_DEFLATED)
                sha = hashlib.sha256(encoded).hexdigest()
                file_manifest[arcname] = FileManifestItem(
                    sha256=sha, size_bytes=len(encoded)
                )

            # 2. Write core domain JSON payloads
            _write_json_member("itinerary.json", itinerary)
            _write_json_member("wallet.json", wallet)
            _write_json_member("expenses.json", expenses)
            _write_json_member("collections.json", collections)

            # 3. Write ticket attachments (only in full_vault profile)
            if (
                self.export_profile != "community_shareable"
                and self.include_attachments
            ):
                for att in wallet.get("attachments", []):
                    st_path = att.get("storage_path")
                    arc_path = att.get("archive_path")
                    if st_path and arc_path and os.path.exists(st_path):
                        with open(st_path, "rb") as f:
                            content = f.read()
                        zf.writestr(
                            arc_path, content, compress_type=zipfile.ZIP_DEFLATED
                        )
                        sha = hashlib.sha256(content).hexdigest()
                        file_manifest[arc_path] = FileManifestItem(
                            sha256=sha, size_bytes=len(content)
                        )

            # 4. Write photos (if present and requested)
            if self.include_photos:
                itin_raw = (
                    self.trip.itinerary_data
                    if isinstance(self.trip.itinerary_data, dict)
                    else {}
                )
                photos = itin_raw.get("photos", [])
                if isinstance(photos, list):
                    for p in photos:
                        photo_id = p.get("id") if isinstance(p, dict) else str(p)
                        if photo_id:
                            found = find_photo_file(self.trip.id, photo_id)
                            if found:
                                photo_path, _ = found
                                if photo_path.exists():
                                    arc_photo_name = (
                                        f"attachments/photos/{photo_path.name}"
                                    )
                                    with open(photo_path, "rb") as f:
                                        p_bytes = f.read()
                                    zf.writestr(
                                        arc_photo_name,
                                        p_bytes,
                                        compress_type=zipfile.ZIP_DEFLATED,
                                    )
                                    p_sha = hashlib.sha256(p_bytes).hexdigest()
                                    file_manifest[arc_photo_name] = FileManifestItem(
                                        sha256=p_sha, size_bytes=len(p_bytes)
                                    )

            # 5. Build and write root paladio.json manifest
            bbox = self.calculate_bounding_box(itinerary)
            manifest = TripPackageManifest(
                trip_id=self.trip.id,
                export_profile=self.export_profile,
                created_at=datetime.now(timezone.utc).isoformat(),
                title=itinerary.get("title") or self.trip.destination,
                destination=self.trip.destination,
                destination_timezone=None,
                start_date=self.trip.start_date,
                end_date=self.trip.end_date,
                bounding_box=bbox,
                file_manifest=file_manifest,
                generator=GeneratorInfo(
                    name="Paladio Backend", version=PACKAGE_VERSION
                ),
            )

            manifest_bytes = manifest.model_dump_json(by_alias=True, indent=2).encode(
                "utf-8"
            )
            zf.writestr(
                "paladio.json", manifest_bytes, compress_type=zipfile.ZIP_DEFLATED
            )

        return target
