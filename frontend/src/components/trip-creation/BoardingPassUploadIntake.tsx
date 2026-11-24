"use client";

import React, { useState, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { BoardingPassTacticalIllustration } from '@/components/illustrations';
import { Spinner, CheckIcon, ChevronRightIcon } from '@/components/icons';
import { getApiBaseUrl, getAuthToken } from '@/utils/api';
import { formatLocalDateOffset } from '@/stores/tripDraftStore';

export interface BoardingPassExtractedData {
  origin_city?: string | null;
  origin_iata?: string | null;
  origin_airport?: string | null;
  destination_city?: string | null;
  destination_iata?: string | null;
  destination_airport?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  flight_number?: string | null;
  carrier?: string | null;
  holder_name?: string | null;
  seat?: string | null;
  drafts?: unknown[];
}

interface BoardingPassUploadIntakeProps {
  onExtracted: (data: BoardingPassExtractedData) => void;
  disabled?: boolean;
}

export function BoardingPassUploadIntake({
  onExtracted,
  disabled = false,
}: BoardingPassUploadIntakeProps) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<BoardingPassExtractedData | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processScan = async (file?: File, rawText?: string) => {
    setIsScanning(true);
    setScanError(null);
    setExtractedResult(null);

    try {
      const baseUrl = getApiBaseUrl();
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else if (rawText && rawText.trim()) {
        formData.append('raw_text', rawText.trim());
      } else {
        throw new Error(t('engine.boarding_pass_empty_error'));
      }

      const token = getAuthToken();
      const res = await fetch(`${baseUrl}/trips/scan-boarding-pass`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!res.ok) {
        let errMessage = t('engine.boarding_pass_scan_failed');
        try {
          const errData = await res.json();
          if (errData.detail) errMessage = errData.detail;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const data: BoardingPassExtractedData = await res.json();

      if (
        !data.origin_city &&
        !data.destination_city &&
        !data.origin_iata &&
        !data.destination_iata &&
        (!data.drafts || data.drafts.length === 0)
      ) {
        throw new Error(t('engine.boarding_pass_no_telemetry'));
      }

      const today = formatLocalDateOffset(0);
      if (data.departure_date && data.departure_date < today) {
        throw new Error(
          t('engine.boarding_pass_past_departure', { date: data.departure_date, today })
        );
      }
      if (data.return_date && data.return_date < today) {
        throw new Error(
          t('engine.boarding_pass_past_return', { date: data.return_date, today })
        );
      }
      if (data.return_date && data.departure_date && data.return_date < data.departure_date) {
        throw new Error(
          t('engine.boarding_pass_return_before_departure', {
            returnDate: data.return_date,
            departureDate: data.departure_date,
          })
        );
      }

      setExtractedResult(data);
      onExtracted(data);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : t('engine.doc_scan_error'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    void processScan(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || isScanning) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Hidden File Input: Accepts PDF, pkpass, and images (screenshots) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,application/vnd.apple.pkpass,image/png,image/jpeg,image/webp,image/*,.pdf,.pkpass,.png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />

      {/* Main Drag-and-Drop Area */}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDrop={handleDrop}
        onClick={() => {
          if (!isScanning && !disabled) fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !disabled) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={t('engine.upload_boarding_pass_aria')}
        style={{
          border: `2px dashed ${
            isDragOver
              ? 'var(--color-accent-coral, #D42A2F)'
              : isScanning
              ? 'var(--color-accent-primary, #0F4C5C)'
              : 'var(--color-border, #E2D9CC)'
          }`,
          background: isDragOver
            ? 'rgba(212, 42, 47, 0.04)'
            : isScanning
            ? 'rgba(15, 76, 92, 0.04)'
            : 'var(--color-surface-card, #FAF6F0)',
          borderRadius: '20px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          cursor: isScanning || disabled ? 'wait' : 'pointer',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        {/* Tactical Boarding Pass SVG Illustration */}
        <div style={{ pointerEvents: 'none', transform: 'scale(1.05)' }}>
          <BoardingPassTacticalIllustration width={130} height={85} />
        </div>

        {isScanning ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Spinner size={24} color="var(--color-accent-primary, #0F4C5C)" />
            <span className="font-mono text-xs" style={{ fontWeight: 600, color: 'var(--color-accent-primary, #0F4C5C)' }}>
              {t('engine.decoding_boarding_pass')}
            </span>
          </div>
        ) : (
          <>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary, #1A1A1A)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {t('engine.drop_boarding_pass_title')}
              </p>
              <p
                className="font-mono text-xs text-muted"
                style={{ margin: '4px 0 0 0', letterSpacing: '0.02em' }}
              >
                {t('engine.boarding_pass_supported_formats')}
              </p>
            </div>

            <button
              type="button"
              disabled={disabled || isScanning}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              style={{
                marginTop: '4px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '9999px',
                padding: '7px 20px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-accent-primary, #0F4C5C)',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
            >
              {t('engine.browse_files_or_photos')}
            </button>
          </>
        )}
      </div>

      {/* Alternative: Paste IATA BCBP / Text option */}
      <div style={{ marginTop: '10px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => setShowPasteBox(!showPasteBox)}
          className="font-mono text-xs text-muted"
          style={{
            background: 'transparent',
            border: 'none',
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {showPasteBox
            ? t('engine.hide_raw_barcode_intake')
            : <>{t('engine.paste_iata_barcode_prompt')} <ChevronRightIcon size={11} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '2px' }} /></>}
        </button>

        {showPasteBox && (
          <div
            style={{
              marginTop: '10px',
              padding: '12px',
              borderRadius: '12px',
              background: 'var(--color-bg-main, #F7F9FA)',
              border: '1px solid var(--color-border, #E2D9CC)',
              textAlign: 'left',
            }}
          >
            <textarea
              rows={3}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={t('engine.paste_iata_barcode_placeholder')}
              style={{
                width: '100%',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border-subtle, #EDE7DE)',
                borderRadius: '8px',
                padding: '8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary, #1A1A1A)',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                disabled={isScanning || !pastedText.trim()}
                onClick={() => void processScan(undefined, pastedText)}
                className="font-mono text-xs"
                style={{
                  background: 'var(--color-accent-primary, #0F4C5C)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '6px 14px',
                  fontWeight: 600,
                  cursor: isScanning || !pastedText.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {t('engine.scan_text_telemetry')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {scanError && (
        <div
          style={{
            marginTop: '12px',
            background: 'var(--color-danger-soft, #FEE2E2)',
            border: '1px solid var(--color-danger, #EF4444)',
            borderRadius: '10px',
            padding: '10px 14px',
            color: 'var(--color-danger, #EF4444)',
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t('engine.scan_error_prefix')} {scanError}
        </div>
      )}

      {/* Success Extraction Banner */}
      {extractedResult && (
        <div
          style={{
            marginTop: '12px',
            background: 'rgba(27, 143, 166, 0.08)',
            border: '1px solid var(--color-accent-teal-mid, #1B8FA6)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--color-accent-teal-mid, #1B8FA6)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckIcon size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--color-text-primary, #1A1A1A)' }}>
                {t('engine.flight_telemetry_decoded', {
                  origin: extractedResult.origin_city || extractedResult.origin_iata || '',
                  destination: extractedResult.destination_city || extractedResult.destination_iata || '',
                })}
              </div>
              <div className="font-mono text-xs text-muted" style={{ marginTop: '2px' }}>
                {extractedResult.departure_date ? t('engine.bp_departure_label', { date: extractedResult.departure_date }) : ''}
                {extractedResult.flight_number ? ` • ${t('engine.bp_flight_label', { flight: extractedResult.flight_number })}` : ''}
                {extractedResult.holder_name ? ` • ${t('engine.bp_passenger_label', { name: extractedResult.holder_name })}` : ''}
              </div>
            </div>
          </div>

          <span
            className="font-mono text-xs"
            style={{
              background: 'var(--color-accent-teal-mid, #1B8FA6)',
              color: '#FFFFFF',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {t('engine.applied_to_trip')}
          </span>
        </div>
      )}
    </div>
  );
}
