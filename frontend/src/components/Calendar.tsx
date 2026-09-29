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
    <div
      className="bg-surface border-subtle"
      style={{
        borderRadius: '12px',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Top Controls & Month Title */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>
              MISSION OPERATIONS CALENDAR
            </h3>
            <span
              className="font-mono text-xs"
              style={{
                background: 'rgba(30, 58, 138, 0.08)',
                color: 'var(--color-accent-primary)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              TEMPORAL RADAR
            </span>
          </div>
          <p className="font-mono text-muted text-xs mt-1">
            {'// TRACKING ACTIVE, QUEUED, AND ARCHIVED DEPLOYMENTS'}
          </p>
        </div>

        {/* Month Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              padding: '0.4rem 0.75rem',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
            }}
            title="Previous month"
          >
            &lt; PREV
          </button>

          <button
            type="button"
            onClick={handleToday}
            style={{
              padding: '0.4rem 0.75rem',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: 'var(--color-accent-primary)',
              fontWeight: 700,
            }}
            title="Jump to current cycle"
          >
            CYCLE TODAY
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              padding: '0.4rem 0.75rem',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
            }}
            title="Next month"
          >
            NEXT &gt;
          </button>

          <span
            className="font-mono font-semibold"
            style={{
              minWidth: '150px',
              textAlign: 'center',
              padding: '0.4rem 0.75rem',
              background: 'var(--color-bg-main)',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              fontSize: '0.85rem',
              letterSpacing: '1px',
            }}
          >
            {MONTH_NAMES[month]} {year}
          </span>
        </div>
      </div>

      {/* Telemetry Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '1rem',
          padding: '0.875rem 1rem',
          background: 'var(--color-bg-main)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
        }}
      >
        <div>
          <span className="font-mono text-muted text-xs">TOTAL MISSIONS</span>
          <p className="font-mono text-sm font-semibold" style={{ margin: 0, marginTop: '2px' }}>
            {telemetry.total}
          </p>
        </div>
        <div>
          <span className="font-mono text-muted text-xs">ACTIVE / QUEUED</span>
          <p
            className="font-mono text-sm font-semibold"
            style={{ margin: 0, marginTop: '2px', color: 'var(--color-accent-primary)' }}
          >
            {telemetry.queued}
          </p>
        </div>
        <div>
          <span className="font-mono text-muted text-xs">ARCHIVED (PAST)</span>
          <p
            className="font-mono text-sm font-semibold text-muted"
            style={{ margin: 0, marginTop: '2px' }}
          >
            {telemetry.completed}
          </p>
        </div>
        <div>
          <span className="font-mono text-muted text-xs">DEPLOYED DAYS ({year})</span>
          <p className="font-mono text-sm font-semibold" style={{ margin: 0, marginTop: '2px' }}>
            {telemetry.deployedDays} DAYS
          </p>
        </div>
      </div>

      {/* 7-Day Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
        }}
      >
        {/* Weekday Headers */}
        {WEEKDAY_NAMES.map((name) => (
          <div
            key={name}
            className="font-mono text-muted text-xs"
            style={{
              textAlign: 'center',
              padding: '0.5rem 0',
              fontWeight: 600,
              letterSpacing: '0.5px',
            }}
          >
            {name}
          </div>
        ))}

        {/* Day Cells */}
        {days.map((day) => {
          const hasTrip = day.trips.length > 0;
          return (
            <div
              key={day.dateString}
              onClick={() => handleCellClick(day)}
              style={{
                minHeight: '85px',
                padding: '6px',
                background: day.isCurrentMonth
                  ? day.isToday
                    ? 'rgba(30, 58, 138, 0.04)'
                    : 'var(--color-bg-main)'
                  : 'rgba(241, 245, 249, 0.5)',
                border: day.isToday
                  ? '2px solid var(--color-accent-primary)'
                  : '1px solid var(--color-border)',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'background 0.15s, border-color 0.15s',
                opacity: day.isCurrentMonth ? 1 : 0.45,
              }}
              onMouseEnter={(e) => {
                if (!day.isToday) {
                  e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!day.isToday) {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }
              }}
              title={
                hasTrip
                  ? `${day.trips[0].trip.destination} (${day.trips[0].status})`
                  : `Click to plan mission on ${day.dateString}`
              }
            >
              {/* Day Number and Today Indicator */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  className="font-mono text-xs"
                  style={{
                    fontWeight: day.isToday ? 700 : 500,
                    color: day.isToday
                      ? 'var(--color-accent-primary)'
                      : day.isCurrentMonth
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {day.dayNumber}
                </span>
                {day.isToday && (
                  <span
                    className="font-mono text-xs"
                    style={{
                      fontSize: '9px',
                      color: 'var(--color-accent-primary)',
                      fontWeight: 700,
                    }}
                  >
                    TODAY
                  </span>
                )}
              </div>

              {/* Trip Bar/Pill within cell */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                {day.trips.map(({ trip, status }, i) => {
                  let badgeBg = 'rgba(100, 116, 139, 0.14)';
                  let badgeBorder = 'rgba(100, 116, 139, 0.35)';
                  let badgeColor = '#475569';

                  if (status === 'UPCOMING') {
                    badgeBg = 'rgba(37, 99, 235, 0.15)';
                    badgeBorder = 'rgba(37, 99, 235, 0.4)';
                    badgeColor = '#1E40AF';
                  } else if (status === 'ACTIVE') {
                    badgeBg = 'rgba(16, 185, 129, 0.18)';
                    badgeBorder = 'rgba(16, 185, 129, 0.5)';
                    badgeColor = '#065F46';
                  }

                  return (
                    <div
                      key={trip.id || i}
                      style={{
                        padding: '2px 5px',
                        background: badgeBg,
                        border: `1px solid ${badgeBorder}`,
                        borderRadius: '4px',
                        color: badgeColor,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span
                        style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: badgeColor,
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span>{trip.destination}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend & Quick Actions */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '2px',
                background: 'rgba(37, 99, 235, 0.3)',
                border: '1px solid #1E40AF',
                display: 'inline-block',
              }}
            />
            <span className="font-mono text-xs text-muted">PLANNED FUTURE MISSION</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '2px',
                background: 'rgba(16, 185, 129, 0.3)',
                border: '1px solid #065F46',
                display: 'inline-block',
              }}
            />
            <span className="font-mono text-xs text-muted">ACTIVE ONGOING MISSION</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '2px',
                background: 'rgba(100, 116, 139, 0.25)',
                border: '1px solid #475569',
                display: 'inline-block',
              }}
            />
            <span className="font-mono text-xs text-muted">COMPLETED MISSION ARCHIVE</span>
          </div>
        </div>

        <p className="font-mono text-muted text-xs" style={{ margin: 0 }}>
          {'// Click any open day to plan a mission on that date'}
        </p>
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
