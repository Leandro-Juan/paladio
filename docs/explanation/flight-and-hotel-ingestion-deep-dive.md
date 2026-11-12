# Paladio Flight & Hotel Ingestion Pipeline: Comprehensive Technical Deep-Dive

**Authoritative Architecture & Implementation Specification**  
**Paladio Autonomous Travel Engine — Market Ingestion & Deal Detection Subsystems**

---

## Table of Contents
1. [Executive Overview & System Topology](#1-executive-overview--system-topology)
2. [Triggering & Orchestration Subsystem](#2-triggering--orchestration-subsystem)
3. [Corridor Classification & Regional Dispatch](#3-corridor-classification--regional-dispatch)
4. [Provider Ladder & Circuit Breaker Engine](#4-provider-ladder--circuit-breaker-engine)
5. [Flight Ingestion Pipeline Implementation](#5-flight-ingestion-pipeline-implementation)
   - [5.1 CompositeFlightFeed Architecture](#51-compositeflightfeed-architecture)
   - [5.2 RyanairProvider](#52-ryanairprovider)
   - [5.3 GoogleFlightsProvider](#53-googleflightsprovider)
   - [5.4 KiwiFlightProvider](#54-kiwiflightprovider)
   - [5.5 TripComFlightProvider](#55-tripcomflightprovider)
   - [5.6 FlightBrowserPool & Anti-Fingerprinting](#56-flightbrowserpool--anti-fingerprinting)
6. [Lodging Ingestion & Entity Consolidation Pipeline](#6-lodging-ingestion--entity-consolidation-pipeline)
   - [5.1 OpenLodgingFeed & LodgingAggregator](#61-openlodgingfeed--lodgingaggregator)
   - [5.2 BookingScraperProvider & Headless Playwright](#62-bookingscraperprovider--headless-playwright)
   - [5.3 GoogleTravelHotelsProvider](#63-googletravelhotelsprovider)
   - [5.4 AgodaProvider & TripComProvider](#64-agodaprovider--tripcomprovider)
   - [5.5 EntityResolver & PropertyUniverseManager](#65-entityresolver--propertyuniversemanager)
   - [5.6 Taste-Aware Bayesian Lodging Scoring](#66-taste-aware-bayesian-lodging-scoring)
7. [Data Persistence & Deduplication Engine](#7-data-persistence--deduplication-engine)
8. [Empirical Baselines & Horizon Bootstrap](#8-empirical-baselines--horizon-bootstrap)
9. [The 6-Stage Deal Detection & Verification Funnel](#9-the-6-stage-deal-detection--verification-funnel)
10. [Critical Failure Analysis & Reality Audit](#10-critical-failure-analysis--reality-audit)
11. [Production Hardening & Architectural Roadmap](#11-production-hardening--architectural-roadmap)

---

## 1. Executive Overview & System Topology

The Paladio Market Deal Engine is designed as a continuous, sovereign ingestion pipeline that discovers anomalous travel deals (flights and hotels) across user-monitored corridors without relying on paid commercial SaaS aggregators.

The pipeline comprises two parallel intake vectors:
1. **Flight Ingestion Vector**: Gathers scheduled and dynamic flight quotes across intra-Europe, intra-Americas, and intercontinental corridors.
2. **Lodging Ingestion Vector**: Gathers live hotel, hostel, and apartment availability, night rates, star ratings, and review distributions for destination municipalities.

These vectors feed into a **TimescaleDB** time-series hypertable (`market_price_ticks`), aggregate into daily rollups (`price_daily`), calculate empirical price distributions (`route_baselines`), and execute a **6-stage detection funnel** to notify users of high-confidence, bookable vacation packages.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                 PALADIO INGESTION TOPOLOGY                                                │
│                                                                                                                          │
│   [Celery Beat / API Trigger]                                                                                            │
│              │                                                                                                           │
│              ▼                                                                                                           │
│   [Corridor Classifier] ────────► Resolves Origin/Dest IATA, Region (Americas/Europe), Timezones, Local Currency         │
│              │                                                                                                           │
│              ├──────────────────────────────────────────────────────┬────────────────────────────────────────────────────┤
│              ▼                                                      ▼                                                    │
│    [CompositeFlightFeed]                                  [LodgingAggregator]                                            │
│              │                                                      │                                                    │
│   ┌──────────┴────────────────────────┐                  ┌──────────┴───────────────────────────────────────┐            │
│   │ Provider Ladder (Router):         │                  │ Enabled Providers (lodging_providers):           │            │
│   │ 1. RyanairProvider (EU API)       │                  │ 1. BookingScraperProvider (HTTP + Playwright)   │            │
│   │ 2. GoogleFlightsProvider (Scraper)│                  │ 2. GoogleTravelHotelsProvider (HTTP)             │            │
│   │ 3. KiwiFlightProvider (Scraper)   │                  │ 3. TripComProvider (HTTP)                        │            │
│   │ 4. TripComFlightProvider (Scraper)│                  │ 4. AgodaProvider (HTTP)                          │            │
│   └──────────┬────────────────────────┘                  └──────────┬───────────────────────────────────────┘            │
│              │                                                      │                                                    │
│              ▼                                                      ▼                                                    │
│    [Flight Quotes Stream]                                 [EntityResolver & Deduplication]                               │
│              │                                                      │                                                    │
│              └──────────────────────────────┬───────────────────────┘                                                    │
│                                             ▼                                                                            │
│                                  [Content Hashing SHA-256]                                                               │
│                                             │                                                                            │
│                                             ▼                                                                            │
│                             [TimescaleDB: market_price_ticks]                                                            │
│                                             │                                                                            │
│                                             ▼                                                                            │
│                               [Daily Rollups: price_daily]                                                               │
│                                             │                                                                            │
│                                             ▼                                                                            │
│                           [Quantile Baselines: route_baselines]                                                          │
│                                             │                                                                            │
│                                             ▼                                                                            │
│                         [6-Stage Deal Detection & Verification Funnel]                                                   │
│                                             │                                                                            │
│                                             ▼                                                                            │
│                         [Trip Proposals & WebSocket Alerts]                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Triggering & Orchestration Subsystem

Ingestion tasks are coordinated through asynchronous Celery workers, Celery Beat schedulers, and FastAPI REST endpoints.

### 2.1 Scheduled Celery Tasks (`backend/app/tasks.py`)

1. **`periodic_market_scan_task`** (`tasks.py:L2152`):
   - **Schedule**: Executes every 15 minutes (`MARKET_SCAN_INTERVAL_MIN = 15`).
   - **Behavior**: Scans all active user watch alerts (`DealWatchAlertModel.is_active == True`).
   - For each alert, polls live flight fares across a forward 90-day window (`date_from = alert.earliest_date`, `date_to = alert.earliest_date + 90 days`).
   - Executes `ingest_flight_ticks` followed immediately by `run_deal_detection_scan`.

2. **`periodic_baseline_compute_task`** (`tasks.py:L2177`):
   - **Schedule**: Nightly batch cron job.
   - **Behavior**: Iterates over all monitored routes in `route_corpus_status` and triggers `compute_route_baseline`, calculating empirical price quantiles across lead time buckets.

3. **`backfill_route_corpus_task`** (`tasks.py:L2193`):
   - **Schedule**: On-demand or triggered during initial route setup.
   - **Behavior**: Calls `backfill_route_corpus`, sweeping forward calendar months up to `CORPUS_HORIZON_MONTHS = 11` (default 330 days) to gather 300+ real daily market prices.

4. **`prewarm_route_lodging_task`** (`tasks.py:L2225`):
   - **Schedule**: Triggered post-flight backfill.
   - **Behavior**: Sweeps 4-night lodging stays across representative weekends in the forward horizon to populate baseline lodging costs.

### 2.2 On-Demand REST API Endpoints (`backend/app/api/market.py`)

- `POST /api/market/routes/{route_id}/scan` (`market.py:L950`): Manually triggers a live scan for a specific route alert.
- `POST /api/market/routes/{route_id}/backfill` (`market.py:L1577`): Triggers a background Celery task to sweep the 11-month forward calendar corpus.
- `GET /api/market/routes/{route_id}/lodging` (`market.py:L1624`): Live queries destination lodging options and returns ranked property candidates.
- `GET /api/market/routes/{route_id}/calendar` (`market.py:L1944`): Returns historical and projected daily minimum fare curves.

---

## 3. Corridor Classification & Regional Dispatch

Before any network request is issued, Paladio inspects the flight route to ensure regional compliance, select the optimal currency, and assemble the correct provider ladder.

### 3.1 RouteClassifier (`backend/app/engine/market/flights/classifier.py`)

The `RouteClassifier` inspects origin and destination IATA codes using `AirportService`:
- Resolves latitude, longitude, country code, timezone, and continent.
- Classifies corridors into:
  - `intra_europe`: Both airports reside within the European continent.
  - `intra_americas`: Both airports reside in North, Central, or South America.
  - `transatlantic`: One airport in Europe, one in the Americas.
  - `intercontinental`: Cross-continental corridors outside the above buckets.

```python
# classifier.py: Corridor Classification Logic
classification = route_classifier.classify_corridor("JFK", "LAX")
# Result: is_americas=True, is_europe=False, corridor_region="intra_americas", suggested_currency="USD"
```

### 3.2 Dynamic Regional Ladder Construction (`adapters.py:L52-L64`)

`CompositeFlightFeed._get_router` builds the execution ladder dynamically based on corridor geography:

- **Intra-Europe Corridors**:
  $$\text{Ladder} = [\text{RyanairProvider}, \text{GoogleFlightsProvider}, \text{KiwiFlightProvider}, \text{TripComFlightProvider}]$$
- **Intra-Americas & Intercontinental Corridors**:
  $$\text{Ladder} = [\text{GoogleFlightsProvider}, \text{KiwiFlightProvider}, \text{TripComFlightProvider}]$$
  *(Ryanair is strictly excluded from non-European routes to prevent 100% predictable 404/empty responses).*

---

## 4. Provider Ladder & Circuit Breaker Engine

All provider interactions pass through `ProviderRouter` (`backend/app/engine/market/providers/router.py`), which implements an automated circuit-breaker pattern, health telemetry tracking, and fallback sequencing.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PROVIDER ROUTER EXECUTION LADDER                          │
│                                                                                        │
│   Incoming Query: (origin, dest, date)                                                  │
│         │                                                                              │
│         ▼                                                                              │
│   Fetch Provider Health: provider_health table                                         │
│         │                                                                              │
│         ├─► [Status == "open_breaker"] ──► Check cooldown (900s)                       │
│         │                                 ├── Cooldown active   ──► SKIP PROVIDER      │
│         │                                 └── Cooldown expired  ──► HALF-OPEN ATTEMPT  │
│         │                                                                              │
│         ├─► [Method Not Implemented]   ──► SKIP PROVIDER                               │
│         │                                                                              │
│         ▼                                                                              │
│   Execute Provider Method: e.g. fetch_cached_flights()                                 │
│         │                                                                              │
│         ├── SUCCESS (Quotes returned)  ──► Reset failures, status="ok", RETURN QUOTES  │
│         │                                                                              │
│         └── FAILURE / EXCEPTION:                                                       │
│               │                                                                        │
│               ├─► Record failure in provider_health                                    │
│               ├─► Increment consecutive_failures                                       │
│               ├─► If consecutive_failures >= 5 ──► Trip breaker: status="open_breaker" │
│               └─► Advance to NEXT PROVIDER in ladder                                   │
│                                                                                        │
│   All Providers Failed ──► Raise NoDataError("All providers exhausted")                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Telemetry Schema (`ProviderHealthModel`)
Stored in the PostgreSQL `provider_health` table:
- `provider` (PK): Name of provider (`ryanair`, `google_flights`, `booking`, etc.).
- `asset_type` (PK): `'flight'` or `'lodging'`.
- `status`: `'ok'`, `'degraded'`, `'blocked'`, or `'open_breaker'`.
- `consecutive_failures`: Incremented on each failure; resets to `0` upon success.
- `last_error`: Truncated 500-character string of the latest exception.
- `updated_at`: Timestamp used to calculate cooldown expiration.

### 4.2 Circuit Breaker Rules (`config.py`)
- `BREAKER_FAILURES = 5`: Trips into `open_breaker` after 5 consecutive errors.
- `BREAKER_COOLDOWN_SEC = 900`: Providers remain locked out for 15 minutes before permitting a single half-open trial request.

---

## 5. Flight Ingestion Pipeline Implementation

### 5.1 CompositeFlightFeed Architecture (`backend/app/engine/market/adapters.py`)

`CompositeFlightFeed` implements two primary protocols: `FlightFeed` and `LiveQuoteProvider`. It exposes four core entrypoints:
1. `fetch_cached_flights(origin, dest, date_from, date_to)`: Fast single/multi-day fare query.
2. `fetch_month_cheapest_per_day(origin, dest, month_start)`: Monthly sweep sampling daily minimums.
3. `fetch_calendar_horizon(origin, dest, months_ahead)`: Multi-month sweep for baseline calculations.
4. `verify_flight(quote)`: Live re-query of an exact flight quote to confirm bookability.

---

### 5.2 RyanairProvider (`backend/app/engine/market/providers/ryanair.py`)

The `RyanairProvider` queries Ryanair's public REST APIs directly:

1. **Standard Fare Query (`fetch_cached_flights`)**:
   - Endpoint: `https://www.ryanair.com/api/farfnd/v4/oneWayFares`
   - Parameters:
     ```python
     params = {
         "departureAirportIataCode": origin_iata,
         "arrivalAirportIataCode": dest_iata,
         "language": "en",
         "limit": 100,
         "market": "en-gb",
         "offset": 0,
         "outboundDepartureDateFrom": date_from.isoformat(),
         "outboundDepartureDateTo": date_to.isoformat(),
     }
     ```
   - Parsing: Traverses the `fares` JSON array. Extracts `departureDate`, `arrivalDate`, `price.value` (converted to integer cents), and `flightNumber`.

2. **Monthly Sweeper (`fetch_month_cheapest_per_day`)**:
   - Endpoint: `https://www.ryanair.com/api/farfnd/v4/oneWayFares/{origin}/{dest}/cheapestPerDay`
   - Parameter: `outboundMonthOfDate=YYYY-MM-01`.
   - Returns daily lowest fares across the entire month in a single HTTP request.

3. **Calendar Horizon (`fetch_calendar_horizon`)**:
   - Iterates through `months_ahead` (up to 11 months).
   - Issues monthly requests wrapped in an `asyncio.Semaphore(3)` with a `50ms` polite jitter sleep.

---

### 5.3 GoogleFlightsProvider (`backend/app/engine/market/providers/google_flights.py`)

The `GoogleFlightsProvider` queries Google Flights meta-search using `httpx.AsyncClient`:

1. **Request Construction**:
   - URL: `https://www.google.com/travel/flights`
   - Query string: `q=Flights from {origin} to {dest} on {date}`
   - Localization: `hl=en`, `gl={country}`, `curr={currency}`
   - Headers: Realistic Chrome/Ubuntu headers from `FlightBrowserPool`.
   - Static Cookie: Consent bypass cookie:
     ```python
     GOOGLE_CONSENT_COOKIE = {"SOCS": "CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA4X3AwGgJlbhACGgYIgLCnpgY"}
     ```

2. **Primary Parsing Engine (`_parse_flight_cards`)**:
   - Uses regex to match accessibility labels on flight cards:
     ```python
     labels = re.findall(r'aria-label="((?:From|Flight)\s+[\d,]+\s+[^"]+Select flight)"', html)
     ```
   - Traverses each card label with sub-expressions:
     - Price: `r"(?:From|Flight)\s+([\d,]+)\s+([A-Za-z]+)"`
     - Carrier: `r"(?:flight with|operated by)\s+([^.]+?)\."`
     - Stops: Checks for `"Nonstop"` or `r"(\d+)\s+stop"`
     - Times: `r"Leaves\s+.+?\s+at\s+([0-9]{1,2}:[0-9]{2}(?:[\s\u202f]*[APMapm]{2})?)\s+on\s+(.+?)\s+and arrives\s+.+?\s+at\s+([0-9]{1,2}:[0-9]{2}(?:[\s\u202f]*[APMapm]{2})?)"`

3. **Fallback Regex Parser (`_fallback_parse`)**:
   - If `_parse_flight_cards` returns 0 quotes, it executes a regex sweep over the entire page:
     ```python
     raw_prices = re.findall(r"(?:[\$€£]|" + target_currency + r"\s*)(\d{1,3}(?:,\d{3})*|\d{2,5})", html)
     carrier_matches = re.findall(r"\b(Delta|United|American|Southwest|JetBlue|Alaska|Spirit|Frontier|Iberia|Vueling|easyJet|Wizz Air|Ryanair|...)\b", html, re.IGNORECASE)
     ```
   - Calculates distance via the Haversine formula to approximate duration:
     $$\text{flight\_hours} = \max\left(\frac{\text{dist\_km}}{800.0} + 0.6, 1.0\right)$$
   - Synthesizes flight cards spaced 2 hours apart starting at 09:00 AM local time.

4. **Forward Calendar Sweeps (`fetch_calendar_horizon`)**:
   - Samples 25 to 30 evenly spaced dates across the 11-month horizon:
     ```python
     stride = max(total_days // 25, 4)
     dates_to_query = [today + timedelta(days=i) for i in range(2, total_days, stride)]
     ```
   - Queries Google Flights concurrently using `asyncio.Semaphore(5)`.

---

### 5.4 KiwiFlightProvider & 5.5 TripComFlightProvider

Both providers implement HTML scraping over search result pages:
- **Kiwi**: Hits `https://www.kiwi.com/en/search/results/{origin}/{dest}/{date}`.
- **Trip.com**: Hits `https://www.trip.com/flights/{origin}-to-{dest}/airfares-{origin}-{dest}`.
- Both use fallback price regexes and airline matching arrays.
- Neither provider implements `fetch_calendar_horizon` or `fetch_month_cheapest_per_day`.

---

### 5.6 FlightBrowserPool (`backend/app/engine/market/flights/browser_pool.py`)

Coordinates outbound scraper hygiene:
- **User-Agent Rotation**: Cycles realistic modern desktop User-Agents (Chrome 128/129 on Linux, Windows 10, macOS).
- **Proxy Management**: Parses comma-separated proxies from `FLIGHT_PROXY_URLS`, `MARKET_PROXY_URLS`, or `LODGING_PROXY_URLS` via `itertools.cycle`.
- **Client Hints**: Injects `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `sec-ch-ua`, and `Accept-Language` headers matching native Chrome requests.
- **Jitter Delays**: `throttle(min_ms=100, max_ms=300)` sleeps for a non-deterministic duration between external hits.

---

## 6. Lodging Ingestion & Entity Consolidation Pipeline

### 6.1 OpenLodgingFeed & LodgingAggregator (`backend/app/engine/market/lodging/aggregator.py`)

`LodgingAggregator` coordinates parallel provider queries, applies entity resolution, and saves verified observations to the database.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              LODGING AGGREGATOR PIPELINE                               │
│                                                                                        │
│   Input: destination_code (IATA / City ID), check_in, check_out, adults                │
│         │                                                                              │
│         ▼                                                                              │
│   Resolve Bounding Box & Universe Size: PropertyUniverseManager                        │
│         │                                                                              │
│         ▼                                                                              │
│   Load Enabled Providers: lodging_providers table                                      │
│         │                                                                              │
│         ▼                                                                              │
│   Execute Concurrent Provider Scans (asyncio.gather):                                  │
│         ├── BookingScraperProvider                                                     │
│         ├── GoogleTravelHotelsProvider                                                 │
│         ├── TripComProvider                                                            │
│         └── AgodaProvider                                                              │
│         │                                                                              │
│         ▼                                                                              │
│   Normalize Currency: convert_to_eur()                                                 │
│         │                                                                              │
│         ▼                                                                              │
│   Entity Resolution & Deduplication: EntityResolver                                    │
│         ├── Cluster by geographic coordinates (lat/lng <= 0.001)                       │
│         └── Match by normalized string tokens (Levenshtein similarity >= 0.85)         │
│         │                                                                              │
│         ▼                                                                              │
│   Persist Append-Only Observations: lodging_offers & hotel_rate_observations           │
│         │                                                                              │
│         ▼                                                                              │
│   Taste-Aware Bayesian Ranking: rank_hotels()                                          │
│         │                                                                              │
│         ▼                                                                              │
│   Return Canonical Verified Lodging Quotes                                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.2 BookingScraperProvider (`backend/app/engine/market/providers/booking_scraper.py`)

1. **HTTP Fast-Path**:
   - URL: `https://www.booking.com/searchresults.html`
   - Parameters: `ss={city}`, `checkin={date}`, `checkout={date}`, `group_adults=2`, `selected_currency=EUR`.
   - Parsing: Extracts JSON-LD scripts (`<script type="application/ld+json">`). Traverses `itemListElement` arrays for objects of type `Hotel`, `LodgingBusiness`, or `Hostel`.
   - Secondary Regex: If JSON-LD is absent, parses HTML cards with `data-testid="property-card"`.

2. **Headless Playwright Escalation**:
   - If HTTP returns status `202`, `403`, `429`, or header `x-amzn-waf-action: challenge`, or if 0 quotes are parsed, it escalates to `_scrape_with_playwright`.
   - Subprocess Call:
     ```bash
     node backend/app/engine/market/scripts/scrape_booking.js "{city}" "{checkin}" "{checkout}" "{adults}" 0 "" "{proxy}"
     ```
   - **`scrape_booking.js` Mechanics**:
     - Launches Chromium via Playwright:
       ```javascript
       const browser = await chromium.launch({
         headless: true,
         args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
       });
       ```
     - Navigates to Booking search results with `waitUntil: 'domcontentloaded'`.
     - Scrolls twice by `1200px` with `1500ms` delays to trigger lazy card rendering.
     - Evaluates `[data-testid="property-card"]` elements and outputs structured JSON to `stdout`.

---

### 6.3 GoogleTravelHotelsProvider (`backend/app/engine/market/providers/google_travel.py`)

- URL: `https://www.google.com/travel/search`
- Parameters: `q=Hotels in {city}`, `checkin={date}`, `checkout={date}`, `hl=en`, `gl=es`.
- Parsing: Uses regex on Google Travel card container classes:
  ```python
  card_pattern = re.compile(
      r"<div class=\"[^\"]*AF5RIe\">([^<]+)</div>\s*<div class=\"[^\"]*\">([^<]+)</div>(.*?)(?=<div class=\"[^\"]*AF5RIe\"|\Z)",
      re.DOTALL,
  )
  ```
- Extracts property name, total price, review rating (`aria-label="{x} out of 5 stars from {y} reviews"`), and star category (`(\d)-star hotel`).

---

### 6.4 AgodaProvider & TripComProvider

- **Agoda** (`providers/agoda.py`): Hits `https://www.agoda.com/search` and matches `data-selenium="hotel-item"`, `hotel-name`, and `display-price`.
- **Trip.com** (`providers/trip_com.py`): Hits `https://uk.trip.com/hotels/list` and matches `hotel-name` and price tags.

---

### 6.5 EntityResolver & PropertyUniverseManager (`backend/app/engine/market/lodging/`)

- **`PropertyUniverseManager`** (`universe.py`): Queries OpenStreetMap / City bounding boxes and calculates the total known property count for the municipality to gauge scan completeness.
- **`EntityResolver`** (`resolver.py`): Consolidates quotes across Booking, Google, Agoda, and Trip.com:
  1. **Coordinate Proximity**: If both quotes contain GPS coordinates, properties within **50 meters** are merged.
  2. **Normalized Name Matching**: Removes common hotel stopwords (`hotel`, `resort`, `suites`, `spa`, `hostel`, `inn`, `the`), strips punctuation, and computes token intersection similarity:
     $$\text{Similarity} = \frac{|T_A \cap T_B|}{\max(|T_A|, |T_B|)} \ge 0.85$$

---

### 6.6 Taste-Aware Bayesian Lodging Scoring (`ranking.py:L140-L240`)

Candidate hotels are evaluated using a multi-objective scoring function:

1. **Bayesian Review Score Smoothing**:
   Adjusts raw review scores against the global mean to avoid biasing hotels with 1 review at 10.0 over hotels with 5,000 reviews at 9.2:
   $$\bar{R} = \frac{v \cdot R + m \cdot C}{v + m}$$
   - $v$: Hotel review count.
   - $R$: Hotel raw review score (normalized to $0..10$).
   - $m$: Minimum prior review confidence ($m = 50$).
   - $C$: Prior baseline rating ($C = 7.5$).

2. **Weighted Scoring Vector**:
   $$\text{FinalScore} = w_p S_{\text{price}} + w_q S_{\text{quality}} + w_l S_{\text{loc}} + w_t S_{\text{taste}} + w_f S_{\text{flex}} + w_{tr} S_{\text{trust}}$$
   - **Price** ($w_p = 0.30$): Relative savings compared to destination median.
   - **Quality** ($w_q = 0.25$): Smoothed Bayesian review score and star rating.
   - **Location** ($w_l = 0.20$): Distance penalty from historic city center (decay beyond 12km).
   - **Taste** ($w_t = 0.15$): Cosine match against user profile tags (boutique, luxury, budget, central).
   - **Flexibility** ($w_f = 0.05$): Free cancellation / pay-at-stay bonus.
   - **Trust** ($w_{tr} = 0.05$): Number of independent providers quoting the same property.

---

## 7. Data Persistence & Deduplication Engine

Raw quotes from flights and hotels are written to PostgreSQL / TimescaleDB via `backend/app/engine/market/ingest.py`.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PERSISTENCE & DEDUPLICATION                               │
│                                                                                        │
│   Flight / Lodging Quote                                                               │
│         │                                                                              │
│         ▼                                                                              │
│   Compute Content Hash: compute_content_hash()                                         │
│   SHA-256(asset_type : origin : dest : depart : return : price_cents : source)         │
│         │                                                                              │
│         ▼                                                                              │
│   INSERT INTO market_price_ticks                                                       │
│   ON CONFLICT (content_hash, observed_at) DO NOTHING                                   │
│         │                                                                              │
│         ▼                                                                              │
│   INSERT INTO price_daily                                                              │
│   ON CONFLICT (bucket, asset_type, origin, dest, depart_date, nights, source, currency)    │
│   DO UPDATE SET                                                                        │
│       min_base = LEAST(price_daily.min_base, EXCLUDED.min_base),                       │
│       n_ticks  = price_daily.n_ticks + 1                                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Deterministic Content Hashing (`ingest.py:L25-L38`)
Prevents duplicate row explosion across recurring 15-minute scans:
```python
def compute_content_hash(
    asset_type: str,
    origin_iata: str,
    dest_code: str,
    depart_date: date,
    return_date: date,
    base_price_cents: int,
    source: str,
    source_observed_at: datetime | None = None,
) -> bytes:
    key_str = f"{asset_type}:{origin_iata}:{dest_code}:{depart_date.isoformat()}:{return_date.isoformat()}:{base_price_cents}:{source}"
    if source_observed_at:
        key_str += f":{source_observed_at.isoformat()}"
    return hashlib.sha256(key_str.encode("utf-8")).digest()
```

### 7.2 TimescaleDB Hypertables
- **`market_price_ticks`**: Raw time-series partitioned on `observed_at`. Indexed on `(asset_type, origin_iata, destination_code, depart_date, observed_at DESC)`.
- **`price_daily`**: Daily summary table storing `min_base` (lowest observed fare for that travel window) and `n_ticks` (frequency count).

---

## 8. Empirical Baselines & Horizon Bootstrap

A deal cannot be evaluated without knowing the normal market price. Paladio enforces an empirical baseline policy: **synthetic prices and hardcoded averages are strictly prohibited**.

### 8.1 Forward Calendar Sweeps (`corpus.py:L27-L120`)
When a route is monitored:
1. `backfill_route_corpus` sweeps the forward calendar horizon (up to 11 months).
2. It queries daily lowest fares across seasons, days of the week, and lead times.
3. Ingests all quotes into `market_price_ticks` and `price_daily`.
4. Immediately computes the baseline model.

### 8.2 Baseline Distribution Computation (`baselines.py:L140-L280`)
Calculates empirical quantiles for each route corridor:
- **Lead Time Buckets**: `0..7 days`, `8..21 days`, `22..60 days`, `61+ days`.
- **Quantiles Calculated**: $P_{02}, P_{05}, P_{10}, P_{25}, P_{50}, P_{75}, P_{90}$.
- **Statistical Significance Requirements**:
  - Minimum 200 observation rows (`MIN_BASELINE_ROWS = 200`).
  - Minimum 21 distinct observation dates (`MIN_BASELINE_OBS_DAYS = 21`).
  - Minimum 10 distinct departure dates (`MIN_BASELINE_DEPART_DATES = 10`).
- **Graceful Fallback Hierarchy**:
  1. `full`: Matched exact corridor, exact departure month, and lead time bucket.
  2. `drop_lead`: If lead time bucket has insufficient observations, pool across all lead times for that departure month.
  3. `drop_month`: If the specific month lacks data, pool across the entire 540-day route history.

---

## 9. The 6-Stage Deal Detection & Verification Funnel

Every tick entering the system is evaluated through a 6-stage funnel in `backend/app/engine/market/detector.py`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              THE 6-STAGE DETECTION FUNNEL                              │
├────────────────────────┬───────────────────────────────────────────────────────────────┤
│ Stage 1: Statistical   │ PackageRatio <= R_MAX (0.75) AND Savings >= 30.00 EUR         │
│          Detection     │ Evaluates candidate fare against empirical median baseline    │
├────────────────────────┼───────────────────────────────────────────────────────────────┤
│ Stage 2: Feasibility   │ Flight times outside Dead Window (00:00 - 05:00)              │
│          Gate          │ Arrival buffer >= 120m, Departure buffer >= 180m, Stay >= 36h │
├────────────────────────┼───────────────────────────────────────────────────────────────┤
│ Stage 3: Bookability   │ Live re-verification of flight quote via verify_flight()      │
│          Gate          │ Price within 5% tolerance of original observation             │
├────────────────────────┼───────────────────────────────────────────────────────────────┤
│ Stage 4: Affordability │ Total landed price (flight + lodging + baggage) <= max_budget │
│          Gate          │ Net package savings >= 30.00 EUR                              │
├────────────────────────┼───────────────────────────────────────────────────────────────┤
│ Stage 5: Quality Gate  │ Destination lodging quality score >= 70.0                     │
│                        │ Verified review rating, safe central location                 │
├────────────────────────┼───────────────────────────────────────────────────────────────┤
│ Stage 6: Itinerary     │ Paladio C++ Core solver successfully synthesizes full schedule│
│          Gate          │ Realism score >= 8.0/10 via itinerary quality metrics         │
└────────────────────────┴───────────────────────────────────────────────────────────────┘
```

1. **Stage 1 (Statistical Detection)**:
   Calculates the total package ratio:
   $$\text{PackageRatio} = \frac{\text{FlightPrice} + \text{ReturnFlightPrice} + (\text{LodgingPricePerNight} \times \text{Nights})}{\text{BaselineMedianTotal}}$$
   Must satisfy $\text{PackageRatio} \le 0.75$ and absolute savings $\ge 30.00 \text{ EUR}$.

2. **Stage 2 (Feasibility Gate)**:
   Rejects inconvenient flights: arrivals between 00:00 and 05:00 local time, ground stays under 36 hours, or layovers shorter than airport transfer thresholds.

3. **Stage 3 (Bookability Gate)**:
   Re-queries the provider live for the exact departure date (`verify_flight`). If the fare has vanished or increased by more than 5% (`VERIFY_TOLERANCE = 0.05`), the deal is discarded.

4. **Stage 4 (Affordability Gate)**:
   Validates total landed cost:
   $$\text{LandedTotal} = (\text{FlightPrice} \times \text{Travelers}) + \text{TotalLodging} + \text{BaggageBudget}$$
   Must not exceed the user's hard budget limit (`alert.max_budget_cents`).

5. **Stage 5 (Quality Gate)**:
   Evaluates the lodging property using `SovereignLodgingScorer`. The composite Bayesian score must meet or exceed $70.0 / 100$.

6. **Stage 6 (Itinerary Gate)**:
   Passes destination POIs and flight arrival/departure times into the **Paladio C++ Core optimization solver** (`paladio_core`). The solver must construct a feasible TSPTW itinerary with a realism score $\ge 8.0 / 10.0$.

If all 6 gates pass, the deal is saved to `DealCandidateModel`, linked to `DealEventModel`, and broadcast to the user via WebSockets.

---

## 10. Critical Failure Analysis & Reality Audit

### 10.1 Real-World Failure Probabilities

| Component / Flow | Primary Mechanism | Real Failure Rate |
| :--- | :--- | :---: |
| **Europe Flights (Ryanair direct)** | Direct REST JSON API | **30% – 50%** *(Akamai TLS blocks)* |
| **Americas / Transatlantic Flights** | Google Flights / Kiwi raw HTTP GET | **90% – 100%** *(SPA, no SSR data)* |
| **11-Month Horizon Sweeps** | Burst of 25–30 rapid requests per route | **95% – 100%** *(IP rate-limiting)* |
| **Lodging Ingestion (Booking)** | AWS WAF blocks vanilla Playwright | **85% – 95%** *(CAPTCHA / puzzle)* |
| **Lodging Ingestion (Google/Agoda)** | Hashed CSS classes & client-side SPAs | **95% – 100%** *(Zero parsed cards)* |
| **Continuous Operation (>2 Hours)** | Circuit breaker lockout cascade | **100%** *(All breakers open)* |

### 10.2 Technical Root Causes of Pipeline Failures

1. **The SPA & Dynamic Rendering Illusion**:
   - `GoogleFlightsProvider`, `KiwiFlightProvider`, `TripComFlightProvider`, `AgodaProvider`, and `GoogleTravelHotelsProvider` issue raw `httpx.get` requests.
   - These platforms are modern dynamic Single-Page Applications built on React, Next.js, and Google Boq. The initial HTML payload returned to `httpx` does **not** contain flight or hotel cards. Cards are populated via client-side JavaScript batch RPCs.
   - Regex patterns searching for `aria-label` or `data-selenium="hotel-item"` find 0 matches on the raw HTML shell.

2. **The Fallback Schedule Fabricator**:
   - In `KiwiFlightProvider` and `TripComFlightProvider`, when parsing yields 0 structured quotes, the fallback regex extracts arbitrary numbers and airline names from footers or scripts.
   - It synthesizes departure times by adding `idx * 2` hours to 10:00 AM. This generates **hallucinated, non-existent flights** that pass downstream filters but fail live booking verification.

3. **Vanilla Playwright Detection in `scrape_booking.js`**:
   - `scrape_booking.js` launches vanilla Chromium without anti-detect patches (`playwright-stealth`).
   - Enterprise bot mitigations (AWS WAF, Kasada, PerimeterX) instantly flag the process via `navigator.webdriver === true`, missing audio codecs, and CDP signatures, serving a puzzle challenge that causes the script to time out after 30 seconds.

4. **Resource Exhaustion & Kernel OOM Crashes**:
   - Spawning Node.js + Chromium subprocesses for lodging searches consumes 300–500MB of RAM and 1 CPU core per search.
   - Concurrent scans in Celery rapidly exhaust memory on typical self-hosted VPS instances (2GB–4GB RAM), causing the Linux kernel `oom-killer` to terminate PostgreSQL, Redis, or Celery.

5. **Unhandled Exception in Deal Detection Funnel**:
   - In [`detector.py` Line 137](file:///home/leandro/Code/Projects/Paladio/backend/app/engine/market/detector.py#L137), `fetch_destination_summary` is called without a `try...except NoDataError` wrapper.
   - When lodging providers fail, `NoDataError` propagates uncaught, crashing the entire detection scan and aborting checks for all other active alerts.

---

## 11. Production Hardening & Architectural Roadmap

To transform this system into a rock-solid, production-grade engine, two implementation paths are available:

### Option A: Official REST APIs (Recommended: 99.9% Uptime, Zero Scraper Maintenance)

Replace HTML scrapers with official, structured developer APIs:

1. **Amadeus for Developers (Self-Service)**:
   - **Cost**: Free tier includes **2,000 live search requests per month**.
   - **Endpoints**:
     - `Flight Offers Search`: Returns structured JSON containing verified flight numbers, real seat availability, exact layovers, baggage allowances, and prices.
     - `Flight Price Analysis`: Provides statistical fare percentiles directly, eliminating the need to scrape 11 months of historical baselines.
     - `Hotel Search API`: Live hotel availability and pricing across major global chains and bedbanks.

2. **Kiwi Tequila API**:
   - Official API providing structured access to Kiwi's virtual-interlining flight inventory across 750+ carriers without DataDome challenges.

3. **Duffel Flights API**:
   - Modern REST API for live NDC and low-cost carrier flight search and instant verification.

---

### Option B: Hardened Sovereign Scraper Cluster (If Zero Third-Party APIs is Mandatory)

If external APIs cannot be used due to strict self-hosting constraints, the following changes are required:

1. **Network XHR/RPC Interception**:
   - Discontinue regex parsing of static HTML.
   - Use headless browser network interception (`page.on('response')`) to capture internal JSON/RPC responses directly from platform backends (e.g., Google Flights `batchexecute` or Booking internal JSON endpoints).

2. **Playwright Stealth & Anti-Detect Integration**:
   - Equip `scrape_booking.js` with `playwright-extra` and `puppeteer-extra-plugin-stealth`.
   - Mask `navigator.webdriver`, emulate realistic WebGL/Canvas noise, and inject authentic Chrome runtime objects.

3. **Residential Rotating Proxies**:
   - Configure commercial residential proxy backbones in `FLIGHT_PROXY_URLS` and `LODGING_PROXY_URLS`. Horizon sweeps from single datacenter server IPs are fundamentally unviable.

4. **Fail-Fast Error Handling**:
   - Eliminate fallback schedule synthesis (`dep_dt + timedelta(hours=idx * 2)`). If a scraper fails, halt execution cleanly.
   - Wrap `lodging_feed.fetch_destination_summary` in `try...except NoDataError` in `detector.py` to prevent pipeline-wide crashes.
