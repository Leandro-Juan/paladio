"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { Trip } from '@/hooks/useTrips';
import {
  extractTripTitle,
  countWaypoints,
  extractTotalCost,
  extractRouteCorridor,
} from '@/utils/tripParser';
import { getCountryForDestination } from '@/components/VaultMap';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { resolveApiMediaUrl } from '@/utils/api';
import styles from './UpcomingTripCard.module.css';

interface UpcomingTripCardProps {
  trip: Trip;
  photoUrl?: string;
  onAbort?: (tripId: string) => void;
}

function resolveTripPhoto(
  externalPhotoUrl?: string,
  itineraryData?: unknown,
  destination?: string,
  rawCity?: string,
  getPhoto?: (city: string) => string | undefined
): string | null {
  if (externalPhotoUrl) return externalPhotoUrl;

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
  } | null | undefined;

  if (Array.isArray(itin?.photos) && itin.photos.length > 0 && itin.photos[0]) {
    const p = itin.photos[0];
    const raw = typeof p === 'string' ? p : p.url;
    if (raw) return resolveApiMediaUrl(raw);
  }

  if (itin?.cover_photo) {
    const raw = typeof itin.cover_photo === 'string' ? itin.cover_photo : itin.cover_photo.url;
    if (raw) return resolveApiMediaUrl(raw);
  }

  if (Array.isArray(itin?.days)) {
    for (const d of itin.days) {
      if (Array.isArray(d?.itinerary?.path)) {
        for (const stop of d.itinerary.path) {
          if (stop?.poi?.photo_url) {
            return resolveApiMediaUrl(stop.poi.photo_url);
          }
        }
      }
    }
  }

  if (destination && getPhoto) {
    const cityPhoto = getPhoto(destination) || (rawCity ? getPhoto(rawCity) : undefined);
    if (cityPhoto) return resolveApiMediaUrl(cityPhoto);
  }

  return null;
}

export function UpcomingTripCard({ trip, photoUrl: externalPhotoUrl, onAbort }: UpcomingTripCardProps) {
  const destination = trip.destination;
  const rawCity = useMemo(() => (destination ? destination.split(',')[0].trim() : ''), [destination]);

  // Route corridor display resolved dynamically on backend with zero-roundtrip render
  const corridorDisplay = useMemo(() => {
    if (trip.corridor) {
      return trip.corridor;
    }
    const orig = trip.origin_iata;
    const dest = trip.destination_iata;
    if (orig && dest) {
      return `${orig} → ${dest}`;
    }
    if (dest) {
      return `→ ${dest}`;
    }

    const corridor = extractRouteCorridor(trip.itinerary_data);
    const cOrig = corridor?.originIata;
    const cDest = corridor?.destinationIata;
    if (cOrig && cDest) {
      return `${cOrig} → ${cDest}`;
    }
    if (cDest) {
      return `→ ${cDest}`;
    }
    return null;
  }, [trip.corridor, trip.origin_iata, trip.destination_iata, trip.itinerary_data]);

  // Subscribe to photo requests for this trip destination (fallback if not prefetched by section)
  const poiWatch = useMemo(() => {
    if (!destination) return [];
    const list = [{ name: destination, city: destination }];
    if (rawCity && rawCity.toLowerCase() !== destination.toLowerCase()) {
      list.push({ name: rawCity, city: rawCity });
    }
    return list;
  }, [destination, rawCity]);

  const { getPhoto } = usePoiPhotos(poiWatch);

  // Dynamic calculations
  const title = useMemo(() => extractTripTitle(trip), [trip]);

  const country = useMemo(() => {
    return getCountryForDestination(trip.destination);
  }, [trip.destination]);

  const destinationDisplay = useMemo(() => {
    if (!trip.destination) return 'Active Expedition';
    if (trip.destination.includes(',')) return trip.destination;
    return country && country.toLowerCase() !== trip.destination.toLowerCase()
      ? `${trip.destination}, ${country}`
      : trip.destination;
  }, [trip.destination, country]);

  // Date and duration calculations
  const { totalDays, dateRangeStr, countdownStr } = useMemo(() => {
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    const now = new Date();

    const isValidStart = !isNaN(start.getTime());
    const isValidEnd = !isNaN(end.getTime());

    let days = 1;
    if (isValidStart && isValidEnd) {
      days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }

    let range = '';
    if (isValidStart) {
      const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (isValidEnd) {
        const endFmt = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        range = `${startFmt} - ${endFmt}`;
      } else {
        range = startFmt;
      }
    }

    let countdown = '';
    if (isValidStart) {
      const diffMs = start.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        countdown = `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
      } else if (diffDays === 0) {
        countdown = 'Today';
      } else {
        countdown = 'Active';
      }
    }

    return {
      totalDays: days,
      dateRangeStr: range,
      countdownStr: countdown,
    };
  }, [trip.start_date, trip.end_date]);

  // Dynamic Photo Resolution
  const photoUrl = resolveTripPhoto(externalPhotoUrl, trip.itinerary_data, destination, rawCity, getPhoto);

  // Extract Important Trip Information Badges (replacing notes)
  const tripHighlights = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      variant: 'pillMint' | 'pillSky' | 'pillAmber' | 'pillLavender' | 'pillBlush';
      icon: React.ReactNode;
    }> = [];

    const itin = trip.itinerary_data as {
      travel_constraints?: {
        pace?: string;
        budget_usd?: number;
      };
    } | null | undefined;

    // 1. Waypoints / Stops count
    const stops = countWaypoints(trip.itinerary_data);
    if (stops > 0) {
      list.push({
        id: 'stops',
        label: `${stops} ${stops === 1 ? 'stop' : 'stops'}`,
        variant: 'pillMint',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        ),
      });
    }

    // 2. Estimated Cost or Budget
    const cost = extractTotalCost(trip.itinerary_data);
    if (cost && cost > 0) {
      list.push({
        id: 'cost',
        label: `€${cost.toLocaleString()}`,
        variant: 'pillAmber',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        ),
      });
    } else if (itin?.travel_constraints?.budget_usd) {
      list.push({
        id: 'budget',
        label: `$${itin.travel_constraints.budget_usd.toLocaleString()}`,
        variant: 'pillAmber',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        ),
      });
    }

    // 3. Pace
    if (itin?.travel_constraints?.pace) {
      const pace = itin.travel_constraints.pace;
      list.push({
        id: 'pace',
        label: `${pace.charAt(0).toUpperCase() + pace.slice(1)} pace`,
        variant: 'pillLavender',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 14 14" />
          </svg>
        ),
      });
    }

    // 4. Ticket count if any
    if (trip.tickets_count && trip.tickets_count > 0) {
      list.push({
        id: 'tickets',
        label: `${trip.tickets_count} ${trip.tickets_count === 1 ? 'ticket' : 'tickets'}`,
        variant: 'pillSky',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        ),
      });
    }

    return list.slice(0, 3);
  }, [trip.itinerary_data, trip.tickets_count]);

  const participants = trip.participants || [];

  return (
    <div className={styles.card} data-testid="upcoming-trip-card">
      {/* Header Top Row: Title + Route Corridor */}
      <div className={styles.headerTop}>
        <h3 className={styles.title}>{title}</h3>
        {corridorDisplay && (
          <div className={styles.corridorBadge} data-testid="trip-corridor-badge" title={`Transit Corridor: ${corridorDisplay}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
            </svg>
            <span className={styles.corridorText}>{corridorDisplay}</span>
          </div>
        )}
      </div>

      {/* Header Row 2: Location Subtitle */}
      <p className={styles.subtitle}>{destinationDisplay}</p>

      {/* Header Row 3: Meta Strip */}
      <div className={styles.metaRow}>
        <div className={styles.duration}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{totalDays} {totalDays === 1 ? 'day' : 'days'}</span>
        </div>

        {dateRangeStr && (
          <span className={styles.datePill}>{dateRangeStr}</span>
        )}
      </div>

      {/* Landscape Image Banner with Countdown */}
      <div className={styles.imageContainer}>
        {photoUrl ? (
          <img src={photoUrl} alt={title} className={styles.bannerImage} />
        ) : (
          <div className={styles.bannerPlaceholder}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        )}

        {countdownStr && (
          <div className={styles.countdownBadge}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{countdownStr}</span>
          </div>
        )}
      </div>

      {/* Important Trip Information Row (Stops, Status, Budget/Pace) */}
      {tripHighlights.length > 0 && (
        <div className={styles.infoRow} data-testid="trip-highlights-row">
          {tripHighlights.map((hl) => (
            <span key={hl.id} className={`${styles.infoPill} ${styles[hl.variant]}`}>
              {hl.icon}
              <span>{hl.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Going / Crew Row */}
      <div className={styles.goingRow}>
        <span className={styles.label}>going:</span>
        <div className={styles.avatarsList}>
          {participants.length > 0 ? (
            participants.slice(0, 4).map((p, idx) => {
              const initials = p.name
                ? p.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : 'TR';
              return (
                <div key={p.id || idx} className={styles.avatar} title={p.name}>
                  <span>{initials}</span>
                </div>
              );
            })
          ) : (
            <div className={styles.avatar} title="1 Traveler">
              <span>TR</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Details Action */}
      <div className={styles.footerAction}>
        {onAbort && trip.id && (
          <button
            type="button"
            onClick={() => onAbort(trip.id!)}
            className={styles.abortBtn}
          >
            ABORT
          </button>
        )}
        <Link href={`/trips/${trip.id}`} className={styles.detailsLink}>
          View more details
        </Link>
      </div>
    </div>
  );
}
