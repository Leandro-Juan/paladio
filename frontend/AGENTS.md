<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend Design Governance

> Scope: everything under `frontend/`. The root `/AGENTS.md` still applies (token conservation, sovereignty, no hardcoded data, LLM boundary). This section adds the **UI rules**. For per-component specs, read `docs/explanation/UI_UX_ARCHITECTURE_BIBLE.md`. Look components up by number or name with `grep`, and do not read the whole file.

## 1. Aesthetic North Star

**Tactical Editorial / Sovereign Mission Control.** A calm, warm, precise instrument: sandstone canvas, petrol ink, hairline borders, monospace telemetry labels, tabular numbers, and tactile touches (perforated passes, stamps). Reference products: Flighty (telemetry, passes), Linear (precision, keyboard), Apple Maps / Felt (muted cartography, floating HUD), Cron (temporal density), Wise / Stripe (ledger clarity).

Principles: (1) petrol is the only saturated colour. (2) Density with hierarchy. (3) Every number is honest, and it comes from the backend or live data. (4) Motion explains, and never decorates. (5) Failures are loud and specific. There are no silent fallbacks and no mock data.

## 2. Token Dictionary (single source: `src/app/globals.css`)

Use the **live variable names**. Never hardcode hex in components. If a token is missing, add it to `globals.css` for both `[data-theme="light"]` and `[data-theme="dark"]`.

| Spec name | Live variable | Light | Dark |
|---|---|---|---|
| `--bg-canvas` | `--color-bg-main` | `#F5EFEB` | `#081C24` |
| `--bg-surface` | `--color-surface-card` | `#FAF6F0` | `#0D2631` |
| `--bg-elevated` | `--color-surface-raised` *(add)* | `#FFFFFF` | `#12303D` |
| `--bg-glass` | `--color-surface-glass` *(add)* | `rgba(250,246,240,.78)` | `rgba(13,38,49,.78)` |
| `--border-subtle` | `--color-border` | `#E2D9CC` | existing dark value |
| `--border-strong` | `--color-border-bold` | `rgba(15,76,92,.18)` | existing |
| `--text-primary` | `--color-text-primary` | `#1A2B32` | `#F0F6F6` |
| `--text-secondary` | `--color-text-secondary` *(add)* | `#3F535D` | `#B7CBD3` |
| `--text-muted` | `--color-text-muted` | `#566B76` | `#8FA8B3` |
| `--accent-primary` | `--color-accent-primary` | `#0F4C5C` (alias `#0D4A56`) | `#14788D` |
| `--accent-primary-fg` | `--color-text-on-accent` | `#FFFFFF` | `#FFFFFF` |
| `danger` / `success` | `--color-danger` / `--color-success` | `#B3261E` / `#1F7A4D` | existing |
| `warning` | `--color-accent-warning` | `#E2B33C` (**fill only**) | same |
| warning text | `--cat-warning-fg` *(add)* | `#7A5A00` on `#FBF1D6` | light tint |

**Category tokens** (add as `--cat-<name>-bg/-fg`): sightseeing `#EDE7F8/#5B3FA0`, food `#FCEBD0/#8A5200`, lodging `#E3ECF9/#1E4F9A`, transit `#DDF0F0/#0B5F6B`, other `#E9ECEF/#475569`. Extend `costsCategories.tsx` and `PoiCategoryBadge.tsx` rather than creating new maps.

## 3. Unbreakable Contrast & Accessibility Laws (zero tolerance)

1. **NEVER place dark or inherited-dark text on `--color-accent-primary`, `--color-hero-bg`, any `*-deep` teal, or any dark surface.** Inside such a container set `color: var(--color-text-on-accent)` on the wrapper and use `stroke/fill: currentColor` for icons. (Origin: Costs hero card / Settle buttons, 2.13:1 black on petrol.)
2. Every text/background pair **≥ 4.5:1** (large text ≥ 3:1). UI boundaries and focus indicators **≥ 3:1**. Muted text may never be lighter than `--color-text-muted` (`#566B76`, 4.9:1 on canvas). `#7D9099` is **not text-safe**.
3. Gold `#E2B33C` is for fills and icons only. Gold text uses `#7A5A00`/`#6B5A00`.
4. Never convey meaning by colour alone: add an icon, sign (`+`/`−`), or text.
5. Every interactive element: visible `:focus-visible` (2 px `--color-focus-ring`, offset 2 px), a hit target **≥ 40×40 px** (44 px on touch), and a keyboard path.
6. Respect `prefers-reduced-motion` (see §6), and support both themes in every component.
7. Custom widgets need correct roles and names (`role="slider"`, `tablist`, `grid`, and so on), `aria-live` for async results, and focus return after overlays.
8. After touching colour tokens or a coloured component, **run a contrast check** (WCAG formula) on the affected pairs. A task with an unchecked colour pair is not done.

## 4. Typography & Formatting Mandates

- `--font-display` (Jost): H1/H2, hero numbers. `--font-body` (Inter): UI. **`--font-code`** (JetBrains Mono): telemetry labels, badges, codes, metadata. *(`--font-mono` currently aliases Inter, so do not rely on it for monospace.)*
- **Section telemetry headers:** `// UPPERCASE_MONO` with `letter-spacing: .18em`, 11–12 px, weight 600, `--font-code`, `--color-text-muted`. The `//` is decorative (`aria-hidden`).
- **`font-variant-numeric: tabular-nums` is mandatory** on anything rendering currency, dates, times, coordinates, percentages, counts, countdowns or IDs.
- Format money with `Intl.NumberFormat` from backend-provided **integer minor units** and a currency code, and **never** compute balances, splits, routes, or ETAs in the client. Display what the backend returns.
- Missing data renders `—`, never `0` or an invented value.

## 5. Spatial Geometry & Elevation Laws

- 4 px grid (`--spacing-*`). Radii: `--radius-sm/md/lg/full` (4/8/12/9999).
- **Concentric radii: `R_outer = R_inner + padding`.** (12 px card with 8 px padding → 4 px inner element.)
- Elevation: `--shadow-sm/md/lg` plus 1 px hairline. Dark theme prefers lighter surfaces and hairlines over shadows.
- **Z-scale (variables):** `--z-map:10` (map controls), `--z-panel:20` (sidebars/panels), `--z-nav:30` (top bar), `--z-pop:40` (popovers, tooltips), `--z-modal:50` (modals, command palette, toasts). Never use a raw `z-index` number.
- Glass: `--color-surface-glass` + `backdrop-filter: blur(14px) saturate(1.2)` + 1 px hairline, with an `@supports not (backdrop-filter: blur(1px))` solid fallback.

## 6. Motion & Animation Laws

| Name | Spring (`motion`) | CSS equivalent |
|---|---|---|
| `snappy` | `{stiffness:500, damping:38, mass:0.8}` | `200ms cubic-bezier(.23,1,.32,1)` |
| `gentle` | `{stiffness:260, damping:30, mass:1}` | `320ms cubic-bezier(.23,1,.32,1)` |
| `bouncy` | `{stiffness:380, damping:18, mass:0.9}` | `280ms cubic-bezier(.34,1.56,.64,1)` |

- Standard UI transitions **≤ 200 ms**. Entrances are ease-out. Never animate from `scale(0)` (start at `.95`). Keyboard-triggered actions do not animate.
- **Never animate `width`, `height`, `top`, `left`**. Use `transform`, `opacity`, layout projection, or `grid-template-rows: 0fr→1fr`.
- `@media (prefers-reduced-motion: reduce)`: drop transforms and springs, use opacity-only fades ≤ 100 ms, and stop shimmer and pulses.
- Motion libraries (`motion`, `vaul`, `sonner`, `cmdk`, `@dnd-kit/*`) are **target dependencies and are not installed yet**. Before using one, add it to `package.json` deliberately, and keep a CSS-only fallback where the Bible gives one. Don't add Tailwind without an explicit decision.

## 7. Component Implementation Protocol (new component or feature)

1. **Look up** the archetype in the Bible (`grep -n "^## <n>\." docs/explanation/UI_UX_ARCHITECTURE_BIBLE.md`, then view only that slice). If none matches, compose from the closest ones and add a new entry to the Bible in the same change.
2. **Reuse** existing primitives first: `Modal`, `EmptyState`, `ToastContainer`, `PoiCategoryBadge`, `costsCategories`, `icons.tsx`, and the tokens. Do not create parallel versions.
3. **Data:** wire to the real API or store. No fixtures, placeholder arrays or fallback constants in production code (mocks only in `frontend/__tests__/` and e2e).
4. **Implement every state**: `loading` (skeleton with matching geometry), `empty` (starter action), `error` (what failed, what did not change, retry), `populated`, `hover`, `keyboard-focus`, `disabled`, and `reduced-motion`.
5. **Styles:** a CSS Module using only tokens. No inline hex. Both themes.
6. **Accessibility:** roles, names, focus order, live regions, `Esc` and focus-return for overlays, and a keyboard alternative to any drag or pointer-only interaction.
7. **Fail fast:** on failure, show a visible, specific error and stop the flow. Do not substitute fake data and do not swallow errors.
8. **Verify** with the checklist in §8, using pinpoint tests (`playwright test <spec>`, or `vitest <file>`), never the whole suite.

## 8. Mandatory Pre-Commit UI Verification Checklist (self-audit; all 15)

1. [ ] No hardcoded colours: everything uses tokens, and both themes are covered.
2. [ ] Every text/background pair is ≥ 4.5:1 (3:1 for large text and UI boundaries), and was checked.
3. [ ] No dark text on `--color-accent-primary`, `--color-hero-bg` or any dark surface (§3.1).
4. [ ] Colour is never the only carrier of meaning.
5. [ ] All numbers, currency, times, dates, coordinates and counts use `tabular-nums`, and missing values show `—`.
6. [ ] Section labels use the `// UPPERCASE_MONO` telemetry style with `--font-code`.
7. [ ] Radii are concentric and z-index uses the `--z-*` scale only.
8. [ ] The component implements loading, empty, error, populated, hover, focus-visible and disabled states.
9. [ ] Skeletons match the real geometry (no layout shift), and empty states offer a 1-click starter action.
10. [ ] Fully keyboard-operable: logical Tab order, visible focus, `Esc` closes overlays and focus returns, with a non-pointer alternative for any drag.
11. [ ] Correct ARIA roles/names/live regions, and hit targets are ≥ 40 px.
12. [ ] Motion: ≤ 200 ms, no animation of `width/height/top/left`, uses the named spring or CSS curve, and `prefers-reduced-motion` is honoured.
13. [ ] No mock/fallback data in production code. Errors are surfaced and stop the flow. No client-side arithmetic for money, routes or schedules, and no cloud API calls.
14. [ ] Destructive actions have a real, working Undo (or a confirmation), and idempotent mutations are protected against double-submit.
15. [ ] Verified at 375 px, 768 px and 1280 px in light and dark. Pinpoint tests pass, and no unrelated files changed.
