"use client";

import React, { useState, useRef, useEffect } from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG, STATUS_BADGE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { LockIcon, SearchIcon, EditIcon, TrashIcon } from '@/components/icons';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const typeConfig = TICKET_TYPE_CONFIG[ticket.ticket_type] || TICKET_TYPE_CONFIG.other;
  const statusConfig = STATUS_BADGE_CONFIG[ticket.status] || STATUS_BADGE_CONFIG.planned;
  const isUsed = ticket.status === 'used';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <article
      tabIndex={0}
      aria-label={`${typeConfig.label}: ${ticket.title}`}
      style={{
        background: 'var(--color-surface-card)',
        border: `1px solid var(--color-border-subtle)`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        opacity: isUsed ? 0.75 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isUsed) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isUsed) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
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
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {typeConfig.renderIcon({ size: 13, color: typeConfig.accentColor })}
              {typeConfig.tag}
            </span>

            {/* Status Chip */}
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10px',
                color: statusConfig.color,
                background: statusConfig.bg,
                border: `1px solid ${statusConfig.border}`,
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
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
                  color: 'var(--color-text-muted)',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border-subtle)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <LockIcon size={11} color="var(--color-text-muted)" />
                PRIVATE
              </span>
            )}
          </div>

          {/* Actions Dropdown / Trigger */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label="Ticket options"
              aria-expanded={showMenu}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((prev) => !prev);
              }}
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                color: 'var(--color-text-muted)',
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
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '6px',
                  padding: '4px',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 20,
                  minWidth: '130px',
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
                      color: 'var(--color-text-main)',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover, rgba(0,0,0,0.04))')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <SearchIcon size={12} color="var(--color-accent-primary)" />
                    View Pass
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
                      color: 'var(--color-text-main)',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover, rgba(0,0,0,0.04))')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <EditIcon size={12} color="var(--color-text-muted)" />
                    Edit
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
                      color: 'var(--color-danger)',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212, 42, 47, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <TrashIcon size={12} color="var(--color-danger)" />
                    Delete
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
          borderLeft: '1px dashed var(--color-border-subtle)',
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
            background: 'var(--color-bg-main)',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
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
            background: 'var(--color-bg-main)',
            boxShadow: 'inset 0 -1px 2px rgba(0, 0, 0, 0.1)',
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
          background: 'var(--color-surface-subtle, var(--color-surface-card))',
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
