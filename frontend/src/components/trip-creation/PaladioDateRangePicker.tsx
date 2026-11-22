"use client";

import React, { useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { CalendarIcon } from '@/components/icons';
import { Modal } from '@/components/Modal';
import { useTrips, Trip } from '@/hooks/useTrips';

interface PaladioDateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onChange: (startDate: string, endDate: string) => void;
  onClose?: () => void;
  inline?: boolean;
  disabled?: boolean;
  existingTrips?: Trip[];
  excludeTripId?: string;
  holidays?: Set<string>;
}

function formatDisplayDate(dateStr: string, intlLocale: string): string {
  if (!dateStr) return '';
  const parsed = parseDateStr(dateStr);
  if (!parsed) return dateStr;
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function normalizeIsoDate(str?: string | null): string {
  if (!str) return '';
  return str.split('T')[0].split(' ')[0].trim();
}

function parseDateStr(str: string): Date | null {
  const clean = normalizeIsoDate(str);
  if (!clean) return null;
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function PaladioDateRangePicker({
  startDate,
  endDate,
  onChange,
  onClose,
  inline = false,
  disabled = false,
  existingTrips,
  excludeTripId,
  holidays,
}: PaladioDateRangePickerProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [intlLocale]);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: 'long' });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)));
  }, [intlLocale]);

  const initialStart = useMemo(() => parseDateStr(startDate) || new Date(), [startDate]);

  const { trips: fetchedTrips } = useTrips();
  const tripsToUse = existingTrips ?? fetchedTrips;
  const relevantTrips = useMemo(() => {
    return (tripsToUse || [])
      .filter((t) => t.start_date && t.end_date && (!excludeTripId || t.id !== excludeTripId))
      .map((t) => ({
        ...t,
        start_date: normalizeIsoDate(t.start_date),
        end_date: normalizeIsoDate(t.end_date),
      }));
  }, [tripsToUse, excludeTripId]);

  const [localHolidays] = useState<Set<string>>(() => {
    if (holidays) return holidays;
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = localStorage.getItem('paladio_user_holidays');
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const activeHolidays = holidays || localHolidays;

  const [overlapConflict, setOverlapConflict] = useState<{
    start: string;
    end: string;
    trip: Trip;
  } | null>(null);

  // Helper to resolve if a date matches an existing trip
  const getTripForDate = (dateStr: string) => {
    for (const trip of relevantTrips) {
      if (dateStr >= trip.start_date && dateStr <= trip.end_date) {
        return {
          trip,
          isStart: dateStr === trip.start_date,
          isEnd: dateStr === trip.end_date,
          inRange: dateStr > trip.start_date && dateStr < trip.end_date,
        };
      }
    }
    return null;
  };

  // Current view month (0-indexed) and year for the left calendar
  const [viewYear, setViewYear] = useState(() => initialStart.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initialStart.getMonth());

  // Intermediate selection state: 'start' or 'end'
  const normalizedPropStart = normalizeIsoDate(startDate);
  const normalizedPropEnd = normalizeIsoDate(endDate);
  const [selectingStep, setSelectingStep] = useState<'start' | 'end'>('start');
  const [tempStart, setTempStart] = useState<string>(normalizedPropStart);
  const [tempEnd, setTempEnd] = useState<string>(normalizedPropEnd);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Sync internal state if controlled props change
  const [lastPropStart, setLastPropStart] = useState(startDate);
  const [lastPropEnd, setLastPropEnd] = useState(endDate);
  if (startDate !== lastPropStart || endDate !== lastPropEnd) {
    setLastPropStart(startDate);
    setLastPropEnd(endDate);
    setTempStart(normalizedPropStart);
    setTempEnd(normalizedPropEnd);
    setSelectingStep('start');
    setHoverDate(null);
    const parsedStart = parseDateStr(normalizedPropStart);
    if (parsedStart) {
      setViewYear(parsedStart.getFullYear());
      setViewMonth(parsedStart.getMonth());
    }
  }

  // Month 1 (left) and Month 2 (right)
  const leftMonthDate = useMemo(() => new Date(viewYear, viewMonth, 1), [viewYear, viewMonth]);
  const rightMonthDate = useMemo(() => new Date(viewYear, viewMonth + 1, 1), [viewYear, viewMonth]);

  const todayStr = useMemo(() => formatDateStr(new Date()), []);
  const currentMonthDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const isPrevMonthDisabled = useMemo(() => {
    return leftMonthDate <= currentMonthDate;
  }, [leftMonthDate, currentMonthDate]);

  const handlePrevMonth = () => {
    if (isPrevMonthDisabled) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (dateStr: string) => {
    if (dateStr < todayStr || disabled) return;
    if (selectingStep === 'start') {
      setTempStart(dateStr);
      setTempEnd('');
      setSelectingStep('end');
    } else {
      // If clicked date is before start, make it the new start
      if (dateStr < tempStart) {
        setTempStart(dateStr);
        setTempEnd('');
        setSelectingStep('end');
      } else {
        // Check for overlap with existing trips
        const conflictingTrip = relevantTrips.find((t) => {
          return tempStart <= t.end_date && dateStr >= t.start_date;
        });

        if (conflictingTrip) {
          setOverlapConflict({
            start: tempStart,
            end: dateStr,
            trip: conflictingTrip,
          });
        } else {
          setTempEnd(dateStr);
          setSelectingStep('start');
          onChange(tempStart, dateStr);
          if (onClose && !inline) {
            onClose();
          }
        }
      }
    }
  };

  const handleConfirmOverlap = () => {
    if (overlapConflict) {
      setTempEnd(overlapConflict.end);
      setSelectingStep('start');
      onChange(overlapConflict.start, overlapConflict.end);
      if (onClose && !inline) {
        onClose();
      }
      setOverlapConflict(null);
    }
  };

  const handleCancelOverlap = () => {
    setTempStart('');
    setTempEnd('');
    setSelectingStep('start');
    setHoverDate(null);
    setOverlapConflict(null);
  };

  const getDaysGrid = (year: number, month: number) => {
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  };

  const leftDays = useMemo(() => getDaysGrid(leftMonthDate.getFullYear(), leftMonthDate.getMonth()), [leftMonthDate]);
  const rightDays = useMemo(() => getDaysGrid(rightMonthDate.getFullYear(), rightMonthDate.getMonth()), [rightMonthDate]);

  // Duration in inclusive calendar days
  const durationDays = useMemo(() => {
    const s = parseDateStr(tempStart);
    if (!s) return 0;
    const e = parseDateStr(tempEnd);
    if (!e) return 1;
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + 1 : 1;
  }, [tempStart, tempEnd]);

  const renderMonth = (mDate: Date, days: (number | null)[]) => {
    const y = mDate.getFullYear();
    const m = mDate.getMonth();
    const monthTitle = t('calendar.month_year_title', { month: monthNames[m], year: y });

    return (
      <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
        <div
          style={{
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '15px',
            color: 'var(--color-text-primary, #1A1A1A)',
            marginBottom: '1rem',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.01em',
          }}
        >
          {monthTitle}
        </div>

        {/* Weekday headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            textAlign: 'center',
            marginBottom: '6px',
          }}
        >
          {weekdays.map((wd, idx) => (
            <span
              key={`${wd}-${idx}`}
              className="font-mono"
              style={{
                fontSize: '11px',
                color: 'var(--color-text-muted, #71717A)',
                fontWeight: 500,
                padding: '4px 0',
              }}
            >
              {wd}
            </span>
          ))}
        </div>

        {/* Days grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: '2px',
          }}
        >
          {days.map((d, idx) => {
            if (d === null) {
              return <div key={`empty-${idx}`} style={{ height: '36px' }} />;
            }

            const currentD = new Date(y, m, d);
            const dateStr = formatDateStr(currentD);
            const isStart = tempStart === dateStr;
            const isEnd = tempEnd === dateStr;
            const effectiveEnd = tempEnd || (selectingStep === 'end' && hoverDate && hoverDate >= tempStart ? hoverDate : '');
            const inRange = tempStart && effectiveEnd && dateStr > tempStart && dateStr < effectiveEnd;

            // Today check and past check
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            const isSelectedOrRange = isStart || isEnd || inRange;
            const isDisabled = isPast;

            const tripInfo = getTripForDate(dateStr);
            const isHoliday = Boolean(activeHolidays?.has(dateStr));
            const isTripCap = Boolean(tripInfo && (tripInfo.isStart || tripInfo.isEnd));
            const isTripInRange = Boolean(tripInfo && tripInfo.inRange);

            let dayTitle = '';
            if (tripInfo) {
              dayTitle = t('engine.picker_trip_tooltip', {
                destination: tripInfo.trip.destination,
                start: tripInfo.trip.start_date,
                end: tripInfo.trip.end_date,
              });
            } else if (isHoliday) {
              dayTitle = t('engine.picker_holiday_tooltip', { date: dateStr });
            } else if (isToday) {
              dayTitle = t('engine.picker_today_tooltip', { date: dateStr });
            }

            // Highlighting style hierarchy:
            // 1. Current date selection (Deep sea teal)
            // 2. Existing booked trips (Amber gold solid caps / amber tint)
            // 3. User marked holidays (Gold tint + dashed border)
            let cellBg = 'transparent';
            let cellColor = isPast && !isSelectedOrRange ? 'var(--color-text-muted, #9E9E9E)' : 'var(--color-text-primary, #1A1A1A)';
            let cellBorderRadius = '6px';
            let cellBorder = isToday && !isStart && !isEnd ? '1px solid var(--color-accent-coral, #D42A2F)' : 'none';
            let cellFontWeight = isToday ? 600 : 400;

            if (isStart || isEnd) {
              cellBg = 'var(--color-accent-primary, #0F4C5C)';
              cellColor = '#FFFFFF';
              cellBorderRadius = isStart
                ? (isEnd || !effectiveEnd || effectiveEnd === tempStart ? '8px' : '8px 0 0 8px')
                : '0 8px 8px 0';
              cellBorder = 'none';
              cellFontWeight = 600;
            } else if (inRange) {
              cellBg = 'rgba(15, 76, 92, 0.09)';
              cellColor = 'var(--color-accent-primary, #0F4C5C)';
              cellBorderRadius = '0';
              cellBorder = 'none';
              cellFontWeight = 500;
            } else if (isTripCap && tripInfo) {
              cellBg = 'var(--color-accent-amber, #D97706)';
              cellColor = '#FFFFFF';
              cellBorderRadius = tripInfo.isStart
                ? (tripInfo.isEnd ? '8px' : '8px 0 0 8px')
                : '0 8px 8px 0';
              cellBorder = 'none';
              cellFontWeight = 600;
            } else if (isTripInRange) {
              cellBg = 'rgba(217, 119, 6, 0.16)';
              cellColor = '#B45309';
              cellBorderRadius = '0';
              cellBorder = 'none';
              cellFontWeight = 500;
            } else if (isHoliday) {
              cellBg = 'rgba(226, 179, 60, 0.20)';
              cellBorder = '1px dashed rgba(226, 179, 60, 0.7)';
              cellBorderRadius = '6px';
              cellColor = 'var(--color-text-primary, #1A1A1A)';
            }

            return (
              <button
                key={dateStr}
                type="button"
                disabled={isDisabled}
                onClick={() => handleDayClick(dateStr)}
                onMouseEnter={() => !isDisabled && selectingStep === 'end' && setHoverDate(dateStr)}
                title={dayTitle}
                aria-label={dayTitle || dateStr}
                style={{
                  height: '34px',
                  width: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  background: cellBg,
                  color: cellColor,
                  opacity: isSelectedOrRange || tripInfo || isHoliday ? 1 : isPast ? 0.38 : 1,
                  border: cellBorder,
                  borderRadius: cellBorderRadius,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: cellFontWeight,
                  fontFamily: 'var(--font-mono)',
                  cursor: isPast ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                  position: 'relative',
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        background: inline ? 'var(--color-bg-main, #FAF8F5)' : 'var(--color-surface-raised, #FFFFFF)',
        border: '1px solid var(--color-border, #E2D9CC)',
        borderRadius: '24px',
        padding: inline ? '1.15rem 1rem' : '1.25rem 1.5rem',
        boxShadow: inline ? 'none' : '0 12px 36px rgba(0,0,0,0.12)',
        maxWidth: inline ? '100%' : '580px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Header controls: month navigation chevrons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--color-border-subtle, #EDE7DE)',
        }}
      >
        <button
          type="button"
          disabled={isPrevMonthDisabled}
          onClick={handlePrevMonth}
          aria-label={t('calendar.prev_month')}
          style={{
            background: isPrevMonthDisabled ? 'transparent' : 'var(--color-surface-raised, #FFFFFF)',
            border: isPrevMonthDisabled ? '1px solid transparent' : '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isPrevMonthDisabled ? 'not-allowed' : 'pointer',
            color: isPrevMonthDisabled ? 'var(--color-text-muted, #B0B0B0)' : 'var(--color-text-primary, #1A1A1A)',
            opacity: isPrevMonthDisabled ? 0.35 : 1,
            boxShadow: isPrevMonthDisabled ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span
          className="font-mono text-xs text-muted"
          style={{ letterSpacing: '0.06em', fontWeight: 600 }}
        >
          {t('engine.select_travel_window')}
        </span>

        <button
          type="button"
          onClick={handleNextMonth}
          aria-label={t('calendar.next_month')}
          style={{
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-primary, #1A1A1A)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Two consecutive months side by side with dashed center line */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          gap: inline ? '0.85rem' : '1.25rem',
          alignItems: 'start',
        }}
      >
        {renderMonth(leftMonthDate, leftDays)}
        <div
          style={{
            width: '1px',
            alignSelf: 'stretch',
            borderRight: '1.5px dashed var(--color-border, #E2D9CC)',
            margin: '0 2px',
          }}
        />
        {renderMonth(rightMonthDate, rightDays)}
      </div>

      {/* Direct Date Format Readout Below the Calendar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '1.25rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid var(--color-border-subtle, #EDE7DE)',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '9999px',
            padding: '6px 18px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--color-text-primary, #1A1A1A)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <CalendarIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
          {tempStart ? (
            <>
              <span style={{ fontWeight: 600 }}>
                {formatDisplayDate(tempStart, intlLocale)} &nbsp;—&nbsp; {formatDisplayDate(tempEnd || tempStart, intlLocale)}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: '11px',
                  color: 'var(--color-accent-primary, #0F4C5C)',
                  background: 'rgba(15, 76, 92, 0.08)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                {durationDays === 1
                  ? t('engine.duration_day_singular')
                  : t('engine.duration_days_plural', { count: durationDays })}
              </span>
            </>
          ) : (
            <span style={{ fontWeight: 500, color: 'var(--color-text-muted)' }}>
              {t('engine.no_dates_selected')}
            </span>
          )}
        </div>

        {!inline && onClose && (
          <button
            type="button"
            onClick={() => {
              if (tempStart) {
                onChange(tempStart, tempEnd || tempStart);
                setSelectingStep('start');
              }
              onClose();
            }}
            className="font-mono text-xs"
            style={{
              background: 'var(--color-accent-primary, #0F4C5C)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('engine.confirm_dates')}
          </button>
        )}
      </div>

      {/* Visual Status Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          marginTop: '0.85rem',
          fontSize: '11px',
          color: 'var(--color-text-muted, #71717A)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--color-accent-primary, #0F4C5C)',
            }}
          />
          <span>{t('engine.legend_selected')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--color-accent-amber, #D97706)',
            }}
          />
          <span>{t('engine.legend_existing_trip')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              background: 'rgba(226, 179, 60, 0.3)',
              border: '1px dashed #B8860B',
            }}
          />
          <span>{t('engine.legend_holiday_pto')}</span>
        </div>
      </div>

      {/* Overlapping Trip Selection Confirmation Modal */}
      <Modal
        isOpen={Boolean(overlapConflict)}
        variant="warning"
        title={t('engine.conflict_dates_overlap_title')}
        message={t('engine.conflict_dates_overlap_msg', {
          start: overlapConflict?.start ?? '',
          end: overlapConflict?.end ?? '',
          destination: overlapConflict?.trip.destination ?? '',
          tripStart: overlapConflict?.trip.start_date ?? '',
          tripEnd: overlapConflict?.trip.end_date ?? '',
        })}
        confirmText={t('engine.proceed_anyway')}
        cancelText={t('engine.reselect_dates')}
        onConfirm={handleConfirmOverlap}
        onCancel={handleCancelOverlap}
      >
        {overlapConflict && (
          <div
            style={{
              background: 'rgba(217, 119, 6, 0.10)',
              border: '1px solid rgba(217, 119, 6, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              marginTop: '8px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: 'var(--color-accent-amber, #D97706)',
                marginBottom: '4px',
              }}
            >
              {t('engine.conflicting_trip_details')}
            </div>
            <div>
              {(() => {
                const marker = '__DEST__';
                const text = t('engine.conflict_destination', { destination: marker });
                const parts = text.split(marker);
                if (parts.length !== 2) return text;
                return (
                  <>
                    {parts[0]}
                    <strong>{overlapConflict.trip.destination}</strong>
                    {parts[1]}
                  </>
                );
              })()}
            </div>
            <div>
              {t('engine.conflict_dates', {
                start: overlapConflict.trip.start_date,
                end: overlapConflict.trip.end_date,
              })}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
