# Design Specification: Renovating Trip Planning UI (TREK-Inspired Workspace)

**Date**: 2026-10-11  
**Author**: Antigravity  
**Status**: Validated & Approved  
**Canonical Spec Path**: `docs/superpowers/specs/2026-10-11-trip-workspace-redesign-design.md`

---

## 1. Overview & Motivation

Paladio currently splits trip interaction into two separate interfaces:
1. `/engine`: The active mission preparation and LangGraph swarm telemetry cockpit.
2. `/vault/[id]`: The saved trip detail viewer displaying a basic 2-column layout with an interactive map, timeline, and budget wallet.

The user desires to completely renovate the trip page (accessed when opening a trip from the upcoming trips list or dashboard) into a modern, high-polish workspace modeled after **TREK** (`demo.liketrek.com`). 

The renovated design replaces the legacy layout with a full-bleed interactive map surrounded by collapsible floating glassmorphism panels and a top navigation tab bar, while **strictly preserving 100% of Paladio's existing capabilities**:
- Colored day cluster region hulls (`computeClusterPolygon`) and centroid badges in "ALL DAYS" mode.
- Solo active day route polylines connecting sequenced waypoints.
- Hotel Base Camp and Airport Transit Gate anchor markers.
- Numbered tactical categorical SVG waypoint pins with timing and cost popups.
- Live GTFS public transit upgrade action with polling and toast notifications.
- Complete `TripBudgetWallet` (itemized cost dissection, manual expenses, equal/custom traveler splitting, and debt settlements).
- Flight tickets, transit legs, crew/collaborator management, and photo vault.
- Right-hand Places sidebar with a search filter and a clean placeholder modal for future live POI searching.

---

## 2. Architecture & Routing

### 2.1 Route Modernization
- **Canonical Route**: `/trips/[id]` is established as the modern Trip Workspace.
- **Backward-Compatible Routing**: `/vault/[id]` will automatically redirect/delegate to `/trips/[id]`, ensuring all existing database references, bookmarks, and automated tests remain functional.
- **Navigation Links**:
  - `frontend/src/app/trips/page.tsx`: Trip card click navigates to `/trips/${trip.id}`.
  - `frontend/src/app/dashboard/page.tsx`: Upcoming Mission card navigates to `/trips/${nextTrip.id}`.
  - `frontend/src/app/vault/page.tsx`: Mission cards navigate to `/trips/${trip.id}`.

### 2.2 Aesthetic & Design System: Tactical Glassmorphism
The workspace blends TREK’s spatial fluidity with Paladio's dark/sovereign aesthetic:
- **Floating Panels**: 
  - `background: rgba(15, 23, 42, 0.82)`
  - `backdrop-filter: blur(20px) saturate(180%)`
  - `border: 1px solid rgba(255, 255, 255, 0.08)`
  - `border-radius: 16px`
  - `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.36)`
- **Typography & Accents**:
  - Headers: `var(--font-display)`
  - Metadata & Timestamps: `var(--font-mono)`
  - Primary Accent: `var(--color-accent-primary, #2563EB)`
  - Success/Online: `#10B981`

---

## 3. Component Hierarchy

```
frontend/src/app/trips/[id]/page.tsx
  └── TripWorkspace
        ├── TripWorkspaceHeader
        │     ├── BackButton ("← TRIPS")
        │     ├── DestinationTitle & DateRangeBadge
        │     ├── SlidingTabsStrip ([Plan] | [Transports] | [Costs] | [Collab] | [Photos])
        │     └── ShareButton & ExportTrigger
        │
        ├── Tab: "Plan" (Full-Bleed 3-Panel Experience)
        │     ├── TripPlanSidebar (Left Panel)
        │     │     ├── PanelLeftToggle (Collapse to 0px / Expand)
        │     │     ├── PlanToolbar (All Days vs Day tabs, Total Cost tally)
        │     │     ├── GtfsUpgradeToolbar (Real public transit check & 1-click upgrade)
        │     │     └── DayCardsList
        │     │           └── WaypointRows (Stop index, SVG icon, POI name, times, duration, cost)
        │     │
        │     ├── TripMapView (Center Canvas)
        │     │     ├── FloatingPoiCategoryBar (Top-center category quick-filters)
        │     │     ├── LeafletMapContainer (Full bleed Esri canvas basemap)
        │     │     │     ├── ClusterHullPolygons (Colored day territory polygons)
        │     │     │     ├── ClusterCentroidMarkers (Day badges in All Days view)
        │     │     │     ├── ActiveRoutePolyline (Solo active day path)
        │     │     │     ├── BaseCampHotelMarker (Hotel anchor)
        │     │     │     ├── TransitGateAirportMarker (Airport anchor)
        │     │     │     └── CategoricalSvgMarkers (Numbered stop pins with popups)
        │     │     └── MapControls (Recenter & Zoom controls)
        │     │
        │     └── TripPlacesSidebar (Right Panel)
        │           ├── PanelRightToggle (Collapse to 0px / Expand)
        │           ├── AddPlaceButton (+ Add Place / Activity)
        │           │     └── AddPlaceModal (Informative placeholder for future POI search)
        │           ├── PlacesSearchInput & CategoryFilterSelect
        │           └── PlacesList (Current POIs with photo thumbnail, category, assigned day)
        │
        ├── Tab: "Transports" -> TripTransportsView
        │     ├── FlightCards (Inbound & outbound flights with departure/arrival airports & times)
        │     └── TransitPassAdvisory & Step-by-Step Public Transit Legs
        │
        ├── Tab: "Costs" -> TripCostsView
        │     └── TripBudgetWallet (Dissection, manual expenses, split type, debt settlements)
        │
        ├── Tab: "Collab" -> TripCollabView
        │     └── TripCrewManager (Participant list, registered user invite, add/remove travelers)
        │
        └── Tab: "Photos" -> TripPhotosView
              └── PhotoVaultGrid (Visual gallery of destination sights & waypoints)
```

---

## 4. Feature Specifications

### 4.1 Plan View (Left Panel: `TripPlanSidebar`)
- **Day Selector & Filter**: 
  - Allows selecting "ALL DAYS" or individual days ("DAY 1", "DAY 2", etc.).
  - Selecting a day updates the shared `activeDay` state, instantly focusing the map and polyline.
- **Stops & Timing**:
  - Each POI card displays: Stop index badge (`01`, `02`), category badge, POI title, arrival time, scheduled start, departure time, duration, and cost in EUR.
  - Inter-stop travel time and walking/transit leg details are displayed between consecutive POIs.
- **GTFS Public Transit Upgrade**:
  - Checks transit availability for the destination city (`/trips/${tripId}/transit-status`).
  - Polls until status is `READY`.
  - Triggering the upgrade invokes `/trips/${tripId}/upgrade-transit`, updating the itinerary with exact transit lines, stations, and cascading schedules in place.
- **Edge Collapse Toggle**:
  - Clicking the toggle collapses the left panel (`width: 0px`, `overflow: hidden`) with a smooth CSS transition, leaving only a floating `PanelLeftOpen` icon button on the edge.

### 4.2 Plan View (Center: `TripMapView`)
- **Colored Day Cluster Hulls**:
  - Evaluated using `computeClusterPolygon`.
  - Active day hull: highlighted with `#2563EB` tactical stroke, `#1E3A8A` fill, opacity 0.32.
  - Inactive day hulls: muted dashed stroke (`#94A3B8`), soft fill, opacity 0.20.
  - Clicking a cluster polygon immediately selects and focuses that day.
- **Centroid Badges**:
  - When in "ALL DAYS" mode, renders interactive circular markers at each day's centroid (`DAY 1`, `DAY 2`). Clicking zooms into that day.
- **Solo Active Day Polyline**:
  - Renders a `#2563EB` polyline connecting only the active day's sequenced stops, preventing visual spiderwebs across days.
- **Anchor Markers**:
  - Hotel Base Camp: distinct hotel building SVG pin with glowing box shadow and popup.
  - Transit Gate: airplane SVG pin with flight details.
- **Tactical Waypoint Markers**:
  - Pure vector SVG category markers (museum, restaurant, cafe, park, landmark, etc.) with stop numbering.
  - Popups include stop timing, duration, cost, and category.
- **Floating Category Filter Bar**:
  - Centered floating pill above the map with category toggles (Restaurant, Cafe, Bar, Hotel, Attraction, Landmark, Park, Transit).
  - Toggling an icon filters active markers on the map and stops in the sidebars.

### 4.3 Plan View (Right Panel: `TripPlacesSidebar`)
- **`+ Add Place/Activity` Button**:
  - Prominent top action.
  - Opens `AddPlaceModal`: Explains that live POI discovery and custom waypoint insertion will arrive in the next release, allowing the user to view upcoming capabilities.
- **Search & Category Filtering**:
  - Real-time text search through all trip POIs.
  - Dropdown filter by category (`All Categories`, `Museum`, `Restaurant`, `Landmark`, etc.).
- **Places List**:
  - Displays each waypoint with photo thumbnail (or fallback SVG pattern), name, category badge, and day label.
  - Clicking any place card centers and zooms the Leaflet map onto that location.
- **Edge Collapse Toggle**:
  - Collapses the panel (`width: 0px`) with smooth transition to maximize map view.

### 4.4 Tab: `Transports`
- Flight ticket cards extracted from `itinerary_data.days` and `flight_info`:
  - Departure and arrival airports (IATA codes), times, flight duration, and ticket identifiers.
- Daily transit pass recommendations (`TransitRecommendationCard`) if single tickets exceed the daily pass threshold.
- Detailed public transit leg step cards (`TransitLegView`).

### 4.5 Tab: `Costs` (`TripBudgetWallet`)
- Seamlessly hosts Paladio’s `TripBudgetWallet`:
  - **Dissection**: Itemized itinerary costs by category (transit, lodging, activities, dining, other) with exclude/include toggles.
  - **Expenses**: Custom manual expense addition and deletion.
  - **Settlement**: Equal or custom splitting across registered trip travelers with net balance calculation and simplified debt settlement transactions.

### 4.6 Tab: `Collab` (`TripCrewManager`)
- Displays all participants associated with the trip.
- Provides forms to add registered users by ID or add guest travelers by name/email.
- Prevents removal of the last remaining participant.

### 4.7 Tab: `Photos` (`TripPhotosView`)
- Visual gallery displaying all photos in `itinerary_data.photos`.
- Aspect-ratio locked image cards with hover magnification.

---

## 5. Data Flow & State Management

1. **Trip Fetch**:
   - `useTrips` hook and `apiFetch` load the active trip from `/trips/${id}`.
2. **Synchronized State**:
   - `activeTab`: `'plan' | 'transports' | 'costs' | 'collab' | 'photos'`.
   - `selectedDay`: `number | 'all'` (shared between `TripPlanSidebar`, `TripMapView`, and `TripPlacesSidebar`).
   - `categoryFilter`: `PoiCategoryType | null` (shared between floating pill bar and right sidebar).
   - `isLeftOpen`, `isRightOpen`: Boolean collapse states stored in `sessionStorage` for persistence across tab navigation.
3. **Trip Updates**:
   - Upgrades (e.g. GTFS public transit) and traveler modifications update the local trip state and trigger re-render of dependent tabs (`Costs`, `Transports`, `Plan`) without page reload.
4. **Dynamic Data Invariant**:
   - Zero hardcoded mock records. All data originates from PostgreSQL, live external API/GTFS services, or user parameters.

---

## 6. Error Handling & Edge Cases

1. **Trip Not Found (404)**:
   - Renders a sovereign error state: `[ MISSION DATA NOT FOUND FOR ID: {id} ]` with a return link to `/trips`.
2. **Missing Lat/Lng**:
   - Stops without geodata are rendered in the itinerary list with a `[NO GEODATA]` indicator and skipped from Leaflet polyline/marker calculations without throwing Leaflet bounds errors.
3. **Single-Day Fallback**:
   - Safely parses flat itineraries with `itinerary.path` as Day 1.
4. **Offline / Network Interruption**:
   - Displays retry banner and preserves cached session data.

---

## 7. Verification & Testing Plan

### 7.1 Automated Tests
- **Unit & Integration Suite**:
  - `TripWorkspace` rendering and tab transitions.
  - `TripPlanSidebar` day filtering, stop rendering, and GTFS upgrade dispatch.
  - `TripMapView` cluster hull polygon and marker generation.
  - `TripPlacesSidebar` text search filtering and placeholder modal interaction.
  - Link integrity tests ensuring `/trips/page.tsx` and `/dashboard/page.tsx` route to `/trips/[id]`.
- Command: `pytest backend/tests/ -q` & `npm run test` / `npx vitest run`.

### 7.2 Manual Verification
- Launch local development environment.
- Open `/trips` and click an existing trip.
- Verify full-bleed map loads with left floating plan sidebar and right places sidebar.
- Verify day selection switches active cluster hull, route polyline, and markers.
- Test left and right panel collapse toggles.
- Switch tabs to `Transports`, `Costs`, `Collab`, and `Photos` to verify all data displays properly.
- Verify GTFS upgrade button and budget wallet settlement calculations.
