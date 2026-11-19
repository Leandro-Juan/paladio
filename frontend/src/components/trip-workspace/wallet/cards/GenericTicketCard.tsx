"use client";

import React from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import { TicketShell } from './TicketShell';
import { CodeRenderer } from '../codes/CodeRenderer';
import { CopyButton } from '../parts/CopyButton';
import { DocumentIcon, PinIcon, PaperclipIcon } from '@/components/icons';
import { formatTicketDateTime } from '@/lib/wallet/format';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t, locale } = useTranslation();
  const provider = ticket.provider || '';
  const venueOrLocation = ticket.location_or_venue || '';

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
                {t('wallet.ref_prefix', { code: ticket.reference_code })}
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
            <DocumentIcon size={22} color="var(--color-text-muted, #64748B)" />
            <span
              className="font-mono text-center"
              style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)', fontWeight: 600, lineHeight: 1.2 }}
            >
              {t('wallet.voucher_pass')}
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
                  color: 'var(--color-accent-primary, #1E3A8A)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                {t('wallet.attach_doc_btn')}
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
            style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', letterSpacing: '0.5px', fontWeight: 600 }}
          >
            {provider.toUpperCase()}
          </span>
        )}
        <h4
          className="font-display"
          style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', margin: '2px 0 0 0' }}
        >
          {ticket.title}
        </h4>
        {venueOrLocation && (
          <p
            className="font-mono text-muted"
            style={{
              fontSize: '11px',
              color: 'var(--color-text-muted, #64748B)',
              margin: '3px 0 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <PinIcon size={12} color="var(--color-text-muted, #64748B)" />
            {venueOrLocation}
          </p>
        )}
      </div>

      {/* Date & Time info if available */}
      {(ticket.start_time || ticket.end_time) && (
        <div
          style={{
            background: 'var(--color-surface-card, #F8FAFC)',
            border: '1px solid var(--color-border, #E2E8F0)',
            borderRadius: '6px',
            padding: '8px 10px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
          }}
        >
          {ticket.start_time && (
            <div>
              <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
                {t('wallet.schedule_start')}
              </div>
              <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
                {formatTicketDateTime(ticket.start_time, ticket.start_tz, locale)}
              </div>
            </div>
          )}

          {ticket.end_time && (
            <div>
              <div className="font-mono text-muted" style={{ fontSize: '9px', color: 'var(--color-text-muted, #64748B)' }}>
                {t('wallet.expiry_end')}
              </div>
              <div className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
                {formatTicketDateTime(ticket.end_time, ticket.end_tz, locale)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reference code and Seat */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        {ticket.booking_reference && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
              {t('wallet.ref_label')}
            </span>
            <CopyButton value={ticket.booking_reference} label={ticket.booking_reference} />
          </div>
        )}

        {ticket.seat_or_room && (
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary, #0F172A)', fontWeight: 600 }}>
            {t('wallet.assignment_prefix', { value: ticket.seat_or_room })}
          </span>
        )}
      </div>

      {/* Attachment info */}
      {ticket.attachments && ticket.attachments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
          <PaperclipIcon size={12} color="var(--color-text-muted, #64748B)" />
          <span className="font-mono">{t('wallet.attached_doc_available')}</span>
        </div>
      )}
    </TicketShell>
  );
}
