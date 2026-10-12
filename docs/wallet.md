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
