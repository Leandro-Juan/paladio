import React from 'react';
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
      <div className={styles.ticket}>
        <div className={styles.notchTop} aria-hidden="true" />
        <div className={styles.notchBottom} aria-hidden="true" />
        <div className={styles.stub}>
          <span className={styles.stubCaption}>PALADIO QUEUE</span>
        </div>
        <div className={styles.body} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <h3 className={styles.destination}>No Active Protocol</h3>
              <p className={styles.dates}>Awaiting mission parameters. Initialize your dispatch to start.</p>
            </div>
            <svg
              width="64"
              height="48"
              viewBox="0 0 120 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              style={{ flexShrink: 0, opacity: 0.8 }}
            >
              <path d="M30 32 C 45 28, 75 28, 90 32" stroke="var(--color-accent-coral)" strokeWidth="4" strokeLinecap="round" fill="none" />
              <line x1="36" y1="38" x2="84" y2="38" stroke="var(--color-accent-teal-mid)" strokeWidth="2.5" />
              <line x1="44" y1="34" x2="42" y2="68" stroke="var(--color-accent-teal-mid)" strokeWidth="3" strokeLinecap="round" />
              <line x1="76" y1="34" x2="78" y2="68" stroke="var(--color-accent-teal-mid)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="60" cy="50" r="10" fill="var(--color-accent-coral)" opacity="0.85" />
              <line x1="20" y1="68" x2="100" y2="68" stroke="var(--color-border)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.statsRow}>
            <span className={styles.statusChip}>IDLE</span>
            <div aria-hidden="true" className={`travel-stamp ${styles.stamp}`}>
              PALADIO SOVEREIGN DISPATCH
            </div>
          </div>
        </div>
        <div className={`seigaiha-bg ${styles.wavePattern}`} aria-hidden="true" />
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
    <div className={styles.ticket}>
      {/* Semicircle notches at tear boundary */}
      <div className={styles.notchTop} aria-hidden="true" />
      <div className={styles.notchBottom} aria-hidden="true" />

      {/* Left Stub */}
      <div className={styles.stub}>
        <span className={styles.stubCaption}>ACTIVE PROTOCOL</span>
      </div>

      {/* Main Ticket Body */}
      <div className={styles.body}>
        <div className={styles.headerRow}>
          <div>
            <h3 className={styles.destination}>{destination}</h3>
            <p className={styles.dates}>
              {isOngoing ? `${dayProgressText} · ${formattedDateRange}` : formattedDateRange}
            </p>
          </div>

          {/* Sun Disc Countdown */}
          <div className={styles.countdownCol}>
            {diffDays > 0 ? (
              <>
                <div className={`sun-disc ${styles.sunDisc}`}>{diffDays}</div>
                <span className={styles.countdownLabel}>DAYS OUT</span>
              </>
            ) : isOngoing ? (
              <>
                <div className={`sun-disc ${styles.sunDisc}`} style={{ background: 'var(--color-success)' }}>
                  ●
                </div>
                <span className={styles.countdownLabel}>IN PROGRESS</span>
              </>
            ) : (
              <>
                <div className={`sun-disc ${styles.sunDisc}`}>0</div>
                <span className={styles.countdownLabel}>DEPARTING TODAY</span>
              </>
            )}
          </div>
        </div>

        {/* Bottom stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statGroup}>
            <div className={styles.statPair}>
              <span className={styles.statLabel}>WAYPOINTS</span>
              <span className={styles.statValue}>{poisCount} STOPS</span>
            </div>

            <div className={styles.statPair}>
              <span className={styles.statLabel}>STATUS</span>
              <span className={styles.statusChip}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {isOngoing ? 'ACTIVE' : 'CONFIRMED'}
              </span>
            </div>
          </div>

          {/* Sovereign Stamp */}
          <div aria-hidden="true" className={`travel-stamp ${styles.stamp}`}>
            PALADIO SOVEREIGN DISPATCH
          </div>
        </div>
      </div>

      {/* Seigaiha wave overlay */}
      <div className={`seigaiha-bg ${styles.wavePattern}`} aria-hidden="true" />
    </div>
  );
}
