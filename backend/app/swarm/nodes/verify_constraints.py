import json
import logging
from typing import Any

from app.schemas.itinerary import BookingAnchors, TravelConstraints
from app.swarm.state import SwarmState
from langgraph.types import interrupt

logger = logging.getLogger(__name__)


def _extract_missing_fields(constraints: TravelConstraints) -> list[str]:
    """Identifies any mandatory fields missing from the assembled travel constraints."""
    missing = []
    if not constraints.origin_city or constraints.origin_city.lower() == "unknown":
        missing.append("origin_city")

    if (
        not constraints.destination_city
        or constraints.destination_city.lower() == "unknown"
    ):
        missing.append("destination_city")

    if not constraints.budget_usd or constraints.budget_usd <= 0:
        missing.append("budget_usd")

    if not constraints.start_date:
        missing.append("start_date")

    if not constraints.end_date:
        missing.append("end_date")

    if not constraints.booking_anchors:
        missing.append("booking_anchors")
    else:
        if not constraints.booking_anchors.hotel:
            missing.append("hotel_booking")
        if not constraints.booking_anchors.outbound_flight:
            missing.append("outbound_flight")
        if not constraints.booking_anchors.return_flight:
            missing.append("return_flight")

    if not constraints.meals or len(constraints.meals) == 0:
        missing.append("meals")
    else:
        meal_types = [m.meal_type.upper() for m in constraints.meals]
        if not any("LUNCH" in mt for mt in meal_types) or not any(
            "DINNER" in mt for mt in meal_types
        ):
            missing.append("meals")

    return missing


async def verify_constraints_node(state: SwarmState) -> dict:
    """
    Surfaces parsed ticket data (cities, dates, anchors) and manual constraints for
    human review to eliminate LLM hallucinations and fill missing fields.
    """
    logger.info("--- [PHASE: VERIFY] Human-In-The-Loop Constraints Verification ---")

    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        raise RuntimeError(
            "Missing validated itinerary. Constraint assembly may have failed."
        )

    constraints = TravelConstraints(**constraints_dict)
    missing_fields = _extract_missing_fields(constraints)

    # If auto_verify is explicitly set for headless automated test harnesses, proceed cleanly
    if state.get("auto_verify") is True:
        logger.info(
            "[VERIFY] auto_verify is True (headless test harness); proceeding without interruption."
        )
        return {
            "validated_itinerary": constraints.model_dump(mode="json"),
            "verification_completed": True,
        }

    # If in test mode with missing fields or in interactive production mode, pause for review
    payload = {
        "type": "VERIFICATION_REQUIRED",
        "message": (
            f"Review trip constraints and provide missing fields: {', '.join(missing_fields)}"
            if missing_fields
            else "Review and verify extracted trip constraints."
        ),
        "fields": missing_fields,
        "constraints": constraints.model_dump(mode="json"),
        "booking_anchors": (
            constraints.booking_anchors.model_dump(mode="json")
            if constraints.booking_anchors
            else None
        ),
    }

    answers: Any = interrupt(payload)

    if isinstance(answers, dict):
        raw_answers = answers.get("answers")
        if not isinstance(raw_answers, dict):
            msg_val = answers.get("message")
            if isinstance(msg_val, str):
                try:
                    parsed_msg = json.loads(msg_val)
                    if isinstance(parsed_msg, dict):
                        raw_answers = parsed_msg
                except Exception:
                    raw_answers = answers
            elif isinstance(msg_val, dict):
                raw_answers = msg_val
            else:
                raw_answers = answers

        valid_keys = set(TravelConstraints.model_fields.keys())
        if isinstance(raw_answers, dict):
            if "budget_usd" in raw_answers:
                try:
                    raw_answers["budget_usd"] = float(raw_answers["budget_usd"])
                except (ValueError, TypeError):
                    pass

            if "meals" in raw_answers:
                meals_val = raw_answers["meals"]
                if isinstance(meals_val, str):
                    try:
                        raw_answers["meals"] = json.loads(meals_val)
                    except Exception:
                        pass

            if "booking_anchors" in raw_answers and isinstance(
                raw_answers["booking_anchors"], dict
            ):
                try:
                    raw_answers["booking_anchors"] = BookingAnchors(
                        **raw_answers["booking_anchors"]
                    )
                except Exception as e:
                    logger.warning(f"Could not parse resumed booking anchors: {e}")

            filtered_answers = {
                k: v
                for k, v in raw_answers.items()
                if k in valid_keys and v is not None and v != ""
            }
            constraints_dict.update(filtered_answers)

        clean_constraints = {
            k: v for k, v in constraints_dict.items() if k in valid_keys
        }
        try:
            constraints = TravelConstraints(**clean_constraints)
        except Exception as e:
            logger.error(f"Validation error on resumed user input: {e}")

    return {
        "validated_itinerary": constraints.model_dump(mode="json"),
        "verification_completed": True,
    }
