# Design Specification: Dynamic POI Detail Inspector & Real Photos

**Date**: 2026-10-21  
**Author**: Antigravity  
**Status**: Draft for User Review  
**Canonical Spec Path**: `docs/superpowers/specs/2026-10-21-poi-detail-inspector-photos-design.md`

---

## 1. Overview & Motivation

When planning trips in Paladio, users searching for or clicking on places (such as *Museo del Prado*, *Royal Palace of Madrid*, or any search result/waypoint) currently see only minimal metadata (name, cost, duration, and similarity score) in a small floating card or map popup.

This feature introduces a comprehensive **POI Detail Inspector Drawer** that slides in from the right edge of the workspace whenever a user clicks a POI anywhere in the interface (Search Engine results, Map pins, or Timeline stops). The inspector displays rich, authoritative operational details and **real, high-resolution photography** resolved dynamically via Wikipedia and Wikimedia Commons, backed by Redis caching.

In accordance with Paladio's core engineering invariants:
- **Zero Mock Data**: All data (photos, descriptions, operating hours, prices) is completely dynamic—loaded from PostgreSQL, OpenStreetMap tags, live Wikimedia/Wikipedia APIs, or runtime calculations. Mock placeholders and synthetic stock photos are strictly forbidden.
- **Air-Gappable & Self-Hosted**: No cloud LLM APIs. Wikimedia photo resolution uses standard public REST/Action APIs and results are cached in Redis (with fallback to local schematic category illustrations if no photo exists for rare nodes).

---

## 2. Architecture & Data Flow

```
[ Frontend: Next.js 16 / React 19 ]
  │
  ├── 1. Click POI (Search Card / Map Marker / Timeline Stop)
  │
  ▼
[ GET /api/v1/pois/{poi_id}/details ]
  │
  ├── 2. Query PostgreSQL `attractions` table by ID
  │      (Pulls hours_known, daily_windows, cost_eur, description, wikidata_id, etc.)
  │
  ├── 3. Check Redis cache `poi:photos:{poi_id}`
  │      ├── HIT  ─► Return cached photos immediately (<5ms)
  │      └── MISS ─► Call Wikimedia Photo Resolver
  │                    │
  │                    ├── Wikipedia REST API (summary -> originalimage + thumbnail)
  │                    ├── Wikimedia Commons Action API (prop=imageinfo for high-res CC gallery)
  │                    └── OSM `image` / `wikimedia_commons` tags
  │                    │
  │                    └── Cache resolved photos in Redis (TTL: 7 days)
  │
  ▼
[ Response: Full POI Details + Verified Photo Array ]
  │
  ▼
[ Frontend: Slide-Over `PoiDetailDrawer` ]
  ├── Edge-to-edge Hero Photo Carousel with thumbnails & lightbox
  ├── Quick Action Bar ("Add to Day X", "Focus on Map", "Website", "Wikipedia")
  ├── Operational Hours (Live "Open Now / Closed" + 7-Day Matrix)
  ├── Pricing & Estimated/Verified Indicator
  └── Rich Wikipedia Description & Neighborhood Specs
```

---

## 3. Backend Specification

### 3.1 New Endpoint: `GET /api/v1/pois/{poi_id}/details`

Located in `backend/app/api/pois.py`:
- **Input**: `poi_id: str` (e.g. `OSM-node-madrid-prado` or UUID).
- **Output Schema (`PoiDetailResponse`)**:
  - `id`: str
  - `name`: str
  - `category`: str
  - `city`: str
  - `lat`: float
  - `lng`: float
  - `duration_mins`: int
  - `cost_eur`: float
  - `cost_is_estimated`: bool
  - `cost_source`: str | None
  - `scoring`: dict (rating: float, reviews: int)
  - `description`: str | None
  - `description_source`: str | None
  - `wikipedia_title`: str | None
  - `wikidata_id`: str | None
  - `website`: str | None
  - `neighborhood`: str | None
  - `doc_quality`: str
  - `hours_known`: bool
  - `osm_opening_hours`: str | None
  - `daily_windows`: list[list[dict]]  # 7-day schedule
  - `photos`: list[PoiPhotoItem]

### 3.2 Schema `PoiPhotoItem`
- `url`: str (full-resolution HTTPS image URL)
- `thumbnail_url`: str (optimized width ~600px thumbnail)
- `caption`: str | None
- `author`: str | None
- `license_name`: str | None (e.g., "CC BY-SA 4.0", "Public Domain")
- `license_url`: str | None

### 3.3 Service: `WikimediaPhotoResolver` (`backend/app/services/wikimedia_photo_resolver.py`)
- Async service using `httpx.AsyncClient` with a compliant `User-Agent: PaladioTravelBot/1.0 (https://paladio.local; contact@paladio.local)` header.
- Resolution hierarchy:
  1. If `wikipedia_title` exists or can be derived from POI name:
     - Query `https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}`.
     - Extract `originalimage.source` and `thumbnail.source`.
  2. If `wikidata_id` or POI name has Wikimedia Commons category/claims:
     - Query Wikimedia Commons API for up to 6 high-quality gallery photos.
  3. If OSM tags contain `image` or `wikimedia_commons`:
     - Resolve direct image URLs.
- Deduplication: normalizes URLs to avoid duplicate photos.
- Redis Caching:
  - Key: `poi:photos:{poi_id}`
  - Serialization: JSON array of `PoiPhotoItem`
  - TTL: 604,800 seconds (7 days).

---

## 4. Frontend Specification

### 4.1 Component: `PoiDetailDrawer.tsx` (`frontend/src/components/trip-workspace/PoiDetailDrawer.tsx`)
- **Visual Style**:
  - Position: Fixed on the right side (`top: 56px, right: 0, bottom: 0, width: 440px`), sliding over the workspace.
  - Background: `rgba(15, 23, 42, 0.94)`, `backdrop-filter: blur(24px)`.
  - Border: Left border `1px solid rgba(255, 255, 255, 0.08)`.
  - Box Shadow: `-8px 0 32px rgba(0, 0, 0, 0.45)`.
  - Z-Index: 1200 (above map and panels).
- **Sections**:
  1. **Header**:
     - Back/Close button (`< Back to Search` or `X`).
     - Category badge (`PoiCategoryBadge`).
     - Verification indicator (Doc Quality / Verified).
  2. **Hero Photo Carousel**:
     - Aspect ratio 16:9 main viewport with smooth slide transition.
     - Interactive thumbnail strip underneath.
     - Image counter (`1 / 5`).
     - Creative Commons attribution badge (`Photo: Wikimedia Commons / CC BY-SA 4.0`).
     - Click to expand in full lightbox.
     - Graceful state: if POI has no Wikimedia photo, shows bespoke tactical minimalist category illustration without fake stock images.
  3. **Action Bar**:
     - "+ Add to Itinerary" button with Day Dropdown (Day 1, Day 2, Day 3... or specific day if selected).
     - "Focus on Map" button (triggers Leaflet flyTo and marker ping).
     - External Links: "Official Website" (if URL exists) & "Wikipedia Article".
  4. **Operational & Logistics Strip**:
     - Duration: `~120m visit`.
     - Cost: `15.00 €` or `FREE` badge with estimated/verified status.
     - Community score: `★ 4.8 (1,000+ reviews)`.
  5. **Opening Hours Matrix**:
     - Real-time "Open Now" or "Closed" status based on local city time.
     - Today's window (e.g. `10:00 - 20:00`).
     - Collapsible accordion for full 7-day schedule (Mon-Sun).
  6. **Overview & Description**:
     - Full Wikipedia lead extract with clean typography.
     - Neighborhood tag & GPS coordinates.

### 4.2 Workspace Integration: `TripWorkspace.tsx`
- State: `inspectedPoiId: string | null = null`.
- When `inspectedPoiId` is non-null:
  - Renders `<PoiDetailDrawer poiId={inspectedPoiId} onClose={() => setInspectedPoiId(null)} onAddToDay={(day, poi) => handleAddPoiToDay(day, poi)} onFocusOnMap={(poi) => handleFocusOnMap(poi)} />`.
- Unified Triggers:
  - `TripPlacesSidebar.tsx`: Clicking on the Exact Match card or any similar place card calls `onInspectPoi(poi.id)`. (Card remains draggable to timeline).
  - `TripPlanSidebar.tsx`: Clicking on any scheduled stop card in the timeline calls `onInspectPoi(stop.poi_id)`.
  - `TripMapView.tsx`: Clicking the marker popup or an "Inspect Details" button calls `onInspectPoi(place.id)`.

---

## 5. Error Handling & Edge Cases

1. **No External Photos Found**:
   - For obscure nodes (e.g. a small bench or uncataloged shop), the photo resolver returns an empty array.
   - The drawer renders a high-fidelity Japanese Minimalist vector SVG illustration tailored to the POI's category (`CultureIllustrations`, `HospitalityIllustrations`, or `TransitIllustrations`) with a subtle `"Community imagery pending"` caption. Mock stock photos are never used.
2. **Wikimedia Rate Limiting or Network Outage**:
   - Timeout set to 3.5 seconds; on timeout or HTTP failure, logs a warning and returns POI database details gracefully without blocking the UI.
3. **Split Hours / Unknown Hours**:
   - If `hours_known` is `false`, clearly flags `"Hours not verified in official catalog"` rather than inventing fictitious opening times.
4. **Mobile & Small Screens**:
   - Drawer spans 100% width on screens `< 640px` with a swipe-down or close button.

---

## 6. Verification Plan

1. **Automated Backend Tests**:
   - Test `GET /api/v1/pois/{poi_id}/details` returns 200 with schema validation for known attraction (e.g. `OSM-node-madrid-prado`).
   - Test Wikimedia photo resolver fetches real image URLs and license metadata for Wikipedia title `"Museo del Prado"`.
   - Test Redis caching: second request hits Redis cache without outbound HTTP calls.
   - Test 404 for non-existent POI.
2. **Automated Frontend Tests**:
   - Test `PoiDetailDrawer` renders correctly when `poiId` is provided.
   - Test thumbnail navigation switches active hero photo.
   - Test "Add to Itinerary" triggers workspace state update.
3. **Manual Workspace Verification**:
   - Search "el prado" in `TripPlacesSidebar`.
   - Click "Museo del Prado": verify drawer slides in smoothly from the right with real Prado photography.
   - Verify map centers on Prado.
   - Click another POI (e.g. Royal Palace of Madrid): verify drawer transitions smoothly.
   - Test clicking a stop in the timeline and a marker on the map.
