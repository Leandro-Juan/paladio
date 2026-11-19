"use client";

import React, { useState } from 'react';
import { TripTicket } from '@/hooks/useTripTickets';
import {
  RefreshIcon,
  AlertTriangleIcon,
  PlaneIcon,
  HotelIcon,
  MuseumIcon,
  TransitIcon,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

interface WalletSummaryBarProps {
  tickets: TripTicket[];
  onSyncItinerary?: () => Promise<void>;
  onOpenCreateModal?: () => void;
  hasItineraryDrift?: boolean;
}

export function WalletSummaryBar({
  tickets,
  onSyncItinerary,
  onOpenCreateModal,
  hasItineraryDrift = false,
}: WalletSummaryBarProps) {
  const { t } = useTranslation();
  const [isSyncing, setIsSyncing] = useState(false);

  const counts = {
    total: tickets.length,
    flight: tickets.filter((t) => t.ticket_type === 'flight').length,
    hotel: tickets.filter((t) => t.ticket_type === 'hotel').length,
    attraction: tickets.filter((t) => t.ticket_type === 'attraction').length,
    transit: tickets.filter((t) => t.ticket_type === 'transit').length,
  };

  const handleSync = async () => {
    if (!onSyncItinerary) return;
    setIsSyncing(true);
    try {
      await onSyncItinerary();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Drift Notification Banner if detected */}
      {hasItineraryDrift && (
        <div
          style={{
            background: 'rgba(226, 179, 60, 0.12)',
            border: '1px solid rgba(226, 179, 60, 0.3)',
            borderRadius: '8px',
            padding: '0.6rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-accent-secondary)' }}>
            <AlertTriangleIcon size={14} color="var(--color-accent-secondary)" />
            <span>
              <strong>{t('wallet.itinerary_drift_title')}</strong> {t('wallet.itinerary_drift_desc')}
            </span>
          </div>
          {onSyncItinerary && (
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-accent-secondary)',
                color: 'var(--color-accent-secondary)',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {isSyncing ? t('wallet.reconciling') : t('wallet.resync_itinerary')}
            </button>
          )}
        </div>
      )}

      {/* Main Bar */}
      <div
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '10px',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Metric Counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{t('wallet.total_tickets_label')}</span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--color-text-main)',
                background: 'var(--color-surface-subtle, var(--color-surface-card))',
                border: '1px solid var(--color-border-subtle)',
                padding: '1px 7px',
                borderRadius: '4px',
              }}
            >
              {counts.total}
            </span>
          </div>

          <div style={{ width: '1px', height: '14px', background: 'var(--color-border-subtle)' }} />

          <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            <span title={t('wallet.types.flight_label')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <PlaneIcon size={13} color="#0284C7" />
              <strong style={{ color: 'var(--color-text-main)' }}>{counts.flight}</strong>
            </span>
            <span title={t('wallet.stays_access_codes_title')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <HotelIcon size={13} color="#D97706" />
              <strong style={{ color: 'var(--color-text-main)' }}>{counts.hotel}</strong>
            </span>
            <span title={t('wallet.attraction_passes_title')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <MuseumIcon size={13} color="#059669" />
              <strong style={{ color: 'var(--color-text-main)' }}>{counts.attraction}</strong>
            </span>
            <span title={t('wallet.transit_passes_title')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <TransitIcon size={13} color="#7C3AED" />
              <strong style={{ color: 'var(--color-text-main)' }}>{counts.transit}</strong>
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onSyncItinerary && (
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              aria-label={t('wallet.sync_tickets_aria')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '6px',
                color: 'var(--color-text-main)',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                transition: 'background 0.15s ease',
              }}
            >
              <RefreshIcon size={12} color="var(--color-accent-primary)" className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? t('wallet.syncing') : t('wallet.sync_itinerary')}</span>
            </button>
          )}

          {onOpenCreateModal && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              aria-label={t('wallet.add_ticket_aria')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--color-accent-primary)',
                border: '1px solid var(--color-accent-primary)',
                borderRadius: '6px',
                color: 'var(--color-text-on-accent, #FFFFFF)',
                padding: '6px 14px',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 700,
                boxShadow: 'var(--shadow-sm)',
                transition: 'background 0.15s ease',
              }}
            >
              <span>{t('wallet.add_pass_btn')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
