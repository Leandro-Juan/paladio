import React from 'react';
import Link from 'next/link';
import styles from './ActiveTripTicket.module.css';

export interface ActiveTripTicketProps {
  destination?: string;
  startDate?: string;
  endDate?: string;
  poisCount?: number;
  empty?: boolean;
}

export function ActiveTripTicket({
  destination,
  startDate,
  endDate,
  poisCount = 0,
  empty = false,
}: ActiveTripTicketProps) {
  if (empty || !destination || !startDate || !endDate) {
    return (
      <div className={styles.heroCard}>
        <div className={styles.seigaihaOverlay} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.standbyLeft}>
            <span className={styles.heroTagline}>STANDBY STATE</span>
            <h2 className={styles.heroDestination} style={{ fontSize: '22px' }}>
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

  // Calculate day progress if ongoing
  let dayProgressText = '';
  if (isOngoing) {
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const elapsedDays = Math.min(totalDays, Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1));
    dayProgressText = `Day ${elapsedDays} of ${totalDays}`;
  }

  const formattedDateRange = `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  return (
    <div className={styles.heroCard}>
      <div className={styles.seigaihaOverlay} aria-hidden="true" />
      <div className={styles.heroContent}>
        <div className={styles.heroTopRow}>
          <div>
            <span className={styles.heroTagline}>ACTIVE PROTOCOL</span>
            <h2 className={styles.heroDestination}>{destination}</h2>
            <p className={styles.heroDates}>
              {isOngoing ? `${dayProgressText} · ${formattedDateRange}` : formattedDateRange}
            </p>
          </div>

          {/* Sun Disc Countdown */}
          <div className={styles.sunCountdown} title={diffDays > 0 ? `${diffDays} days until departure` : 'Active deployment'}>
            <span className={styles.countdownNum}>{diffDays > 0 ? diffDays : isOngoing ? '●' : '0'}</span>
            <span className={styles.countdownUnit}>{diffDays > 0 ? 'days' : isOngoing ? 'active' : 'today'}</span>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className={styles.heroStatsRow}>
          <div className={styles.heroStatPair}>
            <span className={styles.heroStatLabel}>Waypoints</span>
            <span className={styles.heroStatValue}>{poisCount} STOPS</span>
          </div>

          <div className={styles.heroStatPair}>
            <span className={styles.heroStatLabel}>Status</span>
            <span className={styles.chipConfirmed}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {isOngoing ? 'Active' : 'Confirmed'}
            </span>
          </div>

          {/* Sovereign Stamp */}
          <div aria-hidden="true" className={styles.stamp}>
            PALADIO SOVEREIGN DISPATCH
          </div>
        </div>
      </div>
    </div>
  );
}
