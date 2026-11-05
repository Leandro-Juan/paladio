import React from 'react';

interface IllustrationProps {
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
}

/**
 * Getting Started Hero Illustration
 * A compass disc anchoring celestial nodes, horizon grid, and itinerary trajectory.
 */
export function GettingStartedIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Horizon Baseline */}
      <line x1="12" y1="68" x2="108" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="28" y1="72" x2="92" y2="72" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

      {/* Trajectory Curve */}
      <path
        d="M16 68 C 30 35, 60 20, 102 36"
        stroke="var(--color-accent-teal-mid, #1B8FA6)"
        strokeWidth="2"
        strokeDasharray="4 3"
        fill="none"
      />

      {/* Celestial Focal Disc */}
      <circle cx="86" cy="24" r="10" fill="var(--color-accent-coral, #D42A2F)" opacity="0.9" />
      <circle cx="86" cy="24" r="14" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.75" />

      {/* Compass / Waypoint Needle */}
      <polygon points="86,16 90,24 86,22 82,24" fill="#FFFFFF" />
      <polygon points="86,32 90,24 86,22 82,24" fill="var(--color-accent-teal-deep, #0F4C5C)" opacity="0.7" />

      {/* Starting Node & Milestone */}
      <rect x="22" y="44" width="22" height="18" rx="4" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" />
      <line x1="27" y1="50" x2="39" y2="50" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="27" y1="55" x2="35" y2="55" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Destination Pin */}
      <circle cx="102" cy="36" r="4.5" fill="var(--color-accent-gold, #E2B33C)" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" />

      {/* Tactical Crop Brackets */}
      <path d="M14 20 H8 V26" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M106 58 H112 V52" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/**
 * Trip Management Hero Illustration
 * Multi-day calendar cards with synchronized time blocks, locks, and sequence links.
 */
export function TripsHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Ground Baseline */}
      <line x1="10" y1="68" x2="110" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

      {/* Card 1: Day 1 Block */}
      <rect x="14" y="24" width="28" height="38" rx="5" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" />
      <rect x="18" y="29" width="12" height="4" rx="2" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="18" y="37" width="20" height="8" rx="2" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.35" />
      <rect x="18" y="49" width="20" height="7" rx="2" fill="var(--color-accent-gold, #E2B33C)" opacity="0.4" />

      {/* Connector Arrow */}
      <path d="M43 42 L51 42" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeDasharray="2 2" />
      <polygon points="50,40 54,42 50,44" fill="var(--color-accent-teal-mid, #1B8FA6)" />

      {/* Card 2: Main Active Day Card */}
      <rect x="54" y="16" width="34" height="48" rx="6" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.8" />
      <rect x="58" y="21" width="16" height="4" rx="2" fill="var(--color-accent-coral, #D42A2F)" />
      {/* Locked Activity Slot */}
      <rect x="58" y="29" width="26" height="12" rx="3" fill="var(--color-accent-teal-deep, #0F4C5C)" opacity="0.12" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1" />
      {/* Miniature Lock Icon */}
      <circle cx="64" cy="35" r="2" fill="var(--color-accent-gold, #E2B33C)" />
      <path d="M63 35 V33 C63 32.4 63.5 32 64 32 C64.5 32 65 32.4 65 33 V35" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="0.8" fill="none" />
      <line x1="68" y1="35" x2="80" y2="35" stroke="var(--color-accent-teal-deep, #0F4C5C)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Activity Slot 2 */}
      <rect x="58" y="45" width="26" height="13" rx="3" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.25" />
      <line x1="62" y1="51" x2="78" y2="51" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Card 3: Day 3 Block */}
      <rect x="94" y="28" width="18" height="34" rx="4" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" opacity="0.75" />
      <rect x="97" y="33" width="8" height="3" rx="1.5" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      <rect x="97" y="40" width="12" height="7" rx="2" fill="var(--color-border, #E2D9CC)" opacity="0.5" />

      {/* Floating Accent Sun */}
      <circle cx="102" cy="18" r="6" fill="var(--color-accent-coral, #D42A2F)" opacity="0.85" />
    </svg>
  );
}

/**
 * Routes & Engine Hero Illustration
 * Connected graph nodes, directional arrows, and time window threshold bar.
 */
export function RoutesHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Ground Baseline */}
      <line x1="12" y1="70" x2="108" y2="70" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

      {/* C++ Deterministic Mesh Network Lines */}
      <path d="M22 56 L44 26 L80 20 L98 52 L62 62 Z" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />

      {/* Solved TSPTW Optimal Path */}
      <path d="M22 56 Q 30 36 44 26 T 80 20 T 98 52" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="2.4" strokeLinecap="round" fill="none" />

      {/* Node A (Origin) */}
      <circle cx="22" cy="56" r="6" fill="var(--color-accent-teal-deep, #0F4C5C)" stroke="#FFFFFF" strokeWidth="1.5" />
      <circle cx="22" cy="56" r="2" fill="#FFFFFF" />

      {/* Node B */}
      <circle cx="44" cy="26" r="5" fill="var(--color-accent-teal-mid, #1B8FA6)" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="44" y="29" fontSize="6" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">1</text>

      {/* Node C (Focal Time Window) */}
      <circle cx="80" cy="20" r="7" fill="var(--color-accent-gold, #E2B33C)" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.8" />
      <text x="80" y="23" fontSize="6.5" fontWeight="bold" fill="#1A2B32" textAnchor="middle">2</text>

      {/* Time Window Bracket on Node C */}
      <path d="M72 11 H88" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="72" y1="9" x2="72" y2="13" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.2" />
      <line x1="88" y1="9" x2="88" y2="13" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.2" />

      {/* Node D */}
      <circle cx="98" cy="52" r="5" fill="var(--color-accent-teal-mid, #1B8FA6)" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="98" y="55" fontSize="6" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">3</text>

      {/* Node E (Hotel/End) */}
      <circle cx="62" cy="62" r="6" fill="var(--color-accent-teal-deep, #0F4C5C)" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.5" />
      <rect x="59.5" y="59.5" width="5" height="5" fill="var(--color-accent-gold, #E2B33C)" rx="1" />

      {/* Sub-50ms Latency Badge */}
      <rect x="42" y="4" width="36" height="12" rx="3" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1" />
      <text x="60" y="12" fontSize="5.5" fontFamily="monospace" fontWeight="bold" fill="var(--color-accent-teal-mid, #1B8FA6)" textAnchor="middle">C++20 &lt;50ms</text>
    </svg>
  );
}

/**
 * Costs & Budget Hero Illustration
 * Knapsack packing meter, multi-currency coins, and split allocation bars.
 */
export function CostsHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Ground Baseline */}
      <line x1="14" y1="68" x2="106" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

      {/* Knapsack Container Card */}
      <rect x="20" y="24" width="80" height="36" rx="6" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />

      {/* Knapsack Allocation Bar */}
      <rect x="26" y="32" width="68" height="8" rx="4" fill="var(--color-surface-muted, rgba(148, 163, 184, 0.2))" />
      <rect x="26" y="32" width="28" height="8" rx="4 0 0 4" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <rect x="54" y="32" width="20" height="8" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <rect x="74" y="32" width="12" height="8" fill="var(--color-accent-gold, #E2B33C)" />
      <line x1="86" y1="29" x2="86" y2="43" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.5" strokeDasharray="2 1" />

      {/* Sub-bars */}
      <rect x="26" y="46" width="18" height="6" rx="2" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.4" />
      <rect x="48" y="46" width="24" height="6" rx="2" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.4" />
      <rect x="76" y="46" width="18" height="6" rx="2" fill="var(--color-accent-gold, #E2B33C)" opacity="0.4" />

      {/* Floating Currency Disc: Gold Coin */}
      <circle cx="96" cy="18" r="9" fill="var(--color-accent-gold, #E2B33C)" stroke="var(--color-surface-card, #FAF6F0)" strokeWidth="1.5" />
      <text x="96" y="22" fontSize="9" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">€</text>

      {/* Secondary Currency Coin */}
      <circle cx="80" cy="16" r="6.5" fill="var(--color-accent-coral, #D42A2F)" stroke="var(--color-surface-card, #FAF6F0)" strokeWidth="1.2" />
      <text x="80" y="19" fontSize="6.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">$</text>

      {/* Currency Exchange Arrows */}
      <path d="M87 14 L89 16 L87 18" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Map & Spatial Hero Illustration
 * Radar sweep, tactical waypoint clusters, and geographic contour polyline.
 */
export function MapHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Ground Baseline */}
      <line x1="12" y1="68" x2="108" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

      {/* Radar Coordinate Grid Circles */}
      <circle cx="60" cy="42" r="26" stroke="var(--color-border, #E2D9CC)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      <circle cx="60" cy="42" r="14" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1" opacity="0.4" />

      {/* Radar Sweep Arc */}
      <path d="M60 42 L78 24 A26 26 0 0 1 86 42 Z" fill="var(--color-accent-teal-soft, #7CC4D1)" opacity="0.18" />

      {/* Route Polyline on Map */}
      <path d="M38 52 Q 46 32 60 40 T 84 30" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Waypoints */}
      <circle cx="38" cy="52" r="4" fill="var(--color-accent-teal-deep, #0F4C5C)" stroke="#FFFFFF" strokeWidth="1.2" />
      <circle cx="60" cy="40" r="4.5" fill="var(--color-accent-teal-mid, #1B8FA6)" stroke="#FFFFFF" strokeWidth="1.2" />
      <circle cx="84" cy="30" r="6" fill="var(--color-accent-gold, #E2B33C)" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1.5" />
      <circle cx="84" cy="30" r="2" fill="var(--color-accent-coral, #D42A2F)" />

      {/* Viewfinder Reticles */}
      <path d="M22 22 H16 V28" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M98 22 H104 V28" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 62 H16 V56" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M98 62 H104 V56" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * AI Swarm Hero Illustration
 * Multi-agent graph (Supervisor node dispatches to specialized agents) with checkmark approval.
 */
export function SwarmHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Ground Baseline */}
      <line x1="12" y1="68" x2="108" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

      {/* Dispatch Vectors */}
      <line x1="60" y1="24" x2="32" y2="52" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="60" y1="24" x2="60" y2="52" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="60" y1="24" x2="88" y2="52" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="1.5" strokeDasharray="3 2" />

      {/* Central Supervisor Node */}
      <circle cx="60" cy="24" r="10" fill="var(--color-accent-teal-deep, #0F4C5C)" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1.8" />
      <circle cx="60" cy="24" r="3" fill="#FFFFFF" />

      {/* Sub-Agents */}
      <circle cx="32" cy="52" r="7" fill="var(--color-accent-teal-mid, #1B8FA6)" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="32" y="55" fontSize="6" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">PLN</text>

      <circle cx="60" cy="52" r="7" fill="var(--color-accent-gold, #E2B33C)" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="60" y="55" fontSize="6" fontWeight="bold" fill="#1A2B32" textAnchor="middle">CST</text>

      <circle cx="88" cy="52" r="7" fill="var(--color-accent-coral, #D42A2F)" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="88" y="55" fontSize="6" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">POI</text>

      {/* Human-in-the-Loop Approval Shield */}
      <rect x="48" y="60" width="24" height="12" rx="3" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-success, #1F7A4D)" strokeWidth="1.2" />
      <polyline points="54,66 58,69 66,63" stroke="var(--color-success, #1F7A4D)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/**
 * Glossary & Metrics Hero Illustration
 * Radar scale, ruler indicators, and data score tags.
 */
export function GlossaryHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      {/* Ground Baseline */}
      <line x1="14" y1="68" x2="106" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

      {/* Metric Gauge Card */}
      <rect x="22" y="20" width="76" height="42" rx="6" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />

      {/* Score Arc: 0 to 10 */}
      <path d="M40 48 A 20 20 0 1 1 80 48" stroke="var(--color-border, #E2D9CC)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M40 48 A 20 20 0 1 1 76 34" stroke="var(--color-accent-teal-mid, #1B8FA6)" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Score Text */}
      <text x="60" y="44" fontSize="10" fontWeight="bold" fill="var(--color-text-primary, #1A2B32)" textAnchor="middle">9.6</text>
      <text x="60" y="52" fontSize="5" fontWeight="600" fill="var(--color-accent-teal-deep, #0F4C5C)" textAnchor="middle">REALISM</text>

      {/* Metric Pills */}
      <rect x="88" y="14" width="22" height="10" rx="3" fill="var(--color-accent-gold-soft, rgba(226, 179, 60, 0.2))" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1" />
      <text x="99" y="21" fontSize="5" fontWeight="bold" fill="var(--color-accent-gold, #E2B33C)" textAnchor="middle">TSPTW</text>

      <rect x="10" y="32" width="20" height="10" rx="3" fill="var(--color-accent-warning-bg, rgba(226, 179, 60, 0.12))" stroke="var(--color-accent-coral, #D42A2F)" strokeWidth="1" />
      <text x="20" y="39" fontSize="5" fontWeight="bold" fill="var(--color-accent-coral, #D42A2F)" textAnchor="middle">SLACK</text>
    </svg>
  );
}

/**
 * Settings & Instance Hero Illustration
 * Sliders, toggle gear, and sovereign terminal.
 */
export function SettingsHeroIllustration({ width = 180, height = 120, className = '', style }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      <line x1="14" y1="68" x2="106" y2="68" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      
      {/* Main Console Box */}
      <rect x="24" y="20" width="72" height="42" rx="5" fill="var(--color-surface-card, #FAF6F0)" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" />
      
      {/* Console Header Bar */}
      <rect x="24" y="20" width="72" height="10" rx="5 5 0 0" fill="var(--color-accent-teal-deep, #0F4C5C)" />
      <circle cx="31" cy="25" r="2" fill="var(--color-accent-coral, #D42A2F)" />
      <circle cx="37" cy="25" r="2" fill="var(--color-accent-gold, #E2B33C)" />
      <circle cx="43" cy="25" r="2" fill="var(--color-accent-teal-soft, #7CC4D1)" />
      
      {/* Switch 1: Dark Mode Toggle */}
      <line x1="32" y1="38" x2="60" y2="38" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="74" y="34" width="16" height="8" rx="4" fill="var(--color-accent-teal-mid, #1B8FA6)" />
      <circle cx="85" cy="38" r="3" fill="#FFFFFF" />

      {/* Switch 2: Local Ollama Model */}
      <line x1="32" y1="48" x2="52" y2="48" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="70" y="44" width="20" height="8" rx="4" fill="var(--color-accent-gold-soft, rgba(226, 179, 60, 0.2))" stroke="var(--color-accent-gold, #E2B33C)" strokeWidth="1" />
      <circle cx="75" cy="48" r="3" fill="var(--color-accent-gold, #E2B33C)" />

      {/* Switch 3: GTFS Transit */}
      <line x1="32" y1="56" x2="58" y2="56" stroke="var(--color-border, #E2D9CC)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="74" y="53" width="16" height="6" rx="3" fill="var(--color-surface-muted, rgba(148, 163, 184, 0.2))" />
      <circle cx="78" cy="56" r="2.5" fill="var(--color-text-muted, #566B76)" />
    </svg>
  );
}
