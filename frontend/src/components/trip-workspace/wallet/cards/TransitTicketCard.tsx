"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { TransitIcon, PaperclipIcon } from '@/components/icons';
import { formatTicketDateTime } from '@/lib/wallet/format';

interface TransitTicketCardProps {
  ticket: TripTicket;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
  onAttachFile?: (ticket: TripTicket) => void;
}

export function TransitTicketCard({
  ticket,
  onEdit,
  onDelete,
  onViewDetail,
  onAttachFile,
}: TransitTicketCardProps) {
  const meta = ticket.metadata || {};
  const operator = (meta.operator as string) || ticket.provider || 'Transit';
  const lineOrTrain = (meta.line_or_train as string) || (meta.train_number as string) || '';
  const departurePlatform = (meta.departure_platform as string) || (meta.platform as string) || '';
  const carCoach = (meta.car_coach as string) || '';
  const seat = ticket.seat_or_room || (meta.seat as string) || '';
  const originStation = (meta.origin_station as string) || (meta.departure_station as string) || '';
  const destStation = (meta.destination_station as string) || (meta.arrival_station as string) || '';
  const tariffCategory = (meta.tariff_category as string) || 'Standard';

  return (
    <TicketShell
      ticket={ticket}
      onEdit={onEdit}
      onDelete={onDelete}
      onViewDetail={onViewDetail}
      stubContent={
        ticket.barcode_value ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                background: '#FFFFFF',
                padding: '4px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #CBD5E1)',
              }}
            >
              <CodeRenderer
                value={ticket.barcode_value}
                format={ticket.barcode_format || 'qr'}
                size={80}
              />
            </div>
            {ticket.reference_code && (
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
                REF: {ticket.reference_code}
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 4px',
              border: '1px dashed #DDD6FE',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <TransitIcon size={22} color="#7C3AED" />
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#6D28D9', fontWeight: 600, lineHeight: 1.2 }}
            >
              TRANSIT PASS
            </span>
            {lineOrTrain && (
              <span className="font-mono" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
                {lineOrTrain}
              </span>
            )}
            {onAttachFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAttachFile(ticket);
                }}
                className="font-mono hover:underline"
                style={{
                  fontSize: '9px',
                  color: '#7C3AED',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                + ATTACH TICKET
              </button>
            )}
          </div>
        )
      }
    >
      {/* Header: Operator & Service */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span
            className="font-mono"
            style={{ fontSize: '11px', color: '#7C3AED', letterSpacing: '0.5px', fontWeight: 600 }}
          >
            {operator.toUpperCase()}
          </span>
          <h4
            className="font-display"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: '2px 0 0 0' }}
          >
            {ticket.title}
          </h4>
        </div>
        {lineOrTrain && (
          <span
            className="font-mono"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#7C3AED',
              background: '#F5F3FF',
              border: '1px solid #DDD6FE',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            {lineOrTrain}
          </span>
        )}
      </div>

      {/* Origin -> Destination Route if available */}
      {(originStation || destStation) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--color-text-primary, #0F172A)',
            fontWeight: 600,
          }}
        >
          <span>{originStation || 'Origin'}</span>
          <span style={{ color: '#7C3AED' }}>&rarr;</span>
          <span>{destStation || 'Destination'}</span>
        </div>
      )}

      {/* Timetable Schedule Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
          background: 'var(--color-surface-card, #F8FAFC)',
          border: '1px solid var(--color-border, #E2E8F0)',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            DEPARTURE
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.start_time, ticket.start_tz)}
          </div>
        </div>

        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            ARRIVAL
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.end_time, ticket.end_tz)}
          </div>
        </div>
      </div>

      {/* Seat, Platform & Tariff Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px',
          textAlign: 'center',
        }}
      >
        {departurePlatform && (
          <div
            style={{
              background: 'var(--color-surface-card, #F8FAFC)',
              border: '1px solid var(--color-border, #E2E8F0)',
              borderRadius: '4px',
              padding: '4px',
            }}
          >
            <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
              PLATFORM
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 700 }}>
              {departurePlatform}
            </div>
          </div>
        )}

        {(carCoach || seat) && (
          <div
            style={{
              background: 'var(--color-surface-card, #F8FAFC)',
              border: '1px solid var(--color-border, #E2E8F0)',
              borderRadius: '4px',
              padding: '4px',
            }}
          >
            <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
              COACH / SEAT
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 700 }}>
              {[carCoach && `C:${carCoach}`, seat && `S:${seat}`].filter(Boolean).join(' ')}
            </div>
          </div>
        )}

        <div
          style={{
            background: 'var(--color-surface-card, #F8FAFC)',
            border: '1px solid var(--color-border, #E2E8F0)',
            borderRadius: '4px',
            padding: '4px',
          }}
        >
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            TARIFF
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>
            {tariffCategory}
          </div>
        </div>
      </div>

      {/* Attachment indicator if present */}
      {ticket.attachments && ticket.attachments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
          <PaperclipIcon size={12} color="var(--color-text-muted, #64748B)" />
          <span className="font-mono">ATTACHED DOCUMENT AVAILABLE</span>
        </div>
      )}
    </TicketShell>
  );
}
