"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { TripTicket } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { CodeRenderer } from '../codes/CodeRenderer';
import { SecretField } from '../parts/SecretField';
import { CopyButton } from '../parts/CopyButton';
import { formatTicketDateTime } from '@/lib/wallet/format';
import { TicketIcon, SunIcon, CloseIcon, PinIcon } from '@/components/icons';

interface TicketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: TripTicket | null;
  tickets?: TripTicket[];
  onSelectTicket?: (t: TripTicket) => void;
}

export function TicketDetailModal({
  isOpen,
  onClose,
  ticket,
  tickets = [],
  onSelectTicket,
}: TicketDetailModalProps) {
  const isMounted = useIsMounted();
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Keyboard navigation & Esc key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && tickets.length > 1 && onSelectTicket && ticket) {
        const idx = tickets.findIndex((t) => t.id === ticket.id);
        if (idx > 0) onSelectTicket(tickets[idx - 1]);
      } else if (e.key === 'ArrowRight' && tickets.length > 1 && onSelectTicket && ticket) {
        const idx = tickets.findIndex((t) => t.id === ticket.id);
        if (idx >= 0 && idx < tickets.length - 1) onSelectTicket(tickets[idx + 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, tickets, ticket, onClose, onSelectTicket]);

  // Screen Wake Lock API
  useEffect(() => {
    if (!isOpen) return;

    let wakeLockSentinel: WakeLockSentinel | null = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockSentinel = lock;
          setWakeLockActive(true);
        })
        .catch(() => {
          setWakeLockActive(false);
        });
    }

    return () => {
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
      setWakeLockActive(false);
    };
  }, [isOpen]);

  if (!isOpen || !ticket || !isMounted) return null;

  const typeConfig = TICKET_TYPE_CONFIG[ticket.ticket_type] || TICKET_TYPE_CONFIG.other;
  const meta = ticket.metadata || {};
  const currentIndex = tickets.findIndex((t) => t.id === ticket.id);

  let codeSection: React.ReactNode = (
    <div
      style={{
        border: '1px dashed var(--color-border, #CBD5E1)',
        borderRadius: '12px',
        padding: '2rem 1rem',
        textAlign: 'center',
        color: 'var(--color-text-muted, #64748B)',
        width: '100%',
        maxWidth: '340px',
        background: 'var(--color-surface-card, #F8FAFC)',
      }}
    >
      <div style={{ marginBottom: '8px' }}>
        <TicketIcon size={32} color="var(--color-text-muted, #64748B)" />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 600 }}>NO DIGITAL BARCODE ATTACHED</span>
    </div>
  );

  if (ticket.barcode_value) {
    codeSection = (
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--color-border, #CBD5E1)',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
          width: '100%',
          maxWidth: '340px',
        }}
      >
        <CodeRenderer
          value={ticket.barcode_value}
          format={ticket.barcode_format || 'qr'}
          size={220}
        />
        <span
          style={{
            marginTop: '10px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-text-muted, #64748B)',
            wordBreak: 'break-all',
            textAlign: 'center',
            maxWidth: '280px',
          }}
        >
          {ticket.barcode_value}
        </span>
      </div>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg, 0 25px 60px rgba(0, 0, 0, 0.25))',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {/* Top Header / Bar */}
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'var(--color-surface-subtle, var(--color-surface-card))',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: typeConfig.accentColor,
                background: typeConfig.accentBg,
                border: `1px solid ${typeConfig.accentBorder}`,
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {typeConfig.renderIcon({ size: 13, color: typeConfig.accentColor })}
              {typeConfig.tag}
            </span>
            {wakeLockActive && (
              <span
                title="Screen will stay awake"
                style={{
                  fontSize: '10px',
                  color: 'var(--color-success)',
                  background: 'rgba(5, 150, 105, 0.12)',
                  border: '1px solid var(--color-success)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                <SunIcon size={11} color="var(--color-success)" />
                AWAKE
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tickets.length > 1 && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {currentIndex + 1} / {tickets.length}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close fullscreen pass"
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '6px',
                color: 'var(--color-text-muted)',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <CloseIcon size={12} color="var(--color-text-muted)" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div
          style={{
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Main Title & Provider */}
          <div style={{ textAlign: 'center', width: '100%' }}>
            {ticket.provider && (
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', fontWeight: 600, letterSpacing: '0.5px' }}>
                {ticket.provider.toUpperCase()}
              </div>
            )}
            <h2
              className="font-display"
              style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: '4px 0 0 0' }}
            >
              {ticket.title}
            </h2>
            {ticket.location_or_venue && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-muted, #64748B)',
                  marginTop: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <PinIcon size={12} color="var(--color-text-muted, #64748B)" />
                {ticket.location_or_venue}
              </div>
            )}
          </div>

          {/* Barcode / QR display container */}
          <>{codeSection}</>

          {/* Key Credentials Grid */}
          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
              background: 'var(--color-surface-card, #F8FAFC)',
              border: '1px solid var(--color-border, #E2E8F0)',
              borderRadius: '10px',
              padding: '1rem',
            }}
          >
            {ticket.seat_or_room && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>SEAT / ROOM</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  {ticket.seat_or_room}
                </div>
              </div>
            )}

            {ticket.booking_reference && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>REFERENCE / PNR</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                    {ticket.booking_reference}
                  </span>
                  <CopyButton text={ticket.booking_reference} label="Copy PNR" size="sm" />
                </div>
              </div>
            )}

            {ticket.start_time && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>START / SCHEDULE</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>
                  {formatTicketDateTime(ticket.start_time, ticket.start_tz)}
                </div>
              </div>
            )}

            {ticket.end_time && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>END / EXPIRY</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>
                  {formatTicketDateTime(ticket.end_time, ticket.end_tz)}
                </div>
              </div>
            )}
          </div>

          {/* Wi-Fi if available */}
          {(Boolean(meta.wifi_ssid) || Boolean(meta.wifi_password)) && (
            <div
              style={{
                width: '100%',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#B45309', fontWeight: 700 }}>HOTEL WI-FI</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-primary, #0F172A)' }}>
                  SSID: {String(meta.wifi_ssid || '')}
                </div>
              </div>
              {Boolean(meta.wifi_password) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SecretField value={String(meta.wifi_password)} label="Wi-Fi Password" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Carousel Footer Arrows (if multiple) */}
        {tickets.length > 1 && onSelectTicket && (
          <div
            style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--color-surface-card, #F8FAFC)',
              borderTop: '1px solid var(--color-border, #E2E8F0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => onSelectTicket(tickets[currentIndex - 1])}
              style={{
                background: currentIndex <= 0 ? 'transparent' : '#FFFFFF',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: '6px',
                color: currentIndex <= 0 ? '#CBD5E1' : 'var(--color-text-primary, #0F172A)',
                padding: '6px 14px',
                fontSize: '11px',
                cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              &larr; PREVIOUS
            </button>

            <span style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
              Use ← / → keys to navigate
            </span>

            <button
              type="button"
              disabled={currentIndex >= tickets.length - 1}
              onClick={() => onSelectTicket(tickets[currentIndex + 1])}
              style={{
                background: currentIndex >= tickets.length - 1 ? 'transparent' : '#FFFFFF',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: '6px',
                color: currentIndex >= tickets.length - 1 ? '#CBD5E1' : 'var(--color-text-primary, #0F172A)',
                padding: '6px 14px',
                fontSize: '11px',
                cursor: currentIndex >= tickets.length - 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              NEXT &rarr;
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
