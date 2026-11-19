"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();
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
          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{t('help.mockup_day2_schedule')}</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-ocean, #1B8FA6)', color: '#FFFFFF', fontWeight: 600 }}>
            {t('help.mockup_oct14_kyoto')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{t('help.mockup_4stops_walking')}</span>
          <CalloutBadge number={1} label={t('help.mockup_badge_day_overview')} />
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
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{t('help.mockup_hotel_kanra')}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{t('help.mockup_hotel_anchor')}</div>
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
          <span>{t('help.mockup_walk_14m')}</span>
          <CalloutBadge number={2} label={t('help.mockup_badge_transit_leg')} />
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
            <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{t('help.mockup_fushimi_inari')}</span>
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
                <span>{t('help.mockup_locked_0930')}</span>
              </span>
              <CalloutBadge number={3} label={t('help.mockup_badge_locked_stop')} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {t('help.mockup_fushimi_note')}
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
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{t('help.mockup_nishiki_ramen')}</span>
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
                <span>{t('help.mockup_lunch_break')}</span>
              </span>
              <CalloutBadge number={4} label={t('help.mockup_badge_guaranteed_meal')} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {t('help.mockup_nishiki_note')}
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
        <div>
          {t('help.mockup_legend1_body', {
            label: '__LBL__',
            c1: '__C1__',
            c2: '__C2__',
            c3: '__C3__',
            c4: '__C4__',
          })
            .split(/(__LBL__|__C[1-4]__)/)
            .map((part, idx) => {
              if (part === '__LBL__') return <strong key={idx}>{t('help.mockup_legend1_label')}</strong>;
              if (part === '__C1__') return <code key={idx}>{t('help.mockup_legend1_c1')}</code>;
              if (part === '__C2__') return <code key={idx}>{t('help.mockup_legend1_c2')}</code>;
              if (part === '__C3__') return <code key={idx}>{t('help.mockup_legend1_c3')}</code>;
              if (part === '__C4__') return <code key={idx}>{t('help.mockup_legend1_c4')}</code>;
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
        </div>
        <div>
          {t('help.mockup_legend2_body', {
            label: '__LBL__',
            c1: '__C1__',
            c2: '__C2__',
          })
            .split(/(__LBL__|__C[1-2]__)/)
            .map((part, idx) => {
              if (part === '__LBL__') return <strong key={idx}>{t('help.mockup_legend2_label')}</strong>;
              if (part === '__C1__') return <code key={idx}>{t('help.mockup_legend2_c1')}</code>;
              if (part === '__C2__') return <code key={idx}>{t('help.mockup_legend2_c2')}</code>;
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
        </div>
        <div>
          {t('help.mockup_legend3_body', {
            label: '__LBL__',
            c1: '__C1__',
          })
            .split(/(__LBL__|__C1__)/)
            .map((part, idx) => {
              if (part === '__LBL__') return <strong key={idx}>{t('help.mockup_legend3_label')}</strong>;
              if (part === '__C1__') return <code key={idx}>{t('help.mockup_legend3_c1')}</code>;
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
        </div>
        <div>
          {t('help.mockup_legend4_body', {
            label: '__LBL__',
          })
            .split(/(__LBL__)/)
            .map((part, idx) => {
              if (part === '__LBL__') return <strong key={idx}>{t('help.mockup_legend4_label')}</strong>;
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
        </div>
      </div>
    </div>
  );
}

/**
 * 2. Route Comparison Mockup: Naive Zigzag vs Paladio Neighborhood Flow
 */
export function RouteComparisonMockup() {
  const { t } = useTranslation();
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
            <span>{t('help.mockup_unorganized_title')}</span>
          </span>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(179, 38, 30, 0.12)', color: 'var(--color-danger, #B3261E)', fontWeight: 700 }}>
            {t('help.mockup_travel_24_8_km')}
          </span>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {t('help.mockup_unorganized_desc')}
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
          {t('help.mockup_unorganized_footer')}
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
            <span>{t('help.mockup_flow_title')}</span>
          </span>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(31, 122, 77, 0.12)', color: 'var(--color-success, #1F7A4D)', fontWeight: 700 }}>
            {t('help.mockup_travel_8_4_km')}
          </span>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {t('help.mockup_flow_desc')}
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
          {t('help.mockup_flow_footer')}
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Realism Radar Mockup
 */
export function RealismRadarMockup() {
  const { t } = useTranslation();
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
      {/* Taste Star Octagon Preview */}
      <div style={{ textAlign: 'center', minWidth: '140px' }}>
        <div style={{ position: 'relative', width: '96px', height: '96px', margin: '0 auto' }}>
          <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
            <polygon
              points="48,8 76,20 88,48 76,76 48,88 20,76 8,48 20,20"
              stroke="var(--color-border, #E2D9CC)"
              strokeWidth="1.5"
              fill="none"
            />
            <polygon
              points="48,22 66,30 74,48 66,66 48,74 30,66 22,48 30,30"
              stroke="var(--color-border, #E2D9CC)"
              strokeWidth="1"
              fill="none"
            />
            <polygon
              points="48,14 70,28 79,48 65,68 48,78 26,64 16,48 32,26"
              fill="rgba(27, 143, 166, 0.18)"
              stroke="var(--color-ocean, #1B8FA6)"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
          {t('help.mockup_taste_star_axes')}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
          {t('help.mockup_learned_from_trips')}
        </div>
      </div>

      {/* Deterministic Solver Guardrails */}
      <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span>{t('help.mockup_guardrail_1_title')}</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>{t('help.mockup_guardrail_1_desc')}</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span>{t('help.mockup_guardrail_2_title')}</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>{t('help.mockup_guardrail_2_desc')}</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span>{t('help.mockup_guardrail_3_title')}</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>{t('help.mockup_guardrail_3_desc')}</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span>{t('help.mockup_guardrail_4_title')}</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>{t('help.mockup_guardrail_4_desc')}</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span>{t('help.mockup_guardrail_5_title')}</span>
          <span style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckSvgIcon size={12} color="var(--color-success, #1F7A4D)" />
            <span>{t('help.mockup_guardrail_5_desc')}</span>
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
  const { t } = useTranslation();
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>{t('help.mockup_total_trip_spend')}</span>
          <span style={{ marginLeft: '8px', color: 'var(--color-text-muted)' }}>{t('help.mockup_budget_ratio')}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--color-ocean, #1B8FA6)', color: '#FFF', fontWeight: 700, fontSize: '11px' }}>USD</span>
          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--color-surface-hover, rgba(0,0,0,0.05))', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px' }}>{t('help.mockup_add_expense')}</span>
          <span style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border, #E2D9CC)', color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '11px' }}>{t('help.mockup_export_csv')}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: '14px', borderRadius: '7px', background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.2))', display: 'flex', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ width: '42%', background: 'var(--color-deep-sea, #0F4C5C)' }} title={t('help.mockup_title_accommodation')} />
        <div style={{ width: '25%', background: 'var(--color-ocean, #1B8FA6)' }} title={t('help.mockup_title_food')} />
        <div style={{ width: '15%', background: 'var(--color-accent-gold, #E2B33C)' }} title={t('help.mockup_title_activities')} />
        <div style={{ width: '8%', background: 'var(--color-accent-coral, #D42A2F)' }} title={t('help.mockup_title_transit')} />
        <div style={{ width: '10%', background: 'transparent' }} title={t('help.mockup_title_buffer')} />
      </div>

      {/* Legend & Debt Settler */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-deep-sea, #0F4C5C)' }} />
          <span>{t('help.mockup_legend_hotel')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-ocean, #1B8FA6)' }} />
          <span>{t('help.mockup_legend_dining')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-accent-gold, #E2B33C)' }} />
          <span>{t('help.mockup_legend_sightseeing')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-accent-coral, #D42A2F)' }} />
          <span>{t('help.mockup_legend_buffer')}</span>
        </div>
      </div>

      <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '6px', background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span>
          {t('help.mockup_settle_up_row', { label: '__LBL__' })
            .split('__LBL__')
            .map((part, idx, arr) => (
              <React.Fragment key={idx}>
                {part}
                {idx < arr.length - 1 && <strong>{t('help.mockup_settle_up_label')}</strong>}
              </React.Fragment>
            ))}
        </span>
        <span style={{ color: 'var(--color-ocean, #1B8FA6)', fontWeight: 700 }}>{t('help.mockup_elena_owes_alex')}</span>
      </div>
    </div>
  );
}

/**
 * 5. Swarm Assistant Mockup
 */
export function SwarmAssistantMockup() {
  const { t } = useTranslation();
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
          {t('help.mockup_swarm_user_prompt')}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'var(--color-accent-gold-soft, rgba(226, 179, 60, 0.2))', color: '#B8860B', fontWeight: 700 }}>
              {t('help.mockup_confirmation_required')}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{t('help.mockup_paladio_agent')}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '10px', color: 'var(--color-text-muted)' }}>
            {t('help.mockup_expires_4_59')}
          </span>
        </div>
        <div style={{ color: 'var(--color-danger, #B3261E)', textDecoration: 'line-through', fontSize: '11px' }}>
          {t('help.mockup_swarm_removed')}
        </div>
        <div style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>
          {t('help.mockup_swarm_added_1')}
        </div>
        <div style={{ color: 'var(--color-success, #1F7A4D)', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>
          {t('help.mockup_swarm_added_2')}
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
            <span>{t('help.mockup_approve_change')}</span>
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
            {t('help.mockup_reject')}
          </button>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
        {t('help.mockup_swarm_footer')}
      </div>
    </div>
  );
}

/**
 * 6. GTFS Transit Routing Mockup
 */
export function TransitRoutingMockup() {
  const { t } = useTranslation();
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--color-surface-raised, #FFFFFF)', padding: '3px', borderRadius: '8px', border: '1px solid var(--color-border, #E2D9CC)' }}>
          <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--color-ocean, #1B8FA6)', color: '#FFF', fontWeight: 700, fontSize: '11px' }}>{t('help.mockup_transit_directions')}</span>
          <span style={{ padding: '4px 10px', borderRadius: '6px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px' }}>{t('help.mockup_transit_lines')}</span>
          <span style={{ padding: '4px 10px', borderRadius: '6px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px' }}>{t('help.mockup_transit_nearby')}</span>
        </div>
        <span style={{ padding: '3px 9px', borderRadius: '9999px', background: 'rgba(27, 143, 166, 0.12)', color: 'var(--color-ocean, #1B8FA6)', fontWeight: 700, fontSize: '10px' }}>
          {t('help.mockup_area_filter_on')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--color-deep-sea, #0F4C5C)', color: '#FFF', fontSize: '10px', fontWeight: 700 }}>{t('help.mockup_mode_metro')}</span>
        <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--color-deep-sea, #0F4C5C)', color: '#FFF', fontSize: '10px', fontWeight: 700 }}>{t('help.mockup_mode_rail')}</span>
        <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', color: 'var(--color-text-muted)', fontSize: '10px', fontWeight: 600 }}>{t('help.mockup_mode_tram')}</span>
        <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', color: 'var(--color-text-muted)', fontSize: '10px', fontWeight: 600 }}>{t('help.mockup_mode_bus')}</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{t('help.mockup_depart_1415')}</span>
      </div>

      <div style={{ background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-accent-coral, #D42A2F)', color: '#FFF', fontSize: '10px', marginRight: '6px' }}>G</span>
            {t('help.mockup_ginza_line')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {t('help.mockup_gtfs_leg_desc')}
          </div>
        </div>
        <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(31, 122, 77, 0.12)', color: 'var(--color-success, #1F7A4D)', fontWeight: 700, fontSize: '10px' }}>
          {t('help.mockup_get_directions')}
        </span>
      </div>
    </div>
  );
}

/**
 * 7. Wallet Passbook Mockup
 */
export function WalletPassbookMockup() {
  const { t } = useTranslation();
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, color: 'var(--color-text-primary)' }}>{t('help.mockup_total_tickets_4')}</span>
          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(27, 143, 166, 0.12)', color: 'var(--color-ocean, #1B8FA6)', fontWeight: 700 }}>{t('help.mockup_ticket_categories_summary')}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--color-ocean, #1B8FA6)', color: 'var(--color-ocean, #1B8FA6)', fontWeight: 700, fontSize: '10px' }}>{t('help.mockup_sync_itinerary')}</span>
          <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--color-ocean, #1B8FA6)', color: '#FFF', fontWeight: 700, fontSize: '10px' }}>{t('help.mockup_add_pass')}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
        <div style={{ background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent-coral, #D42A2F)' }}>{t('help.mockup_up_next_flight')}</div>
          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>{t('help.mockup_mad_hnd_pass')}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{t('help.mockup_pnr_details')}</div>
        </div>
        <div style={{ background: 'var(--color-surface-hover, rgba(15, 76, 92, 0.04))', border: '1px dashed var(--color-ocean, #1B8FA6)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-ocean, #1B8FA6)', fontSize: '11px' }}>{t('help.mockup_wallet_dropzone')}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {t('help.mockup_dropzone_hint')}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 8. Route Price & Tariff Telemetry Mockup
 */
export function RouteMonitoringMockup() {
  const { t } = useTranslation();
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <div style={{ background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('help.mockup_monitored_routes')}</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-text-primary)' }}>6</div>
        </div>
        <div style={{ background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('help.mockup_open_deal_alerts')}</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-success, #1F7A4D)' }}>{t('help.mockup_2_below_p10')}</div>
        </div>
        <div style={{ background: 'var(--color-surface-raised, #FFFFFF)', border: '1px solid var(--color-border, #E2D9CC)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('help.mockup_average_savings')}</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-ocean, #1B8FA6)' }}>{t('help.mockup_27_vs_median')}</div>
        </div>
      </div>

      <div style={{ background: 'var(--color-surface-raised, #FFFFFF)', border: '1.5px solid var(--color-success, #1F7A4D)', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(31, 122, 77, 0.14)', color: 'var(--color-success, #1F7A4D)', fontWeight: 700 }}>
            {t('help.mockup_verified_deal_found')}
          </span>
          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
            {t('help.mockup_route_deal_headline', { median: '__MED__' })
              .split('__MED__')
              .map((part, idx, arr) => (
                <React.Fragment key={idx}>
                  {part}
                  {idx < arr.length - 1 && (
                    <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>
                      {t('help.mockup_route_median')}
                    </span>
                  )}
                </React.Fragment>
              ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ padding: '5px 9px', borderRadius: '6px', border: '1px solid var(--color-border, #E2D9CC)', color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 600 }}>{t('help.mockup_discard_offer')}</span>
          <span style={{ padding: '5px 9px', borderRadius: '6px', background: 'var(--color-success, #1F7A4D)', color: '#FFF', fontSize: '11px', fontWeight: 700 }}>{t('help.mockup_make_it_trip')}</span>
        </div>
      </div>
    </div>
  );
}
