"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { SecretField } from '../parts/SecretField';
import { CopyButton } from '../parts/CopyButton';
import { CodeRenderer } from '../codes/CodeRenderer';
import { HotelIcon, KeyIcon, WifiIcon, PhoneIcon, PinIcon } from '@/components/icons';
import { formatTicketDateTime } from '@/lib/wallet/format';

interface HotelAccessCardProps {
  ticket: TripTicket;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
  onAttachFile?: (ticket: TripTicket) => void;
}

export function HotelAccessCard({
  ticket,
  onEdit,
  onDelete,
  onViewDetail,
}: HotelAccessCardProps) {
  const meta = ticket.metadata || {};
  const room = ticket.seat_or_room || (meta.room_number as string) || '--';
  const address = (meta.address as string) || ticket.location_or_venue || '';
  const wifiSsid = (meta.wifi_ssid as string) || '';
  const wifiPass = (meta.wifi_password as string) || '';
  const phone = (meta.phone as string) || '';

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
            <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
              ROOM {room}
            </span>
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
              border: '1px dashed #FDE68A',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <HotelIcon size={22} color="#D97706" />
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: '#B45309', fontWeight: 600, lineHeight: 1.2 }}
            >
              DIGITAL ROOM KEY
            </span>
            <span className="font-mono" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
              ROOM {room}
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
            style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: 0 }}
          >
            {ticket.title}
          </h4>
          {address && (
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
              {address}
            </p>
          )}
        </div>
      </div>

      {/* Prominent Access Code / PIN Box */}
      <div
        style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
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
          <KeyIcon size={18} color="#D97706" />
          <div>
            <div className="font-mono" style={{ fontSize: '10px', color: '#B45309', fontWeight: 700 }}>
              DOOR / ACCESS CODE
            </div>
            {ticket.access_code ? (
              <SecretField value={ticket.access_code} highlight />
            ) : (
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
                No key code set
              </span>
            )}
          </div>
        </div>

        {ticket.reference_code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
              CONF:
            </span>
            <CopyButton value={ticket.reference_code} label={ticket.reference_code} />
          </div>
        )}
      </div>

      {/* Check-in / Check-out Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          background: 'var(--color-surface-card, #F8FAFC)',
          border: '1px solid var(--color-border, #E2E8F0)',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            CHECK-IN
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.start_time, ticket.start_tz)}
          </div>
        </div>

        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            CHECK-OUT
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.end_time, ticket.end_tz)}
          </div>
        </div>

        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            ROOM
          </div>
          <div className="font-mono" style={{ fontSize: '13px', color: '#D97706', fontWeight: 700 }}>
            {room}
          </div>
        </div>
      </div>

      {/* Wi-Fi & Support Section if present */}
      {(wifiSsid || phone) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--color-text-muted, #64748B)',
            paddingTop: '4px',
            borderTop: '1px solid var(--color-border, #E2E8F0)',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {wifiSsid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <WifiIcon size={13} color="var(--color-text-muted, #64748B)" />
              <span>{wifiSsid}</span>
              {wifiPass && <SecretField value={wifiPass} label="pwd" />}
            </div>
          )}
          {phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PhoneIcon size={12} color="var(--color-text-muted, #64748B)" />
              <span>{phone}</span>
            </div>
          )}
        </div>
      )}
    </TicketShell>
  );
}
