"use client";

import React from 'react';
import Link from 'next/link';
import { Trip } from '@/hooks/useTrips';
import { countWaypoints } from '@/utils/tripParser';
import { TripStatus, calculateTripDurationDays, downloadTripIcs } from '@/utils/calendarUtils';

interface MissionInspectorModalProps {
  isOpen: boolean;
  trip: Trip | null;
  status: TripStatus;
  onClose: () => void;
}

export function MissionInspectorModal({ isOpen, trip, status, onClose }: MissionInspectorModalProps) {
  if (!isOpen || !trip) return null;

  const durationDays = calculateTripDurationDays(trip.start_date, trip.end_date);
  const waypoints = countWaypoints(trip.itinerary_data);

  const statusConfig = {
    UPCOMING: {
      label: 'QUEUED PROTOCOL',
      bg: 'rgba(15, 76, 92, 0.1)',
      border: 'var(--color-accent-teal-soft)',
      text: 'var(--color-accent-primary)',
    },
    ACTIVE: {
      label: 'ACTIVE MISSION',
      bg: 'rgba(31, 122, 77, 0.12)',
      border: 'var(--color-success)',
      text: 'var(--color-success)',
    },
    COMPLETED: {
      label: 'COMPLETED ARCHIVE',
      bg: 'transparent',
      border: 'var(--color-border)',
      text: 'var(--color-text-muted)',
    },
  }[status];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(8, 28, 36, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="bg-surface border-subtle"
        style={{
          width: '100%',
          maxWidth: '480px',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <span
              className="font-mono"
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: statusConfig.bg,
                border: `1px solid ${statusConfig.border}`,
                color: statusConfig.text,
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              {statusConfig.label}
            </span>
            <h3 className="font-display" style={{ fontSize: '1.65rem', fontWeight: 300, marginTop: '0.5rem', marginBottom: 0, color: 'var(--color-text-primary)' }}>
              {trip.destination}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            padding: '1.25rem',
            background: 'var(--color-bg-main)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>TIMEFRAME</span>
            <p className="font-mono text-xs font-semibold" style={{ marginTop: '2px', color: 'var(--color-text-primary)' }}>
              {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
            </p>
          </div>
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>DURATION</span>
            <p className="font-mono text-xs font-semibold" style={{ marginTop: '2px', color: 'var(--color-text-primary)' }}>
              {durationDays} {durationDays === 1 ? 'DAY' : 'DAYS'}
            </p>
          </div>
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>WAYPOINTS / POIS</span>
            <p className="font-mono text-xs font-semibold" style={{ marginTop: '2px', color: 'var(--color-text-primary)' }}>
              {waypoints} OPTIMIZED STOPS
            </p>
          </div>
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>SYSTEM ID</span>
            <p className="font-mono text-muted text-xs" style={{ marginTop: '2px' }}>
              {trip.id ? trip.id.slice(0, 8) : 'EPHEMERAL'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {trip.id && (
            <Link
              href={`/vault/${trip.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--color-accent-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
            >
              VIEW FULL MISSION DOSSIER →
            </Link>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => downloadTripIcs(trip)}
              style={{
                flex: 1,
                padding: '0.6rem 1rem',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              EXPORT .ICS (CALENDAR)
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
