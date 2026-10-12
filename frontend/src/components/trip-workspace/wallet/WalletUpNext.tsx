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
        background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)',
        border: `1px solid ${typeConfig.accentBorder}`,
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
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
                color: '#1E3A8A',
                background: '#DBEAFE',
                border: '1px solid #BFDBFE',
                padding: '2px 6px',
                borderRadius: '4px',
                letterSpacing: '0.5px',
              }}
            >
              UP NEXT
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
              {formatTicketDateTime(nextTicket.start_time, nextTicket.start_tz)}
            </span>
          </div>

          <h4
            className="font-display"
            style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: '4px 0 0 0' }}
          >
            {nextTicket.title}
          </h4>

          {nextTicket.location_or_venue && (
            <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
              {nextTicket.location_or_venue}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {nextTicket.seat_or_room && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>ASSIGNMENT</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
              {nextTicket.seat_or_room}
            </div>
          </div>
        )}

        {nextTicket.access_code && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: '#B45309', fontWeight: 700 }}>DOOR CODE</div>
            <SecretField value={nextTicket.access_code} highlight />
          </div>
        )}

        {nextTicket.booking_reference && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>PNR / REF</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
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
            background: '#FFFFFF',
            border: '1px solid var(--color-border, #CBD5E1)',
            borderRadius: '6px',
            padding: '8px 14px',
            color: 'var(--color-text-primary, #0F172A)',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: 700,
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
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
