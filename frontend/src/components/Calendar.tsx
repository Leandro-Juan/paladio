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
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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
      {/* KPI Row: hairline dividers, no outer box, Jost 32px weight 300 tnum */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>TOTAL MISSIONS</span>
          <p className={styles.kpiValue}>{telemetry.total}</p>
        </div>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>ACTIVE / QUEUED</span>
          <p className={styles.kpiValue}>{telemetry.queued}</p>
        </div>
        <div className={styles.kpiCell}>
          <span className={styles.kpiLabel}>ARCHIVED MISSIONS</span>
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
        {/* Top Controls, Month Title, and Status Legend */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.monthTitle}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <div className={styles.navButtons}>
              <button
                type="button"
                onClick={handlePrevMonth}
                className={styles.calIconBtn}
                title="Previous month"
                aria-label="Previous month"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className={styles.calIconBtn}
                title="Next month"
                aria-label="Next month"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={handleToday}
              className={styles.ghostTodayBtn}
              title="Jump to current date"
              aria-label="Today"
            >
              Today
            </button>
          </div>

          {/* Status Legend */}
          <div className={styles.legendGroup}>
            <div className={styles.legendItem}>
              <span className={`${styles.legendPill} ${styles.legendActive}`} />
              <span>Active</span>
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendPill} ${styles.legendQueued}`} />
              <span>Queued</span>
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendPill} ${styles.legendArchived}`} />
              <span>Archived</span>
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendPill} ${styles.legendToday}`} />
              <span>Current day</span>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className={styles.weekdaysRow}>
          {WEEKDAY_NAMES.map((name) => (
            <div key={name} className={styles.weekdayCol}>
              {name}
            </div>
          ))}
        </div>

        {/* 7-Day Month Grid */}
        <div className={styles.grid}>
          {days.map((day, i) => {
            const isMonday = i % 7 === 0;
            const isSunday = (i + 1) % 7 === 0;

            const cellClasses = [
              styles.dayCell,
              !day.isCurrentMonth ? styles.dayCellOutside : '',
              day.isToday ? styles.dayCellToday : '',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={day.dateString}
                onClick={() => handleCellClick(day)}
                className={cellClasses}
                title={
                  day.trips.length > 0
                    ? `${day.trips[0].trip.destination} (${day.trips[0].status})`
                    : `Click to plan mission on ${day.dateString}`
                }
              >
                {/* Cell Header: Day Number */}
                <div className={styles.cellTop}>
                  <span className={styles.dateNum}>{day.dayNumber}</span>
                </div>

                {/* Spanning Multi-Day Trip Bars */}
                <div className={styles.barsContainer}>
                  {day.trips.map(({ trip, status, isStart, isEnd }, tripIdx) => {
                    let spanClass = styles.spanMid;
                    if (isStart && isEnd) {
                      spanClass = styles.spanSingle;
                    } else if (isStart || isMonday) {
                      spanClass = isEnd ? styles.spanSingle : styles.spanStart;
                    } else if (isEnd || isSunday) {
                      spanClass = styles.spanEnd;
                    }

                    const statusClass =
                      status === 'ACTIVE'
                        ? styles.activeStatus
                        : status === 'UPCOMING'
                        ? styles.queuedStatus
                        : styles.archivedStatus;

                    return (
                      <div
                        key={trip.id || tripIdx}
                        className={`${styles.tripSpanBar} ${statusClass} ${spanClass}`}
                        title={`${trip.destination} (${status})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTripData({ trip, status });
                        }}
                      >
                        {isStart || isMonday ? (
                          <span>{trip.destination}</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
