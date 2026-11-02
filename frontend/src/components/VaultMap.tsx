"use client";
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useRouter } from 'next/navigation';
import type { GeoJsonObject, Feature } from 'geojson';
import { useThemeStore } from '@/stores/themeStore';
import type { Trip } from '@/hooks/useTrips';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { resolveDestinationCurrency } from '@/utils/currencyResolver';

function HotelIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--color-accent-teal, #1B8FA6)' }}>
      <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z" />
    </svg>
  );
}

function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function WalletIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function StarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#E76F51" stroke="#E76F51" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// Self-contained custom tactical waypoint marker for Paladio
const waypointIcon = typeof window !== 'undefined' ? L.divIcon({
  className: 'paladio-map-waypoint paladio-map-marker',
  html: `
    <div style="position:relative;width:28px;height:38px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 6px rgba(15,76,92,0.45));cursor:pointer;transition:transform 0.15s ease;">
      <svg width="28" height="38" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:28px;height:38px;">
        <!-- Teardrop Pin Body -->
        <path d="M14 0C6.26801 0 0 6.26801 0 14C0 23.5 12.6 36.5 14 38C15.4 36.5 28 23.5 28 14C28 6.26801 21.732 0 14 0Z" fill="var(--color-accent-primary, #0F4C5C)"/>
        <!-- Crisp White Outer Contour -->
        <path d="M14 1C7.04062 1 1.4 6.64062 1.4 14C1.4 22.8 13.2 35.2 14 36.5C14.8 35.2 26.6 22.8 26.6 14C26.6 6.64062 20.9594 1 14 1Z" stroke="#FFFFFF" stroke-width="1.8"/>
        <!-- Concentric Waypoint Core -->
        <circle cx="14" cy="13.5" r="7" fill="#FFFFFF"/>
        <circle cx="14" cy="13.5" r="4.5" fill="var(--color-accent-primary, #0F4C5C)"/>
        <circle cx="14" cy="13.5" r="1.8" fill="var(--color-accent-teal-soft, #7CC4D1)"/>
      </svg>
    </div>
  `,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -36],
}) : ({} as L.DivIcon);

export interface VaultTrip {
  id?: string;
  destination: string;
  country?: string;
  date?: string;
  lat: number;
  lng: number;
  trip?: Trip;
}

export interface VaultMapProps {
  trips: VaultTrip[];
  focusCoords?: [number, number] | null;
}

/**
 * Mapping of major international travel destination cities to their canonical country
 * names as represented in world.geo.json.
 */
export const CITY_TO_COUNTRY: Record<string, string> = {
  // Western Europe
  paris: 'France',
  nice: 'France',
  lyon: 'France',
  marseille: 'France',
  bordeaux: 'France',
  strasbourg: 'France',
  toulouse: 'France',
  london: 'United Kingdom',
  edinburgh: 'United Kingdom',
  manchester: 'United Kingdom',
  birmingham: 'United Kingdom',
  glasgow: 'United Kingdom',
  liverpool: 'United Kingdom',
  oxford: 'United Kingdom',
  cambridge: 'United Kingdom',
  dublin: 'Ireland',
  galway: 'Ireland',
  cork: 'Ireland',
  amsterdam: 'Netherlands',
  rotterdam: 'Netherlands',
  'the hague': 'Netherlands',
  utrecht: 'Netherlands',
  brussels: 'Belgium',
  bruges: 'Belgium',
  antwerp: 'Belgium',
  gent: 'Belgium',
  berlin: 'Germany',
  munich: 'Germany',
  frankfurt: 'Germany',
  hamburg: 'Germany',
  cologne: 'Germany',
  stuttgart: 'Germany',
  dusseldorf: 'Germany',
  vienna: 'Austria',
  salzburg: 'Austria',
  innsbruck: 'Austria',
  zurich: 'Switzerland',
  geneva: 'Switzerland',
  bern: 'Switzerland',
  basel: 'Switzerland',
  lucerne: 'Switzerland',

  // Southern Europe
  madrid: 'Spain',
  barcelona: 'Spain',
  seville: 'Spain',
  sevilla: 'Spain',
  valencia: 'Spain',
  malaga: 'Spain',
  granada: 'Spain',
  bilbao: 'Spain',
  cordoba: 'Spain',
  zaragoza: 'Spain',
  palma: 'Spain',
  rome: 'Italy',
  roma: 'Italy',
  milan: 'Italy',
  milano: 'Italy',
  venice: 'Italy',
  venezia: 'Italy',
  florence: 'Italy',
  firenze: 'Italy',
  naples: 'Italy',
  napoli: 'Italy',
  turin: 'Italy',
  torino: 'Italy',
  bologna: 'Italy',
  palermo: 'Italy',
  lisbon: 'Portugal',
  lisboa: 'Portugal',
  porto: 'Portugal',
  faro: 'Portugal',
  athens: 'Greece',
  santorini: 'Greece',
  mykonos: 'Greece',
  thessaloniki: 'Greece',

  // Northern Europe
  copenhagen: 'Denmark',
  stockholm: 'Sweden',
  gothenburg: 'Sweden',
  oslo: 'Norway',
  bergen: 'Norway',
  helsinki: 'Finland',
  reykjavik: 'Iceland',

  // Eastern / Central Europe
  prague: 'Czech Republic',
  budapest: 'Hungary',
  warsaw: 'Poland',
  krakow: 'Poland',
  bucharest: 'Romania',
  sofia: 'Bulgaria',
  zagreb: 'Croatia',
  dubrovnik: 'Croatia',

  // North America
  'new york': 'United States of America',
  'new york city': 'United States of America',
  nyc: 'United States of America',
  'san francisco': 'United States of America',
  'los angeles': 'United States of America',
  chicago: 'United States of America',
  miami: 'United States of America',
  seattle: 'United States of America',
  boston: 'United States of America',
  'las vegas': 'United States of America',
  washington: 'United States of America',
  'washington dc': 'United States of America',
  austin: 'United States of America',
  honolulu: 'United States of America',
  orlando: 'United States of America',
  denver: 'United States of America',
  atlanta: 'United States of America',
  toronto: 'Canada',
  vancouver: 'Canada',
  montreal: 'Canada',
  ottawa: 'Canada',
  calgary: 'Canada',
  'mexico city': 'Mexico',
  cancun: 'Mexico',
  guadalajara: 'Mexico',

  // Asia & Pacific
  tokyo: 'Japan',
  kyoto: 'Japan',
  osaka: 'Japan',
  sapporo: 'Japan',
  fukuoka: 'Japan',
  nagoya: 'Japan',
  hiroshima: 'Japan',
  nara: 'Japan',
  seoul: 'South Korea',
  busan: 'South Korea',
  beijing: 'China',
  shanghai: 'China',
  shenzhen: 'China',
  guangzhou: 'China',
  'hong kong': 'China',
  taipei: 'Taiwan',
  bangkok: 'Thailand',
  phuket: 'Thailand',
  'chiang mai': 'Thailand',
  singapore: 'Singapore',
  'kuala lumpur': 'Malaysia',
  hanoi: 'Vietnam',
  'ho chi minh city': 'Vietnam',
  danang: 'Vietnam',
  jakarta: 'Indonesia',
  bali: 'Indonesia',
  manila: 'Philippines',
  'new delhi': 'India',
  delhi: 'India',
  mumbai: 'India',
  bengaluru: 'India',
  bangalore: 'India',
  sydney: 'Australia',
  melbourne: 'Australia',
  brisbane: 'Australia',
  perth: 'Australia',
  adelaide: 'Australia',
  auckland: 'New Zealand',
  wellington: 'New Zealand',
  christchurch: 'New Zealand',

  // Middle East & Africa
  dubai: 'United Arab Emirates',
  'abu dhabi': 'United Arab Emirates',
  doha: 'Qatar',
  riyadh: 'Saudi Arabia',
  istanbul: 'Turkey',
  ankara: 'Turkey',
  antalya: 'Turkey',
  cairo: 'Egypt',
  marrakech: 'Morocco',
  casablanca: 'Morocco',
  'cape town': 'South Africa',
  johannesburg: 'South Africa',
  nairobi: 'Kenya',

  // South America
  'buenos aires': 'Argentina',
  'rio de janeiro': 'Brazil',
  'sao paulo': 'Brazil',
  brasilia: 'Brazil',
  santiago: 'Chile',
  bogota: 'Colombia',
  lima: 'Peru',
};

const COUNTRY_TO_CODE: Record<string, string> = {
  spain: 'ES',
  portugal: 'PT',
  japan: 'JP',
  france: 'FR',
  germany: 'DE',
  italy: 'IT',
  'united kingdom': 'GB',
  'united states of america': 'US',
  'united states': 'US',
  usa: 'US',
  poland: 'PL',
  switzerland: 'CH',
  norway: 'NO',
  sweden: 'SE',
  denmark: 'DK',
  canada: 'CA',
  australia: 'AU',
  'new zealand': 'NZ',
  china: 'CN',
  india: 'IN',
  brazil: 'BR',
  mexico: 'MX',
  turkey: 'TR',
  thailand: 'TH',
  'czech republic': 'CZ',
  hungary: 'HU',
  singapore: 'SG',
  'south korea': 'KR',
  netherlands: 'NL',
  'united arab emirates': 'AE',
  greece: 'GR',
  austria: 'AT',
  belgium: 'BE',
  ireland: 'IE',
  croatia: 'HR',
};

/**
 * Common country abbreviations, aliases, and constituent territory names.
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States of America',
  'united states': 'United States of America',
  'united states of america': 'United States of America',
  us: 'United States of America',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  uae: 'United Arab Emirates',
  'united arab emirates': 'United Arab Emirates',
  emirates: 'United Arab Emirates',
  'south korea': 'South Korea',
  korea: 'South Korea',
  russia: 'Russia',
  czechia: 'Czech Republic',
  'czech republic': 'Czech Republic',
};

/**
 * Resolves a destination and optional country string into candidate country names.
 */
export function resolveCountryNames(destination?: string, country?: string): string[] {
  const matched = new Set<string>();

  const checkToken = (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return;

    // 1. Direct alias check
    if (COUNTRY_ALIASES[trimmed]) {
      matched.add(COUNTRY_ALIASES[trimmed].toLowerCase());
    }

    // 2. Exact city-to-country check
    if (CITY_TO_COUNTRY[trimmed]) {
      matched.add(CITY_TO_COUNTRY[trimmed].toLowerCase());
    }

    // 3. Substring / contained city match (e.g., "Trip to Paris")
    for (const [city, countryName] of Object.entries(CITY_TO_COUNTRY)) {
      if (trimmed === city || trimmed.includes(city)) {
        matched.add(countryName.toLowerCase());
      }
    }

    // 4. Substring / contained country alias match
    for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
      if (trimmed === alias || trimmed.includes(alias)) {
        matched.add(canonical.toLowerCase());
      }
    }

    // 5. Include raw token as candidate only if it's a meaningful name (at least 3 characters)
    if (trimmed.length >= 3) {
      matched.add(trimmed);
    }
  };

  if (country) {
    checkToken(country);
  }

  if (destination) {
    const parts = destination.split(/[,/\\()\-–—|]+/);
    for (const part of parts) {
      checkToken(part);
    }
    checkToken(destination);
  }

  return Array.from(matched);
}

/**
 * Canonical country name resolver for travel destinations.
 */
export function getCountryForDestination(destination?: string, country?: string): string {
  if (country && country.trim().length >= 3) {
    const raw = country.trim().toLowerCase();
    if (COUNTRY_ALIASES[raw]) return COUNTRY_ALIASES[raw];
    return country.trim();
  }
  const candidates = resolveCountryNames(destination, country);
  if (candidates.length > 0) {
    const raw = candidates[0].toLowerCase();
    for (const c of Object.values(CITY_TO_COUNTRY)) {
      if (c.toLowerCase() === raw) return c;
    }
    for (const c of Object.values(COUNTRY_ALIASES)) {
      if (c.toLowerCase() === raw) return c;
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return (destination || 'International').trim();
}

function MapController({ coords }: { coords?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.flyTo(coords, 6, { duration: 1.2 });
    }
  }, [coords, map]);
  return null;
}

export default function VaultMap({ trips, focusCoords }: VaultMapProps) {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    let isMounted = true;
    // Fetch world geojson from local static asset bundle with error handling / fallback
    fetch('/data/world.geo.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`GeoJSON fetch failed with status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (isMounted && data && (data.type === 'FeatureCollection' || Array.isArray(data.features))) {
          setGeoData(data);
        }
      })
      .catch(err => {
        console.warn('World GeoJSON borders unavailable, falling back to clean basemap:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visitedCountriesSet = useMemo(() => {
    const set = new Set<string>();
    for (const trip of trips) {
      const candidates = resolveCountryNames(trip.destination, trip.country);
      for (const c of candidates) {
        set.add(c.toLowerCase());
      }
    }
    return set;
  }, [trips]);

  const [deployedTrip, setDeployedTrip] = useState<VaultTrip | null>(null);

  const destinationWatch = useMemo(() => {
    if (!deployedTrip) return [];
    return [{ name: deployedTrip.destination, city: deployedTrip.destination }];
  }, [deployedTrip]);
  const { getPhoto } = usePoiPhotos(destinationWatch);

  const mapThemeStyles = useMemo(() => {
    switch (theme) {
      case 'dark':
        return {
          background: '#071820',
          visitedFill: '#14788D',
          visitedBorder: '#FFFFFF',
          unvisitedFill: '#0D2733',
          borderColor: 'rgba(255, 255, 255, 0.24)',
          cardBg: '#0D2733',
          cardText: '#F1F5F9',
          cardSubtext: '#94A3B8',
          cardBorder: '1px solid rgba(255, 255, 255, 0.12)',
          quoteBg: 'rgba(255, 255, 255, 0.05)',
          statPillBg: 'rgba(255, 255, 255, 0.08)',
        };
      case 'silent-waters':
        return {
          background: '#B4D6DC',
          visitedFill: '#3D5A64',
          visitedBorder: '#FFFFFF',
          unvisitedFill: '#EAF4F5',
          borderColor: 'rgba(61, 90, 100, 0.38)',
          cardBg: '#FFFFFF',
          cardText: '#1E293B',
          cardSubtext: '#64748B',
          cardBorder: '1px solid rgba(61, 90, 100, 0.18)',
          quoteBg: 'rgba(61, 90, 100, 0.06)',
          statPillBg: 'rgba(61, 90, 100, 0.08)',
        };
      case 'light':
      default:
        return {
          background: '#A4CCD8',
          visitedFill: '#0F4C5C',
          visitedBorder: '#FFFFFF',
          unvisitedFill: '#FAF6F0',
          borderColor: 'rgba(15, 76, 92, 0.28)',
          cardBg: '#FFFFFF',
          cardText: '#0F172A',
          cardSubtext: '#64748B',
          cardBorder: '1px solid rgba(15, 76, 92, 0.15)',
          quoteBg: 'rgba(15, 76, 92, 0.05)',
          statPillBg: 'rgba(15, 76, 92, 0.08)',
        };
    }
  }, [theme]);

  const geoJsonStyle = useCallback((feature?: Feature) => {
    const countryName = (feature?.properties as { name?: string } | null)?.name;
    const countryId = typeof feature?.id === 'string' ? feature.id.toLowerCase() : undefined;

    let isVisited = false;
    if (countryName) {
      const lower = countryName.toLowerCase();
      if (visitedCountriesSet.has(lower)) {
        isVisited = true;
      } else if (countryId && visitedCountriesSet.has(countryId)) {
        isVisited = true;
      } else {
        for (const visited of visitedCountriesSet) {
          if (visited.length >= 3 && (lower.includes(visited) || visited.includes(lower))) {
            isVisited = true;
            break;
          }
        }
      }
    }

    return {
      fillColor: isVisited ? mapThemeStyles.visitedFill : mapThemeStyles.unvisitedFill,
      weight: isVisited ? 1.5 : 1.1,
      opacity: 1,
      color: isVisited ? mapThemeStyles.visitedBorder : mapThemeStyles.borderColor,
      fillOpacity: 1.0
    };
  }, [visitedCountriesSet, mapThemeStyles]);

  const validTrips = trips.filter(
    t => typeof t.lat === 'number' && !isNaN(t.lat) && typeof t.lng === 'number' && !isNaN(t.lng)
  );

  const WORLD_BOUNDS: L.LatLngBoundsExpression = [
    [-85, -180],
    [85, 180]
  ];

  // Calculate dynamic initial center based on valid trips
  const initialCenter: [number, number] = useMemo(() => {
    if (validTrips.length > 0) {
      const avgLat = validTrips.reduce((sum, t) => sum + t.lat, 0) / validTrips.length;
      const avgLng = validTrips.reduce((sum, t) => sum + t.lng, 0) / validTrips.length;
      return [avgLat, avgLng];
    }
    return [38, 5];
  }, [validTrips]);

  // Micro-offset overlapping markers at identical coordinates so each pin is clickable
  const positionedTrips = useMemo(() => {
    const coordOccurrences = new Map<string, number>();
    return validTrips.map((trip) => {
      const key = `${trip.lat.toFixed(4)},${trip.lng.toFixed(4)}`;
      const count = coordOccurrences.get(key) || 0;
      coordOccurrences.set(key, count + 1);

      if (count === 0) {
        return { ...trip, renderLat: trip.lat, renderLng: trip.lng };
      }

      // Micro-jitter (~3km) so overlapping pins are visible side-by-side
      const angle = (count * 2 * Math.PI) / 4;
      const offset = 0.04;
      return {
        ...trip,
        renderLat: trip.lat + Math.sin(angle) * offset,
        renderLng: trip.lng + Math.cos(angle) * offset,
      };
    });
  }, [validTrips]);

  // If focusCoords changes from stats tab, automatically deploy that destination's card
  const [prevFocusCoords, setPrevFocusCoords] = useState<[number, number] | null>(null);
  const normalizedFocusCoords = focusCoords ?? null;
  if (normalizedFocusCoords !== prevFocusCoords) {
    setPrevFocusCoords(normalizedFocusCoords);
    if (normalizedFocusCoords) {
      const match = positionedTrips.find(
        (t) => Math.abs(t.lat - normalizedFocusCoords[0]) < 0.2 && Math.abs(t.lng - normalizedFocusCoords[1]) < 0.2
      );
      if (match) {
        setDeployedTrip(match);
      }
    }
  }

  // Compute 100% dynamic card details from trip and itinerary_data
  const deployedCardData = useMemo(() => {
    if (!deployedTrip) return null;
    const tripObj = deployedTrip.trip;
    const itin = tripObj?.itinerary_data as {
      photos?: string[];
      summary?: unknown;
      travel_constraints?: {
        prompt?: string;
        budget_usd?: number;
        origin_city?: string;
        travel_tastes?: string[];
        booking_anchors?: {
          hotel?: {
            name?: string;
          };
        };
        accommodation?: string;
        pace?: string;
      };
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
              cost_eur?: number;
            };
          }>;
        };
      }>;
      total_trip_cost?: number;
    } | null | undefined;

    // 1. Days Count
    let daysCount = 1;
    if (tripObj?.start_date && tripObj?.end_date) {
      const s = new Date(tripObj.start_date).getTime();
      const e = new Date(tripObj.end_date).getTime();
      const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) daysCount = diff;
    } else if (itin?.days?.length) {
      daysCount = itin.days.length;
    }

    // 2. Budget text
    const constraints = itin?.travel_constraints;
    let budgetText: string | null = null;
    if (typeof constraints?.budget_usd === 'number' && constraints.budget_usd > 0) {
      budgetText = `$${Math.round(constraints.budget_usd).toLocaleString()} Budget`;
    } else if (typeof itin?.total_trip_cost === 'number' && itin.total_trip_cost > 0) {
      budgetText = `€${Math.round(itin.total_trip_cost).toLocaleString()} Budget`;
    }

    // 3. Prompt Narrative Brief (strictly dynamic from user input upon creation, null if absent)
    const promptText =
      (typeof constraints?.prompt === 'string' && constraints.prompt.trim().length > 0
        ? constraints.prompt.trim()
        : null) ||
      (typeof itin?.summary === 'string' && itin.summary.trim().length > 0
        ? itin.summary.trim()
        : null) ||
      null;

    // 4. Primary Highlight Landmark & POI count
    let totalPois = 0;
    let highlightPoi: {
      name: string;
      category?: string;
      description?: string;
      photo_url?: string;
    } | null = null;

    if (itin?.days && Array.isArray(itin.days)) {
      for (const day of itin.days) {
        if (day.itinerary?.path && Array.isArray(day.itinerary.path)) {
          totalPois += day.itinerary.path.length;
          if (!highlightPoi) {
            for (const stop of day.itinerary.path) {
              const p = stop.poi;
              if (!p || !p.name) continue;
              const cat = (p.category || '').toUpperCase();
              if (
                cat.includes('AIRPORT') ||
                cat.includes('TRANSIT') ||
                cat.includes('HOTEL') ||
                cat.includes('STATION')
              ) {
                continue;
              }
              highlightPoi = {
                name: p.name,
                category: p.category || 'Cultural Highlight',
                description: p.description || `Historic landmark in ${deployedTrip.destination}`,
                photo_url: p.photo_url,
              };
              break;
            }
          }
        }
      }
    }

    // Fallback highlight name if none found in days
    if (!highlightPoi) {
      highlightPoi = {
        name: `${deployedTrip.destination} City Core`,
        category: 'Urban Exploration',
        description: `Premier destinations and historic points of interest in ${deployedTrip.destination}.`,
      };
    }

    // 5. Traveler / Organizer name
    const primaryParticipant = tripObj?.participants?.[0];
    const travelerName = primaryParticipant?.name || 'Tactical Voyager';
    const travelerRole = primaryParticipant?.role ? primaryParticipant.role.toUpperCase() : 'MISSION ARCHIVE';

    // 6. Dates range string
    let dateRangeStr = '';
    if (tripObj?.start_date) {
      const s = new Date(tripObj.start_date);
      dateRangeStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (tripObj?.end_date) {
        const e = new Date(tripObj.end_date);
        dateRangeStr += ` - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
    }

    // 7. Country flag resolution (exact matching country code for FlagIcon)
    const countryName = getCountryForDestination(deployedTrip.destination, deployedTrip.country);
    const currencyInfo = resolveDestinationCurrency(deployedTrip.destination);
    const countryCode =
      COUNTRY_TO_CODE[countryName.toLowerCase()] ||
      COUNTRY_TO_CODE[(deployedTrip.destination || '').toLowerCase()] ||
      currencyInfo.countryCode ||
      'EU';

    // 8. Cover Photo resolution (prioritizing photo entered on trip creation)
    const coverPhoto =
      (Array.isArray(itin?.photos) && itin.photos.length > 0 ? itin.photos[0] : undefined) ||
      (itin as { photo_url?: string })?.photo_url ||
      (tripObj as { photo_url?: string })?.photo_url ||
      (constraints as { photo_url?: string })?.photo_url ||
      highlightPoi?.photo_url ||
      getPhoto(deployedTrip.destination);

    // 9. Mission Profile & Expedition Attributes (replaces static single POI)
    const baseCamp =
      constraints?.booking_anchors?.hotel?.name ||
      constraints?.accommodation ||
      null;
    const originCity = constraints?.origin_city || null;
    const pace = constraints?.pace || null;
    const travelTastes = Array.isArray(constraints?.travel_tastes) ? constraints.travel_tastes : [];

    return {
      daysCount,
      budgetText,
      promptText,
      totalPois: totalPois > 0 ? totalPois : 5,
      highlightPoi,
      travelerName,
      travelerRole,
      dateRangeStr,
      countryCode,
      countryName,
      coverPhoto,
      baseCamp,
      originCity,
      pace,
      travelTastes,
      tripId: tripObj?.id || deployedTrip.id,
    };
  }, [deployedTrip, getPhoto]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <MapContainer 
        center={initialCenter} 
        zoom={3.5} 
        minZoom={2}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        style={{
          height: '100%',
          width: '100%',
          borderRadius: 'var(--border-radius-md, 8px)',
          background: mapThemeStyles.background,
        }}
        zoomControl={false}
        attributionControl={false}
      >
        <MapController coords={focusCoords} />

        {geoData && (
          <GeoJSON data={geoData} style={geoJsonStyle} />
        )}

        {positionedTrips.map((trip, idx) => (
          <Marker 
            key={trip.id || `${trip.renderLat}-${trip.renderLng}-${idx}`} 
            position={[trip.renderLat, trip.renderLng]} 
            icon={waypointIcon}
            eventHandlers={{
              click: () => {
                setDeployedTrip(trip);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -36]} opacity={0.95}>
              <span style={{ fontWeight: 600 }}>{trip.destination}</span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* Deployed Trip Card (matching reference design) */}
      {deployedTrip && deployedCardData && (
        <div
          data-testid="deployed-trip-card"
          style={{
            position: 'absolute',
            bottom: '1.25rem',
            left: '1.25rem',
            width: '360px',
            maxWidth: 'calc(100vw - 2.5rem)',
            maxHeight: 'calc(100% - 2.5rem)',
            background: mapThemeStyles.cardBg,
            color: mapThemeStyles.cardText,
            borderRadius: '24px',
            boxShadow: '0 24px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(15, 76, 92, 0.15)',
            zIndex: 1040,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Media */}
          <div style={{ position: 'relative', width: '100%', height: '175px', flexShrink: 0, overflow: 'hidden', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
            {deployedCardData.coverPhoto ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={deployedCardData.coverPhoto}
                alt={deployedTrip.destination}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(135deg, #0F4C5C 0%, #1A3A4B 60%, #2A9D8F 100%)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="100%" height="100%" viewBox="0 0 360 175" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, opacity: 0.22 }}>
                  <polygon points="0,175 110,75 160,120 260,50 330,130 360,95 360,175" fill="#FFFFFF"/>
                  <circle cx="260" cy="50" r="22" fill="#FFFFFF" opacity="0.35"/>
                </svg>
                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', color: '#FFFFFF' }}>
                  <div className="font-display" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.04em' }}>{deployedTrip.destination.toUpperCase()}</div>
                  <div className="font-mono text-xs" style={{ opacity: 0.85, letterSpacing: '0.12em', marginTop: '2px' }}>MISSION ARCHIVE</div>
                </div>
              </div>
            )}

            {/* Close / Back Circle Button */}
            <button
              type="button"
              data-testid="deployed-trip-close-btn"
              onClick={() => setDeployedTrip(null)}
              aria-label="Close trip preview"
              title="Close trip preview"
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }}
            >
              <ChevronLeftIcon size={18} />
            </button>

            {/* Top Right Date / Vault Pill */}
            {deployedCardData.dateRangeStr && (
              <div
                className="font-mono"
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  background: 'rgba(0, 0, 0, 0.45)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 600,
                  zIndex: 10,
                }}
              >
                {deployedCardData.dateRangeStr.split('-')[0].trim()}
              </div>
            )}
          </div>

          {/* Card Content Area */}
          <div style={{ padding: '14px 18px 16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Profile & Status Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0F4C5C 0%, #2A9D8F 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '14px',
                    boxShadow: '0 2px 6px rgba(15, 76, 92, 0.3)',
                  }}
                >
                  {deployedCardData.travelerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: mapThemeStyles.cardText }}>
                    {deployedCardData.travelerName}
                  </div>
                  <div className="font-mono text-xs" style={{ color: mapThemeStyles.cardSubtext, fontSize: '0.7rem' }}>
                    {deployedCardData.travelerRole}
                  </div>
                </div>
              </div>
            </div>

            {/* Title & Country Flag */}
            <div>
              <h3
                className="font-display"
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  color: mapThemeStyles.cardText,
                  margin: 0,
                  lineHeight: '1.25',
                }}
              >
                {deployedTrip.destination} Travel Guide
              </h3>
              <div
                data-testid="deployed-trip-flag-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  marginTop: '6px',
                }}
              >
                <FlagIcon countryCode={deployedCardData.countryCode} width={22} height={15} />
                <span
                  className="font-mono text-xs"
                  style={{
                    color: mapThemeStyles.cardSubtext,
                    fontWeight: 600,
                    fontSize: '0.74rem',
                    letterSpacing: '0.04em',
                  }}
                >
                  {deployedCardData.countryName}
                </span>
              </div>
            </div>

            {/* Prompt Narrative Quote (strictly dynamic from trip creation) */}
            {deployedCardData.promptText && (
              <div
                data-testid="deployed-trip-prompt"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: mapThemeStyles.quoteBg,
                  borderLeft: '3px solid var(--color-accent-primary, #0F4C5C)',
                  fontSize: '0.78rem',
                  lineHeight: '1.45',
                  color: mapThemeStyles.cardText,
                  maxHeight: '75px',
                  overflowY: 'auto',
                }}
              >
                &ldquo;{deployedCardData.promptText}&rdquo;
              </div>
            )}

            {/* Metrics Row: Days + Budget */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.78rem', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: mapThemeStyles.cardText }}>
                <CalendarIcon size={14} />
                <span>{deployedCardData.daysCount} Days</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: mapThemeStyles.cardText }}>
                <WalletIcon size={14} />
                <span>{deployedCardData.budgetText || `${deployedCardData.totalPois} Stops`}</span>
              </div>
            </div>

            {/* Mission Profile & Lodging Telemetry (replaces old single POI box) */}
            {(deployedCardData.baseCamp || deployedCardData.originCity || deployedCardData.travelTastes.length > 0) && (
              <div
                data-testid="deployed-trip-telemetry"
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: mapThemeStyles.quoteBg,
                  border: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                {deployedCardData.baseCamp && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <HotelIcon size={13} />
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: mapThemeStyles.cardText }}>
                      Base Camp: {deployedCardData.baseCamp}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px', fontSize: '0.7rem' }}>
                  {deployedCardData.originCity && (
                    <span
                      className="font-mono"
                      style={{
                        color: mapThemeStyles.cardSubtext,
                        background: mapThemeStyles.statPillBg,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      Dep: {deployedCardData.originCity}
                    </span>
                  )}
                  {deployedCardData.pace && (
                    <span
                      className="font-mono"
                      style={{
                        color: mapThemeStyles.cardSubtext,
                        background: mapThemeStyles.statPillBg,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {deployedCardData.pace} pace
                    </span>
                  )}
                  {deployedCardData.travelTastes.map((taste, idx) => (
                    <span
                      key={idx}
                      className="font-mono"
                      style={{
                        color: 'var(--color-accent-primary, #0F4C5C)',
                        background: 'rgba(15, 76, 92, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {taste}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Action Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: mapThemeStyles.statPillBg,
                  padding: '5px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: mapThemeStyles.cardText,
                }}
              >
                <StarIcon size={13} />
                <span>4.9</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <PinIcon size={12} />
                <span>{deployedCardData.totalPois}</span>
              </div>

              <button
                type="button"
                data-testid="deployed-trip-see-btn"
                onClick={() => {
                  if (deployedCardData.tripId) {
                    router.push(`/trips/${deployedCardData.tripId}`);
                  }
                }}
                className="font-mono"
                style={{
                  background: 'var(--color-accent-primary, #0F4C5C)',
                  color: '#FFFFFF',
                  padding: '0.55rem 1.15rem',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 4px 12px rgba(15, 76, 92, 0.35)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
                  e.currentTarget.style.background = 'var(--color-accent-teal, #2A9D8F)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.background = 'var(--color-accent-primary, #0F4C5C)';
                }}
              >
                <span>SEE TRIP</span>
                <span style={{ fontSize: '0.85rem' }}>↗</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

