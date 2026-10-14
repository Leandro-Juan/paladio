"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTrips } from '@/hooks/useTrips';
import { ActiveTripTicket } from '@/components/ActiveTripTicket';
import { HarmonicRadarWidget } from '@/components/HarmonicRadarWidget';
import { Calendar } from '@/components/Calendar';
import { PreferenceModelSection } from '@/components/PreferenceModelSection';
import { countWaypoints } from '@/utils/tripParser';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const { trips, upcomingTrips, loading } = useTrips();

  const nextTrip = upcomingTrips.length > 0 ? upcomingTrips[0] : null;

  return (
    <div className={styles.container}>
      {/* Header Bar */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Welcome to Paladio Control Center</h1>
          <p className={styles.subtitle}>Sovereign mission control and temporal dispatch</p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.telemetryStatus} title="Direct local connection active">
            <span className={styles.telemetryDot} />
            <span>Telemetry online</span>
          </div>

          <Link href="/engine" className={styles.primaryButton}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New mission</span>
          </Link>
        </div>
      </div>

      {/* Top 12-Column Grid: Hero Card (7 cols) + Currency Converter (5 cols) */}
      <div className={styles.topGrid}>
        <div className={styles.heroCol}>
          {loading ? (
            <div
              className="bg-surface border-subtle"
              style={{
                padding: '2.5rem',
                borderRadius: 'var(--radius-lg)',
                minHeight: '190px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <p className="text-muted font-mono" style={{ margin: 0 }}>
                LOADING UPCOMING ITINERARY...
              </p>
            </div>
          ) : nextTrip ? (
            <Link href={`/trips/${nextTrip.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
              <ActiveTripTicket
                destination={nextTrip.destination}
                startDate={nextTrip.start_date}
                endDate={nextTrip.end_date}
                poisCount={countWaypoints(nextTrip.itinerary_data)}
              />
            </Link>
          ) : (
            <ActiveTripTicket empty />
          )}
        </div>

        <div className={styles.radarCol}>
          <HarmonicRadarWidget />
        </div>
      </div>

      {/* Operations Calendar Section with integrated KPI strip */}
      <Calendar
        trips={trips}
        onSelectDate={(_, dateString) => router.push(`/engine?start_date=${dateString}`)}
      />

      {/* Preference Model Section */}
      <PreferenceModelSection />
    </div>
  );
}
