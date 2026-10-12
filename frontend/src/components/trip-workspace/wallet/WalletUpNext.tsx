"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { SecretField } from './parts/SecretField';
import { CopyButton } from './parts/CopyButton';
import { formatTicketDateTime } from '@/lib/wallet/format';
import { SearchIcon } from '@/components/icons';

interface WalletUpNextProps {
  tickets: TripTicket[];
  onViewDetail: (ticket: TripTicket) => void;
}

export function WalletUpNext({ tickets, onViewDetail }: WalletUpNextProps) {
  const upcomingTickets = tickets
    .filter((t) => t.status !== 'used' && t.status !== 'cancelled' && t.start_time)
    .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime());

  const nextTicket = upcomingTickets[0];
  if (!nextTicket) return null;

  const typeConfig = TICKET_TYPE_CONFIG[nextTicket.ticket_type] || TICKET_TYPE_CONFIG.other;

  return (
    <aside
      aria-label="Next upcoming credential"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: 'var(--shadow-sm)',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div
          style={{
            background: typeConfig.accentBg,
            border: `1px solid ${typeConfig.accentBorder}`,
            borderRadius: '10px',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {typeConfig.renderIcon({ size: 24, color: typeConfig.accentColor })}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                color: 'var(--color-accent-primary)',
                background: 'rgba(15, 76, 92, 0.12)',
                border: '1px solid var(--color-accent-primary)',
                padding: '2px 6px',
                borderRadius: '4px',
                letterSpacing: '0.5px',
              }}
            >
              UP NEXT
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {formatTicketDateTime(nextTicket.start_time, nextTicket.start_tz)}
            </span>
          </div>

          <h4
            className="font-display"
            style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-display, "Jost", sans-serif)', color: 'var(--color-text-main)', margin: '4px 0 0 0' }}
          >
            {nextTicket.title}
          </h4>

          {nextTicket.location_or_venue && (
            <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {nextTicket.location_or_venue}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {nextTicket.seat_or_room && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>ASSIGNMENT</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)' }}>
              {nextTicket.seat_or_room}
            </div>
          </div>
        )}

        {nextTicket.access_code && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-accent-secondary)', fontWeight: 700 }}>DOOR CODE</div>
            <SecretField value={nextTicket.access_code} highlight />
          </div>
        )}

        {nextTicket.booking_reference && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>PNR / REF</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                {nextTicket.booking_reference}
              </span>
              <CopyButton value={nextTicket.booking_reference} />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => onViewDetail(nextTicket)}
          aria-label={`Open fullscreen view for ${nextTicket.title}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '6px',
            padding: '8px 14px',
            color: 'var(--color-text-main)',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: 700,
            boxShadow: 'var(--shadow-sm)',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
        >
          <SearchIcon size={12} color="var(--color-accent-primary, #1E3A8A)" />
          <span>VIEW PASS</span>
        </button>
      </div>
    </aside>
  );
}
