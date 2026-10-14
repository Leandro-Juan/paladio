#!/usr/bin/env python3
"""
Paladio E2E Trip Generation Script (Exact Frontend Fidelity).

Replicates the exact user inputs, WebSocket protocol, Human-in-the-Loop verification
auto-resumes, solver telemetry, and Trip Vault persistence executed by the Paladio frontend
(TripPreparationForm.tsx, usePaladioSocket.ts, engine/page.tsx, and useTrips.ts).

Prints detailed live telemetry during execution, and outputs the complete
generated itinerary at the end.
"""

import argparse
import asyncio
import datetime
import json
import logging
import os
import sys
import time
import uuid

import httpx
import websockets

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

logger = logging.getLogger("paladio.e2e")

DEFAULT_WS_URL = os.getenv("PALADIO_WS_URL", "ws://127.0.0.1:8000/api/v1/ws/stream")
DEFAULT_API_URL = os.getenv("PALADIO_API_URL", "http://127.0.0.1:8000/api/v1")
DEFAULT_USER_ID = "e2e_tester_admin"

# Default meal windows matching TripPreparationForm.tsx
DEFAULT_MEALS = [
    {"meal_type": "BREAKFAST", "start_time": "08:00", "end_time": "10:00"},
    {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:30"},
    {"meal_type": "DINNER", "start_time": "19:30", "end_time": "22:00"},
]

TRIP_SCENARIOS = [
    {
        "name": "Madrid Cultural Weekend (2 days)",
        "origin_city": "London",
        "destination_city": "Madrid",
        "prompt": "Visit the main cultural landmarks and museums. Visit el Prado. Love traditional tapas and relaxed cafes.",
        "budget_usd": 600.0,
        "days": 2,
    },
    {
        "name": "Paris Heritage Discovery (3 days)",
        "origin_city": "Madrid",
        "destination_city": "Paris",
        "prompt": "Explore historic monuments, art museums, and authentic French bistros.",
        "budget_usd": 1200.0,
        "days": 3,
    },
    {
        "name": "Sevilla Historic Walk (2 days)",
        "origin_city": "Madrid",
        "destination_city": "Sevilla",
        "prompt": "Visit Alcazar, Cathedral, and enjoy tapas and flamenco.",
        "budget_usd": 800.0,
        "days": 2,
    },
]


def log_step(category: str, message: str) -> None:
    """Print formatted timestamped telemetry message."""
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{category:<10}] {message}", flush=True)


def generate_test_jwt(user_id: str = DEFAULT_USER_ID) -> str:
    """Generate HS256 JWT matching backend/app/core/security.py."""
    import jwt
    from app.core.security import ALGORITHM, SECRET_KEY

    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)
    to_encode = {"sub": user_id, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def format_itinerary_summary(itinerary: dict) -> None:
    """Print a clean human-readable schedule followed by the full raw JSON."""
    print("\n" + "=" * 80)
    print("🗺️  GENERATED TRIP ITINERARY")
    print("=" * 80)

    summary = itinerary.get("summary", {})
    if summary:
        print(f"• Scheduled POIs:  {summary.get('total_pois_scheduled', 'N/A')}")
        print(f"• Total Time:      {summary.get('total_time_mins', 'N/A')} mins")
        print(f"• Total Cost:      €{summary.get('total_cost_eur', 0.0):.2f}")
        print(f"• Solver Nodes:    {summary.get('nodes_expanded', 'N/A')}")

    themes = itinerary.get("themes", [])
    if themes:
        print(f"• Day Themes:      {', '.join(themes)}")

    days = itinerary.get("days", [])
    print(f"\n📅 Daily Schedule ({len(days)} Calendar Days):")
    print("-" * 80)

    for day_data in days:
        day_num = day_data.get("day", "?")
        date = day_data.get("date", "")
        theme = day_data.get("theme", "")
        print(f"\n[DAY {day_num}] {date} — Theme: {theme or 'Explore & Discover'}")

        flight_info = day_data.get("flight_info")
        if flight_info:
            direction = flight_info.get("direction", "flight")
            dep_time = flight_info.get("departure_time", "")
            arr_time = flight_info.get("arrival_time", "")
            orig = flight_info.get("origin_iata", "")
            dest = flight_info.get("destination_iata", "")
            print(
                f"  ✈️  Flight ({direction}): {orig} -> {dest} (dep: {dep_time}, arr: {arr_time})"
            )

        waypoints = day_data.get("waypoints", [])
        if not waypoints:
            print("  (No intermediate waypoints scheduled)")
        for wp in waypoints:
            poi = wp.get("poi") if isinstance(wp.get("poi"), dict) else wp
            poi_name = poi.get("name", wp.get("name", "Unknown POI"))
            arr = wp.get("arrival_time") or wp.get("arrival") or ""
            dep = wp.get("departure_time") or wp.get("departure") or ""
            cost = poi.get("cost_eur", 0.0)
            category = poi.get("taxonomy_category", "")
            time_str = f"{arr} - {dep}" if arr and dep else (arr or dep or "")
            cat_str = f" [{category}]" if category else ""
            print(f"  📍 {time_str:15} | {poi_name}{cat_str} (€{cost:.2f})")

    print("\n" + "=" * 80)
    print("📋 FULL GENERATED ITINERARY JSON:")
    print("=" * 80)
    print(json.dumps(itinerary, indent=2, ensure_ascii=False))
    print("=" * 80 + "\n", flush=True)


async def execute_frontend_trip_e2e(
    origin_city: str = "Madrid",
    destination_city: str = "Sevilla",
    duration_days: int = 2,
    prompt: str = "Visit main cultural attractions, museums, and enjoy local tapas.",
    budget_usd: float = 1000.0,
    meals: list[dict] | None = None,
    ws_url: str = DEFAULT_WS_URL,
    api_url: str = DEFAULT_API_URL,
    user_id: str = DEFAULT_USER_ID,
    plan_mode: str = "real",
    timeout_seconds: float = 300.0,
) -> dict:
    """
    Execute full trip generation replicating the frontend flow exactly.
    """
    assert (
        origin_city != destination_city
    ), f"Domain guardrail violation: origin and destination must differ ('{origin_city}' == '{destination_city}')"

    today = datetime.date.today()
    start_date = (today + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
    end_date = (
        today + datetime.timedelta(days=7 + max(0, duration_days - 1))
    ).strftime("%Y-%m-%d")

    active_meals = meals if meals is not None else DEFAULT_MEALS

    log_step(
        "SETUP",
        f"Trip request: {origin_city} -> {destination_city} ({duration_days} days: {start_date} to {end_date}, Budget: ${budget_usd:,.2f})",
    )
    log_step("SETUP", f'Prompt: "{prompt}"')

    token = generate_test_jwt(user_id=user_id)
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    log_step("AUTH", f"Generated authentication token for user '{user_id}'")

    thread_id = f"paladio_{int(time.time())}_{uuid.uuid4().hex[:6]}"

    # Simulated flight and hotel anchors matching TripPreparationForm.tsx
    simulated_hotel = {
        "name": f"{destination_city} Center",
        "city": destination_city,
        "address": None,
        "check_in_date": start_date,
        "check_out_date": end_date,
    }
    simulated_outbound_flight = {
        "flight_number": None,
        "airline": None,
        "origin_iata": origin_city[:3].upper(),
        "destination_iata": destination_city[:3].upper(),
        "departure_time": f"{start_date}T10:00:00",
        "arrival_time": f"{start_date}T13:00:00",
        "direction": "arrival",
        "flight_duration_minutes": 180,
    }
    simulated_return_flight = {
        "flight_number": None,
        "airline": None,
        "origin_iata": destination_city[:3].upper(),
        "destination_iata": origin_city[:3].upper(),
        "departure_time": f"{end_date}T14:00:00",
        "arrival_time": f"{end_date}T17:00:00",
        "direction": "departure",
        "flight_duration_minutes": 180,
    }

    chat_payload = {
        "thread_id": thread_id,
        "message": prompt,
        "manual_constraints": {
            "origin_city": origin_city,
            "destination_city": destination_city,
            "start_date": start_date,
            "end_date": end_date,
            "budget_usd": budget_usd,
            "pace": "balanced",
            "flight_cost": 0,
            "tag_affinities": {"art_culture": 0.8, "food_culinary": 0.7},
            "travel_tastes": ["cultural"],
            "preferred_cuisines": ["tapas"] if "tapas" in prompt.lower() else [],
            "plan_mode": plan_mode,
            "test_mode": True,
            "booking_anchors": {
                "hotel": simulated_hotel,
                "outbound_flight": simulated_outbound_flight,
                "return_flight": simulated_return_flight,
            },
            "meals": active_meals,
        },
    }

    ws_target_url = f"{ws_url}?token={token}"
    events_received: list[dict] = []
    latest_itinerary: dict | None = None
    inference_complete = False

    log_step("WS", f"Connecting to WebSocket endpoint {ws_target_url}...")

    start_time = time.time()
    reconnect_attempts = 0
    max_reconnects = 3

    while not inference_complete and (time.time() - start_time < timeout_seconds):
        try:
            async with websockets.connect(
                ws_target_url, ping_timeout=None, ping_interval=None
            ) as ws:
                # Send attach frame matching SocketContext.tsx
                attach_msg = json.dumps({"action": "attach", "thread_id": thread_id})
                await ws.send(attach_msg)

                # Send initial chat message on first connect
                if not events_received:
                    await ws.send(json.dumps(chat_payload))
                    log_step(
                        "TX",
                        f"Submitted frontend mission payload for thread {thread_id}",
                    )

                while time.time() - start_time < timeout_seconds:
                    try:
                        raw_msg = await asyncio.wait_for(ws.recv(), timeout=25.0)
                    except asyncio.TimeoutError:
                        elapsed = int(time.time() - start_time)
                        log_step(
                            "HEARTBEAT", f"Waiting on solver... (elapsed: {elapsed}s)"
                        )
                        continue

                    try:
                        msg_json = json.loads(raw_msg)
                    except Exception:
                        continue

                    event = msg_json.get("event")
                    status = msg_json.get("status")
                    events_received.append(msg_json)

                    log_step("EVENT", f"{event} (status: {status})")

                    # Handle Human-In-The-Loop Verification (Matches engine/page.tsx line 355 & SocketContext.tsx)
                    if event == "VERIFICATION_REQUIRED":
                        log_step(
                            "HITL",
                            "Verification requested: Auto-approving extracted constraints...",
                        )
                        resume_payload = {
                            "action": "resume",
                            "thread_id": thread_id,
                            "approved": True,
                            "proceed": True,
                            "answers": {"approved": True, "proceed": True},
                            "message": json.dumps({"approved": True, "proceed": True}),
                            "data": {"approved": True, "proceed": True},
                        }
                        await ws.send(json.dumps(resume_payload))

                    # Handle Schedule Overlap Warning (Matches engine/page.tsx line 481 & SocketContext.tsx)
                    elif event == "TRIP_OVERLAP_WARNING":
                        log_step(
                            "HITL",
                            "Trip schedule overlap detected: Auto-approving overlap to proceed...",
                        )
                        resume_payload = {
                            "action": "resume",
                            "thread_id": thread_id,
                            "approved": True,
                            "proceed": True,
                            "answers": {"approved": True, "proceed": True},
                            "message": json.dumps({"approved": True, "proceed": True}),
                            "data": {"approved": True, "proceed": True},
                        }
                        await ws.send(json.dumps(resume_payload))

                    # Capture Itinerary Output from EVALUATING_ROUTES
                    elif event == "EVALUATING_ROUTES":
                        data = msg_json.get("data")
                        if isinstance(data, dict) and "days" in data:
                            latest_itinerary = data
                            log_step(
                                "SOLVER",
                                f"Captured optimized itinerary with {len(data['days'])} days!",
                            )

                    # Inference Complete
                    elif event == "DONE":
                        log_step("ENGINE", "Inference cycle complete (DONE received).")
                        inference_complete = True
                        break

                    elif event == "GUARDRAILS_ABORTED":
                        abort_data = msg_json.get("data")
                        log_step("ERROR", f"Guardrails aborted trip: {abort_data}")
                        raise RuntimeError(f"Trip aborted by guardrails: {abort_data}")

                    elif event == "ERROR":
                        err_msg = msg_json.get("status", "Unknown engine error")
                        log_step("ERROR", f"Engine emitted error: {err_msg}")
                        raise RuntimeError(f"Engine emitted error: {err_msg}")

        except (
            websockets.exceptions.ConnectionClosedError,
            websockets.exceptions.ConnectionClosedOK,
        ) as e:
            if inference_complete or (latest_itinerary and e.code == 1000):
                break
            reconnect_attempts += 1
            if reconnect_attempts > max_reconnects:
                raise
            log_step(
                "WS",
                f"Connection closed (code: {e.code}). Reconnecting attempt {reconnect_attempts}/{max_reconnects}...",
            )
            await asyncio.sleep(1.0)

    assert (
        latest_itinerary is not None
    ), "Optimization solver did not produce an itinerary"
    assert "days" in latest_itinerary, "Produced itinerary lacks 'days' array"
    assert (
        len(latest_itinerary["days"]) == duration_days
    ), f"Expected {duration_days} days, got {len(latest_itinerary['days'])}"

    # Save to Trip Vault via POST /trips/
    log_step(
        "VAULT",
        f"Saving generated itinerary to Trip Vault via POST {api_url}/trips/...",
    )
    save_body = {
        "destination": destination_city,
        "start_date": f"{start_date}T00:00:00.000Z",
        "end_date": f"{end_date}T00:00:00.000Z",
        "itinerary_data": latest_itinerary,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        save_resp = await client.post(
            f"{api_url}/trips/",
            json=save_body,
            headers=auth_headers,
        )
        assert (
            save_resp.status_code == 201
        ), f"Failed to save trip: {save_resp.status_code} - {save_resp.text}"
        saved_trip = save_resp.json()
        assert "id" in saved_trip, "Saved trip missing ID"
        trip_id = saved_trip["id"]
        assert saved_trip["destination"] == destination_city
        log_step("VAULT", f"Trip successfully saved with ID: {trip_id}")

        # Verify Roundtrip Persistence in Database via GET /trips/{id}
        get_resp = await client.get(
            f"{api_url}/trips/{trip_id}",
            headers=auth_headers,
        )
        assert (
            get_resp.status_code == 200
        ), f"Failed to fetch saved trip: {get_resp.status_code}"
        fetched_trip = get_resp.json()
        assert fetched_trip["id"] == trip_id
        assert fetched_trip["destination"] == destination_city
        log_step(
            "VAULT",
            f"Verified roundtrip persistence in database for trip ID: {trip_id}",
        )

    return {
        "trip_id": trip_id,
        "itinerary": latest_itinerary,
        "saved_trip": saved_trip,
        "events": events_received,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Paladio E2E Trip Generation Script (Exact Frontend Fidelity)"
    )
    parser.add_argument(
        "--origin", default="Madrid", help="Origin city (default: Madrid)"
    )
    parser.add_argument(
        "--destination",
        "--city",
        default="Sevilla",
        help="Destination city (default: Sevilla)",
    )
    parser.add_argument(
        "--days", type=int, default=2, help="Duration in days (default: 2)"
    )
    parser.add_argument(
        "--budget", type=float, default=1500.0, help="Budget in USD (default: 1500)"
    )
    parser.add_argument(
        "--prompt",
        default="Visit Alcazar, Cathedral, and enjoy tapas and flamenco",
        help="Prompt intent",
    )
    parser.add_argument(
        "--ws-url",
        default=DEFAULT_WS_URL,
        help=f"WebSocket endpoint (default: {DEFAULT_WS_URL})",
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help=f"API endpoint (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--plan-mode",
        default="real",
        choices=["real", "estimated"],
        help="Planning mode ('real' requires Valhalla OSM routing tiles; 'estimated' uses spatial estimation for unmapped cities)",
    )

    args = parser.parse_args()

    print("\n" + "=" * 80)
    print("🚀 STARTING PALADIO E2E TRIP GENERATION")
    print("=" * 80)

    try:
        outcome = asyncio.run(
            execute_frontend_trip_e2e(
                origin_city=args.origin,
                destination_city=args.destination,
                duration_days=args.days,
                prompt=args.prompt,
                budget_usd=args.budget,
                ws_url=args.ws_url,
                api_url=args.api_url,
                plan_mode=args.plan_mode,
            )
        )
        # Print the final generated itinerary (schedule + full JSON)
        format_itinerary_summary(outcome["itinerary"])
        print(
            f"✅ Trip successfully generated and saved (Trip ID: {outcome['trip_id']})\n"
        )
    except Exception as e:
        print(f"\n❌ FAILED: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
