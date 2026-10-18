"use client";

import React from 'react';
import {
  RouteItem,
  RouteStats,
  RouteHistory,
  RouteCalendar,
  RouteEvent,
} from '@/hooks/useRouteMonitoring';
import { RadialPriceGauge } from './RadialPriceGauge';
import { PriceTrendGraph } from './PriceTrendGraph';
import { MonitoringCalendar } from './MonitoringCalendar';
import {
  CloseIcon,
  Spinner,
  RadarIcon,
} from '@/components/icons';
import styles from './RouteInspectorDrawer.module.css';

interface RouteInspectorDrawerProps {
  route: RouteItem;
  stats: RouteStats | null;
  history: RouteHistory | null;
  calendar: RouteCalendar | null;
  events: RouteEvent[];
  isScanning: boolean;
  onClose: () => void;
  onTriggerScan: (id: string) => Promise<void>;
  onToggleActive: (id: string, is_active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onHistoryRangeChange?: (range: '24h' | '7d' | '30d' | '90d') => void;
  onMonthsCountChange?: (count: number) => void;
}

export function RouteInspectorDrawer({
  route,
  stats,
  history,
  calendar,
  events,
  isScanning,
  onClose,
  onTriggerScan,
  onToggleActive,
  onDelete,
  onHistoryRangeChange,
  onMonthsCountChange,
}: RouteInspectorDrawerProps) {
  const isDeal = route.status === 'DEAL';
  const isPaused = !route.is_active;

  return (
    <aside className={styles.drawerBackdrop} onClick={onClose} aria-label="Route details inspector">
      <div className={styles.drawerCard} onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.routeAvatar}>
              <span>{route.origin_iata.slice(0, 1)}{route.destination_code.slice(0, 1)}</span>
            </div>
            <div>
              <div className={styles.titleRow}>
                <h3 className={styles.routeTitle}>
                  {route.origin_iata} → {route.destination_code}
                </h3>
                <span
                  className={`${styles.statusBadge} ${
                    isDeal ? styles.badgeDeal : isPaused ? styles.badgePaused : styles.badgeActive
                  }`}
                >
                  <span className={styles.statusDot} />
                  {route.status}
                </span>
              </div>
              <span className={styles.routeMeta}>
                {route.destination_name} · RID-{route.id.slice(0, 8)} · Budget €{route.max_budget_eur.toFixed(0)}
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => onTriggerScan(route.id)}
              disabled={isScanning}
              title="Run on-demand flight scan"
              aria-label="Scan route now"
            >
              {isScanning ? <Spinner size={14} /> : <RadarIcon size={14} />}
              <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
            </button>

            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => onToggleActive(route.id, !route.is_active)}
              title={route.is_active ? 'Pause monitoring' : 'Resume monitoring'}
              aria-label={route.is_active ? 'Pause' : 'Resume'}
            >
              <span>{route.is_active ? 'Pause' : 'Resume'}</span>
            </button>

            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close inspector"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className={styles.drawerScrollBody}>
          {/* Section 1: Radial Price Gauge */}
          <div className={styles.sectionBlock}>
            <RadialPriceGauge
              percentile={stats?.current_percentile ?? null}
              currentPrice={stats?.current_price_eur ?? route.current_price_eur}
              p10Deal={stats?.p10_deal_eur ?? route.baseline_p10_eur}
              p50Median={stats?.p50_median_eur ?? route.baseline_p50_eur}
              p90Peak={stats?.p90_peak_eur ?? null}
            />
          </div>

          {/* Section 2: Multi-Month Price Matrix Calendar */}
          <div className={styles.sectionBlock}>
            <MonitoringCalendar
              calendar={calendar}
              onMonthsCountChange={onMonthsCountChange}
            />
          </div>

          {/* Section 3: Price Trend Graph */}
          {history && history.points.length > 0 && (
            <div className={styles.sectionBlock}>
              <PriceTrendGraph
                points={history.points}
                p10Deal={history.p10_deal_eur}
                p50Median={history.p50_median_eur}
                p90Peak={history.p90_peak_eur}
                forwardCurve={history.forward_curve}
                corpus={history.corpus}
                verdict={history.verdict}
                onRangeChange={onHistoryRangeChange}
              />
            </div>
          )}

          {/* Section 4: Telemetry Statistics Grid */}
          <div className={styles.sectionBlock}>
            <div className={styles.telemetryCardHeader}>
              <span className={styles.telemetryTag} aria-hidden="true">{"// ROUTE_METRIC_TELEMETRY"}</span>
              <h4 className={styles.sectionTitle}>Telemetry & Market Statistics</h4>
            </div>

            <div className={styles.telemetryGrid}>
              <div className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>Lowest Recorded Fare</span>
                <span className={styles.telemetryValue}>
                  {stats?.lowest_ever_eur !== null ? `€${stats?.lowest_ever_eur?.toFixed(2)}` : '--'}
                </span>
                <span className={styles.telemetrySub}>
                  {stats?.lowest_ever_date ? `Observed ${stats.lowest_ever_date}` : 'All-time low'}
                </span>
              </div>

              <div className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>30-Day Median Baseline</span>
                <span className={styles.telemetryValue}>
                  {stats?.p50_median_eur !== null ? `€${stats?.p50_median_eur?.toFixed(2)}` : '--'}
                </span>
                <span className={styles.telemetrySub}>Route fair value anchor</span>
              </div>

              <div className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>Total Observations</span>
                <span className={styles.telemetryValue}>
                  {stats?.total_observations ? stats.total_observations.toLocaleString() : route.ticks_count}
                </span>
                <span className={styles.telemetrySub}>Verified price ticks</span>
              </div>

              <div className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>Landed Fee Ratio</span>
                <span className={styles.telemetryValue}>
                  {stats?.landed_fee_ratio ? `${stats.landed_fee_ratio.toFixed(2)}x` : '1.15x'}
                </span>
                <span className={styles.telemetrySub}>Taxes & carry-on luggage</span>
              </div>

              <div className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>Next Scheduled Scan</span>
                <span className={styles.telemetryValue}>
                  {stats?.next_scan_minutes !== undefined ? `In ${stats.next_scan_minutes}m` : 'Scheduled'}
                </span>
                <span className={styles.telemetrySub}>Celery Beat automated check</span>
              </div>

              <div className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>Itinerary Realism Score</span>
                <span className={styles.telemetryValue}>
                  {stats?.itinerary_realism_score !== null ? `${stats?.itinerary_realism_score?.toFixed(1)} / 10` : 'Pending'}
                </span>
                <span className={styles.telemetrySub}>Air-gap verified pipeline</span>
              </div>
            </div>
          </div>

          {/* Section 5: Recent Activity & Deal Events */}
          <div className={styles.sectionBlock}>
            <div className={styles.telemetryCardHeader}>
              <span className={styles.telemetryTag} aria-hidden="true">{"// RECENT_ROUTE_ACTIVITY"}</span>
              <h4 className={styles.sectionTitle}>Observation Audit Feed</h4>
            </div>

            <div className={styles.eventsContainer}>
              {events.length === 0 ? (
                <p className={styles.emptyEvents}>No recent observations logged yet.</p>
              ) : (
                <div className={styles.eventsTable}>
                  {events.map((ev) => (
                    <div key={ev.id} className={styles.eventRow}>
                      <div className={styles.eventInfo}>
                        <span className={styles.eventTitle}>{ev.title}</span>
                        <span className={styles.eventDetails}>{ev.details}</span>
                      </div>
                      <div className={styles.eventMeta}>
                        <span
                          className={`${styles.eventBadge} ${
                            ev.result === 'DEAL' ? styles.badgeDeal : styles.badgeOk
                          }`}
                        >
                          {ev.result}
                        </span>
                        <span className={styles.eventTime}>{ev.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone: Delete Route */}
          <div className={styles.dangerZone}>
            <div>
              <span className={styles.dangerTitle}>Unmonitor Route</span>
              <span className={styles.dangerSub}>Permanently delete this route alert and stop automated scans.</span>
            </div>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => onDelete(route.id)}
            >
              Delete Route
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
