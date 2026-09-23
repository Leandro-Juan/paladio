# Technical Reference: Next.js Frontend Architecture

This document provides a technical reference for Paladio's reactive user interface, built with **Next.js 15 (App Router)**, **React 19**, and **Tailwind CSS**.

---

## 1. Directory Structure (`frontend/src/`)

```text
frontend/src/
├── app/                        # Next.js App Router Pages
│   ├── dashboard/              # User summary, active trips, price drop notifications
│   ├── trips/                  # Interactive Trip Preparation & Itinerary Viewer
│   ├── vault/                  # POI Vault & Geospatial Map Explorer
│   ├── model/                  # ML preference radar, weights, & EMA inspection
│   ├── engine/                 # C++ solver telemetry & performance benchmarks
│   ├── layout.tsx              # Root shell with persistent Sidebar and NotificationCenter
│   └── globals.css             # Tailwind theme variables & dark-mode styling
├── components/                 # Core UI Components
│   ├── TripTimeline.tsx        # Chronological daily schedule view
│   ├── PreferenceRadar.tsx     # Real-time 8-axis SVG taste radar
│   ├── VaultMap.tsx            # Leaflet/MapLibre POI geospatial map
│   ├── TransitLegView.tsx      # Step-by-step multimodal public transit routing
│   ├── TripPreparationForm.tsx # Conversational & structured intake with WebSocket streaming
│   ├── NotificationCenter.tsx  # Slide-over real-time alert center
│   └── PoiCategoryBadge.tsx    # Visual category chips with color coding
├── hooks/                      # Custom React Hooks
│   ├── useWebSocket.ts         # Persistent bi-directional WebSocket connection & reconnects
│   └── useTripSession.ts       # Trip state store synchronization
└── types/                      # TypeScript Interface Definitions
    ├── itinerary.ts            # Daily schedule, POI cards, transit legs
    └── telemetry.ts            # WebSocket stream event types
```

---

## 2. Core UI Components

### 2.1. `TripTimeline.tsx`
- **Purpose:** Renders the optimized multi-day travel schedule.
- **Features:**
  - Day tab navigation with date badges.
  - Chronological time cards ($[09:30, 11:30]$) displaying POI names, estimated admission costs, and categories.
  - **Meal Windows:** Distinctive visual blocks for Lunch and Dinner according to cultural schedules.
  - **Transit Connectors:** Visual route links showing transit type (walking, metro, bus), duration, and fare cost between consecutive stops.

### 2.2. `PreferenceRadar.tsx`
- **Purpose:** Visualizes the user's permanent and dynamic taste preferences across the 8 harmonic categories:
  `['art_culture', 'history_heritage', 'nature_outdoors', 'architecture', 'food_culinary', 'nightlife', 'shopping', 'scenic_views']`.
- **Implementation:** Pure SVG polygon rendering with animated transitions as new prompt analyses update the underlying affinity weights.

### 2.3. `VaultMap.tsx`
- **Purpose:** Interactive geospatial visualization of attractions in the destination city.
- **Features:** Color-coded category markers, clustered viewports, and route polylines connecting daily visited nodes in the solver's optimal order.

### 2.4. `TripPreparationForm.tsx` & WebSocket Streaming
- Connects to `ws://localhost:8000/ws/stream`.
- Handles real-time lifecycle event streaming (`PARSING_TICKETS`, `EVALUATING_ROUTES`, `SOLVING_TSPTW`).
- Listens for `HUMAN_INTERRUPTION` events and prompts the user to supply missing constraints before continuing.
