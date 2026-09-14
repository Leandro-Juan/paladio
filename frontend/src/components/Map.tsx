"use client";
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { PoiCategoryBadge } from './PoiCategoryBadge';

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

interface POI {
  name: string;
  lat: number;
  lng: number;
  category?: string;
}

interface MapProps {
  pois: POI[];
}

/**
 * Handles Leaflet viewport resizing and bounds adjustment without recreating the map instance.
 */
function MapViewportController({ pois }: { pois: POI[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || pois.length === 0) return;
    const bounds = L.latLngBounds(pois.map(p => [p.lat, p.lng]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [map, pois]);

  useEffect(() => {
    if (!map) return;
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

export default function LeafletMap({ pois }: MapProps) {
  if (!pois || pois.length === 0) {
    return <div className="text-muted font-mono" style={{ padding: '2rem', textAlign: 'center' }}>[ NO GEODATA PROVIDED ]</div>;
  }

  // Calculate center of all POIs
  const centerLat = pois.reduce((acc, poi) => acc + poi.lat, 0) / pois.length;
  const centerLng = pois.reduce((acc, poi) => acc + poi.lng, 0) / pois.length;
  const position: [number, number] = [centerLat, centerLng];

  // Route lines
  const polyline: [number, number][] = pois.map(p => [p.lat, p.lng]);

  return (
    <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '4px' }} attributionControl={false}>
      <MapViewportController pois={pois} />

      {/* Esri Light Gray Canvas basemap */}
      <TileLayer
        attribution='Tiles &copy; Esri'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
      <TileLayer
        attribution='Tiles &copy; Esri'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
      
      <MarkerClusterGroup chunkedLoading>
        {pois.map((poi, idx) => (
          <Marker key={`${poi.lat}-${poi.lng}-${idx}`} position={[poi.lat, poi.lng]} icon={accentIcon}>
            <Popup>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
                <strong className="font-display" style={{ fontSize: '0.9rem' }}>{poi.name}</strong>
                <div>
                  <PoiCategoryBadge category={poi.category} name={poi.name} size="xs" />
                </div>
                <span className="font-mono text-xs text-muted">STOP {idx + 1}</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      <Polyline positions={polyline} color="#1E3A8A" weight={3} dashArray="5, 10" />
    </MapContainer>
  );
}
