"use client";

import React from 'react';
import type { TripParticipant } from '@/hooks/useTrips';

interface PastTripParticipantsProps {
  participants?: TripParticipant[];
  fallbackUserName?: string | null;
}

export function PastTripParticipants({
  participants = [],
  fallbackUserName,
}: PastTripParticipantsProps) {
  // If no participants assigned, generate clean dynamic representation with current user
  const effectiveList: Array<{ id: string; name: string; role: string }> =
    participants.length > 0
      ? participants.map((p) => ({
          id: p.id,
          name: p.name || 'Traveler',
          role: p.role || 'member',
        }))
      : [
          {
            id: 'owner-default',
            name: fallbackUserName || 'Expedition Lead',
            role: 'organizer',
          },
        ];

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '1.15rem',
        boxShadow: 'var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.05))',
        border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          className="font-mono text-muted"
          style={{
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          MISSION CREW
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--color-accent-primary, #0F4C5C)',
            background: 'rgba(15, 76, 92, 0.08)',
            padding: '2px 7px',
            borderRadius: '999px',
          }}
        >
          {effectiveList.length} {effectiveList.length === 1 ? 'PERSON' : 'PEOPLE'}
        </span>
      </div>

      {/* Participant Rows */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        {effectiveList.map((p) => {
          const isOrganizer = p.role === 'organizer';
          const initial = p.name.charAt(0).toUpperCase();

          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '8px',
                background: 'var(--color-surface-hover, rgba(15, 76, 92, 0.03))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: isOrganizer
                      ? 'var(--color-accent-primary, #0F4C5C)'
                      : 'var(--color-surface-sunken, #CAD2D3)',
                    color: isOrganizer ? '#FFFFFF' : 'var(--color-text-primary, #1A2B32)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display, "Jost", sans-serif)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  {initial}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span
                    className="font-display"
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: 'var(--color-text-primary, #1A2B32)',
                      lineHeight: 1.2,
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    className="font-mono text-muted"
                    style={{
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    {isOrganizer ? 'Organizer' : 'Traveler'}
                  </span>
                </div>
              </div>

              {isOrganizer && (
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-accent-teal, #0F4C5C)',
                    background: 'rgba(15, 76, 92, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  HOST
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
