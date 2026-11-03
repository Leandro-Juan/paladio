"use client";

import React from 'react';

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
      aria-label="Filter itinerary by day"
    >
      {/* "All" button / dot */}
      <button
        type="button"
        role="tab"
        onClick={() => onSelectDay(null)}
        title="View All Days"
        aria-selected={selectedDay === null}
        style={{
          height: '7px',
          width: selectedDay === null ? '24px' : '7px',
          borderRadius: '999px',
          background:
            selectedDay === null
              ? 'var(--color-accent-primary, #0F4C5C)'
              : 'var(--color-border, #E2D9CC)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          transition: 'all 0.25s ease',
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
            title={`Day ${dayNum}`}
            aria-selected={isActive}
            style={{
              height: '7px',
              width: isActive ? '24px' : '7px',
              borderRadius: '999px',
              background: isActive
                ? 'var(--color-accent-primary, #0F4C5C)'
                : 'var(--color-border, #E2D9CC)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transition: 'all 0.25s ease',
            }}
          />
        );
      })}
    </div>
  );
}
