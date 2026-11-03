"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { TripParticipant, TripSettlement } from '@/hooks/useTrips';
import { getCurrencyInfo } from '@/utils/currencyResolver';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';

interface PastTripSummaryPanelProps {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  participants?: TripParticipant[];
  totalCost?: number;
  currency?: string;
  settlement?: TripSettlement | null;
  heroPhotoUrl?: string;
  firstPoiName?: string;
}

export function PastTripSummaryPanel({
  tripId,
  destination,
  startDate,
  endDate,
  participants = [],
  totalCost = 0,
  currency = 'EUR',
  settlement,
  heroPhotoUrl,
  firstPoiName,
}: PastTripSummaryPanelProps) {
  // POI photo dynamic watch if heroPhotoUrl not already present
  const poisToWatch = useMemo(() => {
    if (heroPhotoUrl || !firstPoiName) return [];
    return [{ name: firstPoiName, city: destination }];
  }, [heroPhotoUrl, firstPoiName, destination]);

  const { getPhoto } = usePoiPhotos(poisToWatch);
  const resolvedPhoto = heroPhotoUrl || (firstPoiName ? getPhoto(firstPoiName) : undefined);

  // Formatted start & end dates (e.g. "December 25")
  const formattedStartDate = useMemo(() => {
    try {
      const d = new Date(startDate);
      if (isNaN(d.getTime())) return startDate;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return startDate;
    }
  }, [startDate]);

  const formattedEndDate = useMemo(() => {
    try {
      const d = new Date(endDate);
      if (isNaN(d.getTime())) return endDate;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return endDate;
    }
  }, [endDate]);

  // Compute duration
  const { days, nights } = useMemo(() => {
    try {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const diff = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      return { days: diff, nights: Math.max(0, diff - 1) };
    } catch {
      return { days: 1, nights: 0 };
    }
  }, [startDate, endDate]);

  const travelersCount = Math.max(1, participants.length);
  const perPersonCost = totalCost > 0 ? totalCost / travelersCount : 0;
  const currencySymbol = getCurrencyInfo(currency).symbol;

  const isSettled = settlement ? settlement.balances.every((b) => Math.abs(b.net_balance) < 0.01) : true;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* Travelers / friends strip (matching mockup) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          background: 'var(--color-surface-card, #FAF6F0)',
          borderRadius: '14px',
          border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {participants.slice(0, 4).map((p, idx) => (
            <div
              key={p.id || idx}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: idx === 0 ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-accent-teal-mid, #1B8FA6)',
                color: '#FFFFFF',
                border: '2px solid #FFFFFF',
                marginLeft: idx > 0 ? '-8px' : 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontWeight: 700,
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}
            >
              {(p.name || 'T').charAt(0).toUpperCase()}
            </div>
          ))}
          {participants.length === 0 && (
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--color-accent-primary, #0F4C5C)',
                color: '#FFFFFF',
                border: '2px solid #FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontWeight: 700,
              }}
            >
              1
            </div>
          )}
        </div>
        <span
          className="font-mono"
          style={{
            fontSize: '0.76rem',
            color: 'var(--color-text-primary, #1A2B32)',
            fontWeight: 500,
          }}
        >
          {travelersCount} {travelersCount === 1 ? 'traveler explored this route' : 'travelers completed this mission'}
        </span>
      </div>

      {/* Dates and Travelers Key-Value Table (matching mockup) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '0.25rem 0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted" style={{ fontSize: '0.78rem' }}>
            Trip Start Date
          </span>
          <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {formattedStartDate}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted" style={{ fontSize: '0.78rem' }}>
            Trip End Date
          </span>
          <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {formattedEndDate}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted" style={{ fontSize: '0.78rem' }}>
            Total Travelers
          </span>
          <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {travelersCount}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted" style={{ fontSize: '0.78rem' }}>
            Settlement Status
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '999px',
              background: isSettled ? 'rgba(31, 122, 77, 0.12)' : 'var(--color-accent-warning-bg, rgba(226, 179, 60, 0.15))',
              color: isSettled ? 'var(--color-success, #1F7A4D)' : 'var(--color-accent-warning, #E2B33C)',
            }}
          >
            {isSettled ? 'BALANCED' : 'SPLITS PENDING'}
          </span>
        </div>
      </div>

      {/* Spend Box & Action (matching mockup "Book now" area) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
            {days} Days / {nights} Nights
          </span>
          <span
            className="font-display"
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--color-accent-teal, #0F4C5C)',
              lineHeight: 1.2,
            }}
          >
            {currencySymbol} {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {travelersCount > 1 && (
            <span className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>
              ~{currencySymbol} {perPersonCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / person
            </span>
          )}
        </div>

        <Link
          href={`/trips/${tripId}?workspace=1`}
          style={{
            padding: '10px 20px',
            background: 'var(--color-accent-primary, #0F4C5C)',
            color: '#FFFFFF',
            borderRadius: '999px',
            fontFamily: 'var(--font-display, "Jost", sans-serif)',
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(15, 76, 92, 0.25)',
            transition: 'all 0.15s ease',
          }}
        >
          Open Workspace
        </Link>
      </div>

      {/* Destination Photo Card (on the bottom right as requested) */}
      <div
        style={{
          marginTop: '0.5rem',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.12))',
          boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.06))',
          background: 'var(--color-surface-card, #FAF6F0)',
        }}
      >
        {resolvedPhoto ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '160px',
              backgroundImage: `url(${resolvedPhoto})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '12px',
                right: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}
            >
              <span
                className="font-display"
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              >
                {destination}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: '0.62rem',
                  color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                DESTINATION
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              height: '130px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              textAlign: 'center',
              background: 'var(--color-surface-hover, rgba(15, 76, 92, 0.03))',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted, #566B76)"
              strokeWidth="1.5"
              style={{ opacity: 0.6, marginBottom: '6px' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span
              className="font-mono text-muted"
              style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}
            >
              [ PHOTO NOT RECORDED ]
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
