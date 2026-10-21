# Design Specification: Bi-directional Route Monitoring & Round-Trip Calendar Matrix

**Date**: 2026-10-21  
**Status**: Approved  
**Author**: Antigravity  

---

## 1. Context & Motivation
Currently, Paladio's route monitoring pipeline only tracks unidirectional outbound flights (`origin_iata -> destination_code`). When a user monitors a corridor like Madrid (`MAD`) to Berlin (`BER`), only outbound flight ticks are ingested, stored, and plotted in the Price Trend Graph and Multi-Month Price Matrix. Furthermore, the proactive deal detection engine calculates package savings by combining outbound ticks with estimated lodging, omitting actual return flight pricing.

This specification designs:
1. **Bi-directional Corpus Ingestion**: Ingesting and maintaining price baselines for both outbound (`A -> B`) and return (`B -> A`) flights.
2. **Dual-Trend Price Graph**: Simultaneous rendering of Outbound and Return forward curves / historical prices, with a quick segment toggle (`[ BOTH ] [ OUTBOUND ] [ RETURN ]`).
3. **Multi-Month Round-Trip Calendar Matrix**:
   - Direction toggles: `[ OUTBOUND ] [ RETURN ] [ BEST ROUND-TRIP ]`.
   - Pricing sub-toggle for Round-Trip mode: `[ FLIGHTS ONLY ] [ FLIGHT + HOTEL ]`.
   - Horizon toggle limited strictly to `[ 4M ]` and `[ FULL HORIZON ]` (up to 11 months).
   - Departure-indexed cells with automatic cheapest return pairing across `[min_nights, max_nights]`.
   - Hover and selection range bar highlighting stay duration on the calendar grid.
   - Drawer with complete flight pairing details, lodging breakdown, direct booking links, and a direct "Plan Itinerary" action.
4. **Deal Detection Engine Enhancement**: Requiring confirmed, lowest-cost return flights in deal candidate packages.

---

## 2. System Architecture & Data Flow

```
+-------------------------------------------------------------+
|                      User / Scheduler                       |
+-------------------------------------------------------------+
                              |
                              v
             +----------------------------------+
             | backfill_route_corpus()          |
             | Ingests A -> B AND B -> A        |
             +----------------------------------+
                              |
               +--------------+---------------+
               |                              |
               v                              v
    +--------------------+         +--------------------+
    | Ticks: A -> B      |         | Ticks: B -> A      |
    | Baseline: A -> B   |         | Baseline: B -> A   |
    +--------------------+         +--------------------+
               \                              /
                \                            /
                 v                          v
    +---------------------------------------------------------+
    | GET /routes/{id}/calendar?view=roundtrip&pricing=package |
    | Server-side pairing across [min_nights, max_nights]     |
    | Outbound tick + Inbound tick + Lodging benchmark        |
    +---------------------------------------------------------+
                              |
                              v
    +---------------------------------------------------------+
    | Frontend: MonitoringCalendar & PriceTrendGraph          |
    | - Dual curves in graph                                  |
    | - 4M vs Full Horizon toggle                             |
    | - Outbound / Return / Best Round-Trip calendar tabs     |
    | - Stay duration highlight & Plan Itinerary action       |
    +---------------------------------------------------------+
```

---

## 3. Backend Implementation

### 3.1 Dual-Corpus Ingestion & Celery Tasks
In `backend/app/engine/market/corpus.py`:
- `backfill_route_corpus` is updated to accept an optional `bidirectional: bool = True` parameter (default `True`).
- When backfilling route `(origin_iata, destination_code)`, it automatically backfills both:
  1. `origin_iata -> destination_code`
  2. `destination_code -> origin_iata`
- `RouteCorpusStatusModel` maintains health and departure date counts for each directed pair.

In `backend/app/engine/market/detector.py`:
- `run_deal_detection_scan()` pairs each outbound flight tick `ft` with matching return flight ticks `rt` from `destination_code -> origin_iata` where `rt.depart_date == ft.depart_date + timedelta(days=nights)`.
- If no return flight exists for that date, candidate is disqualified or penalized, ensuring verified round trips.

### 3.2 Enhanced Market Endpoints (`backend/app/api/market.py`)

#### `GET /routes/{route_id}/history`
Extends `HistoryResponse` schema:
```python
class DualForwardPricePoint(BaseModel):
    depart_date: str
    price_outbound_eur: float | None
    price_inbound_eur: float | None
    verdict: str | None
    percentile: float | None

class HistoryResponse(BaseModel):
    points: list[HistoryPoint]
    forward_curve: list[DualForwardPricePoint]
    p10_deal_eur: float | None
    p50_median_eur: float | None
    p90_peak_eur: float | None
    inbound_p10_deal_eur: float | None
    inbound_p50_median_eur: float | None
    inbound_p90_peak_eur: float | None
    lowest_ever_eur: float | None
    verdict: PriceVerdictInfo | None
    corpus: CorpusInfo | None
    currency: str
```

#### `GET /routes/{route_id}/calendar`
Accepts query parameters:
- `view`: `"outbound" | "inbound" | "roundtrip"` (default: `"outbound"`)
- `pricing`: `"flights" | "package"` (default: `"flights"`)
- `months`: `int` (validated to either `4` or `11`, default: `4`)

Response schema includes return flight details and lodging breakdown:
```python
class FlightSummary(BaseModel):
    carrier: str | None
    flight_number: str | None
    departure_time: str | None
    duration_mins: int | None
    price_eur: float | None
    booking_url: str | None

class LodgingSummary(BaseModel):
    nights: int
    price_per_night_eur: float
    total_lodging_eur: float

class CalendarDayItem(BaseModel):
    date: str
    day: int
    weekday: int
    price_eur: float | None
    price_tier: str  # "deal" | "fair" | "standard" | "peak" | "no_data"
    is_holiday: bool
    nights: int | None = None
    return_date: str | None = None
    outbound_flight: FlightSummary | None = None
    return_flight: FlightSummary | None = None
    lodging: LodgingSummary | None = None
```

---

## 4. Frontend Implementation

### 4.1 Price Trend Graph (`PriceTrendGraph.tsx`)
- Adds a segment toggle: `[ BOTH ] [ OUTBOUND ] [ RETURN ]`.
- In `BOTH` mode, plots two lines on the same Cartesian grid:
  - Outbound curve: Cyan (`#00F2FF`)
  - Return curve: Accent Purple (`#A855F7`)
- Tooltip displays both Outbound and Return flight prices for the hovered date, along with the combined sum.

### 4.2 Route Monitoring Calendar (`MonitoringCalendar.tsx`)
- **Strictly scoped to Route Monitoring**: Located at `src/components/monitoring/MonitoringCalendar.tsx`, distinct from the Trip Workspace Itinerary Calendar.
- **Horizon Selector**: Replaces `[3M] [4M] [5M]` with:
  - `[ 4M ]`: 4 months view.
  - `[ FULL HORIZON ]`: Full price horizon (11 months).
- **View Navigation Bar**:
  - `[ OUTBOUND ]`
  - `[ RETURN ]`
  - `[ BEST ROUND-TRIP ]`
- **Pricing Mode (in BEST ROUND-TRIP mode)**:
  - Sub-toggle buttons: `[ FLIGHTS ONLY ]` and `[ FLIGHT + HOTEL ]`.
- **Stay Interval Visualizer**:
  - When hovering or clicking an active departure day $D_{out}$ with duration $N$, calendar days from $D_{out}$ to $D_{out} + N$ are decorated with an active range band class (`styles.inRangeDay`).
- **Inspection Drawer**:
  - Outbound flight card (departure time, duration, flight number, booking link).
  - Return flight card (return date, departure time, duration, flight number, booking link).
  - Optional Hotel card (nightly average, total lodging).
  - Prominent tactical action button: `[ PLAN ITINERARY WITH THESE DATES ]`, which navigates to `/trips/new` (or triggers trip generation) prefilled with origin, destination, and selected departure/return dates.

---

## 5. Error Handling & Edge Cases
- **Missing Return Flight Data**: If no return flight is available for a given departure day within `[min_nights, max_nights]`, that cell is marked as `"no_data"`, rather than showing a broken or partial price.
- **Rate Limiting & Provider Health**: Ingesting both directions doubles API requests to the provider. The ingestion worker employs jittered backoff and respects provider quota limits.
- **Air-Gapped & Offline Fallback**: Baselines are drawn from stored PostgreSQL ticks without external cloud API dependencies.

---

## 6. Testing & Verification
1. **Backend Unit & Integration Tests**:
   - `backend/tests/test_bidirectional_market.py`:
     - Test dual-route corpus backfill.
     - Test `/routes/{id}/calendar?view=outbound`, `?view=inbound`, and `?view=roundtrip&pricing=package`.
     - Test horizon validation (`months=4` vs `months=11`).
     - Test that round-trip pairing chooses the minimum fare within `[min_nights, max_nights]`.
2. **Frontend Component Tests & Verification**:
   - Verify `PriceTrendGraph` dual-line rendering and toggle.
   - Verify `MonitoringCalendar` horizon toggle (`4M` vs `FULL HORIZON`).
   - Verify calendar direction tabs and pricing sub-toggle.
   - Verify stay interval range highlighting on hover/click.
