"use client";

import React, { useState, useMemo } from 'react';
import { Trip } from '@/hooks/useTrips';
import {
  generateMonthGrid,
  generateYearGrid,
  getTripStatus,
  calculateTripDurationDays,
  MONTH_NAMES,
  TripStatus,
  CalendarDay,
  getTripPaletteColor,
} from '@/utils/calendarUtils';
import { MissionInspectorModal } from './MissionInspectorModal';
import styles from './Calendar.module.css';

interface CalendarProps {
  trips: Trip[];
  onSelectDate?: (date: Date, dateString: string) => void;
}

const WEEKDAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MINI_WEEKDAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function Calendar({ trips, onSelectDate }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'ANNUAL' | 'MONTH'>('ANNUAL');
  const [interactionMode, setInteractionMode] = useState<'PLAN' | 'HOLIDAY'>('PLAN');
  const [selectedTripData, setSelectedTripData] = useState<{ trip: Trip; status: TripStatus } | null>(null);
  
  // Anchored popover for planning a trip on an empty day
  const [activePopover, setActivePopover] = useState<{
    date: Date;
    dateString: string;
    x: number;
    y: number;
    isAbove: boolean;
  } | null>(null);

  // User-selected holiday days (persisted in localStorage)
  const [holidays, setHolidays] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('paladio_user_holidays');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const saveHolidays = (nextHolidays: Set<string>) => {
    setHolidays(nextHolidays);
    try {
      localStorage.setItem('paladio_user_holidays', JSON.stringify(Array.from(nextHolidays)));
    } catch {
      // Ignore storage errors
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Month grid for focused month view
  const days: CalendarDay[] = useMemo(() => {
    return generateMonthGrid(year, month, trips, holidays);
  }, [year, month, trips, holidays]);

  // Year grid for 12-month panoramic view
  const yearMonths = useMemo(() => {
    return generateYearGrid(year, trips, holidays);
  }, [year, trips, holidays]);

  // Map trips to colors for legend and chips
  const tripsWithPalette = useMemo(() => {
    return trips.map((t, idx) => ({
      trip: t,
      color: getTripPaletteColor(t, idx),
      status: getTripStatus(t),
    }));
  }, [trips]);

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

    const holidayDaysYear = Array.from(holidays).filter((d) => d.startsWith(`${year}-`)).length;

    return {
      total: trips.length,
      completed: completedCount,
      queued: upcomingCount + activeCount,
      deployedDays: deployedDaysYear,
      holidayDays: holidayDaysYear,
    };
  }, [trips, year, holidays]);

  const handlePrev = () => {
    setActivePopover(null);
    if (viewMode === 'ANNUAL') {
      setCurrentDate(new Date(year - 1, month, 1));
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };

  const handleNext = () => {
    setActivePopover(null);
    if (viewMode === 'ANNUAL') {
      setCurrentDate(new Date(year + 1, month, 1));
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };

  const handleToday = () => {
    setActivePopover(null);
    setCurrentDate(new Date());
  };

  const handleClearYearHolidays = () => {
    const nextHolidays = new Set(Array.from(holidays).filter((d) => !d.startsWith(`${year}-`)));
    saveHolidays(nextHolidays);
  };

  const handleCellClick = (
    e: React.MouseEvent<HTMLElement>,
    day: CalendarDay
  ) => {
    // In Holiday Mode: toggle holiday on open days
    if (interactionMode === 'HOLIDAY') {
      // Disallow turning trip days into holidays to prevent collision
      if (day.trips.length > 0) {
        return;
      }
      const nextHolidays = new Set(holidays);
      if (nextHolidays.has(day.dateString)) {
        nextHolidays.delete(day.dateString);
      } else {
        nextHolidays.add(day.dateString);
      }
      saveHolidays(nextHolidays);
      return;
    }

    // In Plan Trips Mode:
    if (day.trips.length > 0) {
      const primary = day.trips[0];
      setSelectedTripData({ trip: primary.trip, status: primary.status });
      setActivePopover(null);
    } else {
      // Anchored popover asking to plan trip on this date
      const rect = e.currentTarget.getBoundingClientRect();
      const isAbove = rect.top > 230;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130);
      const y = isAbove ? rect.top - 8 : rect.bottom + 8;
      setActivePopover({
        date: day.date,
        dateString: day.dateString,
        x,
        y,
        isAbove,
      });
    }
  };

  const handleConfirmPlanTrip = () => {
    if (activePopover && onSelectDate) {
      onSelectDate(activePopover.date, activePopover.dateString);
    }
    setActivePopover(null);
  };

  return (
    <div className={styles.wrapper}>
      {/* KPI Row */}
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
        {/* Header Controls: Navigation, View Toggle, Mode Toggle */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.monthTitle}>
              {viewMode === 'ANNUAL' ? `${year} ANNUAL DISPATCH` : `${MONTH_NAMES[month]} ${year}`}
            </h2>
            <div className={styles.navButtons}>
              <button
                type="button"
                onClick={handlePrev}
                className={styles.calIconBtn}
                title={viewMode === 'ANNUAL' ? 'Previous year' : 'Previous month'}
                aria-label={viewMode === 'ANNUAL' ? 'Previous year' : 'Previous month'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNext}
                className={styles.calIconBtn}
                title={viewMode === 'ANNUAL' ? 'Next year' : 'Next month'}
                aria-label={viewMode === 'ANNUAL' ? 'Next year' : 'Next month'}
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

          {/* Control Clusters: View Switcher & Mode Switcher */}
          <div className={styles.controlsCluster}>
            {/* View Mode Toggle: Annual vs Month */}
            <div className={styles.segmentedGroup}>
              <button
                type="button"
                onClick={() => {
                  setViewMode('ANNUAL');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${viewMode === 'ANNUAL' ? styles.segmentedBtnActive : ''}`}
                aria-label="Annual view"
              >
                <span>⊞</span> Annual (12M)
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('MONTH');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${viewMode === 'MONTH' ? styles.segmentedBtnActive : ''}`}
                aria-label="Month focus view"
              >
                <span>▤</span> Month Focus
              </button>
            </div>

            {/* Interaction Mode Toggle: Plan Trips vs Mark Holidays */}
            <div className={styles.segmentedGroup}>
              <button
                type="button"
                onClick={() => {
                  setInteractionMode('PLAN');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${interactionMode === 'PLAN' ? styles.segmentedBtnActive : ''}`}
                aria-label="Plan trips mode"
              >
                <span>✈</span> Plan
              </button>
              <button
                type="button"
                onClick={() => {
                  setInteractionMode('HOLIDAY');
                  setActivePopover(null);
                }}
                className={`${styles.segmentedBtn} ${interactionMode === 'HOLIDAY' ? styles.holidayBtnActive : ''}`}
                aria-label="Mark holidays mode"
              >
                <span>🏖</span> Mark Holidays ({telemetry.holidayDays}d)
              </button>
            </div>
          </div>
        </div>

        {/* Holiday Mode Active Banner */}
        {interactionMode === 'HOLIDAY' && (
          <div className={styles.holidayBanner}>
            <div className={styles.holidayBannerText}>
              <span className={styles.holidayBannerDot} />
              <span>
                <strong>Holiday Mode Active:</strong> Click any open day to mark/unmark vacation. Scheduled trips are locked to prevent collisions.
              </span>
            </div>
            {telemetry.holidayDays > 0 && (
              <button
                type="button"
                onClick={handleClearYearHolidays}
                className={styles.clearHolidaysBtn}
              >
                Clear {year} Holidays
              </button>
            )}
          </div>
        )}

        {/* Palette Legend Bar */}
        <div className={styles.paletteLegend}>
          <span className={styles.legendLabel}>PALETTE:</span>
          <div className={styles.legendChipsList}>
            {tripsWithPalette.map(({ trip, color, status }) => (
              <div
                key={trip.id || `${trip.destination}-${trip.start_date}`}
                className={styles.tripLegendChip}
                onClick={() => setSelectedTripData({ trip, status })}
                title={`${trip.destination} (${status}) — Click to inspect`}
              >
                <span
                  className={styles.legendColorSwatch}
                  style={{ background: color.bg }}
                />
                <span>{trip.destination}</span>
              </div>
            ))}
            <div className={styles.tripLegendChip} title="Personal Holiday / PTO days (amber hatch)">
              <span className={styles.holidaySwatch} />
              <span>Holiday / PTO ({telemetry.holidayDays}d)</span>
            </div>
            {/* Status Legend indicators for backward compatibility */}
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={`${styles.legendColorSwatch} ${styles.legendActive}`} style={{ background: 'var(--color-ocean, #1B8FA6)' }} />
              <span>Active</span>
            </div>
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={styles.legendColorSwatch} style={{ background: 'rgba(124, 196, 209, 0.4)', border: '1px solid var(--color-sky, #7CC4D1)' }} />
              <span>Queued</span>
            </div>
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={styles.legendColorSwatch} style={{ background: 'rgba(75, 102, 112, 0.3)' }} />
              <span>Archived</span>
            </div>
            <div className={styles.tripLegendChip} style={{ cursor: 'default' }}>
              <span className={styles.legendColorSwatch} style={{ background: 'var(--color-sun, #D42A2F)', borderRadius: '50%' }} />
              <span>Current day</span>
            </div>
          </div>
        </div>

        {/* VIEW MODE 1: 12-Month Panoramic Annual Grid */}
        {viewMode === 'ANNUAL' ? (
          <div className={styles.annualGrid}>
            {yearMonths.map((m) => (
              <div key={m.month} className={styles.miniMonthCard}>
                <div className={styles.miniMonthHeader}>
                  <span className={styles.miniMonthTitle}>{m.monthName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDate(new Date(year, m.month, 1));
                      setViewMode('MONTH');
                    }}
                    className={styles.miniMonthFocusBtn}
                    title={`Focus on ${m.monthName}`}
                    aria-label={`Focus on ${m.monthName}`}
                  >
                    Focus →
                  </button>
                </div>

                <div className={styles.miniWeekdaysRow}>
                  {MINI_WEEKDAY_NAMES.map((name, i) => (
                    <div key={`${name}-${i}`} className={styles.miniWeekdayCol}>
                      {name}
                    </div>
                  ))}
                </div>

                <div className={styles.miniDaysGrid}>
                  {m.days.map((day) => {
                    const hasTrips = day.trips.length > 0;
                    const cellClasses = [
                      styles.miniDayCell,
                      !day.isCurrentMonth ? styles.miniDayCellOutside : '',
                      day.isToday ? styles.miniDayCellToday : '',
                      day.isHoliday ? styles.miniDayCellHoliday : '',
                    ].filter(Boolean).join(' ');

                    const title = hasTrips
                      ? `${day.trips[0].trip.destination} (${day.trips[0].status})`
                      : day.isHoliday
                      ? `Holiday / PTO on ${day.dateString}`
                      : interactionMode === 'HOLIDAY'
                      ? `Click to mark holiday on ${day.dateString}`
                      : `Click to plan trip on ${day.dateString}`;

                    return (
                      <div
                        key={day.dateString}
                        onClick={(e) => day.isCurrentMonth && handleCellClick(e, day)}
                        className={cellClasses}
                        title={title}
                      >
                        <span className={styles.miniDayNum}>{day.dayNumber}</span>
                        {hasTrips && (
                          <div
                            className={styles.miniTripIndicator}
                            style={{
                              background: day.trips[0].color?.bg || 'var(--color-ocean)',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* VIEW MODE 2: Month Focus View */
          <>
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
                  day.isHoliday ? styles.dayCellHoliday : '',
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={day.dateString}
                    onClick={(e) => handleCellClick(e, day)}
                    className={cellClasses}
                    title={
                      day.trips.length > 0
                        ? `${day.trips[0].trip.destination} (${day.trips[0].status})`
                        : day.isHoliday
                        ? `Holiday / PTO on ${day.dateString}`
                        : `Click to plan mission on ${day.dateString}`
                    }
                  >
                    {/* Cell Header: Day Number and optional Holiday badge */}
                    <div className={styles.cellTop}>
                      <span className={styles.dateNum}>{day.dayNumber}</span>
                      {day.isHoliday && (
                        <span className={styles.holidayBadge}>HOLIDAY</span>
                      )}
                    </div>

                    {/* Spanning Multi-Day Trip Bars with palette colors */}
                    <div className={styles.barsContainer}>
                      {day.trips.map(({ trip, status, color, isStart, isEnd }, tripIdx) => {
                        let spanClass = styles.spanMid;
                        if (isStart && isEnd) {
                          spanClass = styles.spanSingle;
                        } else if (isStart || isMonday) {
                          spanClass = isEnd ? styles.spanSingle : styles.spanStart;
                        } else if (isEnd || isSunday) {
                          spanClass = styles.spanEnd;
                        }

                        return (
                          <div
                            key={trip.id || tripIdx}
                            className={`${styles.tripSpanBar} ${spanClass}`}
                            style={{
                              ['--trip-bg' as string]: color?.bg || 'var(--color-ocean)',
                              ['--trip-border' as string]: color?.border || '#147589',
                              ['--trip-text' as string]: color?.text || '#FFFFFF',
                            } as React.CSSProperties}
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
          </>
        )}
      </div>

      {/* Anchored Day Planning Popover Box */}
      {activePopover && (
        <>
          <div
            className={styles.popoverOverlay}
            onClick={() => setActivePopover(null)}
          />
          <div
            className={styles.dayPopover}
            style={{
              left: `${activePopover.x}px`,
              top: `${activePopover.y}px`,
              transform: activePopover.isAbove
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0)',
            }}
          >
            <div className={styles.popoverHeader}>
              <span className={styles.popoverTelemetry}>
                <span aria-hidden="true">{'// '}</span>PLAN_MISSION
              </span>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                className={styles.popoverCloseBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <h4 className={styles.popoverDateTitle}>{activePopover.dateString}</h4>
            <p className={styles.popoverPrompt}>
              Would you like to plan an autonomous travel mission starting on this date?
            </p>
            <div className={styles.popoverActions}>
              <button
                type="button"
                onClick={handleConfirmPlanTrip}
                className={styles.popoverPrimaryBtn}
              >
                <span>🚀</span> Plan Trip
              </button>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                className={styles.popoverCancelBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

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
