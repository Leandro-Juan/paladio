"use client";

import React, { useState, useMemo } from 'react';
import { CalendarIcon } from '@/components/icons';

interface PaladioSingleDatePickerProps {
  selectedDate: string; // YYYY-MM-DD or empty
  onChange: (dateStr: string) => void;
  onClose?: () => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parts[0];
  const mIndex = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const mStr = MONTH_ABBR[mIndex] || parts[1];
  return `${mStr} ${d}, ${y}`;
}

function parseDateStr(str: string): Date | null {
  if (!str) return null;
  const parts = str.split('-');
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

export function PaladioSingleDatePicker({
  selectedDate,
  onChange,
  onClose,
  minDate,
  maxDate,
}: PaladioSingleDatePickerProps) {
  const initialDate = useMemo(() => parseDateStr(selectedDate) || new Date(), [selectedDate]);

  // Current viewed month (first day of viewed month)
  const [viewMonthDate, setViewMonthDate] = useState<Date>(() => {
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });

  const todayStr = useMemo(() => formatDateStr(new Date()), []);

  const handlePrevMonth = () => {
    setViewMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Generate calendar days for viewed month
  const daysInMonth = useMemo(() => {
    const y = viewMonthDate.getFullYear();
    const m = viewMonthDate.getMonth();
    const totalDays = new Date(y, m + 1, 0).getDate();
    // Weekday of 1st day (Mon=0, Sun=6)
    const firstDayIndex = (new Date(y, m, 1).getDay() + 6) % 7;

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push(i);
    }
    return days;
  }, [viewMonthDate]);

  const y = viewMonthDate.getFullYear();
  const m = viewMonthDate.getMonth();

  const handleDayClick = (dateStr: string) => {
    onChange(dateStr);
    if (onClose) {
      onClose();
    }
  };

  const handleClear = () => {
    onChange('');
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      style={{
        background: 'var(--color-surface-card, #FFFFFF)',
        border: '1px solid var(--color-border, #E2D9CC)',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 12px 32px rgba(15, 76, 92, 0.14)',
        width: '320px',
        maxWidth: '100%',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Month Navigation Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="Previous month"
          style={{
            background: 'var(--color-surface-raised, #FAF8F5)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-primary, #1A1A1A)',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span
          className="font-mono text-xs"
          style={{ letterSpacing: '0.05em', fontWeight: 700, color: 'var(--color-text-primary, #1A1A1A)' }}
        >
          {MONTH_NAMES[m]} {y}
        </span>

        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="Next month"
          style={{
            background: 'var(--color-surface-raised, #FAF8F5)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-primary, #1A1A1A)',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Weekdays Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
          marginBottom: '6px',
        }}
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="font-mono text-xs text-muted"
            style={{
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '11px',
              padding: '4px 0',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
        }}
      >
        {daysInMonth.map((d, idx) => {
          if (d === null) {
            return <div key={`empty-${idx}`} style={{ height: '32px' }} />;
          }

          const currentD = new Date(y, m, d);
          const dateStr = formatDateStr(currentD);
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const isBeforeMin = minDate ? dateStr < minDate : false;
          const isAfterMax = maxDate ? dateStr > maxDate : false;
          const isDisabled = isPast || isBeforeMin || isAfterMax;

          let cellBg = 'transparent';
          let cellColor = isDisabled ? 'var(--color-text-muted, #A8A29E)' : 'var(--color-text-primary, #1A1A1A)';
          let cellBorder = isToday && !isSelected ? '1px solid var(--color-accent-coral, #D42A2F)' : 'none';
          const cellFontWeight = isToday || isSelected ? 600 : 400;
          const cellBorderRadius = '8px';

          if (isSelected) {
            cellBg = 'var(--color-accent-primary, #0F4C5C)';
            cellColor = '#FFFFFF';
            cellBorder = 'none';
          }

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => handleDayClick(dateStr)}
              style={{
                height: '32px',
                width: '100%',
                background: cellBg,
                color: cellColor,
                opacity: isDisabled ? 0.35 : 1,
                border: cellBorder,
                borderRadius: cellBorderRadius,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: cellFontWeight,
                transition: 'all 0.12s ease',
                padding: 0,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Bottom Action Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: '1px solid var(--color-border-subtle, #EDE7DE)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
          <CalendarIcon size={13} color="currentColor" />
          <span>{selectedDate ? formatDisplayDate(selectedDate) : 'No date set'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {selectedDate && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--color-accent-coral, #D42A2F)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-raised, #FAF8F5)',
                color: 'var(--color-text-primary)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
