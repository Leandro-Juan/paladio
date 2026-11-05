# How-To: Add a New MCP Tool to Paladio

This guide demonstrates how to author, register, secure, and test a new deterministic tool on Paladio's FastMCP server.

---

## 1. Choose the Target Domain Module

Tools are organized by domain under `backend/app/mcp/tools/`:
- `trip.py`: High-level trip summary, overview, and export.
- `itinerary.py`: Waypoint sequences, locks, durations, notes.
- `engine.py`: Optimization, simulations (`what_if`), and rebalancing.
- `pois.py`: Semantic search and POI discovery.
- `transit.py`: Multimodal GTFS routing and matrices.
- `expenses.py`: Cost splitting and budget tracking.
- `tickets.py`: Bookings, documents, and anchor synchronization.
- `collab.py`: Participant management and access control.
- `collections.py`: Bookmarks and photo collections.
- `market.py`: Live scrapers and fare monitoring.
- `jobs.py`: Asynchronous background task polling.

---

## 2. Define the Tool Function

Every tool function must accept `trip_id: str`, typed arguments, and an optional `ctx: Context | None = None`.

```python
from mcp.server.fastmcp import Context
from app.core.access import TripAccessLevel
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult

async def set_stop_priority(
    trip_id: str,
    stop_id: str,
    priority: int,  # 1 (must see) to 5 (optional)
    ctx: Context | None = None,
) -> ToolResult:
    """Sets visitor priority rating for a scheduled itinerary waypoint."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    # 1. Execute domain logic via service layer
    # updated_doc, change_set = ...

    # 2. Audit the action
    await log_agent_action(
        session=u_ctx.session,
        tool="set_stop_priority",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"stop_id": stop_id, "priority": priority},
    )

    # 3. Return ToolResult
    return ToolResult(
        ok=True,
        summary=f"Set stop '{stop_id}' priority to {priority}.",
        data={"stop_id": stop_id, "priority": priority},
    )
```

---

## 3. Handle Interactive Proposals for Tier C Tools

If the tool makes destructive, irreversible, or high-cost modifications, require a `confirmed: bool = False` flag:

```python
from app.mcp.proposals import create_proposal

async def delete_day(
    trip_id: str,
    day: int,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    if not confirmed:
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="delete_day",
            summary=f"Delete Day {day} and all its scheduled stops",
            arguments={"trip_id": trip_id, "day": day, "confirmed": True},
            diff={"day": day, "action": "delete"},
            ttl_seconds=300,
        )
        return ToolResult(
            ok=False,
            summary=f"Deleting Day {day} requires confirmation.",
            proposal=proposal.model_dump(),
        )

    # Proceed with actual deletion when confirmed=True...
```

---

## 4. Register the Tool

1. Export the function in `backend/app/mcp/tools/__init__.py`.
2. Register the tool on `mcp` in `backend/app/mcp/server.py`:
   ```python
   mcp.tool()(set_stop_priority)
   ```
3. If applicable, add the tool name to `CORE_TOOLS` or `DOMAIN_TOOLSETS` in `backend/app/agent/toolsets.py`.

---

## 5. Add an Automated Test

Add a test case in `backend/tests/test_mcp_tools.py`:
```python
@pytest.mark.asyncio
async def test_set_stop_priority(db_session, test_user, test_trip):
    res = await set_stop_priority(
        trip_id=test_trip.id,
        stop_id="stop_1",
        priority=1,
    )
    assert res.ok is True
    assert "priority" in res.data
```
Run the test:
```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests/test_mcp_tools.py -k test_set_stop_priority -q
```
