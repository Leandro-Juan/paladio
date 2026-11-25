"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface PastTripDayDotsProps {
  totalDays: number;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
}

export function PastTripDayDots({
  totalDays,
  selectedDay,
  onSelectDay,
}: PastTripDayDotsProps) {
  const { t } = useTranslation();

  if (totalDays <= 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '0.65rem 0',
      }}
      role="tablist"
      aria-label={t('vault.filter_itinerary_by_day')}
    >
      {/* "All" button / dot */}
      <button
        type="button"
        role="tab"
        onClick={() => onSelectDay(null)}
        title={t('vault.view_all_days')}
        aria-selected={selectedDay === null}
        style={{
          height: '8px',
          width: '8px',
          margin: '0 3px',
          borderRadius: '999px',
          background:
            selectedDay === null
              ? 'var(--color-accent-primary, #0F4C5C)'
              : 'var(--color-border, #E2D9CC)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          transform: selectedDay === null ? 'scale(1.45)' : 'scale(1)',
          boxShadow:
            selectedDay === null
              ? '0 0 0 3px rgba(15, 76, 92, 0.16)'
              : 'none',
          transition:
            'transform var(--transition-snappy), background-color var(--transition-fast), box-shadow var(--transition-fast)',
        }}
      />

      {/* Individual Day Dots */}
      {Array.from({ length: totalDays }, (_, idx) => {
        const dayNum = idx + 1;
        const isActive = selectedDay === dayNum;

        return (
          <button
            key={dayNum}
            type="button"
            role="tab"
            onClick={() => onSelectDay(dayNum)}
            title={t('trips.day_label', { number: dayNum })}
            aria-selected={isActive}
            style={{
              height: '8px',
              width: '8px',
              margin: '0 3px',
              borderRadius: '999px',
              background: isActive
                ? 'var(--color-accent-primary, #0F4C5C)'
                : 'var(--color-border, #E2D9CC)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transform: isActive ? 'scale(1.45)' : 'scale(1)',
              boxShadow: isActive ? '0 0 0 3px rgba(15, 76, 92, 0.16)' : 'none',
              transition:
                'transform var(--transition-snappy), background-color var(--transition-fast), box-shadow var(--transition-fast)',
            }}
          />
        );
      })}
    </div>
  );
}
