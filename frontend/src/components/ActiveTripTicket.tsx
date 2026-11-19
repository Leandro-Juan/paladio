import React, { useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import {
  extractTotalCost,
  resolveDestinationTimezone,
  formatTimezone,
} from '@/utils/tripParser';
import { resolveApiMediaUrl } from '@/utils/api';
import { ChevronRightIcon } from '@/components/icons';
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
  const { t, formatDate, formatCurrency } = useTranslation();
  // Dynamic telemetry parsed from itinerary data (called unconditionally at top level)
  const estimatedCost = useMemo(() => extractTotalCost(itineraryData), [itineraryData]);

  if (empty || !destination || !startDate || !endDate) {
    return (
      <div className={styles.heroCard}>
        <div className={styles.seigaihaOverlay} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.standbyLeft}>
            <h2 className={styles.heroDestination} style={{ fontSize: '26px' }}>
              {t('dashboard.no_active_missions')}
            </h2>
            <p className={styles.heroDates} style={{ marginBottom: '16px' }}>
              {t('dashboard.standby_description')}
            </p>
            <Link href="/engine" className={styles.initializeBtn}>
              {t('dashboard.initialize_protocol')}
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
    ? t('dashboard.day_progress', { current: elapsedDays, total: totalDays })
    : totalDays === 1
    ? t('dashboard.days_singular')
    : t('dashboard.days_plural', { count: totalDays });

  const formattedDateRange = `${formatDate(start, {
    month: 'short',
    day: 'numeric',
  })} – ${formatDate(end, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  const displayTitle = title || destination;
  const resolvedTz = resolveDestinationTimezone(destination, timezone);
  const formattedTz = formatTimezone(resolvedTz);

  const resolvedPhoto = photoUrl ? resolveApiMediaUrl(photoUrl) : undefined;

  return (
    <div className={styles.heroCard}>
      {resolvedPhoto ? (
        <>
          <div
            className={styles.photoBackground}
            style={{ backgroundImage: `url(${resolvedPhoto})` }}
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
                ? t('dashboard.days_countdown', { count: diffDays })
                : isOngoing
                ? t('dashboard.day_active', { day: elapsedDays })
                : t('dashboard.departing_today')
            }
          >
            <span className={styles.countdownNum}>
              {diffDays > 0 ? diffDays : isOngoing ? elapsedDays : '0'}
            </span>
            <span className={styles.countdownUnit}>
              {diffDays > 0
                ? t('dashboard.countdown_days_unit')
                : isOngoing
                ? t('dashboard.countdown_active_unit')
                : t('dashboard.countdown_today_unit')}
            </span>
          </div>
        </div>

        {/* Bottom Multi-Metric Telemetry Row & Cockpit Action Button */}
        <div className={styles.heroStatsRow}>
          <div className={styles.telemetryGroup}>
            <div className={styles.heroStatPair}>
              <span className={styles.heroStatLabel}>{t('dashboard.waypoints')}</span>
              <span className={styles.heroStatValue}>{t('dashboard.stops_count', { count: poisCount })}</span>
            </div>

            <div className={styles.heroStatPair}>
              <span className={styles.heroStatLabel}>{t('dashboard.crew')}</span>
              <span className={styles.heroStatValue}>
                {participantsCount > 1
                  ? t('dashboard.travelers_count', { count: participantsCount })
                  : t('dashboard.solo')}
              </span>
            </div>

            {estimatedCost !== null && (
              <div className={styles.heroStatPair}>
                <span className={styles.heroStatLabel}>{t('dashboard.est_budget')}</span>
                <span className={styles.heroStatValue}>
                  {formatCurrency(Math.round(estimatedCost))}
                </span>
              </div>
            )}

            {formattedTz && (
              <div className={styles.heroStatPair}>
                <span className={styles.heroStatLabel}>{t('dashboard.timezone')}</span>
                <span className={styles.heroStatValue}>{formattedTz}</span>
              </div>
            )}
          </div>

          {/* Tactical Action Button */}
          <div className={styles.openCockpitBtn}>
            <span>{t('dashboard.open_cockpit')}</span>
            <ChevronRightIcon size={13} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}


