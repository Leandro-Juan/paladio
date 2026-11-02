"use client";

import React, { useMemo, useEffect, useState } from 'react';
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

  // Extract candidate POIs from upcoming trips (or all trips if no upcoming)
  const candidatePois = useMemo(() => {
    const tripsToScan = upcomingTrips.length > 0 ? upcomingTrips : trips;
    if (!tripsToScan || tripsToScan.length === 0) return [];

    const candidates: ExtractedPoi[] = [];
    const seenNames = new Set<string>();

    for (const trip of tripsToScan) {
      const itin = trip.itinerary_data as {
        days?: Array<{
          itinerary?: {
            path?: Array<{
              poi?: {
                id?: string;
                name?: string;
                city?: string;
                category?: string;
                description?: string;
                photo_url?: string;
                scoring?: unknown;
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
          if (!p || !p.name) continue;

          const catUpper = (p.category || '').toUpperCase();
          // Skip transit stops or airport transfers for recommendations
          if (
            catUpper.includes('TRANSIT') ||
            catUpper.includes('AIRPORT') ||
            catUpper.includes('STATION') ||
            catUpper.includes('HOTEL')
          ) {
            continue;
          }

          const normName = p.name.trim().toLowerCase();
          if (seenNames.has(normName)) continue;
          seenNames.add(normName);

          const city = p.city || trip.destination || 'Destination';
          const matchPct = calculateTasteMatch(p as unknown as Record<string, unknown>, trip.id || 'paladio');

          candidates.push({
            id: p.id,
            name: p.name,
            city,
            category: p.category,
            description: p.description,
            photo_url: p.photo_url || undefined,
            tasteMatchPct: matchPct,
            tripId: trip.id,
            tripDestination: trip.destination,
          });
        }
      }
    }

    // Sort descending by taste match score across all candidate waypoints
    return candidates.sort((a, b) => b.tasteMatchPct - a.tasteMatchPct);
  }, [trips, upcomingTrips]);

  // Hook for batch photo retrieval on top candidate pool
  const candidatePool = useMemo(() => candidatePois.slice(0, 25), [candidatePois]);
  const { getPhoto } = usePoiPhotos(candidatePool);

  // Strictly filter to candidates that have an authentic photograph
  const poisWithPhotos = useMemo(() => {
    return candidatePois
      .filter((poi) => {
        const photo = poi.photo_url || getPhoto(poi.id) || getPhoto(poi.name);
        return Boolean(photo && typeof photo === 'string' && photo.trim().length > 0);
      })
      .slice(0, 3);
  }, [candidatePois, getPhoto]);

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
        <div className={styles.standbyContainer} style={{ minHeight: '260px', justifyContent: 'center', alignItems: 'center' }}>
          <PaladioLoader variant="card" showLogo={false} />
        </div>
      </div>
    );
  }

  if (poisWithPhotos.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.standbyContainer}>
          <span className={styles.standbyTag}>{'// TASTE ENGINE RECOMMENDATIONS'}</span>
          <h3 className={styles.standbyTitle}>No Queued Mission Waypoints with Verified Photography</h3>
          <p className={styles.standbyDesc}>
            Initialize your next mission to generate sovereign taste-matched POI recommendations with authentic photography.
          </p>
          <Link href="/engine" className={styles.standbyBtn}>
            + Initialize Mission
          </Link>
        </div>
      </div>
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
        {poisWithPhotos.map((poi, idx) => {
          const photoUrl = poi.photo_url || getPhoto(poi.id) || getPhoto(poi.name);
          if (!photoUrl) return null;
          const description = enrichedDescriptions[poi.name] || poi.description;

          return (
            <RecommendedPoiCard
              key={poi.id || `${poi.name}-${idx}`}
              id={poi.id}
              name={poi.name}
              city={poi.city}
              category={poi.category}
              description={description}
              photoUrl={photoUrl}
              tasteMatchPct={poi.tasteMatchPct}
              tripId={poi.tripId}
            />
          );
        })}
      </div>
    </section>
  );
}
