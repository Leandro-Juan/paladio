"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { useRouteMonitoring, DealPackage } from '@/hooks/useRouteMonitoring';
import { RouteFullScreenView } from '@/components/monitoring/RouteFullScreenView';
import { NewRouteModal } from '@/components/monitoring/NewRouteModal';
import { VerdictBadge } from '@/components/monitoring/VerdictBadge';
import {
  RadarIcon,
  Spinner,
  TrendingDownIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { HotelTicketCard } from '@/components/monitoring/HotelTicketCard';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import { prepareDealTripNavigation } from '@/utils/dealToTrip';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import styles from './Monitoring.module.css';

function MonitoringPageInner() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const searchParams = useSearchParams();
  const routeParam = searchParams?.get('route') || searchParams?.get('route_id');
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
    userCurrency,
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
    fetchDayLodging,
  } = useRouteMonitoring();

  const [filterTab, setFilterTab] = useState<'ALL' | 'DEAL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [activeHistoryRange, setActiveHistoryRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');
  const [activeMonthsCount, setActiveMonthsCount] = useState<number>(4);

  // Synchronize corridor selection with URL query parameter
  useEffect(() => {
    if (routeParam && routes.length > 0) {
      if (selectedRouteId !== routeParam) {
        selectRoute(routeParam);
      }
    } else if (!routeParam && selectedRouteId) {
      selectRoute(null);
    }
  }, [routeParam, routes, selectedRouteId, selectRoute]);

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

  // Overview page displays at most ONE deal (the single best deal) per route,
  // and only when both outbound and return flights are present.
  const bestDealsByRoute = useMemo(() => {
    const map = new Map<string, DealPackage>();
    for (const deal of deals) {
      if (!deal.flight || !deal.return_flight) continue;
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

  const handleViewChange = (view: 'outbound' | 'inbound' | 'roundtrip', monthsCount: number) => {
    if (selectedRoute) {
      fetchCalendar(selectedRoute.id, view, 'flights', monthsCount);
    }
  };

  const handleBackToFleetOverview = () => {
    selectRoute(null);
    router.push('/monitoring');
  };

  return (
    <div className={styles.pageContainer}>
      {selectedRoute ? (
        <RouteFullScreenView
          route={selectedRoute}
          deal={deals.find((d) => Boolean(d.flight && d.return_flight) && (d.alert_id === selectedRoute.id || d.destination_code === selectedRoute.destination_code)) || null}
          routeDeals={routeDeals}
          stats={stats}
          history={history}
          calendar={calendar}
          events={events}
          isScanning={isScanning}
          isBackfilling={isBackfilling}
          userDefaultCurrency={userCurrency}
          onBack={handleBackToFleetOverview}
          onTriggerBackfill={triggerBackfill}
          onToggleActive={toggleRouteActive}
          onDelete={deleteRoute}
          onDiscardDeal={discardDeal}
          onHistoryRangeChange={handleRangeChange}
          onMonthsCountChange={handleMonthsCountChange}
          onViewChange={handleViewChange}
          onFetchLodging={selectedRoute ? (checkIn, nights) => fetchDayLodging(selectedRoute.id, checkIn, nights) : undefined}
        />
      ) : (
        <>
          {/* Top Telemetry Header */}
          <header className={styles.pageHeader}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.pageTitle}>{t('monitoring.page_title')}</h1>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setIsNewModalOpen(true)}
          >
            <span>{t('monitoring.monitor_route_btn')}</span>
          </button>
        </div>
      </header>

      {/* KPI Summary Strip (DejvDesign Inspiration) */}
      <section className={styles.summaryStrip} aria-label={t('monitoring.summary_metrics_aria')}>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>{t('monitoring.monitored_routes')}</span>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{summary ? summary.monitored_routes : '--'}</span>
            <span className={styles.kpiUnit}>{t('monitoring.active_targets')}</span>
          </div>
        </div>

        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>{t('monitoring.open_deal_alerts')}</span>
          <div className={styles.kpiValueRow}>
            <span className={`${styles.kpiValue} ${styles.dealHighlight}`}>
              {summary ? summary.deals_detected : '--'}
            </span>
            <span className={styles.kpiUnit}>{t('monitoring.below_p10_target')}</span>
          </div>
        </div>

        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>{t('monitoring.ticks_scanned_today')}</span>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {summary ? summary.ticks_scanned_today.toLocaleString(intlLocale) : '--'}
            </span>
            <span className={styles.kpiUnit}>{t('monitoring.live_observations')}</span>
          </div>
        </div>

        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>{t('monitoring.average_savings')}</span>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {summary ? `${summary.avg_savings_pct.toFixed(1)}%` : '--'}
            </span>
            <span className={styles.kpiUnit}>{t('monitoring.vs_30d_median')}</span>
          </div>
        </div>
      </section>

      {/* Active Verified Deal Spotlight (Flight + Hotel Packages - 1 Best Deal per Route) */}
      {bestDealsByRoute && bestDealsByRoute.length > 0 && (
        <section className={styles.dealSpotlightSection} aria-label={t('monitoring.active_deal_packages_aria')}>
          {bestDealsByRoute.map((deal) => {
            const dealCurrency = deal.currency || userCurrency || 'EUR';
            const travelerCount = deal.travelers || 1;
            const isMultiTraveler = travelerCount > 1;
            const unitPrice = deal.price_per_traveler_eur ?? (deal.total_price_eur / travelerCount);
            const unitMedian = deal.median_per_traveler_eur ?? (deal.baseline_median_eur / travelerCount);
            const unitSavings = deal.savings_per_traveler_eur ?? (deal.savings_eur / travelerCount);

            const outboundTotal = deal.flight?.landed_price_eur ?? 0;
            const outboundUnit = deal.flight?.unit_price_eur ?? (outboundTotal / travelerCount);

            const returnTotal = deal.return_flight?.landed_price_eur ?? 0;
            const returnUnit = deal.return_flight?.unit_price_eur ?? (returnTotal / travelerCount);

            const flightsTotal = outboundTotal + returnTotal;
            const flightsUnit = outboundUnit + returnUnit;

            return (
            <div key={deal.id} className={styles.dealCard}>
              <div className={styles.dealCardHeader}>
                <div className={styles.dealHeaderLeft}>
                  <div className={styles.dealBadgeRow}>
                    <span className={styles.dealTag}>
                      {t('monitoring.verified_deal_package_found')}
                    </span>
                  </div>
                  <h2 className={styles.dealRouteTitle}>
                    <span>{deal.origin_name}</span>
                    <span className={styles.dealRouteIata}>({deal.origin_iata})</span>
                    <span style={{ opacity: 0.6 }} aria-hidden="true">→</span>
                    <span>{deal.destination_name}</span>
                    <span className={styles.dealRouteIata}>({deal.destination_code})</span>
                  </h2>
                  <span className={styles.dealDatesSub}>
                    {deal.depart_date} → {deal.return_date} · {t('monitoring.nights_count_upper', { nights: deal.nights })} · {deal.lodging ? t('monitoring.stay_and_flight') : t('monitoring.flights_only')}
                    {isMultiTraveler ? ` · ${t('monitoring.travelers_count_label', { count: travelerCount })}` : ''}
                  </span>
                </div>

                <div className={styles.dealPriceComparisonBox}>
                  <div className={styles.dealPriceItem}>
                    <span className={styles.dealPriceLabel}>{t('monitoring.landed_package')}</span>
                    <span className={styles.dealCurrentPrice}>
                      {formatCurrencyAmount(isMultiTraveler ? unitPrice : deal.total_price_eur, dealCurrency)}
                      {isMultiTraveler && <span className={styles.unitSuffix}> {t('workspace.per_person')}</span>}
                    </span>
                    {isMultiTraveler && (
                      <span className={styles.totalPriceSub}>
                        {t('monitoring.amount_total', { amount: formatCurrencyAmount(deal.total_price_eur, dealCurrency) })}
                      </span>
                    )}
                  </div>
                  <div className={styles.dealPriceItem}>
                    <span className={styles.dealPriceLabel}>{t('monitoring.median_30d')}</span>
                    <span className={styles.dealMedianPrice}>
                      {formatCurrencyAmount(isMultiTraveler ? unitMedian : deal.baseline_median_eur, dealCurrency)}
                      {isMultiTraveler && <span className={styles.unitSuffix}> {t('monitoring.per_pers')}</span>}
                    </span>
                    {isMultiTraveler && (
                      <span className={styles.totalPriceSub}>
                        {t('monitoring.amount_total', { amount: formatCurrencyAmount(deal.baseline_median_eur, dealCurrency) })}
                      </span>
                    )}
                  </div>
                  <div className={styles.dealSavingsHighlight}>
                    <span className={styles.savingsPill}>
                      <TrendingDownIcon size={14} color="#FFFFFF" />
                      {t('monitoring.pct_off', { pct: (deal.discount_pct ?? 0).toFixed(0) })}
                    </span>
                    <span className={styles.savingsAmountText}>
                      {isMultiTraveler
                        ? t('monitoring.save_per_person', { amount: formatCurrencyAmount(unitSavings, dealCurrency) })
                        : t('monitoring.save_vs_median', { amount: formatCurrencyAmount(deal.savings_eur, dealCurrency) })}
                    </span>
                    {isMultiTraveler && (
                      <span className={styles.totalSavingsSub}>
                        {t('monitoring.total_savings_parens', { amount: formatCurrencyAmount(deal.savings_eur, dealCurrency) })}
                      </span>
                    )}
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
                      {t('monitoring.flight_corridor')}
                    </span>
                    <span className={styles.componentCarrierBadge}>
                      {deal.flight?.airline || t('monitoring.direct_carrier')} {deal.flight?.flight_number ? `· ${deal.flight.flight_number}` : ''}
                    </span>
                  </div>
                  <div className={styles.componentDetails}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={styles.componentMainName}>
                        {t('monitoring.outbound_route', { origin: deal.origin_name, dest: deal.destination_name })}
                      </span>
                      {isMultiTraveler ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                            {formatCurrencyAmount(outboundUnit, dealCurrency)} <span className={styles.unitSuffix}>{t('monitoring.per_pers')}</span>
                          </div>
                          <div className={styles.totalPriceSub}>
                            {t('monitoring.amount_total', { amount: formatCurrencyAmount(outboundTotal, dealCurrency) })}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                          {formatCurrencyAmount(outboundTotal, dealCurrency)}
                        </span>
                      )}
                    </div>
                    <span className={styles.componentSubText}>
                      {deal.flight?.depart_time && deal.flight?.arrival_time
                        ? t('monitoring.flight_leg_direct_time', {
                            date: deal.depart_date,
                            dep: deal.flight.depart_time.slice(11, 16),
                            arr: deal.flight.arrival_time.slice(11, 16),
                          })
                        : deal.depart_date}
                    </span>

                    {deal.return_flight && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--color-border, #E2D9CC)' }}>
                          <span className={styles.componentMainName}>
                            {t('monitoring.return_route', { dest: deal.destination_name, origin: deal.origin_name })}
                          </span>
                          {isMultiTraveler ? (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                                {formatCurrencyAmount(returnUnit, dealCurrency)} <span className={styles.unitSuffix}>{t('monitoring.per_pers')}</span>
                              </div>
                              <div className={styles.totalPriceSub}>
                                {t('monitoring.amount_total', { amount: formatCurrencyAmount(returnTotal, dealCurrency) })}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #1A2B32)', fontFamily: 'var(--font-code, monospace)' }}>
                              {formatCurrencyAmount(returnTotal, dealCurrency)}
                            </span>
                          )}
                        </div>
                        <span className={styles.componentSubText}>
                          {deal.return_flight.depart_time && deal.return_flight.arrival_time
                            ? t('monitoring.flight_leg_direct_time', {
                                date: deal.return_date,
                                dep: deal.return_flight.depart_time.slice(11, 16),
                                arr: deal.return_flight.arrival_time.slice(11, 16),
                              })
                            : deal.return_date}
                        </span>
                      </>
                    )}
                  </div>
                  <div className={styles.componentPriceRow}>
                    <span className={styles.componentPrice}>
                      {isMultiTraveler
                        ? t('monitoring.flights_multi_summary', {
                            unit: formatCurrencyAmount(flightsUnit, dealCurrency),
                            total: formatCurrencyAmount(flightsTotal, dealCurrency),
                            count: travelerCount,
                          })
                        : t('monitoring.landed_flights_price', { total: formatCurrencyAmount(flightsTotal, dealCurrency) })}
                    </span>
                    {deal.flight?.booking_url && (
                      <a
                        href={deal.flight.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.directLinkBtn}
                      >
                        {t('monitoring.book_flights')}
                      </a>
                    )}
                  </div>
                </div>

                {/* Hotel Ticket Card */}
                <HotelTicketCard deal={deal} dealCurrency={dealCurrency} />
              </div>

              {/* Action Bar */}
              <div className={styles.dealCardFooter}>
                <div className={styles.dealFooterActions}>
                  <button
                    type="button"
                    className={styles.discardDealBtn}
                    onClick={() => discardDeal(deal.id)}
                  >
                    {t('monitoring.discard_offer')}
                  </button>
                  <button
                    type="button"
                    className={styles.makeTripBtn}
                    onClick={() => router.push(prepareDealTripNavigation(deal, dealCurrency))}
                  >
                    {t('monitoring.make_it_a_trip')} <ChevronRightIcon size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
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
            {t('monitoring.filter_all_routes', { count: routes.length })}
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'DEAL' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('DEAL')}
          >
            {t('monitoring.filter_deals_active', { count: dealsCount })}
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'ACTIVE' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('ACTIVE')}
          >
            {t('monitoring.filter_monitoring', { count: activeCount })}
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${filterTab === 'PAUSED' ? styles.activeFilterPill : ''}`}
            onClick={() => setFilterTab('PAUSED')}
          >
            {t('monitoring.filter_paused', { count: pausedCount })}
          </button>
        </div>

        <div className={styles.searchWrapper}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('monitoring.search_placeholder')}
            className={styles.searchInput}
          />
        </div>
      </section>

      {/* Table Container */}
      <main className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <Spinner size={24} />
            <p className={styles.loadingText}>{t('monitoring.synchronizing_observations')}</p>
          </div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <span className={styles.errorTitle}>{t('monitoring.telemetry_uplink_error')}</span>
            <p className={styles.errorText}>{error}</p>
            <button type="button" className={styles.secondaryBtn} onClick={fetchOverview}>
              {t('monitoring.retry_connection')}
            </button>
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className={styles.emptyContainer}>
            <RadarIcon size={32} color="var(--color-accent-primary, #0F4C5C)" />
            <h3 className={styles.emptyTitle}>
              {searchQuery ? t('monitoring.no_routes_match') : t('monitoring.no_routes_configured')}
            </h3>
            <p className={styles.emptyText}>
              {searchQuery
                ? t('monitoring.try_clearing_search')
                : t('monitoring.initialize_tracking_desc')}
            </p>
            {!searchQuery && (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setIsNewModalOpen(true)}
              >
                {t('monitoring.monitor_first_route_btn')}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.routeTable}>
              <thead>
                <tr>
                  <th scope="col">{t('monitoring.col_corridor_route')}</th>
                  <th scope="col">{t('common.status')}</th>
                  <th scope="col" className={styles.alignRight}>{t('monitoring.col_current_fare')}</th>
                  <th scope="col" className={styles.alignRight}>{t('monitoring.median_30d')}</th>
                  <th scope="col" className={styles.alignRight}>{t('monitoring.col_target_p10')}</th>
                  <th scope="col" className={styles.alignRight}>{t('monitoring.col_last_scan')}</th>
                  <th scope="col" className={styles.alignRight}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map((r) => {
                  const isDeal = r.status === 'DEAL';
                  const isPaused = !r.is_active;
                  const isSelected = selectedRouteId === r.id;
                  const rCurrency = r.currency || userCurrency || 'EUR';
                  const rowStatusLabel =
                    r.status === 'DEAL'
                      ? t('monitoring.status_deal_upper')
                      : r.status === 'ACTIVE'
                      ? t('monitoring.status_active')
                      : r.status === 'PAUSED'
                      ? t('monitoring.status_paused')
                      : r.status === 'PENDING'
                      ? t('monitoring.status_pending')
                      : r.status === 'MONITORING'
                      ? t('monitoring.status_monitoring')
                      : r.status;

                  return (
                    <tr
                      key={r.id}
                      className={`${styles.tableRow} ${isSelected ? styles.selectedRow : ''}`}
                      onClick={() => {
                        selectRoute(r.id);
                        router.push(`/monitoring?route=${r.id}`);
                      }}
                    >
                      <td className={styles.corridorCell}>
                        <div className={styles.routeCodes}>
                          <span className={styles.iataCode}>{r.origin_iata}</span>
                          <span className={styles.arrow} aria-hidden="true">→</span>
                          <span className={styles.iataCode}>{r.destination_code}</span>
                        </div>
                        <span className={styles.citySub}>
                          {r.destination_name} · {r.earliest_date && r.latest_date ? `${r.earliest_date} → ${r.latest_date}` : t('monitoring.flexible')} · {t('monitoring.nights_range_short', { min: r.min_nights, max: r.max_nights })}
                        </span>
                      </td>

                      <td>
                        <div className={styles.statusCellStack}>
                          <span
                            className={`${styles.statusPill} ${
                              isDeal ? styles.pillDeal : isPaused ? styles.pillPaused : styles.pillActive
                            }`}
                          >
                            <span className={styles.statusDot} />
                            {rowStatusLabel}
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

                      <td className={`${styles.priceCell} ${styles.alignRight}`}>
                        {r.current_price_eur !== null ? (
                          <div className={styles.fareStack}>
                            <span className={styles.fareMain}>{formatCurrencyAmount(r.current_price_eur, rCurrency)}</span>
                            {isDeal && (
                              <span className={styles.dealDelta}>
                                <TrendingDownIcon size={11} />
                                <span>{t('monitoring.save_pct', { pct: r.discount_pct?.toFixed(0) ?? '0' })}</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={styles.pendingText}>{t('monitoring.awaiting_tick')}</span>
                        )}
                      </td>

                      <td className={`${styles.baselineCell} ${styles.alignRight}`}>
                        {r.baseline_p50_eur !== null ? formatCurrencyAmount(r.baseline_p50_eur, rCurrency) : '—'}
                      </td>

                      <td className={`${styles.targetCell} ${styles.alignRight}`}>
                        {r.baseline_p10_eur !== null ? formatCurrencyAmount(r.baseline_p10_eur, rCurrency) : '—'}
                      </td>

                      <td className={`${styles.lastCheckedCell} ${styles.alignRight}`}>
                        {r.last_scanned_at
                          ? t('monitoring.time_utc', { time: r.last_scanned_at.slice(11, 16) })
                          : t('monitoring.pending')}
                      </td>

                      <td className={`${styles.actionsCell} ${styles.alignRight}`}>
                        <button
                          type="button"
                          className={styles.inspectBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectRoute(r.id);
                            router.push(`/monitoring?route=${r.id}`);
                          }}
                        >
                          {t('monitoring.inspect_btn')} <ChevronRightIcon size={11} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '2px' }} />
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
        userDefaultCurrency={userCurrency}
        existingRoutes={routes}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={async (data) => {
          await createRoute(data);
        }}
      />
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <Suspense fallback={<PaladioLoader variant="fullscreen" />}>
      <MonitoringPageInner />
    </Suspense>
  );
}

