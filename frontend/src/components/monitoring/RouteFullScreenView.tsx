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
import { Spinner, RadarIcon, TrendingDownIcon } from '@/components/icons';
import styles from './RouteFullScreenView.module.css';
import monitoringStyles from '@/app/monitoring/Monitoring.module.css';

interface RouteFullScreenViewProps {
  route: RouteItem;
  deal?: DealPackage | null;
  stats: RouteStats | null;
  history: RouteHistory | null;
  calendar: RouteCalendar | null;
  events: RouteEvent[];
  isScanning: boolean;
  onBack: () => void;
  onTriggerScan: (id: string) => Promise<void>;
  onToggleActive: (id: string, is_active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onHistoryRangeChange?: (range: '24h' | '7d' | '30d' | '90d') => void;
  onMonthsCountChange?: (count: number) => void;
}

export function RouteFullScreenView({
  route,
  deal,
  stats,
  history,
  calendar,
  events,
  isScanning,
  onBack,
  onTriggerScan,
  onToggleActive,
  onDelete,
  onHistoryRangeChange,
  onMonthsCountChange,
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
            className={styles.scanBtn}
            onClick={() => onTriggerScan(route.id)}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <Spinner size={14} color="#FFFFFF" />
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <RadarIcon size={14} color="#FFFFFF" />
                <span>Scan Now</span>
              </>
            )}
          </button>

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
        {/* Active Verified Deal Package Card (if deal active for this route) */}
        {deal && (
          <div className={monitoringStyles.dealCard}>
            <div className={monitoringStyles.dealCardHeader}>
              <div className={monitoringStyles.dealHeaderLeft}>
                <div className={monitoringStyles.dealBadgeRow}>
                  <span className={monitoringStyles.dealTag}>
                    <span className={monitoringStyles.livePulseDot} />
                    VERIFIED DEAL PACKAGE FOUND
                  </span>
                  <span className={monitoringStyles.realismBadge}>
                    REALISM {deal.realism_score.toFixed(1)}/10
                  </span>
                </div>
                <h2 className={monitoringStyles.dealRouteTitle}>
                  <span>{deal.origin_name}</span>
                  <span className={monitoringStyles.dealRouteIata}>({deal.origin_iata})</span>
                  <span>→</span>
                  <span>{deal.destination_name}</span>
                  <span className={monitoringStyles.dealRouteIata}>({deal.destination_code})</span>
                </h2>
                <span className={monitoringStyles.dealDatesSub}>
                  {deal.depart_date} → {deal.return_date} · {deal.nights} Nights Package
                </span>
              </div>

              <div className={monitoringStyles.dealPriceComparisonBox}>
                <div className={monitoringStyles.dealPriceItem}>
                  <span className={monitoringStyles.dealPriceLabel}>Landed Package</span>
                  <span className={monitoringStyles.dealCurrentPrice}>€{deal.total_price_eur.toFixed(2)}</span>
                </div>
                <div className={monitoringStyles.dealPriceItem}>
                  <span className={monitoringStyles.dealPriceLabel}>30D Median</span>
                  <span className={monitoringStyles.dealMedianPrice}>€{deal.baseline_median_eur.toFixed(2)}</span>
                </div>
                <div className={monitoringStyles.dealSavingsHighlight}>
                  <span className={monitoringStyles.savingsPill}>
                    <TrendingDownIcon size={14} color="#FFFFFF" />
                    {deal.discount_pct.toFixed(0)}% OFF
                  </span>
                  <span className={monitoringStyles.savingsAmountText}>Save €{deal.savings_eur.toFixed(2)} vs typical</span>
                </div>
              </div>
            </div>

            {/* Dual Components: Flight + Hotel */}
            <div className={monitoringStyles.dealItemsGrid}>
              <div className={monitoringStyles.dealComponentCard}>
                <div className={monitoringStyles.componentHeader}>
                  <span className={monitoringStyles.componentTypeTitle}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                    </svg>
                    Flight Corridor
                  </span>
                  <span className={monitoringStyles.componentCarrierBadge}>
                    {deal.flight.airline} {deal.flight.flight_number ? `· ${deal.flight.flight_number}` : ''}
                  </span>
                </div>
                <div className={monitoringStyles.componentDetails}>
                  <span className={monitoringStyles.componentMainName}>
                    {deal.origin_name} to {deal.destination_name}
                  </span>
                  <span className={monitoringStyles.componentSubText}>
                    Outbound: {deal.flight.depart_time.slice(11, 16)} → {deal.flight.arrival_time.slice(11, 16)} (Direct)
                  </span>
                </div>
                <div className={monitoringStyles.componentPriceRow}>
                  <span className={monitoringStyles.componentPrice}>
                    €{deal.flight.landed_price_eur.toFixed(2)} Landed
                  </span>
                  {deal.flight.booking_url && (
                    <a
                      href={deal.flight.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={monitoringStyles.directLinkBtn}
                    >
                      Book Flight ↗
                    </a>
                  )}
                </div>
              </div>

              <div className={monitoringStyles.dealComponentCard}>
                <div className={monitoringStyles.componentHeader}>
                  <span className={monitoringStyles.componentTypeTitle}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h1M9 13h1M9 17h1M15 13h1M15 17h1" />
                    </svg>
                    Accommodation
                  </span>
                  <span className={monitoringStyles.componentCarrierBadge}>
                    ★ {deal.lodging.quality_score.toFixed(0)}/100 Quality
                  </span>
                </div>
                <div className={monitoringStyles.componentDetails}>
                  <span className={monitoringStyles.componentMainName}>
                    {deal.lodging.property_name}
                  </span>
                  <span className={monitoringStyles.componentSubText}>
                    €{deal.lodging.nightly_base_eur.toFixed(2)}/night · {deal.nights} nights stay
                  </span>
                </div>
                <div className={monitoringStyles.componentPriceRow}>
                  <span className={monitoringStyles.componentPrice}>
                    €{deal.lodging.landed_total_eur.toFixed(2)} Landed
                  </span>
                  {deal.lodging.booking_url && (
                    <a
                      href={deal.lodging.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={monitoringStyles.directLinkBtn}
                    >
                      Book Hotel ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className={monitoringStyles.dealCardFooter}>
              <span className={monitoringStyles.dealFooterPrompt}>
                Verified flight + hotel deal package ready for autonomous trip creation.
              </span>
              <button
                type="button"
                className={monitoringStyles.makeTripBtn}
                onClick={() =>
                  router.push(
                    `/engine?destination=${encodeURIComponent(deal.destination_name)}&origin=${encodeURIComponent(
                      deal.origin_name
                    )}&start_date=${deal.depart_date}&end_date=${deal.return_date}&budget=${deal.total_price_eur}`
                  )
                }
              >
                Make it a Trip ➔
              </button>
            </div>
          </div>
        )}

        {/* Section 1: Wide Price Trajectory Graph (matching reference Image 2) */}
        <div className={styles.sectionBlock}>
          <PriceTrendGraph
            points={history?.points || []}
            p10Deal={history?.p10_deal_eur ?? null}
            p50Median={history?.p50_median_eur ?? null}
            p90Peak={history?.p90_peak_eur ?? null}
            currency="EUR"
            onRangeChange={onHistoryRangeChange}
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
