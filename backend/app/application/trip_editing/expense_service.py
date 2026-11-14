from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import TripExpenseModel, TripParticipantModel, UserModel
from app.domain.schemas.itinerary_document import ItineraryDocument

logger = logging.getLogger(__name__)


def _compute_splits(
    amount: float,
    split_type: str,
    payer_id: str,
    participants: list[TripParticipantModel],
    raw_splits: Optional[list[dict[str, Any]]],
    excluded_participant_ids: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    excluded = set(excluded_participant_ids or [])

    if split_type == "exclude-participant" or excluded:
        eligible = [p for p in participants if p.id not in excluded]
        if not eligible:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot exclude all participants from an expense.",
            )
        share = round(amount / len(eligible), 2)
        return [{"participant_id": p.id, "amount": share} for p in eligible]

    elif split_type == "percentage" and raw_splits:
        # Expecting participant_id and percentage (0-100)
        total_pct = sum(float(s.get("percentage", 0.0)) for s in raw_splits)
        if abs(total_pct - 100.0) > 0.5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Percentages must sum to 100%. Got {total_pct}%.",
            )
        return [
            {
                "participant_id": s["participant_id"],
                "amount": round(amount * (float(s.get("percentage", 0.0)) / 100.0), 2),
            }
            for s in raw_splits
        ]

    elif split_type == "custom" and raw_splits:
        return [
            {
                "participant_id": s["participant_id"],
                "amount": round(float(s.get("amount", 0.0)), 2),
            }
            for s in raw_splits
        ]

    # Default: "equal" split among all participants
    if participants:
        share = round(amount / len(participants), 2)
        return [{"participant_id": p.id, "amount": share} for p in participants]

    return []


class ExpenseService:
    """
    Trip expenses and settlement domain operations.
    Handles equal, custom, percentage, and exclude-participant splits,
    multi-currency conversion, and bilateral vs minimal debt simplification.
    """

    @classmethod
    async def list_expenses(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> list[TripExpenseModel]:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)
        stmt = (
            select(TripExpenseModel)
            .where(TripExpenseModel.trip_id == trip_id)
            .order_by(
                TripExpenseModel.expense_date.desc(), TripExpenseModel.created_at.desc()
            )
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    @classmethod
    async def add_expense(
        cls,
        trip_id: str,
        payer_id: str,
        amount: float,
        description: str,
        user: UserModel | None,
        session: AsyncSession,
        currency: str = "EUR",
        category: str = "other",
        split_type: str = "equal",
        splits: Optional[list[dict[str, Any]]] = None,
        excluded_participant_ids: Optional[list[str]] = None,
        expense_date: Optional[str] = None,
    ) -> TripExpenseModel:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)

        # Validate payer
        p_res = await session.execute(
            select(TripParticipantModel).where(
                TripParticipantModel.trip_id == trip_id,
                TripParticipantModel.id == payer_id,
            )
        )
        payer = p_res.scalar_one_or_none()
        if not payer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payer participant '{payer_id}' not found in trip.",
            )

        # Get all participants
        parts_res = await session.execute(
            select(TripParticipantModel).where(TripParticipantModel.trip_id == trip_id)
        )
        all_participants = list(parts_res.scalars().all())

        computed_splits = _compute_splits(
            amount=amount,
            split_type=split_type,
            payer_id=payer_id,
            participants=all_participants,
            raw_splits=splits,
            excluded_participant_ids=excluded_participant_ids,
        )

        new_expense = TripExpenseModel(
            id=str(uuid.uuid4()),
            trip_id=trip_id,
            payer_id=payer_id,
            description=description.strip(),
            amount=round(amount, 2),
            currency=(currency or "EUR").upper(),
            category=category or "other",
            split_type=split_type or "equal",
            splits=computed_splits,
            expense_date=expense_date
            or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        )
        session.add(new_expense)
        await session.commit()
        await session.refresh(new_expense)
        return new_expense

    @classmethod
    async def update_expense(
        cls,
        trip_id: str,
        expense_id: str,
        user: UserModel | None,
        session: AsyncSession,
        amount: Optional[float] = None,
        description: Optional[str] = None,
        payer_id: Optional[str] = None,
        category: Optional[str] = None,
        currency: Optional[str] = None,
        split_type: Optional[str] = None,
        splits: Optional[list[dict[str, Any]]] = None,
        expense_date: Optional[str] = None,
    ) -> TripExpenseModel:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)

        stmt = select(TripExpenseModel).where(
            TripExpenseModel.trip_id == trip_id,
            TripExpenseModel.id == expense_id,
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Expense '{expense_id}' not found in trip.",
            )

        if payer_id is not None:
            p_check = await session.execute(
                select(TripParticipantModel).where(
                    TripParticipantModel.trip_id == trip_id,
                    TripParticipantModel.id == payer_id,
                )
            )
            if not p_check.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Payer participant '{payer_id}' not found in trip.",
                )
            expense.payer_id = payer_id

        if amount is not None:
            expense.amount = round(amount, 2)
        if description is not None:
            expense.description = description.strip()
        if category is not None:
            expense.category = category
        if currency is not None:
            expense.currency = currency.upper()
        if split_type is not None:
            expense.split_type = split_type
        if expense_date is not None:
            expense.expense_date = expense_date

        if splits is not None:
            expense.splits = splits
        elif amount is not None or split_type is not None:
            parts_res = await session.execute(
                select(TripParticipantModel).where(
                    TripParticipantModel.trip_id == trip_id
                )
            )
            all_participants = list(parts_res.scalars().all())
            expense.splits = _compute_splits(
                amount=expense.amount,
                split_type=expense.split_type,
                payer_id=expense.payer_id,
                participants=all_participants,
                raw_splits=None,
            )

        session.add(expense)
        await session.commit()
        await session.refresh(expense)
        return expense

    @classmethod
    async def delete_expense(
        cls,
        trip_id: str,
        expense_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> None:
        await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        stmt = select(TripExpenseModel).where(
            TripExpenseModel.trip_id == trip_id,
            TripExpenseModel.id == expense_id,
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Expense '{expense_id}' not found.",
            )

        await session.delete(expense)
        await session.commit()

    @classmethod
    async def get_settlement(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
        simplify: bool = True,
        target_currency: str = "EUR",
    ) -> dict[str, Any]:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)

        parts_res = await session.execute(
            select(TripParticipantModel).where(TripParticipantModel.trip_id == trip_id)
        )
        participants = list(parts_res.scalars().all())
        p_names = {p.id: p.name for p in participants}

        expenses_res = await session.execute(
            select(TripExpenseModel).where(TripExpenseModel.trip_id == trip_id)
        )
        expenses = list(expenses_res.scalars().all())

        rates: dict[str, float] = {}
        try:
            from app.engine.currency import fetch_live_rates

            rates = await fetch_live_rates(target_currency)
        except Exception as err:
            logger.warning(f"Failed to fetch live currency rates: {err}")

        def to_target(amt: float, cur: str | None) -> float:
            if not amt:
                return 0.0
            c = (cur or target_currency).upper().strip()
            if c == target_currency:
                return amt
            r = rates.get(c, 1.0)
            return amt / r if r > 0 else amt

        paid_map = {p.id: 0.0 for p in participants}
        share_map = {p.id: 0.0 for p in participants}

        for e in expenses:
            e_val = to_target(e.amount, e.currency)
            if e.payer_id in paid_map:
                paid_map[e.payer_id] += e_val
            splits = e.splits or []
            if splits:
                for s in splits:
                    pid = s.get("participant_id")
                    if pid in share_map:
                        share_map[pid] += to_target(
                            float(s.get("amount", 0.0)), e.currency
                        )
            elif participants:
                per_p = e_val / len(participants)
                for p in participants:
                    share_map[p.id] += per_p

        balances = []
        net_balances: dict[str, float] = {}
        for p in participants:
            total_p = round(paid_map.get(p.id, 0.0), 2)
            total_s = round(share_map.get(p.id, 0.0), 2)
            net_b = round(total_p - total_s, 2)
            net_balances[p.id] = net_b
            balances.append(
                {
                    "participant_id": p.id,
                    "name": p.name,
                    "total_paid": total_p,
                    "total_share": total_s,
                    "net_balance": net_b,
                }
            )

        transfers = []
        if simplify:
            debtors = [[pid, -val] for pid, val in net_balances.items() if val < -0.01]
            creditors = [[pid, val] for pid, val in net_balances.items() if val > 0.01]
            debtors.sort(key=lambda x: x[1], reverse=True)
            creditors.sort(key=lambda x: x[1], reverse=True)

            d_idx, c_idx = 0, 0
            while d_idx < len(debtors) and c_idx < len(creditors):
                d_id, d_amt = debtors[d_idx]
                c_id, c_amt = creditors[c_idx]
                settle = min(d_amt, c_amt)
                if settle > 0.009:
                    transfers.append(
                        {
                            "sender_id": d_id,
                            "sender_name": p_names.get(d_id, "Unknown"),
                            "receiver_id": c_id,
                            "receiver_name": p_names.get(c_id, "Unknown"),
                            "amount": round(settle, 2),
                            "currency": target_currency,
                        }
                    )
                debtors[d_idx][1] -= settle
                creditors[c_idx][1] -= settle
                if debtors[d_idx][1] < 0.01:
                    d_idx += 1
                if creditors[c_idx][1] < 0.01:
                    c_idx += 1
        else:
            pairwise = {
                p1.id: {p2.id: 0.0 for p2 in participants} for p1 in participants
            }
            for e in expenses:
                splits = e.splits or []
                payer = e.payer_id
                if splits:
                    for s in splits:
                        debtor = s.get("participant_id")
                        if (
                            debtor
                            and debtor != payer
                            and debtor in pairwise
                            and payer in pairwise[debtor]
                        ):
                            pairwise[debtor][payer] += to_target(
                                float(s.get("amount", 0.0)), e.currency
                            )
                elif participants and len(participants) > 1:
                    per_p = to_target(e.amount, e.currency) / len(participants)
                    for p in participants:
                        if (
                            p.id != payer
                            and p.id in pairwise
                            and payer in pairwise[p.id]
                        ):
                            pairwise[p.id][payer] += per_p

            done = set()
            for p1 in participants:
                for p2 in participants:
                    if p1.id != p2.id and (p2.id, p1.id) not in done:
                        done.add((p1.id, p2.id))
                        net = round(pairwise[p1.id][p2.id] - pairwise[p2.id][p1.id], 2)
                        if net > 0.009:
                            transfers.append(
                                {
                                    "sender_id": p1.id,
                                    "sender_name": p_names.get(p1.id, "Unknown"),
                                    "receiver_id": p2.id,
                                    "receiver_name": p_names.get(p2.id, "Unknown"),
                                    "amount": net,
                                    "currency": target_currency,
                                }
                            )
                        elif net < -0.009:
                            transfers.append(
                                {
                                    "sender_id": p2.id,
                                    "sender_name": p_names.get(p2.id, "Unknown"),
                                    "receiver_id": p1.id,
                                    "receiver_name": p_names.get(p1.id, "Unknown"),
                                    "amount": round(-net, 2),
                                    "currency": target_currency,
                                }
                            )

        total_expenses = sum(to_target(e.amount, e.currency) for e in expenses)
        return {
            "trip_id": trip_id,
            "currency": target_currency,
            "total_expenses": round(total_expenses, 2),
            "balances": balances,
            "transfers": transfers,
        }

    @classmethod
    async def get_budget_breakdown(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
        target_currency: str = "EUR",
    ) -> dict[str, Any]:
        trip = await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, session)
        expenses = await cls.list_expenses(trip_id, user, session)

        # Categorize expenses
        breakdown_by_category: dict[str, float] = {}
        for e in expenses:
            cat = e.category or "other"
            breakdown_by_category[cat] = breakdown_by_category.get(cat, 0.0) + float(
                e.amount
            )

        # Include itinerary attraction/activity costs
        raw_itin = trip.itinerary_data or {}
        doc, _ = ItineraryDocument.from_dict(raw_itin)
        itinerary_poi_cost = 0.0
        for day in doc.days:
            for s in day.itinerary.path:
                cost = s.poi.get("price") or s.poi.get("cost") or 0.0
                try:
                    itinerary_poi_cost += float(cost)
                except (ValueError, TypeError):
                    pass

        if itinerary_poi_cost > 0:
            breakdown_by_category["attractions"] = (
                breakdown_by_category.get("attractions", 0.0) + itinerary_poi_cost
            )

        total_spent = sum(breakdown_by_category.values())
        budget_usd = (
            doc.travel_constraints.get("budget_usd", 0.0)
            if doc.travel_constraints
            else 0.0
        )

        return {
            "trip_id": trip_id,
            "target_currency": target_currency,
            "budget_limit": float(budget_usd),
            "total_spent": round(total_spent, 2),
            "remaining": round(max(0.0, float(budget_usd) - total_spent), 2)
            if budget_usd
            else None,
            "categories": {k: round(v, 2) for k, v in breakdown_by_category.items()},
        }
