# Paladio Frontend: UI Migration Audit (Phase 1)
**Date:** 12 Oct 2026 · **Target Branch:** `feat/pacific-jazz` · **Design Direction:** Pacific Jazz (80/15/5)

---

## 1. Executive Inventory

### App Routes (`src/app/`)
| Route | File Path | Description |
|---|---|---|
| `/` | `src/app/page.tsx` | Root redirect / landing logic |
| `/layout` | `src/app/layout.tsx` | Global HTML shell, font declarations, providers |
| `/login` | `src/app/login/page.tsx` | Authentication sign-in form |
| `/setup` | `src/app/setup/page.tsx` | Initial administrator onboarding setup |
| `/dashboard` | `src/app/dashboard/page.tsx` | Sovereign mission control & dispatch center |
| `/engine` | `src/app/engine/page.tsx` | Temporal route generation solver & live telemetry |
| `/trips` | `src/app/trips/page.tsx` | Upcoming missions & trip management |
| `/trips/[id]` | `src/app/trips/[id]/page.tsx` | Dedicated Trip Workspace container |
| `/vault` | `src/app/vault/page.tsx` | Itinerary archive & historical records |
| `/vault/[id]` | `src/app/vault/[id]/page.tsx` | Historical itinerary deep view (delegates to workspace) |
| `/config` | `src/app/config/page.tsx` | System preferences & engine configurations |

### Shared Components (`src/components/`)
- **Shell & Navigation:** `Sidebar.tsx`, `UserMenu.tsx`, `AuthGuard.tsx`
- **Feedback & Notifications:** `Modal.tsx`, `ToastContainer.tsx`, `NotificationBell.tsx`, `NotificationCenter.tsx`, `MissionInspectorModal.tsx`
- **Dashboard:** `ActiveTripTicket.tsx`, `CurrencyConverterWidget.tsx`, `Calendar.tsx`, `PreferenceModelSection.tsx`, `PreferenceRadar.tsx`
- **Trip Operations & Timeline:** `TripPreparationForm.tsx`, `TripTimeline.tsx`, `TransitLegView.tsx`, `PoiCategoryBadge.tsx`, `TripBudgetWallet.tsx`, `icons.tsx`
- **Geographic Surfaces:** `Map.tsx`, `MapLoader.tsx`, `VaultMap.tsx`
- **Trip Workspace:**
  - `TripWorkspace.tsx`, `TripWorkspaceHeader.tsx`, `TripMapView.tsx`, `TripMapLoader.tsx`
  - `TripPlanSidebar.tsx`, `TripPlacesSidebar.tsx`, `TripTransportsView.tsx`, `TripCollabView.tsx`, `TripPhotosView.tsx`, `TripCostsView.tsx`
  - **Costs Sub-system:** `BalancesWidget.tsx`, `CategoryBreakdownWidget.tsx`, `CostsFilterToolbar.tsx`, `CostsSummaryCards.tsx`, `ExpenseModal.tsx`, `ExpenseRow.tsx`, `SettleUpWidget.tsx`, `SettlementModal.tsx`, `costsCategories.tsx`
  - **Wallet Sub-system:** `TripWalletView.tsx`, `WalletDropzone.tsx`, `WalletFilterBar.tsx`, `WalletSummaryBar.tsx`, `WalletUpNext.tsx`, `TransitAdvisorySection.tsx`
  - **Wallet Cards & Codes:** `TicketShell.tsx`, `FlightBoardingPassCard.tsx`, `HotelAccessCard.tsx`, `TransitTicketCard.tsx`, `AttractionPassCard.tsx`, `GenericTicketCard.tsx`, `CodeRenderer.tsx`
  - **Wallet Modals & Parts:** `TicketDetailModal.tsx`, `TicketFormModal.tsx`, `ScanReviewModal.tsx`, `CopyButton.tsx`, `CustomSelect.tsx`, `SecretField.tsx`

---

## 2. Quantitative Scan & Metric Summary

- **Total Color Hex / RGB / HSL Declarations in Codebase:** `1,679` occurrences
- **Legacy CSS Class Occurrences:**
  - `.font-mono`: 531 occurrences (repurposed: tabular-nums for numbers; real monospace `.font-code` for code/secrets)
  - `.text-muted`: 432 occurrences -> mapped to `--color-text-muted`
  - `.font-display`: 106 occurrences -> mapped to Jost 300 / 500
  - `.bg-surface`: 23 occurrences -> mapped to `--color-surface-card`
  - `.border-subtle`: 21 occurrences -> mapped to `--color-border`
  - `.text-accent`: 20 occurrences -> mapped to `--color-link`
  - `.sidebar`, `.nav-links`, `.main-content`, `.layout-container`, `.engine-active`: rethemed via tokens

---

## 3. Third-Party Surfaces & Allow-List

### A. Maps (Leaflet & React-Leaflet)
- **Files:** `Map.tsx`, `VaultMap.tsx`, `TripMapView.tsx`, `clusterHull.ts`, `TripMapLoader.tsx`
- **Strategy:**
  - Base tiles: CartoDB Positron for light theme; dark theme tile URL or filtered layer for dark mode.
  - Markers, cluster bubbles, and hull polygons: mapped to `--color-accent-primary` and `--color-accent-teal-soft`.
  - Zoom controls and popups: rethemed to `--color-surface-card` and `--color-border`.

### B. Charts (Recharts)
- **Files:** `PreferenceRadar.tsx`, `CategoryBreakdownWidget.tsx`, `TripBudgetWallet.tsx`
- **Strategy:**
  - Create centralized `src/utils/chartTheme.ts` exposing series colors via CSS variable hooks.
  - Apply colors through inline `style={{ stroke: 'var(--color-...)' }}` or CSS classes to prevent SVG presentation attribute resolution issues.
  - Teal tokens for primary series; Gold (`--color-accent-warning`) for thresholds/budgets; Danger red (`--color-danger`) strictly for overspend with text label.

### C. Shared Category Palettes
- **Files:** `utils/poiCategory.ts`, `components/PoiCategoryBadge.tsx`, `costs/costsCategories.tsx`, `lib/wallet/ticketTypeConfig.tsx`
- **Strategy:** Centralize into a unified category token registry with dual light/dark definitions and mandatory text labels.

### D. Literal Color Allow-List (Permitted Hard-coded Colors)
1. **Machine Codes:** Black (`#000000`) on White (`#FFFFFF`) in `CodeRenderer.tsx` for QR codes, Aztec codes, PDF417, and Code 128 (barcode scanners strictly require high-contrast black on white).
2. **Photo Gradients:** Dark semi-transparent scrims (`rgba(0,0,0,0.4)` to `rgba(0,0,0,0.7)`) on user photos in `TripPhotosView.tsx` to maintain white text contrast over variable images.
3. **Map Tiles:** External tile imagery provided by OpenStreetMap / CartoDB tile servers.

---

## 4. Test Impact Matrix

| Spec File | Area Under Test | Critical Assertions & Planned Safeguards |
|---|---|---|
| `tests/components/Calendar.spec.tsx` | Calendar & Inspector | Assertions verify month buttons (`< PREV`, `NEXT >`, `CYCLE TODAY`), status tags, and day numbers. Kept identical via aria-labels and text. |
| `tests/components/CurrencyConverterWidget.spec.tsx` | FX Converter | Asserts origin/target inputs and swap button `⇄`. Number formatting updated cleanly in alignment. |
| `tests/components/PreferenceRadar.spec.tsx` | Taste Radar | Tests subject labels (`Art & Culture`, etc.) and empty state. Kept 100% intact. |
| `tests/components/TripTimeline.spec.tsx` | Timeline & POI Badges | Asserts POI category texts and transit upgrade button disabled tooltips. All badge text labels and DOM hooks retained. |
| `tests/components/TripWorkspace.spec.tsx` | Workspace Shell | Updated to verify existing `'Wallet'` tab alongside `'Plan'`, `'Costs'`, `'Collab'`, `'Photos'`. |
| `tests/e2e/sidebar.spec.ts` | Sidebar & Collapsing | Tests `Ctrl+B` shortcut, collapse widths, and nav links. Shell classes and shortcut listener preserved. |
| `tests/e2e/home.spec.ts` | Dashboard Home | Asserts title, heading, and root telemetry presence. Preserved without renaming. |
| `tests/e2e/auth.spec.ts` | Login & Auth Guard | Form input IDs, labels, and submit redirects preserved. |
| `tests/e2e/poiCategory.spec.ts` | Category metadata | Category keys, text labels, and icons preserved. |

---

## 5. Leftovers & Cleanup (Executed)
- **Unreferenced Boilerplate Deleted:** `frontend/public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`.
- **Duplicate Assets Deleted:** `logo_horizontal*.png` (retained normalized hyphen variants `logo-horizontal*.png`).
- **Unreferenced CSS Deleted:** `src/app/page.module.css` (0 imports).

---

## 6. Migration Phase Assignment Table

| Target File | Hardcoded Colors | Style Colors | Assigned Migration Phase |
|---|---|---|---|
| `src/app/globals.css` | 15 | 0 | **Phase 2: Tokens & Typography** |
| `src/app/layout.tsx` | 0 | 0 | **Phase 2: Tokens & Typography** / **Phase 3: Theme Engine** |
| `src/stores/themeStore.ts` | 0 | 0 | **Phase 3: Theme Engine** |
| `tests/e2e/theme.spec.ts` | 0 | 0 | **Phase 3: Theme Engine** |
| `src/components/Sidebar.tsx` | 1 | 5 | **Phase 4: Base Components & Shell** |
| `src/components/UserMenu.tsx` | 37 | 19 | **Phase 4: Base Components & Shell** |
| `src/components/Modal.tsx` | 12 | 5 | **Phase 4: Base Components & Shell** |
| `src/components/ToastContainer.tsx` | 14 | 6 | **Phase 4: Base Components & Shell** |
| `src/components/NotificationBell.tsx` | 2 | 2 | **Phase 4: Base Components & Shell** |
| `src/components/NotificationCenter.tsx` | 13 | 17 | **Phase 4: Base Components & Shell** |
| `src/components/AuthGuard.tsx` | 0 | 3 | **Phase 4: Base Components & Shell** |
| `src/app/dashboard/page.tsx` | 5 | 6 | **Phase 5: Dashboard** |
| `src/components/ActiveTripTicket.tsx` | 2 | 13 | **Phase 5: Dashboard** |
| `src/components/CurrencyConverterWidget.tsx` | 10 | 15 | **Phase 5: Dashboard** |
| `src/components/Calendar.tsx` | 18 | 19 | **Phase 5: Dashboard** |
| `src/components/MissionInspectorModal.tsx` | 13 | 8 | **Phase 5: Dashboard** |
| `src/components/PreferenceModelSection.tsx` | 6 | 24 | **Phase 5: Dashboard** |
| `src/components/PreferenceRadar.tsx` | 0 | 0 | **Phase 5: Dashboard** / **Phase 7: Maps & Charts** |
| `src/app/trips/page.tsx` | 16 | 26 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/TripPreparationForm.tsx` | 5 | 26 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/trips/[id]/page.tsx` | 15 | 10 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripWorkspace.tsx` | 2 | 1 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripWorkspaceHeader.tsx` | 29 | 10 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripPlanSidebar.tsx` | 84 | 32 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripPlacesSidebar.tsx` | 46 | 20 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/TripTimeline.tsx` | 32 | 22 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/TransitLegView.tsx` | 16 | 25 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripTransportsView.tsx` | 13 | 8 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripCollabView.tsx` | 20 | 11 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripPhotosView.tsx` | 7 | 2 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/TripCostsView.tsx` | 25 | 15 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/costs/*` (9 files) | 215 | 108 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/trip-workspace/wallet/*` (19 files) | 413 | 244 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/vault/page.tsx` | 5 | 2 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/vault/[id]/page.tsx` | 0 | 0 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/engine/page.tsx` | 11 | 33 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/config/page.tsx` | 127 | 128 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/login/page.tsx` | 11 | 13 | **Phase 6: Remaining Pages & Workspace** |
| `src/app/setup/page.tsx` | 9 | 14 | **Phase 6: Remaining Pages & Workspace** |
| `src/components/Map.tsx`, `VaultMap.tsx`, `TripMapView.tsx` | 152 | 43 | **Phase 7: Maps & Charts** |
| `src/utils/clusterHull.ts` | 0 | 0 | **Phase 7: Maps & Charts** |
| `src/utils/chartTheme.ts` | 0 | 0 | **Phase 7: Maps & Charts** |
| `src/utils/poiCategory.ts`, `costsCategories.tsx`, `ticketTypeConfig.tsx` | 98 | 0 | **Phase 7: Maps & Charts** |
| Empty states & Motifs (`.sun-disc`, `.seigaiha-bg`) | 0 | 0 | **Phase 8: Motifs, Dark Release & Polish** |
