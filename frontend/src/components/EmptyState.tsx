"use client";

import React from 'react';

export type EmptyStateType =
  | 'no-trips'
  | 'no-mission'
  | 'no-tickets'
  | 'no-photos'
  | 'no-notifications'
  | 'no-search';

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function EmptyStateSvg({ type }: { type: EmptyStateType }) {
  switch (type) {
    case 'no-trips':
      return (
        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto' }}
        >
          {/* Sun disc */}
          <circle cx="60" cy="30" r="18" fill="var(--color-accent-coral)" opacity="0.9" />
          {/* Fuji Silhouette */}
          <path d="M24 70 L48 38 L54 44 L60 36 L66 44 L72 38 L96 70 Z" fill="var(--color-accent-teal-mid)" />
          {/* Snow cap peak */}
          <path d="M48 38 L54 44 L60 36 L66 44 L72 38 L68 32 L52 32 Z" fill="var(--color-surface-card)" />
          {/* Wave / Base line */}
          <path
            d="M10 70 Q 30 66 50 70 T 90 70 T 110 70"
            stroke="var(--color-accent-teal-soft)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case 'no-mission':
      return (
        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto' }}
        >
          {/* Torii dispatch gate */}
          <path
            d="M30 32 C 45 28, 75 28, 90 32"
            stroke="var(--color-accent-coral)"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <line x1="36" y1="38" x2="84" y2="38" stroke="var(--color-accent-teal-mid)" strokeWidth="2.5" />
          <line x1="44" y1="34" x2="42" y2="68" stroke="var(--color-accent-teal-mid)" strokeWidth="3" strokeLinecap="round" />
          <line x1="76" y1="34" x2="78" y2="68" stroke="var(--color-accent-teal-mid)" strokeWidth="3" strokeLinecap="round" />
          {/* Sun disc framed inside */}
          <circle cx="60" cy="50" r="10" fill="var(--color-accent-coral)" opacity="0.85" />
          <line x1="20" y1="68" x2="100" y2="68" stroke="var(--color-border)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'no-tickets':
      return (
        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto' }}
        >
          {/* Perforated ticket card outline */}
          <rect
            x="25"
            y="24"
            width="70"
            height="44"
            rx="4"
            stroke="var(--color-border)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            fill="none"
          />
          {/* Origami crane silhouette */}
          <path d="M50 48 L60 28 L70 48 L60 42 Z" fill="var(--color-accent-teal-mid)" />
          <path d="M60 28 L52 36 L44 34 Z" fill="var(--color-accent-teal-soft)" />
          <path d="M60 42 L60 56 L68 50 Z" fill="var(--color-accent-teal-soft)" opacity="0.7" />
          <circle cx="75" cy="35" r="5" fill="var(--color-accent-coral)" />
        </svg>
      );

    case 'no-photos':
      return (
        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto' }}
        >
          {/* Viewfinder corner brackets */}
          <path d="M35 30 H28 V37" stroke="var(--color-accent-teal-soft)" strokeWidth="2" strokeLinecap="round" />
          <path d="M85 30 H92 V37" stroke="var(--color-accent-teal-soft)" strokeWidth="2" strokeLinecap="round" />
          <path d="M28 53 V60 H35" stroke="var(--color-accent-teal-soft)" strokeWidth="2" strokeLinecap="round" />
          <path d="M92 53 V60 H85" stroke="var(--color-accent-teal-soft)" strokeWidth="2" strokeLinecap="round" />
          {/* Landscape silhouette and sun */}
          <circle cx="70" cy="40" r="7" fill="var(--color-accent-coral)" opacity="0.9" />
          <path d="M40 58 L54 44 L62 52 L68 46 L78 58 Z" fill="var(--color-accent-teal-mid)" />
        </svg>
      );

    case 'no-notifications':
      return (
        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto' }}
        >
          <circle cx="76" cy="30" r="8" fill="var(--color-accent-coral)" opacity="0.85" />
          {/* Bonshō temple bell */}
          <path
            d="M50 25 C50 25 55 24 60 24 C65 24 70 25 70 25 C70 32 68 46 72 54 L48 54 C52 46 50 32 50 25 Z"
            fill="var(--color-accent-teal-mid)"
          />
          <rect x="46" y="54" width="28" height="4" rx="2" fill="var(--color-accent-teal-soft)" />
          <circle cx="60" cy="22" r="3" stroke="var(--color-accent-teal-soft)" strokeWidth="1.5" fill="none" />
          <circle cx="60" cy="44" r="3" fill="var(--color-accent-gold)" />
          <path
            d="M32 64 C 45 61, 75 61, 88 64"
            stroke="var(--color-border)"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case 'no-search':
      return (
        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', margin: '0 auto' }}
        >
          <circle cx="68" cy="34" r="8" fill="var(--color-accent-coral)" opacity="0.85" />
          <circle cx="56" cy="44" r="16" stroke="var(--color-accent-teal-mid)" strokeWidth="2.5" fill="none" />
          <line x1="68" y1="56" x2="80" y2="68" stroke="var(--color-accent-teal-mid)" strokeWidth="3" strokeLinecap="round" />
          <polygon points="56,33 58,44 56,42 54,44" fill="var(--color-accent-coral)" />
          <polygon points="56,55 58,44 56,46 54,44" fill="var(--color-accent-teal-soft)" />
        </svg>
      );
  }
}

const DEFAULTS: Record<EmptyStateType, { title: string; description: string }> = {
  'no-trips': {
    title: 'No Upcoming Trips',
    description: 'Plan a new multi-day journey or initialize an itinerary protocol.',
  },
  'no-mission': {
    title: 'No Active Protocol',
    description: 'Awaiting mission parameters. Initialize your dispatch to start.',
  },
  'no-tickets': {
    title: 'Your Trip Wallet is Empty',
    description: 'Drop documents above, sync from itinerary, or create credentials manually.',
  },
  'no-photos': {
    title: 'No Captured Memories',
    description: 'Photos attached to itinerary waypoints and notes will appear here.',
  },
  'no-notifications': {
    title: 'No Notifications Yet',
    description: 'Engine alerts, dispatch logs, and telemetry updates will appear here.',
  },
  'no-search': {
    title: 'No Matching Places Found',
    description: 'Try adjusting your search query or selecting a different category.',
  },
};

export function EmptyState({
  type,
  title,
  description,
  action,
  className = '',
  style,
}: EmptyStateProps) {
  const currentTitle = title ?? DEFAULTS[type].title;
  const currentDesc = description ?? DEFAULTS[type].description;

  return (
    <div
      className={`empty-state-card ${className}`}
      style={{
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        background: 'var(--color-surface-card)',
        border: '1px dashed var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg, 12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        ...style,
      }}
    >
      <EmptyStateSvg type={type} />
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <h3
          className="font-display"
          style={{
            margin: 0,
            fontSize: '1.15rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          {currentTitle}
        </h3>
        <p
          className="font-mono text-muted text-xs"
          style={{
            marginTop: '0.35rem',
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          {currentDesc}
        </p>
      </div>
      {action && <div style={{ marginTop: '0.25rem' }}>{action}</div>}
    </div>
  );
}
