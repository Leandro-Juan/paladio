"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { CopyButton } from '../parts/CopyButton';
import { formatTicketDateTime } from '@/lib/wallet/format';

interface GenericTicketCardProps {
  ticket: TripTicket;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
  onAttachFile?: (ticket: TripTicket) => void;
}

export function GenericTicketCard({
  ticket,
  onEdit,
  onDelete,
  onViewDetail,
  onAttachFile,
}: GenericTicketCardProps) {
  const meta = ticket.metadata || {};
  const provider = ticket.provider || (meta.provider as string) || '';
  const venueOrLocation = ticket.location_or_venue || (meta.venue as string) || (meta.address as string) || '';
  const priceDisplay = ticket.price != null ? `${ticket.price.toFixed(2)} ${ticket.currency || 'EUR'}` : null;

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
              border: '1px dashed rgba(148, 163, 184, 0.3)',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <span style={{ fontSize: '20px' }}>📄</span>
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, lineHeight: 1.2 }}
            >
              VOUCHER PASS
            </span>
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
                  color: '#CBD5E1',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                + ATTACH DOC
              </button>
            )}
          </div>
        )
      }
    >
      {/* Header: Provider & Title */}
      <div>
        {provider && (
          <span
            className="font-mono"
            style={{ fontSize: '11px', color: '#94A3B8', letterSpacing: '0.5px', fontWeight: 600 }}
          >
            {provider.toUpperCase()}
          </span>
        )}
        <h4
          className="font-display"
          style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: '2px 0 0 0' }}
        >
          {ticket.title}
        </h4>
        {venueOrLocation && (
          <p
            className="font-mono text-muted"
            style={{ fontSize: '11px', color: '#CBD5E1', margin: '3px 0 0 0' }}
          >
            📍 {venueOrLocation}
          </p>
        )}
      </div>

      {/* Date & Time info if available */}
      {(ticket.start_time || ticket.end_time) && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>VALIDITY / SCHEDULE</div>
            <div className="font-mono" style={{ fontSize: '12px', color: '#E2E8F0', fontWeight: 600 }}>
              {ticket.start_time ? formatTicketDateTime(ticket.start_time) : 'Open'}
              {ticket.end_time ? ` → ${formatTicketDateTime(ticket.end_time)}` : ''}
            </div>
          </div>
          {priceDisplay && (
            <span
              className="font-mono"
              style={{
                fontSize: '11px',
                color: '#94A3B8',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {priceDisplay}
            </span>
          )}
        </div>
      )}

      {/* Booking reference or Code */}
      {ticket.booking_reference && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>CONFIRMATION REF</div>
            <span className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#FFF' }}>
              {ticket.booking_reference}
            </span>
          </div>
          <CopyButton text={ticket.booking_reference} label="Copy reference code" size="sm" />
        </div>
      )}

      {/* Notes if provided */}
      {ticket.notes && (
        <p
          className="font-mono"
          style={{
            fontSize: '11px',
            color: '#94A3B8',
            margin: 0,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.4,
          }}
        >
          {ticket.notes}
        </p>
      )}

      {/* Attachments footer */}
      {ticket.attachments && ticket.attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
            color: '#94A3B8',
          }}
        >
          <span>📎</span>
          <span>
            {ticket.attachments.length} attachment{ticket.attachments.length > 1 ? 's' : ''} (
            {ticket.attachments.map((a) => a.original_filename).join(', ')})
          </span>
        </div>
      )}
    </TicketShell>
  );
}
