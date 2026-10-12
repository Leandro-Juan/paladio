"use client";

import React, { useState } from 'react';
import { ScanDraft, TripTicketCreateInput } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';

interface ScanReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: ScanDraft[];
  uploadId?: string;
  rawTextExcerpt?: string;
  onConfirmDrafts: (draftsToSave: TripTicketCreateInput[]) => Promise<void>;
}

export function ScanReviewModal({
  isOpen,
  onClose,
  drafts,
  uploadId,
  rawTextExcerpt,
  onConfirmDrafts,
}: ScanReviewModalProps) {
  // Track modified drafts and selection state
  const [editedDrafts, setEditedDrafts] = useState<ScanDraft[]>(drafts);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(drafts.map((_, idx) => idx))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || drafts.length === 0) return null;

  const toggleSelect = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleFieldChange = (draftIdx: number, field: keyof ScanDraft, val: unknown) => {
    setEditedDrafts((prev) => {
      const next = [...prev];
      next[draftIdx] = { ...next[draftIdx], [field]: val };
      return next;
    });
  };

  const handleSave = async (saveAll: boolean) => {
    const indicesToSave = saveAll
      ? drafts.map((_, i) => i)
      : Array.from(selectedIndices);

    if (indicesToSave.length === 0) {
      setErrorMsg('No drafts selected to save.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const payloads: TripTicketCreateInput[] = indicesToSave.map((idx) => {
      const d = editedDrafts[idx];
      return {
        ticket_type: d.ticket_type,
        status: d.status || 'confirmed',
        title: d.title,
        provider: d.provider,
        booking_reference: d.booking_reference,
        start_time: d.start_time,
        end_time: d.end_time,
        departure_tz: d.departure_tz,
        arrival_tz: d.arrival_tz,
        seat_or_room: d.seat_or_room,
        location_or_venue: d.location_or_venue,
        access_code: d.access_code,
        barcode_value: d.barcode_value,
        barcode_format: (d.barcode_format as 'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix') || undefined,
        notes: d.notes,
        price: d.price,
        currency: d.currency || 'EUR',
        metadata: d.metadata || {},
        upload_id: uploadId,
      };
    });

    try {
      await onConfirmDrafts(payloads);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save confirmed drafts');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: '#0F172A',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: '#FFF' }}>
              REVIEW SCANNED CREDENTIALS ({editedDrafts.length})
            </h3>
            <p className="font-mono text-muted text-xs" style={{ margin: '3px 0 0 0' }}>
              {'// VERIFY EXTRACTED FIELDS BEFORE PERSISTING TO WALLET'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Discard scan"
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
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
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                color: '#FCA5A5',
                fontSize: '12px',
              }}
            >
              ⚠ {errorMsg}
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
                  background: isSelected ? 'rgba(30, 41, 59, 0.7)' : 'rgba(30, 41, 59, 0.3)',
                  border: `1px solid ${isSelected ? typeConf.accentBorder : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Draft Selection Checkbox & Type */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(idx)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFF' }}>
                      INCLUDE DRAFT #{idx + 1}
                    </span>
                  </label>

                  <span
                    style={{
                      fontSize: '11px',
                      color: typeConf.accentColor,
                      background: typeConf.accentBg,
                      border: `1px solid ${typeConf.accentBorder}`,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                    }}
                  >
                    {typeConf.tag}
                  </span>
                </div>

                {/* Warnings banner if any */}
                {warnings.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      color: '#FCD34D',
                    }}
                  >
                    {warnings.map((w, wIdx) => (
                      <div key={wIdx}>⚠ {w}</div>
                    ))}
                  </div>
                )}

                {/* Title */}
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#94A3B8', marginBottom: '3px' }}>
                    TITLE
                  </label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => handleFieldChange(idx, 'title', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#FFF',
                      fontSize: '12px',
                    }}
                  />
                </div>

                {/* Provider & Booking Reference */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={{ fontSize: '10px', color: '#94A3B8' }}>PROVIDER</label>
                      {confidenceMap.provider != null && (
                        <span style={{ fontSize: '9px', color: '#6EE7B7' }}>
                          {Math.round(confidenceMap.provider * 100)}% conf
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={draft.provider || ''}
                      onChange={(e) => handleFieldChange(idx, 'provider', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#FFF',
                        fontSize: '12px',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={{ fontSize: '10px', color: '#94A3B8' }}>REFERENCE / PNR</label>
                      {confidenceMap.booking_reference != null && (
                        <span style={{ fontSize: '9px', color: '#6EE7B7' }}>
                          {Math.round(confidenceMap.booking_reference * 100)}% conf
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={draft.booking_reference || ''}
                      onChange={(e) => handleFieldChange(idx, 'booking_reference', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#FFF',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>

                {/* Seat/Room & Code */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#94A3B8', marginBottom: '3px' }}>
                      SEAT / ROOM
                    </label>
                    <input
                      type="text"
                      value={draft.seat_or_room || ''}
                      onChange={(e) => handleFieldChange(idx, 'seat_or_room', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#FFF',
                        fontSize: '12px',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={{ fontSize: '10px', color: '#94A3B8' }}>
                        {draft.access_code ? 'DOOR ACCESS CODE / PIN' : 'DECODED BARCODE'}
                      </label>
                      {draft.barcode_format && (
                        <span style={{ fontSize: '9px', color: '#93C5FD' }}>
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
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#FBBF24',
                        fontSize: '12px',
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
                background: 'rgba(15, 23, 42, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.75rem',
              }}
            >
              <summary
                style={{
                  fontSize: '11px',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                DOCUMENT RAW TEXT EXCERPT
              </summary>
              <pre
                style={{
                  fontSize: '10px',
                  color: '#64748B',
                  whiteSpace: 'pre-wrap',
                  marginTop: '8px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
              >
                {rawTextExcerpt}
              </pre>
            </details>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            DISCARD ALL
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSubmitting || selectedIndices.size === 0}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFF',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '12px',
                cursor: isSubmitting || selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              SAVE SELECTED ({selectedIndices.size})
            </button>

            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSubmitting}
              style={{
                background: '#2563EB',
                border: '1px solid #3B82F6',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: 700,
              }}
            >
              {isSubmitting ? 'IMPORTING...' : `SAVE ALL (${editedDrafts.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
