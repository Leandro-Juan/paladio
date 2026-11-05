"use client";

import React from 'react';

/**
 * Tactical Callout Pill
 */
function CalloutBadge({ number, label, style }: { number: number; label?: string; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: '9999px',
        background: 'var(--color-accent-coral, #D42A2F)',
        color: '#FFFFFF',
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono, monospace)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        ...style,
      }}
    >
      <span>{number}</span>
      {label && <span style={{ fontWeight: 600, fontSize: '10px' }}>{label}</span>}
    </span>
  );
}

/**
 * Inline Walk Icon
 */
function WalkSvgIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13" cy="4" r="2" />
      <path d="m14 8-3 5-3-2-2 4" />
      <path d="m11 13 3 3v5" />
      <path d="M7 21l3-6" />
    </svg>
  );
}

/**
 * Inline Lock Icon
 */
function LockSvgIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/**
 * Inline Check Icon
 */
function CheckSvgIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Inline Sparkle / Star Icon
 */
function StarSvgIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/**
 * 1. Timeline UI Mockup with Numbered Annotations
 */
export function TimelineUiMockup() {
  return (
    <div
      style={{
        background: 'var(--color-surface-card, #FAF6F0)',
        border: '1px solid var(--color-border, #E2D9CC)',
        borderRadius: '12px',
        padding: '18px 20px',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
        fontSize: '13px',
      }}
    >
      {/* Header bar of mockup */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-border, #E2D9CC)',
          paddingBottom: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>DAY 2 SCHEDULE</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-ocean, #1B8FA6)', color: '#FFFFFF', fontWeight: 600 }}>
            OCT 14 • KYOTO
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>4 STOPS • 6.2 KM WALKING</span>
          <CalloutBadge number={1} label="Day Overview" />
        </div>
      </div>

      {/* Stop 1: Hotel Departure */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '48px', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>09:00</span>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-ocean, #1B8FA6)', marginTop: '4px' }} />
          <div style={{ width: '2px', height: '36px', background: 'var(--color-border, #E2D9CC)' }} />
        </div>
        <div style={{ flex: 1, paddingBottom: '14px' }}>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Hotel Kanra Kyoto (Departure)</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Morning hotel anchor point</div>
        </div>
      </div>

      {/* Transit pill */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', paddingLeft: '48px', marginBottom: '10px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '9999px',
            background: 'var(--color-surface-hover, rgba(15, 76, 92, 0.06))',
            border: '1px dashed var(--color-border, #E2D9CC)',
            fontSize: '11px',
            color: 'var(--color-ocean, #1B8FA6)',
          }}
        >
          <WalkSvgIcon size={12} color="var(--color-ocean, #1B8FA6)" />
          <span>14 min walk (950m)</span>
          <CalloutBadge number={2} label="Walking Cushion" />
        </div>
      </div>

      {/* Stop 2: Fushimi Inari (LOCKED AT TIME) */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          alignItems: 'flex-start',
          background: 'rgba(212, 42, 47, 0.05)',
          border: '1px solid var(--color-accent-coral, #D42A2F)',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '48px', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent-coral, #D42A2F)' }}>09:30</span>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-accent-coral, #D42A2F)', marginTop: '4px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Fushimi Inari Shrine</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: 'var(--color-accent-coral, #D42A2F)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <LockSvgIcon size={10} color="#FFFFFF" />
                <span>LOCKED (1h 30m)</span>
              </span>
              <CalloutBadge number={3} label="Fixed Ticket Time" />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Pre-booked ticket window • Paladio keeps this time frozen
          </div>
        </div>
      </div>

      {/* Stop 3: Lunch Window (FLEXIBLE) */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          alignItems: 'flex-start',
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '48px', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>11:45</span>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-accent-gold, #E2B33C)', marginTop: '4px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Nishiki Market Ramen (Lunch)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: 'var(--color-accent-gold-soft, rgba(226, 179, 60, 0.2))',
                  color: '#B8860B',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <StarSvgIcon size={10} color="#B8860B" />
                <span>LUNCH BREAK</span>
              </span>
              <CalloutBadge number={4} label="Guaranteed Meal" />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Relaxed dining slot (11:45 - 13:00) • Protects you from getting overly hungry
          </div>
        </div>
      </div>

      {/* Callouts legend */}
      <div
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--color-border, #E2D9CC)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '8px',
          fontSize: '11px',
        }}
      >
        <div><strong>① Day Overview:</strong> Switch dates, check walking totals, or refresh the schedule.</div>
        <div><strong>② Walking Cushion:</strong> Real foot travel time with built-in buffer.</div>
        <div><strong>③ Lock Button:</strong> Freezes your ticketed time so other sights adjust around it.</div>
        <div><strong>④ Meal Protection:</strong> Automatic lunch and dinner slots ensuring a comfortable pace.</div>
      </div>
    </div>
  );
}

/**
 * 2. Route Comparison Mockup: Naive Zigzag vs Paladio Neighborhood Flow
 */
export function RouteComparisonMockup() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        fontSize: '12px',
      }}
    >
      {/* Bad Route: Chaotic Zigzag */}
      <div
        style={{
          background: 'var(--color-surface-card, #FAF6F0)',
          border: '1px solid var(--color-danger, #B3261E)',
          borderRadius: '12px',
          padding: '16px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontWeight: 700, color: 'var(--color-danger, #B3261E)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>UNORGANIZED (BACK-AND-FORTH)</span>
          </span>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(179, 38, 30, 0.12)', color: 'var(--color-danger, #B3261E)', fontWeight: 700 }}>
            TRAVEL: 24.8 KM
          </span>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          Generic travel tools make you cross the city east and west repeatedly, wasting hours in transit.
        </p>

        {/* Visual Zigzag Graphic */}
        <svg width="100%" height="110" viewBox="0 0 280 110" fill="none" style={{ background: 'rgba(179,38,30,0.03)', borderRadius: '8px' }} aria-hidden="true">
          <path d="M 140 0 Q 130 55 140 110" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="8" opacity="0.4" />
          <path d="M 30 20 L 250 35 L 45 80 L 235 90" stroke="var(--color-danger, #B3261E)" strokeWidth="2.5" strokeDasharray="4 3" />
          <circle cx="30" cy="20" r="7" fill="var(--color-danger, #B3261E)" />
          <text x="30" y="24" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">1</text>
          <circle cx="250" cy="35" r="7" fill="var(--color-danger, #B3261E)" />
          <text x="250" y="39" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">2</text>
          <circle cx="45" cy="80" r="7" fill="var(--color-danger, #B3261E)" />
          <text x="45" y="84" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">3</text>
          <circle cx="235" cy="90" r="7" fill="var(--color-danger, #B3261E)" />
          <text x="235" y="94" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">4</text>
        </svg>

        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-danger, #B3261E)', fontWeight: 600 }}>
          High Exhaustion Risk • 3.5 Hours Wasted on Buses • Low Comfort (4.2 / 10)
        </div>
      </div>

      {/* Good Route: Paladio Neighborhood Flow */}
      <div
        style={{
          background: 'var(--color-surface-card, #FAF6F0)',
          border: '2px solid var(--color-success, #1F7A4D)',
          borderRadius: '12px',
          padding: '16px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontWeight: 700, color: 'var(--color-success, #1F7A4D)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={14} color="var(--color-success, #1F7A4D)" />
            <span>PALADIO NEIGHBORHOOD FLOW</span>
          </span>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(31, 122, 77, 0.12)', color: 'var(--color-success, #1F7A4D)', fontWeight: 700 }}>
            TRAVEL: 8.4 KM
          </span>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          Morning stops in the West district, single easy river crossing at lunch, afternoon stops in the East.
        </p>

        {/* Visual Smooth Clustered Graphic */}
        <svg width="100%" height="110" viewBox="0 0 280 110" fill="none" style={{ background: 'rgba(31,122,77,0.03)', borderRadius: '8px' }} aria-hidden="true">
          <path d="M 140 0 Q 130 55 140 110" stroke="var(--color-accent-teal-soft, #7CC4D1)" strokeWidth="8" opacity="0.4" />
          <path d="M 30 20 L 45 80 Q 140 95 235 90 L 250 35" stroke="var(--color-success, #1F7A4D)" strokeWidth="2.5" fill="none" />
          <circle cx="30" cy="20" r="7" fill="var(--color-ocean, #1B8FA6)" />
          <text x="30" y="24" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">1</text>
          <circle cx="45" cy="80" r="7" fill="var(--color-ocean, #1B8FA6)" />
          <text x="45" y="84" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">2</text>
          <circle cx="235" cy="90" r="7" fill="var(--color-accent-coral, #D42A2F)" />
          <text x="235" y="94" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">3</text>
          <circle cx="250" cy="35" r="7" fill="var(--color-accent-coral, #D42A2F)" />
          <text x="250" y="39" fontSize="8" fill="#FFF" fontWeight="bold" textAnchor="middle">4</text>
        </svg>

        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-success, #1F7A4D)', fontWeight: 600 }}>
          Zero Backtracking • 68% Transit Time Saved • High Comfort (9.6 / 10)
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Realism Radar Mockup
 */
export function RealismRadarMockup() {
  return (
    <div
      style={{
        background: 'var(--color-surface-card, #FAF6F0)',
        border: '1px solid var(--color-border, #E2D9CC)',
        borderRadius: '12px',
        padding: '18px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        alignItems: 'center',
      }}
    >
      {/* Score Meter Dial */}
      <div style={{ textAlign: 'center', minWidth: '130px' }}>
        <div style={{ position: 'relative', width: '90px', height: '90px', margin: '0 auto' }}>
          <svg width="90" height="90" viewBox="0 0 90 90" aria-hidden="true">
            <circle cx="45" cy="45" r="38" stroke="var(--color-border, #E2D9CC)" strokeWidth="6" fill="none" />
            <circle
              cx="45"
              cy="45"
              r="38"
              stroke="var(--color-success, #1F7A4D)"
              strokeWidth="6"
              fill="none"
              strokeDasharray="238.76"
              strokeDashoffset="24"
              strokeLinecap="round"
              transform="rotate(-90 45 45)"
            />
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text-primary)' }}>9.4</span>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-success, #1F7A4D)', textTransform: 'uppercase' }}>COMFORTABLE</span>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px' }}>0 to 10 Comfort Rating</div>
      </div>

      {/* The 5 Pillar Gauges */}
      <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>1. Three Proper Meals</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>Guaranteed (Breakfast, Lunch, Dinner)</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>2. Walking Fatigue</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>6.2 km (Comfortable)</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>3. Neighborhood Clustered</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>Zero Backtracking</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>4. Rest &amp; Coffee Break</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>45 min afternoon break included</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>5. Open Hours Respected</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>100% within opening hours</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 4. Cost Knapsack & Split Mockup
 */
export function CostKnapsackMockup() {
  return (
    <div
      style={{
        background: 'var(--color-surface-card, #FAF6F0)',
        border: '1px solid var(--color-border, #E2D9CC)',
        borderRadius: '12px',
        padding: '18px 20px',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>Trip Spending Progress</span>
          <span style={{ marginLeft: '8px', color: 'var(--color-text-muted)' }}>$2,400.00 Total Budget</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--color-ocean, #1B8FA6)', color: '#FFF', fontWeight: 700, fontSize: '11px' }}>USD</span>
          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--color-surface-hover, rgba(0,0,0,0.05))', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px' }}>EUR</span>
          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--color-surface-hover, rgba(0,0,0,0.05))', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px' }}>JPY</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: '14px', borderRadius: '7px', background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.2))', display: 'flex', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ width: '42%', background: 'var(--color-deep-sea, #0F4C5C)' }} title="Accommodation $1,008" />
        <div style={{ width: '25%', background: 'var(--color-ocean, #1B8FA6)' }} title="Food & Dining $600" />
        <div style={{ width: '15%', background: 'var(--color-accent-gold, #E2B33C)' }} title="Activities $360" />
        <div style={{ width: '8%', background: 'var(--color-accent-coral, #D42A2F)' }} title="Transit $192" />
        <div style={{ width: '10%', background: 'transparent' }} title="Remaining Safe Buffer $240" />
      </div>

      {/* Legend & Debt Settler */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-deep-sea, #0F4C5C)' }} />
          <span>Hotel: $1,008 (42%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-ocean, #1B8FA6)' }} />
          <span>Dining: $600 (25%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-accent-gold, #E2B33C)' }} />
          <span>Sightseeing: $360 (15%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-accent-coral, #D42A2F)' }} />
          <span>Emergency Buffer: $240 (Safe)</span>
        </div>
      </div>

      <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '6px', background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><strong>Simple Settle Up:</strong> Alex covered hotel ($1,008) • Elena covered dining ($600)</span>
        <span style={{ color: 'var(--color-ocean, #1B8FA6)', fontWeight: 700 }}>Elena pays Alex $204.00</span>
      </div>
    </div>
  );
}

/**
 * 5. Swarm Assistant Mockup
 */
export function SwarmAssistantMockup() {
  return (
    <div
      style={{
        background: 'var(--color-surface-card, #FAF6F0)',
        border: '1px solid var(--color-border, #E2D9CC)',
        borderRadius: '12px',
        padding: '16px',
        fontSize: '12px',
      }}
    >
      {/* User Bubble */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <div
          style={{
            background: 'var(--color-ocean, #1B8FA6)',
            color: '#FFFFFF',
            borderRadius: '10px 10px 2px 10px',
            padding: '8px 12px',
            maxWidth: '85%',
          }}
        >
          &ldquo;Swap Day 2 afternoon for a quiet tea garden and find matcha within a 5-minute walk&rdquo;
        </div>
      </div>

      {/* Swarm Proposal Card */}
      <div
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-accent-gold, #E2B33C)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'var(--color-accent-gold-soft, rgba(226, 179, 60, 0.2))', color: '#B8860B', fontWeight: 700 }}>
            ASSISTANT SUGGESTION (PREVIEW)
          </span>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Private Local Assistant</span>
        </div>
        <div style={{ color: 'var(--color-danger, #B3261E)', textDecoration: 'line-through', fontSize: '11px' }}>
          - 14:30 Crowded Commercial Gallery (Removed)
        </div>
        <div style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>
          + 14:15 Murin-an Japanese Villa &amp; Garden (Added)
        </div>
        <div style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>
          + 15:45 Camellia Tea Ceremony (350m walk • Within Budget)
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--color-success, #1F7A4D)',
              color: '#FFFFFF',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <CheckSvgIcon size={12} color="#FFFFFF" />
            <span>APPROVE &amp; UPDATE ITINERARY</span>
          </button>
          <button
            type="button"
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #E2D9CC)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            DISMISS
          </button>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
        You are in control: Paladio never changes your schedule without your explicit approval.
      </div>
    </div>
  );
}
