'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { translate } from '@/stores/localeStore';
import { Spinner, CheckIcon, ClockIcon, CloseIcon, RefreshIcon } from '@/components/icons';
import {
  PlannedTripTransitItem,
  fetchPlannedTripsTransitStatusApi,
  syncPlannedGtfsApi,
} from '@/utils/api';

interface SyncGtfsTripsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess: (message: string) => void;
}

function SyncGtfsTripsModalContent({
  onClose,
  onSyncSuccess,
}: Omit<SyncGtfsTripsModalProps, 'isOpen'>) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<PlannedTripTransitItem[]>([]);
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await fetchPlannedTripsTransitStatusApi();
        if (ignore) return;
        setTrips(data);
        const initialSelected = new Set<string>();
        data.forEach((trip) => {
          if (!trip.is_downloaded && trip.gtfs_status !== 'READY') {
            initialSelected.add(trip.trip_id);
          }
        });
        setSelectedTripIds(initialSelected);
      } catch (err: unknown) {
        if (ignore) return;
        const msg = err instanceof Error ? err.message : translate('vault.gtfs_load_failed');
        setError(msg);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const toggleTrip = (tripId: string) => {
    setSelectedTripIds((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) {
        next.delete(tripId);
      } else {
        next.add(tripId);
      }
      return next;
    });
  };

  const handleSelectAllMissing = () => {
    const next = new Set<string>();
    trips.forEach((t) => {
      if (!t.is_downloaded && t.gtfs_status !== 'READY') {
        next.add(t.trip_id);
      }
    });
    setSelectedTripIds(next);
  };

  const handleSelectAll = () => {
    if (selectedTripIds.size === trips.length) {
      setSelectedTripIds(new Set());
    } else {
      setSelectedTripIds(new Set(trips.map((t) => t.trip_id)));
    }
  };

  const selectedCount = selectedTripIds.size;

  const handleConfirmSync = async () => {
    if (selectedCount === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const selectedTrips = trips.filter((t) => selectedTripIds.has(t.trip_id));
      const citiesToSync = Array.from(
        new Set(selectedTrips.map((t) => t.city_clean || t.destination.trim().toLowerCase()))
      );

      const res = await syncPlannedGtfsApi(citiesToSync);
      onSyncSuccess(
        res.message || t('vault.gtfs_sync_initiated', { count: citiesToSync.length })
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('vault.gtfs_sync_failed');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="sync-gtfs-trips-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-scrim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-card)',
          borderRadius: '16px',
          padding: '1.75rem',
          width: '100%',
          maxWidth: '560px',
          boxShadow: 'var(--shadow-modal)',
          border: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
              {t('vault.gtfs_sync_title')}
            </h3>
            <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '4px', margin: 0 }}>
              {t('vault.gtfs_sync_subtitle')}
            </p>
          </div>
          <button
            data-testid="close-sync-modal-btn"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={t('common.close')}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              background: 'var(--color-danger-soft)',
              border: '1px solid var(--color-danger)',
              color: 'var(--color-danger)',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: '160px', marginBottom: '1.25rem' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', gap: '12px' }}>
              <Spinner size={24} color="var(--color-accent-gold)" />
              <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {t('vault.gtfs_checking_cache')}
              </span>
            </div>
          ) : trips.length === 0 ? (
            <div data-testid="no-planned-trips-msg" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--color-text-muted)' }}>
              <p style={{ margin: 0, fontSize: '13px' }}>{t('vault.gtfs_no_planned_trips')}</p>
              <p className="font-mono" style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>
                {t('vault.gtfs_create_trips_first')}
              </p>
            </div>
          ) : (
            <div>
              {/* Quick actions bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {trips.length === 1 ? t('vault.gtfs_planned_trip_one', { count: trips.length }) : t('vault.gtfs_planned_trip_many', { count: trips.length })}
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleSelectAllMissing}
                    className="font-mono"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent-gold)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {t('vault.gtfs_select_missing')}
                  </button>
                  <span style={{ color: 'var(--color-border-subtle)', fontSize: '11px' }}>|</span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="font-mono"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {selectedTripIds.size === trips.length ? t('vault.gtfs_deselect_all') : t('vault.gtfs_select_all')}
                  </button>
                </div>
              </div>

              {/* Trip checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {trips.map((trip) => {
                  const isChecked = selectedTripIds.has(trip.trip_id);
                  const isReady = trip.is_downloaded || trip.gtfs_status === 'READY';
                  const isBuilding = trip.is_building || trip.gtfs_status === 'BUILDING';
                  const isQueued = trip.is_queued || trip.gtfs_status === 'QUEUED';

                  return (
                    <label
                      key={trip.trip_id}
                      data-testid={`sync-trip-item-${trip.trip_id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: isChecked
                          ? '1px solid var(--color-accent-gold)'
                          : '1px solid var(--color-border-subtle)',
                        background: isChecked
                          ? 'var(--color-accent-gold-soft)'
                          : 'var(--color-surface-elevated, rgba(255, 255, 255, 0.02))',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          data-testid={`sync-trip-checkbox-${trip.trip_id}`}
                          checked={isChecked}
                          onChange={() => toggleTrip(trip.trip_id)}
                          style={{
                            cursor: 'pointer',
                            accentColor: 'var(--color-accent-gold)',
                            width: '15px',
                            height: '15px',
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {trip.destination}
                          </div>
                          {(trip.start_date || trip.end_date) && (
                            <div className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                              {trip.start_date || t('vault.tbd')} → {trip.end_date || t('vault.tbd')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isReady ? (
                          <span
                            data-testid={`trip-status-ready-${trip.trip_id}`}
                            className="font-mono"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'var(--color-success-soft)',
                              color: 'var(--color-success)',
                              border: '1px solid rgba(74, 222, 128, 0.2)',
                            }}
                          >
                            <CheckIcon size={11} color="var(--color-success)" /> {t('vault.gtfs_status_ready')}
                          </span>
                        ) : isBuilding ? (
                          <span
                            className="font-mono"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'var(--color-accent-gold-soft)',
                              color: 'var(--color-accent-gold)',
                              border: '1px solid rgba(234, 179, 8, 0.2)',
                            }}
                          >
                            <Spinner size={11} color="var(--color-accent-gold)" /> {t('vault.gtfs_status_downloading')}
                          </span>
                        ) : isQueued ? (
                          <span
                            className="font-mono"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'var(--color-accent-gold-soft)',
                              color: 'var(--color-accent-gold)',
                              border: '1px solid rgba(234, 179, 8, 0.2)',
                            }}
                          >
                            <ClockIcon size={11} color="var(--color-accent-gold)" /> {t('vault.gtfs_status_queued')}
                          </span>
                        ) : (
                          <span
                            data-testid={`trip-status-missing-${trip.trip_id}`}
                            className="font-mono"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: 'var(--color-danger)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                            }}
                          >
                            {t('vault.gtfs_status_not_downloaded')}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button
            type="button"
            data-testid="cancel-sync-modal-btn"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid var(--color-border-subtle)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: '12px',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-testid="confirm-sync-gtfs-btn"
            onClick={handleConfirmSync}
            disabled={submitting || selectedCount === 0}
            className="font-display"
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: selectedCount > 0 ? 'var(--color-accent-gold)' : 'var(--color-border-subtle)',
              color: selectedCount > 0 ? '#000000' : 'var(--color-text-muted)',
              fontWeight: 600,
              fontSize: '12px',
              cursor: submitting || selectedCount === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {submitting ? (
              <>
                <Spinner size={13} color="#000000" /> {t('vault.gtfs_triggering')}
              </>
            ) : (
              <>
                <RefreshIcon size={13} color={selectedCount > 0 ? '#000000' : 'var(--color-text-muted)'} />
                {t('vault.gtfs_download_count', { count: selectedCount })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SyncGtfsTripsModal({
  isOpen,
  onClose,
  onSyncSuccess,
}: SyncGtfsTripsModalProps) {
  if (!isOpen) return null;

  return (
    <SyncGtfsTripsModalContent
      onClose={onClose}
      onSyncSuccess={onSyncSuccess}
    />
  );
}
