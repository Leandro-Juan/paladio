"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, ZoomControl, useMap, Tooltip, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { computeClusterPolygon, computeCentroid, LatLngPoint } from '@/utils/clusterHull';
import { TransitLeg, TransitStep } from '@/types/domain';
import { formatPoiTime } from '@/utils/date';
import { MAP_TILE_CONFIG } from '@/utils/mapTiles';
import { VectorBasemap } from '@/components/VectorBasemap';

export interface MapPoi {
  name: string;
  lat: number;
  lng: number;
  category?: string;
  arrivalTime?: string;
  departureTime?: string;
  durationMins?: number;
  costEur?: number;
  transitFromPrevious?: TransitLeg | null;
}

export interface MapDayGroup {
  dayNumber: number;
  label?: string;
  pois: MapPoi[];
}

export interface DetailedTransitSegment {
  key: string;
  positions: [number, number][];
  color: string;
  isDashed: boolean;
  weight: number;
  instruction: string;
  type: string;
  transitLine?: string | null;
  durationMins?: number;
  distanceKm?: number;
  stationName?: string | null;
}

export interface TransitStationNode {
  key: string;
  position: [number, number];
  stationName: string;
  line?: string | null;
  instruction: string;
}

interface TripMapViewProps {
  days: MapDayGroup[];
  hotel?: { name: string; lat: number; lng: number };
  airport?: { name: string; lat: number; lng: number };
  activeDay: number | 'all';
  onDayChange: (day: number | 'all') => void;
  focusedPlace?: { lat: number; lng: number } | null;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
  transitMode?: 'simple' | 'detailed';
}

function getTransitStepStyle(step: TransitStep): { color: string; isDashed: boolean; weight: number } {
  const type = (step.type || '').toLowerCase();
  if (type === 'walk' || type === 'pedestrian') {
    return { color: '#10B981', isDashed: true, weight: 4 };
  }
  if (type === 'transfer') {
    return { color: '#F59E0B', isDashed: true, weight: 4 };
  }
  if (type === 'transit_alight') {
    return { color: '#059669', isDashed: false, weight: 4.5 };
  }

  const line = (step.transit_line || '').toUpperCase().trim();
  const lineColors: Record<string, string> = {
    '1': '#EF4444',
    '2': '#3B82F6',
    '3': '#10B981',
    '4': '#8B5CF6',
    '5': '#EC4899',
    '6': '#7C2D12',
    '7': '#F97316',
    '8': '#E11D48',
    '9': '#84CC16',
    '10': '#0284C7',
    '11': '#14B8A6',
    '12': '#6366F1',
    'A': '#EF4444',
    'B': '#3B82F6',
    'C': '#EAB308',
    'D': '#10B981',
    'E': '#8B5CF6',
  };

  if (line && lineColors[line]) {
    return { color: lineColors[line], isDashed: false, weight: 5 };
  }

  if (line) {
    const palette = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
    let hash = 0;
    for (let i = 0; i < line.length; i++) {
      hash = (hash << 5) - hash + line.charCodeAt(i);
    }
    const color = palette[Math.abs(hash) % palette.length];
    return { color, isDashed: false, weight: 5 };
  }

  return { color: '#1E3A8A', isDashed: false, weight: 5 };
}

// Pure SVG vector icons matching Paladio design standards (NO EMOJIS)
function getCategorySvg(type: PoiCategoryType): string {
  switch (type) {
    case 'museum':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2L2 7h20L12 2z"/></svg>`;
    case 'restaurant':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20M21 15V2a5 5 0 0 0-5 5v8h5zM3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M6 11v11"/></svg>`;
    case 'cafe':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`;
    case 'hotel':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/></svg>`;
    case 'airport':
    case 'flight':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`;
    case 'landmark':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9 22h6L12 2zM12 2v20M8 12h8"/></svg>`;
    case 'park':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7M7 17l5-5 5 5"/></svg>`;
    case 'bar':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8M12 11v11M19 3l-7 8-7-8h14z"/></svg>`;
    case 'shopping':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/></svg>`;
    case 'transit':
    case 'bus_stop':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8M8 19l-3 3M16 19l3 3M8 15h.01M16 15h.01"/></svg>`;
    case 'attraction':
    default:
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }
}

function createWaypointIcon(categoryType: PoiCategoryType, stopNumber: number): L.DivIcon {
  const svg = getCategorySvg(categoryType);
  const formattedNum = String(stopNumber).padStart(2, '0');
  return L.divIcon({
    className: 'paladio-waypoint-icon',
    html: `
      <div style="display:inline-flex;align-items:center;background:var(--color-surface-card, #081C24);border:1.5px solid var(--color-accent-teal-mid, #14788D);border-radius:14px;box-shadow:var(--shadow-sm);padding:2px 6px 2px 3px;gap:4px;cursor:pointer;transform:translate(-50%, -50%);user-select:none;">
        <div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-accent-primary, #0F4C5C);color:#FFFFFF;">
          ${svg}
        </div>
        <span style="font-family:var(--font-mono, monospace);font-size:10px;font-weight:700;color:var(--color-text-primary, #FFFFFF);line-height:1;letter-spacing:0.5px;">${formattedNum}</span>
      </div>
    `,
    iconSize: [46, 24],
    iconAnchor: [23, 12],
    popupAnchor: [0, -14],
  });
}

function createHotelIcon(): L.DivIcon {
  const svg = getCategorySvg('hotel');
  return L.divIcon({
    className: 'paladio-hotel-icon',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translate(-50%, -50%);user-select:none;">
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--color-accent-primary, #0F4C5C);border:2px solid var(--color-surface-card, #FFFFFF);border-radius:8px;box-shadow:0 0 12px rgba(15,76,92,0.6);color:#FFF;">
          ${svg}
        </div>
        <span style="margin-top:2px;background:var(--color-surface-card, #081C24);color:var(--color-accent-teal-soft, #7CC4D1);border:1px solid var(--color-border-subtle);font-size:9px;font-family:var(--font-mono, monospace);font-weight:700;padding:0 4px;border-radius:3px;letter-spacing:0.5px;box-shadow:var(--shadow-xs);">HOTEL</span>
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 24],
    popupAnchor: [0, -26],
  });
}

function createAirportIcon(): L.DivIcon {
  const svg = getCategorySvg('airport');
  return L.divIcon({
    className: 'paladio-airport-icon',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translate(-50%, -50%);user-select:none;">
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--color-accent-teal-mid, #14788D);border:2px solid var(--color-surface-card, #FFFFFF);border-radius:8px;box-shadow:0 0 12px rgba(20,120,141,0.6);color:#FFF;">
          ${svg}
        </div>
        <span style="margin-top:2px;background:var(--color-surface-card, #081C24);color:var(--color-accent-teal-soft, #7CC4D1);border:1px solid var(--color-border-subtle);font-size:9px;font-family:var(--font-mono, monospace);font-weight:700;padding:0 4px;border-radius:3px;letter-spacing:0.5px;box-shadow:var(--shadow-xs);">AIRPORT</span>
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 24],
    popupAnchor: [0, -26],
  });
}

function createClusterLabelIcon(dayNumber: number): L.DivIcon {
  return L.divIcon({
    className: 'paladio-cluster-badge',
    html: `
      <div style="display:flex;align-items:center;justify-content:center;background:var(--color-accent-primary, #0F4C5C);color:#FFFFFF;border:2px solid var(--color-accent-teal-mid, #14788D);border-radius:999px;padding:3px 10px;font-family:var(--font-mono, monospace);font-size:11px;font-weight:700;box-shadow:var(--shadow-md);letter-spacing:0.5px;cursor:pointer;transform:translate(-50%, -50%);white-space:nowrap;user-select:none;">
        DAY ${dayNumber}
      </div>
    `,
    iconSize: [60, 24],
    iconAnchor: [30, 12],
    popupAnchor: [0, -14],
  });
}

// Controller for bounds fitting and pan-to-focus
function MapViewportController({
  activePoints,
  focusedPlace,
}: {
  activePoints: LatLngPoint[];
  focusedPlace?: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (focusedPlace && typeof focusedPlace.lat === 'number') {
      map.flyTo([focusedPlace.lat, focusedPlace.lng], 15, { animate: true, duration: 1.2 });
      return;
    }
    if (activePoints.length > 0) {
      const bounds = L.latLngBounds(activePoints.map((p) => [p.lat, p.lng]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true });
      }
    }
  }, [map, activePoints, focusedPlace]);

  useEffect(() => {
    if (!map) return;
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 150);
    const t3 = setTimeout(() => map.invalidateSize(), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

export default function TripMapView({
  days = [],
  hotel,
  airport,
  activeDay,
  onDayChange,
  focusedPlace,
  categoryFilter,
  onCategoryFilterChange,
  transitMode = 'simple',
}: TripMapViewProps) {
  const { url: tileUrl, subdomains: tileSubdomains, attribution: tileAttribution, maxZoom: tileMaxZoom } = MAP_TILE_CONFIG;

  const [internalCatFilter, setInternalCatFilter] = useState<PoiCategoryType | null>(null);
  const activeCategory = categoryFilter !== undefined ? categoryFilter : internalCatFilter;

  const handleCategoryToggle = (cat: PoiCategoryType) => {
    const next = activeCategory === cat ? null : cat;
    if (onCategoryFilterChange) onCategoryFilterChange(next);
    else setInternalCatFilter(next);
  };

  // Current active day data
  const activeDayData = useMemo(() => {
    if (activeDay === 'all') return null;
    return days.find((d) => d.dayNumber === activeDay) || null;
  }, [days, activeDay]);

  // Detailed transit segments computation
  const { detailedSegments, stationNodes } = useMemo(() => {
    if (transitMode !== 'detailed') {
      return { detailedSegments: [], stationNodes: [] };
    }

    const segments: DetailedTransitSegment[] = [];
    const nodes: TransitStationNode[] = [];

    const daysToProcess = activeDay === 'all'
      ? days
      : (activeDayData ? [activeDayData] : []);

    daysToProcess.forEach((dayGroup) => {
      const pois = dayGroup.pois;
      if (!pois || pois.length < 2) return;

      for (let k = 1; k < pois.length; k++) {
        const fromPoi = pois[k - 1];
        const toPoi = pois[k];
        const startCoord: [number, number] = [fromPoi.lat, fromPoi.lng];
        const endCoord: [number, number] = [toPoi.lat, toPoi.lng];
        const leg = toPoi.transitFromPrevious;

        if (leg && Array.isArray(leg.steps) && leg.steps.length > 0) {
          const hasDist = leg.steps.some((s) => typeof s.distance_km === 'number' && s.distance_km > 0);
          const weights = leg.steps.map((s) => {
            if (hasDist && typeof s.distance_km === 'number' && s.distance_km > 0) return s.distance_km;
            if (typeof s.duration_mins === 'number' && s.duration_mins > 0) return s.duration_mins;
            return 1;
          });
          const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

          let currFrac = 0;
          for (let sIdx = 0; sIdx < leg.steps.length; sIdx++) {
            const step = leg.steps[sIdx];
            const stepFrac = weights[sIdx] / totalWeight;
            const nextFrac = Math.min(1, currFrac + stepFrac);

            const sLat = startCoord[0] + currFrac * (endCoord[0] - startCoord[0]);
            const sLng = startCoord[1] + currFrac * (endCoord[1] - startCoord[1]);
            const eLat = startCoord[0] + nextFrac * (endCoord[0] - startCoord[0]);
            const eLng = startCoord[1] + nextFrac * (endCoord[1] - startCoord[1]);

            const style = getTransitStepStyle(step);

            segments.push({
              key: `d${dayGroup.dayNumber}-leg${k}-step${sIdx}`,
              positions: [[sLat, sLng], [eLat, eLng]],
              color: style.color,
              isDashed: style.isDashed,
              weight: style.weight,
              instruction: step.instruction || 'Transit maneuver',
              type: step.type || 'transit',
              transitLine: step.transit_line,
              durationMins: step.duration_mins,
              distanceKm: step.distance_km,
              stationName: step.station_name,
            });

            if (step.station_name) {
              nodes.push({
                key: `d${dayGroup.dayNumber}-leg${k}-st${sIdx}`,
                position: [sLat, sLng],
                stationName: step.station_name,
                line: step.transit_line,
                instruction: step.instruction || 'Station stop',
              });
            }

            currFrac = nextFrac;
          }
        } else if (leg) {
          const isWalk = leg.mode === 'pedestrian' || leg.mode === 'walk';
          const style = isWalk
            ? { color: '#10B981', isDashed: true, weight: 4 }
            : { color: '#2563EB', isDashed: false, weight: 5 };

          segments.push({
            key: `d${dayGroup.dayNumber}-leg${k}-single`,
            positions: [startCoord, endCoord],
            color: style.color,
            isDashed: style.isDashed,
            weight: style.weight,
            instruction: isWalk ? `Walk (~${leg.duration_mins || 0}m)` : `Transit (~${leg.duration_mins || 0}m)`,
            type: leg.mode || 'transit',
            durationMins: leg.duration_mins,
            distanceKm: 0,
          });
        } else {
          segments.push({
            key: `d${dayGroup.dayNumber}-leg${k}-direct`,
            positions: [startCoord, endCoord],
            color: '#2563EB',
            isDashed: false,
            weight: 3.5,
            instruction: `${fromPoi.name} → ${toPoi.name}`,
            type: 'direct',
          });
        }
      }
    });

    return { detailedSegments: segments, stationNodes: nodes };
  }, [transitMode, activeDay, days, activeDayData]);

  // Compute cluster polygons for each day (excluding transit hubs and accommodation depots so territory is not warped)
  const dayClusters = useMemo(() => {
    return days.map((d) => {
      const cityPoints = d.pois.filter((p) => {
        const cat = (p.category || '').toLowerCase();
        const normName = (p.name || '').toLowerCase();
        const catType = classifyPoiCategory(p.category, p.name).type;
        return (
          cat !== 'airport' &&
          cat !== 'flight' &&
          cat !== 'hotel' &&
          cat !== 'lodging' &&
          catType !== 'hotel' &&
          catType !== 'airport' &&
          catType !== 'flight' &&
          !normName.includes('(start)') &&
          !normName.includes('(end)')
        );
      });
      const polygon = computeClusterPolygon(cityPoints);
      const centroid = computeCentroid(cityPoints);
      return {
        dayNumber: d.dayNumber,
        polygon,
        centroid,
        pois: d.pois,
      };
    });
  }, [days]);

  // Active bounds points
  const activeBoundsPoints: LatLngPoint[] = useMemo(() => {
    let points: LatLngPoint[] = [];
    if (activeDay === 'all') {
      days.forEach((d) => points.push(...d.pois));
      if (hotel) points.push(hotel);
      if (airport) points.push(airport);
    } else if (activeDayData) {
      points = [...activeDayData.pois];
    }

    if (activeCategory) {
      const filtered = points.filter((p) => {
        const poiItem = p as Partial<MapPoi>;
        const catType = classifyPoiCategory(poiItem.category, poiItem.name).type;
        return isCategoryMatch(activeCategory, catType);
      });
      if (filtered.length > 0) return filtered;
    }

    return points;
  }, [activeDay, days, activeDayData, hotel, airport, activeCategory]);

  // Centroid fallback
  const centerPosition: [number, number] = useMemo(() => {
    if (activeBoundsPoints.length > 0) {
      const c = computeCentroid(activeBoundsPoints);
      return [c.lat, c.lng];
    }
    if (hotel) return [hotel.lat, hotel.lng];
    return [41.1579, -8.6291]; // Default fallback
  }, [activeBoundsPoints, hotel]);

  // Active day route polyline
  const activePolyline: [number, number][] = activeDayData
    ? activeDayData.pois.map((p) => [p.lat, p.lng])
    : [];

  const categoryPills: Array<{ type: PoiCategoryType; label: string }> = [
    { type: 'restaurant', label: 'Dining' },
    { type: 'cafe', label: 'Cafe' },
    { type: 'bar', label: 'Bar' },
    { type: 'hotel', label: 'Lodging' },
    { type: 'landmark', label: 'Landmark' },
    { type: 'museum', label: 'Museum' },
    { type: 'park', label: 'Park' },
    { type: 'shopping', label: 'Shopping' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Floating Top Center Quick Filter Pill Bar (TREK Style) */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 900,
          background: 'var(--color-surface-card)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '999px',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12))',
        }}
      >
        {categoryPills.map((pill) => {
          const isSelected = activeCategory === pill.type;
          return (
            <button
              key={pill.type}
              type="button"
              onClick={() => handleCategoryToggle(pill.type)}
              title={pill.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 9px',
                borderRadius: '999px',
                border: 'none',
                background: isSelected ? 'var(--color-accent-primary)' : 'transparent',
                color: isSelected ? 'var(--color-text-on-accent)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
            >
              <span
                dangerouslySetInnerHTML={{ __html: getCategorySvg(pill.type) }}
                style={{ display: 'flex', alignItems: 'center' }}
              />
              <span className="hidden sm:inline">{pill.label}</span>
            </button>
          );
        })}
      </div>

      {/* Map Canvas */}
      <MapContainer
        center={centerPosition}
        zoom={13}
        minZoom={2}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <ZoomControl position="bottomright" />
        <MapViewportController activePoints={activeBoundsPoints} focusedPlace={focusedPlace} />

        {/* Sovereign Keyless OpenStreetMap Vector Basemap (Zero POI/amenity icon clutter) */}
        <VectorBasemap styleUrl="https://tiles.openfreemap.org/styles/liberty" />

        {/* 1. Cluster Region Polygons (Colored convex hulls) */}
        {dayClusters.map((cluster) => {
          if (cluster.polygon.length < 3) return null;
          const isActive = activeDay === cluster.dayNumber;

          // In single-day view, only render the active day's territory to prevent visual clutter
          if (activeDay !== 'all' && !isActive) return null;

          return (
            <Polygon
              key={`cluster-poly-${cluster.dayNumber}`}
              positions={cluster.polygon}
              pathOptions={
                isActive
                  ? {
                      fillColor: '#0F4C5C',
                      fillOpacity: 0.20,
                      color: '#14788D',
                      weight: 2,
                    }
                  : {
                      fillColor: '#64748B',
                      fillOpacity: 0.10,
                      color: '#94A3B8',
                      weight: 1.5,
                      dashArray: '4, 4',
                    }
              }
              eventHandlers={{
                click: () => onDayChange(cluster.dayNumber),
              }}
            >
              <Popup>
                <div className="font-mono" style={{ fontSize: '11px', padding: '2px' }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>DAY {cluster.dayNumber} TERRITORY</strong>
                  <div className="text-muted" style={{ marginTop: '2px' }}>
                    {cluster.pois.length} stops scheduled
                  </div>
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* 2. Cluster Centroid Badges in ALL DAYS view */}
        {activeDay === 'all' &&
          dayClusters.map((cluster) => {
            if (!cluster.centroid || cluster.centroid.lat === 0) return null;
            return (
              <Marker
                key={`cluster-badge-${cluster.dayNumber}`}
                position={[cluster.centroid.lat, cluster.centroid.lng]}
                icon={createClusterLabelIcon(cluster.dayNumber)}
                eventHandlers={{
                  click: () => onDayChange(cluster.dayNumber),
                }}
              />
            );
          })}

        {/* 3. Route Polyline: Simple vs Detailed Transit */}
        {transitMode === 'detailed' ? (
          <>
            {detailedSegments.map((seg) => (
              <Polyline
                key={seg.key}
                positions={seg.positions}
                pathOptions={{
                  color: seg.color,
                  weight: seg.weight,
                  opacity: 0.9,
                  dashArray: seg.isDashed ? '6, 6' : undefined,
                }}
              >
                <Tooltip sticky direction="top" opacity={0.95}>
                  <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600 }}>
                    {seg.transitLine ? `[LINE ${seg.transitLine}] ` : ''}
                    {seg.instruction}
                    {typeof seg.durationMins === 'number' && seg.durationMins > 0 ? ` · ${seg.durationMins}m` : ''}
                  </span>
                </Tooltip>
                <Popup>
                  <div style={{ minWidth: '150px', fontFamily: 'monospace', fontSize: '11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span
                        style={{
                          background: seg.color,
                          color: '#FFFFFF',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '10px',
                        }}
                      >
                        {seg.transitLine ? `LINE ${seg.transitLine}` : seg.type.toUpperCase()}
                      </span>
                      {typeof seg.durationMins === 'number' && seg.durationMins > 0 && (
                        <span style={{ color: '#64748B' }}>{seg.durationMins} MINS</span>
                      )}
                    </div>
                    <div style={{ color: '#0F172A', fontWeight: 600 }}>{seg.instruction}</div>
                    {seg.stationName && (
                      <div style={{ color: '#64748B', marginTop: '3px' }}>Station: {seg.stationName}</div>
                    )}
                    {typeof seg.distanceKm === 'number' && seg.distanceKm > 0 && (
                      <div style={{ color: '#94A3B8', marginTop: '2px', fontSize: '10px' }}>
                        Distance: {seg.distanceKm.toFixed(2)} km
                      </div>
                    )}
                  </div>
                </Popup>
              </Polyline>
            ))}

            {/* Station nodes for transfers and boardings */}
            {stationNodes.map((node) => (
              <CircleMarker
                key={node.key}
                center={node.position}
                radius={4.5}
                pathOptions={{
                  color: '#0F4C5C',
                  fillColor: '#FFFFFF',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip direction="top">
                  <span className="font-mono" style={{ fontSize: '10px', fontWeight: 600 }}>
                    {node.line ? `[Line ${node.line}] ` : ''}Station: {node.stationName}
                  </span>
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        ) : (
          activeDay !== 'all' && activePolyline.length > 1 && (
            <Polyline
              positions={activePolyline}
              pathOptions={{
                color: '#14788D',
                weight: 3.5,
                opacity: 0.9,
              }}
            />
          )
        )}

        {/* 4. Hotel Base Camp Anchor Marker */}
        {hotel && typeof hotel.lat === 'number' && !isNaN(hotel.lat) && (
          <Marker position={[hotel.lat, hotel.lng]} icon={createHotelIcon()}>
            <Popup>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
                <span className="font-mono text-xs text-muted" style={{ fontWeight: 700 }}>
                  BASE CAMP
                </span>
                <strong className="font-display" style={{ fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                  {hotel.name}
                </strong>
                <div className="font-mono text-xs text-muted">Primary accommodation anchor</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 5. Airport Transit Gate Anchor Marker */}
        {airport && typeof airport.lat === 'number' && !isNaN(airport.lat) && (
          <Marker position={[airport.lat, airport.lng]} icon={createAirportIcon()}>
            <Popup>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
                <span className="font-mono text-xs text-muted" style={{ fontWeight: 700 }}>
                  TRANSIT GATE
                </span>
                <strong className="font-display" style={{ fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                  {airport.name}
                </strong>
                <div className="font-mono text-xs text-muted">Airport transit gateway</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 6. Active Day Waypoint Markers */}
        {activeDay !== 'all' &&
          activeDayData &&
          (() => {
            let stopCounter = 0;
            return activeDayData.pois.map((poi, idx) => {
              const categoryType = classifyPoiCategory(poi.category, poi.name).type;
              const isHotel = categoryType === 'hotel' || poi.name.toLowerCase().includes('hotel');
              const isAirport = categoryType === 'airport' || categoryType === 'flight' || poi.name.toLowerCase().includes('airport');

              if (isHotel && hotel) return null;
              if (isAirport && airport) return null;

              if (!isHotel && !isAirport) stopCounter++;

              if (activeCategory && !isCategoryMatch(activeCategory, categoryType)) {
                return null;
              }

              const markerIcon = isHotel
                ? createHotelIcon()
                : isAirport
                ? createAirportIcon()
                : createWaypointIcon(categoryType, stopCounter);

              return (
                <Marker key={`${poi.lat}-${poi.lng}-${idx}`} position={[poi.lat, poi.lng]} icon={markerIcon}>
                  <Popup>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                      <div style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '4px' }}>
                        <span className="font-mono text-xs text-muted" style={{ fontWeight: 700 }}>
                          STOP {String(stopCounter).padStart(2, '0')}
                        </span>
                        <div className="font-display" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {poi.name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', fontFamily: 'monospace' }}>
                        {poi.arrivalTime && (
                          <div style={{ color: 'var(--color-text-muted)' }}>
                            Time: {formatPoiTime(poi.arrivalTime)} &rarr; {poi.departureTime ? formatPoiTime(poi.departureTime) : '--:--'}
                          </div>
                        )}
                        {typeof poi.costEur === 'number' && (
                          <div style={{ color: '#16A34A', fontWeight: 600 }}>
                            Cost: {poi.costEur.toFixed(2)} &euro;
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            });
          })()}
      </MapContainer>

      {/* Floating Detailed Transit Route Legend */}
      {transitMode === 'detailed' && (
        <div
          data-testid="detailed-transit-legend"
          style={{
            position: 'absolute',
            bottom: '18px',
            left: '400px',
            zIndex: 900,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            fontFamily: 'monospace',
            fontSize: '11px',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '14px', height: '0px', borderTop: '2.5px dashed #10B981' }} />
            <span style={{ color: '#0F172A', fontWeight: 600 }}>Walk</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '14px', height: '3.5px', background: '#EF4444', borderRadius: '1px' }} />
            <span style={{ color: '#0F172A', fontWeight: 600 }}>Transit Lines</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '14px', height: '0px', borderTop: '2.5px dashed #F59E0B' }} />
            <span style={{ color: '#0F172A', fontWeight: 600 }}>Transfer</span>
          </div>
        </div>
      )}
    </div>
  );
}
