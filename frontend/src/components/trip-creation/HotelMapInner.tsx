"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_TILE_CONFIG } from '@/utils/mapTiles';

export interface HotelMapInnerProps {
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
  const zoomRef = useRef(targetZoom);
  useEffect(() => {
    zoomRef.current = targetZoom;
  }, [targetZoom]);
  const [lat, lng] = targetCenter;
  useEffect(() => {
    map.flyTo([lat, lng], zoomRef.current ?? map.getZoom(), { animate: true, duration: 0.6 });
  }, [map, lat, lng]);
  return null;
}

export default function HotelMapInner({
  center,
  zoom = 14,
  pinPos,
  onMapClick,
}: HotelMapInnerProps) {
  const hotelIcon = useMemo(() => {
    return L.divIcon({
      className: 'paladio-hotel-pin',
      html: `<div style="width:30px;height:30px;border-radius:50%;background:#D97706;border:2.5px solid #FFFFFF;box-shadow:0 4px 14px rgba(217,119,6,0.6);display:flex;align-items:center;justify-content:center;color:#FFFFFF;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
        </svg>
      </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
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
      <RecenterController targetCenter={center} targetZoom={zoom} />
      {pinPos && <Marker position={pinPos} icon={hotelIcon} />}
    </MapContainer>
  );
}
