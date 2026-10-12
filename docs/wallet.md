# Paladio Trip Wallet

Sovereign, air-gappable digital wallet and credential vault for Paladio trips. Manages boarding passes, lodging access codes, museum/attraction passes, rail/transit tickets, and custom vouchers.

---

## Phase 0: Recon & Engineering Conventions

The Trip Wallet strictly aligns with established Paladio patterns:

1. **Frontend Architecture & Data Fetching**:
   - HTTP Client: `apiFetch<T>` in `frontend/src/utils/api.ts` with error handling, authentication bearer forwarding, and AbortSignal support.
   - Toasts: Zustand notification store `useNotificationStore.getState().addNotification(...)`.
   - Modals: Accessible shared modal `Modal.tsx`.
   - Icons: Native inline SVG components in `frontend/src/components/icons.tsx` (`TicketIcon`, `PlaneIcon`, `RefreshIcon`, `Spinner`, etc.).
   - Styling: Native CSS variables (`--color-bg-main`, `--color-surface-card`, `--color-accent-primary`, `--color-border`, etc.) adhering to the aerospace/brutalist monospace-forward aesthetic with `// COMMENT_SECTION` headers.
   - Formatting: Standardized `Intl.DateTimeFormat` with timezone-aware airport/city conversion instead of raw ISO timestamps.

2. **Backend Architecture & Security**:
   - Web Framework: FastAPI async endpoints with Pydantic v2 schemas and Dependency Injection.
   - ORM & Persistence: SQLAlchemy 2.0 AsyncSession with PostgreSQL 16 `JSONB` and timezone-aware `DateTime(timezone=True)`.
   - Migrations: Alembic auto-generation and explicit schema contracts.
   - Encryption at Rest: Application-level AES-128-CBC / HMAC-SHA256 via `cryptography.fernet.Fernet` (`WALLET_ENCRYPTION_KEY`). Secrets (door codes, raw barcode strings, Wi-Fi credentials) are encrypted before writing to database columns.
   - Authorization: Strict trip membership validation and creator isolation for private tickets to prevent IDOR vulnerabilities.
   - Parsing: Deterministic IATA BCBP parser, `zxing-cpp` for barcode symbologies (PDF417, Aztec, QR, Code128), and `pypdf` for text extraction. All parsing runs locally with zero external network requests.

3. **Storage & Volumes**:
   - Attachments stored on disk under `WALLET_STORAGE_DIR` (defaults to `/data/wallet_attachments` or local app storage), tracked in `trip_ticket_attachments`.

---

## Phase 1 & 2: Backend Foundation, Seeding & Parsing
- Database Models: `TripTicketModel` and `TripTicketAttachmentModel` mapped in `backend/app/db/models.py`.
- Alembic Migration: `31038eead2dd_create_trip_tickets.py` creating `trip_tickets` and `trip_ticket_attachments`.
- Encryption: Fernet application-level key derivation in `backend/app/core/wallet_encryption.py`.
- Seeding & Reconciliation: Idempotent sync from flight info and hotel anchors preserving user modifications; POI suggestions served non-persisted (`backend/app/wallet/seeding.py`).
- Deterministic Parsing: Local barcode decoding via `zxing-cpp` and IATA BCBP parsing (`backend/app/wallet/scan/bcbp.py`).
- Tests: Comprehensive unit test suite in `backend/tests/test_trip_wallet_tickets.py`.

---

## Phase 3 & 4: Frontend Shell, Pass Components & Modals
- **Tab Migration**: Transports tab replaced with `Wallet` tab in `TripWorkspaceHeader.tsx` and `TripWorkspace.tsx`, complete with wallet icon and live uncancelled ticket count badge. Backward compatibility maps legacy `?tab=transports` directly to `wallet`.
- **Card Presentations (`cards/`)**:
  - `TicketShell.tsx`: High-contrast perforated-stub ticket container with WCAG AA compliance, notch cutouts, keyboard navigation, and action menus.
  - `FlightBoardingPassCard.tsx`: Cyan accent, large IATA codes (`MAD → SVQ`), formatted airport times, terminal/gate/seat grid, and PNR copy.
  - `HotelAccessCard.tsx`: Amber accent, booking details, map links, and prominent `SecretField` for tap-to-reveal door PINs.
  - `AttractionPassCard.tsx`: Emerald accent, museum slot timing with relative countdown, ticket kind and quantity.
  - `TransitTicketCard.tsx`: Violet accent, origin/destination train/coach/seat info, platform number, and day pass validity windows.
  - `GenericTicketCard.tsx`: Neutral slate voucher layout for arbitrary confirmations.
- **Defect Remediations**:
  - *Contrast*: Replaced low-contrast labels with high-contrast slate-on-dark tokens.
  - *Timestamps*: Replaced raw ISO dates with formatted airport local times and duration calculations only when timezone-aware.
  - *Advisory deduplication & accuracy*: Deduplicated daily transit fare summaries; displays "Insufficient fare data" notice if single tickets total is 0.00 EUR rather than misleading recommendations.
- **Document Dropzone & Scanners (`WalletDropzone.tsx`)**: Drag-and-drop, file browsing, and clipboard paste with deterministic parsing review modal (`ScanReviewModal.tsx`).
- **Fullscreen Presentation (`TicketDetailModal.tsx`)**: High-contrast white background container for QR/barcodes, screen WakeLock integration, and arrow key ticket cycling.
