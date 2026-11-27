"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import {
  BoardingPassTacticalIllustration,
  HotelBookingTacticalIllustration,
  VaultSecurityIllustration,
} from '@/components/illustrations';
import { CloseIcon, PlusIcon, Spinner, CheckIcon, PlaneIcon, ChevronRightIcon } from '@/components/icons';
import { getApiBaseUrl, getAuthToken } from '@/utils/api';
import { formatLocalDateOffset } from '@/stores/tripDraftStore';
import { TravelDocumentDraft } from '@/hooks/useTripTickets';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';

export interface ExtractedTravelDocData {
  document_type?: 'flight' | 'hotel' | 'other';
  origin_city?: string | null;
  origin_iata?: string | null;
  origin_airport?: string | null;
  destination_city?: string | null;
  destination_iata?: string | null;
  destination_airport?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  departure_hour?: string | null;
  arrival_hour?: string | null;
  flight_departure_hour?: string | null;
  flight_arrival_hour?: string | null;
  return_departure_hour?: string | null;
  return_arrival_hour?: string | null;
  flight_number?: string | null;
  carrier?: string | null;
  holder_name?: string | null;
  seat?: string | null;
  reference_code?: string | null;
  hotel_name?: string | null;
  hotel_address?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  check_in_hour?: string | null;
  check_out_hour?: string | null;
  excerpt?: string;
  drafts?: TravelDocumentDraft[];
}

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (data: ExtractedTravelDocData) => void;
  disabled?: boolean;
}

export function DocumentUploadModal({
  isOpen,
  onClose,
  onExtracted,
  disabled = false,
}: DocumentUploadModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<ExtractedTravelDocData | null>(null);
  const [importedTrip, setImportedTrip] = useState<{ id: string; destination: string; start_date: string; end_date: string } | null>(null);

  // Flight states
  const [flightDragOver, setFlightDragOver] = useState(false);
  const [showFlightPaste, setShowFlightPaste] = useState(false);
  const [flightPastedText, setFlightPastedText] = useState('');
  const flightInputRef = useRef<HTMLInputElement>(null);

  // Hotel states
  const [hotelDragOver, setHotelDragOver] = useState(false);
  const [showHotelPaste, setShowHotelPaste] = useState(false);
  const [hotelPastedText, setHotelPastedText] = useState('');
  const hotelInputRef = useRef<HTMLInputElement>(null);

  // Trip package (.trip) states
  const [tripDragOver, setTripDragOver] = useState(false);
  const tripPkgInputRef = useRef<HTMLInputElement>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setScanError(null);
      setScanMessage(null);
      setExtractedResult(null);
      setImportedTrip(null);
      setShowFlightPaste(false);
      setFlightPastedText('');
      setShowHotelPaste(false);
      setHotelPastedText('');
      setFlightDragOver(false);
      setHotelDragOver(false);
      setTripDragOver(false);
    }
  }

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isScanning) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isScanning, onClose]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node) && !isScanning) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isScanning, onClose]);

  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);

  if (!shouldRender) return null;

  const processTripPackage = async (file: File) => {
    setIsScanning(true);
    setScanMessage(t('engine.unpacking_trip_archive'));
    setScanError(null);
    setExtractedResult(null);
    setImportedTrip(null);

    try {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${baseUrl}/trips/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!res.ok) {
        let errMessage = t('engine.import_trip_failed');
        try {
          const errData = await res.json();
          if (errData.detail) errMessage = errData.detail;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const tripData = await res.json();
      setImportedTrip(tripData);
      setExtractedResult({
        document_type: 'other',
        destination_city: tripData.destination,
        departure_date: tripData.start_date,
        return_date: tripData.end_date,
        excerpt: t('engine.imported_trip_excerpt', { destination: tripData.destination }),
      });
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : t('engine.import_trip_error'));
    } finally {
      setIsScanning(false);
      setScanMessage(null);
    }
  };

  const processScan = async (file?: File, rawText?: string, targetType: 'flight' | 'hotel' = 'flight') => {
    if (file && file.name.toLowerCase().endsWith('.trip')) {
      return processTripPackage(file);
    }

    setIsScanning(true);
    setScanMessage(t('engine.decoding_telemetry'));
    setScanError(null);
    setExtractedResult(null);
    setImportedTrip(null);

    try {
      const baseUrl = getApiBaseUrl();
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else if (rawText && rawText.trim()) {
        formData.append('raw_text', rawText.trim());
      } else {
        throw new Error(t('engine.doc_empty_error'));
      }
      formData.append('document_hint', targetType);
      const token = getAuthToken();

      const res = await fetch(`${baseUrl}/trips/scan-boarding-pass`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!res.ok) {
        let errMessage = t('engine.doc_extract_failed');
        try {
          const errData = await res.json();
          if (errData.detail) errMessage = errData.detail;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const data: ExtractedTravelDocData = await res.json();

      if (
        !data.origin_city &&
        !data.destination_city &&
        !data.origin_iata &&
        !data.destination_iata &&
        !data.hotel_name
      ) {
        throw new Error(t('engine.doc_no_details'));
      }

      const today = formatLocalDateOffset(0);
      if (data.departure_date && data.departure_date < today) {
        throw new Error(t('engine.doc_past_departure', { date: data.departure_date, today }));
      }
      if (data.check_in_date && data.check_in_date < today) {
        throw new Error(t('engine.doc_past_checkin', { date: data.check_in_date, today }));
      }
      if (data.return_date && data.return_date < today) {
        throw new Error(t('engine.doc_past_return', { date: data.return_date, today }));
      }
      if (data.return_date && data.departure_date && data.return_date < data.departure_date) {
        throw new Error(
          t('engine.doc_return_before_departure', {
            returnDate: data.return_date,
            departureDate: data.departure_date,
          })
        );
      }
      if (data.check_out_date && data.check_in_date && data.check_out_date < data.check_in_date) {
        throw new Error(
          t('engine.doc_checkout_before_checkin', {
            checkOutDate: data.check_out_date,
            checkInDate: data.check_in_date,
          })
        );
      }

      setExtractedResult(data);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : t('engine.doc_scan_error'));
    } finally {
      setIsScanning(false);
      setScanMessage(null);
    }
  };

  const handleFlightDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlightDragOver(false);
    if (disabled || isScanning) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      if (f.name.toLowerCase().endsWith('.trip')) {
        void processTripPackage(f);
      } else {
        void processScan(f, undefined, 'flight');
      }
    }
  };

  const handleHotelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHotelDragOver(false);
    if (disabled || isScanning) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      if (f.name.toLowerCase().endsWith('.trip')) {
        void processTripPackage(f);
      } else {
        void processScan(f, undefined, 'hotel');
      }
    }
  };

  const handleTripDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTripDragOver(false);
    if (disabled || isScanning) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processTripPackage(e.dataTransfer.files[0]);
    }
  };

  const handleApplyExtracted = () => {
    if (extractedResult) {
      const today = formatLocalDateOffset(0);
      if (extractedResult.departure_date && extractedResult.departure_date < today) {
        setScanError(
          t('engine.doc_apply_past_departure', { date: extractedResult.departure_date, today })
        );
        return;
      }
      if (extractedResult.check_in_date && extractedResult.check_in_date < today) {
        setScanError(
          t('engine.doc_apply_past_checkin', { date: extractedResult.check_in_date, today })
        );
        return;
      }
      onExtracted(extractedResult);
      onClose();
    }
  };

  return (
    <div
      className="paladio-modal-backdrop"
      data-state={dataState}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(8, 28, 36, 0.68)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      {/* Hidden file inputs */}
      <input
        ref={flightInputRef}
        type="file"
        accept="application/pdf,application/vnd.apple.pkpass,image/png,image/jpeg,image/webp,image/*,.pdf,.pkpass,.png,.jpg,.jpeg,.webp,.trip"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void processScan(e.target.files[0], undefined, 'flight');
          }
          if (flightInputRef.current) flightInputRef.current.value = '';
        }}
      />
      <input
        ref={hotelInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/*,.pdf,.png,.jpg,.jpeg,.webp,.trip"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void processScan(e.target.files[0], undefined, 'hotel');
          }
          if (hotelInputRef.current) hotelInputRef.current.value = '';
        }}
      />
      <input
        ref={tripPkgInputRef}
        type="file"
        accept=".trip,application/vnd.paladio.trip+zip,application/zip"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void processTripPackage(e.target.files[0]);
          }
          if (tripPkgInputRef.current) tripPkgInputRef.current.value = '';
        }}
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="paladio-modal-panel"
        data-state={dataState}
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          maxWidth: '1080px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* ================= HEADER ================= */}
        <div
          style={{
            padding: '1.5rem 1.75rem',
            borderBottom: '1px solid var(--color-border, #E2D9CC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'var(--color-accent-teal-deep, #0F4C5C)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlusIcon size={14} />
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A1D24)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '-0.01em',
                }}
              >
                {t('engine.upload_travel_documents')}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isScanning}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              color: 'var(--color-text-muted, #9CA3AF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
            }}
            aria-label={t('engine.close_doc_upload_aria')}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* ================= CONTENT BODY ================= */}
        <DemoFeatureGate
          message={t('demo.locked_document_import')}
          borderRadius="0 0 24px 24px"
        >
        <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Scanning Progress HUD */}
          {isScanning && (
            <div
              className="paladio-pulse"
              style={{
                padding: '1.25rem',
                borderRadius: '16px',
                background: 'rgba(15, 76, 92, 0.06)',
                border: '1px solid rgba(15, 76, 92, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Spinner size={22} color="var(--color-accent-teal-deep, #0F4C5C)" />
              <div>
                <p
                  className="font-mono"
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--color-accent-teal-deep, #0F4C5C)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {scanMessage || t('engine.processing_travel_document')}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {t('engine.extracting_schedule_coords')}
                </p>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {scanError && (
            <div
              style={{
                padding: '1rem 1.25rem',
                borderRadius: '16px',
                background: 'rgba(212, 42, 47, 0.08)',
                border: '1px solid rgba(212, 42, 47, 0.3)',
                color: 'var(--color-accent-coral, #D42A2F)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <span>{scanError}</span>
              <button
                type="button"
                onClick={() => setScanError(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '12px',
                  textDecoration: 'underline',
                }}
              >
                {t('engine.dismiss')}
              </button>
            </div>
          )}

          {/* Extracted Review Card */}
          {extractedResult && (
            <div
              style={{
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '2px solid var(--color-accent-teal-deep, #0F4C5C)',
                borderRadius: '18px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 8px 24px rgba(15, 76, 92, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'var(--color-accent-teal-deep, #0F4C5C)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckIcon size={12} />
                  </div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {importedTrip
                      ? t('engine.trip_package_restored')
                      : t('engine.extracted_travel_telemetry', {
                          type:
                            extractedResult.document_type === 'hotel'
                              ? t('engine.doc_type_hotel')
                              : t('engine.doc_type_flight'),
                        })}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExtractedResult(null);
                    setImportedTrip(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '12px',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {t('engine.scan_another_doc')}
                </button>
              </div>

              {/* Telemetry Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  background: 'var(--color-surface-card, #FAF6F0)',
                  borderRadius: '12px',
                  padding: '1rem',
                  fontSize: '13px',
                }}
              >
                {extractedResult.origin_city && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_origin_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {extractedResult.origin_city} {extractedResult.origin_iata ? `(${extractedResult.origin_iata})` : ''}
                    </strong>
                  </div>
                )}

                {extractedResult.destination_city && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_destination_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {extractedResult.destination_city} {extractedResult.destination_iata ? `(${extractedResult.destination_iata})` : ''}
                    </strong>
                  </div>
                )}

                {extractedResult.departure_date && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_travel_dates_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {extractedResult.departure_date}
                      {extractedResult.return_date ? ` → ${extractedResult.return_date}` : ''}
                    </strong>
                  </div>
                )}

                {extractedResult.document_type !== 'hotel' && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_time_windows_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {t('engine.arr_short')} {extractedResult.departure_hour || '09:00'} | {t('engine.dep_short')} {extractedResult.arrival_hour || '20:00'}
                    </strong>
                  </div>
                )}

                {extractedResult.flight_number && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_flight_number_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {extractedResult.flight_number} {extractedResult.carrier ? `(${extractedResult.carrier})` : ''}
                    </strong>
                  </div>
                )}

                {extractedResult.hotel_name && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_hotel_accommodation_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {extractedResult.hotel_name}
                    </strong>
                  </div>
                )}

                {(extractedResult.check_in_date || extractedResult.check_in_hour) && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_hotel_checkin_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {[extractedResult.check_in_date, extractedResult.check_in_hour].filter(Boolean).join(' · ')}
                    </strong>
                  </div>
                )}

                {(extractedResult.check_out_date || extractedResult.check_out_hour) && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block' }}>
                      {t('engine.doc_hotel_checkout_label')}
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {[extractedResult.check_out_date, extractedResult.check_out_hour].filter(Boolean).join(' · ')}
                    </strong>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', alignSelf: 'flex-end', flexWrap: 'wrap' }}>
                {importedTrip && (
                  <button
                    type="button"
                    onClick={() => router.push(`/trips/${importedTrip.id}`)}
                    style={{
                      background: 'var(--color-accent-coral, #D42A2F)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 20px',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <span>{t('engine.open_restored_workspace')}</span>
                    <ChevronRightIcon size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleApplyExtracted}
                  style={{
                    background: 'var(--color-accent-teal-deep, #0F4C5C)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '10px 24px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <CheckIcon size={16} />
                  <span>
                    {importedTrip
                      ? t('engine.apply_dates_dest_to_form')
                      : t('engine.apply_extracted_to_route')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ================= SPLIT INTAKE SECTIONS ================= */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: '1.25rem',
              alignItems: 'stretch',
            }}
          >
            {/* ---------------- SECTION 1: FLIGHTS & BOARDING PASSES ---------------- */}
            <div
              style={{
                background: 'var(--color-surface-card, #FAF6F0)',
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '20px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <BoardingPassTacticalIllustration width={130} height={75} />
                <h3
                  style={{
                    margin: '10px 0 4px 0',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {t('engine.flights_boarding_passes_title')}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {t('engine.flights_boarding_passes_desc')}
                </p>
              </div>

              {/* Dropzone */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setFlightDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setFlightDragOver(false);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setFlightDragOver(true);
                }}
                onDrop={handleFlightDrop}
                onClick={() => {
                  if (!isScanning && !disabled) flightInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !disabled) {
                    e.preventDefault();
                    flightInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                style={{
                  border: `2px dashed ${
                    flightDragOver ? 'var(--color-accent-coral, #D42A2F)' : 'var(--color-border, #E2D9CC)'
                  }`,
                  background: flightDragOver ? 'rgba(212, 42, 47, 0.04)' : 'var(--color-surface-raised, #FFFFFF)',
                  borderRadius: '16px',
                  padding: '1.25rem 1rem',
                  textAlign: 'center',
                  cursor: isScanning || disabled ? 'wait' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <PlaneIcon size={20} color="var(--color-accent-teal-deep, #0F4C5C)" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {t('engine.drag_drop_flight')}
                </span>
                <span className="font-mono text-xs text-muted" style={{ fontSize: '11px' }}>
                  {t('engine.flight_supported_formats')}
                </span>
                <button
                  type="button"
                  disabled={disabled || isScanning}
                  onClick={(e) => {
                    e.stopPropagation();
                    flightInputRef.current?.click();
                  }}
                  style={{
                    marginTop: '4px',
                    background: 'var(--color-surface-card, #FAF6F0)',
                    border: '1px solid var(--color-border, #E2D9CC)',
                    borderRadius: '9999px',
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-accent-teal-deep, #0F4C5C)',
                    cursor: 'pointer',
                  }}
                >
                  {t('engine.browse_flight_files')}
                </button>
              </div>

              {/* Paste Flight Text / Barcode string */}
              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowFlightPaste(!showFlightPaste)}
                  className="font-mono"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {showFlightPaste
                    ? t('engine.hide_text_intake')
                    : <>{t('engine.paste_flight_text_prompt')} <ChevronRightIcon size={11} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '2px' }} /></>}
                </button>

                {showFlightPaste && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <textarea
                      rows={3}
                      value={flightPastedText}
                      onChange={(e) => setFlightPastedText(e.target.value)}
                      placeholder={t('engine.paste_flight_text_placeholder')}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border, #E2D9CC)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono, monospace)',
                        resize: 'vertical',
                      }}
                    />
                    <button
                      type="button"
                      disabled={isScanning || !flightPastedText.trim()}
                      onClick={() => void processScan(undefined, flightPastedText, 'flight')}
                      style={{
                        background: 'var(--color-accent-teal-deep, #0F4C5C)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        alignSelf: 'flex-end',
                      }}
                    >
                      {t('engine.process_flight_text')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ---------------- SECTION 2: HOTEL & LODGING BOOKINGS ---------------- */}
            <div
              style={{
                background: 'var(--color-surface-card, #FAF6F0)',
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '20px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <HotelBookingTacticalIllustration width={130} height={75} />
                <h3
                  style={{
                    margin: '10px 0 4px 0',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {t('engine.hotel_lodging_title')}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {t('engine.hotel_lodging_desc')}
                </p>
              </div>

              {/* Dropzone */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setHotelDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setHotelDragOver(false);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHotelDragOver(true);
                }}
                onDrop={handleHotelDrop}
                onClick={() => {
                  if (!isScanning && !disabled) hotelInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !disabled) {
                    e.preventDefault();
                    hotelInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                style={{
                  border: `2px dashed ${
                    hotelDragOver ? 'var(--color-accent-coral, #D42A2F)' : 'var(--color-border, #E2D9CC)'
                  }`,
                  background: hotelDragOver ? 'rgba(212, 42, 47, 0.04)' : 'var(--color-surface-raised, #FFFFFF)',
                  borderRadius: '16px',
                  padding: '1.25rem 1rem',
                  textAlign: 'center',
                  cursor: isScanning || disabled ? 'wait' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: '1.5px solid var(--color-accent-gold, #E2B33C)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--color-accent-gold, #E2B33C)',
                  }}
                >
                  H
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {t('engine.drag_drop_hotel')}
                </span>
                <span className="font-mono text-xs text-muted" style={{ fontSize: '11px' }}>
                  {t('engine.hotel_supported_formats')}
                </span>
                <button
                  type="button"
                  disabled={disabled || isScanning}
                  onClick={(e) => {
                    e.stopPropagation();
                    hotelInputRef.current?.click();
                  }}
                  style={{
                    marginTop: '4px',
                    background: 'var(--color-surface-card, #FAF6F0)',
                    border: '1px solid var(--color-border, #E2D9CC)',
                    borderRadius: '9999px',
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-accent-teal-deep, #0F4C5C)',
                    cursor: 'pointer',
                  }}
                >
                  {t('engine.browse_hotel_files')}
                </button>
              </div>

              {/* Paste Hotel Text */}
              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowHotelPaste(!showHotelPaste)}
                  className="font-mono"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {showHotelPaste
                    ? t('engine.hide_email_intake')
                    : <>{t('engine.paste_hotel_text_prompt')} <ChevronRightIcon size={11} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '2px' }} /></>}
                </button>

                {showHotelPaste && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <textarea
                      rows={3}
                      value={hotelPastedText}
                      onChange={(e) => setHotelPastedText(e.target.value)}
                      placeholder={t('engine.paste_hotel_text_placeholder')}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border, #E2D9CC)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono, monospace)',
                        resize: 'vertical',
                      }}
                    />
                    <button
                      type="button"
                      disabled={isScanning || !hotelPastedText.trim()}
                      onClick={() => void processScan(undefined, hotelPastedText, 'hotel')}
                      style={{
                        background: 'var(--color-accent-teal-deep, #0F4C5C)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        alignSelf: 'flex-end',
                      }}
                    >
                      {t('engine.process_hotel_text')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ---------------- SECTION 3: PALADIO TRIP PACKAGE (.TRIP) ---------------- */}
            <div
              style={{
                background: 'var(--color-surface-card, #FAF6F0)',
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '20px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <VaultSecurityIllustration width={130} height={75} />
                <h3
                  style={{
                    margin: '10px 0 4px 0',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {t('engine.trip_package_title')}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {t('engine.trip_package_desc')}
                </p>
              </div>

              {/* Dropzone */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setTripDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setTripDragOver(false);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setTripDragOver(true);
                }}
                onDrop={handleTripDrop}
                onClick={() => {
                  if (!isScanning && !disabled) tripPkgInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !disabled) {
                    e.preventDefault();
                    tripPkgInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                style={{
                  border: `2px dashed ${
                    tripDragOver ? 'var(--color-accent-teal-deep, #0F4C5C)' : 'var(--color-border, #E2D9CC)'
                  }`,
                  background: tripDragOver ? 'rgba(15, 76, 92, 0.04)' : 'var(--color-surface-raised, #FFFFFF)',
                  borderRadius: '16px',
                  padding: '1.25rem 1rem',
                  textAlign: 'center',
                  cursor: isScanning || disabled ? 'wait' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    border: '1.5px solid var(--color-accent-teal-deep, #0F4C5C)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: 'var(--color-accent-teal-deep, #0F4C5C)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  .TRIP
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {t('engine.drag_drop_trip_archive')}
                </span>
                <span className="font-mono text-xs text-muted" style={{ fontSize: '11px' }}>
                  {t('engine.trip_supported_formats')}
                </span>
                <button
                  type="button"
                  disabled={disabled || isScanning}
                  onClick={(e) => {
                    e.stopPropagation();
                    tripPkgInputRef.current?.click();
                  }}
                  style={{
                    marginTop: '4px',
                    background: 'var(--color-surface-card, #FAF6F0)',
                    border: '1px solid var(--color-border, #E2D9CC)',
                    borderRadius: '9999px',
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-accent-teal-deep, #0F4C5C)',
                    cursor: 'pointer',
                  }}
                >
                  {t('engine.browse_trip_files')}
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: 'auto' }}>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {t('engine.air_gapped_offline_pkg')}
                </span>
              </div>
            </div>
          </div>
        </div>
        </DemoFeatureGate>
      </div>
    </div>
  );
}
