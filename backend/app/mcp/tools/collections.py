"""Collections, bookmarks, and trip media MCP tools."""

from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.collection_service import CollectionService
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult


async def list_collections(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Lists all user collections (bookmarks, packing lists, curated spots) for this trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    collections = await CollectionService.list_collections(
        trip_id, u_ctx.user, u_ctx.session
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="list_collections",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
    )

    items = [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "color": c.color,
            "item_count": len(c.items) if c.items else 0,
            "items": [
                {
                    "id": it.id,
                    "poi_id": it.poi_id,
                    "notes": it.notes,
                    "position": it.position,
                }
                for it in (c.items or [])
            ],
        }
        for c in collections
    ]
    return ToolResult(
        ok=True,
        summary=f"Found {len(items)} collection(s) in trip.",
        data={"collections": items},
    )


async def create_collection(
    trip_id: str,
    name: str,
    description: str | None = None,
    color: str = "#0F4C5C",
    ctx: Context | None = None,
) -> ToolResult:
    """Creates a new collection within the trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    c = await CollectionService.create_collection(
        trip_id=trip_id,
        name=name,
        user=u_ctx.user,
        session=u_ctx.session,
        description=description,
        color=color,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="create_collection",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "name": name},
    )

    return ToolResult(
        ok=True,
        summary=f"Created collection '{name}'.",
        data={
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "color": c.color,
        },
    )


async def add_to_collection(
    trip_id: str,
    collection_id: str,
    poi_id: str,
    notes: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Adds a POI item to an existing collection."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    item = await CollectionService.add_item(
        trip_id=trip_id,
        collection_id=collection_id,
        poi_id=poi_id,
        user=u_ctx.user,
        session=u_ctx.session,
        notes=notes,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_to_collection",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "collection_id": collection_id, "poi_id": poi_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Added item '{poi_id}' to collection.",
        data={"item_id": item.id, "collection_id": collection_id, "poi_id": poi_id},
    )


async def remove_from_collection(
    trip_id: str,
    collection_id: str,
    item_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Removes an item from a collection."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    await CollectionService.remove_item(
        trip_id=trip_id,
        collection_id=collection_id,
        item_id=item_id,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="remove_from_collection",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "collection_id": collection_id, "item_id": item_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Removed item '{item_id}' from collection.",
    )


async def list_photos(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Lists photos metadata (URLs, captions, authors) attached to the trip without downloading raw bytes."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    photos = list(doc.photos or [])

    await log_agent_action(
        session=u_ctx.session,
        tool="list_photos",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Trip has {len(photos)} registered photo(s).",
        data={"total": len(photos), "photos": photos},
    )
