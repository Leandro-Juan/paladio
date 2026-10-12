"use client";

import React, { useEffect, useState } from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { CodeRenderer } from '../codes/CodeRenderer';
import { SecretField } from '../parts/SecretField';
import { CopyButton } from '../parts/CopyButton';
import { formatTicketDateTime } from '@/lib/wallet/format';

interface TicketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: TripTicket | null;
  tickets?: TripTicket[];
  onSelectTicket?: (ticket: TripTicket) => void;
}

export function TicketDetailModal({
  isOpen,
  onClose,
  ticket,
  tickets = [],
  onSelectTicket,
}: TicketDetailModalProps) {
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Keyboard navigation (Esc to close, left/right arrows to switch)
  useEffect(() => {
    if (!isOpen || !ticket) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && tickets.length > 1 && onSelectTicket) {
        const currentIndex = tickets.findIndex((t) => t.id === ticket.id);
        if (currentIndex < tickets.length - 1) {
          onSelectTicket(tickets[currentIndex + 1]);
        }
      } else if (e.key === 'ArrowLeft' && tickets.length > 1 && onSelectTicket) {
        const currentIndex = tickets.findIndex((t) => t.id === ticket.id);
        if (currentIndex > 0) {
          onSelectTicket(tickets[currentIndex - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, ticket, tickets, onClose, onSelectTicket]);

  // Request wake lock so phone screen doesn't sleep at boarding gate / ticket desk
  useEffect(() => {
    let wakeLockSentinel: any = null;

    if (isOpen && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as any).wakeLock
        ?.request('screen')
        .then((lock: any) => {
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

  if (!isOpen || !ticket) return null;

  const typeConfig = TICKET_TYPE_CONFIG[ticket.ticket_type] || TICKET_TYPE_CONFIG.other;
  const meta = ticket.metadata || {};
  const currentIndex = tickets.findIndex((t) => t.id === ticket.id);

  let codeSection: React.ReactNode = (
    <div
      style={{
        border: '1px dashed rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        padding: '2rem 1rem',
        textAlign: 'center',
        color: '#94A3B8',
        width: '100%',
        maxWidth: '340px',
      }}
    >
      <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>🎫</span>
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
          boxShadow: '0 8px 30px rgba(255, 255, 255, 0.1)',
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
            color: '#1E293B',
            fontSize: '11px',
            fontWeight: 700,
            marginTop: '10px',
            letterSpacing: '1px',
          }}
        >
          READY FOR SCANNER
        </span>
      </div>
    );
  } else if (ticket.access_code) {
    codeSection = (
      <div
        style={{
          background: 'rgba(251, 191, 36, 0.12)',
          border: '2px solid #FBBF24',
          borderRadius: '12px',
          padding: '1.25rem',
          width: '100%',
          maxWidth: '340px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '11px', color: '#FDE68A', fontWeight: 700, marginBottom: '8px' }}>
          🔑 DOOR / ACCESS CODE
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SecretField value={ticket.access_code} label="Door Access Code" />
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(12px)',
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
          background: '#0F172A',
          border: `1px solid ${typeConfig.accentBorder}`,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {/* Top Header / Bar */}
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'rgba(15, 23, 42, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: typeConfig.accentColor,
                background: typeConfig.accentBg,
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              {typeConfig.tag}
            </span>
            {wakeLockActive && (
              <span
                title="Screen will stay awake"
                style={{ fontSize: '10px', color: '#4ADE80' }}
              >
                🔆 AWAKE
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tickets.length > 1 && (
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                {currentIndex + 1} / {tickets.length}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close fullscreen pass"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                color: '#CBD5E1',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
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
          }}
        >
          {/* Main Title & Provider */}
          <div style={{ textAlign: 'center', width: '100%' }}>
            {ticket.provider && (
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.5px' }}>
                {ticket.provider.toUpperCase()}
              </div>
            )}
            <h2
              className="font-display"
              style={{ fontSize: '1.4rem', fontWeight: 700, color: '#FFFFFF', margin: '4px 0 0 0' }}
            >
              {ticket.title}
            </h2>
            {ticket.location_or_venue && (
              <div style={{ fontSize: '11px', color: '#CBD5E1', marginTop: '4px' }}>
                📍 {ticket.location_or_venue}
              </div>
            )}
          </div>

          {/* FORCED HIGH-CONTRAST WHITE CONTAINER FOR BARCODE / CODE */}
          <>{codeSection}</>

          {/* Key Credentials Grid */}
          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '1rem',
            }}
          >
            {ticket.seat_or_room && (
              <div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>SEAT / ROOM</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFF' }}>
                  {ticket.seat_or_room}
                </div>
              </div>
            )}

            {ticket.booking_reference && (
              <div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>REFERENCE / PNR</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#CBD5E1' }}>
                    {ticket.booking_reference}
                  </span>
                  <CopyButton text={ticket.booking_reference} label="Copy PNR" size="sm" />
                </div>
              </div>
            )}

            {ticket.start_time && (
              <div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>START / SCHEDULE</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFF' }}>
                  {formatTicketDateTime(ticket.start_time, ticket.departure_tz || undefined)}
                </div>
              </div>
            )}

            {ticket.end_time && (
              <div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>END / EXPIRY</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFF' }}>
                  {formatTicketDateTime(ticket.end_time, ticket.arrival_tz || undefined)}
                </div>
              </div>
            )}
          </div>

          {/* Wi-Fi if available */}
          {(Boolean(meta.wifi_ssid) || Boolean(meta.wifi_password)) && (
            <div
              style={{
                width: '100%',
                background: 'rgba(251, 191, 36, 0.08)',
                border: '1px solid rgba(251, 191, 36, 0.25)',
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
                <div style={{ fontSize: '10px', color: '#FDE68A', fontWeight: 700 }}>HOTEL WI-FI</div>
                <div style={{ fontSize: '12px', color: '#FFF' }}>
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
              background: 'rgba(15, 23, 42, 0.95)',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => onSelectTicket(tickets[currentIndex - 1])}
              style={{
                background: currentIndex <= 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                color: currentIndex <= 0 ? '#475569' : '#FFF',
                padding: '6px 14px',
                fontSize: '11px',
                cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              &larr; PREVIOUS
            </button>

            <span style={{ fontSize: '10px', color: '#64748B' }}>Use ← / → keys to navigate</span>

            <button
              type="button"
              disabled={currentIndex >= tickets.length - 1}
              onClick={() => onSelectTicket(tickets[currentIndex + 1])}
              style={{
                background:
                  currentIndex >= tickets.length - 1
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                color: currentIndex >= tickets.length - 1 ? '#475569' : '#FFF',
                padding: '6px 14px',
                fontSize: '11px',
                cursor: currentIndex >= tickets.length - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              NEXT &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
