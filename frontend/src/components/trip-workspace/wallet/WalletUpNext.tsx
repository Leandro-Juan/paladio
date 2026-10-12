"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { SecretField } from './parts/SecretField';
import { CopyButton } from './parts/CopyButton';
import { formatTicketDateTime } from '@/lib/wallet/format';

interface WalletUpNextProps {
  tickets: TripTicket[];
  onViewDetail: (ticket: TripTicket) => void;
}

export function WalletUpNext({ tickets, onViewDetail }: WalletUpNextProps) {
  // Find the next upcoming ticket:
  // Must not be used or cancelled; sorted by start_time ascending
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
        background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.35) 0%, rgba(15, 23, 42, 0.75) 100%)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${typeConfig.accentBorder}`,
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div
          style={{
            fontSize: '28px',
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
          {typeConfig.icon}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#93C5FD',
                background: 'rgba(59, 130, 246, 0.2)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              UP NEXT
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>
              {formatTicketDateTime(nextTicket.start_time!)}
            </span>
          </div>

          <h3
            className="font-display"
            style={{ fontSize: '1.2rem', fontWeight: 700, color: '#FFF', margin: '3px 0 0 0' }}
          >
            {nextTicket.title}
          </h3>

          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#CBD5E1', marginTop: '3px' }}>
            {nextTicket.seat_or_room && <span>Seat/Room: {nextTicket.seat_or_room}</span>}
            {nextTicket.booking_reference && <span>Ref: {nextTicket.booking_reference}</span>}
          </div>
        </div>
      </div>

      {/* Quick Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {nextTicket.access_code && (
          <SecretField value={nextTicket.access_code} label="Access PIN" />
        )}

        {nextTicket.booking_reference && (
          <CopyButton text={nextTicket.booking_reference} label="Copy Ref" size="sm" />
        )}

        <button
          type="button"
          onClick={() => onViewDetail(nextTicket)}
          style={{
            background: '#2563EB',
            border: '1px solid #3B82F6',
            borderRadius: '6px',
            padding: '7px 14px',
            fontSize: '11px',
            color: '#FFFFFF',
            cursor: 'pointer',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🔍</span>
          <span>VIEW PASS</span>
        </button>
      </div>
    </aside>
  );
}
