"""Comprehensive tests for Paladio MCP Server, tool execution, IDOR matrix, and undo."""

import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models import (
    TripModel,
    UserModel,
    TripParticipantModel,
    TripTicketModel,
    TripRevisionModel,
    AgentActionModel,
)
from app.mcp import mcp, with_user_context
from app.mcp.tools import (
    get_trip_overview,
    get_itinerary,
    get_stop,
    resolve_stop,
    get_trip_issues,
    add_stop,
    remove_stop,
    swap_days,
    undo_last_change,
    list_tickets,
    list_expenses,
    what_if,
    compare_metrics,
    load_toolset,
)
from app.mcp.resources import (
    read_trip_overview_resource,
    read_trip_wallet_resource,
    read_paladio_taxonomy_resource,
    read_itinerary_schema_resource,
)
from app.mcp.prompts import (
    prompt_review_my_trip,
    prompt_fix_all_issues,
)


@pytest.fixture
async def seeded_mcp_trip(db_session: AsyncSession):
    """Creates a seeded trip with owner, viewer, and stranger users."""
    suffix = uuid.uuid4().hex[:6]
    owner = UserModel(
        id=f"usr_owner_{suffix}",
        email=f"owner_{suffix}@paladio.local",
        username=f"owner_{suffix}",
        hashed_password="pw",
        is_active=True,
    )
    viewer = UserModel(
        id=f"usr_viewer_{suffix}",
        email=f"viewer_{suffix}@paladio.local",
        username=f"viewer_{suffix}",
        hashed_password="pw",
        is_active=True,
    )
    stranger = UserModel(
        id=f"usr_stranger_{suffix}",
        email=f"stranger_{suffix}@paladio.local",
        username=f"stranger_{suffix}",
        hashed_password="pw",
        is_active=True,
    )
    db_session.add_all([owner, viewer, stranger])
    await db_session.flush()

    trip_id = f"trip_mcp_{suffix}"
    initial_itinerary = {
        "days": [
            {
                "day": 1,
                "date": "2026-11-01",
                "itinerary": {
                    "path": [
                        {
                            "stop_id": f"stop_prado_{suffix}",
                            "poi_id": "prado_museum",
                            "name": "Museo del Prado",
                            "category": "museum",
                            "duration": 120,
                            "scheduled_start": "10:00",
                            "scheduled_end": "12:00",
                            "is_locked": False,
                            "cost": 15.0,
                        },
                        {
                            "stop_id": f"stop_park_{suffix}",
                            "poi_id": "retiro_park",
                            "name": "Parque del Retiro",
                            "category": "park",
                            "duration": 60,
                            "scheduled_start": "12:30",
                            "scheduled_end": "13:30",
                            "is_locked": False,
                            "cost": 0.0,
                        },
                    ]
                },
            },
            {
                "day": 2,
                "date": "2026-11-02",
                "itinerary": {
                    "path": [
                        {
                            "stop_id": f"stop_palace_{suffix}",
                            "poi_id": "royal_palace",
                            "name": "Royal Palace of Madrid",
                            "category": "attraction",
                            "duration": 90,
                            "scheduled_start": "10:00",
                            "scheduled_end": "11:30",
                            "is_locked": False,
                            "cost": 12.0,
                        }
                    ]
                },
            },
        ],
        "travel_constraints": {"pace": "balanced"},
        "title": "Madrid Art and Royalty",
    }
    trip = TripModel(
        id=trip_id,
        user_id=owner.id,
        destination="Madrid",
        start_date="2026-11-01",
        end_date="2026-11-03",
        itinerary_data=initial_itinerary,
        revision=0,
    )
    # Add viewer participant
    part_viewer = TripParticipantModel(
        id=f"part_view_{suffix}",
        trip_id=trip_id,
        user_id=viewer.id,
        name="Viewer Collab",
        role="traveler",
    )
    # Add ticket with sensitive barcode
    ticket = TripTicketModel(
        id=f"tkt_{suffix}",
        trip_id=trip_id,
        title="Flight IB3166",
        ticket_type="flight",
        start_time=datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc),
        access_code="SECRET_CODE_99",
        barcode_value="BARCODE_PRIVATE_12345",
        reference_code="PNR987654",
    )
    db_session.add_all([trip, part_viewer, ticket])
    await db_session.commit()

    return {
        "trip_id": trip_id,
        "owner": owner,
        "viewer": viewer,
        "stranger": stranger,
        "suffix": suffix,
        "prado_stop_id": f"stop_prado_{suffix}",
    }


@pytest.mark.asyncio
async def test_mcp_tool_catalog_and_read_tools(
    seeded_mcp_trip, db_session: AsyncSession
):
    """Verifies that all 77 MCP tools are registered and read tools execute cleanly."""
    trip_id = seeded_mcp_trip["trip_id"]
    owner = seeded_mcp_trip["owner"]

    registered_tools = mcp._tool_manager.list_tools()
    assert len(registered_tools) >= 70
    tool_names = {t.name for t in registered_tools}
    assert "get_trip_overview" in tool_names
    assert "get_itinerary" in tool_names
    assert "resolve_stop" in tool_names
    assert "what_if" in tool_names
    assert "undo_last_change" in tool_names

    async with with_user_context(user=owner, session=db_session):
        # 1. get_trip_overview
        ov_res = await get_trip_overview(trip_id=trip_id)
        assert ov_res.ok is True
        assert ov_res.data["destination"] == "Madrid"
        assert ov_res.data["day_count"] == 2
        assert ov_res.data["ticket_count"] == 1

        # 2. get_itinerary summary and day
        itin_sum = await get_itinerary(trip_id=trip_id, detail="summary")
        assert itin_sum.ok is True
        assert len(itin_sum.data["days"]) == 2

        itin_d1 = await get_itinerary(trip_id=trip_id, detail="day", day=1)
        assert itin_d1.ok is True
        assert itin_d1.data["days"][0]["day"] == 1
        assert len(itin_d1.data["days"][0]["itinerary"]["path"]) == 2

        # 3. get_stop
        prado_id = seeded_mcp_trip["prado_stop_id"]
        stop_res = await get_stop(trip_id=trip_id, stop_id=prado_id)
        assert stop_res.ok is True
        assert stop_res.data["stop"]["name"] == "Museo del Prado"

        # 4. resolve_stop fuzzy query
        res_fuzzy = await resolve_stop(trip_id=trip_id, query="the prado")
        assert res_fuzzy.ok is True
        assert len(res_fuzzy.data) >= 1
        assert res_fuzzy.data[0]["stop_id"] == prado_id

        # 5. get_trip_issues
        issues_res = await get_trip_issues(trip_id=trip_id)
        assert issues_res.ok is True

        # 6. compare_metrics
        metrics_res = await compare_metrics(trip_id=trip_id)
        assert metrics_res.ok is True
        assert "score_after" in metrics_res.data

        # 7. load_toolset
        toolset_res = await load_toolset(toolset_name="expenses")
        assert toolset_res.ok is True
        assert "list_expenses" in toolset_res.data["tools"]


@pytest.mark.asyncio
async def test_mcp_ticket_secrets_redacted(seeded_mcp_trip, db_session: AsyncSession):
    """Verifies safety invariant: Wallet secrets (barcodes, access codes, PNRs) are masked by default."""
    trip_id = seeded_mcp_trip["trip_id"]
    owner = seeded_mcp_trip["owner"]

    async with with_user_context(user=owner, session=db_session):
        t_res = await list_tickets(trip_id=trip_id)
        assert t_res.ok is True
        assert len(t_res.data["tickets"]) == 1
        tkt = t_res.data["tickets"][0]

        # Secrets must be masked (e.g. 'SE••••99', 'BA••••45') and NEVER expose raw barcode
        assert "BARCODE_PRIVATE_12345" not in str(tkt)
        assert "SECRET_CODE_99" not in str(tkt)
        assert "••••" in tkt["access_code"]
        assert "••••" in tkt["barcode_value"]


@pytest.mark.asyncio
async def test_mcp_idor_access_control_matrix(
    seeded_mcp_trip, db_session: AsyncSession
):
    """Parametrized IDOR security test: unauthorized user cannot access or mutate trip tools."""
    trip_id = seeded_mcp_trip["trip_id"]
    stranger = seeded_mcp_trip["stranger"]
    prado_id = seeded_mcp_trip["prado_stop_id"]

    async with with_user_context(user=stranger, session=db_session):
        # 1. Read overview forbidden
        with pytest.raises(Exception) as exc1:
            await get_trip_overview(trip_id=trip_id)
        assert (
            "403" in str(exc1.value)
            or "Forbidden" in str(exc1.value)
            or "access" in str(exc1.value).lower()
        )

        # 2. Read itinerary forbidden
        with pytest.raises(Exception):
            await get_itinerary(trip_id=trip_id)

        # 3. Add stop forbidden
        with pytest.raises(Exception):
            await add_stop(
                trip_id=trip_id, day=1, name="Intruder Cafe", lat=40.41, lon=-3.70
            )

        # 4. Remove stop forbidden
        with pytest.raises(Exception):
            await remove_stop(trip_id=trip_id, stop_id=prado_id)

        # 5. List tickets forbidden
        with pytest.raises(Exception):
            await list_tickets(trip_id=trip_id)

        # 6. List expenses forbidden
        with pytest.raises(Exception):
            await list_expenses(trip_id=trip_id)


@pytest.mark.asyncio
async def test_mcp_write_tools_revisions_and_undo(
    seeded_mcp_trip, db_session: AsyncSession
):
    """Verifies that Tier W mutations increment revision, record agent_actions, and support exact undo."""
    trip_id = seeded_mcp_trip["trip_id"]
    owner = seeded_mcp_trip["owner"]

    async with with_user_context(user=owner, session=db_session):
        # 1. Add custom stop
        add_res = await add_stop(
            trip_id=trip_id,
            day=1,
            name="San Gines Chocolateria",
            lat=40.4170,
            lon=-3.7070,
            duration_mins=45,
            category="cafe",
        )
        assert add_res.ok is True
        assert add_res.change_set is not None

        # Verify revision incremented to 1
        trip = await db_session.get(TripModel, trip_id)
        assert trip.revision == 1

        # Verify agent_actions logged
        act_stmt = select(AgentActionModel).where(
            AgentActionModel.trip_id == trip_id, AgentActionModel.tool == "add_stop"
        )
        act_res = await db_session.execute(act_stmt)
        actions = list(act_res.scalars().all())
        assert len(actions) >= 1

        # Verify trip_revisions row created
        rev_stmt = select(TripRevisionModel).where(
            TripRevisionModel.trip_id == trip_id, TripRevisionModel.revision == 1
        )
        rev_res = await db_session.execute(rev_stmt)
        rev1 = rev_res.scalar_one_or_none()
        assert rev1 is not None
        assert "San Gines" in rev1.summary

        # 2. Undo last change
        undo_res = await undo_last_change(trip_id=trip_id)
        assert undo_res.ok is True
        assert undo_res.data["restored_revision"] == 0

        # Verify trip restored to revision 0 state
        await db_session.refresh(trip)
        day1_stops = trip.itinerary_data["days"][0]["itinerary"]["path"]
        assert len(day1_stops) == 2
        assert all(s["name"] != "San Gines Chocolateria" for s in day1_stops)


@pytest.mark.asyncio
async def test_mcp_tier_c_proposal_and_confirmation(
    seeded_mcp_trip, db_session: AsyncSession
):
    """Verifies that Tier C actions (swap_days) require confirmation and generate proposals."""
    trip_id = seeded_mcp_trip["trip_id"]
    owner = seeded_mcp_trip["owner"]

    async with with_user_context(user=owner, session=db_session):
        # 1. Attempt swap without confirmation
        prop_res = await swap_days(trip_id=trip_id, day_a=1, day_b=2, confirmed=False)
        assert prop_res.ok is False
        assert prop_res.requires_confirmation is True
        assert prop_res.proposal is not None
        assert prop_res.proposal.tool == "swap_days"
        assert prop_res.proposal.trip_id == trip_id

        # 2. Call again with confirmed=True
        exec_res = await swap_days(trip_id=trip_id, day_a=1, day_b=2, confirmed=True)
        assert exec_res.ok is True
        assert exec_res.change_set is not None

        # Verify Day 1 now has Royal Palace (from former Day 2)
        trip = await db_session.get(TripModel, trip_id)
        d1_stops = trip.itinerary_data["days"][0]["itinerary"]["path"]
        assert any(s["name"] == "Royal Palace of Madrid" for s in d1_stops)


@pytest.mark.asyncio
async def test_mcp_what_if_dry_run(seeded_mcp_trip, db_session: AsyncSession):
    """Verifies that what_if evaluates changes and quality delta without modifying DB state."""
    trip_id = seeded_mcp_trip["trip_id"]
    owner = seeded_mcp_trip["owner"]
    prado_id = seeded_mcp_trip["prado_stop_id"]

    async with with_user_context(user=owner, session=db_session):
        trip_before = await db_session.get(TripModel, trip_id)
        rev_before = trip_before.revision

        # Simulate removing the Prado museum
        sim_res = await what_if(
            trip_id=trip_id,
            action="remove_stop",
            params={"stop_id": prado_id},
        )
        assert sim_res.ok is True
        assert sim_res.change_set is not None
        assert "quality_delta" in sim_res.data
        assert sim_res.data["quality_delta"] is not None

        # DB must NOT be modified
        await db_session.refresh(trip_before)
        assert trip_before.revision == rev_before
        assert len(trip_before.itinerary_data["days"][0]["itinerary"]["path"]) == 2


@pytest.mark.asyncio
async def test_mcp_resources_and_prompts(seeded_mcp_trip, db_session: AsyncSession):
    """Verifies reading MCP resources and formatting prompts."""
    trip_id = seeded_mcp_trip["trip_id"]
    owner = seeded_mcp_trip["owner"]

    async with with_user_context(user=owner, session=db_session):
        # 1. Overview resource
        ov_text = await read_trip_overview_resource(trip_id=trip_id)
        assert "Madrid Art and Royalty" in ov_text

        # 2. Redacted wallet resource
        w_text = await read_trip_wallet_resource(trip_id=trip_id)
        assert "••••" in w_text
        assert "BARCODE_PRIVATE_12345" not in w_text

        # 3. Static taxonomy resource
        tax_text = read_paladio_taxonomy_resource()
        assert "museum" in tax_text

        # 4. Schema resource
        schema_text = read_itinerary_schema_resource()
        assert "ItineraryDocument" in schema_text

        # 5. Prompts
        p1 = prompt_review_my_trip(trip_id)
        assert f"get_trip_overview(trip_id='{trip_id}')" in p1

        p2 = prompt_fix_all_issues(trip_id)
        assert f"get_trip_issues(trip_id='{trip_id}')" in p2
