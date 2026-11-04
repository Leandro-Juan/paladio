"""MCP Prompts defining reusable assistant workflows."""


def prompt_review_my_trip(trip_id: str) -> str:
    """Prompt directing the agent to review itinerary quality, pacing, and potential issues."""
    return f"""Please review trip {trip_id}.
1. Call `get_trip_overview(trip_id='{trip_id}')` and `get_trip_issues(trip_id='{trip_id}')`.
2. Inspect day-by-day balance, meal timings (lunch around 13:00, dinner around 20:00), and transit efficiency.
3. Check if any stops have opening hour conflicts or tight transfers.
4. Provide a clear, actionable summary of strengths and recommendations to improve the trip."""


def prompt_fix_all_issues(trip_id: str) -> str:
    """Prompt directing the agent to identify and resolve itinerary conflicts sequentially."""
    return f"""Please audit and fix all detected issues for trip {trip_id}.
1. Call `get_trip_issues(trip_id='{trip_id}')` to list all opening hour collisions and transit warnings.
2. For opening hour conflicts, use `set_stop_time` or `move_stop` to place attractions inside their operating windows.
3. For tight transfers, adjust dwell duration using `set_stop_duration` or re-sequence with `optimize_day`.
4. Validate resolution with `get_trip_issues` once finished and summarize all applied changes."""


def prompt_rainy_day_plan(trip_id: str, day: int) -> str:
    """Prompt asking the agent to substitute outdoor activities with indoor venues for bad weather."""
    return f"""Heavy rain is forecasted for Day {day} of trip {trip_id}.
1. Inspect the day's stops using `get_itinerary(trip_id='{trip_id}', detail='day', day={day})`.
2. Call `suggest_weather_swaps(trip_id='{trip_id}', day={day})` to find high-rated indoor museums, galleries, and markets.
3. Suggest replacing outdoor walks or parks with indoor cultural experiences using `what_if` simulation before applying."""


def prompt_split_the_bill(trip_id: str) -> str:
    """Prompt directing the agent to compute expense splits and settlement transfers."""
    return f"""Please calculate the final bill settlement for trip {trip_id}.
1. Call `list_expenses(trip_id='{trip_id}')` to review all expenditures and payers.
2. Call `get_settlement(trip_id='{trip_id}', simplify=True)`.
3. Provide a friendly breakdown showing who paid what, net balances, and the exact minimum transfers required."""


def prompt_make_day_relaxed(trip_id: str, day: int) -> str:
    """Prompt directing the agent to lighten a day's schedule and widen dwell times."""
    return f"""Please make Day {day} of trip {trip_id} more relaxed and leisurely.
1. Call `get_itinerary(trip_id='{trip_id}', detail='day', day={day})`.
2. Ensure there are no more than 3 major stops, add a 90-minute meal window using `add_meal`, and insert a 60-minute break with `add_free_time`.
3. Re-run `optimize_day(trip_id='{trip_id}', day={day})` to smooth transit."""


def prompt_add_dinner_near(trip_id: str, day: int) -> str:
    """Prompt directing the agent to find a top dinner spot near the final attraction of the day."""
    return f"""Please find and schedule a great dinner near the end of Day {day} on trip {trip_id}.
1. Call `get_itinerary(trip_id='{trip_id}', detail='day', day={day})` to find the last afternoon stop.
2. Call `find_nearby(trip_id='{trip_id}', stop_id=<last_stop_id>, category='restaurant', radius_meters=1000)`.
3. Pick a top-rated dining spot and schedule it as dinner using `add_meal`."""
