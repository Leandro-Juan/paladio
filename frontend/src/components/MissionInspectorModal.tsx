"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount, useEscapeAndFocusReturn } from '@/hooks/useAnimatedMount';
import { Trip } from '@/hooks/useTrips';
import { countWaypoints, isTripCompleted } from '@/utils/tripParser';
import { TripStatus, calculateTripDurationDays, downloadTripIcs } from '@/utils/calendarUtils';
import { CloseIcon, ChevronRightIcon } from '@/components/icons';

interface MissionInspectorModalProps {
  isOpen: boolean;
  trip: Trip | null;
  status: TripStatus;
  onClose: () => void;
}

export function MissionInspectorModal({ isOpen, trip, status, onClose }: MissionInspectorModalProps) {
  const { t, locale } = useTranslation();
  const [cachedTrip, setCachedTrip] = useState<Trip | null>(trip);
  if (trip && trip !== cachedTrip) {
    setCachedTrip(trip);
  }
  const activeTrip = trip ?? cachedTrip;
  const { shouldRender, dataState } = useAnimatedMount(isOpen && Boolean(activeTrip), 150);
  useEscapeAndFocusReturn(isOpen && Boolean(activeTrip), onClose);

  if (!shouldRender || !activeTrip) return null;

  const durationDays = calculateTripDurationDays(activeTrip.start_date, activeTrip.end_date);
  const waypoints = countWaypoints(activeTrip.itinerary_data);
  const dateLocale = locale === 'en' ? undefined : locale;

  const statusConfig = {
    UPCOMING: {
      label: t('calendar.status_queued_protocol'),
      bg: 'rgba(15, 76, 92, 0.1)',
      border: 'var(--color-accent-teal-soft)',
      text: 'var(--color-accent-primary)',
    },
    ACTIVE: {
      label: t('calendar.status_active_mission'),
      bg: 'rgba(31, 122, 77, 0.12)',
      border: 'var(--color-success)',
      text: 'var(--color-success)',
    },
    COMPLETED: {
      label: t('calendar.status_completed_archive'),
      bg: 'transparent',
      border: 'var(--color-border)',
      text: 'var(--color-text-muted)',
    },
  }[status];

  return (
    <div
      className="paladio-modal-backdrop"
      data-state={dataState}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(8, 28, 36, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border-subtle paladio-modal-panel"
        data-state={dataState}
        style={{
          width: '100%',
          maxWidth: '480px',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <span
              className="font-mono"
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: statusConfig.bg,
                border: `1px solid ${statusConfig.border}`,
                color: statusConfig.text,
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              {statusConfig.label}
            </span>
            <h3 className="font-display" style={{ fontSize: '1.65rem', fontWeight: 300, marginTop: '0.5rem', marginBottom: 0, color: 'var(--color-text-primary)' }}>
              {activeTrip.destination}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label={t('calendar.close_inspector')}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            padding: '1.25rem',
            background: 'var(--color-bg-main)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>{t('calendar.timeframe')}</span>
            <p className="font-mono text-xs font-semibold" style={{ marginTop: '2px', color: 'var(--color-text-primary)' }}>
              {new Date(activeTrip.start_date).toLocaleDateString(dateLocale)} - {new Date(activeTrip.end_date).toLocaleDateString(dateLocale)}
            </p>
          </div>
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>{t('calendar.duration')}</span>
            <p className="font-mono text-xs font-semibold" style={{ marginTop: '2px', color: 'var(--color-text-primary)' }}>
              {durationDays === 1
                ? t('calendar.duration_day_singular')
                : t('calendar.duration_days_plural', { count: durationDays })}
            </p>
          </div>
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>{t('calendar.waypoints_pois')}</span>
            <p className="font-mono text-xs font-semibold" style={{ marginTop: '2px', color: 'var(--color-text-primary)' }}>
              {t('calendar.optimized_stops', { count: waypoints })}
            </p>
          </div>
          <div>
            <span className="font-mono text-muted text-xs" style={{ display: 'block' }}>{t('calendar.system_id')}</span>
            <p className="font-mono text-muted text-xs" style={{ marginTop: '2px' }}>
              {activeTrip.id ? activeTrip.id.slice(0, 8) : t('calendar.ephemeral')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activeTrip.id && (
            <Link
              href={isTripCompleted(activeTrip) ? `/vault/${activeTrip.id}` : `/trips/${activeTrip.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--color-accent-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
            >
              {t('calendar.view_full_mission_dossier')} <ChevronRightIcon size={14} />
            </Link>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => downloadTripIcs(activeTrip)}
              style={{
                flex: 1,
                padding: '0.6rem 1rem',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {t('calendar.export_ics_calendar')}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              {t('calendar.close_upper')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
