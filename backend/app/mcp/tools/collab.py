"""Collaboration and participant management MCP tools."""

from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.participant_service import ParticipantService
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.mcp.proposals import create_proposal


async def list_participants(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Lists all participants and travelers in this trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    participants = await ParticipantService.list_participants(
        trip_id, u_ctx.user, u_ctx.session
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="list_participants",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
    )

    items = [
        {
            "id": p.id,
            "name": p.name,
            "email": p.email,
            "role": p.role,
            "user_id": p.user_id,
        }
        for p in participants
    ]
    return ToolResult(
        ok=True,
        summary=f"Trip has {len(items)} participant(s).",
        data={"total": len(items), "participants": items},
    )


async def add_participant(
    trip_id: str,
    name: str,
    email: str | None = None,
    linked_user_id: str | None = None,
    role: str = "traveler",
    ctx: Context | None = None,
) -> ToolResult:
    """Adds a new traveler or guest participant to the trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    p = await ParticipantService.add_participant(
        trip_id=trip_id,
        name=name,
        user=u_ctx.user,
        session=u_ctx.session,
        email=email,
        linked_user_id=linked_user_id,
        role=role,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_participant",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "name": name, "role": role},
    )

    return ToolResult(
        ok=True,
        summary=f"Added participant '{p.name}' ({role}) to trip.",
        data={
            "id": p.id,
            "name": p.name,
            "email": p.email,
            "role": p.role,
            "user_id": p.user_id,
        },
    )


async def remove_participant(
    trip_id: str,
    participant_id: str,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Removes a participant from the trip.
    Tier C: requires confirmation. Never removes the last participant.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    all_p = await ParticipantService.list_participants(
        trip_id, u_ctx.user, u_ctx.session
    )
    if len(all_p) <= 1:
        return ToolResult(
            ok=False,
            summary="Cannot remove the only participant from a trip.",
            error="Trips must have at least one participant.",
        )

    target = next((p for p in all_p if p.id == participant_id), None)
    if not target:
        return ToolResult(
            ok=False,
            summary=f"Participant '{participant_id}' not found.",
            error="Participant not found.",
        )

    if not confirmed:
        summary = f"Remove participant '{target.name}' from the trip. Please confirm."
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="remove_participant",
            summary=summary,
            arguments={"trip_id": trip_id, "participant_id": participant_id},
            diff={"removed_participant": {"id": target.id, "name": target.name}},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    res = await ParticipantService.remove_participant(
        trip_id=trip_id,
        participant_id=participant_id,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="remove_participant",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "participant_id": participant_id},
    )

    return ToolResult(
        ok=True,
        summary=res["message"],
        data=res,
    )
