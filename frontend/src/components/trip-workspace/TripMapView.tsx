"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { MapContainer, Marker, Popup, Polyline, Polygon, ZoomControl, useMap, useMapEvents, Tooltip, CircleMarker, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { computeClusterPolygon, computeCentroid, LatLngPoint } from '@/utils/clusterHull';
import { TransitLeg, TransitStep } from '@/types/domain';
import { formatPoiTime } from '@/utils/date';
import { VectorBasemap } from '@/components/VectorBasemap';
import { InfoIcon, CrosshairIcon, CloseIcon, RadarIcon } from '@/components/icons';
import { createRouteCardDragImage, startCustomDragPreview, cleanupCustomDragPreview, MainTabType } from './TripUnifiedSidebar';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { ActiveTransitLineData } from '@/utils/transitColors';
import { apiFetch, getApiBaseUrl } from '@/utils/api';

export interface MapPoi {
  id?: string;
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
  theme?: string;
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
  color?: string;
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
  onClearFocus?: () => void;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
  transitMode?: 'simple' | 'detailed';
  categoryPois?: CategoryPoiItem[];
  onSelectCategoryPoi?: (poi: CategoryPoiItem) => void;
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
  isSidebarOpen?: boolean;
  sidebarTab?: MainTabType;
  destinationCity?: string;
  activeTransitLine?: ActiveTransitLineData | null;
  onClearTransitLine?: () => void;
  activeMapPickField?: 'origin' | 'destination' | null;
  onCancelMapPick?: () => void;
  directionsRoute?: {
    activeLeg: TransitLeg;
    primary_leg?: TransitLeg;
    alternative_leg?: TransitLeg | null;
    origin: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
  } | null;
  spatialCircle?: SpatialCircleFilter | null;
  onSpatialCircleChange?: (circle: SpatialCircleFilter) => void;
  isDroppingWaypoint?: boolean;
  onCancelDropWaypoint?: () => void;
  onClearSpatialCircle?: () => void;
  readOnly?: boolean;
}

export interface SpatialCircleFilter {
  lat: number;
  lng: number;
  radiusMeters: number;
}

function createDirectionsTacticalPinIcon(label: 'A' | 'B', color: string): L.DivIcon {
  return L.divIcon({
    className: 'paladio-directions-pin',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: ${color};
        color: #FFFFFF;
        font-family: var(--font-code, monospace);
        font-weight: 700;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 8px rgba(0,0,0,0.3);
        border: 2px solid #FFFFFF;
      ">
        ${label}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createDirectionsStationIcon(role: 'board' | 'transfer' | 'alight'): L.DivIcon {
  const bg = role === 'transfer' ? '#D97706' : role === 'alight' ? '#059669' : '#0F4C5C';
  return L.divIcon({
    className: 'paladio-directions-station-node',
    html: `
      <div style="
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #FFFFFF;
        border: 2.5px solid ${bg};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.22);
      ">
        <div style="
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${bg};
        "></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function createIntermediateStopIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'paladio-intermediate-stop-node',
    html: `
      <div style="
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #FFFFFF;
        border: 2px solid ${color};
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        cursor: pointer;
      "></div>
    `,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function DirectionsMapEventsHandler({
  activeMapPickField,
  onCancelMapPick,
  directionsRoute,
}: {
  activeMapPickField?: 'origin' | 'destination' | null;
  onCancelMapPick?: () => void;
  directionsRoute?: {
    activeLeg: TransitLeg;
    origin: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
  } | null;
}) {
  const map = useMap();

  useMapEvents({
    click: async (e) => {
      if (!activeMapPickField) return;
      const { lat, lng } = e.latlng;
      let placeName = `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/locations/reverse?lat=${lat}&lon=${lng}`);
        if (res.ok) {
          const data = await res.json();
          if (data.name) placeName = data.name;
          if (data.address) address = data.address;
        }
      } catch {
        // Fallback to coordinates
      }

      window.dispatchEvent(
        new CustomEvent('paladio:map-picked-location', {
          detail: {
            field: activeMapPickField,
            name: placeName,
            lat,
            lng,
            address,
          },
        })
      );

      if (onCancelMapPick) onCancelMapPick();
    },
  });

  // Auto-fit camera when directions route is set or updated
  useEffect(() => {
    if (!directionsRoute || !directionsRoute.activeLeg) return;
    const points: [number, number][] = [];
    if (directionsRoute.origin) {
      points.push([directionsRoute.origin.lat, directionsRoute.origin.lng]);
    }
    if (directionsRoute.destination) {
      points.push([directionsRoute.destination.lat, directionsRoute.destination.lng]);
    }
    if (directionsRoute.activeLeg.geometry && directionsRoute.activeLeg.geometry.length > 0) {
      directionsRoute.activeLeg.geometry.forEach(([lat, lon]) => points.push([lat, lon]));
    }
    if (directionsRoute.activeLeg.steps) {
      directionsRoute.activeLeg.steps.forEach((s: any) => {
        if (s.geometry && Array.isArray(s.geometry)) {
          s.geometry.forEach(([lat, lon]: [number, number]) => {
            if (typeof lat === 'number' && typeof lon === 'number') {
              points.push([lat, lon]);
            }
          });
        }
      });
    }
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
    }
  }, [directionsRoute, map]);

  return null;
}

function createWaypointCenterIcon(): L.DivIcon {
  return L.divIcon({
    className: 'paladio-waypoint-center',
    html: `
      <div draggable="false" style="
        position: relative;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        -webkit-user-drag: none;
      ">
        <div style="
          position: absolute;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(15, 76, 92, 0.25);
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          pointer-events: none;
        "></div>
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #0F4C5C;
          border: 2.5px solid #FFFFFF;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          pointer-events: none;
        ">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #FFFFFF;"></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createRadiusHandleIcon(): L.DivIcon {
  return L.divIcon({
    className: 'paladio-radius-handle',
    html: `
      <div draggable="false" style="
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: ew-resize;
        user-select: none;
        -webkit-user-drag: none;
      ">
        <div style="
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #0F4C5C;
          border: 2.5px solid #FFFFFF;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        ">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #FFFFFF;"></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function WaypointMapEventsHandler({
  isDroppingWaypoint,
  onCancelDropWaypoint,
  onSetSpatialCircle,
}: {
  isDroppingWaypoint?: boolean;
  onCancelDropWaypoint?: () => void;
  onSetSpatialCircle?: (circle: SpatialCircleFilter) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (!isDroppingWaypoint) return;
      const { lat, lng } = e.latlng;
      if (onSetSpatialCircle) {
        onSetSpatialCircle({
          lat,
          lng,
          radiusMeters: 800,
        });
      }
      if (onCancelDropWaypoint) onCancelDropWaypoint();
    },
  });

  useEffect(() => {
    if (!isDroppingWaypoint) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancelDropWaypoint) {
        onCancelDropWaypoint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDroppingWaypoint, onCancelDropWaypoint]);

  return null;
}

function InteractiveSpatialCircleLayer({
  spatialCircle,
  onSpatialCircleChange,
  onClearSpatialCircle,
}: {
  spatialCircle: SpatialCircleFilter;
  onSpatialCircleChange?: (circle: SpatialCircleFilter) => void;
  onClearSpatialCircle?: () => void;
}) {
  const map = useMap();
  const circleRef = useRef<L.Circle | null>(null);
  const handleMarkerRef = useRef<L.Marker | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const isDraggingRef = useRef(false);

  // Stable DivIcon instances so React-Leaflet never invokes marker.setIcon() mid-drag
  const handleIcon = useMemo(() => createRadiusHandleIcon(), []);
  const centerIcon = useMemo(() => createWaypointCenterIcon(), []);

  // Calculate handle position pointing East
  const deltaLng = spatialCircle.radiusMeters / (111320.0 * Math.max(0.0001, Math.cos((spatialCircle.lat * Math.PI) / 180.0)));
  const handlePosition: [number, number] = [spatialCircle.lat, spatialCircle.lng + deltaLng];

  // Sync Leaflet objects when spatialCircle changes from external controls (slider, presets, etc.)
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (circleRef.current) {
      circleRef.current.setLatLng([spatialCircle.lat, spatialCircle.lng]);
      circleRef.current.setRadius(spatialCircle.radiusMeters);
    }
    if (handleMarkerRef.current) {
      const dLng = spatialCircle.radiusMeters / (111320.0 * Math.max(0.0001, Math.cos((spatialCircle.lat * Math.PI) / 180.0)));
      handleMarkerRef.current.setLatLng([spatialCircle.lat, spatialCircle.lng + dLng]);
      handleMarkerRef.current.setTooltipContent(`${spatialCircle.radiusMeters}m`);
    }
    if (centerMarkerRef.current) {
      centerMarkerRef.current.setLatLng([spatialCircle.lat, spatialCircle.lng]);
    }
  }, [spatialCircle.lat, spatialCircle.lng, spatialCircle.radiusMeters]);

  // Safely close popups and tooltips on unmount so Leaflet never processes events on detached DOM nodes
  useEffect(() => {
    return () => {
      try {
        if (centerMarkerRef.current) {
          centerMarkerRef.current.closePopup();
        }
        if (handleMarkerRef.current) {
          handleMarkerRef.current.closeTooltip();
        }
        map.closePopup();
      } catch {
        // ignore unmount cleanup errors
      }
    };
  }, [map]);

  // Radius handle drag handlers - 60fps native Leaflet dragging with zero React re-renders during drag
  const handleEventHandlers = useMemo(() => ({
    dragstart: (e: L.LeafletEvent) => {
      isDraggingRef.current = true;
      const marker = e.target as L.Marker;
      marker.openTooltip();
    },
    drag: (e: L.LeafletEvent) => {
      const marker = e.target as L.Marker;
      const handleLatLng = marker.getLatLng();
      const newDist = Math.round(map.distance([spatialCircle.lat, spatialCircle.lng], handleLatLng));
      const clampedDist = Math.max(100, Math.min(10000, newDist));
      if (circleRef.current) {
        circleRef.current.setRadius(clampedDist);
      }
      marker.setTooltipContent(`${clampedDist}m`);
      marker.openTooltip();
    },
    dragend: (e: L.LeafletEvent) => {
      const marker = e.target as L.Marker;
      const handleLatLng = marker.getLatLng();
      const newDist = Math.round(map.distance([spatialCircle.lat, spatialCircle.lng], handleLatLng));
      const clampedDist = Math.max(100, Math.min(10000, newDist));

      // Snap handle back to the East perimeter of the circle
      const dLng = clampedDist / (111320.0 * Math.max(0.0001, Math.cos((spatialCircle.lat * Math.PI) / 180.0)));
      marker.setLatLng([spatialCircle.lat, spatialCircle.lng + dLng]);
      marker.setTooltipContent(`${clampedDist}m`);

      isDraggingRef.current = false;

      onSpatialCircleChange?.({
        ...spatialCircle,
        radiusMeters: clampedDist,
      });
    },
  }), [map, spatialCircle, onSpatialCircleChange]);

  // Center pin drag handlers - circle and handle follow smoothly in real time
  const centerEventHandlers = useMemo(() => ({
    dragstart: () => {
      isDraggingRef.current = true;
    },
    drag: (e: L.LeafletEvent) => {
      const marker = e.target as L.Marker;
      const centerLatLng = marker.getLatLng();
      if (circleRef.current) {
        circleRef.current.setLatLng(centerLatLng);
      }
      if (handleMarkerRef.current) {
        const dLng = spatialCircle.radiusMeters / (111320.0 * Math.max(0.0001, Math.cos((centerLatLng.lat * Math.PI) / 180.0)));
        handleMarkerRef.current.setLatLng([centerLatLng.lat, centerLatLng.lng + dLng]);
      }
    },
    dragend: (e: L.LeafletEvent) => {
      const marker = e.target as L.Marker;
      const centerLatLng = marker.getLatLng();
      isDraggingRef.current = false;
      onSpatialCircleChange?.({
        ...spatialCircle,
        lat: centerLatLng.lat,
        lng: centerLatLng.lng,
      });
    },
  }), [spatialCircle, onSpatialCircleChange]);

  return (
    <>
      <Circle
        ref={circleRef}
        center={[spatialCircle.lat, spatialCircle.lng]}
        radius={spatialCircle.radiusMeters}
        pathOptions={{
          color: '#0F4C5C',
          weight: 2,
          dashArray: '5, 5',
          fillColor: '#0F4C5C',
          fillOpacity: 0.12,
        }}
      />
      {/* Center Waypoint Pin (Draggable to move area filter) */}
      <Marker
        ref={centerMarkerRef}
        position={[spatialCircle.lat, spatialCircle.lng]}
        icon={centerIcon}
        draggable={true}
        zIndexOffset={4000}
        eventHandlers={centerEventHandlers}
      >
        <Popup>
          <div style={{ padding: '6px', minWidth: '140px', fontFamily: 'var(--font-sans, sans-serif)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F4C5C' }}>
              Area Search Waypoint
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Radius: {spatialCircle.radiusMeters}m
            </div>
            {onClearSpatialCircle && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  try {
                    if (centerMarkerRef.current) {
                      centerMarkerRef.current.closePopup();
                    }
                    map.closePopup();
                  } catch {
                    // ignore
                  }
                  window.setTimeout(() => {
                    onClearSpatialCircle();
                  }, 0);
                }}
                style={{
                  marginTop: '6px',
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  color: '#EF4444',
                  cursor: 'pointer',
                }}
              >
                Clear Area Filter
              </button>
            )}
          </div>
        </Popup>
        <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
          <div style={{ fontSize: '11px', fontWeight: 600 }}>
            Center Waypoint ({spatialCircle.radiusMeters}m) &bull; Drag to move
          </div>
        </Tooltip>
      </Marker>

      {/* Perimeter Draggable Handle (Draggable to resize radius) */}
      <Marker
        ref={handleMarkerRef}
        position={handlePosition}
        draggable={true}
        icon={handleIcon}
        zIndexOffset={5000}
        eventHandlers={handleEventHandlers}
      >
        <Tooltip direction="right" offset={[12, 0]} opacity={0.95}>
          <div style={{ fontSize: '11px', fontWeight: 600 }}>
            {spatialCircle.radiusMeters}m
          </div>
        </Tooltip>
      </Marker>
    </>
  );
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
    case 'bus_stop':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2l.64-2.54a6 6 0 0 0 .36-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6.46a6 6 0 0 0 .36 2L3 17h2"/><path d="M4 11h16"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`;
    case 'metro':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="15" rx="3"/><path d="M4 11h16"/><path d="M8 19l-2 3M16 19l2 3"/><circle cx="8" cy="15" r="1.5"/><circle cx="16" cy="15" r="1.5"/><path d="M9 7h6"/></svg>`;
    case 'train':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="13" rx="2"/><path d="M4 10h16"/><path d="M12 3v7"/><path d="M4 21h16"/><path d="M7 16l-3 5M17 16l3 5"/><circle cx="8" cy="13" r="1"/><circle cx="16" cy="13" r="1"/></svg>`;
    case 'tram':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M4 12h16"/><path d="M8 19l-1 3M16 19l1 3"/><path d="M12 2v4M8 2h8"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/></svg>`;
    case 'transit':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8M8 19l-3 3M16 19l3 3M8 15h.01M16 15h.01"/></svg>`;
    case 'general':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
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
  animationClass?: string;
  animationDelayMs?: number;
  readOnly?: boolean;
}

function renderTeardropPinHtml({
  categoryType,
  name = '',
  photoUrl,
  stopNumber,
  dayNumber,
  isFocused = false,
  poiPayload = '',
  animationClass = '',
  animationDelayMs,
  readOnly = false,
}: TeardropPinConfig): string {
  const meta = classifyPoiCategory(categoryType, name);
  const svg = getCategorySvg(meta.type);
  const nameSafe = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hullColor = typeof dayNumber === 'number' && dayNumber > 0 ? getDayColor(dayNumber) : null;
  const pinColor = hullColor || (isFocused ? '#1E293B' : (meta.color || '#475569'));
  const pinBorderColor = isFocused
    ? 'var(--color-accent-teal-mid, #14788D)'
    : hullColor
    ? 'rgba(255, 255, 255, 0.75)'
    : 'rgba(255, 255, 255, 0.45)';

  const innerContent = photoUrl
    ? `<img src="${photoUrl}" alt="${nameSafe}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;color:#FFFFFF;background:#1E293B;border-radius:50%;">${svg}</div>`
    : `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#FFFFFF;background:#1E293B;border-radius:50%;">${svg}</div>`;

  const stopBadge = typeof stopNumber === 'number'
    ? `<div style="position:absolute;top:-4px;right:-6px;min-width:18px;height:18px;padding:0 3px;border-radius:9px;background:${hullColor || '#0F4C5C'};color:#FFFFFF;font-family:var(--font-mono, monospace);font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;border:1.5px solid #FFFFFF;box-shadow:0 2px 4px rgba(0,0,0,0.3);z-index:3;">${stopNumber}</div>`
    : '';

  const focusGlow = isFocused
    ? `<div style="position:absolute;top:0;left:0;width:34px;height:34px;border-radius:50%;background:rgba(20, 120, 141, 0.35);animation:pinGlow 1.8s ease-in-out infinite;pointer-events:none;z-index:0;"></div>`
    : '';

  const animStyle = typeof animationDelayMs === 'number' ? `animation-delay: ${animationDelayMs}ms;` : '';
  const canDrag = !readOnly && Boolean(poiPayload);

  return `
    <div 
      ${canDrag ? `draggable="true" data-paladio-draggable-poi="${poiPayload}"` : 'draggable="false"'}
      class="${animationClass}"
      style="position:relative;width:34px;height:44px;display:flex;align-items:flex-start;justify-content:center;cursor:${canDrag ? 'grab' : 'pointer'};user-select:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.32));${animStyle}"
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
  poi?: { id?: string; name: string; category?: string; lat: number; lng: number; durationMins?: number; costEur?: number },
  photoUrl?: string,
  isFocused = false,
  animationClass?: string,
  animationDelayMs?: number,
  readOnly = false
): L.DivIcon {
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
    className: 'paladio-waypoint-icon',
    html: renderTeardropPinHtml({
      categoryType,
      name: poi?.name,
      photoUrl,
      stopNumber,
      dayNumber,
      isFocused,
      poiPayload,
      animationClass,
      animationDelayMs,
      readOnly,
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

function createHotelIcon(
  hotel?: { name: string; lat: number; lng: number },
  photoUrl?: string,
  isFocused = false,
  animationClass?: string,
  animationDelayMs?: number,
  dayNumber?: number,
  readOnly = false
): L.DivIcon {
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
      dayNumber,
      isFocused,
      poiPayload,
      animationClass,
      animationDelayMs,
      readOnly,
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

function createAirportIcon(
  airport?: { name: string; lat: number; lng: number },
  photoUrl?: string,
  isFocused = false,
  animationClass?: string,
  animationDelayMs?: number,
  dayNumber?: number,
  readOnly = false
): L.DivIcon {
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
      dayNumber,
      isFocused,
      poiPayload,
      animationClass,
      animationDelayMs,
      readOnly,
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
      animationClass: 'paladio-waypoint-pin-pop-in',
    }),
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

function createCategoryPoiIcon(
  categoryType: PoiCategoryType,
  poi?: Partial<CategoryPoiItem>,
  photoUrl?: string,
  isFocused = false,
  animationDelayMs?: number
): L.DivIcon {
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
      animationClass: 'paladio-waypoint-pin-pop-in',
      animationDelayMs,
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
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          handleInspect();
        },
      }}
    />
  );
}

function MapFocusDismissHandler({
  isFocused,
  onClearFocus,
  disabled = false,
}: {
  isFocused: boolean;
  onClearFocus?: () => void;
  disabled?: boolean;
}) {
  const isDraggingRef = useRef(false);
  const lastDragEndAtRef = useRef(0);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  useMapEvents({
    mousedown: (e) => {
      const orig = e.originalEvent as MouseEvent | undefined;
      if (orig && typeof orig.clientX === 'number' && typeof orig.clientY === 'number') {
        mouseDownPosRef.current = { x: orig.clientX, y: orig.clientY };
      } else {
        mouseDownPosRef.current = null;
      }
    },
    dragstart: () => {
      isDraggingRef.current = true;
    },
    dragend: () => {
      isDraggingRef.current = false;
      lastDragEndAtRef.current = Date.now();
    },
    click: (e) => {
      if (!isFocused || disabled || !onClearFocus) return;
      if (isDraggingRef.current) return;
      if (Date.now() - lastDragEndAtRef.current < 250) return;

      const orig = e.originalEvent as MouseEvent | undefined;
      const target = orig?.target as HTMLElement | null;
      if (target && target.closest('.leaflet-control-container')) {
        mouseDownPosRef.current = null;
        return;
      }

      if (
        mouseDownPosRef.current &&
        orig &&
        typeof orig.clientX === 'number' &&
        typeof orig.clientY === 'number'
      ) {
        const dx = orig.clientX - mouseDownPosRef.current.x;
        const dy = orig.clientY - mouseDownPosRef.current.y;
        if (Math.hypot(dx, dy) > 4) {
          mouseDownPosRef.current = null;
          return;
        }
      }

      mouseDownPosRef.current = null;
      onClearFocus();
    },
  });

  return null;
}

// Controller for bounds fitting and pan-to-focus
function MapViewportController({
  activePoints,
  focusedPlace,
  leftPadding = 60,
  readOnly = false,
}: {
  activePoints: LatLngPoint[];
  focusedPlace?: FocusedWaypointPlace | null;
  leftPadding?: number;
  readOnly?: boolean;
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
      lastBoundsKeyRef.current = null;
      if (focusKey !== lastFocusedKeyRef.current) {
        lastFocusedKeyRef.current = focusKey;
        if (!isDraggingRef.current) {
          map.flyTo([focusedPlace.lat, focusedPlace.lng], 16, { animate: true, duration: 0.8 });
        }
      }
      return;
    }
    lastFocusedKeyRef.current = null;
    if (activePoints.length > 0 && !isDraggingRef.current) {
      const boundsKey = `${activePoints.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')}#pad:${leftPadding}`;
      if (boundsKey !== lastBoundsKeyRef.current) {
        lastBoundsKeyRef.current = boundsKey;
        const bounds = L.latLngBounds(activePoints.map((p) => [p.lat, p.lng]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            paddingTopLeft: [leftPadding, 80],
            paddingBottomRight: [60, 60],
            maxZoom: 15,
            animate: true,
          });
        }
      }
    }
  }, [map, activePoints, focusedPlace, leftPadding]);

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

  // Allow dragging any POI marker directly from the map into route day slots
  useEffect(() => {
    if (!map || readOnly) return;
    const handleDragStart = (e: DragEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-paladio-draggable-poi]');
      if (!target) return;
      const raw = target.getAttribute('data-paladio-draggable-poi');
      if (!raw) return;
      try {
        let poiData;
        try {
          poiData = JSON.parse(raw);
        } catch {
          poiData = JSON.parse(decodeURIComponent(raw));
        }
        startCustomDragPreview(e, {
          name: poiData.name,
          category: poiData.category,
          duration_mins: poiData.duration_mins,
          cost_eur: poiData.cost_eur,
        });
        if (e.dataTransfer) {
          const payload = { source: 'map', poi: poiData };
          const serialized = JSON.stringify(payload);
          if (typeof window !== 'undefined') {
            (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = payload;
            (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = payload;
          }
          e.dataTransfer.setData('application/paladio-poi', serialized);
          e.dataTransfer.setData('text/plain', serialized);
          e.dataTransfer.effectAllowed = 'copyMove';
        }
        window.dispatchEvent(new CustomEvent('paladio:switch-to-route'));
      } catch (err) {
        console.warn('Failed to parse draggable poi payload from map', err);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-paladio-draggable-poi]');
      if (target && map) {
        map.dragging.disable();
      }
    };

    const handleMouseUp = () => {
      if (map && !map.dragging.enabled()) {
        map.dragging.enable();
      }
      cleanupCustomDragPreview();
      window.setTimeout(() => {
        if (typeof window !== 'undefined') {
          (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = null;
          (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = null;
          window.dispatchEvent(new CustomEvent('paladio:drag-ended'));
        }
      }, 50);
    };

    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleMouseUp, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleMouseUp, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [map, readOnly]);

  return null;
}

export interface StationBboxItem {
  id: string;
  name: string;
  original_name?: string | null;
  lat: number;
  lon: number;
  wheelchair_boarding: number;
  stop_count: number;
  lines: Array<{
    line_id: string;
    short_name?: string | null;
    mode: string;
    color?: string | null;
    text_color?: string | null;
  }>;
}

function MapBboxSync({
  enabled,
  city,
  onStationsLoaded,
}: {
  enabled: boolean;
  city: string;
  onStationsLoaded: (stations: StationBboxItem[]) => void;
}) {
  const map = useMap();
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStationsForBounds = useCallback(() => {
    if (!enabled || !city || !map) return;
    const b = map.getBounds();
    const minLat = b.getSouth();
    const minLon = b.getWest();
    const maxLat = b.getNorth();
    const maxLon = b.getEast();

    apiFetch<StationBboxItem[]>(
      `/transit/${encodeURIComponent(city.toLowerCase())}/map-stations?bbox=${minLat.toFixed(5)},${minLon.toFixed(5)},${maxLat.toFixed(5)},${maxLon.toFixed(5)}&limit=150`
    )
      .then((data) => {
        if (Array.isArray(data)) {
          onStationsLoaded(data);
        }
      })
      .catch((err) => {
        console.warn('Could not load map stations for bbox:', err);
      });
  }, [enabled, city, map, onStationsLoaded]);

  useEffect(() => {
    if (!enabled || !city || !map) return;
    fetchStationsForBounds();

    const onMoveEnd = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        fetchStationsForBounds();
      }, 350);
    };

    map.on('moveend', onMoveEnd);
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      map.off('moveend', onMoveEnd);
    };
  }, [enabled, city, map, fetchStationsForBounds]);

  return null;
}

export default function TripMapView({
  days = [],
  hotel,
  airport,
  activeDay,
  onDayChange,
  focusedPlace,
  onClearFocus,
  categoryFilter,
  onCategoryFilterChange,
  transitMode = 'simple',
  categoryPois,
  onSelectCategoryPoi,
  onInspectPoi,
  isSidebarOpen = true,
  sidebarTab = 'route',
  destinationCity = '',
  activeTransitLine,
  onClearTransitLine,
  activeMapPickField,
  onCancelMapPick,
  directionsRoute,
  spatialCircle = null,
  onSpatialCircleChange,
  isDroppingWaypoint = false,
  onCancelDropWaypoint,
  onClearSpatialCircle,
  readOnly = false,
}: TripMapViewProps) {
  const [internalDirectionsRoute, setInternalDirectionsRoute] = useState<{
    activeLeg: TransitLeg;
    primary_leg?: TransitLeg;
    alternative_leg?: TransitLeg | null;
    origin: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
  } | null>(null);

  const activeDirectionsRoute =
    sidebarTab === 'transit' ? directionsRoute || internalDirectionsRoute : null;

  useEffect(() => {
    const handleShowDirections = (e: Event) => {
      const customEvent = e as CustomEvent<{
        activeLeg: TransitLeg;
        primary_leg?: TransitLeg;
        alternative_leg?: TransitLeg | null;
        origin: { name: string; lat: number; lng: number };
        destination: { name: string; lat: number; lng: number };
      }>;
      if (customEvent.detail) {
        setInternalDirectionsRoute(customEvent.detail);
      }
    };
    const handleClearDirections = () => {
      setInternalDirectionsRoute(null);
    };

    window.addEventListener('paladio:show-directions-route', handleShowDirections);
    window.addEventListener('paladio:clear-directions-route', handleClearDirections);
    return () => {
      window.removeEventListener('paladio:show-directions-route', handleShowDirections);
      window.removeEventListener('paladio:clear-directions-route', handleClearDirections);
    };
  }, []);

  const handleTransitLineClick = useCallback(
    async (
      lineName: string,
      color?: string,
      positions?: [number, number][],
      stationName?: string | null
    ) => {
      if (!lineName) return;
      const cleanLine = lineName.replace(/^LINE\s+/i, '').replace(/^Line\s+/i, '').trim();
      const targetCity = destinationCity || '';
      if (targetCity) {
        try {
          const lineDetail = await apiFetch<any>(
            `/transit/${encodeURIComponent(targetCity)}/lines/${encodeURIComponent(cleanLine)}`
          );
          if (lineDetail && (lineDetail.stops?.length > 0 || lineDetail.patterns?.length > 0)) {
            const primary = lineDetail.patterns?.[0];
            const patternStops = primary?.stops || lineDetail.stops || [];
            const polyline: [number, number][] =
              primary?.geometry?.coordinates && primary.geometry.coordinates.length > 0
                ? primary.geometry.coordinates
                : primary?.coordinates && primary.coordinates.length > 0
                ? primary.coordinates
                : patternStops.map((s: any) => [s.lat, s.lon] as [number, number]);

            const activeLineData = {
              line: lineDetail.short_name || lineDetail.id || cleanLine,
              color: color || lineDetail.color || '#007AFF',
              polyline,
              stations: patternStops.map((s: any) => ({
                id: s.station_id || s.id || `gtfs:${targetCity}:${s.name}`,
                name: s.name,
                lat: s.lat,
                lng: s.lon,
              })),
            };
            window.dispatchEvent(
              new CustomEvent('paladio:show-transit-line', { detail: activeLineData })
            );
            return;
          }
        } catch (e) {
          console.warn('Could not fetch line patterns in map view:', e);
        }
      }

      // Fallback: Dispatch using segment / route geometry and stations
      const routeSteps = activeDirectionsRoute?.primary_leg?.steps || [];
      const matchingSteps = routeSteps.filter(
        (s) => s.transit_line === lineName || s.transit_line === cleanLine
      );
      const lineCoords =
        matchingSteps[0]?.geometry && matchingSteps[0].geometry.length > 0
          ? matchingSteps[0].geometry
          : (positions && positions.length > 0 ? positions : []);

      const lineStations: Array<{ id: string; name: string; lat: number; lng: number }> = [];
      const seenNames = new Set<string>();

      if (matchingSteps.length > 0) {
        for (let i = 0; i < routeSteps.length; i++) {
          const s = routeSteps[i];
          if (s.transit_line !== lineName && s.transit_line !== cleanLine) continue;

          if (s.station_name && !seenNames.has(s.station_name)) {
            seenNames.add(s.station_name);
            lineStations.push({
              id: `gtfs:${targetCity}:${s.station_name}`,
              name: s.station_name,
              lat: s.geometry?.[0]?.[0] || lineCoords[0]?.[0] || 0,
              lng: s.geometry?.[0]?.[1] || lineCoords[0]?.[1] || 0,
            });
          }

          if (s.intermediate_stop_details && s.intermediate_stop_details.length > 0) {
            for (const isd of s.intermediate_stop_details) {
              if (isd.name && !seenNames.has(isd.name)) {
                seenNames.add(isd.name);
                lineStations.push({
                  id: `gtfs:${targetCity}:${isd.name}`,
                  name: isd.name,
                  lat: typeof isd.lat === 'number' ? isd.lat : 0,
                  lng: typeof isd.lon === 'number' ? isd.lon : 0,
                });
              }
            }
          }

          const nextStep = routeSteps[i + 1];
          if (nextStep && nextStep.station_name && !seenNames.has(nextStep.station_name)) {
            seenNames.add(nextStep.station_name);
            lineStations.push({
              id: `gtfs:${targetCity}:${nextStep.station_name}`,
              name: nextStep.station_name,
              lat: nextStep.geometry?.[0]?.[0] || lineCoords[lineCoords.length - 1]?.[0] || 0,
              lng: nextStep.geometry?.[0]?.[1] || lineCoords[lineCoords.length - 1]?.[1] || 0,
            });
          }
        }
      }

      if (lineStations.length === 0 && stationName && positions?.[0]) {
        lineStations.push({
          id: `gtfs:${targetCity}:${stationName}`,
          name: stationName,
          lat: positions[0][0],
          lng: positions[0][1],
        });
      }

      const activeLineData = {
        line: cleanLine,
        color: color || matchingSteps[0]?.route_color || '#007AFF',
        polyline: lineCoords,
        stations: lineStations,
      };
      window.dispatchEvent(
        new CustomEvent('paladio:show-transit-line', { detail: activeLineData })
      );
    },
    [destinationCity, activeDirectionsRoute]
  );

  const effectiveLeftPadding = useMemo(() => {
    if (!isSidebarOpen) return 60;
    const isClient = typeof window !== 'undefined';
    const winWidth = isClient ? window.innerWidth : 1280;
    if (sidebarTab === 'search') {
      return Math.min(Math.round(winWidth * 0.48), 560);
    }
    return Math.min(Math.round(winWidth * 0.36), 420);
  }, [isSidebarOpen, sidebarTab]);

  const [internalCatFilter, setInternalCatFilter] = useState<PoiCategoryType | null>(null);
  const activeCategory = categoryFilter !== undefined ? categoryFilter : internalCatFilter;
  const [mapStations, setMapStations] = useState<StationBboxItem[]>([]);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [displayedHoveredDay, setDisplayedHoveredDay] = useState<number | null>(null);
  const [isHoverExiting, setIsHoverExiting] = useState(false);
  const hoverEndTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exitCleanupTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleDayHoverStart = useCallback((dayNumber: number) => {
    if (activeDay !== 'all') return;
    if (hoverEndTimerRef.current) {
      clearTimeout(hoverEndTimerRef.current);
      hoverEndTimerRef.current = null;
    }
    if (exitCleanupTimerRef.current) {
      clearTimeout(exitCleanupTimerRef.current);
      exitCleanupTimerRef.current = null;
    }
    setHoveredDay(dayNumber);
    setDisplayedHoveredDay(dayNumber);
    setIsHoverExiting(false);
  }, [activeDay]);

  const handleDayHoverEnd = useCallback(() => {
    if (activeDay !== 'all') return;
    if (hoverEndTimerRef.current) clearTimeout(hoverEndTimerRef.current);
    hoverEndTimerRef.current = setTimeout(() => {
      setHoveredDay(null);
      setIsHoverExiting(true);
      if (exitCleanupTimerRef.current) clearTimeout(exitCleanupTimerRef.current);
      exitCleanupTimerRef.current = setTimeout(() => {
        setDisplayedHoveredDay(null);
        setIsHoverExiting(false);
      }, 150);
    }, 300);
  }, [activeDay]);

  useEffect(() => {
    if (activeDay !== 'all') {
      if (hoverEndTimerRef.current) {
        clearTimeout(hoverEndTimerRef.current);
        hoverEndTimerRef.current = null;
      }
      if (exitCleanupTimerRef.current) {
        clearTimeout(exitCleanupTimerRef.current);
        exitCleanupTimerRef.current = null;
      }
    }
  }, [activeDay]);

  useEffect(() => {
    return () => {
      if (hoverEndTimerRef.current) clearTimeout(hoverEndTimerRef.current);
      if (exitCleanupTimerRef.current) clearTimeout(exitCleanupTimerRef.current);
    };
  }, []);

  const effectiveHoveredDay = activeDay === 'all' ? hoveredDay : null;
  const effectiveDisplayedHoveredDay = activeDay === 'all' ? displayedHoveredDay : null;

  const { getPhoto } = usePoiPhotos();

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
                  color: style.color,
                });
              }

              if (step.intermediate_stop_details && step.intermediate_stop_details.length > 0) {
                step.intermediate_stop_details.forEach((isd, isdIdx) => {
                  if (typeof isd.lat === 'number' && typeof isd.lon === 'number') {
                    nodes.push({
                      key: `d${dayGroup.dayNumber}-leg${k}-st${sIdx}-isd${isdIdx}`,
                      position: [isd.lat, isd.lon],
                      stationName: isd.name,
                      line: step.transit_line,
                      instruction: `Intermediate Stop on ${step.transit_line || 'transit line'}`,
                      color: style.color,
                    });
                  }
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
    if (activeTransitLine && activeTransitLine.stations.length > 0) {
      return activeTransitLine.stations.map((s) => ({ lat: s.lat, lng: s.lng }));
    }

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

    // When searching on a specific day, stay anchored strictly to that day's convex hull.
    // Only adjust bounds to categoryPois when viewing all days.
    if (activeCategory && activeDay === 'all') {
      const matchingPois = (categoryPois || []).filter((p) => {
        const catType = classifyPoiCategory(p.category, p.name).type;
        return isCategoryMatch(activeCategory, catType);
      });
      if (matchingPois.length > 0) {
        return matchingPois.map((p) => ({ lat: p.lat, lng: p.lng }));
      }
      const filtered = points.filter((p) => {
        const poiItem = p as Partial<MapPoi>;
        const catType = classifyPoiCategory(poiItem.category, poiItem.name).type;
        return isCategoryMatch(activeCategory, catType);
      });
      if (filtered.length > 0) return filtered;
    }

    return points;
  }, [activeDay, days, activeDayData, dayClusters, hotel, activeCategory, categoryPois, activeTransitLine]);

  // Centroid fallback
  const centerPosition: [number, number] = useMemo(() => {
    if (activeBoundsPoints.length > 0) {
      const c = computeCentroid(activeBoundsPoints);
      return [c.lat, c.lng];
    }
    if (hotel) return [hotel.lat, hotel.lng];
    return [41.1579, -8.6291]; // Default fallback
  }, [activeBoundsPoints, hotel]);

  // Active day route geometry (straight lines connecting POIs + dashed commute legs in simple view)
  const activeDayRouteData = useMemo(() => {
    if (!activeDayData || !activeDayData.pois || activeDayData.pois.length < 2) {
      return { coreStraight: [], commuteStartLine: [], commuteEndLine: [] };
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

    const commuteStartLine: [number, number][] =
      startIdx > 0
        ? [
            [pois[0].lat, pois[0].lng],
            [pois[startIdx].lat, pois[startIdx].lng],
          ]
        : [];

    const commuteEndLine: [number, number][] =
      endIdx < pois.length
        ? [
            [pois[endIdx - 1].lat, pois[endIdx - 1].lng],
            [pois[pois.length - 1].lat, pois[pois.length - 1].lng],
          ]
        : [];

    const coreSlice = pois.slice(startIdx, endIdx);
    const coreStraight: [number, number][] = coreSlice.map((p) => [p.lat, p.lng]);

    return { coreStraight, commuteStartLine, commuteEndLine };
  }, [activeDayData]);

  const allDaysHoveredPolyline = useMemo(() => {
    if (activeDay !== 'all' || effectiveDisplayedHoveredDay === null) return null;
    const targetDay = days.find((d) => d.dayNumber === effectiveDisplayedHoveredDay);
    if (!targetDay) return null;

    const sightseeingPois = targetDay.pois.filter((p) => !isTransitAnchor(p));
    const targetPois = sightseeingPois.length >= 2 ? sightseeingPois : targetDay.pois;
    const rawCoords: [number, number][] = targetPois.map((p) => [p.lat, p.lng]);
    if (rawCoords.length < 2) return null;

    return {
      dayNumber: targetDay.dayNumber,
      positions: rawCoords,
    };
  }, [activeDay, effectiveDisplayedHoveredDay, days]);

  const isFocusedAlreadyRendered = useMemo(() => {
    if (!focusedPlace) return false;
    if (activeDay !== 'all' && hotel && isPlaceMatch(hotel, focusedPlace)) return true;
    if (activeDay !== 'all' && airport && isPlaceMatch(airport, focusedPlace)) return true;
    if (activeDay !== 'all' && activeDayData?.pois?.some((p) => isPlaceMatch(p, focusedPlace))) return true;
    if (
      activeDay === 'all' &&
      effectiveDisplayedHoveredDay !== null &&
      days.find((d) => d.dayNumber === effectiveDisplayedHoveredDay)?.pois?.some((p) => isPlaceMatch(p, focusedPlace))
    ) {
      return true;
    }
    if (activeCategory && categoryPois?.some((p) => isPlaceMatch(p, focusedPlace))) return true;
    return false;
  }, [focusedPlace, hotel, airport, activeDay, activeDayData, effectiveDisplayedHoveredDay, days, activeCategory, categoryPois]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Tactical Map Picking Active Banner */}
      {activeMapPickField && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(15, 76, 92, 0.95)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            borderRadius: '9999px',
            padding: '8px 18px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            pointerEvents: 'auto',
          }}
        >
          <CrosshairIcon size={14} color="#FFFFFF" />
          <span>Click on the map to set {activeMapPickField === 'origin' ? 'Origin (A)' : 'Destination (B)'}</span>
          <button
            type="button"
            onClick={onCancelMapPick}
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              color: '#FFFFFF',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            <CloseIcon size={10} />
          </button>
        </div>
      )}

      {/* Tactical Waypoint Dropping Active Banner */}
      {isDroppingWaypoint && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(15, 76, 92, 0.95)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            borderRadius: '9999px',
            padding: '8px 18px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            pointerEvents: 'auto',
          }}
        >
          <RadarIcon size={14} color="#FFFFFF" />
          <span>Click anywhere on the map to place search waypoint center (Esc to cancel)</span>
          <button
            type="button"
            onClick={onCancelDropWaypoint}
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              color: '#FFFFFF',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
            title="Cancel (Esc)"
          >
            <CloseIcon size={10} />
          </button>
        </div>
      )}

      {/* Map Canvas */}
      <MapContainer
        center={centerPosition}
        zoom={13}
        minZoom={2}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        style={{ height: '100%', width: '100%', cursor: (activeMapPickField || isDroppingWaypoint) ? 'crosshair' : undefined }}
        attributionControl={false}
      >
        <ZoomControl position="bottomright" />
        <DirectionsMapEventsHandler
          activeMapPickField={activeMapPickField}
          onCancelMapPick={onCancelMapPick}
          directionsRoute={activeDirectionsRoute}
        />
        <WaypointMapEventsHandler
          isDroppingWaypoint={isDroppingWaypoint}
          onCancelDropWaypoint={onCancelDropWaypoint}
          onSetSpatialCircle={onSpatialCircleChange}
        />
        <MapViewportController
          activePoints={activeBoundsPoints}
          focusedPlace={focusedPlace}
          leftPadding={effectiveLeftPadding}
          readOnly={readOnly}
        />
        <MapFocusDismissHandler
          isFocused={Boolean(focusedPlace)}
          onClearFocus={onClearFocus}
          disabled={Boolean(activeMapPickField || isDroppingWaypoint)}
        />
        <MapBboxSync
          enabled={sidebarTab === 'transit'}
          city={destinationCity}
          onStationsLoaded={setMapStations}
        />

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
          const isHovered = effectiveHoveredDay === cluster.dayNumber;

          // In single-day view, only render the active day's territory to prevent visual clutter
          if (activeDay !== 'all' && !isActive) return null;

          const dayColor = getDayColor(cluster.dayNumber);
          const dayGroup = days.find((d) => d.dayNumber === cluster.dayNumber);

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
                      fillOpacity: effectiveHoveredDay !== null ? 0.03 : 0.08,
                      color: '#94A3B8',
                      weight: 1.5,
                      dashArray: '4, 4',
                    }
              }
              eventHandlers={{
                click: (e) => {
                  if (activeDay !== 'all' && activeDay === cluster.dayNumber) {
                    return;
                  }
                  L.DomEvent.stopPropagation(e);
                  onDayChange(cluster.dayNumber);
                },
                mouseover: () => {
                  if (activeDay === 'all') handleDayHoverStart(cluster.dayNumber);
                },
                mousemove: () => {
                  if (activeDay === 'all') handleDayHoverStart(cluster.dayNumber);
                },
                mouseout: () => {
                  if (activeDay === 'all') handleDayHoverEnd();
                },
              }}
            >
              {activeDay === 'all' && (
                <Tooltip
                  sticky
                  direction="top"
                  offset={[0, -14]}
                  opacity={1}
                  className="paladio-polygon-day-tooltip"
                >
                  <div
                    style={{
                      background: 'var(--color-surface-card, #FFFFFF)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: `1.5px solid ${dayColor}`,
                      borderRadius: '8px',
                      padding: '5px 12px',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.14)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: dayColor,
                        boxShadow: `0 0 6px ${dayColor}`,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: dayColor,
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '13px',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      DAY {cluster.dayNumber}
                    </span>
                    {dayGroup?.theme && (
                      <span
                        style={{
                          color: 'var(--color-text-secondary, #64748B)',
                          fontFamily: 'var(--font-sans, system-ui)',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        · {dayGroup.theme}
                      </span>
                    )}
                  </div>
                </Tooltip>
              )}
            </Polygon>
          );
        })}

        {/* 3. Route Polyline: Simple vs Detailed Transit */}
        {transitMode === 'detailed' ? (
          <>
            {detailedSegments.map((seg) => (
              <Polyline
                key={`seg-d${activeDay}-${seg.key}-${seg.positions.map((p) => `${p[0]},${p[1]}`).join(';')}`}
                positions={seg.positions}
                pathOptions={{
                  color: seg.color,
                  weight: seg.weight,
                  opacity: 0.9,
                  dashArray: seg.isDashed ? '6, 6' : undefined,
                  className: `${seg.transitLine ? 'cursor-pointer ' : ''}paladio-polyline-fade-in`,
                }}
                eventHandlers={
                  seg.transitLine
                    ? {
                        click: () => {
                          handleTransitLineClick(
                            seg.transitLine!,
                            seg.color,
                            seg.positions,
                            seg.stationName
                          );
                        },
                      }
                    : undefined
                }
              >
                <Tooltip sticky direction="top" opacity={0.95}>
                  <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600 }}>
                    {seg.transitLine ? `[LINE ${seg.transitLine}] ` : ''}
                    {seg.instruction}
                    {typeof seg.durationMins === 'number' && seg.durationMins > 0 ? ` · ${seg.durationMins}m` : ''}
                    {seg.transitLine ? (
                      <span style={{ display: 'block', fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                        Click to view line & schedule
                      </span>
                    ) : null}
                  </span>
                </Tooltip>
                <Popup>
                  <div style={{ minWidth: '160px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
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
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {seg.transitLine && (
                        <button
                          type="button"
                          onClick={() =>
                            handleTransitLineClick(
                              seg.transitLine!,
                              seg.color,
                              seg.positions,
                              seg.stationName
                            )
                          }
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #CBD5E1',
                            background: '#F8FAFC',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#0F172A',
                          }}
                        >
                          Highlight Line
                        </button>
                      )}
                      {seg.stationName && (
                        <button
                          type="button"
                          onClick={() => {
                            const stableId = `gtfs:${destinationCity}:${seg.stationName}`;
                            onInspectPoi?.(stableId, {
                              id: stableId,
                              name: seg.stationName!,
                              category: 'transit',
                              city: destinationCity,
                              lat: seg.positions[0]?.[0] || 0,
                              lng: seg.positions[0]?.[1] || 0,
                            });
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #CBD5E1',
                            background: '#F8FAFC',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#0F172A',
                          }}
                        >
                          Inspect Station
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            ))}

            {/* Station nodes for transfers and boardings */}
            {stationNodes.map((node) => (
              <CircleMarker
                key={`node-${node.key}-${node.position[0]},${node.position[1]}`}
                center={node.position}
                radius={5}
                pathOptions={{
                  color: node.color || '#0F4C5C',
                  fillColor: '#FFFFFF',
                  fillOpacity: 1,
                  weight: 2.5,
                  className: 'cursor-pointer',
                }}
                eventHandlers={{
                  click: () => {
                    const stableId = `gtfs:${destinationCity}:${node.stationName}`;
                    onInspectPoi?.(stableId, {
                      id: stableId,
                      name: node.stationName,
                      category: 'transit',
                      city: destinationCity,
                      lat: node.position[0],
                      lng: node.position[1],
                    });
                  },
                }}
              >
                <Tooltip direction="top">
                  <span className="font-mono" style={{ fontSize: '10px', fontWeight: 600 }}>
                    {node.line ? `[Line ${node.line}] ` : ''}Station: {node.stationName}
                    <br />
                    <span style={{ fontSize: '9px', color: '#64748B' }}>Click to inspect departures & details</span>
                  </span>
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        ) : activeDay !== 'all' ? (
          <>
            {/* Core sightseeing route (straight line segments) */}
            {activeDayRouteData.coreStraight.length > 1 && (
              <Polyline
                key={`active-core-d${activeDay}`}
                positions={activeDayRouteData.coreStraight}
                pathOptions={{
                  color: getDayColor(activeDay as number),
                  weight: 3.5,
                  opacity: 0.95,
                  className: 'paladio-polyline-fade-in',
                }}
              />
            )}
            {/* Commute start from Hotel/Airport (straight dashed line) */}
            {activeDayRouteData.commuteStartLine.length > 1 && (
              <Polyline
                key={`active-start-d${activeDay}`}
                positions={activeDayRouteData.commuteStartLine}
                pathOptions={{
                  color: getDayColor(activeDay as number),
                  weight: 2,
                  opacity: 0.65,
                  dashArray: '4, 6',
                  className: 'paladio-polyline-fade-in',
                }}
              />
            )}
            {/* Commute return to Hotel (straight dashed line) */}
            {activeDayRouteData.commuteEndLine.length > 1 && (
              <Polyline
                key={`active-end-d${activeDay}`}
                positions={activeDayRouteData.commuteEndLine}
                pathOptions={{
                  color: getDayColor(activeDay as number),
                  weight: 2,
                  opacity: 0.65,
                  dashArray: '4, 6',
                  className: 'paladio-polyline-fade-in',
                }}
              />
            )}
          </>
        ) : allDaysHoveredPolyline ? (
          <Polyline
            key={`all-hover-poly-d${allDaysHoveredPolyline.dayNumber}-${isHoverExiting ? 'exit' : 'enter'}`}
            positions={allDaysHoveredPolyline.positions}
            pathOptions={{
              color: getDayColor(allDaysHoveredPolyline.dayNumber),
              weight: 3.5,
              opacity: isHoverExiting ? 0 : 0.95,
              className: isHoverExiting ? 'paladio-polyline-fade-out' : 'paladio-polyline-fade-in',
            }}
            eventHandlers={{
              mouseover: () => handleDayHoverStart(allDaysHoveredPolyline.dayNumber),
              mousemove: () => handleDayHoverStart(allDaysHoveredPolyline.dayNumber),
              mouseout: () => handleDayHoverEnd(),
              click: () => onDayChange(allDaysHoveredPolyline.dayNumber),
            }}
          >
            {activeDay === 'all' && (() => {
              const polyDayColor = getDayColor(allDaysHoveredPolyline.dayNumber);
              const polyDayGroup = days.find((d) => d.dayNumber === allDaysHoveredPolyline.dayNumber);
              return (
                <Tooltip
                  sticky
                  direction="top"
                  offset={[0, -14]}
                  opacity={1}
                  className="paladio-polygon-day-tooltip"
                >
                  <div
                    style={{
                      background: 'var(--color-surface-card, #FFFFFF)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: `1.5px solid ${polyDayColor}`,
                      borderRadius: '8px',
                      padding: '5px 12px',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.14)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: polyDayColor,
                        boxShadow: `0 0 6px ${polyDayColor}`,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: polyDayColor,
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '13px',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      DAY {allDaysHoveredPolyline.dayNumber}
                    </span>
                    {polyDayGroup?.theme && (
                      <span
                        style={{
                          color: 'var(--color-text-secondary, #64748B)',
                          fontFamily: 'var(--font-sans, system-ui)',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        · {polyDayGroup.theme}
                      </span>
                    )}
                  </div>
                </Tooltip>
              );
            })()}
          </Polyline>
        ) : null}

        {/* 4. Hotel Base Camp Anchor Marker (Only in single day view, if not already in day waypoints) */}
        {activeDay !== 'all' && hotel && typeof hotel.lat === 'number' && !isNaN(hotel.lat) && !activeDayData?.pois?.some((p) => isPlaceMatch(p, hotel)) && (() => {
          const isHotelFocused = isPlaceMatch(hotel, focusedPlace);
          const hotelId = (hotel as { id?: string }).id || hotel.name;
          return (
            <Marker
              key={`hotel-anchor-d${activeDay}-${hotel.lat}-${hotel.lng}`}
              position={[hotel.lat, hotel.lng]}
              icon={createHotelIcon(hotel, getPhoto(hotel.name), isHotelFocused, 'paladio-waypoint-pin-pop-in', 0, typeof activeDay === 'number' ? activeDay : undefined, readOnly)}
              zIndexOffset={isHotelFocused ? 2500 : 600}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (activeMapPickField) {
                    window.dispatchEvent(
                      new CustomEvent('paladio:map-picked-location', {
                        detail: {
                          field: activeMapPickField,
                          name: hotel.name,
                          lat: hotel.lat,
                          lng: hotel.lng,
                          address: (hotel as { address?: string }).address || hotel.name,
                        },
                      })
                    );
                    return;
                  }
                  onInspectPoi?.(hotelId, {
                    id: (hotel as { id?: string }).id,
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

        {/* 5. Airport Transit Gate Anchor Marker (Only in single day view, if not already in day waypoints) */}
        {activeDay !== 'all' && airport && typeof airport.lat === 'number' && !isNaN(airport.lat) && !activeDayData?.pois?.some((p) => isPlaceMatch(p, airport)) && (() => {
          const isAirportFocused = isPlaceMatch(airport, focusedPlace);
          const airportId = (airport as { id?: string }).id || airport.name;
          return (
            <Marker
              key={`airport-anchor-d${activeDay}-${airport.lat}-${airport.lng}`}
              position={[airport.lat, airport.lng]}
              icon={createAirportIcon(airport, getPhoto(airport.name), isAirportFocused, 'paladio-waypoint-pin-pop-in', 0, typeof activeDay === 'number' ? activeDay : undefined, readOnly)}
              zIndexOffset={isAirportFocused ? 2500 : 600}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (activeMapPickField) {
                    window.dispatchEvent(
                      new CustomEvent('paladio:map-picked-location', {
                        detail: {
                          field: activeMapPickField,
                          name: airport.name,
                          lat: airport.lat,
                          lng: airport.lng,
                          address: airport.name,
                        },
                      })
                    );
                    return;
                  }
                  onInspectPoi?.(airportId, {
                    id: (airport as { id?: string }).id,
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

        {/* 6. Waypoint Markers (Rendered for active day, or only for hovered polygon in ALL DAYS mode) */}
        {(() => {
          const isAllDays = activeDay === 'all';
          const daysToRender = isAllDays
            ? (effectiveDisplayedHoveredDay !== null ? days.filter((d) => d.dayNumber === effectiveDisplayedHoveredDay) : [])
            : days.filter((d) => d.dayNumber === activeDay);
          if (!daysToRender || daysToRender.length === 0) return null;

          return daysToRender.map((dayData) => {
            if (!dayData || !dayData.pois || dayData.pois.length === 0) return null;

            const isCurrentDayHovered = isAllDays && effectiveHoveredDay === dayData.dayNumber;
            const animationClass = isAllDays && isHoverExiting ? 'paladio-waypoint-pin-pop-out' : 'paladio-waypoint-pin-pop-in';

            let stopCounter = 0;
            return dayData.pois.map((poi, idx) => {
              const categoryType = classifyPoiCategory(poi.category, poi.name).type;
              const isHotel = categoryType === 'hotel' || poi.name.toLowerCase().includes('hotel');
              const isAirport =
                categoryType === 'airport' || categoryType === 'flight' || poi.name.toLowerCase().includes('airport');

              stopCounter++;

              if (activeCategory && !isCategoryMatch(activeCategory, categoryType)) {
                return null;
              }

              const isPoiFocused = isPlaceMatch(poi, focusedPlace);
              const photoUrl = getPhoto(poi.id || poi.name);
              const animDelay = Math.min(idx * 16, 160);

              const markerIcon = isHotel
                ? createHotelIcon(
                    { name: poi.name, lat: poi.lat, lng: poi.lng },
                    photoUrl,
                    isPoiFocused,
                    animationClass,
                    animDelay,
                    dayData.dayNumber,
                    readOnly
                  )
                : isAirport
                ? createAirportIcon(
                    { name: poi.name, lat: poi.lat, lng: poi.lng },
                    photoUrl,
                    isPoiFocused,
                    animationClass,
                    animDelay,
                    dayData.dayNumber,
                    readOnly
                  )
                : createWaypointIcon(
                    categoryType,
                    stopCounter,
                    dayData.dayNumber,
                    poi,
                    photoUrl,
                    isPoiFocused,
                    animationClass,
                    animDelay,
                    readOnly
                  );

              const poiId = poi.id || poi.name;

              return (
                <Marker
                  key={`marker-active-${activeDay}-d${dayData.dayNumber}-${poi.name}-${poi.lat}-${poi.lng}-${stopCounter}-${idx}`}
                  position={[poi.lat, poi.lng]}
                  icon={markerIcon}
                  zIndexOffset={isPoiFocused ? 2500 : isCurrentDayHovered ? 800 : 500}
                  eventHandlers={{
                    mouseover: () => {
                      if (isAllDays) {
                        handleDayHoverStart(dayData.dayNumber);
                      }
                    },
                    mousemove: () => {
                      if (isAllDays) {
                        handleDayHoverStart(dayData.dayNumber);
                      }
                    },
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      if (activeMapPickField) {
                        window.dispatchEvent(
                          new CustomEvent('paladio:map-picked-location', {
                            detail: {
                              field: activeMapPickField,
                              name: poi.name,
                              lat: poi.lat,
                              lng: poi.lng,
                              address: (poi as { address?: string }).address || poi.name,
                            },
                          })
                        );
                        return;
                      }
                      onInspectPoi?.(poiId, {
                        id: poi.id,
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
          });
        })()}

        {/* 7. Category & Waypoint Area Filter POI Markers */}
        {categoryPois && categoryPois.length > 0 && (
          categoryPois
            .filter((poi) => {
              if (!activeCategory || (activeCategory as string) === 'all') return true;
              const catType = classifyPoiCategory(poi.category, poi.name).type;
              return isCategoryMatch(activeCategory, catType);
            })
            .map((poi, idx) => {
              const catType = classifyPoiCategory(poi.category, poi.name).type;
              const isCatPoiFocused = isPlaceMatch(poi, focusedPlace);
              const photoUrl = poi.photo_url || getPhoto(poi.id) || getPhoto(poi.name);
              return (
                <Marker
                  key={`cat-poi-${activeCategory || 'all'}-${poi.id || idx}-${poi.lat}-${poi.lng}`}
                  position={[poi.lat, poi.lng]}
                  icon={createCategoryPoiIcon(catType, poi, photoUrl, isCatPoiFocused, Math.min(idx * 16, 180))}
                  zIndexOffset={isCatPoiFocused ? 2500 : 400}
                  eventHandlers={{
                    click: (e) => {
                      if (e && (e as { originalEvent?: Event }).originalEvent) {
                        L.DomEvent.stopPropagation(e);
                      }
                      if (activeMapPickField) {
                        window.dispatchEvent(
                          new CustomEvent('paladio:map-picked-location', {
                            detail: {
                              field: activeMapPickField,
                              name: poi.name,
                              lat: poi.lat,
                              lng: poi.lng,
                              address: (poi as { address?: string }).address || poi.name,
                            },
                          })
                        );
                        return;
                      }
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

        {/* 6. Active Transit Line Full Route & Stations */}
        {activeTransitLine && (
          <>
            {activeTransitLine.polyline.length > 1 && (
              <>
                <Polyline
                  key={`active-transit-glow-${activeTransitLine.line}`}
                  positions={activeTransitLine.polyline}
                  pathOptions={{
                    color: activeTransitLine.color,
                    weight: 8,
                    opacity: 0.3,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                <Polyline
                  key={`active-transit-core-${activeTransitLine.line}`}
                  positions={activeTransitLine.polyline}
                  pathOptions={{
                    color: activeTransitLine.color,
                    weight: 4.5,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </>
            )}
            {activeTransitLine.stations.map((st, idx) => (
              <CircleMarker
                key={`transit-line-st-${st.id}-${idx}`}
                center={[st.lat, st.lng]}
                radius={idx === 0 || idx === activeTransitLine.stations.length - 1 ? 6.5 : 4.5}
                pathOptions={{
                  fillColor: '#FFFFFF',
                  fillOpacity: 1,
                  color: activeTransitLine.color,
                  weight: 2.5,
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    const stableId = st.id.startsWith('gtfs:') ? st.id : `gtfs:${destinationCity}:${st.id}`;
                    const payload = {
                      id: stableId,
                      name: st.name,
                      lat: st.lat,
                      lng: st.lng,
                      category: st.category || 'transit',
                      transit_info: {
                        lines: st.lines || (activeTransitLine ? [activeTransitLine.line] : []),
                        station_type: st.station_type || 'station',
                      },
                      serving_lines: [
                        {
                          line_id: activeTransitLine.line,
                          short_name: activeTransitLine.line,
                          color: activeTransitLine.color,
                          mode: 'transit',
                        },
                      ],
                    };
                    onInspectPoi?.(stableId, payload);
                    window.dispatchEvent(
                      new CustomEvent('paladio:inspect-poi', {
                        detail: { id: stableId, fallbackData: payload },
                      })
                    );
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div style={{ fontWeight: 600, fontSize: '11px', fontFamily: 'var(--font-sans, inherit)' }}>
                    {st.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
                    Line {activeTransitLine.line} • Stop {idx + 1} of {activeTransitLine.stations.length}
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        )}

        {/* 7. Transit Tab Bounding Box Stations Layer */}
        {sidebarTab === 'transit' && !activeTransitLine && mapStations && mapStations.length > 0 && (
          mapStations.map((st) => {
            const stableId = `gtfs:${destinationCity}:${st.id}`;
            const primaryLineColor = st.lines?.[0]?.color || '#007AFF';
            return (
              <CircleMarker
                key={`map-transit-st-${st.id}`}
                center={[st.lat, st.lon]}
                radius={5}
                pathOptions={{
                  fillColor: '#FFFFFF',
                  fillOpacity: 1,
                  color: primaryLineColor,
                  weight: 2.5,
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onInspectPoi?.(stableId, {
                      id: stableId,
                      name: st.name,
                      lat: st.lat,
                      lng: st.lon,
                      category: 'transit',
                      transit_info: {
                        lines: st.lines.map((l) => l.short_name || l.line_id),
                        station_type: st.lines?.[0]?.mode || 'station',
                      },
                    });
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div style={{ fontWeight: 600, fontSize: '11px', fontFamily: 'var(--font-sans, inherit)' }}>
                    {st.name}
                  </div>
                  {st.lines.length > 0 && (
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748B)' }}>
                      {st.lines.map((l) => l.short_name || l.line_id).join(', ')}
                    </div>
                  )}
                </Tooltip>
              </CircleMarker>
            );
          })
        )}

        {/* 8. Directions Route & Pins Layer */}
        {activeDirectionsRoute && (
          <>
            {/* Origin Pin A */}
            {activeDirectionsRoute.origin && (
              <Marker
                position={[activeDirectionsRoute.origin.lat, activeDirectionsRoute.origin.lng]}
                icon={createDirectionsTacticalPinIcon('A', '#0F4C5C')}
              >
                <Tooltip direction="top" offset={[0, -14]} opacity={0.95} permanent>
                  <div style={{ fontWeight: 700, fontSize: '11px', fontFamily: 'var(--font-sans, inherit)' }}>
                    Origin: {activeDirectionsRoute.origin.name}
                  </div>
                </Tooltip>
              </Marker>
            )}

            {/* Destination Pin B */}
            {activeDirectionsRoute.destination && (
              <Marker
                position={[activeDirectionsRoute.destination.lat, activeDirectionsRoute.destination.lng]}
                icon={createDirectionsTacticalPinIcon('B', '#059669')}
              >
                <Tooltip direction="top" offset={[0, -14]} opacity={0.95} permanent>
                  <div style={{ fontWeight: 700, fontSize: '11px', fontFamily: 'var(--font-sans, inherit)' }}>
                    Destination: {activeDirectionsRoute.destination.name}
                  </div>
                </Tooltip>
              </Marker>
            )}

            {/* Transit Station Markers along Directions Route */}
            {activeDirectionsRoute.activeLeg &&
              activeDirectionsRoute.activeLeg.steps &&
              activeDirectionsRoute.activeLeg.steps
                .filter(
                  (s: any) =>
                    ['transit_board', 'transit_transfer', 'transit_alight'].includes(s.type) &&
                    s.station_name &&
                    s.geometry &&
                    s.geometry.length > 0
                )
                .map((s: any, sIdx: number) => {
                  const pos = s.geometry[0];
                  if (!pos || typeof pos[0] !== 'number' || typeof pos[1] !== 'number') return null;
                  const role =
                    s.type === 'transit_board'
                      ? 'board'
                      : s.type === 'transit_transfer'
                      ? 'transfer'
                      : 'alight';
                  const roleLabel =
                    role === 'board'
                      ? 'Boarding Station'
                      : role === 'transfer'
                      ? 'Transfer Station'
                      : 'Alight Station';
                  return (
                    <Marker
                      key={`dir-station-${sIdx}-${s.station_name}`}
                      position={[pos[0], pos[1]]}
                      icon={createDirectionsStationIcon(role)}
                      eventHandlers={{
                        click: (e) => {
                          L.DomEvent.stopPropagation(e);
                          const stableId = `gtfs:${destinationCity}:${s.station_name}`;
                          onInspectPoi?.(stableId, {
                            id: stableId,
                            name: s.station_name,
                            category: 'transit',
                            city: destinationCity,
                            lat: pos[0],
                            lng: pos[1],
                          });
                        },
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                        <div style={{ fontWeight: 600, fontSize: '11px', fontFamily: 'var(--font-sans, inherit)' }}>
                          <span
                            style={{
                              textTransform: 'uppercase',
                              fontSize: '9px',
                              opacity: 0.8,
                              display: 'block',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {roleLabel}
                          </span>
                          {s.station_name}
                          <span style={{ display: 'block', fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                            Click to inspect station & departures
                          </span>
                        </div>
                      </Tooltip>
                    </Marker>
                  );
                })}

            {/* Intermediate Stop Markers along Directions Route */}
            {activeDirectionsRoute.activeLeg &&
              activeDirectionsRoute.activeLeg.steps &&
              activeDirectionsRoute.activeLeg.steps.map((s: any, stepIdx: number) => {
                if (!s.intermediate_stop_details || !Array.isArray(s.intermediate_stop_details)) {
                  return null;
                }
                const lineColor = s.route_color || '#0F4C5C';
                const totalStops = s.intermediate_stop_details.length;
                return s.intermediate_stop_details.map((stop: any, stopIdx: number) => {
                  if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return null;
                  return (
                    <Marker
                      key={`dir-inter-stop-${stepIdx}-${stopIdx}-${stop.name}`}
                      position={[stop.lat, stop.lon]}
                      icon={createIntermediateStopIcon(lineColor)}
                      eventHandlers={{
                        click: (e) => {
                          L.DomEvent.stopPropagation(e);
                          const stableId = `gtfs:${destinationCity}:${stop.name}`;
                          onInspectPoi?.(stableId, {
                            id: stableId,
                            name: stop.name,
                            category: 'transit',
                            city: destinationCity,
                            lat: stop.lat,
                            lng: stop.lon,
                          });
                        },
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                        <div style={{ fontWeight: 600, fontSize: '11px', fontFamily: 'var(--font-sans, inherit)' }}>
                          <span
                            style={{
                              textTransform: 'uppercase',
                              fontSize: '9px',
                              opacity: 0.85,
                              display: 'block',
                              letterSpacing: '0.04em',
                              color: lineColor,
                            }}
                          >
                            {s.transit_line
                              ? `${s.transit_line} • Stop ${stopIdx + 1} of ${totalStops}`
                              : `Stop ${stopIdx + 1} of ${totalStops}`}
                          </span>
                          {stop.name}
                          <span style={{ display: 'block', fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                            Click to inspect station & departures
                          </span>
                        </div>
                      </Tooltip>
                    </Marker>
                  );
                });
              })}

            {/* Route Polyline */}
            {activeDirectionsRoute.activeLeg && (
              <>
                {/* 1. If individual steps have geometries, render them segment-by-segment */}
                {activeDirectionsRoute.activeLeg.steps &&
                activeDirectionsRoute.activeLeg.steps.some(
                  (s: any) => s.geometry && s.geometry.length > 1
                ) ? (
                  activeDirectionsRoute.activeLeg.steps.map((s: any, idx: number) => {
                    if (!s.geometry || s.geometry.length < 2) return null;
                    const isWalk =
                      s.type === 'walk' ||
                      s.type === 'pedestrian' ||
                      (typeof s.instruction === 'string' &&
                        s.instruction.toLowerCase().startsWith('walk'));
                    const transitColor = s.route_color || '#0F4C5C';
                    return isWalk ? (
                      <Polyline
                        key={`step-polyline-${idx}`}
                        positions={s.geometry}
                        pathOptions={{
                          color: '#71717A',
                          weight: 4.5,
                          dashArray: '6, 8',
                          opacity: 0.95,
                          lineCap: 'round',
                          lineJoin: 'round',
                        }}
                      />
                    ) : (
                      <React.Fragment key={`step-polyline-${idx}`}>
                        <Polyline
                          positions={s.geometry}
                          pathOptions={{
                            color: transitColor,
                            weight: 8,
                            opacity: 0.3,
                            lineCap: 'round',
                            lineJoin: 'round',
                          }}
                        />
                        <Polyline
                          positions={s.geometry}
                          pathOptions={{
                            color: transitColor,
                            weight: 5,
                            opacity: 0.95,
                            lineCap: 'round',
                            lineJoin: 'round',
                            className: s.transit_line ? 'cursor-pointer' : undefined,
                          }}
                          eventHandlers={
                            s.transit_line
                              ? {
                                  click: (e) => {
                                    L.DomEvent.stopPropagation(e);
                                    handleTransitLineClick(
                                      s.transit_line,
                                      transitColor,
                                      s.geometry,
                                      s.station_name
                                    );
                                  },
                                }
                              : undefined
                          }
                        >
                          {s.transit_line && (
                            <Tooltip sticky direction="top" opacity={0.95}>
                              <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600 }}>
                                {`[LINE ${s.transit_line}] `}
                                {s.instruction || 'Transit'}
                                <span style={{ display: 'block', fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                                  Click to highlight line & view schedule
                                </span>
                              </span>
                            </Tooltip>
                          )}
                        </Polyline>
                      </React.Fragment>
                    );
                  })
                ) : (
                  /* 2. Fallback to leg-level geometry */
                  activeDirectionsRoute.activeLeg.geometry &&
                  activeDirectionsRoute.activeLeg.geometry.length > 1 && (
                    <>
                      {activeDirectionsRoute.activeLeg.mode === 'pedestrian' ? (
                        <Polyline
                          positions={activeDirectionsRoute.activeLeg.geometry}
                          pathOptions={{
                            color: '#0F4C5C',
                            weight: 4.5,
                            dashArray: '6, 8',
                            opacity: 0.95,
                            lineCap: 'round',
                            lineJoin: 'round',
                          }}
                        />
                      ) : (
                        (() => {
                          const fallbackColor =
                            activeDirectionsRoute.activeLeg.steps?.find(
                              (s: any) => s.route_color
                            )?.route_color || '#0F4C5C';
                          return (
                            <>
                              <Polyline
                                key="directions-transit-glow"
                                positions={activeDirectionsRoute.activeLeg.geometry}
                                pathOptions={{
                                  color: fallbackColor,
                                  weight: 8,
                                  opacity: 0.25,
                                  lineCap: 'round',
                                  lineJoin: 'round',
                                }}
                              />
                              <Polyline
                                key="directions-transit-core"
                                positions={activeDirectionsRoute.activeLeg.geometry}
                                pathOptions={{
                                  color: fallbackColor,
                                  weight: 4.5,
                                  opacity: 0.95,
                                  lineCap: 'round',
                                  lineJoin: 'round',
                                }}
                              />
                            </>
                          );
                        })()
                      )}
                    </>
                  )
                )}
              </>
            )}
          </>
        )}

        {/* 9. Interactive Waypoint Radius Circle & Resize Handle */}
        {spatialCircle && (
          <InteractiveSpatialCircleLayer
            spatialCircle={spatialCircle}
            onSpatialCircleChange={onSpatialCircleChange}
            onClearSpatialCircle={onClearSpatialCircle}
          />
        )}
      </MapContainer>

      {/* Floating Active Transit Line Banner */}
      {activeTransitLine && (
        <div
          data-testid="active-transit-line-banner"
          style={{
            position: 'absolute',
            top: '20px',
            left: isSidebarOpen ? 'calc(50% + 180px)' : '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            background: 'var(--color-surface-card, #FFFFFF)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1.5px solid ${activeTransitLine.color}`,
            borderRadius: '9999px',
            padding: '5px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            boxShadow: '0 8px 24px -4px rgba(15, 76, 92, 0.18), 0 2px 6px rgba(0,0,0,0.06)',
            fontFamily: 'var(--font-sans, inherit)',
            fontSize: '12px',
            pointerEvents: 'auto',
            transition: 'all 0.25s ease',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: activeTransitLine.color,
              boxShadow: `0 0 8px ${activeTransitLine.color}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Line {activeTransitLine.line}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 500 }}>
            ({activeTransitLine.stations.length} station{activeTransitLine.stations.length === 1 ? '' : 's'})
          </span>
          {onClearTransitLine && (
            <button
              type="button"
              onClick={onClearTransitLine}
              title="Clear line highlight"
              style={{
                marginLeft: '2px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.06)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: '10px',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}

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
