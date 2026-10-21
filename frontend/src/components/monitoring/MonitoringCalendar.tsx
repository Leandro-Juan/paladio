"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RouteCalendar, CalendarDay, LodgingSummary } from '@/hooks/useRouteMonitoring';
import { PlaneIcon, CloseIcon } from '@/components/icons';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import styles from './MonitoringCalendar.module.css';

interface MonitoringCalendarProps {
  calendar: RouteCalendar | null;
  currency?: string;
  onMonthsCountChange?: (count: number) => void;
  onViewChange?: (view: 'outbound' | 'inbound' | 'roundtrip', pricing: 'flights' | 'package', monthsCount: number) => void;
  onPlanItinerary?: (day: CalendarDay) => void;
  onFetchLodging?: (checkIn: string, nights: number) => Promise<LodgingSummary | null>;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MonitoringCalendar({
  calendar,
  currency,
  onMonthsCountChange,
  onViewChange,
  onPlanItinerary,
  onFetchLodging,
}: MonitoringCalendarProps) {
  const router = useRouter();
  const activeCurrency = calendar?.currency || currency || 'EUR';
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [hoveredDay, setHoveredDay] = useState<CalendarDay | null>(null);
  const [monthsCount, setMonthsCount] = useState<number>(4);
  const [currentView, setCurrentView] = useState<'outbound' | 'inbound' | 'roundtrip'>(
    calendar?.view || 'roundtrip'
  );
  const [currentPricing, setCurrentPricing] = useState<'flights' | 'package'>(
    calendar?.pricing || 'package'
  );
  const [isFetchingLodging, setIsFetchingLodging] = useState<boolean>(false);
  const [dayLodgingMap, setDayLodgingMap] = useState<Record<string, LodgingSummary>>({});

  // User marked holidays from Dashboard Calendar
  const userHolidays = useMemo(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = localStorage.getItem('paladio_user_holidays');
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, []);

  // Top 3 best package dates
  const top3Dates = useMemo(() => {
    if (calendar?.top_dates && calendar.top_dates.length > 0) {
      return new Map<string, number>(
        calendar.top_dates.slice(0, 3).map((dt, idx) => [dt, idx + 1])
      );
    }
    if (!calendar?.months) return new Map<string, number>();
    const valid: { date: string; price: number }[] = [];
    calendar.months.forEach((m) => {
      m.days.forEach((d) => {
        if (d.price_eur !== null) {
          valid.push({ date: d.date, price: d.price_eur });
        }
      });
    });
    valid.sort((a, b) => a.price - b.price);
    return new Map<string, number>(
      valid.slice(0, 3).map((item, idx) => [item.date, idx + 1])
    );
  }, [calendar]);

  const activeStayRange = useMemo(() => {
    const target = hoveredDay || selectedDay;
    if (target?.nights && target?.return_date) {
      return { start: target.date, end: target.return_date };
    }
    return null;
  }, [hoveredDay, selectedDay]);

  const handleMonthsChange = (count: number) => {
    setMonthsCount(count);
    if (onMonthsCountChange) {
      onMonthsCountChange(count);
    }
    if (onViewChange) {
      onViewChange(currentView, currentPricing, count);
    }
  };

  const handleViewChange = (v: 'outbound' | 'inbound' | 'roundtrip') => {
    setCurrentView(v);
    setSelectedDay(null);
    if (onViewChange) {
      onViewChange(v, currentPricing, monthsCount);
    }
  };

  const handlePricingChange = (p: 'flights' | 'package') => {
    setCurrentPricing(p);
    setSelectedDay(null);
    if (onViewChange) {
      onViewChange(currentView, p, monthsCount);
    }
  };

  // Dynamic on-demand lodging fetching for selected day
  useEffect(() => {
    if (!selectedDay || currentPricing !== 'package' || !onFetchLodging) return;
    const dateKey = selectedDay.date;
    // Skip if already observed with authentic property details
    if (dayLodgingMap[dateKey]?.property_name || selectedDay.lodging?.property_name) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setIsFetchingLodging(true);
      }
    });

    const nights = selectedDay.nights || 3;
    onFetchLodging(dateKey, nights)
      .then((res) => {
        if (isMounted && res) {
          setDayLodgingMap((prev) => ({ ...prev, [dateKey]: res }));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsFetchingLodging(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDay?.date, selectedDay?.nights, currentPricing, onFetchLodging]);

  const effectiveLodging: LodgingSummary | null = useMemo(() => {
    if (!selectedDay) return null;
    return dayLodgingMap[selectedDay.date] || selectedDay.lodging || null;
  }, [selectedDay, dayLodgingMap]);

  const dynamicCombinedPrice = useMemo(() => {
    if (!selectedDay || selectedDay.price_eur === null) return null;
    if (currentPricing === 'package' && effectiveLodging) {
      const outP = selectedDay.outbound_flight?.price_eur;
      const retP = selectedDay.return_flight?.price_eur;
      if (typeof outP === 'number' && typeof retP === 'number') {
        return Math.round((outP + retP + effectiveLodging.total_lodging_eur) * 100) / 100;
      }
    }
    return selectedDay.price_eur;
  }, [selectedDay, currentPricing, effectiveLodging]);

  if (!calendar || !calendar.months || calendar.months.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <span className={styles.telemetryTag} aria-hidden="true">{"// MULTI_MONTH_DISPATCH"}</span>
        <h4 className={styles.title}>Price Calendar Matrix</h4>
        <p className={styles.emptyText}>Loading multi-month price matrix...</p>
      </div>
    );
  }

  return (
    <div className={styles.container} role="region" aria-label="Route price calendar matrix">
      <div className={styles.header}>
        <div>
          <span className={styles.telemetryTag} aria-hidden="true">{"// MULTI_MONTH_DISPATCH"}</span>
          <h4 className={styles.title}>Multi-Month Price Matrix</h4>
          <span className={styles.routeLabel}>{calendar.route_label}</span>
        </div>

        <div className={styles.controls}>
          {/* Horizon Toggle: strictly 4M vs FULL HORIZON */}
          <div className={styles.monthsToggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${monthsCount <= 4 ? styles.activeToggleBtn : ''}`}
              onClick={() => handleMonthsChange(4)}
            >
              4M
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${monthsCount > 4 ? styles.activeToggleBtn : ''}`}
              onClick={() => handleMonthsChange(11)}
            >
              FULL HORIZON
            </button>
          </div>

          {/* View Toggle */}
          <div className={styles.viewSelector}>
            {(['outbound', 'inbound', 'roundtrip'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.toggleBtn} ${currentView === v ? styles.activeToggleBtn : ''}`}
                onClick={() => handleViewChange(v)}
              >
                {v === 'roundtrip' ? 'BEST ROUND-TRIP' : v.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Pricing Mode (only visible in roundtrip mode) */}
          {currentView === 'roundtrip' && (
            <div className={styles.viewSelector}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${currentPricing === 'flights' ? styles.activeToggleBtn : ''}`}
                onClick={() => handlePricingChange('flights')}
              >
                FLIGHTS ONLY
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${currentPricing === 'package' ? styles.activeToggleBtn : ''}`}
                onClick={() => handlePricingChange('package')}
              >
                FLIGHT + HOTEL
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Legend Ribbon */}
      <div className={styles.legendRibbon}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierDeal}`} />
          <span>Deal (≤ P10)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierFair}`} />
          <span>Fair (≤ P50)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierStandard}`} />
          <span>Standard</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierPeak}`} />
          <span>Peak Tariff</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.tierNoData}`} />
          <span>No Flight</span>
        </div>
      </div>

      {/* Multi-Month Grid Container */}
      <div
        className={`${styles.monthsGrid} ${
          monthsCount === 4 ? styles.monthsGrid4M : styles.monthsGridFull
        }`}
      >
        {calendar.months.slice(0, monthsCount).map((m) => (
          <div key={`${m.year}-${m.month}`} className={styles.monthColumn}>
            <div className={styles.monthHeader}>
              <span className={styles.monthName}>{m.month_name}</span>
              <span className={styles.monthYear}>{m.year}</span>
            </div>

            <div className={styles.weekdayRow}>
              {WEEKDAYS.map((w, idx) => (
                <span key={`${w}-${idx}`} className={styles.weekdayCell}>
                  {w}
                </span>
              ))}
            </div>

            <div className={styles.daysGrid}>
              {/* Prepend empty offset cells for 1st day of month weekday (0=Mon, 6=Sun) */}
              {Array.from({ length: m.days[0]?.weekday || 0 }).map((_, i) => (
                <div key={`empty-${i}`} className={styles.emptyDayCell} />
              ))}

              {m.days.map((d) => {
                const tierClass =
                  d.price_tier === 'deal'
                    ? styles.tierDeal
                    : d.price_tier === 'fair'
                    ? styles.tierFair
                    : d.price_tier === 'standard'
                    ? styles.tierStandard
                    : d.price_tier === 'peak'
                    ? styles.tierPeak
                    : styles.tierNoData;

                const isSelected = selectedDay?.date === d.date;
                const isInRange = Boolean(
                  activeStayRange && d.date >= activeStayRange.start && d.date <= activeStayRange.end
                );
                const topRank = top3Dates.get(d.date);
                const isUserHoliday = userHolidays.has(d.date);
                let fitsHolidayWindow = false;
                if (d.nights && d.return_date && isUserHoliday) {
                  const depD = new Date(d.date);
                  const retD = new Date(d.return_date);
                  let allCovered = true;
                  const cur = new Date(depD);
                  while (cur <= retD) {
                    const s = cur.toISOString().split('T')[0];
                    if (!userHolidays.has(s)) {
                      allCovered = false;
                      break;
                    }
                    cur.setDate(cur.getDate() + 1);
                  }
                  fitsHolidayWindow = allCovered;
                }

                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`${styles.dayCell} ${tierClass} ${isSelected ? styles.selectedDay : ''} ${
                      isInRange ? styles.inRangeDay : ''
                    } ${topRank ? styles[`topDay${topRank}`] : ''}`}
                    onClick={() => setSelectedDay(d)}
                    onMouseEnter={() => {
                      if (d.nights && d.return_date) {
                        setHoveredDay(d);
                      }
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    title={`${d.date}: ${d.price_eur ? formatCurrencyAmount(d.price_eur, activeCurrency) : 'No direct flight'}${
                      d.nights ? ` · ${d.nights}N stay until ${d.return_date}` : ''
                    }${topRank ? ` · #${topRank} Best Value Package` : ''}${
                      isUserHoliday ? ' · User Holiday / Vacation' : ''
                    }`}
                    aria-label={`${d.date}, ${d.price_eur ? `price ${formatCurrencyAmount(d.price_eur, activeCurrency)}` : 'no flight'}`}
                  >
                    {isUserHoliday && (
                      <span className={styles.holidayMarker} title="Marked as Vacation / PTO in Dashboard" />
                    )}
                    {topRank && (
                      <span className={`${styles.topRankBadge} ${styles[`topRank${topRank}`]}`}>
                        #{topRank}
                      </span>
                    )}
                    {fitsHolidayWindow && (
                      <span className={styles.fitsHolidayBadge}>PTO</span>
                    )}
                    <span className={styles.dayNum}>{d.day}</span>
                    <span className={styles.dayPrice}>
                      {d.price_eur !== null ? formatCurrencyAmount(d.price_eur, activeCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selected Day Inspection Card */}
      {selectedDay && (
        <div className={styles.dayInspectorCard}>
          <div className={styles.inspectorHeader}>
            <div className={styles.inspectorTitleGroup}>
              <PlaneIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
              <span className={styles.inspectorDate}>
                {selectedDay.date}
                {selectedDay.return_date ? ` → ${selectedDay.return_date} (${selectedDay.nights} Nights)` : ''}
              </span>
              <span className={`${styles.inspectorTierBadge} ${styles[`tier_${selectedDay.price_tier}`]}`}>
                {selectedDay.price_tier.toUpperCase()}
              </span>
              {top3Dates.has(selectedDay.date) && (
                <span className={styles.topRankPill}>
                  TOP #{top3Dates.get(selectedDay.date)} BEST VALUE
                </span>
              )}
              {userHolidays.has(selectedDay.date) && (
                <span className={styles.holidayBadgePill}>SCHEDULED PTO</span>
              )}
            </div>
            <button
              type="button"
              className={styles.closeInspectorBtn}
              onClick={() => setSelectedDay(null)}
              aria-label="Close day detail"
            >
              <CloseIcon size={14} />
            </button>
          </div>

          <div className={styles.inspectorBody}>
            {selectedDay.nights && selectedDay.return_date && userHolidays.has(selectedDay.date) && (
              <div className={styles.holidayMatchBanner}>
                <span>ALL TRAVEL DATES FIT YOUR MARKED VACATION / PTO</span>
              </div>
            )}
            <div className={styles.inspectorFare}>
              <span className={styles.inspectorFareLabel}>
                {selectedDay.nights
                  ? (currentPricing === 'package' ? 'Combined Package Estimate' : 'Total Round-Trip Fare')
                  : 'Observed Fare'}
              </span>
              <span className={styles.inspectorFareValue}>
                {dynamicCombinedPrice !== null ? formatCurrencyAmount(dynamicCombinedPrice, activeCurrency) : 'No Operating Flight'}
              </span>
            </div>

            {selectedDay.outbound_flight && selectedDay.return_flight ? (
              <div className={styles.flightCardsGrid}>
                {/* Outbound Card */}
                <div className={styles.flightCard}>
                  <div className={styles.cardHeader}>
                    <span>OUTBOUND FLIGHT</span>
                    {selectedDay.outbound_flight.price_eur !== null && (
                      <span className={styles.cardPrice}>
                        {formatCurrencyAmount(selectedDay.outbound_flight.price_eur, activeCurrency)}
                      </span>
                    )}
                  </div>
                  <span className={styles.metaVal}>
                    {selectedDay.outbound_flight.carrier} {selectedDay.outbound_flight.flight_number || ''}
                  </span>
                  <span className={styles.metaLabel}>Departure: {selectedDay.outbound_flight.departure_time || '—'}</span>
                  {selectedDay.outbound_flight.duration_mins && (
                    <span className={styles.metaLabel}>
                      Duration: {Math.floor(selectedDay.outbound_flight.duration_mins / 60)}h{' '}
                      {selectedDay.outbound_flight.duration_mins % 60}m
                    </span>
                  )}
                  {selectedDay.outbound_flight.booking_url && (
                    <a
                      href={selectedDay.outbound_flight.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.bookingLink}
                    >
                      Book Outbound ↗
                    </a>
                  )}
                </div>

                {/* Return Card */}
                <div className={styles.flightCard}>
                  <div className={styles.cardHeader}>
                    <span>RETURN FLIGHT ({selectedDay.return_date})</span>
                    {selectedDay.return_flight.price_eur !== null && (
                      <span className={styles.cardPrice}>
                        {formatCurrencyAmount(selectedDay.return_flight.price_eur, activeCurrency)}
                      </span>
                    )}
                  </div>
                  <span className={styles.metaVal}>
                    {selectedDay.return_flight.carrier} {selectedDay.return_flight.flight_number || ''}
                  </span>
                  <span className={styles.metaLabel}>Departure: {selectedDay.return_flight.departure_time || '—'}</span>
                  {selectedDay.return_flight.duration_mins && (
                    <span className={styles.metaLabel}>
                      Duration: {Math.floor(selectedDay.return_flight.duration_mins / 60)}h{' '}
                      {selectedDay.return_flight.duration_mins % 60}m
                    </span>
                  )}
                  {selectedDay.return_flight.booking_url && (
                    <a
                      href={selectedDay.return_flight.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.bookingLink}
                    >
                      Book Return ↗
                    </a>
                  )}
                </div>

                {/* Lodging Card */}
                {isFetchingLodging ? (
                  <div className={styles.flightCard}>
                    <div className={styles.cardHeader}>
                      <span>LIVE ACCOMMODATION</span>
                      <span className={styles.scanningPulse}>SCANNING...</span>
                    </div>
                    <span className={styles.metaVal}>
                      Querying Booking.com & Google Travel...
                    </span>
                    <span className={styles.metaLabel}>
                      Fetching live rates for {selectedDay.nights || 3} nights
                    </span>
                  </div>
                ) : effectiveLodging ? (
                  <div className={styles.flightCard}>
                    <div className={styles.cardHeader}>
                      <span>
                        {effectiveLodging.property_name ? 'ACCOMMODATION' : 'HOTEL BENCHMARK'} ({effectiveLodging.nights}N)
                      </span>
                      <span className={styles.cardPrice}>
                        {formatCurrencyAmount(effectiveLodging.total_lodging_eur, activeCurrency)}
                      </span>
                    </div>
                    <span className={styles.metaVal}>
                      {effectiveLodging.property_name || `Est. ${formatCurrencyAmount(effectiveLodging.price_per_night_eur, activeCurrency)} / night`}
                    </span>
                    <span className={styles.metaLabel}>
                      {effectiveLodging.property_name ? (
                        <>
                          {effectiveLodging.stars ? `★ ${effectiveLodging.stars}-Star · ` : ''}
                          {effectiveLodging.review_score ? `Rated ${effectiveLodging.review_score}/10 · ` : ''}
                          {formatCurrencyAmount(effectiveLodging.price_per_night_eur, activeCurrency)} / night
                        </>
                      ) : (
                        `Median benchmark for ${effectiveLodging.nights} nights`
                      )}
                    </span>
                    {effectiveLodging.booking_url && (
                      <a
                        href={effectiveLodging.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.bookingLink}
                      >
                        Book Hotel ↗
                      </a>
                    )}
                  </div>
                ) : null}
              </div>
            ) : selectedDay.carrier ? (
              <div className={styles.inspectorMetaRow}>
                <div className={styles.metaCol}>
                  <span className={styles.metaLabel}>Carrier</span>
                  <span className={styles.metaVal}>
                    {selectedDay.carrier} {selectedDay.flight_number || ''}
                  </span>
                </div>
                {selectedDay.departure_time && (
                  <div className={styles.metaCol}>
                    <span className={styles.metaLabel}>Departure</span>
                    <span className={styles.metaVal}>{selectedDay.departure_time}</span>
                  </div>
                )}
                {selectedDay.duration_mins && (
                  <div className={styles.metaCol}>
                    <span className={styles.metaLabel}>Flight Duration</span>
                    <span className={styles.metaVal}>
                      {Math.floor(selectedDay.duration_mins / 60)}h {selectedDay.duration_mins % 60}m
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            {selectedDay.booking_url && !selectedDay.outbound_flight && (
              <a
                href={selectedDay.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.bookingLink}
              >
                <span>Book Live Fare on Carrier</span>
                <span aria-hidden="true">→</span>
              </a>
            )}

            {/* Plan Itinerary Button */}
            <button
              type="button"
              className={styles.planItineraryBtn}
              onClick={() => {
                if (onPlanItinerary) {
                  onPlanItinerary(selectedDay);
                } else {
                  const destCode = calendar.route_label.split('(')[1]?.replace(')', '') || '';
                  const params = new URLSearchParams({
                    depart: selectedDay.date,
                    ...(selectedDay.return_date ? { return: selectedDay.return_date } : {}),
                    ...(destCode ? { destination: destCode } : {}),
                  });
                  router.push(`/trips/new?${params.toString()}`);
                }
              }}
            >
              <span>PLAN ITINERARY WITH THESE DATES</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
