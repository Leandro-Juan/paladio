"use client";

import React, { useState } from 'react';
import { RouteCalendar, CalendarDay } from '@/hooks/useRouteMonitoring';
import { PlaneIcon, CloseIcon } from '@/components/icons';
import styles from './MonitoringCalendar.module.css';

interface MonitoringCalendarProps {
  calendar: RouteCalendar | null;
  onMonthsCountChange?: (count: number) => void;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MonitoringCalendar({
  calendar,
  onMonthsCountChange,
}: MonitoringCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [monthsCount, setMonthsCount] = useState<number>(4);

  const handleMonthsChange = (count: number) => {
    setMonthsCount(count);
    if (onMonthsCountChange) {
      onMonthsCountChange(count);
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
          <div className={styles.monthsToggle}>
            {[3, 4, 5].map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.toggleBtn} ${monthsCount === m ? styles.activeToggleBtn : ''}`}
                onClick={() => handleMonthsChange(m)}
              >
                {m}M
              </button>
            ))}
          </div>
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

                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`${styles.dayCell} ${tierClass} ${isSelected ? styles.selectedDay : ''}`}
                    onClick={() => setSelectedDay(d)}
                    title={`${d.date}: ${d.price_eur ? `€${d.price_eur.toFixed(2)}` : 'No direct flight'}`}
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
              <span className={styles.inspectorDate}>{selectedDay.date}</span>
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
              <span className={styles.inspectorFareLabel}>Observed Fare</span>
              <span className={styles.inspectorFareValue}>
                {selectedDay.price_eur !== null ? `€${selectedDay.price_eur.toFixed(2)}` : 'No Operating Flight'}
              </span>
            </div>

            {selectedDay.carrier && (
              <div className={styles.inspectorMetaRow}>
                <div className={styles.metaCol}>
                  <span className={styles.metaLabel}>Carrier</span>
                  <span className={styles.metaVal}>{selectedDay.carrier} {selectedDay.flight_number || ''}</span>
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
                    <span className={styles.metaVal}>{Math.floor(selectedDay.duration_mins / 60)}h {selectedDay.duration_mins % 60}m</span>
                  </div>
                )}
              </div>
            )}

            {selectedDay.booking_url && (
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
          </div>
        </div>
      )}
    </div>
  );
}
