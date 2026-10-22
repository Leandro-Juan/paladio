import React from 'react';
import { IllustrationProps } from './types';

// ============================================================================
// 1. MUSEUM & GALLERY PLACEHOLDER
// Classical/modern architectural portico with slender pillars, pediment, and sculpture
// ============================================================================
export function MuseumPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Sun Disc */}
      <circle cx="86" cy="22" r="7.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Classical Pediment & Portico Architecture */}
      <polygon points="36,33 60,19 84,33" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <polygon points="42,32 60,22 78,32" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="34" y="33" width="52" height="3.5" rx="1" fill="var(--color-accent-teal-deep, #0F4C5C)" />

      {/* Slender Columns */}
      <rect x="39" y="36.5" width="3.5" height="23" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="51" y="36.5" width="3.5" height="23" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="65" y="36.5" width="3.5" height="23" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="77" y="36.5" width="3.5" height="23" fill="var(--color-accent-teal-mid, #1B8FA6)" />

      {/* Center Sculpture Pedestal & Golden Gem */}
      <rect x="56" y="47" width="8" height="12.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <polygon points="60,40 63,44 60,48 57,44" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Stylobate Tiered Base */}
      <rect x="32" y="59.5" width="56" height="3" rx="0.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect x="28" y="62.5" width="64" height="3.5" rx="0.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />

      {/* 3. Viewfinder Brackets & Accents */}
      <path d="M22 22 H16 V28" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <path d="M98 22 H104 V28" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />

      {/* 4. Grounding Baseline */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="28" y1="68" x2="28" y2="71" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" />
      <line x1="60" y1="68" x2="60" y2="72" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      <line x1="92" y1="68" x2="92" y2="71" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" />
    </svg>
  );
}

// ============================================================================
// 2. RESTAURANT & DINING PLACEHOLDER
// Minimalist cloche & bowl dome, vapor curls, chopsticks, and dining mat
// ============================================================================
export function RestaurantPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Seal */}
      <circle cx="84" cy="22" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Primary Dining Cloche Silhouette */}
      <path d="M36 52 C36 34 46 29 60 29 C74 29 84 34 84 52 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M60 29 C74 29 84 34 84 52 H60 Z" fill="var(--color-accent-teal-deep, #0F4C5C)" opacity="0.35" />
      <circle cx="60" cy="26" r="3" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" fill="none" />
      <rect x="30" y="52" width="60" height="4" rx="2" fill="var(--color-accent-teal-deep, #0F4C5C)" />

      {/* 3. Tapered Minimalist Chopsticks */}
      <line x1="70" y1="18" x2="96" y2="48" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="76" y1="16" x2="100" y2="44" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.6" strokeLinecap="round" />

      {/* Delicate Aromatic Steam */}
      <path d="M52 22 Q50 16 54 12" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M60 21 Q63 15 59 10" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.3" strokeLinecap="round" fill="none" />

      {/* Gold Jewel Clapper */}
      <circle cx="60" cy="42" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Dining Platform & Baseline */}
      <line x1="32" y1="62" x2="88" y2="62" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="18" y1="68" x2="102" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 3. CAFÉ & COFFEE PLACEHOLDER
// Artisanal ceramic cup, saucer, aromatic steam plumes, and roasted bean jewel
// ============================================================================
export function CafePlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Sun Disc */}
      <circle cx="82" cy="24" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Ceramic Cup Body & Handle */}
      <path d="M42 36 L46 54 C47 58 52 61 60 61 C68 61 73 58 74 54 L78 36 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M60 36 L60 61 C68 61 73 58 74 54 L78 36 Z" fill="var(--color-accent-teal-deep, #0F4C5C)" opacity="0.3" />
      <ellipse cx="60" cy="36" rx="18" ry="3.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <ellipse cx="60" cy="36" rx="15" ry="2.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M75 40 C83 40 83 51 73 51" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Saucer Plate */}
      <ellipse cx="60" cy="62" rx="26" ry="4" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <ellipse cx="60" cy="61" rx="23" ry="2.8" fill="var(--color-surface-card, #FAF6F0)" opacity="0.25" />

      {/* 3. Steam Ribbons & Gold Coffee Bean */}
      <path d="M53 30 Q50 22 56 16" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M63 29 Q67 21 61 15" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <circle cx="60" cy="47" r="3" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="60" y1="45" x2="60" y2="49" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1" strokeLinecap="round" />

      {/* 4. Table Baseline */}
      <line x1="20" y1="69" x2="100" y2="69" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 4. BUS STOP PLACEHOLDER
// Japanese minimalist bus stop totem with round route disc, shelter canopy & bench
// ============================================================================
export function BusStopPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Sun Disc */}
      <circle cx="82" cy="22" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Round Bus Stop Signpost */}
      <circle cx="38" cy="28" r="9" fill="var(--color-accent-coral, #D42A2F)" />
      <circle cx="38" cy="28" r="6.5" fill="var(--color-surface-card, #FAF6F0)" />
      <line x1="34" y1="28" x2="42" y2="28" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="34" y="39" width="8" height="12" rx="1" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <line x1="38" y1="37" x2="38" y2="67" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2.5" />

      {/* Shelter Glass Partition & Canopy */}
      <polygon points="48,32 94,27 91,33 46,37" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect x="52" y="36" width="38" height="28" rx="1" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.35" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1" />
      <rect x="56" y="52" width="30" height="3.5" rx="1" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <line x1="60" y1="55.5" x2="60" y2="67" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />
      <line x1="82" y1="55.5" x2="82" y2="67" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />
      <line x1="50" y1="36" x2="50" y2="67" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2" />

      {/* 3. Gold Arrival Node */}
      <circle cx="92" cy="27" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Ground Curb & Tactile Paving */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="71" x2="100" y2="71" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeDasharray="3 3" />
    </svg>
  );
}

// ============================================================================
// 5. TRANSIT & METRO PLACEHOLDER
// High-speed Shinkansen bullet front emerging from arched portal with catenary
// ============================================================================
export function TransitPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Signal Beacon */}
      <circle cx="86" cy="22" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Arched Tunnel Portal */}
      <path d="M34 65 V42 C34 26 46 20 60 20 C74 20 86 26 86 42 V65" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="3" fill="none" />
      <path d="M38 65 V43 C38 30 48 24 60 24 C72 24 82 30 82 43 V65" fill="var(--color-surface-card, #FAF6F0)" opacity="0.15" />

      {/* Bullet Train Front Silhouette */}
      <path d="M46 65 L48 44 C49 35 54 32 60 32 C66 32 71 35 72 44 L74 65 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="50,42 70,42 67,49 53,49" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <line x1="47" y1="52" x2="47" y2="62" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <line x1="73" y1="52" x2="73" y2="62" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />

      {/* 3. High-Beam Gold Headlights */}
      <circle cx="53" cy="57" r="2.2" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="67" cy="57" r="2.2" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Catenary Wire Overhead */}
      <line x1="26" y1="17" x2="94" y2="17" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1" strokeDasharray="4 2" />

      {/* 4. Rail Tracks Baseline */}
      <line x1="44" y1="65" x2="38" y2="72" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2" strokeLinecap="round" />
      <line x1="76" y1="65" x2="82" y2="72" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="69" x2="80" y2="69" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
    </svg>
  );
}

// ============================================================================
// 6. HOTEL & LODGING PLACEHOLDER
// Architectural hotel facade with illuminated window grid, canopy & courtyard topiary
// ============================================================================
export function HotelPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Twilight Coral Moon */}
      <circle cx="84" cy="22" r="7.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Hotel Architectural Facade */}
      <rect x="42" y="24" width="36" height="41" rx="1.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="62" y="24" width="16" height="41" rx="1.5" fill="var(--color-accent-teal-deep, #0F4C5C)" opacity="0.4" />
      <rect x="40" y="22" width="40" height="3" rx="0.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <polygon points="36,54 84,54 80,58 40,58" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect x="54" y="58" width="12" height="7" fill="var(--color-accent-gold, #E2B33C)" opacity="0.9" />

      {/* Illuminated 3x3 Window Grid */}
      <rect x="47" y="28" width="5" height="5" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="57" y="28" width="5" height="5" rx="0.5" fill="var(--color-surface-card, #FAF6F0)" opacity="0.9" />
      <rect x="67" y="28" width="5" height="5" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="47" y="37" width="5" height="5" rx="0.5" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.8" />
      <rect x="57" y="37" width="5" height="5" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="67" y="37" width="5" height="5" rx="0.5" fill="var(--color-surface-card, #FAF6F0)" opacity="0.9" />
      <rect x="47" y="46" width="5" height="5" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />
      <rect x="57" y="46" width="5" height="5" rx="0.5" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.8" />
      <rect x="67" y="46" width="5" height="5" rx="0.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 3. Gold Ranking Jewel & Courtyard Topiary */}
      <circle cx="60" cy="16" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="32" cy="62" r="4" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <line x1="32" y1="62" x2="32" y2="68" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />

      {/* 4. Grounding Baseline */}
      <line x1="18" y1="68" x2="102" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 7. BAR & NIGHTLIFE PLACEHOLDER
// Sculptural coupette cocktail glass, garnish pick, shaker & evening neon sparkles
// ============================================================================
export function BarPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Nocturnal Coral Disc */}
      <circle cx="82" cy="22" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Coupette Glass & Liquid Meniscus */}
      <path d="M42 34 C42 46 54 51 59 51 V63 H54 V65 H66 V63 H61 V51 C66 51 78 46 78 34 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <path d="M45 38 C51 44 69 44 75 38 Z" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect x="59" y="51" width="2" height="13" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <ellipse cx="60" cy="64" rx="10" ry="2" fill="var(--color-accent-teal-deep, #0F4C5C)" />

      {/* 3. Cocktail Garnish Pick & Golden Olive */}
      <line x1="51" y1="24" x2="71" y2="44" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="56" cy="29" r="3.2" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Background Shaker Silhouette */}
      <path d="M25 43 L28 62 H38 L41 43 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.35" />
      <path d="M28 43 L31 37 H35 L38 43 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.4" />

      {/* Golden Night Sparkle */}
      <polygon points="94,36 96,39 99,40 96,41 94,44 92,41 89,40 92,39" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Polished Bar Counter Baseline */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 8. LANDMARK & CASTLE PLACEHOLDER
// Monumental fortress rampart, sweeping temple roof eaves, and golden Sorin finial
// ============================================================================
export function LandmarkPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Rising Coral Sun */}
      <circle cx="84" cy="20" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Castle Ramparts & Flared Eaves */}
      <polygon points="36,66 43,54 77,54 84,66" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <line x1="47" y1="60" x2="73" y2="60" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" strokeDasharray="3 2" />

      {/* Lower Sweeping Eave */}
      <path d="M33 54 Q60 49 87 54 L83 48 Q60 45 37 48 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />

      {/* Upper Keep & Upper Eave */}
      <rect x="47" y="39" width="26" height="9" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path d="M41 40 Q60 35 79 40 L75 35 Q60 32 45 35 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />

      {/* 3. Golden Sorin Spire Finial */}
      <line x1="60" y1="21" x2="60" y2="34" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="60" cy="22" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="60" cy="27" r="1.8" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Grounding Baseline */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 9. PARK & NATURE PLACEHOLDER
// Sculptural Zen pine tree, billowing foliage pads, contoured hill, and stone cairn
// ============================================================================
export function ParkPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Radiant Coral Sun */}
      <circle cx="82" cy="22" r="8" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Contoured Hillside Ridge */}
      <path d="M18 67 Q46 54 74 58 Q96 61 106 67 Z" fill="var(--color-accent-teal-deep, #0F4C5C)" opacity="0.75" />

      {/* Twisted Bonsai/Pine Trunk */}
      <path d="M50 64 Q52 48 57 42 Q61 36 63 29" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Cloud-Like Foliage Clusters */}
      <ellipse cx="44" cy="41" rx="13" ry="6.5" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <ellipse cx="69" cy="35" rx="15" ry="7" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <ellipse cx="58" cy="26" rx="11" ry="5.5" fill="var(--color-accent-teal-soft, #7CC4D1)" />

      {/* 3. Cairn Garden Stone & Gold Sparkle */}
      <ellipse cx="34" cy="58" rx="5" ry="3" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <circle cx="34" cy="54" r="2" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Peaceful Ground Baseline */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 10. ATTRACTION & SIGHTS PLACEHOLDER
// Panoramic viewpoint observation binoculars on swivel stand with radar arc
// ============================================================================
export function AttractionPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Sun Disc */}
      <circle cx="82" cy="22" r="7.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Panoramic Overlook Binoculars & Stand */}
      <polygon points="46,31 65,29 64,37 46,37" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="55,35 74,33 73,41 55,41" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <circle cx="58" cy="41" r="4.5" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <polygon points="56,43 60,43 62,64 54,64" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="47" y="64" width="22" height="3" rx="1" fill="var(--color-accent-teal-deep, #0F4C5C)" />

      {/* 3. Reticle View Sweep Arc & Gold Lens Gem */}
      <circle cx="78" cy="33" r="15" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeDasharray="3 3" fill="none" />
      <line x1="78" y1="15" x2="78" y2="19" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <circle cx="48" cy="34" r="2.2" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Railing Accents */}
      <line x1="18" y1="58" x2="38" y2="58" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <line x1="78" y1="58" x2="102" y2="58" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />

      {/* 4. Deck Ground Baseline */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 11. FLIGHT & AIR ROUTE PLACEHOLDER
// Supersonic passenger aircraft ascending through contrail vectors with waypoint star
// ============================================================================
export function FlightPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Altitude Sun */}
      <circle cx="86" cy="22" r="7.5" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Sleek Passenger Aircraft Silhouette */}
      <polygon points="78,28 38,50 32,47 44,41 40,31 46,33 55,39 68,33" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="78,28 55,39 46,33 68,33" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <polygon points="40,31 34,22 38,32" fill="var(--color-accent-teal-soft, #7CC4D1)" />

      {/* 3. Jet Contrails & Navigation Star */}
      <line x1="20" y1="57" x2="34" y2="49" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.6" strokeDasharray="4 2" strokeLinecap="round" />
      <circle cx="68" cy="23" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Atmospheric Cloud Horizon Baseline */}
      <path d="M18 68 Q28 64 38 68 Q50 63 62 68 Q78 62 92 68 H104" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ============================================================================
// 12. AIRPORT & ATC TOWER PLACEHOLDER
// Air traffic control radar tower with rotating antenna, beacon, and runway threshold
// ============================================================================
export function AirportPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Radar Signal Beacon */}
      <circle cx="84" cy="22" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. ATC Tower Shaft & Flared Glass Cab */}
      <polygon points="55,38 65,38 67,65 53,65" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="49,38 71,38 74,29 46,29" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <line x1="51" y1="33" x2="69" y2="33" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.8" />
      <path d="M52 29 C52 23 68 23 68 29 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />

      {/* 3. Rotating Antenna Mast & Gold Flashing Beacon */}
      <line x1="60" y1="17" x2="60" y2="23" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.8" />
      <path d="M56 18 Q60 15 64 18" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" fill="none" />
      <circle cx="60" cy="16" r="2.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Runway Perspective Markings */}
      <line x1="22" y1="67" x2="42" y2="67" stroke="var(--color-border, #E2D9CC)" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="24" cy="63" r="1.5" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="36" cy="63" r="1.5" fill="var(--color-accent-gold, #E2B33C)" />

      {/* 4. Airfield Baseline */}
      <line x1="16" y1="68" x2="104" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 13. SHOPPING & BOUTIQUE PLACEHOLDER
// Structured origami shopping tote, handle arcs, side gusset, and price tag gem
// ============================================================================
export function ShoppingPlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Focal Coral Seal Disc */}
      <circle cx="82" cy="24" r="7" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />

      {/* 2. Structured Shopping Bag & Gusset */}
      <polygon points="42,35 76,35 73,64 45,64" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <polygon points="76,35 84,33 80,61 73,64" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <path d="M51 35 C51 22 67 22 67 35" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <line x1="59" y1="35" x2="59" y2="64" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.2" opacity="0.4" />

      {/* 3. Ribbon Cord & Gold Tag Jewel */}
      <line x1="55" y1="35" x2="61" y2="44" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" />
      <circle cx="61" cy="44" r="3" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Market Awning Dashes in Background */}
      <path d="M22 34 H36 M86 34 H98" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeDasharray="3 2" />

      {/* 4. Promenade Ground Baseline */}
      <line x1="18" y1="68" x2="102" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// 14. GENERAL WAYPOINT & PLACE PLACEHOLDER
// Geodesic location pin, concentric telemetry radar rings, and compass crosshairs
// ============================================================================
export function GeneralPlacePlaceholderIllustration({
  size,
  width = 120,
  height = 80,
  className = '',
  style,
  ...props
}: IllustrationProps) {
  const w = size ?? width;
  const h = size ?? height;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: 'block', margin: '0 auto', ...style }}
      {...props}
    >
      {/* 1. Concentric Telemetry Broadcast Rings */}
      <circle cx="60" cy="37" r="16" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeDasharray="3 3" fill="none" />

      {/* 2. Primary Navigational Waypoint Pin */}
      <path
        d="M60 19 C48 19 41 27 41 37 C41 49 58 64 60 66 C62 64 79 49 79 37 C79 27 72 19 60 19 Z"
        stroke="var(--color-accent-teal-deep, #0F4C5C)"
        strokeWidth="2"
        fill="var(--color-accent-teal-mid, #1B8FA6)"
      />
      <path d="M60 21 C51 21 44 28 44 37 C44 47 57 60 60 63 V21 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.3" />

      {/* Inner Pin Cutout & Coral Target Core */}
      <circle cx="60" cy="37" r="8" fill="var(--color-surface-card, #FAF6F0)" />
      <circle cx="60" cy="37" r="5" fill="var(--color-accent-coral, #D42A2F)" />

      {/* 3. Gold Compass Star Nexus & Reticle Ticks */}
      <polygon points="60,33 61.8,36 65,37 61.8,38 60,41 58.2,38 55,37 58.2,36" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="26" y1="37" x2="34" y2="37" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />
      <line x1="86" y1="37" x2="94" y2="37" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" />

      {/* 4. Ground Datum Target Ellipse & Baseline */}
      <ellipse cx="60" cy="68" rx="16" ry="3.2" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.2" strokeDasharray="3 2" fill="none" />
      <line x1="18" y1="70" x2="102" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// HELPER COMPONENT DISPATCHER
// ============================================================================
export interface PlacePlaceholderProps extends IllustrationProps {
  category?: string;
  name?: string;
}

export function PlacePlaceholderIllustration({
  category = 'general',
  name = '',
  ...props
}: PlacePlaceholderProps) {
  const normCat = (category || '').toLowerCase().replace(/[-_]/g, ' ').trim();
  const normName = (name || '').toLowerCase().trim();

  // Museum & Art Galleries
  if (normCat.includes('museum') || normCat.includes('gallery') || normCat.includes('exhibition') || /\b(museum|musee|museo|gallery)\b/i.test(normName)) {
    return <MuseumPlaceholderIllustration {...props} />;
  }

  // Restaurant & Dining
  if (normCat.includes('restaurant') || normCat.includes('bistro') || normCat.includes('dining') || normCat.includes('food') || /\b(restaurant|bistro|trattoria|osteria|pizzeria)\b/i.test(normName)) {
    return <RestaurantPlaceholderIllustration {...props} />;
  }

  // Cafe & Coffee
  if (normCat.includes('cafe') || normCat.includes('coffee') || normCat.includes('bakery') || /\b(cafe|coffee|espresso|bakery|patisserie)\b/i.test(normName)) {
    return <CafePlaceholderIllustration {...props} />;
  }

  // Bus Stop & Transit Stations
  if (normCat.includes('bus stop') || normCat.includes('bus station') || normCat === 'bus' || /\b(bus stop|bus station)\b/i.test(normName)) {
    return <BusStopPlaceholderIllustration {...props} />;
  }

  // Transit, Train & Metro
  if (normCat.includes('transit') || normCat.includes('train') || normCat.includes('metro') || normCat.includes('subway') || normCat.includes('station') || normCat.includes('tram') || /\b(metro|subway|gare|train station)\b/i.test(normName)) {
    return <TransitPlaceholderIllustration {...props} />;
  }

  // Hotel & Accommodations
  if (normCat.includes('hotel') || normCat.includes('hostel') || normCat.includes('lodging') || normCat.includes('resort') || /\b(hotel|hostel|inn|resort|hyatt|hilton|marriott)\b/i.test(normName)) {
    return <HotelPlaceholderIllustration {...props} />;
  }

  // Bar & Pub
  if (normCat.includes('bar') || normCat.includes('pub') || normCat.includes('nightlife') || normCat.includes('club') || /\b(bar|pub|tavern|brewery)\b/i.test(normName)) {
    return <BarPlaceholderIllustration {...props} />;
  }

  // Landmark & Heritage
  if (normCat.includes('landmark') || normCat.includes('monument') || normCat.includes('historic') || normCat.includes('castle') || normCat.includes('ruins') || normCat.includes('cathedral') || normCat.includes('church') || /\b(monument|cathedral|castle|chateau|tower|palace|alcazar|citadel)\b/i.test(normName)) {
    return <LandmarkPlaceholderIllustration {...props} />;
  }

  // Park & Nature
  if (normCat.includes('park') || normCat.includes('garden') || normCat.includes('nature') || normCat.includes('trail') || /\b(park|garden|jardin|parque)\b/i.test(normName)) {
    return <ParkPlaceholderIllustration {...props} />;
  }

  // Flight
  if (normCat.includes('flight')) {
    return <FlightPlaceholderIllustration {...props} />;
  }

  // Airport
  if (normCat.includes('airport') || /\b(airport|aeroport|aeropuerto|terminal)\b/i.test(normName)) {
    return <AirportPlaceholderIllustration {...props} />;
  }

  // Shopping & Retail
  if (normCat.includes('shopping') || normCat.includes('shop') || normCat.includes('market') || normCat.includes('mall') || normCat.includes('store')) {
    return <ShoppingPlaceholderIllustration {...props} />;
  }

  // Tourist Attractions & Sights
  if (normCat.includes('attraction') || normCat.includes('sight') || normCat.includes('viewpoint') || normCat.includes('activity')) {
    return <AttractionPlaceholderIllustration {...props} />;
  }

  // General Waypoint
  return <GeneralPlacePlaceholderIllustration {...props} />;
}
