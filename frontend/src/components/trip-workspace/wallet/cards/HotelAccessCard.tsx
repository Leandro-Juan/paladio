"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { SecretField } from '../parts/SecretField';
import { CodeRenderer } from '../codes/CodeRenderer';
import { formatTicketDate } from '@/lib/wallet/format';

interface HotelAccessCardProps {
  ticket: TripTicket;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
}

export function HotelAccessCard({ ticket, onEdit, onDelete, onViewDetail }: HotelAccessCardProps) {
  const meta = ticket.metadata || {};
  const address = (meta.address as string) || ticket.location_or_venue || '';
  const room = ticket.seat_or_room || (meta.room_type as string) || 'Standard Room';
  const wifiSsid = (meta.wifi_ssid as string) || null;
  const wifiPass = (meta.wifi_password as string) || null;
  const phone = (meta.phone as string) || null;

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
              border: '1px dashed rgba(251, 191, 36, 0.3)',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <span style={{ fontSize: '20px' }}>🏨</span>
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#FDE68A', fontWeight: 600, lineHeight: 1.2 }}
            >
              DIGITAL ROOM KEY
            </span>
            <span className="font-mono" style={{ fontSize: '9px', color: '#CBD5E1' }}>
              {room}
            </span>
          </div>
        )
      }
    >
      {/* Title & Provider */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4
            className="font-display"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}
          >
            {ticket.title}
          </h4>
          {address && (
            <p
              className="font-mono text-muted"
              style={{ fontSize: '11px', color: '#CBD5E1', margin: '2px 0 0 0' }}
            >
              📍 {address}
            </p>
          )}
        </div>
      </div>

      {/* Prominent Access Code / PIN Box */}
      <div
        style={{
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid rgba(251, 191, 36, 0.35)',
          borderRadius: '8px',
          padding: '0.65rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔑</span>
          <div>
            <div className="font-mono" style={{ fontSize: '10px', color: '#FBBF24', fontWeight: 700 }}>
              DOOR / ACCESS CODE
            </div>
            {ticket.access_code ? (
              <SecretField value={ticket.access_code} highlight />
            ) : (
              <span className="font-mono" style={{ fontSize: '11px', color: '#94A3B8' }}>
                No key code set
              </span>
            )}
          </div>
        </div>

        {ticket.seat_or_room && (
          <div style={{ textAlign: 'right' }}>
            <div className="font-mono text-muted" style={{ fontSize: '9px', color: '#CBD5E1' }}>
              ROOM / UNIT
            </div>
            <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
              {ticket.seat_or_room}
            </div>
          </div>
        )}
      </div>

      {/* Check-in & Check-out Dates */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingTop: '0.5rem',
        }}
      >
        <div>
          <span style={{ color: '#94A3B8' }}>CHECK-IN: </span>
          <span style={{ color: '#FFFFFF', fontWeight: 600 }}>
            {formatTicketDate(ticket.start_time, ticket.start_tz)}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: '#94A3B8' }}>CHECK-OUT: </span>
          <span style={{ color: '#FFFFFF', fontWeight: 600 }}>
            {formatTicketDate(ticket.end_time, ticket.end_tz)}
          </span>
        </div>
      </div>

      {/* Wi-Fi & Support Section if available */}
      {(wifiSsid || phone) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: 'var(--font-mono, monospace)',
            color: '#CBD5E1',
            background: 'rgba(15, 23, 42, 0.35)',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
        >
          {wifiSsid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📶 {wifiSsid}</span>
              {wifiPass && <SecretField value={wifiPass} label="Pass" />}
            </div>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              style={{ color: '#FBBF24', textDecoration: 'none', fontWeight: 600 }}
            >
              📞 {phone}
            </a>
          )}
        </div>
      )}
    </TicketShell>
  );
}
