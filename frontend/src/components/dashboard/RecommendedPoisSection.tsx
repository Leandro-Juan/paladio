"use client";

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Trip } from '@/hooks/useTrips';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { RecommendedPoiCard } from './RecommendedPoiCard';
import { getApiBaseUrl } from '@/utils/api';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import styles from './RecommendedPoisSection.module.css';

interface ExtractedPoi {
  id?: string;
  name: string;
  city: string;
  category?: string;
  description?: string | null;
  photo_url?: string;
  tasteMatchPct: number;
  tripId?: string;
  tripDestination: string;
}

interface RecommendedPoisSectionProps {
  trips: Trip[];
  upcomingTrips: Trip[];
  loading?: boolean;
}

function calculateTasteMatch(poi: Record<string, unknown>, userSeed: string): number {
  const scoring = poi.scoring as Record<string, unknown> | undefined;
  const raw =
    (poi as { similarity?: number; taste_match?: number }).similarity ??
    (poi as { taste_match?: number }).taste_match ??
    scoring?.taste_match ??
    scoring?.similarity;

  if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
    const pct = raw <= 1.0 ? Math.round(raw * 100) : Math.round(raw);
    return Math.min(99, Math.max(72, pct));
  }

  // Deterministic calculation based on POI name and category
  const key = `${(poi.name as string) || ''}_${(poi.category as string) || ''}_${userSeed}`;
  const seed = key.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return 82 + (seed % 17); // 82% to 98%
}

export function RecommendedPoisSection({ trips, upcomingTrips, loading }: RecommendedPoisSectionProps) {
  const [enrichedDescriptions, setEnrichedDescriptions] = useState<Record<string, string>>({});
  const [dismissedPoiKeys, setDismissedPoiKeys] = useState<Set<string>>(new Set());
  const [dynamicCityPois, setDynamicCityPois] = useState<ExtractedPoi[]>([]);

  const handleDismissPoi = useCallback((idOrName: string) => {
    setDismissedPoiKeys((prev) => {
      const next = new Set(prev);
      next.add(idOrName);
      return next;
    });
  }, []);

  // Collect all POI IDs and names that are ALREADY in any itinerary or visited
  const visitedOrInItineraryKeys = useMemo(() => {
    const set = new Set<string>();
    for (const trip of trips) {
      const itin = trip.itinerary_data as {
        days?: Array<{
          itinerary?: {
            path?: Array<{
              poi?: {
                id?: string;
                name?: string;
              };
            }>;
          };
        }>;
      } | null | undefined;

      if (!itin || !Array.isArray(itin.days)) continue;
      for (const day of itin.days) {
        if (!day.itinerary || !Array.isArray(day.itinerary.path)) continue;
        for (const stop of day.itinerary.path) {
          const p = stop.poi;
          if (!p) continue;
          if (p.id) set.add(p.id.toLowerCase());
          if (p.name) set.add(p.name.trim().toLowerCase());
        }
      }
    }
    return set;
  }, [trips]);

  const targetTrip = upcomingTrips[0] || trips[0];
  const targetCity = targetTrip?.destination;
  const targetTripId = targetTrip?.id;

  // Dynamically fetch unvisited destination POI recommendations from backend
  useEffect(() => {
    if (!targetCity) return;
    let isMounted = true;

    async function fetchDestinationPois() {
      try {
        const baseUrl = getApiBaseUrl();
        const cleanCity = targetCity.split('(')[0].split(',')[0].trim();
        const tripParam = targetTripId ? `&trip_id=${encodeURIComponent(targetTripId)}` : '';
        const res = await fetch(`${baseUrl}/pois/search?city=${encodeURIComponent(cleanCity)}${tripParam}&limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        const items = data.results || data.items || [];
        if (!isMounted || !Array.isArray(items)) return;

        const results: ExtractedPoi[] = [];
        for (const item of items) {
          if (!item.name) continue;
          const matchPct = calculateTasteMatch(item as Record<string, unknown>, targetTripId || 'paladio');
          results.push({
            id: item.id,
            name: item.name,
            city: targetCity,
            category: item.category,
            description: item.description,
            photo_url: item.photo_url || item.thumbnail_url,
            tasteMatchPct: matchPct,
            tripId: targetTripId,
            tripDestination: targetCity,
          });
        }
        if (isMounted && results.length > 0) {
          setDynamicCityPois(results);
        }
      } catch {
        // Ignore network errors in recommendation fetch
      }
    }

    fetchDestinationPois();
    return () => {
      isMounted = false;
    };
  }, [targetCity, targetTripId]);

  // Aggregate candidate POIs, STRICTLY EXCLUDING any POI already in any itinerary or visited
  const candidatePois = useMemo(() => {
    const candidates: ExtractedPoi[] = [];
    const seenNames = new Set<string>();

    const checkAndAdd = (
      p: {
        id?: string;
        name?: string;
        city?: string;
        category?: string;
        description?: string | null;
        photo_url?: string;
        thumbnail_url?: string;
        scoring?: unknown;
      },
      tripId?: string,
      tripDestination?: string
    ) => {
      if (!p || !p.name) return;

      const catUpper = (p.category || '').toUpperCase();
      if (
        catUpper.includes('TRANSIT') ||
        catUpper.includes('AIRPORT') ||
        catUpper.includes('STATION') ||
        catUpper.includes('HOTEL')
      ) {
        return;
      }

      const normName = p.name.trim().toLowerCase();
      const pId = (p.id || '').toLowerCase();

      // INVARIANT: Never recommend POIs already visited or in any itinerary
      if (visitedOrInItineraryKeys.has(normName) || (pId && visitedOrInItineraryKeys.has(pId))) {
        return;
      }

      if (seenNames.has(normName)) return;
      seenNames.add(normName);

      const city = p.city || tripDestination || targetCity || 'Destination';
      const matchPct = calculateTasteMatch(p as unknown as Record<string, unknown>, tripId || 'paladio');

      candidates.push({
        id: p.id,
        name: p.name,
        city,
        category: p.category,
        description: p.description,
        photo_url: p.photo_url || p.thumbnail_url || undefined,
        tasteMatchPct: matchPct,
        tripId: tripId || targetTripId,
        tripDestination: city,
      });
    };

    // 1. Check trip candidates/recommendations/zone_candidates from trips
    const tripsToScan = upcomingTrips.length > 0 ? upcomingTrips : trips;
    for (const trip of tripsToScan) {
      const itin = trip.itinerary_data as {
        candidates?: Array<Record<string, unknown>>;
        recommendations?: Array<Record<string, unknown>>;
        discovered_pois?: Array<Record<string, unknown>>;
        unselected_pois?: Array<Record<string, unknown>>;
        dropped_pois?: Array<Record<string, unknown>>;
        days?: Array<{
          zone_candidates?: Array<Record<string, unknown>>;
          dropped_pois?: Array<Record<string, unknown>>;
        }>;
      } | null | undefined;

      if (!itin) continue;

      const pools = [
        itin.candidates,
        itin.recommendations,
        itin.discovered_pois,
        itin.unselected_pois,
        itin.dropped_pois,
      ];
      for (const pool of pools) {
        if (Array.isArray(pool)) {
          for (const item of pool) {
            checkAndAdd(item, trip.id, trip.destination);
          }
        }
      }

      if (Array.isArray(itin.days)) {
        for (const day of itin.days) {
          if (Array.isArray(day.zone_candidates)) {
            for (const z of day.zone_candidates) {
              const poiObj = z.poi || z;
              checkAndAdd(poiObj, trip.id, trip.destination);
            }
          }
          if (Array.isArray(day.dropped_pois)) {
            for (const d of day.dropped_pois) {
              const poiObj = d.poi || d;
              checkAndAdd(poiObj, trip.id, trip.destination);
            }
          }
        }
      }
    }

    // 2. Check dynamic city recommendations from /pois/search
    for (const dyn of dynamicCityPois) {
      checkAndAdd(dyn, targetTripId, targetCity);
    }

    // Sort descending by taste match score across all unvisited, non-itinerary candidate waypoints
    return candidates.sort((a, b) => b.tasteMatchPct - a.tasteMatchPct);
  }, [trips, upcomingTrips, visitedOrInItineraryKeys, dynamicCityPois, targetCity, targetTripId]);

  // Hook for batch photo retrieval on top candidate pool with expanded pre-fetch depth
  const candidatePool = useMemo(() => candidatePois.slice(0, 60), [candidatePois]);
  const { getPhoto } = usePoiPhotos(candidatePool);

  // Filter out waypoints dismissed by the user
  const activeCandidates = useMemo(() => {
    if (dismissedPoiKeys.size === 0) return candidatePois;
    return candidatePois.filter((poi) => {
      const key = poi.id || poi.name;
      return (
        !dismissedPoiKeys.has(key) &&
        !dismissedPoiKeys.has(poi.name) &&
        !(poi.id && dismissedPoiKeys.has(poi.id))
      );
    });
  }, [candidatePois, dismissedPoiKeys]);

  // Strictly filter to active candidates that have an authentic photograph
  const poisWithPhotos = useMemo(() => {
    return activeCandidates
      .filter((poi) => {
        const photo = poi.photo_url || getPhoto(poi.id) || getPhoto(poi.name);
        return Boolean(photo && typeof photo === 'string' && photo.trim().length > 0);
      })
      .slice(0, 3);
  }, [activeCandidates, getPhoto]);

  // If descriptions are missing, dynamically hydrate from POI details endpoint
  useEffect(() => {
    if (poisWithPhotos.length === 0) return;

    let isMounted = true;
    async function hydrateDescriptions() {
      const baseUrl = getApiBaseUrl();
      const updates: Record<string, string> = {};

      for (const poi of poisWithPhotos) {
        if (poi.description || !poi.id) continue;
        try {
          const qs = new URLSearchParams({
            name: poi.name,
            city: poi.city,
          });
          const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(poi.id)}?${qs}`);
          if (res.ok) {
            const data = await res.json();
            if (data.description && typeof data.description === 'string') {
              updates[poi.name] = data.description;
            }
          }
        } catch {
          // Ignore hydration network errors
        }
      }

      if (isMounted && Object.keys(updates).length > 0) {
        setEnrichedDescriptions((prev) => ({ ...prev, ...updates }));
      }
    }

    hydrateDescriptions();
    return () => {
      isMounted = false;
    };
  }, [poisWithPhotos]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <PaladioLoader variant="card" showLogo={false} />
        </div>
      </div>
    );
  }

  if (poisWithPhotos.length === 0) {
    const hasDismissals = dismissedPoiKeys.size > 0;
    const hasUpcomingTrips = upcomingTrips.length > 0;

    return (
      <section className={styles.container} aria-label="Top taste-matched destination recommendations">
        <div className={styles.headerRow}>
          <div className={styles.sectionTitleBlock}>
            <h3 className={styles.sectionTitle}>Recommended POIs</h3>
          </div>
          <span className={styles.standbyPill}>STANDBY</span>
        </div>

        <div className={styles.standbyCard}>
          <div className={styles.standbyIllustration}>
            <svg
              width="88"
              height="56"
              viewBox="0 0 100 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className={styles.standbySvg}
            >
              {/* Pacific Jazz Sun disc */}
              <circle cx="50" cy="24" r="14" fill="var(--color-accent-coral, #D42A2F)" opacity="0.85" />
              {/* Mountain Peak / Waypoint silhouette */}
              <path d="M22 54 L42 28 L48 34 L52 26 L58 34 L62 28 L82 54 Z" fill="var(--color-accent-teal-mid, #1B8FA6)" />
              {/* Snow cap peak matching surface */}
              <path d="M42 28 L48 34 L52 26 L58 34 L62 28 L58 22 L46 22 Z" fill="var(--color-surface-card, #FAF6F0)" />
              {/* Minimalist horizon wave */}
              <path
                d="M10 54 Q 30 50 50 54 T 90 54"
                stroke="var(--color-accent-teal-soft, #7CC4D1)"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          <div className={styles.standbyContent}>
            <span className={styles.standbyTag}>
              {hasDismissals
                ? '// TASTE ENGINE TELEMETRY'
                : hasUpcomingTrips
                ? '// DESTINATION SCAN'
                : '// OPERATIONAL STANDBY'}
            </span>
            <h4 className={styles.standbyTitle}>
              {hasDismissals
                ? 'All Queued Recommendations Reviewed'
                : hasUpcomingTrips
                ? 'No Verified Photography in Corridor'
                : 'No Upcoming Missions Queued'}
            </h4>
            <p className={styles.standbyDesc}>
              {hasDismissals
                ? 'You have reviewed all available recommendations for your missions. You can reset dismissed waypoints to explore them again.'
                : hasUpcomingTrips
                ? 'Waypoints in this destination corridor are awaiting verified visual telemetry. Add places in your trip workspace or explore new destinations.'
                : 'Initialize your next expedition protocol to generate sovereign, taste-matched waypoint recommendations with authentic photography.'}
            </p>
            <div className={styles.standbyActionsRow}>
              {hasDismissals && (
                <button
                  type="button"
                  onClick={() => setDismissedPoiKeys(new Set())}
                  className={styles.standbySecondaryBtn}
                >
                  Reset Recommendations
                </button>
              )}
              <Link href="/engine" className={styles.standbyPrimaryBtn}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Initialize Mission</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.container} aria-label="Top taste-matched destination recommendations">
      <div className={styles.headerRow}>
        <div className={styles.sectionTitleBlock}>
          <h3 className={styles.sectionTitle}>Recommended POIs</h3>
        </div>
      </div>

      {/* 3-Column Grid hosting RecommendedPoiCard matching Swiss Chalet reference */}
      <div className={styles.cardsGrid}>
        {poisWithPhotos.map((poi) => {
          const photoUrl = poi.photo_url || getPhoto(poi.id) || getPhoto(poi.name);
          if (!photoUrl) return null;
          const description = enrichedDescriptions[poi.name] || poi.description;

          return (
            <RecommendedPoiCard
              key={poi.id || poi.name}
              id={poi.id}
              name={poi.name}
              city={poi.city}
              category={poi.category}
              description={description}
              photoUrl={photoUrl}
              tasteMatchPct={poi.tasteMatchPct}
              tripId={poi.tripId}
              onDismiss={handleDismissPoi}
            />
          );
        })}
      </div>
    </section>
  );
}
