"use client";

import React, { useState } from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG, STATUS_BADGE_CONFIG } from '@/lib/wallet/ticketTypeConfig';

interface TicketShellProps {
  ticket: TripTicket;
  children: React.ReactNode;
  stubContent: React.ReactNode;
  onEdit?: (ticket: TripTicket) => void;
  onDelete?: (ticketId: string) => void;
  onViewDetail?: (ticket: TripTicket) => void;
}

export function TicketShell({
  ticket,
  children,
  stubContent,
  onEdit,
  onDelete,
  onViewDetail,
}: TicketShellProps) {
  const [showMenu, setShowMenu] = useState(false);
  const typeConfig = TICKET_TYPE_CONFIG[ticket.ticket_type] || TICKET_TYPE_CONFIG.other;
  const statusConfig = STATUS_BADGE_CONFIG[ticket.status] || STATUS_BADGE_CONFIG.planned;
  const isUsed = ticket.status === 'used';

  return (
    <article
      tabIndex={0}
      aria-label={`${typeConfig.label}: ${ticket.title}`}
      style={{
        background: isUsed ? 'rgba(30, 41, 59, 0.45)' : 'rgba(30, 41, 59, 0.78)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${ticket.status === 'planned' ? 'rgba(255, 255, 255, 0.15)' : typeConfig.accentBorder}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.28)',
        overflow: 'hidden',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        opacity: isUsed ? 0.75 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isUsed) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 26px rgba(0, 0, 0, 0.38)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isUsed) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.28)';
        }
      }}
    >
      {/* Main Body */}
      <div
        style={{
          flex: 1,
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          minWidth: 0,
        }}
      >
        {/* Top Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '11px',
                color: typeConfig.accentColor,
                background: typeConfig.accentBg,
                border: `1px solid ${typeConfig.accentBorder}`,
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              {typeConfig.tag}
            </span>

            {/* Status Chip */}
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10px',
                color: statusConfig.color,
                background: statusConfig.bg,
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
                border: ticket.status === 'planned' ? '1px dashed rgba(255, 255, 255, 0.2)' : 'none',
              }}
            >
              {statusConfig.label}
            </span>

            {ticket.visibility === 'private' && (
              <span
                title="Private: Visible only to you"
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '10px',
                  color: '#94A3B8',
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                🔒 PRIVATE
              </span>
            )}
          </div>

          {/* Actions Dropdown / Trigger */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label="Ticket options"
              aria-expanded={showMenu}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((prev) => !prev);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '4px',
                color: '#CBD5E1',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              ···
            </button>

            {showMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  background: '#0F172A',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '6px',
                  padding: '4px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 20,
                  minWidth: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {onViewDetail && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onViewDetail(ticket);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#F1F5F9',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    🔍 View Pass
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onEdit(ticket);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#F1F5F9',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    ✏️ Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      if (window.confirm(`Delete "${ticket.title}" from wallet?`)) {
                        onDelete(ticket.id);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#F87171',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Body Slot */}
        {children}
      </div>

      {/* Perforated Notched Tear Divider */}
      <div
        aria-hidden="true"
        style={{
          width: '1px',
          background: 'radial-gradient(circle, transparent 2px, rgba(255, 255, 255, 0.12) 2px)',
          backgroundSize: '1px 8px',
          position: 'relative',
          margin: '8px 0',
        }}
      >
        {/* Top notch */}
        <div
          style={{
            position: 'absolute',
            top: '-8px',
            left: '-6px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: 'var(--color-bg-main, #FFFFFF)',
          }}
        />
        {/* Bottom notch */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            left: '-6px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: 'var(--color-bg-main, #FFFFFF)',
          }}
        />
      </div>

      {/* Credential Stub (Right Section) */}
      <div
        style={{
          width: '140px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.45)',
          gap: '8px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {stubContent}
      </div>
    </article>
  );
}
