"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { CopyButton } from '../parts/CopyButton';
import { formatTicketDateTime, formatTicketDate, formatRelativeSlot } from '@/lib/wallet/format';

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
  const originStation = (meta.origin_station as string) || (meta.origin as string) || '';
  const destStation = (meta.destination_station as string) || (meta.destination as string) || '';
  const lineOrTrain = (meta.line_or_train as string) || (meta.service_number as string) || '';
  const coach = (meta.coach as string) || '';
  const seat = ticket.seat_or_room || (meta.seat as string) || '';
  const platform = (meta.platform as string) || '';
  const operator = ticket.provider || (meta.operator as string) || 'Transit Operator';
  const isPass = (meta.is_pass as boolean) || ticket.title.toLowerCase().includes('pass');
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
              border: '1px dashed rgba(167, 139, 250, 0.35)',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <span style={{ fontSize: '20px' }}>🚆</span>
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#DDD6FE', fontWeight: 600, lineHeight: 1.2 }}
            >
              TRANSIT PASS
            </span>
            {lineOrTrain && (
              <span className="font-mono" style={{ fontSize: '9px', color: '#CBD5E1' }}>
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
                  color: '#C4B5FD',
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
            style={{ fontSize: '11px', color: '#DDD6FE', letterSpacing: '0.5px', fontWeight: 600 }}
          >
            {operator.toUpperCase()}
          </span>
          <h4
            className="font-display"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: '2px 0 0 0' }}
          >
            {ticket.title}
          </h4>
        </div>
        {lineOrTrain && (
          <span
            className="font-mono"
            style={{
              fontSize: '11px',
              background: 'rgba(167, 139, 250, 0.15)',
              border: '1px solid rgba(167, 139, 250, 0.3)',
              color: '#DDD6FE',
              padding: '3px 8px',
              borderRadius: '4px',
              fontWeight: 700,
            }}
          >
            {lineOrTrain}
          </span>
        )}
      </div>

      {/* Origin -> Destination Route or Pass Window */}
      {originStation || destStation ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ flex: 1 }}>
            <div className="font-mono text-muted" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>
              DEPARTURE
            </div>
            <div className="font-display" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFF' }}>
              {originStation || 'ORIGIN'}
            </div>
            {ticket.start_time && (
              <div className="font-mono" style={{ fontSize: '11px', color: '#DDD6FE', marginTop: '2px' }}>
                {formatTicketDateTime(ticket.start_time, ticket.departure_tz || undefined)}
              </div>
            )}
          </div>

          <div style={{ padding: '0 12px', color: '#A78BFA', fontSize: '18px', fontWeight: 700 }}>
            &rarr;
          </div>

          <div style={{ flex: 1, textAlign: 'right' }}>
            <div className="font-mono text-muted" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>
              ARRIVAL
            </div>
            <div className="font-display" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFF' }}>
              {destStation || 'DESTINATION'}
            </div>
            {ticket.end_time && (
              <div className="font-mono" style={{ fontSize: '11px', color: '#DDD6FE', marginTop: '2px' }}>
                {formatTicketDateTime(ticket.end_time, ticket.arrival_tz || undefined)}
              </div>
            )}
          </div>
        </div>
      ) : isPass && (ticket.start_time || ticket.end_time) ? (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>VALIDITY WINDOW</div>
            <div className="font-mono" style={{ fontSize: '12px', color: '#DDD6FE', fontWeight: 600 }}>
              {ticket.start_time ? formatTicketDate(ticket.start_time) : 'Start'}
              {ticket.end_time ? ` → ${formatTicketDate(ticket.end_time)}` : ''}
            </div>
          </div>
          {relativeSlot && (
            <span
              className="font-mono"
              style={{
                fontSize: '10px',
                color: '#A78BFA',
                background: 'rgba(167, 139, 250, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {relativeSlot}
            </span>
          )}
        </div>
      ) : null}

      {/* Grid: Coach, Seat, Platform, Reference */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '0.6rem 0.8rem',
        }}
      >
        {coach && (
          <div>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>COACH</div>
            <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#FFF' }}>
              {coach}
            </div>
          </div>
        )}
        {seat && (
          <div>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>SEAT</div>
            <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#A78BFA' }}>
              {seat}
            </div>
          </div>
        )}
        {platform && (
          <div>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>PLATFORM</div>
            <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#FDE047' }}>
              {platform}
            </div>
          </div>
        )}
        {ticket.booking_reference && (
          <div style={{ gridColumn: coach && seat && platform ? 'span 2' : 'auto' }}>
            <div className="font-mono text-muted" style={{ fontSize: '9px' }}>TICKET REF</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#CBD5E1' }}>
                {ticket.booking_reference}
              </span>
              <CopyButton text={ticket.booking_reference} label="Copy ticket reference" size="sm" />
            </div>
          </div>
        )}
      </div>

      {/* Attachments / Notes footer */}
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
