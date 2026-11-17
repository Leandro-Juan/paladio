"use client";

import React from 'react';
import { GtfsRegistryResponse, CityGtfsItem } from '@/utils/api';
import { Spinner, ClockIcon, LightningIcon, RefreshIcon, CheckIcon } from '@/components/icons';
import { SyncGtfsTripsModal } from '@/components/SyncGtfsTripsModal';
import { SettingsHeader } from '../SettingsHeader';

interface TransitSectionProps {
  onBackToOverview: () => void;
  gtfsTelemetry: GtfsRegistryResponse | null;
  gtfsMessage: { type: 'success' | 'error'; text: string } | null;
  setGtfsMessage: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>;
  fetchGtfsData: (silent?: boolean) => Promise<void>;
  deleteGtfsCandidate: CityGtfsItem | null;
  setDeleteGtfsCandidate: React.Dispatch<React.SetStateAction<CityGtfsItem | null>>;
  deletingGtfs: boolean;
  handleDeleteGtfs: () => Promise<void>;
  syncTripsModalOpen: boolean;
  setSyncTripsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function TransitSection({
  onBackToOverview,
  gtfsTelemetry,
  gtfsMessage,
  setGtfsMessage,
  fetchGtfsData,
  deleteGtfsCandidate,
  setDeleteGtfsCandidate,
  deletingGtfs,
  handleDeleteGtfs,
  syncTripsModalOpen,
  setSyncTripsModalOpen,
}: TransitSectionProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title="City Data & Storage Vault"
        onBackToOverview={onBackToOverview}
        actions={
          <button
            data-testid="sync-gtfs-trips-btn"
            onClick={() => setSyncTripsModalOpen(true)}
            className="font-mono"
            style={{
              padding: '8px 14px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <RefreshIcon size={13} /> SYNC WITH PLANNED TRIPS
          </button>
        }
      />

      <div className="bg-surface border-subtle" style={{ borderRadius: '10px', padding: '1.5rem' }}>
        {/* Action feedback message */}
        {gtfsMessage && (
          <div
            style={{
              background: gtfsMessage.type === 'success' ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
              border: `1px solid ${gtfsMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
              color: gtfsMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '12px',
            }}
          >
            {gtfsMessage.text}
          </div>
        )}

        {/* Live Compilation Process Banner */}
        {gtfsTelemetry?.has_active_process ? (
          <div
            data-testid="gtfs-active-process-banner"
            style={{
              background: 'var(--color-accent-gold-soft)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <LightningIcon size={18} color="var(--color-accent-gold)" />
              <div>
                <span
                  className="font-mono"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--color-accent-gold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE DOWNLOAD PROCESS DETECTED ({gtfsTelemetry.active_processes_count})
                </span>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Downloading and ingesting GTFS transit data for: <strong>{gtfsTelemetry.active_cities.join(', ')}</strong>. Lines, stops, and schedules are being indexed in PostgreSQL.
                </p>
              </div>
            </div>
            <span
              className="font-mono"
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'var(--color-accent-gold-soft)',
                color: 'var(--color-accent-gold)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              DOWNLOADING LIVE
            </span>
          </div>
        ) : (
          <div
            data-testid="gtfs-idle-banner"
            style={{
              background: 'var(--color-success-soft)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--color-success)',
                  display: 'inline-block',
                }}
              />
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>
                ALL GTFS SCHEDULES IDLE — NO ACTIVE DOWNLOADS
              </span>
            </div>
            <span className="font-mono text-muted" style={{ fontSize: '11px' }}>
              {gtfsTelemetry?.compiled_cities || 0} DOWNLOADED & READY
            </span>
          </div>
        )}

        {/* Storage & Dataset Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', padding: '0.85rem' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px' }}>TRACKED CITIES</span>
            <div className="font-display" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {gtfsTelemetry?.total_cities ?? 0}
            </div>
            <div className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
              {gtfsTelemetry?.compiled_cities ?? 0} GTFS compiled
            </div>
          </div>
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', padding: '0.85rem' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px' }}>DISK STORAGE</span>
            <div className="font-display" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {formatBytes(gtfsTelemetry?.total_disk_bytes)}
            </div>
            <div className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
              GTFS feeds & OSM files
            </div>
          </div>
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', padding: '0.85rem' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px' }}>DATABASE STORAGE</span>
            <div className="font-display" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {formatBytes(gtfsTelemetry?.total_db_bytes)}
            </div>
            <div className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
              POIs, vectors & transit
            </div>
          </div>
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', padding: '0.85rem' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px' }}>COMBINED FOOTPRINT</span>
            <div className="font-display" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
              {formatBytes(gtfsTelemetry?.total_storage_bytes)}
            </div>
            <div className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
              Total disk + DB size
            </div>
          </div>
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', padding: '0.85rem' }}>
            <span className="font-mono text-muted" style={{ fontSize: '10px' }}>ACTIVE BACKGROUND TASKS</span>
            <div
              className="font-display"
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: (gtfsTelemetry?.active_processes_count || 0) > 0 ? 'var(--color-accent-gold)' : 'var(--color-text-primary)',
                marginTop: '4px',
              }}
            >
              {gtfsTelemetry?.active_processes_count ?? 0}
            </div>
            <div className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
              {gtfsTelemetry?.queued_cities || 0} queued
            </div>
          </div>
        </div>

        {/* Comprehensive City Storage Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>CITY</th>
                <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>POIS DATABASE</th>
                <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>TRANSIT & GTFS</th>
                <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>OSM ROAD GRAPH</th>
                <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>TOTAL STORAGE</th>
                <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const citiesList = [...(gtfsTelemetry?.cities || [])].sort(
                  (a, b) => (b.total_storage_bytes || 0) - (a.total_storage_bytes || 0)
                );
                if (citiesList.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                        No destination cities currently loaded in the database or filesystem.
                      </td>
                    </tr>
                  );
                }
                return citiesList.map((cityItem) => {
                  const isItemQueued = cityItem.gtfs_status === 'QUEUED' || cityItem.is_queued;
                  const isItemCompiling = !isItemQueued && cityItem.is_building;
                  const hasPois = (cityItem.poi_count || 0) > 0;
                  const hasGtfs = cityItem.is_compiled || cityItem.is_downloaded || (cityItem.disk_gtfs_bytes || 0) > 0;

                  return (
                    <tr key={cityItem.city} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      {/* CITY */}
                      <td style={{ padding: '12px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isItemQueued && <ClockIcon size={14} color="var(--color-accent-gold)" />}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{cityItem.display_name}</span>
                              {cityItem.country_code && (
                                <span
                                  className="font-mono"
                                  style={{
                                    fontSize: '9px',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    background: 'var(--color-surface-card)',
                                    border: '1px solid var(--color-border-subtle)',
                                    color: 'var(--color-text-muted)',
                                    fontWeight: 700,
                                  }}
                                >
                                  {cityItem.country_code}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-muted" style={{ fontSize: '10px', fontWeight: 400, marginTop: '2px' }}>
                              {cityItem.has_feed ? 'Open Data Transit Feed' : 'No Official Feed Mapped'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* POIS DATABASE */}
                      <td style={{ padding: '12px' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {hasPois ? `${cityItem.poi_count?.toLocaleString()} POIs` : '0 POIs'}
                          </div>
                          <div className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
                            {hasPois ? `${formatBytes(cityItem.poi_db_bytes)} (DB & vectors)` : 'Not ingested'}
                          </div>
                        </div>
                      </td>

                      {/* TRANSIT & GTFS */}
                      <td style={{ padding: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            {isItemQueued ? (
                              <span
                                className="font-mono"
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'var(--color-accent-gold-soft)',
                                  color: 'var(--color-accent-gold)',
                                  border: '1px solid var(--color-accent-gold)',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ClockIcon size={10} color="var(--color-accent-gold)" /> In Queue
                              </span>
                            ) : (
                              <span
                                className="font-mono"
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background:
                                    cityItem.gtfs_status === 'READY'
                                      ? 'var(--color-success-soft)'
                                      : isItemCompiling
                                      ? 'var(--color-accent-gold-soft)'
                                      : cityItem.gtfs_status === 'UNAVAILABLE' || cityItem.gtfs_status === 'FAILED'
                                      ? 'var(--color-danger-soft)'
                                      : 'var(--color-surface-page)',
                                  color:
                                    cityItem.gtfs_status === 'READY'
                                      ? 'var(--color-success)'
                                      : isItemCompiling
                                      ? 'var(--color-accent-gold)'
                                      : cityItem.gtfs_status === 'UNAVAILABLE' || cityItem.gtfs_status === 'FAILED'
                                      ? 'var(--color-danger)'
                                      : 'var(--color-text-muted)',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {isItemCompiling && <Spinner size={10} color="var(--color-accent-gold)" />}
                                {isItemCompiling ? 'DOWNLOADING' : cityItem.gtfs_status.toUpperCase()}
                              </span>
                            )}
                            {hasGtfs && (
                              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                {formatBytes(cityItem.disk_gtfs_bytes)} disk
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-muted" style={{ fontSize: '10px' }}>
                            {cityItem.transit_stations_count
                              ? `${cityItem.transit_stations_count.toLocaleString()} stations · ${cityItem.transit_lines_count || 0} lines`
                              : cityItem.is_compiled
                              ? 'Schedule indexed'
                              : 'No stations'}
                          </div>
                        </div>
                      </td>

                      {/* OSM ROAD GRAPH */}
                      <td style={{ padding: '12px' }}>
                        <div>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: cityItem.osm_status === 'READY' ? 'var(--color-success-soft)' : 'var(--color-surface-page)',
                              color: cityItem.osm_status === 'READY' ? 'var(--color-success)' : 'var(--color-text-muted)',
                              fontWeight: 600,
                              display: 'inline-block',
                              marginBottom: '3px',
                            }}
                          >
                            {cityItem.osm_status}
                          </span>
                          <div className="font-mono text-muted" style={{ fontSize: '10px' }}>
                            {(cityItem.disk_osm_bytes || 0) > 0 ? `${formatBytes(cityItem.disk_osm_bytes)} on disk` : 'Cached extract'}
                          </div>
                        </div>
                      </td>

                      {/* TOTAL STORAGE */}
                      <td style={{ padding: '12px' }}>
                        <div>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '11px',
                              padding: '3px 7px',
                              borderRadius: '4px',
                              background: (cityItem.total_storage_bytes || 0) > 0 ? 'var(--color-success-soft)' : 'var(--color-surface-page)',
                              color: (cityItem.total_storage_bytes || 0) > 0 ? 'var(--color-success)' : 'var(--color-text-muted)',
                              fontWeight: 700,
                              display: 'inline-block',
                              marginBottom: '2px',
                            }}
                          >
                            {formatBytes(cityItem.total_storage_bytes)}
                          </span>
                          <div className="font-mono text-muted" style={{ fontSize: '9px' }}>
                            {formatBytes(cityItem.total_disk_bytes)} disk · {formatBytes(cityItem.total_db_bytes)} DB
                          </div>
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {/* DELETE GTFS BUTTON (Preserves E2E test IDs and text: DELETE / STOP / CANCEL) */}
                          <button
                            data-testid={`delete-gtfs-btn-${cityItem.city}`}
                            onClick={() => setDeleteGtfsCandidate(cityItem)}
                            disabled={deletingGtfs && deleteGtfsCandidate?.city === cityItem.city}
                            className="font-mono"
                            title="Delete or cancel GTFS transit schedules and disk files"
                            style={{
                              padding: '5px 8px',
                              fontSize: '10px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-danger)',
                              background: 'var(--color-surface-card)',
                              color: 'var(--color-danger)',
                              fontWeight: 600,
                              cursor:
                                deletingGtfs && deleteGtfsCandidate?.city === cityItem.city
                                  ? 'not-allowed'
                                  : 'pointer',
                              opacity:
                                deletingGtfs && deleteGtfsCandidate?.city === cityItem.city ? 0.6 : 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            {deletingGtfs && deleteGtfsCandidate?.city === cityItem.city
                              ? isItemCompiling || isItemQueued
                              ? 'STOPPING...'
                              : 'DELETING...'
                              : isItemQueued
                              ? 'CANCEL'
                              : isItemCompiling
                              ? 'STOP'
                              : 'DELETE'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm GTFS Delete / Stop Dialog */}
      {deleteGtfsCandidate && (
        <div
          data-testid="gtfs-delete-modal"
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
              padding: '2rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: 'var(--shadow-modal)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-danger)' }}>
              {deleteGtfsCandidate.is_building || deleteGtfsCandidate.is_queued
                ? 'Stop GTFS Compilation'
                : 'Delete GTFS Transit Data'}
            </h3>
            <p style={{ fontSize: '13px', margin: '1rem 0', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
              {deleteGtfsCandidate.is_building || deleteGtfsCandidate.is_queued ? (
                <>
                  Are you sure you want to stop and cancel GTFS compilation for{' '}
                  <strong>{deleteGtfsCandidate.display_name}</strong>? Active background tasks will be terminated,
                  locks released, and temporary build files deleted.
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete compiled GTFS transit data for{' '}
                  <strong>{deleteGtfsCandidate.display_name}</strong>? This removes downloaded schedules and Valhalla
                  transit tiles.
                </>
              )}
            </p>
            <div
              className="font-mono text-muted"
              style={{
                fontSize: '11px',
                background: 'var(--color-surface-page)',
                padding: '8px 12px',
                borderRadius: '6px',
                marginBottom: '1.25rem',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              User trips, itineraries, and scraped hotel accommodations will remain safe and untouched.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteGtfsCandidate(null)}
                disabled={deletingGtfs}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-gtfs-btn"
                onClick={handleDeleteGtfs}
                disabled={deletingGtfs}
                className="font-display"
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-danger)',
                  color: 'var(--color-btn-primary-text)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: deletingGtfs ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingGtfs
                  ? deleteGtfsCandidate.is_building || deleteGtfsCandidate.is_queued
                    ? 'STOPPING...'
                    : 'DELETING...'
                  : deleteGtfsCandidate.is_building || deleteGtfsCandidate.is_queued
                  ? 'STOP & CLEAN UP'
                  : 'DELETE GTFS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync GTFS with Planned Trips Modal */}
      <SyncGtfsTripsModal
        isOpen={syncTripsModalOpen}
        onClose={() => setSyncTripsModalOpen(false)}
        onSyncSuccess={(msg) => {
          setGtfsMessage({ type: 'success', text: msg });
          fetchGtfsData(false);
        }}
      />
    </div>
  );
}
