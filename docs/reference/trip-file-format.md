# `.trip` file package format specification

Paladio exports and imports entire expeditions as self-contained `.trip` ZIP containers (`application/vnd.paladio.trip+zip`, schema version `1.0.0`), supporting both complete private backups (`full_vault`) and anonymized shareable archives (`community_shareable`).

## ZIP container structure and entry order

`TripPackager` (`backend/app/trip_package/packager.py`) writes an OpenDocument-style container where `mimetype` acts as a magic header validated before extracting any payload.

```text
expedition.trip (ZIP container)
├── mimetype                     # MUST be entry #0, ZIP_STORED (uncompressed): application/vnd.paladio.trip+zip
├── paladio.json                 # Root TripPackageManifest with SHA-256 digests and byte sizes
├── itinerary.json               # TripItineraryPackage (days, routes, travel_constraints)
├── wallet.json                  # TripWalletPackage (tickets, booking_anchors, attachment manifest)
├── expenses.json                # TripExpensePackage (currency, participants, expenses, settlement)
├── collections.json             # TripCollectionPackage (curated POI lists, notes)
└── attachments/
    ├── tickets/<id>_<filename>  # Included ONLY in full_vault profile
    └── photos/<photo_filename>  # High-res trip gallery images (when include_photos=True)
```

## Root manifest (`paladio.json`) and sub-schemas

`TripPackageManifest` (`backend/app/trip_package/schemas.py`) pins package metadata, geographic bounding boxes calculated across itinerary stops, and a `file_manifest` map verifying every member file's integrity.

```json
{
  "$schema": "https://paladio.app/schemas/v1/trip-package.json",
  "format_version": "1.0.0",
  "generator": { "name": "Paladio Backend", "version": "1.0.0" },
  "trip_id": "trip_uuid_here",
  "export_profile": "full_vault",
  "created_at": "2026-11-22T20:00:00+00:00",
  "title": "Kyoto Autumn Circuit",
  "destination": "Kyoto",
  "destination_timezone": "Asia/Tokyo",
  "start_date": "2026-11-10",
  "end_date": "2026-11-15",
  "bounding_box": {
    "min_lat": 34.9671,
    "max_lat": 35.0394,
    "min_lon": 135.6761,
    "max_lon": 135.7982
  },
  "file_manifest": {
    "itinerary.json": { "sha256": "e3b0c44298fc1c149afb…", "size_bytes": 18420 }
  }
}
```

## Export profiles: `full_vault` versus `community_shareable`

Choosing `export_profile="community_shareable"` runs `TripSanitizer.sanitize_for_sharing` (`backend/app/trip_package/sanitizer.py`) before sealing the ZIP archive so personal financial records and travel credentials never leak into shared files.

| Archive member | `full_vault` behavior | `community_shareable` behavior |
| :--- | :--- | :--- |
| `itinerary.json` | Preserved intact (days, stops, routes, constraints) | Preserved intact |
| `wallet.json` | Preserves all ticket fields and `attachments` manifest | Scrubs `reference_code`, `barcode_payload`, `holder_name`, `raw_barcode`, `attachments`, and empties `wallet.attachments` |
| `attachments/tickets/*` | Packaged from `WALLET_STORAGE_DIR` and hashed | Omitted from archive completely |
| `expenses.json` | Preserves real participant names/emails, expenses, and currency | Empties `expenses` and `settlement`; anonymizes participants to `traveler-1` (`Traveler 1`), `traveler-2`, … |
| `collections.json` & `attachments/photos/*` | Preserved intact | Preserved intact (`include_photos` controllable) |

## Integrity validation, security checks, and endpoints

Before hydrating any `.trip` upload (`POST /api/trips/import` or exported via `GET /api/trips/{trip_id}/export`), `TripUnpacker` (`backend/app/trip_package/unpacker.py`) enforces four structural defenses:

1. **MIME verification**: Confirms entry `0` is named `mimetype`, uses `ZIP_STORED` (uncompressed), and matches `application/vnd.paladio.trip+zip` verbatim.
2. **SHA-256 checksum validation**: Re-hashes every entry listed in `paladio.json` `file_manifest`, raising `TripPackageValidationError` on missing files or digest mismatches.
3. **Pydantic validation**: Validates `itinerary.json`, `wallet.json`, `expenses.json`, and `collections.json` against `TripItineraryPackage`, `TripWalletPackage`, `TripExpensePackage`, and `TripCollectionPackage`.
4. **Zip-slip path traversal prevention**: Resolves each member destination against `extract_to_dir.resolve()` and aborts if any path escapes the extraction root.
