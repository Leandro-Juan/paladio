# Design Specification: Settings Categories Reorganization, Tactical Card Redesign & Backend Persistence

**Date**: 2026-11-09  
**Author**: Antigravity  
**Status**: Specification Complete — Pending User Review Before Implementation  
**Canonical Spec Path**: `docs/superpowers/specs/2026-11-09-settings-reorganization-and-card-redesign.md`  

---

## 1. Overview & Motivation

The configuration workstation (`/config`) was recently extracted from a monolithic page into modular subcomponents, but the category taxonomy and card layouts still suffer from structural friction:
1. **Asymmetric & Fragmented Taxonomy**: `Regional & Currency` exists as an orphaned single-item category, while `Language & Locales` is placed under `Workspace & Interface`. Meanwhile, personal profile settings and administrative user provisioning are mixed together under `Governance & Security`.
2. **Missing Travel & Engine Domain Representation**: As a sovereign travel intelligence platform powered by LangGraph multi-agent swarms, deterministic C++20 combinatorial routing, and continuous ML taste learning, settings for solver constraints, map cartography, agent critic behaviors, units of measurement, and data vault backups have had no formal persistence layer or UI home.
3. **Card Presentation Upgrade**: Settings cards need to transition to a modern, tactile card archetype inspired by the user-provided reference design (clean outer cards, segmented sub-tab pills, nested tactical panels with rounded controls, toggle switches, and 3-dot contextual action menus) fully unified with Paladio's **Pacific Jazz & Japanese Minimalist Tactical** aesthetic.
4. **Unified Backend Persistence**: Both user-level travel preferences and instance-level system configurations must be persisted cleanly without mock fallbacks:
   - Personal travel settings (`maps`, `units`, `solver_preferences`) persist to `UserModel.preferences` (JSONB) via `PATCH /users/me`.
   - Instance/admin settings (`engine`, `swarm`, `vault`) persist to `SystemConfigModel` (`system_config` table) via typed `GET/POST /system/settings/{domain}` endpoints with strict Pydantic validation.

---

## 2. Category Taxonomy & Settings Directory

The settings architecture is reorganized from scratch into **5 balanced domain pillars** in `frontend/src/components/config/settingsData.ts`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PALADIO CONFIGURATION WORKSPACE                 │
├──────────────┬──────────────┬──────────────┬─────────────┬─────────────┤
│ 1. Workspace │ 2. Regional  │ 3. Travel    │ 4. AI &     │ 5. Sovereign│
│      &       │      &       │ Engine &     │   Swarm     │ System &    │
│  Experience  │ Localization │ Optimization │Intelligence │    Admin    │
│ (experience) │(localization)│   (engine)   │(intelligence│(infrastruct)│
├──────────────┼──────────────┼──────────────┼─────────────┼─────────────┤
│ • Profile    │ • Language   │ • Solver     │ • LLM Engine│ • Users [A] │
│ • Appearance │ • Currency   │ • Transit    │ • Swarm     │ • Updates[A]│
│ • Typography │ • Units      │ • Deals      │ • Memory    │ • Telemetry │
│ • Navigation │              │              │             │ • Vault     │
│ • Maps       │              │              │             │             │
└──────────────┴──────────────┴──────────────┴─────────────┴─────────────┘
[A] = Requires Administrator Role
```

### Detailed Card Definitions & Backend Persistence Mapping

| Category | Card ID | Title | Description | Persistence Target | Admin Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`experience`** | `profile` | Personal Account | Avatar upload, display name, email, credentials | `UserModel` via `PATCH /users/me` | No |
| | `appearance` | Visual Themes | Pacific Jazz theme engine (Light, Slate Dark, Silent Waters) | `themeStore` + `UserModel.preferences` | No |
| | `typography` | Interface Typography | Modern Inter vs Classic Jost editorial, JetBrains Mono | `typographyStore` + `UserModel.preferences` | No |
| | `navigation` | Navigation Layout | Floating Tactical Dock vs Desktop Sidebar Rail | `localStorage` + `UserModel.preferences` | No |
| | `maps` | Cartography & Layers | Default map layer, transit route overlays, home city | `UserModel.preferences.map_preferences` | No |
| **`localization`**| `language` | Display Language | English, Español, 日本語, العربية (RTL), translation audits | `UserModel.preferences.preferred_language` | No |
| | `currency` | Currency & Conversions| Instance calculation currency, exchange rates, symbols | `UserModel.preferences.default_currency` | No |
| | `units` | Units & Time Standards| Metric vs Imperial (km/mi, °C/°F), 24h/12h clock, dates | `UserModel.preferences.units_preferences` | No |
| **`engine`** | `solver` | Solver Constraints | Max walking km/day, pacing tempo, meal intervals, fatigue | `SystemConfigModel.key='engine'` / User override | System/User |
| | `transit` | Public Transit & GTFS | Compiled GTFS feeds, Valhalla routing tiles, station sync | `TransitCacheModel` + GTFS registry | No |
| | `deals` | Deal Engine & Scraping| Scraper cadence, price alert thresholds, ticket parsing | `SystemConfigModel.key='engine'` | Admin |
| **`intelligence`**| `llm` | AI & LLM Engine | Multi-provider AI (Gemini, Claude, OpenAI, Groq, Ollama) | `SystemConfigModel.key='llm_config'` | Admin |
| | `swarm` | Swarm Agents & Critic | Critic strictness, thinking token budget, approval gates | `SystemConfigModel.key='swarm'` | Admin |
| | `memory` | ML Taste Learning & RAG| 16-D POI feature tensor weights, continuous taste learning | `UserModel.embedding` + `SemanticLearning` | No |
| **`infrastructure`**| `users` | Authorized Users | Provision user accounts, roles (`admin`/`user`), active flags | `UserModel` via `/users/` | Yes |
| | `updates` | System Updates | GitHub sync, auto-updater daemon, branch tracking | `SystemConfigModel.key='updater_preferences'`| Yes |
| | `telemetry` | Container Telemetry | Live health & ports for FastAPI, Timescale, Redis, Valhalla | Live socket / heartbeat endpoints | Yes |
| | `vault` | Data Vault & Backups | Trip JSON/PDF exports, DB snapshot backups, cache purge | `SystemConfigModel.key='vault'` + export APIs | No |

---

## 3. Card Archetype & Visual Anatomy

The settings cards are unified under a reusable tactical card archetype reflecting the reference mockup:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Card Header: Title + Subtitle / Badge             [+ Action] [ ⋮ ]    │
│  Segmented Sub-Tab Switcher: [ Pill 1 (Active) ] [ Pill 2 ] [ Pill 3 ] │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Nested Tactical Panel                                            │  │
│  │ Item Header: "Starlink ★ Primary"                           [ ⋮ ] │  │
│  │                                                                  │  │
│  │ ┌───────────────────────────┐   ┌──────────────────────────────┐ │  │
│  │ │ 🔍 Dropdown / Selector   ▼│   │ 📅 Context Parameter        ▼│ │  │
│  │ └───────────────────────────┘   └──────────────────────────────┘ │  │
│  │ ┌──────────────────────────────────────────────────────────────┐ │  │
│  │ │ 📍 Meta Indicator / Tag / Route Target                       │ │  │
│  │ └──────────────────────────────────────────────────────────────┘ │  │
│  │                                                                  │  │
│  │ ((•)) Live Status: Connected                        [ Toggle ON ] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Visual Token & Aesthetic Translation

| Element | Reference Mockup Feature | Paladio Pacific Jazz & Japanese Tactical Implementation |
| :--- | :--- | :--- |
| **Outer Card Surface** | Clean rounded card container | `--color-surface-card` (`#FAF6F0` light, `#0D2631` dark), `border: 1px solid var(--color-border)`, `border-radius: 18px`, `padding: 24px`. |
| **Header Typography** | Sans header with subtle action | Jost 600 (`font-family: var(--font-jost)`), letter-spacing `-0.01em`, muted subtitle in Inter 400. |
| **Top Right Action** | `+ Add provider` / secondary button | Clean pill button with `+` icon, petrol or teal tint, `border-radius: 9999px`. |
| **Segmented Tabs** | Pill toggle bar beneath title | Recessed background capsule (`var(--color-bg-main)`), inner rounded pill tabs with active elevated shadow, crisp contrast. |
| **Nested Inner Panel** | Rounded nested unit | Elevated sub-surface with `border-radius: 12px`, subtle hairline border (`var(--color-border)`), concentric with outer 18px radius (`18 = 12 + 6`). |
| **Input & Selector Pills**| Rounded inputs with icons | Dropdown inputs with left glyph, custom chevron down, focus ring in Warm Coral (`#C86D51`), JetBrains Mono for codes/values. |
| **Tactical Switch** | Smooth toggle switch | Accessible switch component using Paladio accent colors (Warm Coral `#C86D51` or Teal `#2A8C82`), high contrast pill thumb with spring physics. |
| **Context Menu Popover** | `...` dropdown menu | Floating popover with `backdrop-filter: blur(14px)`, `border-radius: 12px`, shadow `--shadow-lg`, clean icon items, hover highlight, and red danger item. |

---

## 4. Backend Implementation & API Design

### Pydantic Schemas (`backend/app/schemas/settings.py`)
- `EngineConfigPayload`:
  - `default_max_walking_km: float` (1.0 to 50.0, default: 12.0)
  - `pacing_tempo: str` ("leisurely" | "balanced" | "intense", default: "balanced")
  - `attraction_burnout_limit: int` (default: 6)
  - `deal_scraper_cadence_hours: int` (default: 24)
  - `price_alert_threshold_pct: float` (default: 15.0)
- `SwarmConfigPayload`:
  - `critic_strictness: float` (0.0 to 1.0, default: 0.75)
  - `thinking_token_budget: int` (default: 2048)
  - `auto_ticket_ingestion: bool` (default: true)
  - `require_human_approval_on_repair: bool` (default: false)
- `VaultConfigPayload`:
  - `auto_snapshot_enabled: bool` (default: true)
  - `snapshot_retention_days: int` (default: 30)

### REST Endpoints (`backend/app/api/system.py`)
- `GET /system/settings/{domain}`:
  - Fetches the validated domain configuration dictionary from `SystemConfigModel`.
  - Allowed domains: `engine`, `swarm`, `vault`.
- `POST /system/settings/{domain}`:
  - Validates payload against the domain schema and writes directly to `SystemConfigModel(key=domain, value=data)`.
  - Requires admin role for instance-wide parameters.

### User Preferences Model (`backend/app/schemas/user.py`)
- Extends `UserPreferences` with `map_preferences`, `units_preferences`, and `user_solver_overrides`.

---

## 5. Verification Plan

1. **Backend Persistence Verification**:
   - `pytest backend/tests/test_settings_service.py backend/tests/test_users.py -q`
2. **Frontend Playwright E2E**:
   - `npx playwright test frontend/tests/e2e/theme.spec.ts`
   - `npx playwright test frontend/tests/e2e/typography.spec.ts`
   - `npx playwright test frontend/tests/e2e/autoupdater_config.spec.ts`
   - `npx playwright test frontend/tests/e2e/gtfs_config.spec.ts`
3. **Visual & Interactive Inspection**:
   - Verify card nesting, concentric radii (`18px` outer, `12px` inner), toggle animations, and 3-dot dropdown popovers across Light, Dark, and Silent Waters themes.
