from __future__ import annotations

import copy
import logging
import uuid
from typing import Any, Callable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.taste.taste_service import TasteService
from app.application.trip_editing.events import publish_trip_event
from app.application.trip_editing.recompute import RecomputeService
from app.application.trip_editing.schemas import Change, ChangeSet
from app.application.trip_editing.validation import ItineraryValidator
from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import TripModel, TripRevisionModel, UserModel
from app.domain.schemas.itinerary_document import ItineraryDocument

logger = logging.getLogger(__name__)


def _compact_transit_leg(leg_data: Any, detail: str) -> Any:
    """Strips verbose geometries, maneuvers, and steps when detail != 'full'."""
    if not isinstance(leg_data, dict):
        return leg_data
    if detail == "full":
        return leg_data

    compact = {
        "mode": leg_data.get("mode", "walk"),
        "duration_minutes": leg_data.get("duration_minutes", 0),
        "distance_km": leg_data.get("distance_km", 0),
        "cost_usd": leg_data.get("cost_usd", 0),
        "from_poi_name": leg_data.get("from_poi_name"),
        "to_poi_name": leg_data.get("to_poi_name"),
        "route_short_name": leg_data.get("route_short_name"),
        "headsign": leg_data.get("headsign"),
    }
    return compact


class TripService:
    """
    Core persistence and transaction orchestrator for trips.
    Enforces atomic CAS revisions, undo history snapshots, compact views, and event dispatch.
    """

    @classmethod
    async def get_trip(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
        required_level: TripAccessLevel = TripAccessLevel.VIEWER,
    ) -> TripModel:
        return await assert_trip_access(user, trip_id, required_level, session)

    @classmethod
    def get_document(cls, trip: TripModel) -> ItineraryDocument:
        doc, _ = ItineraryDocument.from_dict(trip.itinerary_data or {})
        return doc

    @classmethod
    async def get_itinerary(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
        detail: str = "summary",  # "summary" | "day" | "full"
        day: Optional[int] = None,
    ) -> dict[str, Any]:
        trip = await cls.get_trip(trip_id, user, session, TripAccessLevel.VIEWER)
        raw_itin = trip.itinerary_data or {}
        doc, _ = ItineraryDocument.from_dict(raw_itin)

        if detail == "full" and day is None:
            return doc.to_dict()

        result_days = []
        for d in doc.days:
            if day is not None and d.day != day:
                continue

            day_dict = d.model_dump(mode="json")
            if detail != "full":
                # Strip maneuvers and polylines from transit legs
                path = day_dict.get("itinerary", {}).get("path", [])
                for stop in path:
                    leg = stop.get("transit_from_previous")
                    if leg:
                        stop["transit_from_previous"] = _compact_transit_leg(
                            leg, detail
                        )
                    # In summary mode, truncate long POI descriptions
                    if detail == "summary":
                        poi = stop.get("poi") or {}
                        if (
                            "description" in poi
                            and isinstance(poi["description"], str)
                            and len(poi["description"]) > 100
                        ):
                            poi["description"] = poi["description"][:100] + "..."

            result_days.append(day_dict)

        output = {
            "trip_id": trip.id,
            "revision": trip.revision or 0,
            "destination": trip.destination,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
            "detail": detail,
            "days": result_days,
            "travel_constraints": doc.travel_constraints,
        }
        return output

    @classmethod
    async def apply_mutation(
        cls,
        trip_id: str,
        mutator_fn: Optional[Callable[[ItineraryDocument], Any]] = None,
        expected_revision: Optional[int] = None,
        user: UserModel | None = None,
        session: AsyncSession = None,
        actor: str = "user",
        actor_detail: Optional[dict[str, Any]] = None,
        auto_recompute: bool = True,
        recompute_day: Optional[int] = None,
        mutation_fn: Optional[Callable[[ItineraryDocument], Any]] = None,
        summary: Optional[str] = None,
    ) -> ChangeSet:
        """
        Executes a mutation transaction:
        1. Load & assert editor access.
        2. CAS optimistic lock on revision.
        3. Apply mutation on ItineraryDocument.
        4. Recompute legs/times if requested.
        5. Validate constraints and quality.
        6. Commit CAS update + trip_revisions row.
        7. Publish Redis trip.updated event.
        """
        trip = await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)

        current_rev = trip.revision if trip.revision is not None else 0
        if expected_revision is not None and expected_revision != current_rev:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Conflict: Stale trip revision. Expected {current_rev}, got {expected_revision}.",
            )

        before_raw = copy.deepcopy(trip.itinerary_data or {})
        doc, _ = ItineraryDocument.from_dict(before_raw)

        # Baseline quality evaluation
        initial_quality = ItineraryValidator.evaluate_quality(
            doc, destination_city=trip.destination
        )

        # Execute pure editor mutation
        effective_fn = mutator_fn or mutation_fn
        if effective_fn is None:
            raise ValueError("A mutation function must be provided.")

        res = effective_fn(doc)
        import inspect

        if inspect.iscoroutine(res):
            res = await res
        if isinstance(res, tuple):
            changeset = res[0]
        else:
            changeset = res

        if summary and not getattr(changeset, "summary", None):
            changeset.summary = summary

        if not changeset.ok:
            return changeset

        # Recompute day if requested
        if auto_recompute:
            affected_days = {c.day for c in changeset.changes if c.day > 0}
            if recompute_day is not None:
                affected_days.add(recompute_day)
            for d in affected_days:
                await RecomputeService.cascade_day(
                    doc, day=d, destination_city=trip.destination
                )

        # Validate
        warnings = ItineraryValidator.validate_itinerary(
            doc, destination_city=trip.destination
        )
        changeset.warnings.extend(warnings)

        # Post-edit quality delta
        final_quality = ItineraryValidator.evaluate_quality(
            doc,
            destination_city=trip.destination,
            score_before=initial_quality.score_after,
        )
        changeset.quality = final_quality

        # Increment revision & persist inside transaction
        new_rev = current_rev + 1
        trip.revision = new_rev
        trip.itinerary_data = doc.to_dict()

        rev_id = str(uuid.uuid4())
        actor_info = actor_detail or (
            {"user_id": user.id, "username": user.username} if user else None
        )
        revision_row = TripRevisionModel(
            id=rev_id,
            trip_id=trip.id,
            revision=new_rev,
            actor=actor,
            actor_detail=actor_info,
            before=before_raw,
            after=trip.itinerary_data,
            summary=changeset.summary,
        )
        session.add(revision_row)
        session.add(trip)
        await session.commit()
        await session.refresh(trip)

        await TasteService.on_trip_revision(
            session=session,
            trip_id=trip.id,
            user_id=user.id if user else trip.user_id,
            before_doc=before_raw,
            after_doc=trip.itinerary_data or {},
            changes=[c.model_dump() for c in changeset.changes],
            actor=actor,
        )

        changeset.revision = new_rev
        changeset.undo_token = rev_id

        # Publish event
        await publish_trip_event(
            trip_id=trip.id,
            event_type="trip.updated",
            payload={
                "revision": new_rev,
                "summary": changeset.summary,
                "undo_token": rev_id,
                "affected_days": list({c.day for c in changeset.changes if c.day > 0}),
            },
        )

        changeset.document = doc
        return changeset

    @classmethod
    async def undo_last_change(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
    ) -> ChangeSet:
        trip = await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        current_rev = trip.revision or 0

        # Find latest revision row
        stmt = (
            select(TripRevisionModel)
            .where(TripRevisionModel.trip_id == trip.id)
            .order_by(TripRevisionModel.revision.desc())
            .limit(1)
        )
        res = await session.execute(stmt)
        latest_rev = res.scalar_one_or_none()

        if not latest_rev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No revision history available to undo.",
            )

        # Restore before snapshot
        restored_data = latest_rev.before
        new_rev = current_rev + 1

        undo_rev_row = TripRevisionModel(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            revision=new_rev,
            actor="user" if user else "system",
            actor_detail={"user_id": user.id} if user else None,
            before=trip.itinerary_data,
            after=restored_data,
            summary=f"Reverted change: {latest_rev.summary}",
        )
        trip.revision = new_rev
        trip.itinerary_data = restored_data

        session.add(undo_rev_row)
        session.add(trip)
        await session.commit()
        await session.refresh(trip)

        await TasteService.on_trip_revision(
            session=session,
            trip_id=trip.id,
            user_id=user.id if user else trip.user_id,
            before_doc=undo_rev_row.before or {},
            after_doc=restored_data or {},
            changes=None,
            actor="user" if user else "system",
        )

        summary = f"Undo successful: reverted '{latest_rev.summary}'."
        await publish_trip_event(
            trip_id=trip.id,
            event_type="trip.updated",
            payload={"revision": new_rev, "summary": summary},
        )

        return ChangeSet(
            ok=True,
            summary=summary,
            revision=new_rev,
            changes=[
                Change(
                    kind="undo",
                    day=0,
                    after={"restored_revision": latest_rev.revision - 1},
                )
            ],
        )

    @classmethod
    async def undo_to_revision(
        cls,
        trip_id: str,
        target_revision: int,
        user: UserModel | None,
        session: AsyncSession,
    ) -> ChangeSet:
        trip = await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        current_rev = trip.revision or 0

        if target_revision >= current_rev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target revision {target_revision} must be earlier than current revision {current_rev}.",
            )

        stmt = select(TripRevisionModel).where(
            TripRevisionModel.trip_id == trip.id,
            TripRevisionModel.revision == target_revision + 1,
        )
        res = await session.execute(stmt)
        matched_rev = res.scalar_one_or_none()
        if not matched_rev:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Revision snapshot {target_revision} not found in history.",
            )

        restored_data = matched_rev.before
        new_rev = current_rev + 1

        undo_row = TripRevisionModel(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            revision=new_rev,
            actor="user" if user else "system",
            actor_detail={"user_id": user.id} if user else None,
            before=trip.itinerary_data,
            after=restored_data,
            summary=f"Reverted trip state back to revision {target_revision}.",
        )
        trip.revision = new_rev
        trip.itinerary_data = restored_data

        session.add(undo_row)
        session.add(trip)
        await session.commit()
        await session.refresh(trip)

        await TasteService.on_trip_revision(
            session=session,
            user_id=user.id if user else trip.user_id,
            trip_id=trip.id,
            before_doc=undo_row.before or {},
            after_doc=restored_data or {},
            changes=[{"kind": "undo_to", "day": 0}],
            actor="undo",
            attribute_to_all_participants=True,
        )

        summary = f"Reverted trip to revision {target_revision}."
        await publish_trip_event(
            trip_id=trip.id,
            event_type="trip.updated",
            payload={"revision": new_rev, "summary": summary},
        )

        return ChangeSet(
            ok=True,
            summary=summary,
            revision=new_rev,
            changes=[
                Change(
                    kind="undo_to", day=0, after={"restored_revision": target_revision}
                )
            ],
        )

    @classmethod
    async def shift_trip_dates(
        cls,
        trip_id: str,
        new_start_date: str,
        user: UserModel | None,
        session: AsyncSession,
        reanchor_bookings: bool = True,
        actor: str = "user",
    ) -> tuple[TripModel, int]:
        """Shifts trip itinerary dates and optionally re-anchors tickets and expenses."""
        from datetime import date, timedelta
        from app.application.trip_editing.itinerary_editor import ItineraryEditor
        from app.db.models import TripExpenseModel, TripTicketModel
        from app.wallet.seeding import sync_trip_tickets

        trip = await assert_trip_access(user, trip_id, TripAccessLevel.EDITOR, session)
        old_start_str = trip.start_date
        try:
            new_start_dt = date.fromisoformat(new_start_date[:10])
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid new_start_date '{new_start_date}': expected YYYY-MM-DD.",
            ) from exc

        delta_holder: dict[str, int] = {"delta_days": 0}

        def _mutate(doc: ItineraryDocument) -> ChangeSet:
            cs, delta = ItineraryEditor.shift_trip_dates(
                doc, new_start_date=new_start_date, old_start_date=old_start_str
            )
            delta_holder["delta_days"] = delta
            return cs

        await cls.apply_mutation(
            trip_id=trip_id,
            mutation_fn=_mutate,
            user=user,
            session=session,
            actor=actor,
            auto_recompute=False,
        )

        trip = (
            await session.execute(select(TripModel).where(TripModel.id == trip_id))
        ).scalar_one()
        delta_days = delta_holder["delta_days"]
        num_days = max(1, len((trip.itinerary_data or {}).get("days") or []))
        trip.start_date = new_start_dt.isoformat()
        if trip.end_date and old_start_str:
            try:
                old_s = date.fromisoformat(old_start_str[:10])
                old_e = date.fromisoformat(trip.end_date[:10])
                trip.end_date = (new_start_dt + (old_e - old_s)).isoformat()
            except ValueError:
                trip.end_date = (
                    new_start_dt + timedelta(days=num_days - 1)
                ).isoformat()
        else:
            trip.end_date = (new_start_dt + timedelta(days=num_days - 1)).isoformat()

        itin_copy = copy.deepcopy(trip.itinerary_data or {})
        if isinstance(itin_copy.get("hotel"), dict):
            for df in ("check_in_date", "check_out_date"):
                if isinstance(itin_copy["hotel"].get(df), str):
                    itin_copy["hotel"][df] = ItineraryEditor._shift_iso_date(
                        itin_copy["hotel"][df], delta_days
                    )
        trip.itinerary_data = itin_copy

        if reanchor_bookings and delta_days != 0:
            shift_delta = timedelta(days=delta_days)
            ticket_rows = (
                (
                    await session.execute(
                        select(TripTicketModel).where(
                            TripTicketModel.trip_id == trip_id
                        )
                    )
                )
                .scalars()
                .all()
            )
            for t in ticket_rows:
                if t.start_time is not None:
                    t.start_time = t.start_time + shift_delta
                if t.end_time is not None:
                    t.end_time = t.end_time + shift_delta

            expense_rows = (
                (
                    await session.execute(
                        select(TripExpenseModel).where(
                            TripExpenseModel.trip_id == trip_id
                        )
                    )
                )
                .scalars()
                .all()
            )
            for exp in expense_rows:
                if exp.expense_date:
                    exp.expense_date = ItineraryEditor._shift_iso_date(
                        exp.expense_date, delta_days
                    )

        session.add(trip)
        await session.commit()
        await session.refresh(trip)

        if reanchor_bookings and delta_days != 0:
            await sync_trip_tickets(trip, session)
            await session.commit()
            await session.refresh(trip)

        return trip, delta_days

    @classmethod
    async def duplicate_trip(
        cls,
        trip_id: str,
        user: UserModel | None,
        session: AsyncSession,
        new_start_date: Optional[str] = None,
        title_suffix: str = " (Copy)",
    ) -> TripModel:
        """Creates a full copy of an existing trip (days, participants, trip collections)."""
        from datetime import date
        from app.application.trip_editing.itinerary_editor import ItineraryEditor
        from app.db.models import (
            TripCollectionItemModel,
            TripCollectionModel,
            TripParticipantModel,
        )

        source_trip = await assert_trip_access(
            user, trip_id, TripAccessLevel.VIEWER, session
        )
        raw_itin = copy.deepcopy(source_trip.itinerary_data or {})
        doc, _ = ItineraryDocument.from_dict(raw_itin)
        ItineraryEditor.regenerate_stop_ids(doc)

        new_start = source_trip.start_date
        new_end = source_trip.end_date
        if new_start_date:
            try:
                new_start_dt = date.fromisoformat(new_start_date[:10])
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid new_start_date '{new_start_date}'.",
                ) from exc
            ItineraryEditor.shift_trip_dates(
                doc,
                new_start_date=new_start_date,
                old_start_date=source_trip.start_date,
            )
            new_start = new_start_dt.isoformat()
            try:
                span = date.fromisoformat(
                    source_trip.end_date[:10]
                ) - date.fromisoformat(source_trip.start_date[:10])
                new_end = (new_start_dt + span).isoformat()
            except ValueError:
                new_end = new_start

        cloned_itin = doc.to_dict()
        if title_suffix:
            base_title = cloned_itin.get("title") or source_trip.destination
            cloned_itin["title"] = f"{base_title}{title_suffix}"
            if isinstance(cloned_itin.get("travel_constraints"), dict) and cloned_itin[
                "travel_constraints"
            ].get("title"):
                cloned_itin["travel_constraints"]["title"] = cloned_itin["title"]

        new_trip_id = str(uuid.uuid4())
        new_trip = TripModel(
            id=new_trip_id,
            user_id=user.id if user else source_trip.user_id,
            destination=source_trip.destination,
            start_date=new_start,
            end_date=new_end,
            itinerary_data=cloned_itin,
            status="active",
            revision=0,
        )
        session.add(new_trip)
        await session.flush()

        src_parts = (
            (
                await session.execute(
                    select(TripParticipantModel).where(
                        TripParticipantModel.trip_id == trip_id
                    )
                )
            )
            .scalars()
            .all()
        )
        for sp in src_parts:
            session.add(
                TripParticipantModel(
                    id=str(uuid.uuid4()),
                    trip_id=new_trip_id,
                    user_id=sp.user_id,
                    name=sp.name,
                    email=sp.email,
                    role=sp.role,
                )
            )

        src_cols = (
            (
                await session.execute(
                    select(TripCollectionModel).where(
                        TripCollectionModel.trip_id == trip_id
                    )
                )
            )
            .scalars()
            .all()
        )
        for sc in src_cols:
            new_col_id = str(uuid.uuid4())
            session.add(
                TripCollectionModel(
                    id=new_col_id,
                    trip_id=new_trip_id,
                    name=sc.name,
                    description=sc.description,
                    color=sc.color,
                )
            )
            await session.flush()
            src_items = (
                (
                    await session.execute(
                        select(TripCollectionItemModel).where(
                            TripCollectionItemModel.collection_id == sc.id
                        )
                    )
                )
                .scalars()
                .all()
            )
            for si in src_items:
                session.add(
                    TripCollectionItemModel(
                        id=str(uuid.uuid4()),
                        collection_id=new_col_id,
                        poi_id=si.poi_id,
                        notes=si.notes,
                        visit_status=si.visit_status,
                        order_index=si.order_index,
                    )
                )

        await session.commit()
        await session.refresh(new_trip)
        return new_trip
