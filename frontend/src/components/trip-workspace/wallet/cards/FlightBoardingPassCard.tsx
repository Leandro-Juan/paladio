"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { CopyButton } from '../parts/CopyButton';
import { PlaneIcon, ChevronRightIcon } from '@/components/icons';
import { formatTicketDateTime, calculateDuration } from '@/lib/wallet/format';

interface FlightBoardingPassCardProps {
  ticket: TripTicket;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
  onAttachFile?: (ticket: TripTicket) => void;
}

export function FlightBoardingPassCard({
  ticket,
  onEdit,
  onDelete,
  onViewDetail,
  onAttachFile,
}: FlightBoardingPassCardProps) {
  const { t, locale } = useTranslation();
  const meta = ticket.metadata || {};
  const originIata = (meta.origin_iata as string) || t('wallet.departure');
  const destIata = (meta.destination_iata as string) || t('wallet.arrival');
  const flightNumber = (meta.flight_number as string) || ticket.provider || '';
  const terminal = (meta.terminal as string) || null;
  const gate = (meta.gate as string) || null;
  const seat = ticket.seat_or_room || (meta.seat as string) || '--';
  const cabinClass = (meta.cabin_class as string) || t('wallet.cabin_economy');

  const duration = calculateDuration(ticket.start_time, ticket.end_time, ticket.start_tz, ticket.end_tz, locale);

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
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)', fontWeight: 600 }}>
                {t('wallet.pnr_prefix', { code: ticket.reference_code })}
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
              border: '1px dashed var(--color-border, #CBD5E1)',
              borderRadius: '6px',
              width: '100%',
              minHeight: '110px',
            }}
          >
            <PlaneIcon size={20} color="#0284C7" />
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)', lineHeight: 1.2 }}
            >
              {t('wallet.no_boarding_pass')}
            </span>
            {onAttachFile && (
              <button
                type="button"
                onClick={() => onAttachFile(ticket)}
                style={{
                  marginTop: '4px',
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                  color: '#0284C7',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t('wallet.attach_pass_btn')}
              </button>
            )}
          </div>
        )
      }
    >
      {/* Flight Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#0284C7' }}>
            {flightNumber}
          </span>
          {ticket.holder_name && (
            <span className="font-mono text-muted" style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
              · {ticket.holder_name}
            </span>
          )}
        </div>
        {ticket.reference_code && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
              {t('wallet.pnr_label')}
            </span>
            <CopyButton value={ticket.reference_code} label={ticket.reference_code} />
          </div>
        )}
      </div>

      {/* Main Airports Route Section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            className="font-display"
            style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '0.5px' }}
          >
            {originIata}
          </div>
          <div
            className="font-mono"
            style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', fontWeight: 600, letterSpacing: '0.5px' }}
          >
            {t('wallet.departure_label')}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRightIcon size={20} color="#0284C7" />
          </div>
          {duration && (
            <span
              className="font-mono"
              style={{
                fontSize: '10px',
                color: '#0369A1',
                background: '#F0F9FF',
                border: '1px solid #BAE6FD',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {duration}
            </span>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            className="font-display"
            style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '0.5px' }}
          >
            {destIata}
          </div>
          <div
            className="font-mono"
            style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', fontWeight: 600, letterSpacing: '0.5px' }}
          >
            {t('wallet.arrival_label')}
          </div>
        </div>
      </div>

      {/* Schedule Timestamps */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--color-border, #E2E8F0)',
          paddingTop: '0.5rem',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--color-text-muted, #64748B)',
        }}
      >
        <div>
          <span style={{ color: 'var(--color-text-muted, #64748B)' }}>{t('wallet.departure')}: </span>
          <span style={{ color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.start_time, ticket.start_tz, locale)}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted, #64748B)' }}>{t('wallet.arrival')}: </span>
          <span style={{ color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {formatTicketDateTime(ticket.end_time, ticket.end_tz, locale)}
          </span>
        </div>
      </div>

      {/* Flight Detail Badges: Gate, Terminal, Seat, Class */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          background: 'var(--color-surface-card, #F8FAFC)',
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid var(--color-border, #E2E8F0)',
          textAlign: 'center',
        }}
      >
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            {t('wallet.seat')}
          </div>
          <div className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 700 }}>
            {seat}
          </div>
        </div>
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            {t('wallet.gate')}
          </div>
          <div className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 700 }}>
            {gate || '--'}
          </div>
        </div>
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            {t('wallet.terminal_label')}
          </div>
          <div className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 700 }}>
            {terminal || '--'}
          </div>
        </div>
        <div>
          <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
            {t('wallet.class')}
          </div>
          <div className="font-mono" style={{ fontSize: '11px', color: '#0284C7', fontWeight: 600 }}>
            {cabinClass}
          </div>
        </div>
      </div>
    </TicketShell>
  );
}
