import logging
from app.swarm.state import SwarmState

logger = logging.getLogger(__name__)

async def alert_node(state: SwarmState) -> dict:
    """
    Stub node for setting alerts (Phase 3).
    For Phase 2, this just indicates that the alert was scheduled.
    """
    logger.info("--- [PHASE: ALERT] Scheduling proactive monitoring alert ---")
    
    # In Phase 3, this will interact with Celery/TimescaleDB
    # For now, we just return a status string in final_itinerary
    # so the WebSocket can pass it back to the client.
    
    return {
        "final_itinerary": {
            "status": "Alert successfully scheduled."
        }
    }
