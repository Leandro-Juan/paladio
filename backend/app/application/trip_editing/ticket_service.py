from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import UserModel
from app.schemas.ticket import TripTicketCreate, TripTicketUpdate
from app.services.travel_document_scanner import scan_travel_document
from app.wallet.seeding import sync_trip_tickets
from app.wallet.service import (
    create_ticket as wallet_create_ticket,
    delete_ticket as wallet_delete_ticket,
    get_ticket as wallet_get_ticket,
    list_tickets as wallet_list_tickets,
    update_ticket as wallet_update_ticket,
)

logger = logging.getLogger(__name__)


def mask_secret(secret: Optional[str]) -> Optional[str]:
    """Masks secret barcodes, PNRs, or access codes (e.g. 'ZX••••9')."""
    if not secret:
        return None
    s = secret.strip()
    if len(s) <= 4:
        return "••••"
    return f"{s[:2]}••••{s[-2:]}"


class TicketService:
    """
    Trip tickets, bookings, and wallet services.
    Enforces privacy by redacting sensitive barcode values and access codes by default.
    """

    @classmethod
    async def list_tickets(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
        ticket_type: Optional[str] = None,
        redact_secrets: bool = True,
    ) -> list[dict[str, Any]]:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)
        raw_tickets = await wallet_list_tickets(
            trip_id=trip_id,
            user=user,
            ticket_type=ticket_type,
            status_filter=None,
            session=session,
        )

        serialized = []
        for t in raw_tickets:
            t_dict = t.model_dump(mode="json")
            if redact_secrets:
                t_dict["access_code"] = mask_secret(t_dict.get("access_code"))
                t_dict["barcode_value"] = mask_secret(t_dict.get("barcode_value"))
                t_dict["reference_code"] = mask_secret(t_dict.get("reference_code"))
            serialized.append(t_dict)
        return serialized

    @classmethod
    async def get_ticket(
        cls,
        trip_id: str,
        ticket_id: str,
        user: UserModel | None,
        session: AsyncSession,
        redact_secrets: bool = True,
    ) -> dict[str, Any]:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)
        ticket_resp = await wallet_get_ticket(trip_id, ticket_id, user, session)
        t_dict = ticket_resp.model_dump(mode="json")
        if redact_secrets:
            t_dict["access_code"] = mask_secret(t_dict.get("access_code"))
            t_dict["barcode_value"] = mask_secret(t_dict.get("barcode_value"))
            t_dict["reference_code"] = mask_secret(t_dict.get("reference_code"))
        return t_dict

    @classmethod
    async def create_ticket(
        cls,
        trip_id: str,
        ticket_in: TripTicketCreate,
        user: UserModel | None,
        session: AsyncSession,
    ) -> dict[str, Any]:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        created = await wallet_create_ticket(trip_id, ticket_in, user, session)
        return created.model_dump(mode="json")

    @classmethod
    async def update_ticket(
        cls,
        trip_id: str,
        ticket_id: str,
        ticket_update: TripTicketUpdate,
        user: UserModel | None,
        session: AsyncSession,
    ) -> dict[str, Any]:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        updated = await wallet_update_ticket(
            trip_id, ticket_id, ticket_update, user, session
        )
        return updated.model_dump(mode="json")

    @classmethod
    async def delete_ticket(
        cls,
        trip_id: str,
        ticket_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> None:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        await wallet_delete_ticket(trip_id, ticket_id, user, session)

    @classmethod
    async def parse_booking_text(
        cls,
        text_content: str,
    ) -> dict[str, Any]:
        """Parses booking email or pasted confirmation into drafts without writing tickets."""
        scan_result = await scan_travel_document(text_content)
        return scan_result.model_dump(mode="json")

    @classmethod
    async def sync_anchors_from_tickets(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> dict[str, Any]:
        """
        Synchronizes flight arrival/departure times and lodging depots
        from confirmed wallet tickets into the trip itinerary.
        """
        trip = await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        synced_count = await sync_trip_tickets(trip, session)
        return {"status": "success", "synced_tickets": synced_count}
