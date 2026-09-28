import logging
from datetime import date
from typing import Any

from app.schemas.itinerary import TravelConstraints
from app.swarm.state import SwarmState
from langchain_core.runnables.config import RunnableConfig
from langgraph.types import interrupt

logger = logging.getLogger(__name__)


async def _find_overlapping_trip(
    start_date_str: str,
    end_date_str: str,
    user_id: str | None = None,
    existing_trips: list[dict] | None = None,
) -> dict | None:
    """Detects whether requested trip dates clash with existing trips in DB or state."""
    # 1. Check existing trips passed via state (e.g., testing or pre-loaded trips)
    if existing_trips:
        for t in existing_trips:
            t_start = t.get("start_date")
            t_end = t.get("end_date")
            if (
                t_start
                and t_end
                and t_start <= end_date_str
                and t_end >= start_date_str
            ):
                return t

    # 2. Check database
    try:
        from app.db.models import TripModel
        from app.db.session import async_session
        from sqlalchemy.future import select

        async with async_session() as session:
            stmt = select(TripModel)
            if user_id and user_id != "default_user":
                stmt = stmt.where(TripModel.user_id == user_id)
            result = await session.execute(stmt)
            trips = result.scalars().all()
            for t in trips:
                if t.start_date <= end_date_str and t.end_date >= start_date_str:
                    return {
                        "id": str(t.id),
                        "destination": t.destination,
                        "start_date": t.start_date,
                        "end_date": t.end_date,
                    }
    except Exception as e:
        logger.warning(f"[GUARDRAILS] Could not query trip schedule from DB: {e}")

    return None


async def guardrails_node(
    state: SwarmState, config: RunnableConfig | None = None
) -> dict:
    """
    Evaluates deterministic guardrails:
    1. Hard Guardrails (past date, return before departure, same city, duration > 30):
       Flags error and prevents proceeding (ABORT).
    2. Soft Overlap Guardrail:
       Detects clashes with upcoming trips in the database and renders the amber warning modal.
       - PROCEED ANYWAY: resumes graph with guardrail_status = 'PROCEED'.
       - ABORT: halts graph with guardrail_status = 'ABORT'.
    """
    logger.info("--- [PHASE: GUARDRAILS] Evaluating deterministic guardrails ---")

    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        logger.error("[GUARDRAILS] Missing validated itinerary.")
        return {
            "guardrail_status": "ABORT",
            "guardrail_errors": ["Missing validated itinerary."],
        }

    constraints = TravelConstraints(**constraints_dict)
    hard_errors: list[str] = []
    today = date.today()

    # 1. Hard Guardrail: Departure in past
    if constraints.start_date and constraints.start_date < today:
        hard_errors.append(
            f"Departure date ({constraints.start_date}) cannot be in the past."
        )

    # 2. Hard Guardrail: Return before departure
    if (
        constraints.start_date
        and constraints.end_date
        and constraints.end_date < constraints.start_date
    ):
        hard_errors.append(
            f"Return date ({constraints.end_date}) cannot be before departure date ({constraints.start_date})."
        )

    # 3. Hard Guardrail: Origin == Destination
    if (
        constraints.origin_city
        and constraints.destination_city
        and constraints.origin_city.strip().lower()
        == constraints.destination_city.strip().lower()
        and constraints.origin_city.lower() != "unknown"
    ):
        hard_errors.append(
            f"Origin city ({constraints.origin_city}) cannot be the same as destination city."
        )

    # 4. Hard Guardrail: Duration > 30 days
    if constraints.start_date and constraints.end_date:
        duration = (constraints.end_date - constraints.start_date).days
        if duration > 30:
            hard_errors.append(
                f"Trip duration ({duration} days) exceeds maximum limit of 30 days."
            )

    if hard_errors:
        logger.error(f"[GUARDRAILS] Hard guardrail violation: {hard_errors}")
        return {
            "guardrail_status": "ABORT",
            "guardrail_errors": hard_errors,
        }

    # Extract user_id and existing trips for schedule collision evaluation
    user_id = None
    if config and isinstance(config, dict):
        cfg = config.get("configurable", {})
        user_id = cfg.get("user_id")

    existing_trips = state.get("existing_trips")
    start_str = constraints.start_date.isoformat() if constraints.start_date else ""
    end_str = constraints.end_date.isoformat() if constraints.end_date else ""

    if start_str and end_str:
        overlapping = await _find_overlapping_trip(
            start_str, end_str, user_id=user_id, existing_trips=existing_trips
        )
        if overlapping:
            logger.warning(
                f"[GUARDRAILS] Schedule overlap detected with trip {overlapping['destination']} ({overlapping['start_date']} to {overlapping['end_date']})"
            )
            warning_payload = {
                "type": "TRIP_OVERLAP_WARNING",
                "message": f"Trip schedule overlap detected with existing trip to {overlapping['destination']} ({overlapping['start_date']} to {overlapping['end_date']}).",
                "warning_title": "[WARNING] TRIP SCHEDULE OVERLAP",
                "overlapping_trip": overlapping,
                "variant": "warning",
            }

            user_decision: Any = interrupt(warning_payload)

            approved = False
            if isinstance(user_decision, dict):
                approved = bool(
                    user_decision.get("approved") or user_decision.get("proceed")
                )
            elif user_decision is True:
                approved = True

            if approved:
                logger.info(
                    "[GUARDRAILS] User selected PROCEED ANYWAY after schedule overlap warning."
                )
                return {
                    "guardrail_status": "PROCEED",
                    "guardrail_errors": [],
                }
            else:
                logger.info(
                    "[GUARDRAILS] User selected ABORT after schedule overlap warning."
                )
                return {
                    "guardrail_status": "ABORT",
                    "guardrail_errors": ["User aborted due to trip schedule overlap."],
                }

    logger.info("[GUARDRAILS] All guardrails passed successfully.")
    return {
        "guardrail_status": "PROCEED",
        "guardrail_errors": [],
    }
