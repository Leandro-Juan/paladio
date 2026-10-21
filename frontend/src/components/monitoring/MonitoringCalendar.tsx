"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RouteCalendar, CalendarDay } from '@/hooks/useRouteMonitoring';
import { PlaneIcon, CloseIcon } from '@/components/icons';
import styles from './MonitoringCalendar.module.css';

interface MonitoringCalendarProps {
  calendar: RouteCalendar | null;
  onMonthsCountChange?: (count: number) => void;
  onViewChange?: (view: 'outbound' | 'inbound' | 'roundtrip', pricing: 'flights' | 'package', monthsCount: number) => void;
  onPlanItinerary?: (day: CalendarDay) => void;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MonitoringCalendar({
  calendar,
  onMonthsCountChange,
  onViewChange,
  onPlanItinerary,
}: MonitoringCalendarProps) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [hoveredDay, setHoveredDay] = useState<CalendarDay | null>(null);
  const [monthsCount, setMonthsCount] = useState<number>(4);
  const [currentView, setCurrentView] = useState<'outbound' | 'inbound' | 'roundtrip'>(
    calendar?.view || 'outbound'
  );
  const [currentPricing, setCurrentPricing] = useState<'flights' | 'package'>(
    calendar?.pricing || 'flights'
  );

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
        className={styles.monthsGrid}
        style={{
          gridTemplateColumns: `repeat(${Math.min(calendar.months.length, monthsCount)}, minmax(180px, 1fr))`,
        }}
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

                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`${styles.dayCell} ${tierClass} ${isSelected ? styles.selectedDay : ''} ${
                      isInRange ? styles.inRangeDay : ''
                    }`}
                    onClick={() => setSelectedDay(d)}
                    onMouseEnter={() => {
                      if (d.nights && d.return_date) {
                        setHoveredDay(d);
                      }
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    title={`${d.date}: ${d.price_eur ? `€${d.price_eur.toFixed(2)}` : 'No direct flight'}${
                      d.nights ? ` · ${d.nights}N stay until ${d.return_date}` : ''
                    }`}
                    aria-label={`${d.date}, ${d.price_eur ? `price €${d.price_eur.toFixed(2)}` : 'no flight'}`}
                  >
                    <span className={styles.dayNum}>{d.day}</span>
                    <span className={styles.dayPrice}>
                      {d.price_eur !== null ? `€${Math.round(d.price_eur)}` : '—'}
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
            <div className={styles.inspectorFare}>
              <span className={styles.inspectorFareLabel}>
                {selectedDay.nights
                  ? (currentPricing === 'package' ? 'Combined Package Estimate' : 'Total Round-Trip Fare')
                  : 'Observed Fare'}
              </span>
              <span className={styles.inspectorFareValue}>
                {selectedDay.price_eur !== null ? `€${selectedDay.price_eur.toFixed(2)}` : 'No Operating Flight'}
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
                        €{selectedDay.outbound_flight.price_eur.toFixed(2)}
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
                        €{selectedDay.return_flight.price_eur.toFixed(2)}
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
                {selectedDay.lodging && (
                  <div className={styles.flightCard}>
                    <div className={styles.cardHeader}>
                      <span>HOTEL BENCHMARK ({selectedDay.lodging.nights}N)</span>
                      <span className={styles.cardPrice}>
                        €{selectedDay.lodging.total_lodging_eur.toFixed(2)}
                      </span>
                    </div>
                    <span className={styles.metaVal}>
                      Est. €{selectedDay.lodging.price_per_night_eur.toFixed(2)} / night
                    </span>
                    <span className={styles.metaLabel}>
                      Median benchmark for {selectedDay.lodging.nights} nights
                    </span>
                  </div>
                )}
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
