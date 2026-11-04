"""Tickets, bookings, and wallet MCP tools."""

from typing import Any
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.ticket_service import TicketService
from app.schemas.ticket import TripTicketCreate, TripTicketUpdate
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.mcp.proposals import create_proposal


async def list_tickets(
    trip_id: str,
    ticket_type: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Lists all travel tickets and reservations associated with this trip.
    Sensitive barcodes and access codes are masked by default.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    tickets = await TicketService.list_tickets(
        trip_id=trip_id,
        user=u_ctx.user,
        session=u_ctx.session,
        ticket_type=ticket_type,
        redact_secrets=True,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="list_tickets",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "ticket_type": ticket_type},
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(tickets)} ticket(s) for trip {trip_id}.",
        data={"total": len(tickets), "tickets": tickets},
    )


async def get_ticket(
    trip_id: str,
    ticket_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Retrieves a single ticket's details with secrets masked.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    ticket = await TicketService.get_ticket(
        trip_id=trip_id,
        ticket_id=ticket_id,
        user=u_ctx.user,
        session=u_ctx.session,
        redact_secrets=True,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_ticket",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "ticket_id": ticket_id},
    )

    title = ticket.get("title") or ticket_id
    return ToolResult(
        ok=True,
        summary=f"Retrieved ticket '{title}'.",
        data=ticket,
    )


async def create_ticket(
    trip_id: str,
    title: str,
    ticket_type: str,  # 'flight', 'lodging', 'train', 'bus', 'activity', 'other'
    start_time: str,
    end_time: str | None = None,
    location_name: str | None = None,
    reference_code: str | None = None,
    cost: float | None = None,
    currency: str = "EUR",
    ctx: Context | None = None,
) -> ToolResult:
    """
    Creates a new ticket/reservation entry for the trip.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    ticket_in = TripTicketCreate(
        title=title,
        ticket_type=ticket_type,
        start_time=start_time,
        end_time=end_time,
        location_name=location_name,
        reference_code=reference_code,
        cost=cost,
        currency=currency,
    )

    created = await TicketService.create_ticket(
        trip_id=trip_id,
        ticket_in=ticket_in,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    # Sync anchors if flight or lodging
    if ticket_type in ("flight", "lodging"):
        await TicketService.sync_anchors_from_tickets(
            trip_id, u_ctx.user, u_ctx.session
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="create_ticket",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "title": title, "ticket_type": ticket_type},
    )

    return ToolResult(
        ok=True,
        summary=f"Created {ticket_type} ticket '{title}' successfully.",
        data=created,
    )


async def update_ticket(
    trip_id: str,
    ticket_id: str,
    title: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    location_name: str | None = None,
    cost: float | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Updates an existing ticket entry."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    ticket_up = TripTicketUpdate(
        title=title,
        start_time=start_time,
        end_time=end_time,
        location_name=location_name,
        cost=cost,
    )

    updated = await TicketService.update_ticket(
        trip_id=trip_id,
        ticket_id=ticket_id,
        ticket_update=ticket_up,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="update_ticket",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "ticket_id": ticket_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated ticket '{ticket_id}' successfully.",
        data=updated,
    )


async def delete_ticket(
    trip_id: str,
    ticket_id: str,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Deletes a ticket or booking from the trip wallet.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    if not confirmed:
        existing = await TicketService.get_ticket(
            trip_id, ticket_id, u_ctx.user, u_ctx.session
        )
        summary = f"Delete ticket '{existing.get('title', ticket_id)}'. Please confirm."
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="delete_ticket",
            summary=summary,
            arguments={"trip_id": trip_id, "ticket_id": ticket_id},
            diff={"deleted_ticket": existing},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    await TicketService.delete_ticket(
        trip_id=trip_id,
        ticket_id=ticket_id,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="delete_ticket",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "ticket_id": ticket_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Deleted ticket '{ticket_id}' successfully.",
    )


async def parse_booking_text(
    trip_id: str,
    text_content: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Parses booking confirmation emails or pasted text into candidate ticket drafts.
    Returns draft items without persisting them.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    drafts = await TicketService.parse_booking_text(text_content)

    await log_agent_action(
        session=u_ctx.session,
        tool="parse_booking_text",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "text_len": len(text_content)},
    )

    count = len(drafts.get("tickets", [])) if isinstance(drafts, dict) else 1
    return ToolResult(
        ok=True,
        summary=f"Extracted {count} candidate ticket draft(s).",
        data=drafts,
    )


async def confirm_ticket_drafts(
    trip_id: str,
    drafts: list[dict[str, Any]],
    ctx: Context | None = None,
) -> ToolResult:
    """
    Persists scanned or drafted tickets into the trip wallet and synchronizes
    anchors into the itinerary.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    created_tickets = []
    for d in drafts:
        t_in = TripTicketCreate(
            title=d.get("title") or "Reservation",
            ticket_type=d.get("ticket_type") or "activity",
            start_time=d.get("start_time") or "2026-11-01T09:00:00Z",
            end_time=d.get("end_time"),
            location_name=d.get("location_name"),
            reference_code=d.get("reference_code"),
            cost=d.get("cost"),
            currency=d.get("currency") or "EUR",
        )
        created = await TicketService.create_ticket(
            trip_id, t_in, u_ctx.user, u_ctx.session
        )
        created_tickets.append(created)

    sync_res = await TicketService.sync_anchors_from_tickets(
        trip_id, u_ctx.user, u_ctx.session
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="confirm_ticket_drafts",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "drafts_count": len(drafts)},
    )

    return ToolResult(
        ok=True,
        summary=f"Confirmed and created {len(created_tickets)} ticket(s). Synced anchors.",
        data={"tickets": created_tickets, "sync": sync_res},
    )


async def sync_anchors_from_tickets(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Synchronizes flight arrival/departure times and lodging depots from confirmed
    wallet tickets into the itinerary.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    res = await TicketService.sync_anchors_from_tickets(
        trip_id, u_ctx.user, u_ctx.session
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="sync_anchors_from_tickets",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Synced anchors from tickets ({res.get('synced_tickets', 0)} ticket(s) matched).",
        data=res,
    )
