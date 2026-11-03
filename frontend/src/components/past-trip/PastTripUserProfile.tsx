"use client";

import React from 'react';
import type { TripParticipant } from '@/hooks/useTrips';

interface PastTripUserProfileProps {
  primaryParticipant?: TripParticipant | null;
  currentUsername?: string | null;
  totalWaypoints: number;
  totalDays: number;
}

export function PastTripUserProfile({
  primaryParticipant,
  currentUsername,
  totalWaypoints,
  totalDays,
}: PastTripUserProfileProps) {
  const displayName =
    primaryParticipant?.name || currentUsername || 'Expedition Lead';
  const roleLabel =
    primaryParticipant?.role === 'organizer'
      ? 'Mission Commander'
      : 'Sovereign Explorer';

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '1.25rem 1rem 1rem',
      }}
    >
      {/* Avatar with Japanese Minimalist halo ring */}
      <div
        style={{
          position: 'relative',
          width: '76px',
          height: '76px',
          marginBottom: '0.75rem',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '-6px',
            borderRadius: '50%',
            border: '2px dashed var(--color-accent-teal-soft, #7CC4D1)',
            opacity: 0.8,
            animation: 'spinSlow 20s linear infinite',
          }}
          aria-hidden="true"
        />
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-accent-primary, #0F4C5C) 0%, var(--color-accent-teal-mid, #1B8FA6) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontFamily: 'var(--font-display, "Jost", sans-serif)',
            fontSize: '1.75rem',
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(15, 76, 92, 0.25)',
          }}
        >
          {initial}
        </div>
      </div>

      {/* Name and title */}
      <h3
        className="font-display"
        style={{
          fontSize: '1.05rem',
          fontWeight: 700,
          color: 'var(--color-text-primary, #1A2B32)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}
      >
        {displayName}
      </h3>
      <span
        className="font-mono"
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-text-muted, #566B76)',
          marginTop: '2px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {roleLabel}
      </span>

      {/* Metric badges (matching mockup 2-column layout) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          marginTop: '1.25rem',
          width: '100%',
          maxWidth: '220px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'rgba(31, 122, 77, 0.12)',
              color: 'var(--color-success, #1F7A4D)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '4px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 15l-2 5l-1-2l-2-1l5-2z" />
              <circle cx="12" cy="8" r="7" />
            </svg>
          </div>
          <span
            className="font-display"
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--color-text-primary, #1A2B32)',
              lineHeight: 1,
            }}
          >
            {totalDays}
          </span>
          <span
            className="font-mono text-muted"
            style={{
              fontSize: '0.68rem',
              marginTop: '2px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            {totalDays === 1 ? 'Day' : 'Days'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'rgba(226, 179, 60, 0.16)',
              color: 'var(--color-accent-gold, #E2B33C)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '4px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <span
            className="font-display"
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--color-text-primary, #1A2B32)',
              lineHeight: 1,
            }}
          >
            {totalWaypoints}
          </span>
          <span
            className="font-mono text-muted"
            style={{
              fontSize: '0.68rem',
              marginTop: '2px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            Waypoints
          </span>
        </div>
      </div>
    </div>
  );
}
