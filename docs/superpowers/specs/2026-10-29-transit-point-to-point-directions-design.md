# Design Specification: Interactive Point-to-Point Directions in Transit Tab

**Date**: 2026-10-29  
**Author**: Antigravity  
**Status**: Ready for User Review & Evaluation  
**Canonical Spec Path**: `docs/superpowers/specs/2026-10-29-transit-point-to-point-directions-design.md`  
**Related**: `docs/superpowers/specs/2026-10-28-transit-tab-design.md`, `PLAN.md`

---

## 1. Overview & Motivation

In the Paladio Trip Workspace, the **Transit Tab** currently provides two subviews: `Nearby` (stations within walking distance of trip anchors) and `Lines` (browsing transit lines and scheduled station departures). However, travelers frequently need to plan ad-hoc journeys between two specific locations in the destination city—such as routing from their hotel to a dinner reservation, between two attractions, or to an arbitrary street address or map location.

### Core Objective
Add an interactive **Directions** subview to the Transit Tab that enables users to select an Origin and Destination (via dynamic name search, direct coordinate input, or direct click-to-pick on the main workspace map), configure schedule departure/arrival constraints, and compute the most optimal route via public transit or direct walking, adhering to realistic travel heuristics.

### Key Invariants
- **Dynamic Data Only (Zero Hardcoded Mappings)**: All routing, places, stations, and fare structures are dynamically loaded from PostgreSQL/pgvector, local Valhalla multimodal routing engine, and OpenStreetMap/Photon geocoding.
- **Air-Gappable & Self-Hosted**: 100% self-hosted via Docker Compose. No external proprietary cloud LLM or mapping APIs.
- **Icon Integrity (Zero Emojis)**: Strictly use Paladio bespoke SVG icons (`components/icons.tsx`), honoring the Japanese Tactical Minimalist / Pacific Jazz design system.
- **Reasonable Route Realism**: Never propose walking 1.5 hours when public transit is available, nor taking public transit for a trivial 5-minute walk. The engine automatically classifies and prioritizes the most realistic, sensible primary route.

---

## 2. User Experience & Interaction Architecture

### 2.1 Subview Navigation Order
The Transit Tab subview bar is reorganized in priority order:
```
[ Directions | Lines | Nearby ]
```
`Directions` is the default active subview upon entering the Transit Tab.

### 2.2 Site Selection (Origin & Destination)
Each site input provides three input modalities:
1. **Dynamic Name Search with Autocomplete Dropdown**:
   - Zero-query state: clicking the input displays instant quick-pick chips for current trip anchors:
     - *Hotel / Stay Anchor* (with address & coordinates)
     - *Airport / Arrival Station*
     - *Day POIs* (POIs scheduled on the currently selected day)
     - *Saved Bookmarks*
   - Typing queries `/api/locations/places?city={destination}&q={query}` returning a ranked list with category badges (Attraction, Hotel, Transit Station, Address).
2. **Direct Coordinate Input**:
   - Directly typing or pasting latitude/longitude (e.g. `40.4168, -3.7038` or `40.4168 -3.7038`) is detected via regex (`/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/`), automatically binding coordinates and reverse-geocoding a human-readable display label without hitting search.
3. **Direct Click-to-Pick on Workspace Map**:
   - Each input includes a dedicated "Pick on Map" crosshair icon button.
   - Activating it enters interactive map-pick mode: cursor changes to a crosshair, a tactical banner appears ("Click anywhere on the map to set Origin / Destination"), and clicking any map location or existing marker captures `[lat, lng]`, drops a marker pin, reverse-geocodes the address, and fills the field.
4. **Origin <-> Destination Swap**:
   - An icon button between the two fields quickly inverts Origin and Destination coordinates and names.

### 2.3 Schedule & Departure Controls
- **Mode Toggle**: `[ Depart at | Arrive by ]`
- **Calendar Date**:
  - Auto-anchored to the active trip day date (`getTripDayDate(tripStartDate, dayIndex)`).
  - If "All Days" is selected, falls back to the trip start date.
  - Dropdown allows selecting any specific trip day or custom date.
- **Exact Time Picker**:
  - Direct time input / selector (`HH:MM`) defaulting to `09:00` for morning schedules or current city time.

### 2.4 The Reasonable Route Realism Heuristic
When evaluating routes between Origin and Destination:
- Both Valhalla Multimodal Transit and Pedestrian routes are computed.
- The system determines the primary recommended route:
  - **Walk-Dominant Scenario**: If walking time is <= 15 mins (or distance <= 1.2 km) and public transit is slower or comparable (due to walking to station, waiting for headways, or transfers), **Direct Walking** is presented as the primary route, with Public Transit presented as an alternative option.
  - **Transit-Dominant Scenario**: If walking time is > 20 mins (e.g. 45 min, 1.5 hours) and a viable public transit route exists, **Public Transit** is presented as the primary route, with Walking presented as an alternative reference.
- Presentation:
  - Primary route is rendered in full detail using Paladio's `TransitLegView` (step maneuvers, colored line badges, stop counts, walking segments, transfer stations, and fare).
  - Alternative route is presented as a clean toggle card below (e.g., *"Compare with Direct Walk: 18 min • 0€"* or *"Compare with Public Transit: 12 min • €1.50"*). Clicking it toggles active inspection and swaps the map polyline.

---

## 3. Map Visualization & Synchronization

- **Marker Pins**:
  - Tactical Pin `A` for Origin (Slate / Teal palette).
  - Tactical Pin `B` for Destination (Emerald / Terracotta palette).
- **Route Polylines**:
  - Transit segments render in the official line hex color (with a subtle glow layer).
  - Walking segments render as dashed slate polylines with dot markers at turn points.
- **Auto-fit Camera**: Map smoothly fits the bounding box of Origin, Destination, and route maneuvers.

---

## 4. Backend Architecture & API Contracts

### 4.1 Direction Endpoint
`POST /api/trips/{trip_id}/transit/directions` (or `POST /api/transit/directions`)

**Request Payload**:
```json
{
  "city": "Madrid",
  "origin": {
    "name": "The Westin Palace",
    "lat": 40.4150,
    "lon": -3.6953
  },
  "destination": {
    "name": "Santiago Bernabéu Stadium",
    "lat": 40.4531,
    "lon": -3.6883
  },
  "date_time": "2026-09-15T09:00:00",
  "date_time_type": 1
}
```
*Note: `date_time_type`: `1` = Depart at, `2` = Arrive by.*

**Response Payload**:
```json
{
  "primary_mode": "transit",
  "primary_leg": {
    "mode": "transit",
    "duration_mins": 22,
    "cost_eur": 1.50,
    "cost_is_estimated": false,
    "price_source": "Madrid Metro Single Ticket",
    "steps": [ ... ],
    "geometry": [ [40.4150, -3.6953], ... ]
  },
  "alternative_leg": {
    "mode": "pedestrian",
    "duration_mins": 58,
    "cost_eur": 0.0,
    "steps": [ ... ],
    "geometry": [ [40.4150, -3.6953], ... ]
  },
  "recommendation_reason": "Public transit saves 36 minutes compared to walking (58 mins)."
}
```

### 4.2 Unified Places Search Endpoint
`GET /api/locations/places?city={city}&q={query}&limit=10`

Dynamically resolves:
1. Destination city attractions and hotels from PostgreSQL `attractions` table.
2. Compiled GTFS transit stations from `transit_stations` table.
3. OpenStreetMap Photon / Nominatim geocoding spatially biased to the city's bounding box.

---

## 5. Testing & Verification Plan

1. **Unit Tests (Backend)**:
   - `test_transit_directions_api.py`: Verify endpoint handles origin/destination coordinates, departure vs arrival time, and returns both `primary_leg` and `alternative_leg`.
   - `test_reasonable_route_heuristic.py`: Verify short distances (<1 km) default to walking; long distances (>2.5 km) with metro default to transit.
   - `test_locations_places_search.py`: Verify multi-source search (attractions + GTFS stations + geocoding) with spatial filtering.
2. **Component & Integration Tests (Frontend)**:
   - Verify `TripTransitTab` renders `[ Directions | Lines | Nearby ]` subtabs.
   - Verify typing coordinates triggers instant binding without network search.
   - Verify "Pick on Map" mode activates crosshair and updates inputs on map click.
   - Verify route display toggling between primary and alternative legs.
