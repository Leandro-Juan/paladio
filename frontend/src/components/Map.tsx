"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { PoiCategoryBadge } from './PoiCategoryBadge';
import { classifyPoiCategory, PoiCategoryType } from '@/utils/poiCategory';
import { computeClusterPolygon, computeCentroid, LatLngPoint } from '@/utils/clusterHull';

export interface MapPoiItem {
  name: string;
  lat: number;
  lng: number;
  category?: string;
  arrivalTime?: string;
  departureTime?: string;
  durationMins?: number;
  costEur?: number;
}

export interface MapDayData {
  dayNumber: number;
  label?: string;
  pois: MapPoiItem[];
}

export interface MapProps {
  days?: MapDayData[];
  pois?: MapPoiItem[];
  hotel?: { name: string; lat: number; lng: number };
  airport?: { name: string; lat: number; lng: number };
  activeDay?: number | 'all';
  onDayChange?: (day: number | 'all') => void;
}

// Inline pure SVG vector icons matching Paladio's design language (NO EMOJIS)
function getCategorySvg(type: PoiCategoryType): string {
  switch (type) {
    case 'museum':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2L2 7h20L12 2z"/></svg>`;
    case 'restaurant':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20M21 15V2a5 5 0 0 0-5 5v8h5zM3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M6 11v11"/></svg>`;
    case 'cafe':
      return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`;
    case 'hotel':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/></svg>`;
    case 'airport':
    case 'flight':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`;
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

// Tactical SVG-based Leaflet markers
function createWaypointIcon(categoryType: PoiCategoryType, stopNumber: number): L.DivIcon {
  const svg = getCategorySvg(categoryType);
  const formattedNum = String(stopNumber).padStart(2, '0');
  return L.divIcon({
    className: 'paladio-waypoint-icon',
    html: `
      <div style="display:inline-flex;align-items:center;background:#0F172A;border:1.5px solid #2563EB;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,0.4);padding:2px 5px 2px 3px;gap:4px;cursor:pointer;transform:translate(-50%, -50%);user-select:none;">
        <div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#1E3A8A;color:#93C5FD;">
          ${svg}
        </div>
        <span style="font-family:monospace;font-size:10px;font-weight:700;color:#FFFFFF;line-height:1;letter-spacing:0.5px;">${formattedNum}</span>
      </div>
    `,
    iconSize: [44, 22],
    iconAnchor: [22, 11],
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
    iconSize: [36, 44],
    iconAnchor: [18, 22],
    popupAnchor: [0, -22],
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
    iconSize: [36, 44],
    iconAnchor: [18, 22],
    popupAnchor: [0, -22],
  });
}

function createClusterLabelIcon(dayNum: number): L.DivIcon {
  return L.divIcon({
    className: 'paladio-cluster-label-icon',
    html: `
      <div style="background:#0F172A;border:1.5px solid #2563EB;border-radius:4px;padding:2px 6px;color:#93C5FD;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.5px;box-shadow:0 2px 6px rgba(0,0,0,0.4);transform:translate(-50%, -50%);cursor:pointer;user-select:none;">
        DAY ${dayNum}
      </div>
    `,
    iconSize: [52, 20],
    iconAnchor: [26, 10],
  });
}

/**
 * Automatically adjusts map bounds and handles window resize events smoothly.
 */
function MapViewportController({
  activePoints,
  activeTab,
}: {
  activePoints: LatLngPoint[];
  activeTab: number | 'all';
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || activePoints.length === 0) return;
    const bounds = L.latLngBounds(activePoints.map((p) => [p.lat, p.lng]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15, animate: true });
    }
  }, [map, activePoints, activeTab]);

  useEffect(() => {
    if (!map) return;
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

export default function LeafletMap({
  days = [],
  pois = [],
  hotel,
  airport,
  activeDay: controlledActiveDay,
  onDayChange,
}: MapProps) {
  // Normalize days data: if days not provided, group raw pois as single day
  const effectiveDays: MapDayData[] = useMemo(() => {
    if (days && days.length > 0) return days;
    if (pois && pois.length > 0) {
      return [{ dayNumber: 1, label: 'DAY 1', pois }];
    }
    return [];
  }, [days, pois]);

  // Tab state (defaults to Day 1 for immediate focused view, or 'all')
  const [internalActiveDay, setInternalActiveDay] = useState<number | 'all'>(
    effectiveDays.length > 0 ? effectiveDays[0].dayNumber : 'all'
  );

  const activeTab = controlledActiveDay !== undefined ? controlledActiveDay : internalActiveDay;

  const handleTabChange = useCallback(
    (tab: number | 'all') => {
      if (onDayChange) {
        onDayChange(tab);
      } else {
        setInternalActiveDay(tab);
      }
    },
    [onDayChange]
  );

  // Compute cluster polygons for each day
  // (Filter out distant airports so the attraction territory isn't warped)
  const dayClusters = useMemo(() => {
    return effectiveDays.map((d) => {
      const cityPoints = d.pois.filter((p) => {
        const cat = (p.category || '').toLowerCase();
        return cat !== 'airport' && cat !== 'flight';
      });
      const pointsToUse = cityPoints.length > 0 ? cityPoints : d.pois;
      const polygon = computeClusterPolygon(pointsToUse);
      const centroid = computeCentroid(pointsToUse);
      return {
        dayNumber: d.dayNumber,
        polygon,
        centroid,
        pois: d.pois,
      };
    });
  }, [effectiveDays]);

  // Current active day data
  const activeDayData = useMemo(() => {
    if (activeTab === 'all') return null;
    return effectiveDays.find((d) => d.dayNumber === activeTab) || null;
  }, [effectiveDays, activeTab]);

  // Points to fit bounds against
  const activeBoundsPoints: LatLngPoint[] = useMemo(() => {
    if (activeTab === 'all') {
      const all: LatLngPoint[] = [];
      effectiveDays.forEach((d) => all.push(...d.pois));
      if (hotel) all.push(hotel);
      if (airport) all.push(airport);
      return all;
    }
    if (activeDayData) {
      return activeDayData.pois;
    }
    return [];
  }, [activeTab, effectiveDays, activeDayData, hotel, airport]);

  // Center coordinate fallback
  const centerPosition: [number, number] = useMemo(() => {
    if (activeBoundsPoints.length > 0) {
      const c = computeCentroid(activeBoundsPoints);
      return [c.lat, c.lng];
    }
    if (hotel) return [hotel.lat, hotel.lng];
    return [41.1579, -8.6291]; // Default fallback: Porto
  }, [activeBoundsPoints, hotel]);

  if (effectiveDays.length === 0 && (!pois || pois.length === 0)) {
    return (
      <div
        className="text-muted font-mono text-xs"
        style={{ padding: '2rem', textAlign: 'center' }}
      >
        [ NO GEODATA PROVIDED ]
      </div>
    );
  }

  // Active day route polyline
  const activePolyline: [number, number][] = activeDayData
    ? activeDayData.pois.map((p) => [p.lat, p.lng])
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Day Selector Navigation Bar */}
      {effectiveDays.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '6px',
            scrollbarWidth: 'none',
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange('all')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 600,
              borderRadius: '4px',
              border: activeTab === 'all' ? '1px solid #2563EB' : '1px solid var(--color-border, #E2E8F0)',
              background: activeTab === 'all' ? '#1E3A8A' : 'transparent',
              color: activeTab === 'all' ? '#FFFFFF' : 'var(--color-text-muted, #64748B)',
              cursor: 'pointer',
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            ALL DAYS
          </button>
          {effectiveDays.map((d) => {
            const isSelected = activeTab === d.dayNumber;
            return (
              <button
                key={d.dayNumber}
                type="button"
                onClick={() => handleTabChange(d.dayNumber)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: isSelected ? '1px solid #2563EB' : '1px solid var(--color-border, #E2E8F0)',
                  background: isSelected ? '#1E3A8A' : 'transparent',
                  color: isSelected ? '#FFFFFF' : 'var(--color-text-muted, #64748B)',
                  cursor: 'pointer',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                DAY {d.dayNumber}
              </button>
            );
          })}
        </div>
      )}

      {/* Map Canvas Container */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, borderRadius: '6px', overflow: 'hidden' }}>
        <MapContainer
          center={centerPosition}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <MapViewportController activePoints={activeBoundsPoints} activeTab={activeTab} />

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

          {/* 1. Cluster Region Polygons (Vault-styled) */}
          {dayClusters.map((cluster) => {
            if (cluster.polygon.length < 3) return null;
            const isActive = activeTab === cluster.dayNumber;

            return (
              <Polygon
                key={`cluster-poly-${cluster.dayNumber}`}
                positions={cluster.polygon}
                pathOptions={
                  isActive
                    ? {
                        fillColor: '#1E3A8A', // Vault visited theme color
                        fillOpacity: 0.32,
                        color: '#2563EB',     // Bright tactical outline
                        weight: 2,
                        dashArray: undefined,
                      }
                    : {
                        fillColor: '#E2E8F0', // Vault unvisited muted color
                        fillOpacity: 0.20,
                        color: '#94A3B8',
                        weight: 1.5,
                        dashArray: '4, 4',
                      }
                }
                eventHandlers={{
                  click: () => handleTabChange(cluster.dayNumber),
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
          {activeTab === 'all' &&
            dayClusters.map((cluster) => {
              if (!cluster.centroid || cluster.centroid.lat === 0) return null;
              return (
                <Marker
                  key={`cluster-badge-${cluster.dayNumber}`}
                  position={[cluster.centroid.lat, cluster.centroid.lng]}
                  icon={createClusterLabelIcon(cluster.dayNumber)}
                  eventHandlers={{
                    click: () => handleTabChange(cluster.dayNumber),
                  }}
                />
              );
            })}

          {/* 3. Solo Active Day Polyline (no hairball lines!) */}
          {activeTab !== 'all' && activePolyline.length > 1 && (
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

          {/* 6. Active Day Waypoint Markers (Categorical SVG pins, NO emojis) */}
          {activeTab !== 'all' &&
            activeDayData &&
            (() => {
              let stopCounter = 0;
              return activeDayData.pois.map((poi, idx) => {
                const categoryType = classifyPoiCategory(poi.category, poi.name).type;
                const isHotel =
                  categoryType === 'hotel' || poi.name.toLowerCase().includes('hotel');
                const isAirport =
                  categoryType === 'airport' ||
                  categoryType === 'flight' ||
                  poi.name.toLowerCase().includes('airport');

                // If anchor markers are already rendered separately, avoid duplicate pins
                if (isHotel && hotel) return null;
                if (isAirport && airport) return null;

                if (!isHotel && !isAirport) {
                  stopCounter++;
                }

                const markerIcon = isHotel
                  ? createHotelIcon()
                  : isAirport
                  ? createAirportIcon()
                  : createWaypointIcon(categoryType, stopCounter);

                return (
                  <Marker
                    key={`${poi.lat}-${poi.lng}-${idx}`}
                    position={[poi.lat, poi.lng]}
                    icon={markerIcon}
                  >
                    <Popup>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          minWidth: '150px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid #E2E8F0',
                            paddingBottom: '4px',
                          }}
                        >
                          <span
                            className="font-mono text-xs text-muted"
                            style={{ fontWeight: 700 }}
                          >
                            {isHotel
                              ? 'BASE CAMP'
                              : isAirport
                              ? 'TRANSIT GATE'
                              : `STOP ${String(stopCounter).padStart(2, '0')}`}
                          </span>
                          {poi.durationMins && (
                            <span className="font-mono text-xs text-muted">
                              ~{poi.durationMins}m
                            </span>
                          )}
                        </div>
                        <strong
                          className="font-display"
                          style={{ fontSize: '0.95rem', color: '#0F172A' }}
                        >
                          {poi.name}
                        </strong>
                        <div>
                          <PoiCategoryBadge
                            category={poi.category}
                            name={poi.name}
                            size="xs"
                          />
                        </div>
                        {poi.arrivalTime && (
                          <div
                            className="font-mono text-xs text-muted"
                            style={{ marginTop: '2px' }}
                          >
                            SCHEDULED: {poi.arrivalTime}{' '}
                            {poi.departureTime ? `— ${poi.departureTime}` : ''}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              });
            })()}
        </MapContainer>
      </div>
    </div>
  );
}
