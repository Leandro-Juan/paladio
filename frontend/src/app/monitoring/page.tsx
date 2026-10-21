"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useRouteMonitoring, DealPackage } from '@/hooks/useRouteMonitoring';
import { RouteFullScreenView } from '@/components/monitoring/RouteFullScreenView';
import { NewRouteModal } from '@/components/monitoring/NewRouteModal';
import { VerdictBadge } from '@/components/monitoring/VerdictBadge';
import {
  RadarIcon,
  Spinner,
  TrendingDownIcon,
} from '@/components/icons';
import styles from './Monitoring.module.css';

export default function MonitoringPage() {
  const router = useRouter();
  const {
    routes,
    deals,
    routeDeals,
    summary,
    selectedRoute,
    selectedRouteId,
    stats,
    history,
    calendar,
    events,
    isLoading,
    isScanning,
    isBackfilling,
    error,
    selectRoute,
    createRoute,
    toggleRouteActive,
    deleteRoute,
    discardDeal,
    triggerScan,
    triggerBackfill,
    fetchOverview,
    fetchRouteDetail,
    fetchCalendar,
  } = useRouteMonitoring();

  const [filterTab, setFilterTab] = useState<'ALL' | 'DEAL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [activeHistoryRange, setActiveHistoryRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');
  const [activeMonthsCount, setActiveMonthsCount] = useState<number>(4);

  // Filtered routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      // Tab filter
      if (filterTab === 'DEAL' && r.status !== 'DEAL') return false;
      if (filterTab === 'ACTIVE' && (!r.is_active || r.status === 'DEAL')) return false;
      if (filterTab === 'PAUSED' && r.is_active) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesOrigin = r.origin_iata.toLowerCase().includes(q);
        const matchesDest = r.destination_code.toLowerCase().includes(q);
        const matchesName = r.destination_name.toLowerCase().includes(q);
        return matchesOrigin || matchesDest || matchesName;
      }
      return true;
    });
  }, [routes, filterTab, searchQuery]);

  const dealsCount = routes.filter((r) => r.status === 'DEAL').length;
  const activeCount = routes.filter((r) => r.is_active && r.status !== 'DEAL').length;
  const pausedCount = routes.filter((r) => !r.is_active).length;

  // Overview page displays at most ONE deal (the single best deal) per route
  const bestDealsByRoute = useMemo(() => {
    const map = new Map<string, DealPackage>();
    for (const deal of deals) {
      const key = deal.alert_id || `${deal.origin_iata}-${deal.destination_code}`;
      const prev = map.get(key);
      if (!prev || deal.discount_pct > prev.discount_pct) {
        map.set(key, deal);
      }
    }
    return Array.from(map.values());
  }, [deals]);

  const handleRangeChange = (range: '24h' | '7d' | '30d' | '90d') => {
    setActiveHistoryRange(range);
    if (selectedRoute) {
      fetchRouteDetail(selectedRoute.id, range, activeMonthsCount);
    }
  };

  const handleMonthsCountChange = (count: number) => {
    setActiveMonthsCount(count);
    if (selectedRoute) {
      fetchRouteDetail(selectedRoute.id, activeHistoryRange, count);
    }
  };

  const handleViewChange = (view: 'outbound' | 'inbound' | 'roundtrip', pricing: 'flights' | 'package', monthsCount: number) => {
    if (selectedRoute) {
      fetchCalendar(selectedRoute.id, view, pricing, monthsCount);
    }
  };

  return (
    <div className={styles.pageContainer}>
      {selectedRoute ? (
        <RouteFullScreenView
          route={selectedRoute}
          deal={deals.find((d) => d.alert_id === selectedRoute.id || d.destination_code === selectedRoute.destination_code) || null}
          routeDeals={routeDeals}
          stats={stats}
          history={history}
          calendar={calendar}
          events={events}
          isScanning={isScanning}
          isBackfilling={isBackfilling}
          onBack={() => selectRoute(null)}
          onTriggerBackfill={triggerBackfill}
          onToggleActive={toggleRouteActive}
          onDelete={deleteRoute}
          onDiscardDeal={discardDeal}
          onHistoryRangeChange={handleRangeChange}
          onMonthsCountChange={handleMonthsCountChange}
          onViewChange={handleViewChange}
        />
      ) : (
        <>
          {/* Top Telemetry Header */}
          <header className={styles.pageHeader}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.titleWithBadge}>
            <span className={styles.telemetryTag} aria-hidden="true">{"// AIRFARE_DEAL_RADAR"}</span>
            <div className={styles.liveIndicator}>
              <span className={styles.livePulseDot} />
              <span className={styles.liveText}>LIVE MONITORING</span>
            </div>
          </div>
          <h1 className={styles.pageTitle}>Route Price & Tariff Telemetry</h1>
          <p className={styles.pageSubtitle}>
            Continuous air-gapped price tracking across European transit corridors with empirical quantile baselines.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setIsNewModalOpen(true)}
          >
            <span>+ Monitor Route</span>
          </button>
        </div>
      </header>

      {/* KPI Summary Strip (DejvDesign Inspiration) */}
      <section className={styles.summaryStrip} aria-label="Monitoring summary metrics">
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>Monitored Routes</span>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{summary ? summary.monitored_routes : '--'}</span>
            <span className={styles.kpiUnit}>Active Targets</span>
          </div>
        </div>

        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>Open Deal Alerts</span>
          <div className={styles.kpiValueRow}>
            <span className={`${styles.kpiValue} ${styles.dealHighlight}`}>
              {summary ? summary.deals_detected : '--'}
            </span>
            <span className={styles.kpiUnit}>Below P10 Target</span>
          </div>
        </div>

        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>Ticks Scanned Today</span>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {summary ? summary.ticks_scanned_today.toLocaleString() : '--'}
            </span>
            <span className={styles.kpiUnit}>Live Observations</span>
          </div>
        </div>

        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>Average Savings</span>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {summary ? `${summary.avg_savings_pct.toFixed(1)}%` : '--'}
            </span>
            <span className={styles.kpiUnit}>vs 30D Median</span>
          </div>
        </div>
      </section>

      {/* Active Verified Deal Spotlight (Flight + Hotel Packages - 1 Best Deal per Route) */}
      {bestDealsByRoute && bestDealsByRoute.length > 0 && (
        <section className={styles.dealSpotlightSection} aria-label="Active verified deal packages">
          {bestDealsByRoute.map((deal) => (
            <div key={deal.id} className={styles.dealCard}>
              <div className={styles.dealCardHeader}>
                <div className={styles.dealHeaderLeft}>
                  <div className={styles.dealBadgeRow}>
                    <span className={styles.dealTag}>
                      <span className={styles.livePulseDot} />
                      VERIFIED DEAL PACKAGE FOUND
                    </span>
                    <span className={styles.realismBadge}>
                      REALISM {deal.realism_score.toFixed(1)}/10
                    </span>
                  </div>
                  <h2 className={styles.dealRouteTitle}>
                    <span>{deal.origin_name}</span>
                    <span className={styles.dealRouteIata}>({deal.origin_iata})</span>
                    <span>→</span>
                    <span>{deal.destination_name}</span>
                    <span className={styles.dealRouteIata}>({deal.destination_code})</span>
                  </h2>
                  <span className={styles.dealDatesSub}>
                    {deal.depart_date} → {deal.return_date} · {deal.nights} Nights Stay & Flight
                  </span>
                </div>

                <div className={styles.dealPriceComparisonBox}>
                  <div className={styles.dealPriceItem}>
                    <span className={styles.dealPriceLabel}>Landed Package</span>
                    <span className={styles.dealCurrentPrice}>€{deal.total_price_eur.toFixed(2)}</span>
                  </div>
                  <div className={styles.dealPriceItem}>
                    <span className={styles.dealPriceLabel}>30D Median</span>
                    <span className={styles.dealMedianPrice}>€{deal.baseline_median_eur.toFixed(2)}</span>
                  </div>
                  <div className={styles.dealSavingsHighlight}>
                    <span className={styles.savingsPill}>
                      <TrendingDownIcon size={14} color="#FFFFFF" />
                      {deal.discount_pct.toFixed(0)}% OFF
                    </span>
                    <span className={styles.savingsAmountText}>Save €{deal.savings_eur.toFixed(2)} vs median</span>
                  </div>
                </div>
              </div>

              {/* Dual Components: Flight + Hotel */}
              <div className={styles.dealItemsGrid}>
                {/* Flight Ticket Card */}
                <div className={styles.dealComponentCard}>
                  <div className={styles.componentHeader}>
                    <span className={styles.componentTypeTitle}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                      </svg>
                      Flight Corridor
                    </span>
                    <span className={styles.componentCarrierBadge}>
                      {deal.flight.airline} {deal.flight.flight_number ? `· ${deal.flight.flight_number}` : ''}
                    </span>
                  </div>
                  <div className={styles.componentDetails}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={styles.componentMainName}>
                        Outbound: {deal.origin_name} → {deal.destination_name}
                      </span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                        €{deal.flight.landed_price_eur.toFixed(2)}
                      </span>
                    </div>
                    <span className={styles.componentSubText}>
                      {deal.depart_date} · {deal.flight.depart_time.slice(11, 16)} → {deal.flight.arrival_time.slice(11, 16)} (Direct)
                    </span>

                    {deal.return_flight && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--color-border, #E2D9CC)' }}>
                          <span className={styles.componentMainName}>
                            Return: {deal.destination_name} → {deal.origin_name}
                          </span>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                            €{deal.return_flight.landed_price_eur.toFixed(2)}
                          </span>
                        </div>
                        <span className={styles.componentSubText}>
                          {deal.return_date} · {deal.return_flight.depart_time.slice(11, 16)} → {deal.return_flight.arrival_time.slice(11, 16)} (Direct)
                        </span>
                      </>
                    )}
                  </div>
                  <div className={styles.componentPriceRow}>
                    <span className={styles.componentPrice}>
                      €{(deal.flight.landed_price_eur + (deal.return_flight?.landed_price_eur ?? 0)).toFixed(2)} Landed Flights
                    </span>
                    {deal.flight.booking_url && (
                      <a
                        href={deal.flight.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.directLinkBtn}
                      >
                        Book Flights ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Hotel Ticket Card */}
                <div className={styles.dealComponentCard}>
                  <div className={styles.componentHeader}>
                    <span className={styles.componentTypeTitle}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h1M9 13h1M9 17h1M15 13h1M15 17h1" />
                      </svg>
                      Accommodation
                    </span>
                    <span className={styles.componentCarrierBadge}>
                      {deal.lodging.quality_score ? `★ ${deal.lodging.quality_score.toFixed(0)}/100 Quality` : (deal.lodging.stars ? `★ ${deal.lodging.stars} Stars` : 'Verified Stay')}
                    </span>
                  </div>
                  <div className={styles.componentDetails}>
                    <span className={styles.componentMainName}>
                      {deal.lodging.property_name}
                    </span>
                    <span className={styles.componentSubText}>
                      €{deal.lodging.nightly_base_eur.toFixed(2)}/night · {deal.nights} nights stay
                    </span>
                  </div>
                  <div className={styles.componentPriceRow}>
                    <span className={styles.componentPrice}>
                      €{deal.lodging.landed_total_eur.toFixed(2)} Landed
                    </span>
                    {deal.lodging.booking_url && (
                      <a
                        href={deal.lodging.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.directLinkBtn}
                      >
                        Book Hotel ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className={styles.dealCardFooter}>
                <span className={styles.dealFooterPrompt}>
                  Verified flight + hotel deal package ready for autonomous trip creation.
                </span>
                <div className={styles.dealFooterActions}>
                  <button
                    type="button"
                    className={styles.discardDealBtn}
                    onClick={() => discardDeal(deal.id)}
                  >
                    Discard Offer
                  </button>
                  <button
                    type="button"
                    className={styles.makeTripBtn}
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
            </div>
          ))}
        </section>
      )}

      {/* Main Toolbar */}
      <section className={styles.toolbar}>
        <div className={styles.filterPills}>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'ALL' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('ALL')}
          >
            All Routes ({routes.length})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'DEAL' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('DEAL')}
          >
            Deals Active ({dealsCount})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'ACTIVE' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('ACTIVE')}
          >
            Monitoring ({activeCount})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'PAUSED' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('PAUSED')}
          >
            Paused ({pausedCount})
          </button>
        </div>

        <div className={styles.searchWrapper}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by city, airport IATA, route..."
            className={styles.searchInput}
          />
        </div>
      </section>

      {/* Table Container */}
      <main className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <Spinner size={24} />
            <p className={styles.loadingText}>Synchronizing route observations from TimescaleDB...</p>
          </div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <span className={styles.errorTitle}>Telemetry Uplink Error</span>
            <p className={styles.errorText}>{error}</p>
            <button type="button" className={styles.secondaryBtn} onClick={fetchOverview}>
              Retry Connection
            </button>
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className={styles.emptyContainer}>
            <RadarIcon size={32} color="var(--color-accent-primary, #0F4C5C)" />
            <h3 className={styles.emptyTitle}>
              {searchQuery ? 'No Routes Match Search Filter' : 'No Monitored Routes Configured'}
            </h3>
            <p className={styles.emptyText}>
              {searchQuery
                ? 'Try clearing the search query or changing active category filters.'
                : 'Initialize continuous airfare and tariff tracking for any origin/destination pair.'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setIsNewModalOpen(true)}
              >
                + Monitor Your First Route
              </button>
            )}
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.routeTable}>
              <thead>
                <tr>
                  <th scope="col">Corridor / Route</th>
                  <th scope="col">Status</th>
                  <th scope="col">Cadence</th>
                  <th scope="col" className={styles.alignRight}>Current Fare</th>
                  <th scope="col" className={styles.alignRight}>30D Median</th>
                  <th scope="col" className={styles.alignRight}>Target P10</th>
                  <th scope="col" className={styles.alignRight}>Last Scan</th>
                  <th scope="col" className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map((r) => {
                  const isDeal = r.status === 'DEAL';
                  const isPaused = !r.is_active;
                  const isSelected = selectedRouteId === r.id;

                  return (
                    <tr
                      key={r.id}
                      className={`${styles.tableRow} ${isSelected ? styles.selectedRow : ''}`}
                      onClick={() => selectRoute(r.id)}
                    >
                      <td className={styles.corridorCell}>
                        <div className={styles.routeCodes}>
                          <span className={styles.iataCode}>{r.origin_iata}</span>
                          <span className={styles.arrow} aria-hidden="true">→</span>
                          <span className={styles.iataCode}>{r.destination_code}</span>
                        </div>
                        <span className={styles.citySub}>{r.destination_name}</span>
                      </td>

                      <td>
                        <div className={styles.statusCellStack}>
                          <span
                            className={`${styles.statusPill} ${
                              isDeal ? styles.pillDeal : isPaused ? styles.pillPaused : styles.pillActive
                            }`}
                          >
                            <span className={styles.statusDot} />
                            {r.status}
                            {isDeal && r.discount_pct && ` (-${r.discount_pct.toFixed(0)}%)`}
                          </span>
                          {r.verdict && (
                            <VerdictBadge
                              verdict={r.verdict}
                              percentile={r.verdict_percentile}
                              confidence={r.verdict_confidence}
                              compact
                            />
                          )}
                        </div>
                      </td>

                      <td className={styles.scheduleCell}>
                        <span className={styles.scheduleText}>{r.schedule}</span>
                      </td>

                      <td className={`${styles.priceCell} ${styles.alignRight}`}>
                        {r.current_price_eur !== null ? (
                          <div className={styles.fareStack}>
                            <span className={styles.fareMain}>€{r.current_price_eur.toFixed(2)}</span>
                            {isDeal && (
                              <span className={styles.dealDelta}>
                                <TrendingDownIcon size={11} />
                                <span>Save {r.discount_pct?.toFixed(0)}%</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={styles.pendingText}>Awaiting Tick</span>
                        )}
                      </td>

                      <td className={`${styles.baselineCell} ${styles.alignRight}`}>
                        {r.baseline_p50_eur !== null ? `€${r.baseline_p50_eur.toFixed(2)}` : '—'}
                      </td>

                      <td className={`${styles.targetCell} ${styles.alignRight}`}>
                        {r.baseline_p10_eur !== null ? `€${r.baseline_p10_eur.toFixed(2)}` : '—'}
                      </td>

                      <td className={`${styles.lastCheckedCell} ${styles.alignRight}`}>
                        {r.last_scanned_at ? r.last_scanned_at.slice(11, 16) + ' UTC' : 'Pending'}
                      </td>

                      <td className={`${styles.actionsCell} ${styles.alignRight}`}>
                        <button
                          type="button"
                          className={styles.inspectBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectRoute(r.id);
                          }}
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )}

      {/* New Route Modal */}
      <NewRouteModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={async (data) => {
          await createRoute(data);
        }}
      />
    </div>
  );
}
