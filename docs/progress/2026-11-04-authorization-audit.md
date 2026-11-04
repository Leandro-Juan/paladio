# Paladio Authorization Audit: Trip Scoping & Role Enforcement

**Date:** 2026-11-04  
**Context:** Phase 0, Task 1 of Paladio Trip MCP Server + Trip Agent Chat Dock (PLAN.md)

---

## 1. Executive Summary

An audit of `backend/app/api/deps.py`, `backend/app/api/trips.py`, `backend/app/api/tickets.py`, and `backend/app/api/collections.py` revealed that while authentication mechanisms (`get_current_user`, `get_optional_user`) and token decoding (`decode_access_token`) exist, trip-level access control was largely inconsistent across endpoints:
- In `api/trips.py`: `get_trips` lists all trips in the database ordered by `start_date` regardless of user ownership. Trip retrieval (`GET /trips/{id}`), updates (`PUT /trips/{id}`), and deletions (`DELETE /trips/{id}`) performed no ownership verification.
- In `api/collections.py`: `_get_trip_or_404` verified trip existence but never validated user access or ownership.
- In `api/tickets.py`: `app/wallet/service.py` implemented a preliminary `check_trip_access` helper distinguishing `viewer` and `organizer`.

To prepare for exposing trip capabilities via MCP tools and the Trip Agent Chat Dock, unified authorization must be established at the core/service layer.

---

## 2. Access Control Model

Every trip operation resolves an access level: `viewer`, `editor`, or `owner`.

| Role Level | Criteria | Permissions |
|---|---|---|
| **owner** | `trip.user_id == user.id` (or unowned trip in sovereign local single-user mode) | Full control: delete trip, change dates/destination, manage participants, export vaults. |
| **editor** | `owner`, OR user has a corresponding row in `trip_participants` with matching `user_id` | Plan modifications: add/remove/move stops, optimize schedule, add expenses, create tickets, modify collections. |
| **viewer** | `editor`, OR explicit read-only collaborator | Read-only access: view itinerary, overview, expenses, tickets (redacted), collections, issues. |

### Hierarchy
`owner` ⊃ `editor` ⊃ `viewer`

If `assert_trip_access(user, trip_id, required_level)` fails:
- Returns `HTTP 404 NOT FOUND` if the trip does not exist.
- Returns `HTTP 401 UNAUTHORIZED` if authentication is missing and the trip has an owner.
- Returns `HTTP 403 FORBIDDEN` if the user is authenticated but not authorized at the required level.

---

## 3. Implementation Plan

1. Create `backend/app/core/access.py` providing:
   - `TripAccessLevel` enum (`VIEWER = "viewer"`, `EDITOR = "editor"`, `OWNER = "owner"`)
   - `assert_trip_access(user: UserModel | None, trip_id: str, required_level: TripAccessLevel | str, session: AsyncSession) -> TripModel`
2. Integrate `assert_trip_access` into the service layer (`backend/app/application/trip_editing/`) and MCP tool context (`backend/app/mcp/context.py`).
3. Ensure IDOR protection is verified with regression tests.
