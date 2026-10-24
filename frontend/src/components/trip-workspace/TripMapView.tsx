"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, Polyline, Polygon, ZoomControl, useMap, Tooltip, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { computeClusterPolygon, computeCentroid, computeCurvedRoutePath, computeCurvedSplineArc, LatLngPoint } from '@/utils/clusterHull';
import { TransitLeg, TransitStep } from '@/types/domain';
import { formatPoiTime } from '@/utils/date';
import { VectorBasemap } from '@/components/VectorBasemap';
import { InfoIcon } from '@/components/icons';
import { createRouteCardDragImage } from './TripUnifiedSidebar';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';

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

export interface FocusedWaypointPlace {
  id?: string;
  name?: string;
  lat: number;
  lng: number;
  category?: string;
  day?: number;
  durationMins?: number;
  costEur?: number;
  similarity?: number;
  matchType?: string;
  timestamp?: number;
}

export interface CategoryPoiItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  durationMins?: number;
  costEur?: number;
  similarity?: number;
  description?: string;
  photo_url?: string;
  thumbnail_url?: string;
}

interface TripMapViewProps {
  days: MapDayGroup[];
  hotel?: { name: string; lat: number; lng: number };
  airport?: { name: string; lat: number; lng: number };
  activeDay: number | 'all';
  onDayChange: (day: number | 'all') => void;
  focusedPlace?: FocusedWaypointPlace | null;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
  transitMode?: 'simple' | 'detailed';
  categoryPois?: CategoryPoiItem[];
  onSelectCategoryPoi?: (poi: CategoryPoiItem) => void;
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
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

const DAY_COLORS = ['#0F4C5C', '#2563EB', '#D97706', '#7C3AED', '#059669', '#DC2626', '#DB2777', '#0891B2'];
export function getDayColor(dayNum: number): string {
  if (!dayNum || dayNum < 1) return '#0F4C5C';
  return DAY_COLORS[(dayNum - 1) % DAY_COLORS.length];
}

interface TeardropPinConfig {
  categoryType: PoiCategoryType;
  name?: string;
  photoUrl?: string;
  stopNumber?: number;
  dayNumber?: number;
  isFocused?: boolean;
  poiPayload?: string;
}

function renderTeardropPinHtml({
  categoryType,
  name = '',
  photoUrl,
  stopNumber,
  dayNumber,
  isFocused = false,
  poiPayload = '',
}: TeardropPinConfig): string {
  const meta = classifyPoiCategory(categoryType, name);
  const svg = getCategorySvg(meta.type);
  const nameSafe = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pinColor = isFocused ? '#1E293B' : '#475569';
  const pinBorderColor = isFocused ? 'var(--color-accent-teal-mid, #14788D)' : 'rgba(255, 255, 255, 0.45)';

  const innerContent = photoUrl
    ? `<img src="${photoUrl}" alt="${nameSafe}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;color:#FFFFFF;background:#1E293B;border-radius:50%;">${svg}</div>`
    : `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#FFFFFF;background:#1E293B;border-radius:50%;">${svg}</div>`;

  const stopBadge = typeof stopNumber === 'number'
    ? `<div style="position:absolute;top:-4px;right:-6px;min-width:18px;height:18px;padding:0 3px;border-radius:9px;background:${dayNumber ? getDayColor(dayNumber) : '#0F4C5C'};color:#FFFFFF;font-family:var(--font-mono, monospace);font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;border:1.5px solid #FFFFFF;box-shadow:0 2px 4px rgba(0,0,0,0.3);z-index:3;">${stopNumber}</div>`
    : '';

  const focusGlow = isFocused
    ? `<div style="position:absolute;top:0;left:0;width:34px;height:34px;border-radius:50%;background:rgba(20, 120, 141, 0.35);animation:pinGlow 1.8s ease-in-out infinite;pointer-events:none;z-index:0;"></div>`
    : '';

  return `
    <div 
      ${poiPayload ? `draggable="true" onmousedown="event.stopPropagation();" data-paladio-draggable-poi="${poiPayload}"` : ''}
      title="${nameSafe ? `${nameSafe} (Drag into day route)` : 'Drag into day route'}"
      style="position:relative;width:34px;height:44px;display:flex;align-items:flex-start;justify-content:center;cursor:grab;user-select:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.32));"
    >
      ${focusGlow}
      <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:34px;height:44px;z-index:1;">
        <path d="M17 0C7.61116 0 0 7.61116 0 17C0 27.2 15.6 42.8 17 44C18.4 42.8 34 27.2 34 17C34 7.61116 26.3888 0 17 0Z" fill="${pinColor}"/>
        <path d="M17 1C8.16344 1 1 8.16344 1 17C1 26.2 16.2 41.2 17 42C17.8 41.2 33 26.2 33 17C33 8.16344 25.8366 1 17 1Z" stroke="${pinBorderColor}" stroke-width="1.2"/>
        <circle cx="17" cy="17" r="12" fill="#1E293B"/>
      </svg>
      <div style="position:absolute;top:5px;left:5px;width:24px;height:24px;border-radius:50%;overflow:hidden;z-index:2;background:#1E293B;box-shadow:inset 0 1px 3px rgba(0,0,0,0.4);">
        ${innerContent}
      </div>
      ${stopBadge}
    </div>
  `;
}

export function isPlaceMatch(
  a?: { id?: string; name?: string; lat?: number; lng?: number } | null,
  b?: { id?: string; name?: string; lat?: number; lng?: number } | null
): boolean {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.name && b.name && a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) return true;
  if (
    typeof a.lat === 'number' &&
    typeof a.lng === 'number' &&
    typeof b.lat === 'number' &&
    typeof b.lng === 'number' &&
    a.lat !== 0 &&
    b.lat !== 0
  ) {
    return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;
  }
  return false;
}

function createWaypointIcon(
  categoryType: PoiCategoryType,
  stopNumber: number,
  dayNumber?: number,
  poi?: { name: string; category?: string; lat: number; lng: number; durationMins?: number; costEur?: number },
  photoUrl?: string,
  isFocused = false
): L.DivIcon {
  const poiPayload = poi
    ? JSON.stringify({
        id: poi.name,
        name: poi.name,
        category: poi.category || categoryType,
        lat: poi.lat,
        lng: poi.lng,
        duration_mins: poi.durationMins || 60,
        cost_eur: poi.costEur || 0,
        location: { latitude: poi.lat, longitude: poi.lng },
      }).replace(/"/g, '&quot;')
    : '';

  return L.divIcon({
    className: 'paladio-waypoint-icon',
    html: renderTeardropPinHtml({
      categoryType,
      name: poi?.name,
      photoUrl,
      stopNumber,
      dayNumber,
      isFocused,
      poiPayload,
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

export function isTransitAnchor(p: { category?: string; name: string }): boolean {
  const cat = (p.category || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  return (
    cat.includes('hotel') ||
    name.includes('hotel') ||
    cat.includes('lodging') ||
    cat.includes('airport') ||
    name.includes('airport') ||
    cat.includes('flight')
  );
}

function createHotelIcon(hotel?: { name: string; lat: number; lng: number }, photoUrl?: string, isFocused = false): L.DivIcon {
  const poiPayload = hotel
    ? JSON.stringify({
        id: hotel.name,
        name: hotel.name,
        category: 'hotel',
        lat: hotel.lat,
        lng: hotel.lng,
        duration_mins: 60,
        cost_eur: 0,
        location: { latitude: hotel.lat, longitude: hotel.lng },
      }).replace(/"/g, '&quot;')
    : '';

  return L.divIcon({
    className: 'paladio-hotel-icon',
    html: renderTeardropPinHtml({
      categoryType: 'hotel',
      name: hotel?.name || 'Hotel Base Camp',
      photoUrl,
      isFocused,
      poiPayload,
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

function createAirportIcon(airport?: { name: string; lat: number; lng: number }, photoUrl?: string, isFocused = false): L.DivIcon {
  const poiPayload = airport
    ? JSON.stringify({
        id: airport.name,
        name: airport.name,
        category: 'airport',
        lat: airport.lat,
        lng: airport.lng,
        duration_mins: 60,
        cost_eur: 0,
        location: { latitude: airport.lat, longitude: airport.lng },
      }).replace(/"/g, '&quot;')
    : '';

  return L.divIcon({
    className: 'paladio-airport-icon',
    html: renderTeardropPinHtml({
      categoryType: 'airport',
      name: airport?.name || 'Airport Gateway',
      photoUrl,
      isFocused,
      poiPayload,
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}


function createFocusedWaypointIcon(place: FocusedWaypointPlace, photoUrl?: string): L.DivIcon {
  const cat = (place.category || 'attraction').toLowerCase() as PoiCategoryType;
  const poiPayload = JSON.stringify({
    id: place.id || place.name || 'waypoint',
    name: place.name || 'Target Waypoint',
    category: place.category || 'attraction',
    lat: place.lat,
    lng: place.lng,
    duration_mins: place.durationMins || 60,
    cost_eur: place.costEur || 0,
    location: { latitude: place.lat, longitude: place.lng },
  }).replace(/"/g, '&quot;');

  return L.divIcon({
    className: 'paladio-focused-waypoint-icon',
    html: renderTeardropPinHtml({
      categoryType: cat,
      name: place.name,
      photoUrl,
      isFocused: true,
      poiPayload,
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

function createCategoryPoiIcon(categoryType: PoiCategoryType, poi?: Partial<CategoryPoiItem>, photoUrl?: string, isFocused = false): L.DivIcon {
  const poiPayload = poi
    ? JSON.stringify({
        id: poi.id || poi.name,
        name: poi.name,
        category: poi.category || categoryType,
        lat: poi.lat,
        lng: poi.lng,
        duration_mins: poi.durationMins || 60,
        cost_eur: poi.costEur || 0,
        location: { latitude: poi.lat, longitude: poi.lng },
      }).replace(/"/g, '&quot;')
    : '';

  return L.divIcon({
    className: 'paladio-category-poi-icon',
    html: renderTeardropPinHtml({
      categoryType,
      name: poi?.name,
      photoUrl,
      isFocused,
      poiPayload,
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

function FocusedWaypointMarker({
  place,
  onInspectPoi,
}: {
  place: FocusedWaypointPlace;
  onInspectPoi?: (id: string, fallbackData?: Record<string, unknown>) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const { getPhoto } = usePoiPhotos();
  const photoUrl = getPhoto(place.id) || getPhoto(place.name);

  const icon = useMemo(() => createFocusedWaypointIcon(place, photoUrl), [place, photoUrl]);

  const handleInspect = () => {
    onInspectPoi?.(place.id || place.name || 'waypoint', {
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      category: place.category,
      duration_mins: place.durationMins,
      cost_eur: place.costEur,
    });
  };

  return (
    <Marker
      ref={markerRef}
      position={[place.lat, place.lng]}
      icon={icon}
      zIndexOffset={2000}
      eventHandlers={{
        click: handleInspect,
      }}
    />
  );
}

// Controller for bounds fitting and pan-to-focus
function MapViewportController({
  activePoints,
  focusedPlace,
}: {
  activePoints: LatLngPoint[];
  focusedPlace?: FocusedWaypointPlace | null;
}) {
  const map = useMap();

  const lastFocusedKeyRef = useRef<string | null>(null);
  const lastBoundsKeyRef = useRef<string | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!map) return;
    const onDragStart = () => {
      isDraggingRef.current = true;
    };
    const onDragEnd = () => {
      isDraggingRef.current = false;
    };
    map.on('dragstart', onDragStart);
    map.on('dragend', onDragEnd);
    return () => {
      map.off('dragstart', onDragStart);
      map.off('dragend', onDragEnd);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (
      focusedPlace &&
      typeof focusedPlace.lat === 'number' &&
      typeof focusedPlace.lng === 'number' &&
      !isNaN(focusedPlace.lat) &&
      !isNaN(focusedPlace.lng) &&
      !(focusedPlace.lat === 0 && focusedPlace.lng === 0)
    ) {
      const focusKey = `${focusedPlace.lat.toFixed(5)},${focusedPlace.lng.toFixed(5)},${focusedPlace.timestamp || 0}`;
      if (focusKey !== lastFocusedKeyRef.current) {
        lastFocusedKeyRef.current = focusKey;
        if (!isDraggingRef.current) {
          map.flyTo([focusedPlace.lat, focusedPlace.lng], 16, { animate: true, duration: 0.8 });
        }
      }
      return;
    }
    if (activePoints.length > 0 && !isDraggingRef.current) {
      const boundsKey = activePoints.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
      if (boundsKey !== lastBoundsKeyRef.current) {
        lastBoundsKeyRef.current = boundsKey;
        const bounds = L.latLngBounds(activePoints.map((p) => [p.lat, p.lng]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true });
        }
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
  categoryPois,
  onSelectCategoryPoi,
  onInspectPoi,
}: TripMapViewProps) {
  const [internalCatFilter, setInternalCatFilter] = useState<PoiCategoryType | null>(null);
  const activeCategory = categoryFilter !== undefined ? categoryFilter : internalCatFilter;
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const { getPhoto } = usePoiPhotos();

  // Allow dragging any POI marker directly from the map into route day slots
  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-paladio-draggable-poi]');
      if (!target) return;
      const raw = target.getAttribute('data-paladio-draggable-poi');
      if (!raw) return;
      try {
        const poiData = JSON.parse(raw);
        const ghost = createRouteCardDragImage({
          name: poiData.name,
          category: poiData.category,
          duration_mins: poiData.duration_mins,
          cost_eur: poiData.cost_eur,
        });
        if (e.dataTransfer) {
          e.dataTransfer.setDragImage(ghost, 20, 20);
          setTimeout(() => ghost.remove(), 0);
          const payload = { source: 'map', poi: poiData };
          if (typeof window !== 'undefined') {
            (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = payload;
          }
          e.dataTransfer.setData('application/paladio-poi', JSON.stringify(payload));
          e.dataTransfer.effectAllowed = 'copyMove';
        }
        window.dispatchEvent(new CustomEvent('paladio:switch-to-route'));
      } catch (err) {
        console.warn('Failed to parse draggable poi payload from map', err);
      }
    };

    document.addEventListener('dragstart', handleDragStart);
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, []);

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

        const hasStepGeom = Boolean(
          leg && Array.isArray(leg.steps) && leg.steps.some((s) => Array.isArray(s.geometry) && s.geometry.length > 1)
        );
        const hasLegGeom = Boolean(
          leg && Array.isArray(leg.geometry) && leg.geometry.length > 1
        );

        if (leg && Array.isArray(leg.steps) && leg.steps.length > 0) {
          if (hasStepGeom) {
            for (let sIdx = 0; sIdx < leg.steps.length; sIdx++) {
              const step = leg.steps[sIdx];
              const style = getTransitStepStyle(step);
              const positions: [number, number][] = (Array.isArray(step.geometry) && step.geometry.length > 1)
                ? (step.geometry as [number, number][])
                : [startCoord, endCoord];

              segments.push({
                key: `d${dayGroup.dayNumber}-leg${k}-step${sIdx}`,
                positions,
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
                const nodePos = positions.length > 0 ? positions[0] : startCoord;
                nodes.push({
                  key: `d${dayGroup.dayNumber}-leg${k}-st${sIdx}`,
                  position: nodePos,
                  stationName: step.station_name,
                  line: step.transit_line,
                  instruction: step.instruction || 'Station stop',
                });
              }
            }
          } else if (hasLegGeom) {
            const isWalk = leg.mode === 'pedestrian' || leg.mode === 'walk';
            const style = isWalk
              ? { color: '#10B981', isDashed: true, weight: 4 }
              : { color: '#2563EB', isDashed: false, weight: 5 };

            segments.push({
              key: `d${dayGroup.dayNumber}-leg${k}-geom`,
              positions: leg.geometry as [number, number][],
              color: style.color,
              isDashed: style.isDashed,
              weight: style.weight,
              instruction: isWalk ? `Walk (~${leg.duration_mins || 0}m)` : `Transit (~${leg.duration_mins || 0}m)`,
              type: leg.mode || 'transit',
              durationMins: leg.duration_mins,
              distanceKm: 0,
            });
          } else {
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
          }
        } else if (leg) {
          const isWalk = leg.mode === 'pedestrian' || leg.mode === 'walk';
          const style = isWalk
            ? { color: '#10B981', isDashed: true, weight: 4 }
            : { color: '#2563EB', isDashed: false, weight: 5 };

          const positions: [number, number][] = hasLegGeom
            ? (leg.geometry as [number, number][])
            : [startCoord, endCoord];

          segments.push({
            key: `d${dayGroup.dayNumber}-leg${k}-single`,
            positions,
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

  // Active bounds points (zooms strictly to convex hulls / sightseeing territories, ignoring distant transit anchors)
  const activeBoundsPoints: LatLngPoint[] = useMemo(() => {
    let points: LatLngPoint[] = [];

    if (activeDay === 'all') {
      // Collect hull points of all day clusters
      dayClusters.forEach((cluster) => {
        if (cluster.polygon && cluster.polygon.length > 0) {
          cluster.polygon.forEach(([lat, lng]) => points.push({ lat, lng }));
        }
      });
      // Fallback if no cluster polygons computed yet
      if (points.length === 0) {
        days.forEach((d) => {
          d.pois.forEach((p) => {
            if (!isTransitAnchor(p)) points.push({ lat: p.lat, lng: p.lng });
          });
        });
      }
      if (points.length === 0 && hotel) {
        points.push(hotel);
      }
    } else if (activeDayData) {
      // Zoom strictly to the active day's convex hull polygon
      const cluster = dayClusters.find((c) => c.dayNumber === activeDayData.dayNumber);
      if (cluster && cluster.polygon && cluster.polygon.length > 0) {
        cluster.polygon.forEach(([lat, lng]) => points.push({ lat, lng }));
      } else {
        const cityPoints = activeDayData.pois.filter((p) => !isTransitAnchor(p));
        if (cityPoints.length > 0) {
          cityPoints.forEach((p) => points.push({ lat: p.lat, lng: p.lng }));
        } else {
          // Fallback only if the entire day has no POIs besides hotel
          points = activeDayData.pois.map((p) => ({ lat: p.lat, lng: p.lng }));
        }
      }
    }

    if (activeCategory) {
      if (categoryPois && categoryPois.length > 0) {
        return categoryPois.map((p) => ({ lat: p.lat, lng: p.lng }));
      }
      const filtered = points.filter((p) => {
        const poiItem = p as Partial<MapPoi>;
        const catType = classifyPoiCategory(poiItem.category, poiItem.name).type;
        return isCategoryMatch(activeCategory, catType);
      });
      if (filtered.length > 0) return filtered;
    }

    return points;
  }, [activeDay, days, activeDayData, dayClusters, hotel, activeCategory, categoryPois]);

  // Centroid fallback
  const centerPosition: [number, number] = useMemo(() => {
    if (activeBoundsPoints.length > 0) {
      const c = computeCentroid(activeBoundsPoints);
      return [c.lat, c.lng];
    }
    if (hotel) return [hotel.lat, hotel.lng];
    return [41.1579, -8.6291]; // Default fallback
  }, [activeBoundsPoints, hotel]);

  // Active day route geometry (smooth curves + dashed commute legs)
  const activeDayRouteData = useMemo(() => {
    if (!activeDayData || !activeDayData.pois || activeDayData.pois.length < 2) {
      return { coreCurved: [], commuteStartArc: [], commuteEndArc: [] };
    }

    const pois = activeDayData.pois;
    let startIdx = 0;
    while (startIdx < pois.length - 1 && isTransitAnchor(pois[startIdx])) {
      startIdx++;
    }

    let endIdx = pois.length;
    while (endIdx > startIdx + 1 && isTransitAnchor(pois[endIdx - 1])) {
      endIdx--;
    }

    const commuteStartArc: [number, number][] =
      startIdx > 0
        ? computeCurvedSplineArc([pois[0].lat, pois[0].lng], [pois[startIdx].lat, pois[startIdx].lng], { curvature: 0.08 })
        : [];

    const commuteEndArc: [number, number][] =
      endIdx < pois.length
        ? computeCurvedSplineArc([pois[endIdx - 1].lat, pois[endIdx - 1].lng], [pois[pois.length - 1].lat, pois[pois.length - 1].lng], { curvature: 0.08 })
        : [];

    const coreSlice = pois.slice(startIdx, endIdx);
    const coreRaw: [number, number][] = coreSlice.map((p) => [p.lat, p.lng]);
    const coreCurved = coreRaw.length >= 2 ? computeCurvedRoutePath(coreRaw) : [];

    return { coreCurved, commuteStartArc, commuteEndArc };
  }, [activeDayData]);

  const isFocusedAlreadyRendered = useMemo(() => {
    if (!focusedPlace) return false;
    if (activeDay !== 'all' && hotel && isPlaceMatch(hotel, focusedPlace)) return true;
    if (activeDay !== 'all' && airport && isPlaceMatch(airport, focusedPlace)) return true;
    if (activeDay !== 'all' && activeDayData?.pois?.some((p) => isPlaceMatch(p, focusedPlace))) return true;
    if (activeCategory && categoryPois?.some((p) => isPlaceMatch(p, focusedPlace))) return true;
    return false;
  }, [focusedPlace, hotel, airport, activeDay, activeDayData, activeCategory, categoryPois]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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

        {focusedPlace &&
          typeof focusedPlace.lat === 'number' &&
          typeof focusedPlace.lng === 'number' &&
          !(focusedPlace.lat === 0 && focusedPlace.lng === 0) &&
          !isFocusedAlreadyRendered && (
            <FocusedWaypointMarker
              key={`focused-${focusedPlace.lat}-${focusedPlace.lng}-${focusedPlace.timestamp || 0}`}
              place={focusedPlace}
              onInspectPoi={onInspectPoi}
            />
        )}

        {/* Sovereign Keyless OpenStreetMap Vector Basemap (Zero POI/amenity icon clutter) */}
        <VectorBasemap styleUrl="https://tiles.openfreemap.org/styles/liberty" />

        {/* 1. Cluster Region Polygons (Colored convex hulls) */}
        {dayClusters.map((cluster) => {
          if (cluster.polygon.length < 3) return null;
          const isActive = activeDay === cluster.dayNumber;
          const isHovered = hoveredDay === cluster.dayNumber;

          // In single-day view, only render the active day's territory to prevent visual clutter
          if (activeDay !== 'all' && !isActive) return null;

          const dayColor = getDayColor(cluster.dayNumber);

          return (
            <Polygon
              key={`cluster-poly-${cluster.dayNumber}`}
              positions={cluster.polygon}
              pathOptions={
                isActive || isHovered
                  ? {
                      fillColor: dayColor,
                      fillOpacity: 0.16,
                      color: dayColor,
                      weight: 2,
                    }
                  : {
                      fillColor: '#64748B',
                      fillOpacity: hoveredDay !== null ? 0.03 : 0.08,
                      color: '#94A3B8',
                      weight: 1.5,
                      dashArray: '4, 4',
                    }
              }
              eventHandlers={{
                click: () => onDayChange(cluster.dayNumber),
                mouseover: () => setHoveredDay(cluster.dayNumber),
                mouseout: () => setHoveredDay(null),
              }}
            >
              <Tooltip sticky direction="center" opacity={0.92}>
                <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: dayColor }}>
                  DAY {cluster.dayNumber}
                </span>
              </Tooltip>
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

        {/* 3. Route Polyline: Simple vs Detailed Transit */}
        {transitMode === 'detailed' ? (
          <>
            {detailedSegments.map((seg) => (
              <Polyline
                key={`seg-${seg.key}-${seg.positions.map((p) => `${p[0]},${p[1]}`).join(';')}`}
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
                  <div style={{ minWidth: '150px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
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
                key={`node-${node.key}-${node.position[0]},${node.position[1]}`}
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
        ) : activeDay !== 'all' ? (
          <>
            {/* Core sightseeing route (smooth curved spline) */}
            {activeDayRouteData.coreCurved.length > 1 && (
              <Polyline
                key={`active-core-d${activeDay}`}
                positions={activeDayRouteData.coreCurved}
                pathOptions={{
                  color: getDayColor(activeDay as number),
                  weight: 3.5,
                  opacity: 0.95,
                }}
              />
            )}
            {/* Commute start from Hotel/Airport (refined dashed arc) */}
            {activeDayRouteData.commuteStartArc.length > 1 && (
              <Polyline
                key={`active-start-d${activeDay}`}
                positions={activeDayRouteData.commuteStartArc}
                pathOptions={{
                  color: getDayColor(activeDay as number),
                  weight: 2,
                  opacity: 0.65,
                  dashArray: '4, 6',
                }}
              />
            )}
            {/* Commute return to Hotel (refined dashed arc) */}
            {activeDayRouteData.commuteEndArc.length > 1 && (
              <Polyline
                key={`active-end-d${activeDay}`}
                positions={activeDayRouteData.commuteEndArc}
                pathOptions={{
                  color: getDayColor(activeDay as number),
                  weight: 2,
                  opacity: 0.65,
                  dashArray: '4, 6',
                }}
              />
            )}
          </>
        ) : (
          /* In ALL DAYS view: render clean curved day polylines excluding repetitive hotel commute rays */
          days.map((d) => {
            const sightseeingPois = d.pois.filter((p) => !isTransitAnchor(p));
            const targetPois = sightseeingPois.length >= 2 ? sightseeingPois : d.pois;
            const rawCoords: [number, number][] = targetPois.map((p) => [p.lat, p.lng]);
            if (rawCoords.length < 2) return null;

            const curvedPositions = computeCurvedRoutePath(rawCoords);
            const isHovered = hoveredDay === d.dayNumber;
            const isAnotherHovered = hoveredDay !== null && !isHovered;

            return (
              <Polyline
                key={`all-poly-d${d.dayNumber}`}
                positions={curvedPositions}
                pathOptions={{
                  color: getDayColor(d.dayNumber),
                  weight: isHovered ? 4 : isAnotherHovered ? 1.5 : 2.5,
                  opacity: isHovered ? 0.95 : isAnotherHovered ? 0.12 : 0.32,
                }}
                eventHandlers={{
                  mouseover: () => setHoveredDay(d.dayNumber),
                  mouseout: () => setHoveredDay(null),
                  click: () => onDayChange(d.dayNumber),
                }}
              />
            );
          })
        )}

        {/* 4. Hotel Base Camp Anchor Marker (Only in single day view) */}
        {activeDay !== 'all' && hotel && typeof hotel.lat === 'number' && !isNaN(hotel.lat) && (() => {
          const isHotelFocused = isPlaceMatch(hotel, focusedPlace);
          return (
            <Marker
              position={[hotel.lat, hotel.lng]}
              icon={createHotelIcon(hotel, getPhoto(hotel.name), isHotelFocused)}
              zIndexOffset={isHotelFocused ? 2500 : 600}
              eventHandlers={{
                click: () => {
                  onInspectPoi?.(hotel.name, {
                    id: hotel.name,
                    name: hotel.name,
                    lat: hotel.lat,
                    lng: hotel.lng,
                    category: 'hotel',
                    duration_mins: 60,
                    cost_eur: 0,
                  });
                },
              }}
            />
          );
        })()}

        {/* 5. Airport Transit Gate Anchor Marker (Only in single day view) */}
        {activeDay !== 'all' && airport && typeof airport.lat === 'number' && !isNaN(airport.lat) && (() => {
          const isAirportFocused = isPlaceMatch(airport, focusedPlace);
          return (
            <Marker
              position={[airport.lat, airport.lng]}
              icon={createAirportIcon(airport, getPhoto(airport.name), isAirportFocused)}
              zIndexOffset={isAirportFocused ? 2500 : 600}
              eventHandlers={{
                click: () => {
                  onInspectPoi?.(airport.name, {
                    id: airport.name,
                    name: airport.name,
                    lat: airport.lat,
                    lng: airport.lng,
                    category: 'airport',
                    duration_mins: 60,
                    cost_eur: 0,
                  });
                },
              }}
            />
          );
        })()}

        {/* 6. Waypoint Markers (Only in Single Day view; hidden in ALL DAYS mode to keep only routes and convex hulls) */}
        {activeDay !== 'all' &&
          activeDayData &&
          (() => {
            let stopCounter = 0;
            return activeDayData.pois.map((poi, idx) => {
              const categoryType = classifyPoiCategory(poi.category, poi.name).type;
              const isHotel = categoryType === 'hotel' || poi.name.toLowerCase().includes('hotel');
              const isAirport =
                categoryType === 'airport' || categoryType === 'flight' || poi.name.toLowerCase().includes('airport');

              stopCounter++;

              if (activeCategory && !isCategoryMatch(activeCategory, categoryType)) {
                return null;
              }

              const isPoiFocused = isPlaceMatch(poi, focusedPlace);
              const photoUrl = getPhoto(poi.name);
              const markerIcon = isHotel
                ? createHotelIcon({ name: poi.name, lat: poi.lat, lng: poi.lng }, photoUrl, isPoiFocused)
                : isAirport
                ? createAirportIcon({ name: poi.name, lat: poi.lat, lng: poi.lng }, photoUrl, isPoiFocused)
                : createWaypointIcon(categoryType, stopCounter, activeDayData.dayNumber, poi, photoUrl, isPoiFocused);

              return (
                <Marker
                  key={`marker-d${activeDayData.dayNumber}-${poi.name}-${poi.lat}-${poi.lng}-${stopCounter}-${idx}`}
                  position={[poi.lat, poi.lng]}
                  icon={markerIcon}
                  zIndexOffset={isPoiFocused ? 2500 : 500}
                  eventHandlers={{
                    click: () => {
                      onInspectPoi?.(poi.name, {
                        id: poi.name,
                        name: poi.name,
                        lat: poi.lat,
                        lng: poi.lng,
                        category: poi.category,
                        duration_mins: poi.durationMins,
                        cost_eur: poi.costEur,
                      });
                    },
                  }}
                />
              );
            });
          })()}

        {/* 7. Category POI Markers (Displayed when browsing a category like MUSEUM, CAFE, etc.) */}
        {activeCategory && categoryPois && categoryPois.length > 0 && (
          categoryPois.map((poi, idx) => {
            const catType = classifyPoiCategory(poi.category, poi.name).type;
            const isCatPoiFocused = isPlaceMatch(poi, focusedPlace);
            const photoUrl = poi.photo_url || getPhoto(poi.id) || getPhoto(poi.name);
            return (
              <Marker
                key={`cat-poi-${poi.id || idx}-${poi.lat}-${poi.lng}`}
                position={[poi.lat, poi.lng]}
                icon={createCategoryPoiIcon(catType, poi, photoUrl, isCatPoiFocused)}
                zIndexOffset={isCatPoiFocused ? 2500 : 400}
                eventHandlers={{
                  click: () => {
                    onInspectPoi?.(poi.id || poi.name, {
                      id: poi.id,
                      name: poi.name,
                      lat: poi.lat,
                      lng: poi.lng,
                      category: poi.category,
                      description: poi.description,
                      duration_mins: poi.durationMins,
                      cost_eur: poi.costEur,
                    });
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
                  <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600 }}>
                    {poi.name}
                  </span>
                </Tooltip>
              </Marker>
            );
          })
        )}
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
            fontFamily: 'var(--font-mono)',
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
