"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { CopyButton } from '../parts/CopyButton';
import { formatTicketDateTime, formatRelativeSlot } from '@/lib/wallet/format';

interface AttractionPassCardProps {
  ticket: TripTicket;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
  onAttachFile?: (ticket: TripTicket) => void;
}

export function AttractionPassCard({
  ticket,
  onEdit,
  onDelete,
  onViewDetail,
  onAttachFile,
}: AttractionPassCardProps) {
  const meta = ticket.metadata || {};
  const venue = (meta.venue as string) || ticket.location_or_venue || '';
  const ticketKind = (meta.ticket_kind as string) || 'General Admission';
  const quantity = (meta.quantity as number) || 1;
  const relativeSlot = formatRelativeSlot(ticket.start_time);

  return (
    <TicketShell
      ticket={ticket}
      onEdit={onEdit}
      onDelete={onDelete}
      onViewDetail={onViewDetail}
      stubContent={
        ticket.barcode_value ? (
          <CodeRenderer value={ticket.barcode_value} format={ticket.barcode_format || 'qr'} size={96} />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 4px',
              border: '1px dashed rgba(52, 211, 153, 0.3)',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <span style={{ fontSize: '20px' }}>🏛️</span>
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#6EE7B7', fontWeight: 600, lineHeight: 1.2 }}
            >
              MUSEUM / ENTRY PASS
            </span>
            {onAttachFile && (
              <button
                type="button"
                onClick={() => onAttachFile(ticket)}
                style={{
                  marginTop: '4px',
                  background: 'rgba(52, 211, 153, 0.15)',
                  border: '1px solid rgba(52, 211, 153, 0.35)',
                  color: '#34D399',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                + ATTACH TICKET
              </button>
            )}
          </div>
        )
      }
    >
      {/* Title & Entry Time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4
            className="font-display"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}
          >
            {ticket.title}
          </h4>
          {venue && (
            <p
              className="font-mono text-muted"
              style={{ fontSize: '11px', color: '#CBD5E1', margin: '2px 0 0 0' }}
            >
              📍 {venue}
            </p>
          )}
        </div>

        {ticket.reference_code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="font-mono" style={{ fontSize: '10px', color: '#CBD5E1' }}>
              REF:
            </span>
            <CopyButton value={ticket.reference_code} label={ticket.reference_code} />
          </div>
        )}
      </div>

      {/* Entry Window & Timing */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.4)',
          padding: '0.6rem 0.85rem',
          borderRadius: '6px',
          border: '1px solid rgba(52, 211, 153, 0.25)',
        }}
      >
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: '#94A3B8' }}>
            ENTRY SLOT / TIME
          </div>
          <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#34D399' }}>
            {formatTicketDateTime(ticket.start_time, ticket.start_tz)}
          </div>
        </div>

        {relativeSlot && (
          <span
            className="font-mono"
            style={{
              fontSize: '11px',
              color: '#10B981',
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            {relativeSlot}
          </span>
        )}
      </div>

      {/* Ticket Details Badges */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingTop: '0.4rem',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          color: '#CBD5E1',
        }}
      >
        <span>TYPE: {ticketKind}</span>
        <span>PASSENGERS / QTY: {quantity}</span>
        {ticket.price != null && (
          <span style={{ color: '#34D399', fontWeight: 600 }}>
            {ticket.price.toFixed(2)} {ticket.currency || 'EUR'}
          </span>
        )}
      </div>
    </TicketShell>
  );
}
