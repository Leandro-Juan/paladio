"use client";

import React, { useState } from 'react';
import { ScanDraft, TicketType } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { CustomSelect } from '../parts/CustomSelect';
import { AlertTriangleIcon, CloseIcon } from '@/components/icons';

interface ScanReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: ScanDraft[];
  uploadId?: string;
  rawTextExcerpt?: string;
  onConfirmDrafts: (drafts: ScanDraft[], uploadId?: string) => Promise<void>;
}

export function ScanReviewModal({
  isOpen,
  onClose,
  drafts,
  uploadId,
  rawTextExcerpt,
  onConfirmDrafts,
}: ScanReviewModalProps) {
  if (!isOpen || drafts.length === 0) return null;

  return (
    <ScanReviewDialog
      key={uploadId || drafts.map((d) => d.title).join('-')}
      onClose={onClose}
      drafts={drafts}
      uploadId={uploadId}
      rawTextExcerpt={rawTextExcerpt}
      onConfirmDrafts={onConfirmDrafts}
    />
  );
}

function ScanReviewDialog({
  onClose,
  drafts,
  uploadId,
  rawTextExcerpt,
  onConfirmDrafts,
}: {
  onClose: () => void;
  drafts: ScanDraft[];
  uploadId?: string;
  rawTextExcerpt?: string;
  onConfirmDrafts: (drafts: ScanDraft[], uploadId?: string) => Promise<void>;
}) {
  const [editedDrafts, setEditedDrafts] = useState<ScanDraft[]>(drafts);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(drafts.map((_, idx) => idx))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleFieldChange = (index: number, field: keyof ScanDraft, value: unknown) => {
    setEditedDrafts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleTypeChange = (index: number, newType: TicketType) => {
    setEditedDrafts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ticket_type: newType };
      return updated;
    });
  };

  const handleConfirm = async () => {
    const toConfirm = editedDrafts.filter((_, idx) => selectedIndices.has(idx));
    if (toConfirm.length === 0) {
      setErrorMsg('Please select at least one ticket draft to add.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirmDrafts(toConfirm, uploadId);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import drafts to wallet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions = (Object.keys(TICKET_TYPE_CONFIG) as TicketType[]).map((t) => ({
    value: t,
    label: TICKET_TYPE_CONFIG[t].label,
    badge: TICKET_TYPE_CONFIG[t].renderIcon({ size: 13, color: TICKET_TYPE_CONFIG[t].accentColor }),
  }));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#FFFFFF',
    border: '1px solid var(--color-border, #CBD5E1)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: 'var(--color-text-primary, #0F172A)',
    fontSize: '12px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '10px',
    color: 'var(--color-text-muted, #64748B)',
    marginBottom: '3px',
    fontWeight: 600,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
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
          background: '#FFFFFF',
          border: '1px solid var(--color-border, #CBD5E1)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border, #E2E8F0)',
            background: 'var(--color-surface-card, #F8FAFC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text-primary, #0F172A)' }}>
              REVIEW SCANNED CREDENTIALS ({editedDrafts.length})
            </h3>
            <p className="font-mono text-muted text-xs" style={{ margin: '3px 0 0 0', color: 'var(--color-text-muted, #64748B)' }}>
              {'// VERIFY EXTRACTED FIELDS BEFORE PERSISTING TO WALLET'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Discard scan"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-border, #CBD5E1)',
              borderRadius: '6px',
              color: 'var(--color-text-muted, #64748B)',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CloseIcon size={12} color="var(--color-text-muted, #64748B)" />
          </button>
        </div>

        {/* Body List */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {errorMsg && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                color: '#DC2626',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangleIcon size={14} color="#DC2626" />
              <span>{errorMsg}</span>
            </div>
          )}

          {editedDrafts.map((draft, idx) => {
            const isSelected = selectedIndices.has(idx);
            const typeConf = TICKET_TYPE_CONFIG[draft.ticket_type] || TICKET_TYPE_CONFIG.other;
            const confidenceMap = draft.field_confidence || {};
            const warnings = draft.warnings || [];

            return (
              <div
                key={idx}
                style={{
                  background: isSelected ? '#FFFFFF' : 'var(--color-surface-card, #F8FAFC)',
                  border: `1px solid ${isSelected ? typeConf.accentBorder : 'var(--color-border, #E2E8F0)'}`,
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: isSelected ? '0 2px 8px rgba(15, 23, 42, 0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Draft Selection Checkbox & Custom Type Selector */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(idx)}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-accent-primary, #1E3A8A)' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                      INCLUDE DRAFT #{idx + 1}
                    </span>
                  </label>

                  <div style={{ width: '150px' }}>
                    <CustomSelect<TicketType>
                      value={draft.ticket_type}
                      onChange={(newT) => handleTypeChange(idx, newT)}
                      options={typeOptions}
                      label="Ticket Type"
                    />
                  </div>
                </div>

                {/* Warnings banner if any */}
                {warnings.length > 0 && (
                  <div
                    style={{
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      color: '#B45309',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    {warnings.map((w, wIdx) => (
                      <div key={wIdx} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <AlertTriangleIcon size={12} color="#D97706" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Title */}
                <div>
                  <label style={labelStyle}>TITLE</label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => handleFieldChange(idx, 'title', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Provider & Booking Reference */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={labelStyle}>PROVIDER</label>
                      {confidenceMap.provider != null && (
                        <span style={{ fontSize: '9px', color: '#059669', fontWeight: 600 }}>
                          {Math.round(confidenceMap.provider * 100)}% conf
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={draft.provider || ''}
                      onChange={(e) => handleFieldChange(idx, 'provider', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={labelStyle}>REFERENCE / PNR</label>
                      {confidenceMap.booking_reference != null && (
                        <span style={{ fontSize: '9px', color: '#059669', fontWeight: 600 }}>
                          {Math.round(confidenceMap.booking_reference * 100)}% conf
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={draft.booking_reference || ''}
                      onChange={(e) => handleFieldChange(idx, 'booking_reference', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Seat/Room & Code */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>SEAT / ROOM</label>
                    <input
                      type="text"
                      value={draft.seat_or_room || ''}
                      onChange={(e) => handleFieldChange(idx, 'seat_or_room', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={labelStyle}>
                        {draft.access_code ? 'DOOR ACCESS CODE / PIN' : 'DECODED BARCODE'}
                      </label>
                      {draft.barcode_format && (
                        <span style={{ fontSize: '9px', color: '#0284C7', fontWeight: 600 }}>
                          {draft.barcode_format.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={draft.access_code || draft.barcode_value || ''}
                      onChange={(e) =>
                        handleFieldChange(
                          idx,
                          draft.access_code ? 'access_code' : 'barcode_value',
                          e.target.value
                        )
                      }
                      style={{
                        ...inputStyle,
                        color: draft.access_code ? '#B45309' : 'var(--color-text-primary, #0F172A)',
                        fontWeight: draft.access_code ? 700 : 500,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Raw Text Excerpt Accordion if available */}
          {rawTextExcerpt && (
            <details
              style={{
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: '8px',
                padding: '0.75rem',
              }}
            >
              <summary
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-muted, #64748B)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Inspect OCR / Parser Raw Excerpt
              </summary>
              <pre
                style={{
                  marginTop: '8px',
                  fontSize: '10px',
                  color: 'var(--color-text-muted, #64748B)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  background: '#FFFFFF',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border, #E2E8F0)',
                }}
              >
                {rawTextExcerpt}
              </pre>
            </details>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-border, #E2E8F0)',
            background: 'var(--color-surface-card, #F8FAFC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
            {selectedIndices.size} of {editedDrafts.length} credentials selected
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: '6px',
                color: 'var(--color-text-muted, #64748B)',
                padding: '6px 14px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || selectedIndices.size === 0}
              style={{
                background: 'var(--color-accent-primary, #1E3A8A)',
                border: 'none',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '6px 18px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: isSubmitting || selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(30, 58, 138, 0.25)',
              }}
            >
              {isSubmitting ? 'PERSISTING TO WALLET…' : `CONFIRM & ADD (${selectedIndices.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
