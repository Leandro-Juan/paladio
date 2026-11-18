"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrips } from '@/hooks/useTrips';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { ActiveTripTicket } from '@/components/ActiveTripTicket';
import { HarmonicRadarWidget } from '@/components/HarmonicRadarWidget';
import { BestOfferCard } from '@/components/dashboard/BestOfferCard';
import { SeedTasteCard } from '@/components/dashboard/SeedTasteCard';
import { RecommendedPoisSection } from '@/components/dashboard/RecommendedPoisSection';
import { Calendar } from '@/components/Calendar';
import { UpcomingTripsSection } from '@/components/dashboard/UpcomingTripsSection';
import { SavedCollectionsSection } from '@/components/dashboard/SavedCollectionsSection';
import { countWaypoints, extractTripTitle } from '@/utils/tripParser';
import { resolveApiMediaUrl } from '@/utils/api';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import styles from './dashboard.module.css';

function extractItineraryPhoto(itineraryData: unknown): string | undefined {
  if (!itineraryData) return undefined;
  const itin = itineraryData as {
    photos?: Array<string | { url?: string }>;
    cover_photo?: string | { url?: string };
    photo_url?: string;
    days?: Array<{
      itinerary?: {
        path?: Array<{
          poi?: {
            photo_url?: string;
          };
        }>;
      };
    }>;
  };
  if (Array.isArray(itin.photos) && itin.photos.length > 0 && itin.photos[0]) {
    const p = itin.photos[0];
    const raw = typeof p === 'string' ? p : p.url;
    if (raw) return resolveApiMediaUrl(raw);
  }
  if (itin.cover_photo) {
    const raw = typeof itin.cover_photo === 'string' ? itin.cover_photo : itin.cover_photo.url;
    if (raw) return resolveApiMediaUrl(raw);
  }
  if (itin.photo_url) {
    return resolveApiMediaUrl(itin.photo_url);
  }
  if (Array.isArray(itin.days)) {
    for (const day of itin.days) {
      if (Array.isArray(day?.itinerary?.path)) {
        for (const stop of day.itinerary.path) {
          if (stop?.poi?.photo_url) {
            return resolveApiMediaUrl(stop.poi.photo_url);
          }
        }
      }
    }
  }
  return undefined;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { trips, upcomingTrips, loading, deleteTrip } = useTrips();

  const nextTrip = upcomingTrips.length > 0 ? upcomingTrips[0] : null;

  // Extract destination photo from itinerary if available
  const itinPhoto = extractItineraryPhoto(nextTrip?.itinerary_data);

  const nextTripDestination = nextTrip?.destination;
  const poiWatch = useMemo(() => {
    if (!nextTripDestination) return [];
    return [{ name: nextTripDestination, city: nextTripDestination }];
  }, [nextTripDestination]);

  const { getPhoto } = usePoiPhotos(poiWatch);
  const nextTripPhoto = itinPhoto || (nextTrip ? getPhoto(nextTrip.destination) : undefined);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingWrapper}>
          <PaladioLoader />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <SeedTasteCard user={user} />
      <div className={styles.cockpitSection}>
        {/* Header Bar */}
        <div className={styles.header}>
          <h1 className={styles.title}>
            {user?.username ? t('dashboard.welcome_user', { username: user.username }) : t('dashboard.welcome_generic')}
          </h1>
        </div>

        {/* Top 12-Column Grid: Hero Trip Card (7 cols) + 8-Point Harmonic Radar Star (5 cols) */}
        <div className={styles.topGrid}>
          <div className={styles.heroCol}>
            {nextTrip ? (
              <Link
                href={`/trips/${nextTrip.id}`}
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                }}
              >
                <ActiveTripTicket
                  destination={nextTrip.destination}
                  title={extractTripTitle(nextTrip)}
                  startDate={nextTrip.start_date}
                  endDate={nextTrip.end_date}
                  poisCount={countWaypoints(nextTrip.itinerary_data)}
                  photoUrl={nextTripPhoto}
                  itineraryData={nextTrip.itinerary_data}
                  participantsCount={nextTrip.participants?.length ?? 1}
                  timezone={nextTrip.destination_timezone}
                />
              </Link>
            ) : (
              <ActiveTripTicket empty />
            )}
          </div>

          <div className={styles.radarCol}>
            <HarmonicRadarWidget user={user} />
          </div>
        </div>

        {/* Bottom 12-Column Grid:
            Left (4 cols): Best Offer from Monitored Routes
            Right (8 cols): Recommended POIs (3 Cards with Verified Photos) */}
        <div className={styles.bottomGrid}>
          <div className={styles.squareTicketCol}>
            <BestOfferCard />
          </div>

          <div className={styles.recommendedPoisCol}>
            <RecommendedPoisSection trips={trips} upcomingTrips={upcomingTrips} loading={loading} />
          </div>
        </div>
      </div>

      {/* Operations Calendar Section with integrated KPI strip */}
      <Calendar
        trips={trips}
        onSelectDate={(_, dateString) => router.push(`/engine?start_date=${dateString}`)}
        onSelectPackage={(pkg) => router.push(`/monitoring?route=${pkg.route_id}`)}
      />

      {/* All Upcoming Trips Section */}
      <UpcomingTripsSection upcomingTrips={upcomingTrips} loading={loading} onDeleteTrip={deleteTrip} />

      {/* Curated Saved Collections Section */}
      <SavedCollectionsSection trips={trips} />
    </div>
  );
}
