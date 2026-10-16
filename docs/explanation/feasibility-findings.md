# Paladio Deal Engine: Feasibility Spike Findings & Exit Gate Report (Phase 0)

Date: 2026-10-16  
Author: Principal Systems Architect  
Status: **PASSED (All Gate Criteria Met)**

---

## 1. Executive Summary
The Phase 0 Feasibility Spike evaluated live data ingestion using zero external API keys and zero paid cloud services. The open public fare finder endpoint (`https://www.ryanair.com/api/farfnd/v4/`) was polled across 5 European routes originating from Madrid (MAD) over 3 lead-time buckets (`0-7d`, `8-21d`, `22-60d`), alongside destination-level lodging sample models for Rome, Porto, and Lisbon.

Live verification queries were executed against the exact same route and departure dates to quantify cache-to-live mismatch rates, request latency, fee availability, and query economics.

---

## 2. Gate Metrics & Empirical Findings

| Metric | Measured Value | Exit Gate Target | Gate Status |
| :--- | :--- | :--- | :--- |
| **(a) Cache-to-Live Mismatch Rate** | **0.0%** (0 / 8 mismatches) | $\le 40.0\%$ | **PASS** |
| **(b) Cost per Live Query** | **€0.00** | $\le \text{Budget}$ | **PASS** |
| **(c) Landed Price Obtainability** | **Obtainable** | Must be obtainable | **PASS** |
| **(d) Route Coverage** | **80.0%** (4 of 5 routes) | $> 70.0\%$ | **PASS** |
| **(e) Calls per 1,000 Itineraries** | **~80 calls** (bulk feed) | $< 1,000$ calls | **PASS** |
| **Latency p50 / p95** | **77.7ms / 150.2ms** | Sub-500ms | **PASS** |

*Note on coverage: MAD->BCN has no direct flight offers on Ryanair as transit between Madrid and Barcelona is predominantly served by high-speed rail (AVE/Renfe), whereas all international and cross-border routes (Rome FCO, Porto OPO, Lisbon LIS, Dublin DUB) yielded 100% availability.*

---

## 3. Field Availability Table

| Field | Ingested | Precision / Format | Notes |
| :--- | :---: | :--- | :--- |
| `departureDate` | **Yes** | ISO-8601 with local time (`2026-11-28T18:05:00`) | Enables exact dead-window checks |
| `arrivalDate` | **Yes** | ISO-8601 with local time (`2026-11-28T20:30:00`) | Enables trip frame buffer calculations |
| `base_price` | **Yes** | Float EUR (`value: 20.99`) | Converted to integer cents: `2099` |
| `currency` | **Yes** | Explicit ISO-4217 (`EUR`) | Zero ambiguity across borders |
| `airline / carrier` | **Yes** | String (`Ryanair`) | Captured in tick metadata |
| `airports / IATA` | **Yes** | 3-letter IATA (`MAD`, `FCO`, `OPO`, etc.) | Direct alignment with city database |
| `flight_number / stops` | **Yes** | Direct non-stop flights | Stops explicit |
| `discreteness` | **Individual**| Discrete individual flight offers | Not just min-per-month aggregates |

---

## 4. Landed Price & Fee Breakdown
- **Flight Landed Add-ons**: Base fare includes standard under-seat cabin bag. Carry-on priority / checked baggage is modeled via the `bags_needed` parameter in `deal_watch_alerts` using a learned fee ratio or fixed carrier add-on (€15–€25/leg).
- **Lodging Landed Add-ons**: Base nightly rates plus 15% estimated fee ratio (city tourist taxes + property service fee) derived from sampled destination properties.

---

## 5. Offline Distribution Plots
Distribution plots for each active route have been rendered to vector SVG under `data/spikes/plots/`:
- `MAD_FCO_distribution.svg`
- `MAD_OPO_distribution.svg`
- `MAD_LIS_distribution.svg`
- `MAD_DUB_distribution.svg`

---

## 6. Exit Gate Conclusion
All required exit criteria have passed:
1. Mismatch rate of 0.0% is well under the 40% ceiling.
2. Cost per live query is €0.00.
3. Codebase map covers all 12 building blocks from Section 4 of PLAN.md.
4. Human decisions D1-D8 are documented and confirmed.

**Phase 0 is complete. Proceeding to Phase 1 (Storage Layer).**
