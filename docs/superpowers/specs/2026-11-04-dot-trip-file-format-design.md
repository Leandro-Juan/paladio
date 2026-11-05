# Specification: `.trip` File Format & Packaging Engine

**Date:** 2026-11-04  
**Status:** Approved  
**Author:** Antigravity & User  
**Target Subsystem:** `backend/app/trip_package/` and `backend/app/api/trips.py`

---

## 1. Executive Summary

This document specifies the open, self-contained `.trip` file standard (`application/vnd.paladio.trip+zip`) and its backend generation engine for Paladio. A `.trip` file completely encapsulates a trip: metadata, full itinerary with turn-by-turn route polylines and POIs, wallet tickets with digital barcodes and original binary passes (PDFs/PKPass), group travel expenses and debt settlement matrices, custom collections and packing checklists, and local photos.

The format is engineered to be 100% air-gappable, portable across self-hosted instances, inspectable by standard ZIP utilities, and privacy-conscious with dual export profiles (`full_vault` and `community_shareable`).

---

## 2. File Format Specification

### 2.1 Container Structure
The `.trip` file is an uncompressed or standard deflate ZIP archive. The internal hierarchy is modular:

```text
<trip-name>.trip
├── mimetype                               # ASCII: "application/vnd.paladio.trip+zip"
├── paladio.json                           # Format version, manifest, bounding box, SHA-256 hashes
├── itinerary.json                         # Days, slots, activities, POIs, maneuvers, polylines
├── wallet.json                            # Tickets, booking anchors, barcode payloads, seat/gate info
├── expenses.json                          # Participants, expenses, category splits, settlement matrix
├── collections.json                       # Saved bookmarks, packing lists, custom trip notes
└── attachments/
    ├── tickets/                           # Binary boarding pass PDFs, Apple PKPass files
    └── photos/                            # Trip photos (JPEG/WebP/PNG)
```

### 2.2 `mimetype` File
The first file in the archive must be named `mimetype`, stored uncompressed (`ZIP_STORED`), containing:
```text
application/vnd.paladio.trip+zip
```

### 2.3 `paladio.json` (Root Manifest)
Defines metadata, export parameters, destination context, and cryptographic hashes of all container members:
```json
{
  "$schema": "https://paladio.app/schemas/v1/trip-package.json",
  "format_version": "1.0.0",
  "generator": {
    "name": "Paladio Backend",
    "version": "1.0.0"
  },
  "trip_id": "8f8b0e51-4091-4e4b-97e3-057bf9e34457",
  "export_profile": "full_vault",
  "created_at": "2026-11-04T17:20:00Z",
  "title": "Budapest Thermal & Architectural Tour",
  "destination": "Budapest, Hungary",
  "destination_timezone": "Europe/Budapest",
  "start_date": "2026-12-10",
  "end_date": "2026-12-15",
  "bounding_box": {
    "min_lat": 47.46,
    "max_lat": 47.54,
    "min_lon": 19.01,
    "max_lon": 19.10
  },
  "file_manifest": {
    "itinerary.json": { "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "size_bytes": 14205 },
    "wallet.json": { "sha256": "...", "size_bytes": 3512 },
    "expenses.json": { "sha256": "...", "size_bytes": 2810 },
    "collections.json": { "sha256": "...", "size_bytes": 1104 }
  }
}
```

### 2.4 Domain Payloads

1. **`itinerary.json`**:
   - `trip_id`, `destination`, `days_count`.
   - `days`: list of day objects with date, day number, and chronological slots.
   - `slots`: time windows, activity details, POI coordinates (`lat`, `lon`), category, estimated duration, cost, notes.
   - `routes`: Valhalla route geometries (GeoJSON LineString or encoded polyline6), travel mode (walk, transit, bicycle), step maneuvers, and transit line details.
   - `travel_constraints`: pace, user tastes, tag affinities at generation time.

2. **`wallet.json`**:
   - `tickets`: list of tickets (type: flight, train, bus, lodging, event, attraction).
   - `booking_anchors`: flight segments (IATA codes, carriers, flight numbers, departure/arrival times, seats) and hotel anchors (check-in/out, address).
   - `barcodes`: format (QR_CODE, AZTEC, PDF_417, CODE_128), raw decoded payload string.
   - `attachments`: list of files in `attachments/tickets/` associated with each ticket.

3. **`expenses.json`**:
   - `currency`: default trip currency (e.g., EUR, USD).
   - `participants`: list of traveler profiles (ID, display name, role).
   - `expenses`: amount, payer ID, category, timestamp, description, split rules.
   - `settlement`: net balance per participant, debt minimization transfer graph.

4. **`collections.json`**:
   - `collections`: user-curated place lists (e.g. "Rooftop Bars", "Specialty Coffee").
   - `items`: place ID, title, notes, coordinates, visited status.
   - `notes`: freeform markdown notes and packing list checklists.

---

## 3. Privacy & Export Profiles

The packager supports two export profiles:

1. **`full_vault`** (Default):
   - Complete 1:1 export for private backup or transferring between self-hosted instances.
   - Includes full traveler PII (emails, names), expenses, PNR reservation codes, barcode payloads, and raw PDF/PKPass attachments.
   - Supports optional AES-256 container encryption.

2. **`community_shareable`**:
   - Sanitized export for sharing with friends or publishing itineraries publicly.
   - **Stripped Data:**
     - Participant emails and internal user IDs (anonymized to "Traveler 1", "Traveler 2").
     - Sensitive booking codes (airline PNRs, ticket confirmation numbers, barcode payloads).
     - Individual expense transactions and settlement debt calculations.
     - Raw ticket PDFs and boarding pass scans.
   - **Retained Data:**
     - Complete itinerary schedule, POIs, coordinates, route polylines, and timing.
     - Hotel anchors and flight schedules (without booking codes).
     - Collections, packing checklists, and general travel notes.
     - Curated trip photos (with option to scrub EXIF GPS).

---

## 4. Backend Implementation Architecture

```text
backend/app/trip_package/
├── __init__.py
├── schemas.py          # Pydantic models for package manifests and sub-files
├── sanitizer.py        # Filter pipeline for community_shareable profile
├── packager.py         # TripPackager service assembling ZIP archive & checksums
└── unpacker.py         # Package integrity and validation engine
```

### 4.1 Packaging Flow
1. Fetch `TripModel` with related participants, expenses, tickets, collections, and photos via SQLAlchemy async session.
2. Construct structured domain dictionaries according to the `.trip` specification.
3. If `export_profile == "community_shareable"`, pass the payloads through `TripSanitizer`.
4. Stream entries into a temporary ZIP container using `zipfile.ZipFile`:
   - Store `mimetype` without compression at the beginning.
   - Write `itinerary.json`, `wallet.json`, `expenses.json`, `collections.json`.
   - Resolve and copy ticket attachments and photos into `attachments/`.
   - Calculate SHA-256 for all members and write `paladio.json`.
5. Stream the resulting file via `GET /api/trips/{trip_id}/export`.

### 4.2 Security & Safety Guardrails
- **Zip-Slip Protection**: When reading/unpacking, validate all member paths using `os.path.commonpath` to prevent path traversal.
- **Resource Limits**: Enforce maximum uncompressed size and file count checks to protect against zip bombs.
- **Dynamic Data Integrity**: All data is populated dynamically from PostgreSQL.

---

## 5. Verification Plan

### Automated Tests (`backend/tests/test_trip_package.py`)
- Test package creation for a trip with full attachments, tickets, expenses, and itinerary data.
- Validate ZIP container structure and `mimetype` location.
- Verify SHA-256 checksums in `paladio.json` match file contents.
- Verify `community_shareable` sanitization (no PNRs, no emails, no debt amounts).
- Verify export API endpoint returns valid file with correct headers.
