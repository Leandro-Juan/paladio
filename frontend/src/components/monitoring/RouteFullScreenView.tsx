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
  LodgingSummary,
} from '@/hooks/useRouteMonitoring';
import { PriceTrendGraph } from './PriceTrendGraph';
import { RouteTelemetryCards } from './RouteTelemetryCards';
import { MonitoringCalendar } from './MonitoringCalendar';
import { DealPackageNavigator } from './DealPackageNavigator';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import styles from './RouteFullScreenView.module.css';

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
  userDefaultCurrency?: string;
  onBack: () => void;
  onTriggerBackfill?: (id: string) => Promise<void>;
  onToggleActive: (id: string, is_active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDiscardDeal?: (id: string) => Promise<void> | void;
  onHistoryRangeChange?: (range: '24h' | '7d' | '30d' | '90d') => void;
  onMonthsCountChange?: (count: number) => void;
  onViewChange?: (view: 'outbound' | 'inbound' | 'roundtrip', pricing: 'flights' | 'package', monthsCount: number) => void;
  onFetchLodging?: (checkIn: string, nights: number) => Promise<LodgingSummary | null>;
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
  userDefaultCurrency,
  onBack,
  onTriggerBackfill,
  onToggleActive,
  onDelete,
  onDiscardDeal,
  onHistoryRangeChange,
  onMonthsCountChange,
  onViewChange,
  onFetchLodging,
}: RouteFullScreenViewProps) {
  const router = useRouter();
  const isDeal = route.status === 'DEAL';
  const isActive = route.is_active;
  const activeCurrency = route.currency || history?.currency || calendar?.currency || userDefaultCurrency || 'EUR';

  return (
    <div className={styles.container} role="region" aria-label={`Route detail for ${route.origin_iata} to ${route.destination_code}`}>
      {/* Top Navigation & Route Header Bar */}
      <div className={styles.topBar}>
        <div className={styles.leftGroup}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => {
              onBack?.();
              router.push('/monitoring');
            }}
            aria-label="Back to Fleet Overview"
          >
            <ChevronLeftIcon size={14} aria-hidden="true" />
            <span>Fleet Overview</span>
          </button>

          <div className={styles.routeTitleBlock}>
            <div className={styles.routeHeadingRow}>
              <h2 className={styles.routeIata}>
                {route.origin_iata} <ChevronRightIcon size={14} style={{ opacity: 0.5 }} aria-hidden="true" /> {route.destination_code}
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
            </div>
            <span className={styles.routeSub}>
              {route.destination_name} · {route.earliest_date && route.latest_date ? `${route.earliest_date} → ${route.latest_date}` : 'Flexible Dates'} · {route.min_nights}–{route.max_nights}N · RID-{route.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <div className={styles.budgetBadge}>
            <span>Budget Ceiling: {formatCurrencyAmount(route.max_budget_eur, activeCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
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
          currency={activeCurrency}
          onDiscardDeal={onDiscardDeal}
        />

        {/* Section 1: Wide Airfare Price Trajectory Graph */}
        <div className={styles.sectionBlock}>
          <PriceTrendGraph
            forwardCurve={history?.forward_curve}
            p10Deal={history?.p10_deal_eur ?? null}
            p50Median={history?.p50_median_eur ?? null}
            p90Peak={history?.p90_peak_eur ?? null}
            corpus={history?.corpus}
            verdict={history?.verdict}
            currency={activeCurrency}
            onTriggerBackfill={onTriggerBackfill ? () => onTriggerBackfill(route.id) : undefined}
            isBackfilling={isBackfilling}
            earliestDate={route?.earliest_date}
            latestDate={route?.latest_date}
            minNights={route?.min_nights}
            maxNights={route?.max_nights}
          />
        </div>

        {/* Section 2: 3-Column Telemetry Cards with micro-sparklines (matching reference Image 2) */}
        <RouteTelemetryCards
          route={route}
          stats={stats}
          history={history}
          currency={activeCurrency}
        />

        {/* Section 3: Full-Width Multi-Month Calendar Matrix */}
        <div className={styles.sectionBlock}>
          <MonitoringCalendar
            calendar={calendar}
            currency={activeCurrency}
            onMonthsCountChange={onMonthsCountChange}
            onViewChange={onViewChange}
            onFetchLodging={onFetchLodging}
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
      </div>
    </div>
  );
}
