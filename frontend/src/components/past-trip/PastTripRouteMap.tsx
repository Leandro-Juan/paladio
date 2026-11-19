"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { getDayColor } from '@/components/trip-workspace/TripMapView';
import type { Map as LeafletMap, Polyline as LeafletPolyline, Marker as LeafletMarker } from 'leaflet';

interface RoutePoi {
  name: string;
  lat: number;
  lng: number;
  day: number;
  order: number;
  category?: string;
}

interface PastTripRouteMapProps {
  destination: string;
  country?: string;
  itineraryData: unknown;
  selectedDay?: number | null;
  onBack?: () => void;
  height?: number | string;
}

export function PastTripRouteMap({
  destination,
  country,
  itineraryData,
  selectedDay = null,
  onBack,
  height = '300px',
}: PastTripRouteMapProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<{ polylines: LeafletPolyline[]; markers: LeafletMarker[] }>({
    polylines: [],
    markers: [],
  });

  const [mapLoaded, setMapLoaded] = useState(false);

  // Extract route POIs from itinerary_data
  const { pois, dayGroups } = useMemo(() => {
    const list: RoutePoi[] = [];
    const groups: Record<number, RoutePoi[]> = {};

    const itin = itineraryData as {
      days?: Array<{
        day?: number;
        itinerary?: {
          path?: Array<{
            poi?: {
              name?: string;
              category?: string;
              location?: { latitude?: number; longitude?: number };
              lat?: number;
              lng?: number;
            };
          }>;
        };
      }>;
    } | null | undefined;

    if (itin?.days && Array.isArray(itin.days)) {
      itin.days.forEach((d, dayIdx) => {
        const dayNum = typeof d.day === 'number' ? d.day : dayIdx + 1;
        groups[dayNum] = [];
        const path = d.itinerary?.path;
        if (Array.isArray(path)) {
          path.forEach((step, stepIdx) => {
            const p = step.poi;
            const lat = p?.location?.latitude ?? p?.lat;
            const lng = p?.location?.longitude ?? p?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
              const poiItem: RoutePoi = {
                name: p?.name || t('vault.waypoint_numbered', { index: stepIdx + 1 }),
                lat,
                lng,
                day: dayNum,
                order: stepIdx + 1,
                category: p?.category,
              };
              list.push(poiItem);
              groups[dayNum].push(poiItem);
            }
          });
        }
      });
    }

    return { pois: list, dayGroups: groups };
  }, [itineraryData, t]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;
    let isCancelled = false;

    async function initMap() {
      const L = (await import('leaflet')).default;
      if (isCancelled || !mapContainerRef.current) return;

      // Ensure leaflet styles are present
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
      });

      // Carto Voyager / Positron tiles for clean tactical aesthetics
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Add compact zoom control to top-right
      L.control.zoom({ position: 'topright' }).addTo(map);

      leafletMapRef.current = map;
      setMapLoaded(true);
    }

    initMap();

    return () => {
      isCancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update markers and polylines when POIs or selectedDay changes
  useEffect(() => {
    if (!mapLoaded || !leafletMapRef.current || typeof window === 'undefined') return;

    const map = leafletMapRef.current;
    import('leaflet').then((LModule) => {
      const L = LModule.default;

      // Clear previous layers
      layersRef.current.polylines.forEach((pl) => pl.remove());
      layersRef.current.markers.forEach((m) => m.remove());
      layersRef.current.polylines = [];
      layersRef.current.markers = [];

      const activePois =
        selectedDay && dayGroups[selectedDay] && dayGroups[selectedDay].length > 0
          ? dayGroups[selectedDay]
          : pois;

      if (activePois.length === 0) {
        // Fallback center if no POIs yet
        map.setView([20, 0], 2);
        return;
      }

      const bounds = L.latLngBounds([]);

      // Draw day polylines
      const daysToRender = selectedDay ? [selectedDay] : Object.keys(dayGroups).map(Number);

      daysToRender.forEach((dayNum) => {
        const group = dayGroups[dayNum] || [];
        if (group.length > 1) {
          const coords = group.map((p) => [p.lat, p.lng] as [number, number]);
          const color = getDayColor(dayNum);

          const polyline = L.polyline(coords, {
            color,
            weight: 3.5,
            opacity: 0.85,
            dashArray: '6, 6',
            lineJoin: 'round',
          }).addTo(map);

          layersRef.current.polylines.push(polyline);
        }
      });

      // Draw custom numbered teardrop/circle pins
      activePois.forEach((poi) => {
        const color = getDayColor(poi.day);
        bounds.extend([poi.lat, poi.lng]);

        const markerHtml = `
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: ${color};
            border: 2px solid #FFFFFF;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FFFFFF;
            font-family: var(--font-mono, monospace);
            font-size: 10px;
            font-weight: 700;
          ">
            ${poi.order}
          </div>
        `;

        const icon = L.divIcon({
          html: markerHtml,
          className: 'custom-recap-pin',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([poi.lat, poi.lng], { icon })
          .bindTooltip(`<b>${t('vault.day_short_prefix', { day: poi.day })} · ${poi.name}</b>`, {
            direction: 'top',
            offset: [0, -12],
            className: 'recap-map-tooltip',
          })
          .addTo(map);

        layersRef.current.markers.push(marker);
      });

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 15,
        });
      }
    });
  }, [mapLoaded, pois, dayGroups, selectedDay, t]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/vault');
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0, 0, 0, 0.08))',
        border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.12))',
        background: 'var(--color-surface-card, #FAF6F0)',
      }}
    >
      {/* Map DOM target */}
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%', zIndex: 1 }}
      />

      {/* Frosted Back Button (matching mockup < circle button) */}
      <button
        type="button"
        onClick={handleBack}
        aria-label={t('vault.back_to_vault')}
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 10,
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-primary, #1A2B32)',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
          transition: 'transform 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.06)';
          e.currentTarget.style.background = '#FFFFFF';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)';
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Destination Title Overlay (bottom left of banner, matching mockup) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '2.5rem 1.5rem 1rem',
          background: 'linear-gradient(to top, rgba(15, 76, 92, 0.85) 0%, rgba(15, 76, 92, 0.4) 60%, transparent 100%)',
          zIndex: 5,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h1
          className="font-display"
          style={{
            fontSize: '1.85rem',
            fontWeight: 700,
            color: '#FFFFFF',
            margin: 0,
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
            lineHeight: 1.15,
          }}
        >
          {destination}
        </h1>
        <span
          className="font-mono"
          style={{
            fontSize: '0.82rem',
            color: 'rgba(255, 255, 255, 0.9)',
            marginTop: '3px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {country || t('vault.mission_route_telemetry')}
        </span>
      </div>
    </div>
  );
}
