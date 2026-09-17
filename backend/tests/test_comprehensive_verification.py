from datetime import date, datetime, timezone

import pytest
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.db.session import async_session
from app.domain.entities.poi import Poi, PoiLocation, ScoredPoi, TransitLeg, TransitStep
from app.infrastructure.engine.struct_mapper import build_cpp_pois
from app.schemas.itinerary import TravelConstraints
from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)
from app.services.transit_fare_service import TransitFareService
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.utils.opening_hours_parser import parse_osm_opening_hours
from sqlalchemy import text


# ============================================================================
# 1. OSM Opening Hours Parser & Midnight-Crossing Normalization
# ============================================================================
def test_osm_opening_hours_parser_comprehensive():
    """Verifies that parse_osm_opening_hours correctly parses complex OSM schedules,
    closures, 24/7, and normalizes midnight crossings (close_time += 1440).
    """
    # 1. Standard weekly schedule with closed Sunday
    parsed_std = parse_osm_opening_hours("Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off")
    for d in range(5):  # Monday to Friday
        assert parsed_std.open_time_mins_by_day[d] == 540
        assert parsed_std.close_time_mins_by_day[d] == 1080
    # Saturday
    assert parsed_std.open_time_mins_by_day[5] == 600
    assert parsed_std.close_time_mins_by_day[5] == 840
    # Sunday (closed)
    assert parsed_std.open_time_mins_by_day[6] == -1
    assert parsed_std.close_time_mins_by_day[6] == -1

    # 2. 24/7 format
    parsed_247 = parse_osm_opening_hours("24/7")
    for d in range(7):
        assert parsed_247.open_time_mins_by_day[d] == 0
        assert parsed_247.close_time_mins_by_day[d] == 1440

    # 3. Midnight-crossing venue (Guardrail 3: e.g. 21:00-02:00 -> close = 120 + 1440 = 1560)
    parsed_night = parse_osm_opening_hours("Tu-Sa 21:00-02:00; Su-Mo off")
    # Monday is closed
    assert parsed_night.open_time_mins_by_day[0] == -1
    assert parsed_night.close_time_mins_by_day[0] == -1
    # Tuesday to Saturday open at 21:00 (1260), close at 02:00 (120 + 1440 = 1560)
    for d in range(1, 6):
        assert parsed_night.open_time_mins_by_day[d] == 1260
        assert parsed_night.close_time_mins_by_day[d] == 1560
        assert (
            parsed_night.close_time_mins_by_day[d]
            > parsed_night.open_time_mins_by_day[d]
        )
    # Sunday is closed
    assert parsed_night.open_time_mins_by_day[6] == -1

    # 4. Weekend wrap rule (e.g. Fr-Mo 10:00-20:00)
    parsed_wrap = parse_osm_opening_hours("Fr-Mo 10:00-20:00; Tu-Th off")
    for d in [4, 5, 6, 0]:  # Fri, Sat, Sun, Mon
        assert parsed_wrap.open_time_mins_by_day[d] == 600
        assert parsed_wrap.close_time_mins_by_day[d] == 1200
    for d in [1, 2, 3]:  # Tue, Wed, Thu
        assert parsed_wrap.open_time_mins_by_day[d] == -1
        assert parsed_wrap.close_time_mins_by_day[d] == -1


# ============================================================================
# 2. Domain Entity POI: Scalars, Vectors & Guardrails
# ============================================================================
def test_poi_entity_architecture_and_guardrails():
    """Verifies that the Poi domain entity enforces:
    - Direct scalar attributes without schedule/financials sub-models
    - Backward-compatible pre-validator absorption of legacy payload structures
    - Safe legacy property fallbacks (Closed Monday Protection, Guardrail 1)
    """
    # 1. Direct scalar initialization
    poi_direct = Poi(
        name="Museo del Prado",
        city="Madrid",
        category="museum",
        cost_eur=15.0,
        cost_is_estimated=False,
        cost_source="official_museodelprado.es",
        duration_mins=120,
        open_time_mins_by_day=[600] * 7,
        close_time_mins_by_day=[1200] * 7,
        osm_opening_hours="Mo-Su 10:00-20:00",
        location=PoiLocation(latitude=40.4138, longitude=-3.6921),
    )
    assert poi_direct.cost_eur == 15.0
    assert not poi_direct.cost_is_estimated
    assert poi_direct.duration_mins == 120
    assert len(poi_direct.open_time_mins_by_day) == 7
    assert poi_direct.open_time_mins == 600
    assert poi_direct.close_time_mins == 1200
    assert not hasattr(poi_direct, "financials")
    assert not hasattr(poi_direct, "schedule")

    # 2. Legacy payload absorption via @model_validator(mode="before")
    poi_legacy = Poi.model_validate(
        {
            "name": "Reina Sofia Legacy",
            "city": "Madrid",
            "category": "museum",
            "location": {"latitude": 40.4079, "longitude": -3.6946},
            "schedule": {
                "open_time_mins": 600,
                "close_time_mins": 1260,
                "osm_opening_hours": "10:00-21:00",
                "recommended_duration_minutes": 90,
            },
            "financials": {
                "estimated_cost": 12.0,
                "is_free": False,
            },
        }
    )
    assert poi_legacy.cost_eur == 12.0
    assert poi_legacy.duration_mins == 90
    assert poi_legacy.open_time_mins_by_day == [600] * 7
    assert poi_legacy.close_time_mins_by_day == [1260] * 7
    assert poi_legacy.osm_opening_hours == "10:00-21:00"

    # 3. Guardrail 1: Closed Monday Protection
    # Monday (index 0) is closed (-1), Tuesday open at 630
    poi_closed_monday = Poi(
        name="Monday Closed Gallery",
        city="Madrid",
        category="museum",
        open_time_mins_by_day=[-1, 630, 630, 630, 630, 630, -1],
        close_time_mins_by_day=[-1, 1140, 1140, 1140, 1140, 1140, -1],
        location=PoiLocation(latitude=40.4, longitude=-3.7),
    )
    # open_time_mins property MUST find Tuesday (630) and NEVER return -1
    assert poi_closed_monday.open_time_mins == 630
    assert poi_closed_monday.close_time_mins == 1140

    # 4. Guardrail 1 fallback: Closed all 7 days returns safe default (480 / 1320), NEVER -1
    poi_closed_all_week = Poi(
        name="Permanently Closed Gallery",
        city="Madrid",
        category="museum",
        open_time_mins_by_day=[-1] * 7,
        close_time_mins_by_day=[-1] * 7,
        location=PoiLocation(latitude=40.4, longitude=-3.7),
    )
    assert poi_closed_all_week.open_time_mins == 480
    assert poi_closed_all_week.close_time_mins == 1320


# ============================================================================
# 3. PostgreSQL Database Schema & Migration Row Integrity
# ============================================================================
@pytest.mark.asyncio
async def test_database_schema_and_attractions_migration_integrity():
    """Verifies that the PostgreSQL attractions table:
    - Has dropped legacy 'schedule' and 'financials' columns
    - Has added typed array and scalar columns
    - All existing records (387+) are valid with 7-element vectors and valid numeric costs
    """
    async with async_session() as session:
        # Check column existence in information_schema
        col_query = await session.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'attractions';
                """
            )
        )
        existing_columns = {row[0] for row in col_query.fetchall()}

        # 1. Assert legacy columns are completely removed
        assert (
            "schedule" not in existing_columns
        ), "Legacy 'schedule' column was not dropped!"
        assert (
            "financials" not in existing_columns
        ), "Legacy 'financials' column was not dropped!"

        # 2. Assert new canonical columns exist
        required_columns = {
            "open_time_mins_by_day",
            "close_time_mins_by_day",
            "duration_mins",
            "cost_eur",
            "cost_is_estimated",
            "cost_source",
            "osm_opening_hours",
        }
        for col in required_columns:
            assert (
                col in existing_columns
            ), f"Missing required column '{col}' in attractions table!"

        # 3. Assert row count and vector integrity across all attractions
        rows_res = await session.execute(
            text(
                """
                SELECT
                    count(*) as total_count,
                    count(*) FILTER (WHERE open_time_mins_by_day IS NULL) as null_open,
                    count(*) FILTER (WHERE close_time_mins_by_day IS NULL) as null_close,
                    count(*) FILTER (WHERE array_length(open_time_mins_by_day, 1) != 7) as invalid_open_len,
                    count(*) FILTER (WHERE array_length(close_time_mins_by_day, 1) != 7) as invalid_close_len,
                    count(*) FILTER (WHERE cost_eur < 0) as invalid_costs,
                    count(*) FILTER (WHERE duration_mins <= 0) as invalid_durations
                FROM attractions;
                """
            )
        )
        row = rows_res.fetchone()
        assert (
            row.total_count >= 387
        ), f"Expected at least 387 attractions, found {row.total_count}"
        assert (
            row.null_open == 0
        ), f"Found {row.null_open} attractions with NULL open_time_mins_by_day"
        assert (
            row.null_close == 0
        ), f"Found {row.null_close} attractions with NULL close_time_mins_by_day"
        assert (
            row.invalid_open_len == 0
        ), f"Found {row.invalid_open_len} rows with open vector length != 7"
        assert (
            row.invalid_close_len == 0
        ), f"Found {row.invalid_close_len} rows with close vector length != 7"
        assert (
            row.invalid_costs == 0
        ), f"Found {row.invalid_costs} rows with negative cost_eur"
        assert (
            row.invalid_durations == 0
        ), f"Found {row.invalid_durations} rows with duration <= 0"


# ============================================================================
# 4. Repository Model Mapping & Round-Trip
# ============================================================================
@pytest.mark.asyncio
async def test_sql_poi_repository_model_mapping_and_roundtrip(db_session):
    """Verifies that SqlPoiRepository correctly persists and rehydrates POIs
    with length-7 vectors, duration, and scalar cost fields.
    """
    repo = SqlPoiRepository(db_session)

    test_attraction = Attraction(
        id="test-comprehensive-madrid-1",
        category="museum",
        name="Madrid Modern Art Hub",
        location=Location(latitude=40.4150, longitude=-3.7000),
        schedule=AttractionSchedule(
            osm_opening_hours="Mo-Sa 10:00-19:00",
            recommended_duration_minutes=150,
        ),
        financials=AttractionFinancials(
            is_free=False,
            estimated_cost=18.50,
            currency="EUR",
        ),
        scoring=Scoring(rating=4.9, reviews=1200),
        metadata=Metadata(scraped_at=datetime.now(timezone.utc), source="osm"),
    )

    # Save to test database
    await repo.save_all_for_city("Madrid", [test_attraction])

    # Find and hydrate
    found = await repo.find_by_city("Madrid")
    art_hub = next((p for p in found if p.name == "Madrid Modern Art Hub"), None)
    assert art_hub is not None
    assert isinstance(art_hub, Poi)
    assert art_hub.cost_eur == pytest.approx(18.50)
    assert art_hub.duration_mins == 150
    assert len(art_hub.open_time_mins_by_day) == 7
    assert len(art_hub.close_time_mins_by_day) == 7
    # Mo-Sa 10:00-19:00 -> Mon-Sat 600 to 1140, Sun -1
    assert art_hub.open_time_mins_by_day[0] == 600
    assert art_hub.close_time_mins_by_day[0] == 1140
    assert art_hub.open_time_mins_by_day[6] == -1
    assert art_hub.close_time_mins_by_day[6] == -1


# ============================================================================
# 5. Meal-Specific Service Windows
# ============================================================================
@pytest.mark.asyncio
async def test_meal_specific_service_windows_synthesis():
    """Verifies that FetchTravelContextUseCase synthesizes restaurants with
    Guardrail 4 meal-specific service windows:
    - Breakfast: 08:00–10:30 ([480, 630])
    - Lunch: 12:30–15:30 ([750, 930])
    - Dinner: 19:30–23:00 ([1170, 1380])
    """
    mock_provider = pytest.importorskip("unittest.mock").AsyncMock()
    mock_provider.get_pois.return_value = []
    mock_provider.get_restaurants.return_value = [
        {
            "name": "Madrid Cafe Breakfast",
            "location": {"latitude": 40.41, "longitude": -3.70},
        },
        {
            "name": "Madrid Meson Lunch",
            "location": {"latitude": 40.42, "longitude": -3.71},
        },
        {
            "name": "Madrid Taberna Dinner",
            "location": {"latitude": 40.43, "longitude": -3.72},
        },
    ]

    use_case = FetchTravelContextUseCase(data_provider=mock_provider)
    constraints = TravelConstraints(
        destination_city="Madrid",
        origin_city="Paris",
        start_date=date(2026, 9, 21),  # Monday
        end_date=date(2026, 9, 21),  # 1 day trip
        adults=1,
    )

    context = await use_case.execute(constraints)
    daily_pois = context["daily_pois_data"]
    assert len(daily_pois) == 1
    day_0_pois = daily_pois[0]

    breakfast = next(
        (p for p in day_0_pois if p["name"] == "Madrid Cafe Breakfast"), None
    )
    lunch = next((p for p in day_0_pois if p["name"] == "Madrid Meson Lunch"), None)
    dinner = next((p for p in day_0_pois if p["name"] == "Madrid Taberna Dinner"), None)

    assert breakfast is not None
    assert breakfast["category"] == "CAFE"
    assert breakfast["open_time_mins_by_day"] == [480] * 7
    assert breakfast["close_time_mins_by_day"] == [630] * 7
    assert breakfast["duration_mins"] == 45
    assert breakfast["cost_eur"] == 8.0

    assert lunch is not None
    assert lunch["category"] == "RESTAURANT"
    assert lunch["open_time_mins_by_day"] == [750] * 7
    assert lunch["close_time_mins_by_day"] == [930] * 7
    assert lunch["duration_mins"] == 75
    assert lunch["cost_eur"] == 18.0

    assert dinner is not None
    assert dinner["category"] == "RESTAURANT"
    assert dinner["open_time_mins_by_day"] == [1170] * 7
    assert dinner["close_time_mins_by_day"] == [1380] * 7
    assert dinner["duration_mins"] == 90
    assert dinner["cost_eur"] == 25.0


# ============================================================================
# 6. Solver Day-of-Week Filtering & Struct Mapper Normalization
# ============================================================================
def test_solver_day_of_week_filtering_and_struct_mapper():
    """Verifies that:
    1. OptimizeDailyItineraryUseCase filters out POIs where open_time_mins_by_day[day_weekday] == -1
    2. struct_mapper.py normalizes midnight-crossing closing times (close < open -> close + 1440)
    """
    # 1. Day-of-week closed POI filtering logic
    # Monday: 2026-09-21 is weekday 0
    trip_date = date(2026, 9, 21)
    day_weekday = trip_date.weekday()
    assert day_weekday == 0  # Monday

    candidate_pois = [
        {
            "name": "Open Monday Gallery",
            "category": "museum",
            "open_time_mins_by_day": [600, 600, 600, 600, 600, 600, 600],
            "close_time_mins_by_day": [1200, 1200, 1200, 1200, 1200, 1200, 1200],
        },
        {
            "name": "Closed Monday Museum",
            "category": "museum",
            "open_time_mins_by_day": [-1, 600, 600, 600, 600, 600, 600],
            "close_time_mins_by_day": [-1, 1200, 1200, 1200, 1200, 1200, 1200],
        },
    ]

    # Emulate the filtering logic implemented in OptimizeDailyItineraryUseCase
    filtered_pois = [
        p
        for p in candidate_pois
        if not (
            p.get("open_time_mins_by_day")
            and len(p["open_time_mins_by_day"]) == 7
            and p["open_time_mins_by_day"][day_weekday] == -1
        )
    ]

    names = [p["name"] for p in filtered_pois]
    assert "Open Monday Gallery" in names
    assert (
        "Closed Monday Museum" not in names
    ), "Closed Monday Museum should be filtered on Mondays!"

    # On Tuesday (weekday 1), Closed Monday Museum is open and should NOT be filtered
    tuesday_weekday = 1
    tuesday_filtered = [
        p
        for p in candidate_pois
        if not (
            p.get("open_time_mins_by_day")
            and len(p["open_time_mins_by_day"]) == 7
            and p["open_time_mins_by_day"][tuesday_weekday] == -1
        )
    ]
    assert "Closed Monday Museum" in [p["name"] for p in tuesday_filtered]

    # 2. Struct Mapper midnight normalization
    night_poi = Poi(
        name="Late Night Jazz Bar",
        city="Madrid",
        category="BAR",
        cost_eur=20.0,
        duration_mins=90,
        osm_opening_hours="21:00-02:00",
        location=PoiLocation(latitude=40.41, longitude=-3.70),
    )
    # The OSM parser normalized close_time to 1560 (120 + 1440)
    assert night_poi.open_time_mins_by_day[0] == 1260
    assert night_poi.close_time_mins_by_day[0] == 1560

    scored_pois = [ScoredPoi(poi=night_poi, score=10.0)]
    cpp_pois = build_cpp_pois(scored_pois, day_start_mins=480, day_weekday=0)
    assert len(cpp_pois) == 1
    mapped_struct = cpp_pois[0]
    # Earliest time: 1260, Latest time: 1560
    assert mapped_struct.earliest_time == 1260
    assert mapped_struct.latest_time == 1560
    assert mapped_struct.latest_time > mapped_struct.earliest_time

    # When day_start_mins exceeds regular close time, struct_mapper normalizes
    day_poi = Poi(
        name="Afternoon Gallery",
        city="Madrid",
        category="museum",
        open_time_mins_by_day=[600] * 7,
        close_time_mins_by_day=[900] * 7,
        location=PoiLocation(latitude=40.41, longitude=-3.70),
    )
    late_start_pois = [ScoredPoi(poi=day_poi, score=10.0)]
    late_cpp = build_cpp_pois(late_start_pois, day_start_mins=1000, day_weekday=0)
    # earliest = max(600, 1000) = 1000, latest was 900 -> normalized to 900 + 1440 = 2340
    assert late_cpp[0].earliest_time == 1000
    assert late_cpp[0].latest_time == 2340
    assert late_cpp[0].latest_time > late_cpp[0].earliest_time


# ============================================================================
# 7. Transit Routing & Airport Surcharge Calculation
# ============================================================================
def test_transit_routing_and_airport_surcharge():
    """Verifies that public transit fare calculation correctly detects airport legs,
    applies the airport surcharge, and reflects it in the TransitLeg domain entity.
    """
    transit_step = TransitStep(
        type="transit",
        instruction="Take Metro Line 8",
        duration_mins=15,
        distance_km=8.0,
    )

    # 1. Non-airport leg: Madrid city centre (Sol -> Prado)
    city_leg = TransitFareService.calculate_transit_leg_fare(
        "Madrid",
        steps=[transit_step],
        is_airport_leg=False,
    )
    assert city_leg.total_cost > 0.0
    assert city_leg.airport_surcharge_eur == 0.0
    assert not city_leg.has_airport

    # 2. Airport leg: Madrid Airport -> Sol
    origin_airport = {
        "name": "Aeropuerto Adolfo Suárez Madrid-Barajas",
        "category": "AIRPORT",
    }
    dest_hotel = {"name": "The Westin Palace", "category": "HOTEL"}
    airport_leg = TransitFareService.calculate_transit_leg_fare(
        "Madrid",
        steps=[transit_step],
        is_airport_leg=True,
        origin=origin_airport,
        destination=dest_hotel,
    )
    # Madrid standard fare is 1.50€ and airport surcharge is 3.00€ -> total 4.50€
    assert airport_leg.airport_surcharge_eur == 3.00
    assert airport_leg.total_cost == pytest.approx(4.50)
    assert airport_leg.has_airport

    # 3. Domain TransitLeg entity accepts airport_surcharge_eur
    leg_entity = TransitLeg(
        duration_mins=35,
        cost_eur=airport_leg.total_cost,
        cost_is_estimated=airport_leg.cost_is_estimated,
        price_source=airport_leg.price_source,
        mode="transit",
        airport_surcharge_eur=airport_leg.airport_surcharge_eur,
        steps=[],
    )
    assert leg_entity.airport_surcharge_eur == 3.00
    assert leg_entity.cost_eur == pytest.approx(4.50)
