"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import type { Trip } from '@/hooks/useTrips';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { Modal } from '@/components/Modal';
import { UpcomingTripCard } from './UpcomingTripCard';
import styles from './UpcomingTripsSection.module.css';

interface UpcomingTripsSectionProps {
  upcomingTrips: Trip[];
  loading?: boolean;
  onDeleteTrip?: (id: string) => Promise<boolean>;
}

export function UpcomingTripsSection({ upcomingTrips, loading, onDeleteTrip }: UpcomingTripsSectionProps) {
  const { t } = useTranslation();
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  // Watch destination photos for all upcoming trips
  const poiWatch = useMemo(() => {
    const list: Array<{ name: string; city: string }> = [];
    for (const t of upcomingTrips) {
      if (t.destination) {
        list.push({ name: t.destination, city: t.destination });
        const city = t.destination.split(',')[0].trim();
        if (city && city.toLowerCase() !== t.destination.toLowerCase()) {
          list.push({ name: city, city });
        }
      }
    }
    return list;
  }, [upcomingTrips]);

  const { getPhoto } = usePoiPhotos(poiWatch);

  return (
    <section className={styles.section} data-testid="upcoming-trips-section" aria-label={t('dashboard.upcoming_trips_title')}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>{t('dashboard.upcoming_trips')}</h2>
          <span className={styles.countBadge}>
            {loading ? t('common.loading') : `${upcomingTrips.length} SCHEDULED`}
          </span>
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyDesc}>{t('dashboard.syncing_schedules')}</p>
        </div>
      ) : upcomingTrips.length === 0 ? (
        <div className={styles.emptyState}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }} aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <h3 className={styles.emptyTitle}>{t('dashboard.no_upcoming_trips')}</h3>
          <p className={styles.emptyDesc}>
            {t('dashboard.no_upcoming_desc')}
          </p>
          <Link href="/engine" className={styles.emptyAction}>
            {t('dashboard.initialize_protocol')}
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {upcomingTrips.map((trip, idx) => {
            const rawCity = trip.destination ? trip.destination.split(',')[0].trim() : '';
            const resolvedPhoto =
              getPhoto(trip.destination) || (rawCity ? getPhoto(rawCity) : undefined);

            return (
              <UpcomingTripCard
                key={trip.id || idx}
                trip={trip}
                photoUrl={resolvedPhoto}
                onAbort={onDeleteTrip ? (id) => setTripToDelete(id) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Abort Trip Modal */}
      <Modal
        isOpen={tripToDelete !== null}
        title="ABORT MISSION?"
        message="Are you sure you want to delete this itinerary? This action cannot be undone and the route data will be permanently purged from the system."
        confirmText="CONFIRM ABORT"
        cancelText="CANCEL"
        isDanger={true}
        onConfirm={async () => {
          if (tripToDelete && onDeleteTrip) {
            await onDeleteTrip(tripToDelete);
            setTripToDelete(null);
          }
        }}
        onCancel={() => setTripToDelete(null)}
      />
    </section>
  );
}
