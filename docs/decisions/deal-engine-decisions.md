# Paladio Deal Engine: Architectural Decisions (D1 - D8)

Record of foundational decisions made prior to Deal Engine implementation, adhering to the Sovereign and Air-gappable architecture.

---

### D1: Flight Price Source for Tier 1 Discovery & Live Quotes
- **Answer**: Ryanair public live fare finder API (`https://www.ryanair.com/api/farfnd/v4/oneWayFares` and `roundTripFares`) for European routes. 
- **Date**: 2026-10-16
- **Who Decided**: Human Owner & Implementing Principal Architect.
- **Evidence**: Open unauthenticated JSON endpoints returning real live flight prices in EUR, departure and arrival UTC/local times, IATA codes, carrier details, and exact booking deep-links. Zero API keys, zero credential leaks, rate-limit friendly with client-side exponential backoff.
- **Open Questions**: None. Confirmed working via live curl testing for MAD, FCO, OPO, LIS, BCN, DUB, LON.

---

### D2: Lodging Price Source & Summary Construction
- **Answer**: Destination summary built from sampled properties per city across quality tiers (Hostel, Budget, Standard).
- **Date**: 2026-10-16
- **Who Decided**: Human Owner & Implementing Principal Architect (using PLAN.md suggested default).
- **Evidence**: Destination-level statistics (`stat = median` or `min`, with `sample_n` recorded) allow like-for-like baseline comparisons without per-hotel lock-in. Nightly base rates plus estimated fee ratios model landed costs.
- **Open Questions**: None.

---

### D3: Legal / Approved Sources for Scraping / Queries
- **Answer**: Only public open endpoints and open directories with no API keys or login credentials. No scraping of sources not explicitly approved.
- **Date**: 2026-10-16
- **Who Decided**: Human Owner & Implementing Principal Architect.
- **Evidence**: Standard HTTP JSON requests to public fare finder APIs avoid bot detection, CAPTCHAs, and legal ToS friction.
- **Open Questions**: None.

---

### D4: Historical Dataset for Baselines
- **Answer**: Build own history through Phase 2 continuous ingestion and the cold-start fallback plan.
- **Date**: 2026-10-16
- **Who Decided**: PLAN.md suggested default confirmed by Human Owner.
- **Evidence**: Avoids stale or license-tainted third-party commercial dumps. Route baselines fall back gracefully (`full` -> `drop_lead` -> `drop_month`) when samples are below `MIN_BASELINE_ROWS`.
- **Open Questions**: None.

---

### D5: Scale in 6 Months
- **Answer**: 5,000 active alerts, 100 destinations, 30 origins, 1,000 users.
- **Date**: 2026-10-16
- **Who Decided**: PLAN.md suggested default confirmed by Human Owner.
- **Evidence**: TimescaleDB hypertable chunk interval of 3 days with compression after 7 days scales easily to millions of raw ticks without degrading query latency.
- **Open Questions**: None.

---

### D6: Daily Live-Query Budget & Cost Ceiling
- **Answer**: 200 live queries per day; monetary cost ceiling is €0.00 since open public endpoints are utilized.
- **Date**: 2026-10-16
- **Who Decided**: Human Owner & Implementing Principal Architect.
- **Evidence**: Enforced at task execution time via Redis rate counters and `MarketConfig.LIVE_DAILY_BUDGET_TIER2`.
- **Open Questions**: None.

---

### D7: Currencies & FX Rates
- **Answer**: EUR home currency. All stored prices are in integer cents (`bigint`). Daily stored FX table converts source currencies at ingest time while preserving original amounts and original currency codes.
- **Date**: 2026-10-16
- **Who Decided**: PLAN.md suggested default confirmed by Human Owner.
- **Evidence**: Avoids floating-point precision loss and cross-currency comparison errors.
- **Open Questions**: None.

---

### D8: Alert Delivery Channels
- **Answer**: In-app WebSocket streaming via Redis Pub/Sub (`paladio:events`) and persistent deal proposals in `trips` (`TripModel(status='deal_proposal')`).
- **Date**: 2026-10-16
- **Who Decided**: Human Owner & Implementing Principal Architect.
- **Evidence**: Integrates directly with Paladio's reactive Next.js frontend without requiring third-party cloud push/email services.
- **Open Questions**: None.

---

### Database Infrastructure Note
- **TimescaleDB Image**: Pinned to `timescale/timescaledb:latest-pg16` (PostgreSQL 16.4, TimescaleDB 2.29.1, pgvector 0.8.1).
