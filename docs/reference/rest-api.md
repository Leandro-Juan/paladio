# FastAPI REST API reference

Paladio's FastAPI gateway (`backend/app/main.py`) serves 160 unversioned `@router` bindings across 15 router modules (plus `GET /health`, 2 WebSocket endpoints, and the `/mcp` FastMCP mount) with automatic interactive OpenAPI docs at `/docs` and `/redoc`.

## Authentication and authorization model

Protected endpoints require `Authorization: Bearer your_jwt_access_token_here` signed with HS256 (`JWT_SECRET_KEY`).

- **Public bootstrap**: `GET /health`, `GET /api/auth/setup-status`, `POST /api/auth/setup` (valid only when zero users exist), `POST /api/auth/login`, and `POST /api/auth/register` (auto-admin if zero users exist; otherwise gated by `ALLOW_PUBLIC_REGISTRATION`).
- **Role tiers**: Standard users hold `get_current_user`; system infrastructure routes enforce `get_current_admin_user` (`role == "admin"`).
- **Trip RBAC**: Trip routes check `assert_trip_access(user, trip_id, required_level, db)` (`VIEWER` < `EDITOR` < `OWNER`). Unowned local trips (`user_id IS NULL`) allow owner access in sovereign single-user setups.

## Health, authentication, and user profiles

Manage initial admin setup, token login, collaborator lookup, user provisioning, and taste profile exports.

| Method & Path | Access | Description |
| :--- | :--- | :--- |
| `GET /health` | Public | Container healthcheck returning `{"status": "ok", "service": "Paladio Gateway"}` |
| `GET /api/auth/setup-status` | Public | Returns whether initial admin setup at `/setup` is required |
| `POST /api/auth/setup` | Public (0 users) | Creates initial master administrator account and returns JWT |
| `POST /api/auth/register` | Gated | Registers first admin or public user when `ALLOW_PUBLIC_REGISTRATION=true` |
| `POST /api/auth/login` | Public | Authenticates username or email with PBKDF2-SHA256 and issues JWT |
| `GET /api/users/collaborators/options` | User | Lists eligible Paladio accounts to invite onto trips |
| `GET /api/users/`, `POST /api/users/` | Admin | Lists or creates user accounts |
| `PATCH /api/users/{user_id}`, `DELETE /api/users/{user_id}` | Admin | Updates role, active state, currency, or deletes a user |
| `GET /api/users/me`, `PATCH /api/users/me` | User | Reads or updates current account profile, avatar, and password |
| `PUT /api/users/me/preferences` | User | Updates preferences (locale, currency, units, clock, holidays, taste tags) |
| `GET /api/users/me/embedding`, `PUT /api/users/me/embedding` | User | Reads or updates the user's 768-D semantic taste vector |
| `GET /api/users/me/taste`, `POST /api/users/me/taste/reset`, `DELETE /api/users/me/taste` | User | Exports, resets to neutral, or purges stored taste history |

## Trips, revisions, participants, expenses, photos, and `.trip` packages

Core trip endpoints mount under `/api/trips` (`backend/app/api/trips.py`, with `collections_router` and `tickets_router` included under the same prefix).

| Method & Path | Access | Description |
| :--- | :--- | :--- |
| `POST /api/trips/`, `GET /api/trips/` | User | Creates a Blank or configured trip; lists user-accessible trips |
| `GET /api/trips/{trip_id}`, `PUT /api/trips/{trip_id}`, `DELETE /api/trips/{trip_id}` | RBAC | Fetches, updates, or deletes an expedition |
| `POST /api/trips/{trip_id}/reoptimize` | Editor | Invokes C++20 `solve_tsptw` (with `solve_tsp_tour` fallback) on the itinerary |
| `POST /api/trips/{trip_id}/shift-dates`, `POST /api/trips/{trip_id}/duplicate` | Editor | Shifts trip dates or clones an expedition |
| `POST /api/trips/{trip_id}/upgrade-transit` | Editor | Replaces estimated legs with compiled GTFS + Valhalla transit connections |
| `POST /api/trips/scan-boarding-pass` | User | Scans PDF/image/`.pkpass`/text flight or hotel confirmations via BCBP and OCR |
| `POST /api/trips/expenses/scan-receipt`, `POST /api/trips/{trip_id}/expenses/scan-receipt` | User / Editor | Scans receipt images or PDFs for merchant, amount, currency, and date |
| `GET/POST /api/trips/{trip_id}/participants`, `DELETE /api/trips/{trip_id}/participants/{participant_id}` | Viewer / Editor | Manages Crew Roster participants |
| `GET/POST /api/trips/{trip_id}/expenses`, `PUT/DELETE /api/trips/{trip_id}/expenses/{expense_id}` | Viewer / Editor | Manages shared expenses and splits |
| `GET /api/trips/{trip_id}/settlement` | Viewer | Computes net balances and simplified settlement transfers |
| `POST /api/trips/{trip_id}/photos`, `GET/DELETE /api/trips/{trip_id}/photos/{photo_id}` | Editor / Viewer | Uploads, serves, or deletes trip gallery photos |
| `GET /api/trips/{trip_id}/export`, `POST /api/trips/import` | Viewer / User | Exports (`full_vault` or `community_shareable`) or imports `.trip` ZIP packages |
| `GET /api/trips/{trip_id}/revisions` | Viewer | Lists immutable itinerary revision snapshots |
| `POST /api/trips/{trip_id}/revisions/{revision_id}/revert`, `POST /api/trips/{trip_id}/revisions/{target_revision}/restore` | Editor | Reverts a specific revision diff or restores a historical revision snapshot |

## Saved collections and Bookings Wallet (`tickets`)

Global and trip-scoped bookmark collections plus encrypted wallet tickets share the `/api/trips` prefix.

| Method & Path | Access | Description |
| :--- | :--- | :--- |
| `GET/POST /api/trips/saved-collections`, `PUT/DELETE /api/trips/saved-collections/{collection_id}` | User | Manages global reusable POI collections (`trip_id IS NULL`) |
| `POST/PATCH/DELETE /api/trips/saved-collections/{collection_id}/items[/poi_id]` | User | Adds, updates visit status, or removes POIs in global collections |
| `POST /api/trips/saved-collections/{collection_id}/import` | User | Imports GPX, KML, KMZ, or Google Maps lists into a global collection |
| `GET/POST /api/trips/{trip_id}/collections`, `PUT/DELETE /api/trips/{trip_id}/collections/{collection_id}` | Viewer / Editor | Manages trip-scoped collections |
| `POST/PATCH/DELETE /api/trips/{trip_id}/collections/{collection_id}/items[/poi_id]` | Editor | Adds, edits, or removes trip collection stops |
| `POST /api/trips/{trip_id}/collections/{collection_id}/import` | Editor | Imports GPX/KML/KMZ/Google Maps places into a trip collection |
| `GET /api/trips/{trip_id}/pois/{poi_id}/collections`, `POST /api/trips/{trip_id}/pois/{poi_id}/toggle` | Viewer / Editor | Lists POI collection memberships or toggles bookmark state |
| `GET/POST /api/trips/{trip_id}/tickets`, `GET /api/trips/{trip_id}/tickets/suggestions` | Viewer / Editor | Lists/creates tickets and suggests unlinked itinerary anchors |
| `GET/PUT/DELETE /api/trips/{trip_id}/tickets/{ticket_id}` | Viewer / Editor | Reads, updates, or deletes an encrypted ticket |
| `POST /api/trips/{trip_id}/tickets/sync`, `POST /api/trips/{trip_id}/tickets/scan` | Editor | Syncs wallet anchors into the itinerary or scans ticket files |
| `GET /api/trips/{trip_id}/tickets/{ticket_id}/attachments/{attachment_id}` | Viewer | Streams original stored ticket PDF, image, or `.pkpass` attachment |

## Points of interest, locations, transit, weather, currency, and holidays

Geographic discovery, OSM/GTFS dataset pipelines, routing, and auxiliary context endpoints span six routers.

| Router Prefix | Key endpoints |
| :--- | :--- |
| **`/api/pois`** | `GET /search`, `POST /city/{city}/download` (alias `POST /{city}/download`), `GET /city/{city}/status`, `POST /batch-photos`, `GET /check-duplicate`, `GET /{poi_id}`, `POST ""`, `PUT /{poi_id}`, `POST /{poi_id}/translate`, `DELETE /{poi_id}` |
| **`/api/locations`** | `GET /search` (cities and nearest airports), `GET /resolve-airport`, `GET /hotels`, `GET /reverse`, `GET /places` |
| **`/api` (Transit)** | `GET /trips/{trip_id}/transit/{availability,nearby,lines,lines/{line_id},stations/{station_id},stations/{station_id}/departures}`, `POST /trips/{trip_id}/transit/directions`, `GET /transit/{city}/{map-stations,stations/{station_id},stations/{station_id}/departures,lines/{line_id}}`, `POST /transit/directions` |
| **`/api/trips` (City/GTFS Ops)** | `GET /transit-status`, `GET /{trip_id}/transit-status`, `GET /transit/planned-status`, `POST /transit/sync-planned`, `GET /transit/registry`, `POST /transit/compile`, `DELETE /transit/{city}`, `DELETE /city/{city}/pois` (alias `DELETE /pois/{city}`), `POST /city/{city}/pois/download` (alias `POST /pois/{city}/download`) |
| **`/api/currency`** | `GET /rates` (live FX rates), `GET /destination-currency` |
| **`/api/calendar`** | `GET /holidays` (statutory public holidays), `GET /countries` |
| **`/api/weather`** | `GET /forecast` (Open-Meteo weather + AQI + seasonal climate) |

## Route monitoring (`/api/market`) and system administration (`/api/system`)

Deal telemetry routes run under `/api/market`, while admin infrastructure controls sit under `/api/system`.

| Router Prefix | Key endpoints |
| :--- | :--- |
| **`/api/market`** | `GET /summary`, `GET/POST /routes`, `PATCH/DELETE /routes/{route_id}`, `POST /routes/{route_id}/scan`, `GET /routes/{route_id}/history`, `POST /routes/{route_id}/backfill`, `GET /routes/{route_id}/corpus`, `GET /routes/{route_id}/lodging`, `GET /routes/{route_id}/calendar`, `GET /routes/{route_id}/stats`, `GET /routes/{route_id}/events`, `GET /deals`, `GET /routes-best-deals`, `GET /routes/{route_id}/deals`, `POST /deals/{deal_id}/discard`, `POST /deals/{deal_id}/feedback`, `GET /providers/health`, `GET /telemetry/daily-report`, `POST /holiday-matches` |
| **`/api/system`** | `GET /update/status`, `POST /update/{config,check,download}`, `GET/POST /llm/config`, `POST /llm/{test,unload}`, `GET/POST /settings/{domain}` (`engine`, `swarm`, `vault`, `notifications`), `POST /photo-sync/{test,sync-all}`, `POST /notifications/{test,relay}`, `GET/POST /secrets`, `DELETE /secrets/{secret_type}`, `POST /secrets/test/{secret_type}`, `GET /taste-profile`, `POST /taste-profile/reset`, `POST /deals/sweep`, `POST /vault/snapshot`, `POST /cache/purge` |
