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

import httpx

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


logger = logging.getLogger("paladio.e2e")

DEFAULT_WS_URL = os.getenv("PALADIO_WS_URL", "ws://127.0.0.1:8000/api/ws/stream")
DEFAULT_API_URL = os.getenv("PALADIO_API_URL", "http://127.0.0.1:8000/api")
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

    generate_payload = {
        "prompt": prompt,
        "destination_city": destination_city,
        "origin_city": origin_city,
        "start_date": start_date,
        "end_date": end_date,
        "budget_usd": budget_usd,
        "auto_verify": True,
        "test_mode": True,
        "booking_anchors": {
            "hotel": simulated_hotel,
            "outbound_flight": simulated_outbound_flight,
            "return_flight": simulated_return_flight,
        },
        "meals": active_meals,
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

    async with httpx.AsyncClient(timeout=15.0) as client:
        gen_resp = await client.post(
            f"{api_url}/trips/generate",
            json=generate_payload,
            headers=auth_headers,
        )
        assert (
            gen_resp.status_code == 202
        ), f"Failed to start generation job: {gen_resp.status_code} - {gen_resp.text}"
        job_data = gen_resp.json()
        job_id = job_data["id"]
        log_step("JOB", f"Started background generation job {job_id}")

    events_received: list[dict] = []
    completed_job: dict | None = None
    start_time = time.time()

    async with httpx.AsyncClient(timeout=15.0) as client:
        while time.time() - start_time < timeout_seconds:
            poll_resp = await client.get(
                f"{api_url}/trips/generation-jobs/{job_id}",
                headers=auth_headers,
            )
            assert (
                poll_resp.status_code == 200
            ), f"Failed to poll job {job_id}: {poll_resp.status_code}"
            job = poll_resp.json()
            events_received.append(
                {"event": job.get("stage"), "status": job.get("status")}
            )

            j_status = job.get("status")
            if j_status == "awaiting_input":
                log_step(
                    "HITL",
                    f"Job awaiting input ({job.get('interrupt_type')}): auto-approving...",
                )
                res_resp = await client.post(
                    f"{api_url}/trips/generation-jobs/{job_id}/resume",
                    json={"approved": True, "proceed": True},
                    headers=auth_headers,
                )
                assert res_resp.status_code == 200
            elif j_status == "completed":
                completed_job = job
                break
            elif j_status == "aborted":
                raise RuntimeError(
                    f"Trip aborted by guardrails: {job.get('guardrail_errors')}"
                )
            elif j_status == "failed":
                raise RuntimeError(f"Engine emitted error: {job.get('error_message')}")
            elif j_status == "cancelled":
                raise RuntimeError("Trip generation job was cancelled.")

            await asyncio.sleep(1.5)

    assert completed_job is not None, "Trip generation job timed out before completion"
    trip_id = completed_job.get("trip_id")
    assert trip_id is not None, "Completed job is missing persisted trip_id"
    log_step("VAULT", f"Backend persisted trip ID: {trip_id}")

    async with httpx.AsyncClient(timeout=10.0) as client:
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
        latest_itinerary = fetched_trip.get("itinerary_data") or {}
        assert "days" in latest_itinerary, "Produced itinerary lacks 'days' array"
        assert (
            len(latest_itinerary["days"]) == duration_days
        ), f"Expected {duration_days} days, got {len(latest_itinerary['days'])}"

        await client.post(
            f"{api_url}/trips/generation-jobs/{job_id}/acknowledge",
            headers=auth_headers,
        )
        log_step(
            "VAULT",
            f"Verified backend-persisted roundtrip in database for trip ID: {trip_id}",
        )

    return {
        "trip_id": trip_id,
        "itinerary": latest_itinerary,
        "saved_trip": fetched_trip,
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
