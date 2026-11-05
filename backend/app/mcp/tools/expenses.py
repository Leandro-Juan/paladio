"""Trip expenses, budget, and settlement MCP tools."""

from typing import Any
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.expense_service import ExpenseService
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.mcp.proposals import create_proposal
from app.engine.currency import (
    fetch_live_rates,
    convert_currency as engine_convert_currency,
)


def _serialize_expense(e: Any) -> dict[str, Any]:
    if hasattr(e, "model_dump"):
        return e.model_dump()
    return {
        "id": str(getattr(e, "id", "")),
        "trip_id": str(getattr(e, "trip_id", "")),
        "payer_id": str(getattr(e, "payer_id", "")),
        "description": getattr(e, "description", ""),
        "amount": float(getattr(e, "amount", 0.0)),
        "currency": getattr(e, "currency", "EUR"),
        "category": getattr(e, "category", "other"),
        "split_type": getattr(e, "split_type", "equal"),
        "splits": getattr(e, "splits", []) or [],
        "expense_date": getattr(e, "expense_date", None),
        "created_at": (
            e.created_at.isoformat()
            if hasattr(e, "created_at") and getattr(e, "created_at", None)
            else None
        ),
        "updated_at": (
            e.updated_at.isoformat()
            if hasattr(e, "updated_at") and getattr(e, "updated_at", None)
            else None
        ),
    }


async def list_expenses(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Lists all recorded expenses and their participant split allocations for this trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    expenses = await ExpenseService.list_expenses(trip_id, u_ctx.user, u_ctx.session)

    await log_agent_action(
        session=u_ctx.session,
        tool="list_expenses",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
    )

    total_amount = sum(e.amount for e in expenses)
    return ToolResult(
        ok=True,
        summary=f"Found {len(expenses)} expense(s) totaling {total_amount:.2f}.",
        data={
            "total_expenses": len(expenses),
            "total_amount": round(total_amount, 2),
            "expenses": [_serialize_expense(e) for e in expenses],
        },
    )


async def add_expense(
    trip_id: str,
    payer_id: str,
    amount: float,
    description: str,
    currency: str = "EUR",
    category: str = "other",
    split_type: str = "equal",  # 'equal', 'percentage', 'custom', 'exclude-participant'
    splits: list[dict[str, Any]] | None = None,
    excluded_participant_ids: list[str] | None = None,
    notes: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Records a new trip expense and calculates individual participant cost shares."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    expense = await ExpenseService.add_expense(
        trip_id=trip_id,
        payer_id=payer_id,
        amount=amount,
        description=description,
        user=u_ctx.user,
        session=u_ctx.session,
        currency=currency,
        category=category,
        split_type=split_type,
        splits=splits,
        excluded_participant_ids=excluded_participant_ids,
        notes=notes,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_expense",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "amount": amount, "description": description},
    )

    return ToolResult(
        ok=True,
        summary=f"Added expense '{description}' ({amount:.2f} {currency}) split across {len(expense.splits)} traveler(s).",
        data=_serialize_expense(expense),
    )


async def update_expense(
    trip_id: str,
    expense_id: str,
    amount: float | None = None,
    description: str | None = None,
    category: str | None = None,
    notes: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Updates properties of an existing trip expense."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    updated = await ExpenseService.update_expense(
        trip_id=trip_id,
        expense_id=expense_id,
        user=u_ctx.user,
        session=u_ctx.session,
        amount=amount,
        description=description,
        category=category,
        notes=notes,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="update_expense",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "expense_id": expense_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated expense '{expense_id}' successfully.",
        data=_serialize_expense(updated),
    )


async def delete_expense(
    trip_id: str,
    expense_id: str,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Deletes an expense from the trip ledger.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    if not confirmed:
        summary = f"Delete expense '{expense_id}'. Please confirm."
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="delete_expense",
            summary=summary,
            arguments={"trip_id": trip_id, "expense_id": expense_id},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    await ExpenseService.delete_expense(
        trip_id=trip_id,
        expense_id=expense_id,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="delete_expense",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "expense_id": expense_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Deleted expense '{expense_id}' successfully.",
    )


async def get_budget_breakdown(
    trip_id: str,
    target_currency: str = "EUR",
    ctx: Context | None = None,
) -> ToolResult:
    """
    Computes overall budget breakdown combining itinerary stop costs and recorded expenses.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    breakdown = await ExpenseService.get_budget_breakdown(
        trip_id=trip_id,
        user=u_ctx.user,
        session=u_ctx.session,
        target_currency=target_currency,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_budget_breakdown",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "target_currency": target_currency},
    )

    total = breakdown.get("total_budget", 0.0)
    return ToolResult(
        ok=True,
        summary=f"Total trip cost: {total:.2f} {target_currency}.",
        data=breakdown,
    )


async def get_settlement(
    trip_id: str,
    simplify: bool = True,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Computes net traveler balances and simplified debt settlement transfers.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    settlement = await ExpenseService.get_settlement(
        trip_id=trip_id,
        user=u_ctx.user,
        session=u_ctx.session,
        simplify=simplify,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_settlement",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "simplify": simplify},
    )

    transfers = settlement.get("transfers", [])
    return ToolResult(
        ok=True,
        summary=f"Calculated settlement: {len(transfers)} simplified transfer(s) required.",
        data=settlement,
    )


async def convert_currency(
    amount: float,
    from_currency: str,
    to_currency: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Converts money amount between fiat currencies using live exchange rates or air-gapped snapshot."""
    rates = await fetch_live_rates(from_currency)
    converted = engine_convert_currency(amount, from_currency, to_currency, rates=rates)

    rate = rates.get(to_currency.upper(), 1.0)
    return ToolResult(
        ok=True,
        summary=f"{amount:.2f} {from_currency.upper()} = {converted:.2f} {to_currency.upper()} (rate: {rate:.4f})",
        data={
            "amount": amount,
            "from_currency": from_currency.upper(),
            "to_currency": to_currency.upper(),
            "converted_amount": round(converted, 2),
            "exchange_rate": rate,
        },
    )
