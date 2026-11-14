'use client';

import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_TILE_CONFIG } from '@/utils/mapTiles';

export interface PoiMapPickerInnerProps {
  center: [number, number];
  zoom?: number;
  pinPos: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterController({ targetCenter, targetZoom }: { targetCenter: [number, number]; targetZoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(targetCenter, targetZoom ?? map.getZoom(), { animate: true, duration: 0.5 });
  }, [map, targetCenter, targetZoom]);
  return null;
}

export default function PoiMapPickerInner({
  center,
  zoom = 14,
  pinPos,
  onMapClick,
}: PoiMapPickerInnerProps) {
  const poiPinIcon = useMemo(() => {
    return L.divIcon({
      className: 'paladio-poi-picker-pin',
      html: `<div style="width:32px;height:32px;border-radius:50%;background:#0F4C5C;border:2.5px solid #FFFFFF;box-shadow:0 4px 14px rgba(15,76,92,0.55);display:flex;align-items:center;justify-content:center;color:#FFFFFF;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: '100%', height: '100%', borderRadius: '16px' }}
    >
      <TileLayer
        url={MAP_TILE_CONFIG.url}
        subdomains={MAP_TILE_CONFIG.subdomains}
        attribution={MAP_TILE_CONFIG.attribution}
        maxZoom={MAP_TILE_CONFIG.maxZoom}
      />
      <MapClickHandler onMapClick={onMapClick} />
      <RecenterController targetCenter={center} />
      {pinPos && <Marker position={pinPos} icon={poiPinIcon} />}
    </MapContainer>
  );
}
