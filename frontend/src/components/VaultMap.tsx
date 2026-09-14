"use client";
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useRouter } from 'next/navigation';
import type { GeoJsonObject, Feature } from 'geojson';

// Self-contained custom marker for Paladio (Navy Blue / Accent)
const accentIcon = typeof window !== 'undefined' ? L.divIcon({
  className: 'paladio-map-marker',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#2563EB;border:2px solid #FFF;box-shadow:0 0 8px rgba(37,99,235,0.6);display:flex;align-items:center;justify-content:center;">
    <div style="width:6px;height:6px;border-radius:50%;background:#FFF;"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
}) : ({} as L.DivIcon);

export interface VaultTrip {
  id?: string;
  destination: string;
  country?: string;
  lat: number;
  lng: number;
}

export interface VaultMapProps {
  trips: VaultTrip[];
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
  valencia: 'Spain',
  malaga: 'Spain',
  granada: 'Spain',
  bilbao: 'Spain',
  palma: 'Spain',
  rome: 'Italy',
  milan: 'Italy',
  venice: 'Italy',
  florence: 'Italy',
  naples: 'Italy',
  turin: 'Italy',
  bologna: 'Italy',
  palermo: 'Italy',
  lisbon: 'Portugal',
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

export default function VaultMap({ trips }: VaultMapProps) {
  const router = useRouter();
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
      fillColor: isVisited ? '#1E3A8A' : '#E2E8F0', // Accent blue or light gray
      weight: 1,
      opacity: 1,
      color: '#FFFFFF', // White borders between countries
      fillOpacity: isVisited ? 0.7 : 0.3
    };
  }, [visitedCountriesSet]);

  const validTrips = trips.filter(
    t => typeof t.lat === 'number' && !isNaN(t.lat) && typeof t.lng === 'number' && !isNaN(t.lng)
  );

  return (
    <MapContainer 
      center={[30, 0]} 
      zoom={2} 
      minZoom={2}
      style={{ height: '100%', width: '100%', borderRadius: '8px', background: '#F8FAFC' }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* Esri World Light Gray Base Map */}
      <TileLayer
        attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />

      {geoData && (
        <GeoJSON data={geoData} style={geoJsonStyle} />
      )}

      <MarkerClusterGroup>
        {validTrips.map((trip, idx) => (
          <Marker 
            key={trip.id || `${trip.lat}-${trip.lng}-${idx}`} 
            position={[trip.lat, trip.lng]} 
            icon={accentIcon}
            eventHandlers={{
              click: () => {
                if (trip.id) router.push(`/vault/${trip.id}`);
              },
            }}
          >
            <Popup className="premium-popup">
              <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => trip.id && router.push(`/vault/${trip.id}`)}>
                <strong className="font-display" style={{ display: 'block', fontSize: '1.1rem' }}>{trip.destination}</strong>
                <span className="font-mono text-muted text-xs mt-1">CLICK TO VIEW MISSION</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

