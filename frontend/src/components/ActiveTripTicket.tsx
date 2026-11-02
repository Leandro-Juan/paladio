import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  extractTotalCost,
  resolveDestinationTimezone,
  formatTimezone,
} from '@/utils/tripParser';
import styles from './ActiveTripTicket.module.css';

export interface ActiveTripTicketProps {
  destination?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  poisCount?: number;
  empty?: boolean;
  photoUrl?: string;
  itineraryData?: unknown;
  participantsCount?: number;
  timezone?: string;
}

export function ActiveTripTicket({
  destination,
  title,
  startDate,
  endDate,
  poisCount = 0,
  empty = false,
  photoUrl,
  itineraryData,
  participantsCount = 1,
  timezone,
}: ActiveTripTicketProps) {
  // Dynamic telemetry parsed from itinerary data (called unconditionally at top level)
  const estimatedCost = useMemo(() => extractTotalCost(itineraryData), [itineraryData]);

  if (empty || !destination || !startDate || !endDate) {
    return (
      <div className={styles.heroCard}>
        <div className={styles.seigaihaOverlay} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.standbyLeft}>
            <h2 className={styles.heroDestination} style={{ fontSize: '26px' }}>
              No active missions queued
            </h2>
            <p className={styles.heroDates} style={{ marginBottom: '16px' }}>
              All temporal parameters evaluated. Ready for initialization.
            </p>
            <Link href="/engine" className={styles.initializeBtn}>
              + Initialize Protocol
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Status and countdown calculation
  const isOngoing = now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
  const diffTime = start.getTime() - now.getTime();
  const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const elapsedDays = isOngoing
    ? Math.min(totalDays, Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1))
    : 0;

  const dayProgressText = isOngoing
    ? `Day ${elapsedDays} of ${totalDays}`
    : `${totalDays} ${totalDays === 1 ? 'Day' : 'Days'}`;

  const formattedDateRange = `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  const displayTitle = title || destination;
  const resolvedTz = resolveDestinationTimezone(destination, timezone);
  const formattedTz = formatTimezone(resolvedTz);

  return (
    <div className={styles.heroCard}>
      {photoUrl ? (
        <>
          <div
            className={styles.photoBackground}
            style={{ backgroundImage: `url(${photoUrl})` }}
            aria-hidden="true"
          />
          <div className={styles.photoOverlay} aria-hidden="true" />
        </>
      ) : (
        <div className={styles.seigaihaOverlay} aria-hidden="true" />
      )}
      <div className={styles.heroContent}>
        {/* Top Header Row with prominent trip title & countdown */}
        <div className={styles.heroTopRow}>
          <div>
            <h2 className={styles.heroDestination}>{displayTitle}</h2>
            <p className={styles.heroDates}>
              {isOngoing ? (
                <>
                  <span className={styles.datePulse}>● {dayProgressText}</span> · {formattedDateRange}
                </>
              ) : (
                formattedDateRange
              )}
            </p>
          </div>

          {/* Sun Disc Countdown */}
          <div
            className={isOngoing ? styles.sunCountdownOngoing : styles.sunCountdown}
            title={
              diffDays > 0
                ? `${diffDays} days until departure`
                : isOngoing
                ? `Day ${elapsedDays} active`
                : 'Departing today'
            }
          >
            <span className={styles.countdownNum}>
              {diffDays > 0 ? diffDays : isOngoing ? elapsedDays : '0'}
            </span>
            <span className={styles.countdownUnit}>
              {diffDays > 0 ? 'days' : isOngoing ? 'active' : 'today'}
            </span>
          </div>
        </div>

        {/* Bottom Multi-Metric Telemetry Row & Cockpit Action Button */}
        <div className={styles.heroStatsRow}>
          <div className={styles.telemetryGroup}>
            <div className={styles.heroStatPair}>
              <span className={styles.heroStatLabel}>Waypoints</span>
              <span className={styles.heroStatValue}>{poisCount} STOPS</span>
            </div>

            <div className={styles.heroStatPair}>
              <span className={styles.heroStatLabel}>Crew</span>
              <span className={styles.heroStatValue}>
                {participantsCount > 1 ? `${participantsCount} TRAVELERS` : 'SOLO'}
              </span>
            </div>

            {estimatedCost !== null && (
              <div className={styles.heroStatPair}>
                <span className={styles.heroStatLabel}>Est. Budget</span>
                <span className={styles.heroStatValue}>
                  €{Math.round(estimatedCost).toLocaleString()}
                </span>
              </div>
            )}

            {formattedTz && (
              <div className={styles.heroStatPair}>
                <span className={styles.heroStatLabel}>Timezone</span>
                <span className={styles.heroStatValue}>{formattedTz}</span>
              </div>
            )}
          </div>

          {/* Tactical Action Button */}
          <div className={styles.openCockpitBtn}>
            <span>OPEN COCKPIT</span>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}


