"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { computeClusterPolygon, computeCentroid, LatLngPoint } from '@/utils/clusterHull';

export interface MapPoi {
  name: string;
  lat: number;
  lng: number;
  category?: string;
  arrivalTime?: string;
  departureTime?: string;
  durationMins?: number;
  costEur?: number;
}

export interface MapDayGroup {
  dayNumber: number;
  label?: string;
  pois: MapPoi[];
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
      <div style="display:inline-flex;align-items:center;background:#0F172A;border:1.5px solid #2563EB;border-radius:14px;box-shadow:0 3px 8px rgba(0,0,0,0.5);padding:2px 6px 2px 3px;gap:4px;cursor:pointer;transform:translate(-50%, -50%);user-select:none;">
        <div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#1E3A8A;color:#93C5FD;">
          ${svg}
        </div>
        <span style="font-family:monospace;font-size:10px;font-weight:700;color:#FFFFFF;line-height:1;letter-spacing:0.5px;">${formattedNum}</span>
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
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#1E3A8A;border:2px solid #FFFFFF;border-radius:8px;box-shadow:0 0 12px rgba(30,58,138,0.7),0 2px 8px rgba(0,0,0,0.4);color:#FFF;">
          ${svg}
        </div>
        <span style="margin-top:2px;background:#0F172A;color:#93C5FD;border:1px solid #1E3A8A;font-size:9px;font-family:monospace;font-weight:700;padding:0 4px;border-radius:3px;letter-spacing:0.5px;box-shadow:0 1px 4px rgba(0,0,0,0.4);">HOTEL</span>
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
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#0284C7;border:2px solid #FFFFFF;border-radius:8px;box-shadow:0 0 12px rgba(2,132,199,0.7),0 2px 8px rgba(0,0,0,0.4);color:#FFF;">
          ${svg}
        </div>
        <span style="margin-top:2px;background:#0F172A;color:#7DD3FC;border:1px solid #0284C7;font-size:9px;font-family:monospace;font-weight:700;padding:0 4px;border-radius:3px;letter-spacing:0.5px;box-shadow:0 1px 4px rgba(0,0,0,0.4);">AIRPORT</span>
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
      <div style="display:flex;align-items:center;justify-content:center;background:#1E3A8A;color:#FFFFFF;border:2px solid #2563EB;border-radius:999px;padding:3px 10px;font-family:monospace;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.5);letter-spacing:0.5px;cursor:pointer;transform:translate(-50%, -50%);white-space:nowrap;user-select:none;">
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
}: TripMapViewProps) {
  const [internalCatFilter, setInternalCatFilter] = useState<PoiCategoryType | null>(null);
  const activeCategory = categoryFilter !== undefined ? categoryFilter : internalCatFilter;

  const handleCategoryToggle = (cat: PoiCategoryType) => {
    const next = activeCategory === cat ? null : cat;
    if (onCategoryFilterChange) onCategoryFilterChange(next);
    else setInternalCatFilter(next);
  };

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

  // Current active day data
  const activeDayData = useMemo(() => {
    if (activeDay === 'all') return null;
    return days.find((d) => d.dayNumber === activeDay) || null;
  }, [days, activeDay]);

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
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid #E2E8F0',
          borderRadius: '999px',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)',
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
                background: isSelected ? '#1E3A8A' : 'transparent',
                color: isSelected ? '#FFFFFF' : '#64748B',
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
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <ZoomControl position="bottomright" />
        <MapViewportController activePoints={activeBoundsPoints} focusedPlace={focusedPlace} />

        {/* Esri Light Gray Canvas Basemap */}
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />

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
                      fillColor: '#1E3A8A',
                      fillOpacity: 0.32,
                      color: '#2563EB',
                      weight: 2,
                    }
                  : {
                      fillColor: '#E2E8F0',
                      fillOpacity: 0.20,
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
                  <strong style={{ color: '#0F172A' }}>DAY {cluster.dayNumber} TERRITORY</strong>
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

        {/* 3. Solo Active Day Polyline */}
        {activeDay !== 'all' && activePolyline.length > 1 && (
          <Polyline
            positions={activePolyline}
            pathOptions={{
              color: '#2563EB',
              weight: 3.5,
              opacity: 0.85,
            }}
          />
        )}

        {/* 4. Hotel Base Camp Anchor Marker */}
        {hotel && typeof hotel.lat === 'number' && !isNaN(hotel.lat) && (
          <Marker position={[hotel.lat, hotel.lng]} icon={createHotelIcon()}>
            <Popup>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
                <span className="font-mono text-xs text-muted" style={{ fontWeight: 700 }}>
                  BASE CAMP
                </span>
                <strong className="font-display" style={{ fontSize: '0.95rem', color: '#0F172A' }}>
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
                <strong className="font-display" style={{ fontSize: '0.95rem', color: '#0F172A' }}>
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
                      <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                        <span className="font-mono text-xs text-muted" style={{ fontWeight: 700 }}>
                          STOP {String(stopCounter).padStart(2, '0')}
                        </span>
                        <div className="font-display" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>
                          {poi.name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', fontFamily: 'monospace' }}>
                        {poi.arrivalTime && (
                          <div style={{ color: '#475569' }}>
                            Time: {poi.arrivalTime.substring(11, 16)} &rarr; {poi.departureTime ? poi.departureTime.substring(11, 16) : '--:--'}
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
    </div>
  );
}
