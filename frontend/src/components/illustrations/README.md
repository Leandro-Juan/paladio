# Minimalist & Tactical Vector Illustration Library

A standalone, dependency-free collection of **28 handcrafted SVG vector illustrations** following the **Japanese Minimalist & Tactical Editorial** aesthetic.

This library is decoupled from any application runtime or frontend framework. You can use it as pure React components or copy raw SVGs.

---

## 📁 Library Structure

```
frontend/src/components/illustrations/
├── README.md                          # This guide
├── types.ts                           # TypeScript prop interfaces
├── index.ts                           # TypeScript barrel export
├── TransitIllustrations.tsx           # Flight, Shinkansen, Origami Ticket, Origami Boat, Viewfinder
├── HospitalityIllustrations.tsx       # Hotel, Izakaya Lantern, Tea Ceremony, Bonsai
├── CultureIllustrations.tsx           # Fuji Peak, Torii Gate, Bonsho Bell, Pagoda, Kitsune Mask
├── GeneralAppIllustrations.tsx        # Topo Map, Reticle Compass, Atmosphere/Weather, 404
├── PlacePlaceholderIllustrations.tsx  # 14 Category Placeholders for Places with No Photos
└── TacticalIllustrations.tsx          # Wallet Ledger, Collaborators, TSP Solver, Radar, Astrometry
```

---

## 📐 Design System Standards

- **ViewBox**: Standardized `120x80` (`viewBox="0 0 120 80"`).
- **Styling**: Uses CSS theme variables with standard hex fallbacks:
  - `--color-accent-coral` / `#D42A2F` (Focal sun disc, status ping, hanko seal)
  - `--color-accent-teal-mid` / `#1B8FA6` (Primary structural silhouette)
  - `--color-accent-teal-soft` / `#7CC4D1` (Viewfinder brackets, wave ripples, origami facets)
  - `--color-accent-teal-deep` / `#0F4C5C` (Roof canopies, antenna masts, structural recesses)
  - `--color-accent-gold` / `#E2B33C` (Stars, bell clappers, coin tokens, spark beacons)
  - `--color-border` / `#E2D9CC` (Horizon baselines, ticket borders, coordinate ticks)
  - `--color-surface-card` / `#FAF6F0` (Negative space cutouts)
- **Scalability**: Pass `size={120}`, `width`, or `height` prop in React, or adjust `<svg width="..." height="...">`.
