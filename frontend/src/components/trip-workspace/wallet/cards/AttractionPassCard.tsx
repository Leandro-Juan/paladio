"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { CopyButton } from '../parts/CopyButton';
import { MuseumIcon, PinIcon } from '@/components/icons';
import { formatTicketDateTime } from '@/lib/wallet/format';

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
  const slot = (meta.time_slot as string) || null;
  const audioGuide = Boolean(meta.audio_guide_included);
  const queueSkip = Boolean(meta.skip_the_line);

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
              border: '1px dashed #A7F3D0',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <MuseumIcon size={22} color="#059669" />
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#047857', fontWeight: 600, lineHeight: 1.2 }}
            >
              MUSEUM / ENTRY PASS
            </span>
            {onAttachFile && (
              <button
                type="button"
                onClick={() => onAttachFile(ticket)}
                style={{
                  marginTop: '4px',
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  color: '#059669',
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
            style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0 }}
          >
            {ticket.title}
          </h4>
          {venue && (
            <p
              className="font-mono text-muted"
              style={{
                fontSize: '11px',
                color: 'var(--color-text-muted, #64748B)',
                margin: '2px 0 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <PinIcon size={12} color="var(--color-text-muted, #64748B)" />
              {venue}
            </p>
          )}
        </div>

        {ticket.reference_code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
              REF:
            </span>
            <CopyButton value={ticket.reference_code} label={ticket.reference_code} />
          </div>
        )}
      </div>

      {/* Entry Window & Timing */}
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
            VALID FROM / ENTRY
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.start_time, ticket.start_tz)}
          </div>
        </div>

        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            TIME SLOT / WINDOW
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
            {slot || (ticket.end_time ? formatTicketDateTime(ticket.end_time, ticket.end_tz) : 'OPEN ENTRY')}
          </div>
        </div>
      </div>

      {/* Perks / Inclusions Row */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {queueSkip && (
          <span
            className="font-mono"
            style={{
              fontSize: '10px',
              color: '#059669',
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            ✓ FAST-TRACK / SKIP LINE
          </span>
        )}
        {audioGuide && (
          <span
            className="font-mono"
            style={{
              fontSize: '10px',
              color: '#0284C7',
              background: '#F0F9FF',
              border: '1px solid #BAE6FD',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            ✓ AUDIO GUIDE INCLUDED
          </span>
        )}
      </div>
    </TicketShell>
  );
}
