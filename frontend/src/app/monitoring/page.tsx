"use client";

import React, { useState, useMemo } from 'react';
import { useRouteMonitoring } from '@/hooks/useRouteMonitoring';
import { RouteFullScreenView } from '@/components/monitoring/RouteFullScreenView';
import { NewRouteModal } from '@/components/monitoring/NewRouteModal';
import {
  RadarIcon,
  Spinner,
  TrendingDownIcon,
} from '@/components/icons';
import styles from './Monitoring.module.css';

export default function MonitoringPage() {
  const {
    routes,
    summary,
    selectedRoute,
    selectedRouteId,
    stats,
    history,
    calendar,
    events,
    isLoading,
    isScanning,
    error,
    selectRoute,
    createRoute,
    toggleRouteActive,
    deleteRoute,
    triggerScan,
    fetchOverview,
    fetchRouteDetail,
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

  return (
    <div className={styles.pageContainer}>
      {selectedRoute ? (
        <RouteFullScreenView
          route={selectedRoute}
          stats={stats}
          history={history}
          calendar={calendar}
          events={events}
          isScanning={isScanning}
          onBack={() => selectRoute(null)}
          onTriggerScan={triggerScan}
          onToggleActive={toggleRouteActive}
          onDelete={deleteRoute}
          onHistoryRangeChange={handleRangeChange}
          onMonthsCountChange={handleMonthsCountChange}
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
                        <span
                          className={`${styles.statusPill} ${
                            isDeal ? styles.pillDeal : isPaused ? styles.pillPaused : styles.pillActive
                          }`}
                        >
                          <span className={styles.statusDot} />
                          {r.status}
                          {isDeal && r.discount_pct && ` (-${r.discount_pct.toFixed(0)}%)`}
                        </span>
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
