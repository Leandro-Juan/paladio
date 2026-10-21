"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  RouteItem,
  RouteStats,
  RouteHistory,
  RouteCalendar,
  RouteEvent,
  DealPackage,
} from '@/hooks/useRouteMonitoring';
import { PriceTrendGraph } from './PriceTrendGraph';
import { RouteTelemetryCards } from './RouteTelemetryCards';
import { MonitoringCalendar } from './MonitoringCalendar';
import { DealPackageNavigator } from './DealPackageNavigator';
import { VerdictBadge } from './VerdictBadge';
import { Spinner, RadarIcon, TrendingDownIcon } from '@/components/icons';
import styles from './RouteFullScreenView.module.css';
import monitoringStyles from '@/app/monitoring/Monitoring.module.css';

interface RouteFullScreenViewProps {
  route: RouteItem;
  deal?: DealPackage | null;
  routeDeals?: DealPackage[];
  stats: RouteStats | null;
  history: RouteHistory | null;
  calendar: RouteCalendar | null;
  events: RouteEvent[];
  isScanning: boolean;
  isBackfilling?: boolean;
  onBack: () => void;
  onTriggerBackfill?: (id: string) => Promise<void>;
  onToggleActive: (id: string, is_active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDiscardDeal?: (id: string) => Promise<void> | void;
  onHistoryRangeChange?: (range: '24h' | '7d' | '30d' | '90d') => void;
  onMonthsCountChange?: (count: number) => void;
  onViewChange?: (view: 'outbound' | 'inbound' | 'roundtrip', pricing: 'flights' | 'package', monthsCount: number) => void;
}

export function RouteFullScreenView({
  route,
  deal,
  routeDeals = [],
  stats,
  history,
  calendar,
  events,
  isScanning,
  isBackfilling,
  onBack,
  onTriggerBackfill,
  onToggleActive,
  onDelete,
  onDiscardDeal,
  onHistoryRangeChange,
  onMonthsCountChange,
  onViewChange,
}: RouteFullScreenViewProps) {
  const router = useRouter();
  const isDeal = route.status === 'DEAL';
  const isActive = route.is_active;

  return (
    <div className={styles.container} role="region" aria-label={`Route detail for ${route.origin_iata} to ${route.destination_code}`}>
      {/* Top Navigation & Route Header Bar */}
      <div className={styles.topBar}>
        <div className={styles.leftGroup}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={onBack}
            aria-label="Back to monitored routes list"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Fleet Overview</span>
          </button>

          <div className={styles.routeTitleBlock}>
            <div className={styles.routeHeadingRow}>
              <h2 className={styles.routeIata}>
                {route.origin_iata} <span aria-hidden="true" style={{ opacity: 0.5 }}>→</span> {route.destination_code}
              </h2>

              <span
                className={`${styles.statusBadge} ${
                  isDeal
                    ? styles.statusDeal
                    : !isActive
                    ? styles.statusPaused
                    : route.status === 'PENDING'
                    ? styles.statusPending
                    : styles.statusActive
                }`}
              >
                {isDeal ? 'DEAL ACTIVE' : route.status || 'MONITORING'}
              </span>

              {(history?.verdict?.verdict || route.verdict) && (
                <VerdictBadge
                  verdict={(history?.verdict?.verdict ?? route.verdict)!}
                  percentile={history?.verdict?.percentile ?? route.verdict_percentile}
                  confidence={history?.verdict?.confidence ?? route.verdict_confidence}
                />
              )}
            </div>
            <span className={styles.routeSub}>
              {route.destination_name} · RID-{route.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <div className={styles.budgetBadge}>
            <span>Budget Ceiling: €{route.max_budget_eur.toFixed(0)}</span>
          </div>



          <button
            type="button"
            className={styles.pauseBtn}
            onClick={() => onToggleActive(route.id, !route.is_active)}
          >
            {route.is_active ? 'Pause' : 'Resume'}
          </button>

          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => {
              if (window.confirm(`Delete route monitor for ${route.origin_iata} -> ${route.destination_code}?`)) {
                onDelete(route.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Main Content Stack */}
      <div className={styles.contentStack}>
        {/* Section 0: Top Verified Deal Packages Navigator (Best Package First, with < 1/3 > pagination) */}
        <DealPackageNavigator
          deals={routeDeals && routeDeals.length > 0 ? routeDeals : (deal ? [deal] : [])}
          onDiscardDeal={onDiscardDeal}
        />

        {/* Section 1: Wide Price Trajectory Graph with Synchronized Lodging Curve */}
        <div className={styles.sectionBlock}>
          <PriceTrendGraph
            forwardCurve={history?.forward_curve}
            lodgingCurve={history?.lodging_curve}
            p10Deal={history?.p10_deal_eur ?? null}
            p50Median={history?.p50_median_eur ?? null}
            p90Peak={history?.p90_peak_eur ?? null}
            corpus={history?.corpus}
            verdict={history?.verdict}
            currency="EUR"
            onTriggerBackfill={onTriggerBackfill ? () => onTriggerBackfill(route.id) : undefined}
            isBackfilling={isBackfilling}
          />
        </div>

        {/* Section 2: 3-Column Telemetry Cards with micro-sparklines (matching reference Image 2) */}
        <RouteTelemetryCards
          route={route}
          stats={stats}
          history={history}
          currency="EUR"
        />

        {/* Section 3: Full-Width Multi-Month Calendar Matrix */}
        <div className={styles.sectionBlock}>
          <MonitoringCalendar
            calendar={calendar}
            onMonthsCountChange={onMonthsCountChange}
            onViewChange={onViewChange}
            onPlanItinerary={(day) => {
              const query = new URLSearchParams({
                destination: route.destination_code || route.destination_name,
                origin: route.origin_iata,
                startDate: day.date,
                ...(day.return_date ? { endDate: day.return_date } : {}),
              });
              router.push(`/trip/new?${query.toString()}`);
            }}
          />
        </div>

        {/* Section 4: Observation Audit Feed */}
        <section className={styles.auditSection} aria-label="Route observations audit feed">
          <div className={styles.auditHeader}>
            <span className={styles.auditSubtitle}>{"// TELEMETRY_OBSERVATION_STREAM"}</span>
            <h4 className={styles.auditTitle}>Observation Audit Feed</h4>
          </div>

          <div className={styles.eventsTable}>
            {events.length === 0 ? (
              <p className={styles.emptyEvents}>No recent observations logged for this corridor yet.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className={styles.eventRow}>
                  <div className={styles.eventInfo}>
                    <span className={styles.eventTitle}>{ev.title}</span>
                    <span className={styles.eventMeta}>
                      {ev.timestamp.replace('T', ' ').slice(0, 19)} · {ev.event_type}
                    </span>
                  </div>
                  {ev.result && (
                    <span className={styles.eventPriceTag}>{ev.result}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
