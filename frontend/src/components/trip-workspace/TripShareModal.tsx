"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import { CloseIcon } from '@/components/icons';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';
import {
  downloadTripPackage,
  downloadItineraryJson,
  downloadItineraryIcs,
  downloadGpxTrack,
  TripExportData,
} from '@/utils/exportTrip';

interface TripShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  itineraryData?: unknown;
}

export function TripShareModal({
  isOpen,
  onClose,
  tripId,
  destination,
  startDate,
  endDate,
  itineraryData,
}: TripShareModalProps) {
  const { t } = useTranslation();
  const isMounted = useIsMounted();
  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);
  const [profile, setProfile] = useState<'full_vault' | 'community_shareable'>('full_vault');
  const [isExportingTrip, setIsExportingTrip] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [exportAllDays, setExportAllDays] = useState(true);
  const [selectedExportDays, setSelectedExportDays] = useState<number[]>([]);

  const itineraryDayNumbers = useMemo(() => {
    const itin = (itineraryData || {}) as { days?: Array<Record<string, unknown>> };
    const rawDays = Array.isArray(itin?.days) ? itin.days : [];
    return rawDays.map((d, idx) =>
      typeof d?.day === 'number'
        ? d.day
        : typeof d?.day_number === 'number'
        ? d.day_number
        : idx + 1
    );
  }, [itineraryData]);

  const toggleExportDay = (dayNum: number) => {
    setExportAllDays(false);
    setSelectedExportDays((prev) =>
      prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const activeDayFilter: number[] | undefined =
    exportAllDays || selectedExportDays.length === 0 ? undefined : selectedExportDays;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!shouldRender || !isMounted) return null;

  const handleCopyLink = async () => {
    try {
      if (typeof window !== 'undefined') {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
      }
    } catch {
      // Fallback
    }
  };

  const handleExportTripPackage = async () => {
    setIsExportingTrip(true);
    setTripError(null);
    try {
      await downloadTripPackage(tripId, profile, destination);
    } catch (err) {
      setTripError(err instanceof Error ? err.message : t('share.export_failed'));
    } finally {
      setIsExportingTrip(false);
    }
  };

  const handleExportJson = () => {
    const tripData: TripExportData = {
      id: tripId,
      destination,
      start_date: startDate,
      end_date: endDate,
      itinerary_data: itineraryData,
    };
    downloadItineraryJson(tripData, activeDayFilter);
  };

  const handleExportIcs = () => {
    const tripData: TripExportData = {
      id: tripId,
      destination,
      start_date: startDate,
      end_date: endDate,
      itinerary_data: itineraryData,
    };
    downloadItineraryIcs(tripData, activeDayFilter);
  };

  const handleExportGpx = () => {
    const tripData: TripExportData = {
      id: tripId,
      destination,
      start_date: startDate,
      end_date: endDate,
      itinerary_data: itineraryData,
    };
    downloadGpxTrack(tripData, activeDayFilter);
  };

  const handlePrintPdf = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 180);
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="paladio-modal-backdrop"
      data-state={dataState}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        className="paladio-modal-panel"
        data-state={dataState}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '430px',
          backgroundColor: 'var(--color-surface-raised, #FFFFFF)',
          borderRadius: '24px',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.06)',
          border: '1px solid var(--color-border, #E5E7EB)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--color-text-primary, #111827)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2
              id="share-modal-title"
              style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '-0.015em',
                color: 'var(--color-text-primary, #111827)',
              }}
            >
              {t('share.title')}
            </h2>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '0.78rem',
                color: 'var(--color-text-secondary, #6B7280)',
              }}
            >
              {destination}
              {startDate && endDate ? ` • ${startDate} — ${endDate}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('share.close_aria')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-secondary, #9CA3AF)',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary, #F3F4F6)';
              e.currentTarget.style.color = 'var(--color-text-primary, #111827)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary, #9CA3AF)';
            }}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Section: General Access & Export Formats */}
        <DemoFeatureGate
          message={t('share.demo_export_disabled')}
          compact
          borderRadius="14px"
        >
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary, #9CA3AF)',
              marginBottom: '10px',
              paddingLeft: '2px',
            }}
          >
            {t('share.export_formats')}
          </div>

          {itineraryDayNumbers.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '10px',
                paddingLeft: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setExportAllDays(true);
                  setSelectedExportDays([]);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: exportAllDays
                    ? '1px solid var(--color-accent-primary, #0F4C5C)'
                    : '1px solid var(--color-border, #E5E7EB)',
                  backgroundColor: exportAllDays
                    ? 'var(--color-accent-primary, #0F4C5C)'
                    : 'var(--color-bg-secondary, #F3F4F6)',
                  color: exportAllDays ? '#FFFFFF' : 'var(--color-text-secondary, #6B7280)',
                }}
              >
                {t('share.all_days_count', { count: itineraryDayNumbers.length })}
              </button>
              {itineraryDayNumbers.map((dNum) => {
                const isSelected = !exportAllDays && selectedExportDays.includes(dNum);
                return (
                  <button
                    type="button"
                    key={dNum}
                    onClick={() => toggleExportDay(dNum)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: isSelected
                        ? '1px solid var(--color-accent-primary, #0F4C5C)'
                        : '1px solid var(--color-border, #E5E7EB)',
                      backgroundColor: isSelected
                        ? 'rgba(15, 76, 92, 0.14)'
                        : 'var(--color-bg-secondary, #F3F4F6)',
                      color: isSelected
                        ? 'var(--color-accent-primary, #0F4C5C)'
                        : 'var(--color-text-secondary, #6B7280)',
                    }}
                  >
                    {t('trips.day_label', { number: dNum })}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Row 1: Paladio Archive (.trip) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 6px',
                borderRadius: '16px',
                transition: 'background 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent-teal-deep, #0F4C5C)',
                  flexShrink: 0,
                  border: '1px solid var(--color-border, #E5E7EB)',
                }}
              >
                {/* Archive/Package box icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.3 7 8.7 5 8.7-5" />
                  <path d="M12 22V12" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                  {t('share.package_title')}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary, #6B7280)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {profile === 'full_vault'
                    ? t('share.profile_full_vault_desc')
                    : t('share.profile_shareable_desc')}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {/* Profile selector dropdown styled like reference image */}
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value as 'full_vault' | 'community_shareable')}
                  aria-label={t('share.package_profile_aria')}
                  style={{
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 6px center',
                    backgroundSize: '12px',
                    padding: '5px 22px 5px 8px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 500,
                    backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                    color: 'var(--color-text-primary, #374151)',
                    border: '1px solid var(--color-border, #E5E7EB)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="full_vault">{t('share.profile_full_vault')}</option>
                  <option value="community_shareable">{t('share.profile_shareable')}</option>
                </select>

                <button
                  type="button"
                  onClick={handleExportTripPackage}
                  disabled={isExportingTrip}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-text-primary, #111827)',
                    color: 'var(--color-surface, #FFFFFF)',
                    border: 'none',
                    cursor: isExportingTrip ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: isExportingTrip ? 0.7 : 1,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  {isExportingTrip ? (
                    t('share.exporting')
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>{t('share.export_btn')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {tripError && (
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-danger, #EF4444)',
                  paddingLeft: '54px',
                }}
              >
                {tripError}
              </div>
            )}

            {/* Row 2: Printable Itinerary (.pdf) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 6px',
                borderRadius: '16px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent-coral, #E06C53)',
                  flexShrink: 0,
                  border: '1px solid var(--color-border, #E5E7EB)',
                }}
              >
                {/* Printer / Document icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                  {t('share.printable_title')}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary, #6B7280)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t('share.printable_desc')}
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                    color: 'var(--color-text-primary, #374151)',
                    border: '1px solid var(--color-border, #E5E7EB)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-border, #E5E7EB)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary, #F3F4F6)';
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span>{t('share.print_btn')}</span>
                </button>
              </div>
            </div>

            {/* Row 3: Calendar Feed (.ics) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 6px',
                borderRadius: '16px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-gold, #E2B33C)',
                  flexShrink: 0,
                  border: '1px solid var(--color-border, #E5E7EB)',
                }}
              >
                {/* Calendar icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                  {t('share.calendar_title')}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary, #6B7280)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t('share.calendar_desc')}
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleExportIcs}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                    color: 'var(--color-text-primary, #374151)',
                    border: '1px solid var(--color-border, #E5E7EB)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-border, #E5E7EB)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary, #F3F4F6)';
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{t('share.export_btn')}</span>
                </button>
              </div>
            </div>

            {/* Row 4: Raw JSON (.json) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 6px',
                borderRadius: '16px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-ocean, #1B8FA6)',
                  flexShrink: 0,
                  border: '1px solid var(--color-border, #E5E7EB)',
                }}
              >
                {/* Code / JSON Brackets icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                  {t('share.json_title')}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary, #6B7280)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t('share.json_desc')}
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleExportJson}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                    color: 'var(--color-text-primary, #374151)',
                    border: '1px solid var(--color-border, #E5E7EB)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-border, #E5E7EB)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary, #F3F4F6)';
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{t('share.export_btn')}</span>
                </button>
              </div>
            </div>

            {/* Row 5: GPX Route & Waypoints (.gpx) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 6px',
                borderRadius: '16px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent-primary, #0F4C5C)',
                  flexShrink: 0,
                  border: '1px solid var(--color-border, #E5E7EB)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                  <line x1="9" y1="3" x2="9" y2="18" />
                  <line x1="15" y1="6" x2="15" y2="21" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                  {t('share.gpx_title')}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary, #6B7280)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t('share.gpx_desc')}
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleExportGpx}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                    color: 'var(--color-text-primary, #374151)',
                    border: '1px solid var(--color-border, #E5E7EB)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{t('share.export_btn')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </DemoFeatureGate>

        {/* Bottom Bar: Link input & Copy link button matching reference image */}
        <div
          style={{
            borderTop: '1px solid var(--color-border, #E5E7EB)',
            paddingTop: '16px',
            marginTop: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: 'var(--color-bg-secondary, #F9FAFB)',
              border: '1px solid var(--color-border, #E5E7EB)',
              borderRadius: '14px',
              padding: '8px 12px',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary, #6B7280)',
              fontFamily: 'var(--font-mono, monospace)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              userSelect: 'all',
            }}
            title={currentUrl}
          >
            {currentUrl || 'https://...'}
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: copiedLink ? 'var(--color-success, #1F7A4D)' : 'var(--color-bg-secondary, #F3F4F6)',
              color: copiedLink ? '#FFFFFF' : 'var(--color-text-primary, #111827)',
              border: '1px solid var(--color-border, #E5E7EB)',
              borderRadius: '14px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {copiedLink ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{t('common.copied')}</span>
              </>
            ) : (
              <>
                {/* Slanted chain link icon matching screenshot */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span>{t('share.copy_link')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
