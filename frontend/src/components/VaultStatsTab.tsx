"use client";

import React, { useState, useMemo } from 'react';
import type { Trip } from '@/hooks/useTrips';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { getCountryForDestination } from '@/components/VaultMap';

export interface VaultStatsTabProps {
  trips: Trip[];
  completedTrips: Trip[];
  onSelectDestination?: (coords: [number, number]) => void;
  getTripCoordinates: (t: Trip) => { lat: number; lng: number };
}

interface DestinationEngagement {
  name: string;
  country: string;
  tripsCount: number;
  totalDays: number;
  poisCount: number;
  coords: [number, number];
}

interface MonthlyStat {
  monthKey: string;
  monthLabel: string;
  tripsCount: number;
  daysCount: number;
  poisCount: number;
}

const PILL_COLORS = [
  'var(--color-accent-primary, #0F4C5C)',     // Paladio Deep Sea Teal
  'var(--color-accent-teal-mid, #1B8FA6)',    // Ocean Teal
  'var(--color-success, #1F7A4D)',            // Forest Green
  'var(--color-accent-gold, #E2B33C)',        // Amber Gold
  'var(--color-accent-secondary, #D42A2F)',   // Pacific Sun Coral
  'var(--color-accent-teal-deep, #0A3642)',   // Deep Obsidian Teal
];

function extractPoisFromTrip(t: Trip): number {
  const data = t.itinerary_data as {
    days?: Array<{
      itinerary?: {
        path?: unknown[];
      };
    }>;
    nodes?: unknown[];
  } | null | undefined;

  let count = 0;
  if (data?.days && Array.isArray(data.days)) {
    for (const d of data.days) {
      if (d.itinerary?.path && Array.isArray(d.itinerary.path)) {
        count += d.itinerary.path.length;
      }
    }
  }
  if (count === 0 && data?.nodes && Array.isArray(data.nodes)) {
    count = data.nodes.length;
  }
  return count;
}

function calculateTripDays(startStr: string, endStr: string): number {
  try {
    const s = new Date(startStr).getTime();
    const e = new Date(endStr).getTime();
    if (isNaN(s) || isNaN(e)) return 1;
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
  } catch {
    return 1;
  }
}

const EARTH_CIRCUMFERENCE_KM = 40075;

const KNOWN_COORDINATES: Record<string, [number, number]> = {
  tokyo: [35.6762, 139.6503],
  paris: [48.8566, 2.3522],
  london: [51.5074, -0.1278],
  "new york": [40.7128, -74.0060],
  rome: [41.9028, 12.4964],
  berlin: [52.5200, 13.4050],
  madrid: [40.4168, -3.7038],
  barcelona: [41.3879, 2.1699],
  porto: [41.1579, -8.6291],
  sevilla: [37.3891, -5.9845],
  seville: [37.3891, -5.9845],
  lisbon: [38.7223, -9.1393],
  alicante: [38.3452, -0.4810],
  valencia: [39.4699, -0.3763],
  malaga: [36.7213, -4.4214],
  amsterdam: [52.3676, 4.9041],
  vienna: [48.2082, 16.3738],
  zurich: [47.3769, 8.5417],
  kyoto: [35.0116, 135.7681],
  bangkok: [13.7563, 100.5018],
  singapore: [1.3521, 103.8198],
  sydney: [-33.8688, 151.2093],
  "san francisco": [37.7749, -122.4194],
  mad: [40.4839, -3.5680],
  opo: [41.2421, -8.6786],
  svq: [37.4180, -5.8931],
  alc: [38.2822, -0.5582],
  lis: [38.7742, -9.1342],
  bcn: [41.2974, 2.0833],
  hnd: [35.5494, 139.7798],
  nrt: [35.7720, 140.3929],
  cdg: [49.0097, 2.5479],
  lhr: [51.4700, -0.4543],
  jfk: [40.6413, -73.7781],
  fco: [41.8003, 12.2389],
};

function resolveLocationCoords(query?: string | null): [number, number] | null {
  if (!query) return null;
  const clean = query.trim().toLowerCase();
  if (KNOWN_COORDINATES[clean]) return KNOWN_COORDINATES[clean];
  for (const [key, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (clean.includes(key)) return coords;
  }
  return null;
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function VaultStatsTab({
  trips,
  completedTrips,
  onSelectDestination,
  getTripCoordinates,
}: VaultStatsTabProps) {
  const [isOpen, setIsOpen] = useState(true);

  const completedCount = completedTrips.length;

  const { totalDays, totalPois, engagements, monthlyStats, visitedCountriesCount, totalKmTraveled } = useMemo(() => {
    let daysAcc = 0;
    let poisAcc = 0;
    let kmAcc = 0;
    let prevDestCoords: { lat: number; lng: number } | null = null;
    const countryMap = new Map<string, DestinationEngagement>();
    const monthMap = new Map<string, MonthlyStat>();
    const uniqueCountries = new Set<string>();

    for (const trip of completedTrips) {
      const days = calculateTripDays(trip.start_date, trip.end_date);
      const pois = extractPoisFromTrip(trip);
      const coords = getTripCoordinates(trip);
      const countryName = getCountryForDestination(trip.destination, (trip as { country?: string }).country);

      daysAcc += days;
      poisAcc += pois;
      uniqueCountries.add(countryName.toLowerCase());

      // Calculate dynamic expedition distance (Intra-trip POI trail + origin-destination transit)
      const itin = trip.itinerary_data as {
        travel_constraints?: {
          origin_city?: string;
          origin_iata?: string;
          home_city?: string;
        };
        days?: Array<{
          itinerary?: {
            path?: Array<{
              poi?: {
                location?: { latitude?: number; longitude?: number };
                lat?: number;
                lng?: number;
              };
            }>;
          };
        }>;
      } | null | undefined;

      // 1. Intra-day POI traversal
      if (itin?.days && Array.isArray(itin.days)) {
        for (const day of itin.days) {
          if (day.itinerary?.path && Array.isArray(day.itinerary.path)) {
            const poiCoords: Array<{ lat: number; lng: number }> = [];
            for (const stop of day.itinerary.path) {
              const lat = stop.poi?.location?.latitude ?? stop.poi?.lat;
              const lng = stop.poi?.location?.longitude ?? stop.poi?.lng;
              if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                poiCoords.push({ lat, lng });
              }
            }
            for (let i = 0; i < poiCoords.length - 1; i++) {
              kmAcc += haversineDistanceKm(
                poiCoords[i].lat,
                poiCoords[i].lng,
                poiCoords[i + 1].lat,
                poiCoords[i + 1].lng
              );
            }
          }
        }
      }

      // 2. Journey transit (origin to destination round trip or inter-destination hop)
      const originQuery =
        trip.origin_iata ||
        itin?.travel_constraints?.origin_city ||
        itin?.travel_constraints?.origin_iata ||
        itin?.travel_constraints?.home_city;

      const originCoords = resolveLocationCoords(originQuery);
      if (originCoords && coords) {
        const oneWay = haversineDistanceKm(
          originCoords[0],
          originCoords[1],
          coords.lat,
          coords.lng
        );
        if (oneWay > 1) {
          kmAcc += oneWay * 2;
        }
      } else if (prevDestCoords && coords) {
        const hop = haversineDistanceKm(
          prevDestCoords.lat,
          prevDestCoords.lng,
          coords.lat,
          coords.lng
        );
        if (hop > 1) {
          kmAcc += hop;
        }
      }
      prevDestCoords = coords;

      // Group by country
      const key = countryName.toLowerCase();
      if (!countryMap.has(key)) {
        countryMap.set(key, {
          name: countryName,
          country: countryName,
          tripsCount: 0,
          totalDays: 0,
          poisCount: 0,
          coords: [coords.lat, coords.lng],
        });
      }
      const existing = countryMap.get(key)!;
      existing.tripsCount += 1;
      existing.totalDays += days;
      existing.poisCount += pois;

      // Group monthly
      if (trip.start_date) {
        const d = new Date(trip.start_date);
        if (!isNaN(d.getTime())) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const mLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          if (!monthMap.has(mKey)) {
            monthMap.set(mKey, {
              monthKey: mKey,
              monthLabel: mLabel,
              tripsCount: 0,
              daysCount: 0,
              poisCount: 0,
            });
          }
          const mStat = monthMap.get(mKey)!;
          mStat.tripsCount += 1;
          mStat.daysCount += days;
          mStat.poisCount += pois;
        }
      }
    }

    const sortedEngagements = Array.from(countryMap.values()).sort(
      (a, b) => b.tripsCount - a.tripsCount || b.totalDays - a.totalDays
    );

    const sortedMonths = Array.from(monthMap.values()).sort(
      (a, b) => b.monthKey.localeCompare(a.monthKey)
    );

    return {
      totalDays: daysAcc,
      totalPois: poisAcc,
      engagements: sortedEngagements,
      monthlyStats: sortedMonths,
      visitedCountriesCount: uniqueCountries.size,
      totalKmTraveled: Math.round(kmAcc),
    };
  }, [completedTrips, getTripCoordinates]);

  // Percentage of world countries (195 recognized sovereign countries)
  const countryVisitedRate = ((visitedCountriesCount / 195) * 100).toFixed(1);
  const countryPercentNumeric = Math.max(3, (visitedCountriesCount / 195) * 100);

  // Earth circumnavigated percentage (40,075 km equatorial circumference)
  const earthRateNumeric = (totalKmTraveled / EARTH_CIRCUMFERENCE_KM) * 100;
  const earthVisitedRate = earthRateNumeric >= 10
    ? Math.round(earthRateNumeric).toString()
    : earthRateNumeric.toFixed(1);
  const earthPercentNumeric = Math.max(earthRateNumeric > 0 ? 3 : 0, Math.min(100, earthRateNumeric));

  const formattedEarthTraversed = useMemo(() => {
    if (totalKmTraveled >= 1000) {
      return `${(totalKmTraveled / 1000).toFixed(1)}k km`;
    }
    return `${totalKmTraveled.toLocaleString()} km`;
  }, [totalKmTraveled]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        bottom: '1rem',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'stretch',
        pointerEvents: 'none',
      }}
    >
      {/* Floating Toggle Tab when collapsed on the right (matching Trip Details page) */}
      {!isOpen && (
        <button
          type="button"
          data-testid="stats-expand-btn"
          onClick={() => setIsOpen(true)}
          aria-label="Open travel statistics"
          title="Open travel statistics"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: '16px',
            right: 0,
            width: '26px',
            height: '42px',
            borderRadius: '10px 0 0 10px',
            background: 'var(--color-surface-card, #FFFFFF)',
            border: '1px solid var(--color-border)',
            borderRight: 'none',
            boxShadow: '-4px 4px 14px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-accent-primary)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 1060,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <ChevronLeftIcon size={16} />
        </button>
      )}

      {/* External Arrow button attached to left of the drawer to close it (matching Trip Details page) */}
      {isOpen && (
        <button
          type="button"
          data-testid="stats-collapse-btn"
          onClick={() => setIsOpen(false)}
          aria-label="Close travel statistics"
          title="Close travel statistics"
          style={{
            pointerEvents: 'auto',
            alignSelf: 'flex-start',
            marginTop: '16px',
            marginRight: '-1px',
            width: '26px',
            height: '42px',
            borderRadius: '10px 0 0 10px',
            background: 'var(--color-surface-card, #FFFFFF)',
            border: '1px solid var(--color-border)',
            borderRight: 'none',
            boxShadow: '-4px 4px 14px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 1060,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-accent-primary)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <ChevronRightIcon size={16} />
        </button>
      )}

      {/* Slide-out Panel on the Right */}
      <aside
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          width: isOpen ? 'clamp(320px, 26vw, 400px)' : '0px',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateX(0)' : 'translateX(30px)',
          transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, transform 0.28s ease',
          overflow: 'hidden',
          background: 'var(--color-surface-card)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: isOpen ? '1px solid var(--color-border-subtle)' : 'none',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
        aria-label="Travel statistics panel"
      >
        {/* Scrollable Content Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.75rem' }}>
            <h1
              className="font-display"
              style={{
                margin: 0,
                fontSize: '1.35rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              General statistics
            </h1>
          </div>

          {/* Primary Metric Section (Like Reference Photo) */}
          <div
            style={{
              background: 'var(--color-surface-page)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                className="font-sans"
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                }}
              >
                All missions
              </span>
            </div>

            <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span
                className="font-display"
                style={{
                  fontSize: '2.4rem',
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                }}
              >
                {totalDays > 0 ? totalDays.toLocaleString() : completedCount}
              </span>
              <span className="font-mono text-muted text-xs">
                {totalDays > 0 ? 'DAYS LOGGED' : 'TRIPS RECORDED'}
              </span>
            </div>

            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                display: 'flex',
                gap: '0.75rem',
              }}
            >
              <span><strong>{completedCount}</strong> completed</span>
              <span>•</span>
              <span><strong>{totalPois}</strong> sites visited</span>
              <span>•</span>
              <span><strong>{engagements.length}</strong> countries</span>
            </div>
          </div>

          {/* Circular Donut Gauges */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
            }}
          >
            {/* Gauge 1: Countries Visited Ratio */}
            <div
              style={{
                background: 'var(--color-surface-page)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '12px',
                padding: '0.85rem 0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="var(--color-border-subtle)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="var(--color-accent-teal-mid, #1B8FA6)"
                  strokeWidth="3.5"
                  strokeDasharray={`${(countryPercentNumeric * 106.8) / 100} 106.8`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                />
                <text
                  x="22"
                  y="26"
                  textAnchor="middle"
                  className="font-mono"
                  style={{
                    fontSize: countryVisitedRate.length > 3 ? '8.5px' : '10px',
                    fontWeight: 700,
                    fill: 'var(--color-text-primary)',
                  }}
                >
                  {countryVisitedRate}%
                </text>
              </svg>
              <div>
                <div
                  className="font-mono"
                  style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}
                >
                  {visitedCountriesCount}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                  Countries visited
                </div>
              </div>
            </div>

            {/* Gauge 2: Earth Circumnavigated (% of Equator) */}
            <div
              data-testid="stats-earth-gauge"
              title={`${Math.round(totalKmTraveled).toLocaleString()} km (${Math.round(totalKmTraveled * 0.621371).toLocaleString()} mi) traversed • ${earthVisitedRate}% of Earth's 40,075 km equator`}
              style={{
                background: 'var(--color-surface-page)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '12px',
                padding: '0.85rem 0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="var(--color-border-subtle)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="var(--color-success, #1F7A4D)"
                  strokeWidth="3.5"
                  strokeDasharray={`${(earthPercentNumeric * 106.8) / 100} 106.8`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                />
                <text
                  x="22"
                  y="26"
                  textAnchor="middle"
                  className="font-mono"
                  style={{
                    fontSize: earthVisitedRate.length > 3 ? '8.5px' : '10px',
                    fontWeight: 700,
                    fill: 'var(--color-text-primary)',
                  }}
                >
                  {earthVisitedRate}%
                </text>
              </svg>
              <div>
                <div
                  className="font-mono"
                  style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}
                >
                  {formattedEarthTraversed}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                  Earth traversed
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Breakdown Table (Matching Reference Photo) */}
          {monthlyStats.length > 0 && (
            <div style={{ fontSize: '11px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  paddingBottom: '0.35rem',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <span>Month</span>
                <span style={{ textAlign: 'right' }}>Missions</span>
                <span style={{ textAlign: 'right' }}>Days</span>
                <span style={{ textAlign: 'right' }}>Sites</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                {monthlyStats.slice(0, 3).map((m) => (
                  <div
                    key={m.monthKey}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      color: 'var(--color-text-primary)',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{m.monthLabel.split(' ')[0]}</span>
                    <span className="font-mono" style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                      {m.tripsCount}
                    </span>
                    <span className="font-mono" style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                      {m.daysCount}
                    </span>
                    <span className="font-mono" style={{ textAlign: 'right', color: 'var(--color-accent-teal)' }}>
                      {m.poisCount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* "Most engaged" Destinations Section (Colorful Pills Matching Photo) */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <h2
                className="font-display"
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                }}
              >
                Most engaged
              </h2>
              <span
                className="font-mono"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.05em',
                }}
              >
                SEE ALL ({engagements.length})
              </span>
            </div>

            {/* Pills Stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {engagements.length === 0 ? (
                <div
                  className="font-mono text-muted text-xs"
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    background: 'var(--color-surface-page)',
                    borderRadius: '8px',
                    border: '1px dashed var(--color-border-subtle)',
                  }}
                >
                  NO ENGAGED COUNTRIES RECORDED
                </div>
              ) : (
                engagements.map((item, idx) => {
                  const color = PILL_COLORS[idx % PILL_COLORS.length];
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => onSelectDestination && onSelectDestination(item.coords)}
                      title={`Focus map on ${item.name}`}
                      style={{
                        background: color,
                        border: 'none',
                        borderRadius: '9999px',
                        padding: '0.65rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#FFFFFF',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        transition: 'transform 0.15s ease, filter 0.15s ease',
                        width: '100%',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)';
                        e.currentTarget.style.filter = 'brightness(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.filter = 'none';
                      }}
                    >
                      {/* Left: Destination Icon & Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.22)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {/* Mini travel icon */}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        </div>
                        <span
                          className="font-display"
                          style={{
                            fontWeight: 600,
                            fontSize: '0.92rem',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {item.name}
                        </span>
                      </div>

                      {/* Right: Metrics */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              display: 'block',
                              lineHeight: 1,
                            }}
                          >
                            {item.totalDays}d
                          </span>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '9px',
                              opacity: 0.85,
                              display: 'block',
                              marginTop: '2px',
                            }}
                          >
                            +{item.tripsCount} trips
                          </span>
                        </div>
                        {/* Sub-badge icon */}
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9px',
                            fontWeight: 700,
                          }}
                        >
                          ↗
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
