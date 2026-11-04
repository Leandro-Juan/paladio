from __future__ import annotations

import copy
import logging
import uuid
from typing import Any, Callable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
