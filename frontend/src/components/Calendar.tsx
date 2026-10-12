"use client";

import React, { useState, useMemo } from 'react';
import { Trip } from '@/hooks/useTrips';
import {
  generateMonthGrid,
  getTripStatus,
  calculateTripDurationDays,
  TripStatus,
  CalendarDay,
} from '@/utils/calendarUtils';
import { MissionInspectorModal } from './MissionInspectorModal';
import styles from './Calendar.module.css';

interface CalendarProps {
  trips: Trip[];
  onSelectDate?: (date: Date, dateString: string) => void;
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const WEEKDAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function Calendar({ trips, onSelectDate }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedTripData, setSelectedTripData] = useState<{ trip: Trip; status: TripStatus } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days: CalendarDay[] = useMemo(() => {
    return generateMonthGrid(year, month, trips);
  }, [year, month, trips]);

  // Telemetry statistics
  const telemetry = useMemo(() => {
    const now = new Date();
    let completedCount = 0;
    let upcomingCount = 0;
    let activeCount = 0;
    let deployedDaysYear = 0;

    trips.forEach((t) => {
      const status = getTripStatus(t, now);
      if (status === 'COMPLETED') completedCount++;
      else if (status === 'ACTIVE') activeCount++;
      else upcomingCount++;

      // Deployed days in current year
      if (t.start_date && t.end_date) {
        const startY = new Date(t.start_date).getFullYear();
        if (startY === year) {
          deployedDaysYear += calculateTripDurationDays(t.start_date, t.end_date);
        }
      }
    });

    return {
      total: trips.length,
      completed: completedCount,
      queued: upcomingCount + activeCount,
      deployedDays: deployedDaysYear,
    };
  }, [trips, year]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleCellClick = (day: CalendarDay) => {
    if (day.trips.length > 0) {
      const primary = day.trips[0];
      setSelectedTripData({ trip: primary.trip, status: primary.status });
    } else if (onSelectDate) {
      onSelectDate(day.date, day.dateString);
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* KPI Row: hairline dividers, no outer box, Jost 28 weight 300 tnum */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>TOTAL MISSIONS</span>
          <p className={styles.kpiValue}>{telemetry.total}</p>
        </div>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>ACTIVE / QUEUED</span>
          <p className={`${styles.kpiValue} ${styles.kpiValueActive}`}>{telemetry.queued}</p>
        </div>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>ARCHIVED (PAST)</span>
          <p className={styles.kpiValue} style={{ color: 'var(--color-text-muted)' }}>
            {telemetry.completed}
          </p>
        </div>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>DEPLOYED DAYS ({year})</span>
          <p className={styles.kpiValue}>{telemetry.deployedDays}</p>
        </div>
      </div>

      {/* Main Calendar Card */}
      <div className={styles.calendarCard}>
        {/* Top Controls & Month Title */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.titleRow}>
              <h2 className={styles.monthTitle}>
                {MONTH_NAMES[month]} {year}
              </h2>
              <span className={styles.radarBadge}>TEMPORAL RADAR</span>
            </div>
            <p className={styles.subtitle}>
              MISSION OPERATIONS CALENDAR &middot; TRACKING ACTIVE, QUEUED, AND ARCHIVED DEPLOYMENTS
            </p>
          </div>

          {/* Month Navigation */}
          <div className={styles.navControls}>
            <button
              type="button"
              onClick={handlePrevMonth}
              className={styles.ghostButton}
              title="Previous month"
              aria-label="< PREV"
            >
              <span>&lsaquo;</span> &lt; PREV
            </button>

            <button
              type="button"
              onClick={handleToday}
              className={styles.todayButton}
              title="Jump to current cycle"
              aria-label="CYCLE TODAY"
            >
              CYCLE TODAY
            </button>

            <button
              type="button"
              onClick={handleNextMonth}
              className={styles.ghostButton}
              title="Next month"
              aria-label="NEXT >"
            >
              NEXT &gt; <span>&rsaquo;</span>
            </button>
          </div>
        </div>

        {/* 7-Day Grid */}
        <div className={styles.grid}>
          {/* Weekday Headers */}
          {WEEKDAY_NAMES.map((name) => (
            <div key={name} className={styles.weekdayHeader}>
              {name}
            </div>
          ))}

          {/* Day Cells */}
          {days.map((day) => {
            const hasTrip = day.trips.length > 0;
            const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

            const cellClasses = [
              styles.dayCell,
              !day.isCurrentMonth ? styles.dayCellOutside : '',
              isWeekend && day.isCurrentMonth ? styles.dayCellWeekend : '',
              day.isToday ? styles.dayCellToday : '',
            ].filter(Boolean).join(' ');

            // Display at most 2 chips per cell, with +N more if overflow
            const visibleTrips = day.trips.slice(0, 2);
            const hiddenCount = day.trips.length - visibleTrips.length;

            return (
              <div
                key={day.dateString}
                onClick={() => handleCellClick(day)}
                className={cellClasses}
                title={
                  hasTrip
                    ? `${day.trips[0].trip.destination} (${day.trips[0].status})`
                    : `Click to plan mission on ${day.dateString}`
                }
              >
                {/* Cell Header: Day Number + Today disc */}
                <div className={styles.cellHeader}>
                  {day.isToday ? (
                    <div className={`sun-disc ${styles.todayDisc}`}>{day.dayNumber}</div>
                  ) : (
                    <span className={styles.dayNumber}>{day.dayNumber}</span>
                  )}
                  {day.isToday && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: 'var(--color-accent-warning)',
                        letterSpacing: '0.05em',
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>

                {/* Trip Chips */}
                <div className={styles.chipsContainer}>
                  {visibleTrips.map(({ trip, status }, i) => {
                    const chipClass =
                      status === 'ACTIVE'
                        ? styles.chipActive
                        : status === 'UPCOMING'
                        ? styles.chipQueued
                        : styles.chipArchived;

                    return (
                      <div key={trip.id || i} className={chipClass}>
                        <span className={styles.chipDot} />
                        <span>{trip.destination}</span>
                      </div>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <span className={styles.moreChips}>+{hiddenCount} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          <div className={styles.legendItems}>
            <div className={styles.legendItem}>
              <span
                className={styles.legendIndicator}
                style={{ backgroundColor: 'var(--color-accent-primary)' }}
              />
              <span>ACTIVE ONGOING MISSION</span>
            </div>

            <div className={styles.legendItem}>
              <span
                className={styles.legendIndicator}
                style={{ backgroundColor: 'var(--color-accent-teal-soft)' }}
              />
              <span>PLANNED FUTURE MISSION</span>
            </div>

            <div className={styles.legendItem}>
              <span
                className={styles.legendIndicator}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-border)',
                }}
              />
              <span>COMPLETED MISSION ARCHIVE</span>
            </div>
          </div>

          <p className={styles.subtitle} style={{ margin: 0 }}>
            {'// Click any open day to plan a mission on that date'}
          </p>
        </div>
      </div>

      {/* Mission Inspector Modal */}
      <MissionInspectorModal
        isOpen={selectedTripData !== null}
        trip={selectedTripData?.trip || null}
        status={selectedTripData?.status || 'UPCOMING'}
        onClose={() => setSelectedTripData(null)}
      />
    </div>
  );
}
