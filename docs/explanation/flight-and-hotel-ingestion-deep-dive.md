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
   - [5.1 AviasalesProvider (Primary Global)](#51-aviasalesprovider-backendappenginemarketprovidersaviasalespy)
   - [5.2 RyanairProvider (Europe Direct)](#52-ryanairprovider-backendappenginemarketprovidersryanairpy)
6. [Lodging Ingestion & Entity Consolidation Pipeline](#6-lodging-ingestion--entity-consolidation-pipeline)
   - [6.1 OpenLodgingFeed & LodgingAggregator](#61-openlodgingfeed--lodgingaggregator-backendappenginemarketlodgingaggregatorpy)
   - [6.2 BookingScraperProvider & Headless Playwright](#62-bookingscraperprovider-backendappenginemarketprovidersbooking_scraperpy)
   - [6.3 GoogleTravelHotelsProvider](#63-googletravelhotelsprovider-backendappenginemarketprovidersgoogle_travelpy)
   - [6.4 AgodaProvider & TripComProvider](#64-agodaprovider--tripcomprovider)
   - [6.5 EntityResolver & PropertyUniverseManager](#65-entityresolver--propertyuniversemanager-backendappenginemarketlodging)
   - [6.6 Taste-Aware Bayesian Lodging Scoring](#66-taste-aware-bayesian-lodging-scoring-rankingpyl140-l240)
7. [Data Persistence & Deduplication Engine](#7-data-persistence--deduplication-engine)
8. [Empirical Baselines & Horizon Bootstrap](#8-empirical-baselines--horizon-bootstrap)
9. [The 6-Stage Deal Detection & Verification Funnel](#9-the-6-stage-deal-detection--verification-funnel)
10. [Critical Failure Analysis & Reality Audit](#10-critical-failure-analysis--reality-audit)
11. [Production Rebuild: Implemented Architecture](#11-production-rebuild-implemented-architecture)
12. [Telemetry, Observability & Circuit Breaking](#12-telemetry-observability--circuit-breaking)

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
│    [CompositeFlightFeed]                                  [OpenLodgingFeed]                                              │
│              │                                                      │                                                    │
│   ┌──────────┴────────────────────────┐                  ┌──────────┴───────────────────────────────────────┐            │
│   │ Provider Ladder (Router):         │                  │ Lodging Feed Providers:                          │            │
│   │ 1. AviasalesProvider (Primary)    │                  │ 1. BookingScraperProvider (Live Scraper)          │            │
│   │ 2. RyanairProvider (EU Direct)    │                  │ 2. GoogleTravelHotelsProvider (Live HTTP)        │            │
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
│                         [Top-3 Selection, Tolerance Verify & Gates]                                                      │
│                                             │                                                                            │
│                                             ▼                                                                            │
│                         [Trip Proposals & WebSocket Alerts]                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Triggering & Orchestration Subsystem

Ingestion tasks are coordinated through asynchronous Celery workers, a dedicated Celery Beat scheduler, and FastAPI REST endpoints.

### 2.1 Daily Scheduled Pipeline (`backend/app/tasks.py`)

1. **`daily_market_pipeline_task`** (`tasks.py`):
   - **Schedule**: Executes daily at 03:00 UTC via Celery Beat (`beat_schedule: crontab(hour=3, minute=0)`).
   - **Concurrency Control**: Protected by a non-blocking Redis distributed lock (`paladio:market:daily_chain_lock`, TTL 2 hours) ensuring overlapping daily runs are strictly impossible.
   - **Pipeline Chain**:
     1. **Stage 1 (Sweep)**: Calls `run_daily_flight_sweep`, sweeping all watched alert corridors and pilot routes across the 11-month forward calendar horizon with per-route fault isolation. Records audit rows in `market_sweep_runs` and `route_month_coverage`.
     2. **Stage 2 (Baselines)**: Calls `compute_route_baselines`, recomputing statistical medians, quantiles, and fee models across 6 lead buckets for each route.
     3. **Stage 3 (Detection & Verification & Hotels)**: Calls `run_deal_detection_scan`, selecting top-3 candidates per user per day with route diversity capping (`MAX_PER_ROUTE_PER_SCAN = 2`), performing live tolerance verification, and fetching authentic lodging only for verified candidates.

2. **`backfill_route_corpus_task`** (`tasks.py`):
   - **Schedule**: On-demand or triggered during initial route setup.
   - **Behavior**: Calls `backfill_route_corpus`, sweeping forward calendar months up to `CORPUS_HORIZON_MONTHS = 11` (330 days) to populate authentic market prices and establish route baselines.

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

### 3.2 Multi-Source Regional Flight Hierarchy (Decision D11)

`CompositeFlightFeed._get_router` builds the execution ladder dynamically based on corridor geography:

- **Intra-Europe Corridors**:
  $$\text{Ladder} = [\text{AviasalesProvider}, \text{RyanairProvider}]$$
  *(Aviasales serves as primary multi-month calendar source; Ryanair serves as secondary direct-carrier source).*
- **Americas & Intercontinental Corridors**:
  $$\text{Ladder} = [\text{AviasalesProvider}]$$
  *(Aviasales provides full global coverage across 11 forward months without web scraping).*

---

## 4. Provider Router & Resilience Engine

All provider interactions pass through `ProviderRouter` (`backend/app/engine/market/providers/router.py`), which implements circuit breakers, multi-day failure telemetry, and kill switches.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PROVIDER ROUTER EXECUTION LADDER                          │
│                                                                                        │
│   Incoming Query: (origin, dest, date)                                                  │
│         │                                                                              │
│         ├─► [Provider Kill Switch Active] ──► SKIP PROVIDER                            │
│         │                                                                              │
│         ▼                                                                              │
│   Fetch Provider Health: provider_health table                                         │
│         │                                                                              │
│         ├─► [Status == "open_breaker"] ──► Check cooldown (24 hours)                   │
│         │                                 ├── Cooldown active   ──► SKIP PROVIDER      │
│         │                                 └── Cooldown expired  ──► HALF-OPEN ATTEMPT  │
│         │                                                                              │
│         ▼                                                                              │
│   Execute Provider Method: e.g. fetch_cached_flights()                                 │
│         │                                                                              │
│         ├── SUCCESS (Observations returned) ──► Reset consecutive failures, status="ok"│
│         │                                                                              │
│         └── FAILURE / EXCEPTION:                                                       │
│               │                                                                        │
│               ├─► Record failure in provider_health                                    │
│               ├─► Track consecutive_failure_days across dates                          │
│               ├─► If consecutive_failure_days >= 2 ──► Raise System Alert              │
│               ├─► If consecutive_failures >= 5 ──► Trip breaker: status="open_breaker" │
│               └─► Advance to NEXT PROVIDER in ladder                                   │
│                                                                                        │
│   All Providers Failed ──► Raise NoDataError("No flight data obtainable across ladder")│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Telemetry Schema (`ProviderHealthModel`)
Stored in the PostgreSQL `provider_health` table:
- `provider` (PK): Name of provider (`aviasales`, `ryanair`, `booking`, etc.).
- `asset_type` (PK): `'flight'` or `'lodging'`.
- `status`: `'ok'`, `'degraded'`, `'blocked'`, or `'open_breaker'`.
- `consecutive_failures`: Incremented on each error; resets to `0` upon success.
- `consecutive_failure_days`: Tracks consecutive days of failure; alerts at $\ge 2$.
- `last_coverage`: Most recent route-month price coverage fraction.
- `last_ok_at`: Timestamp of last successful API response.
- `last_error`: Truncated 500-character string of the latest exception.
- `updated_at`: Timestamp used to calculate cooldown expiration.

### 4.2 Circuit Breaker & Kill Switches (`config.py`)
- `BREAKER_FAILURES = 5`: Trips into `open_breaker` after 5 consecutive errors.
- `BREAKER_COOLDOWN_HOURS = 24`: Open breaker locks out failing providers for 24 hours.
- **Kill Switches**: Environment variables allowing instant zero-downtime disabling:
  - `MARKET_ENABLE_SWEEP`: Disables daily calendar sweep stage.
  - `MARKET_ENABLE_BASELINES`: Disables route statistical baselines rollup.
  - `MARKET_ENABLE_DETECTION`: Disables deal detection and notification scan.
  - `MARKET_ENABLE_VERIFICATION`: Skips live price re-verification.
  - `MARKET_ENABLE_AVIASALES`: Disables Aviasales API queries.
  - `MARKET_ENABLE_RYANAIR`: Disables Ryanair API queries.
  - `MARKET_ENABLE_LODGING`: Disables hotel queries and downgrades to flight-only.

---

## 5. Flight Ingestion Pipeline Implementation

### 5.1 AviasalesProvider (`backend/app/engine/market/providers/aviasales.py`)

Primary flight provider backing the entire 11-month forward calendar corpus.
- **Data Source**: Travelpayouts / Aviasales Data API (`https://api.travelpayouts.com/aviasales/v3/prices_for_dates`).
- **Authentication**: Free token passed via `x-access-token` header (strictly never logged or exposed).
- **Rate Limiting**: In-memory token bucket enforcing 60 requests per minute (`AVIASALES_MAX_RPM = 60`).
- **Resilience**: Exponential backoff on 429/5xx and Redis response caching (`paladio:aviasales:raw:...`, TTL 24 hours).
- **Strict Data Truthfulness**:
  - Validates departure month strictly against requested month window; rejects substituted or drifted dates.
  - Extracts accurate `found_at` timestamp from deep-link `search_date=DDMMYYYY` query parameter.
  - Never defaults departure/arrival times to midnight if absent (`depart_time=None` when times are not present in payload).
  - Flags observations older than 7 days as `is_stale=True`.
  - Rejects zero or negative prices and missing currency codes.

### 5.2 RyanairProvider (`backend/app/engine/market/providers/ryanair.py`)

Secondary direct-carrier provider for European corridors.
- Queries Ryanair public REST APIs:
  - `https://www.ryanair.com/api/farfnd/v4/oneWayFares`
  - `https://www.ryanair.com/api/farfnd/v4/oneWayFares/{origin}/{dest}/cheapestPerDay`
- Returns verified direct flight quotes with exact carrier flight numbers and flight times.
- Strictly excluded from non-European routes to prevent predictable 404 responses.

---

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
- **6 Lead Time Buckets**: `0..3 days`, `4..14 days`, `15..30 days`, `31..60 days`, `61..90 days`, `91..330 days`.
- **Quantiles Calculated**: $P_{02}, P_{05}, P_{10}, P_{25}, P_{50}, P_{75}, P_{90}$.
- **Statistical Significance Requirements & Confidence Tiers**:
  - `HIGH`: $\ge 30$ observations spanning $\ge 60$ days.
  - `MEDIUM`: $\ge 15$ observations spanning $\ge 30$ days.
  - `LOW`: $\ge 7$ observations spanning $\ge 14$ days.
  - `INSUFFICIENT`: $< 7$ observations. Statistical gate rejects deals if baseline confidence is insufficient.
- **Graceful Empirical Fallback Hierarchy**:
  1. `full`: Matched exact corridor `(origin, dest)`, exact departure month, and lead bucket.
  2. `drop_lead`: Pooled across all lead buckets for that departure month `(origin, dest, month, all_lead)`.
  3. `drop_month`: Pooled across all departure months for that lead bucket `(origin, dest, all_months, bucket)`.
  4. `route_global`: Pooled across the entire observed historical route corpus `(origin, dest, all_months, all_lead)`.

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

1. **Stage 1 (Statistical Detection & Top-3 Candidate Ranking)**:
   - Evaluates candidate fare against empirical median baseline:
     $$\text{PackageRatio} = \frac{\text{FlightPrice} + \text{ReturnFlightPrice} + (\text{LodgingPricePerNight} \times \text{Nights})}{\text{BaselineMedianTotal}}$$
     Must satisfy $\text{PackageRatio} \le 0.75$ and absolute savings $\ge 30.00 \text{ EUR}$.
   - **Candidate Scoring & Top-3 Filter** (`score_deal_candidate`):
     Candidates are ranked deterministically by discount depth, absolute euro savings, lead time realism, and non-stop preference:
     $$\text{Score} = (1.0 - \text{price\_ratio}) \times 100.0 + \min(50.0, \frac{\text{savings\_cents}}{1000}) - (\text{stops} \times 10.0)$$
     Only the top 3 scored candidates per alert advance to live verification, preventing rate limit depletion.

2. **Stage 2 (Feasibility Gate)**:
   Rejects inconvenient flights: arrivals between 00:00 and 05:00 local time, ground stays under 36 hours, or layovers shorter than airport transfer thresholds.

3. **Stage 3 (Bookability & Live Verification Gate - `verifier.py`)**:
   Re-queries the provider live for the exact departure date (`verify_flight`).
   - If the fare has vanished or increased by more than 5% (`VERIFY_TOLERANCE = 0.05`), the candidate is immediately discarded.
   - Price drift is recorded: $\text{drift} = \frac{P_{\text{verified}} - P_{\text{observed}}}{P_{\text{observed}}}$.
   - Zero-synthetic invariant: Never fabulates prices or flight numbers during verification.

4. **Stage 4 (Affordability Gate)**:
   Validates total landed cost:
   $$\text{LandedTotal} = (\text{FlightPrice} \times \text{Travelers}) + \text{TotalLodging} + \text{BaggageBudget}$$
   Must not exceed the user's hard budget limit (`alert.max_budget_cents`).

5. **Stage 5 (Quality & Lodging Gate)**:
   Evaluates authentic destination lodging via `SovereignLodgingScorer`.
   - Requires real observed property data or conservative tier-based estimate without synthetic placeholders.
   - The composite Bayesian score must meet or exceed $70.0 / 100$.

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

## 11. Production Rebuild: Implemented Architecture

As executed in the Deal Engine Rebuild (`PLAN.md`), the fragile HTML scraper architecture was replaced with an authentic, REST-first ingestion and verification pipeline:

### 11.1 Aviasales Primary Global Aggregator (Implemented)
- **API**: Travelpayouts / Aviasales Data API v2 (`https://api.travelpayouts.com/v2/prices/month-matrix`).
- **Authentication**: Token passed securely via `x-access-token` header (sourced from `.env`).
- **Coverage**: Global coverage across Europe, Americas, Asia, and Transatlantic corridors.
- **Resilience**: Exponential backoff (`429` / `5xx` retry), strict JSON validation (`ParseDriftError`), and zero-synthetic parsing (never invents depart times, flight numbers, or stops).

### 11.2 Ryanair Direct Carrier (Implemented)
- **API**: Direct carrier JSON API (`https://www.ryanair.com/api/farfnd/v4/oneWayFares`).
- **Role**: High-fidelity intra-European pricing directly from source of truth without intermediary markups.

---

## 12. Telemetry, Observability & Circuit Breaking

### 12.1 Telemetry Endpoints (`backend/app/api/market.py`)
1. **`GET /api/market/telemetry/daily-report`**:
   - `calls_vs_limit`: Live calls made today vs tier daily budget and consumption ratio.
   - `provider_stats`: Success rate, status, consecutive failures, consecutive failure days, last coverage %.
   - `route_month_coverage`: Percentage of monitored route-departure months covered by observed ticks.
   - `freshness_histogram`: Tick age distribution (`<1d`, `1-3d`, `3-7d`, `>7d`).
   - `stale_rows_count`: Observations older than `MARKET_MAX_OBSERVATION_AGE_DAYS` (7 days).
   - `verified_deals_drift`: Statistics on price drift across live verified deals (mean, median, max drift).

2. **`GET /api/market/providers/health`**:
   - Detailed health metrics for each provider including `consecutive_failure_days`, `last_coverage`, `last_run_id`, and circuit breaker state.

### 12.2 Daily Celery Beat Pipeline (`backend/app/tasks.py`)
- Runs daily at **03:00 UTC** via Celery Beat (`"daily-market-pipeline"`).
- Protected by a Redis distributed lock (`paladio:market:daily_chain_lock`, TTL 7200s, `blocking=False`) to strictly forbid concurrent runs.
- Sequential stages executed in fault-isolated database sessions:
  1. `daily_flight_sweep_task` (sweeps 11-month horizon for all active monitored corridors).
  2. `daily_baseline_compute_task` (computes empirical quantiles across 6 lead time buckets).
  3. `daily_deal_detection_task` (runs 6-stage detection, scores candidates, verifies top 3 live).
- Supported by runtime kill switches: `ENABLE_SWEEP`, `ENABLE_BASELINES`, `ENABLE_DETECTION`, `ENABLE_VERIFICATION`, `ENABLE_AVIASALES`, `ENABLE_RYANAIR`, `ENABLE_LODGING`.

