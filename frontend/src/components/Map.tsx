"use client";
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default Leaflet markers in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom custom marker for Paladio (Navy Blue / Accent)
const accentIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface POI {
  name: string;
  lat: number;
  lng: number;
}

interface MapProps {
  pois: POI[];
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
      {/* Light basemap to fit the new White/Navy theme */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      
      {pois.map((poi, idx) => (
        <Marker key={idx} position={[poi.lat, poi.lng]} icon={accentIcon}>
          <Popup>
            <strong className="font-display">{poi.name}</strong><br />
            <span className="font-mono text-sm text-muted">STOP {idx + 1}</span>
          </Popup>
        </Marker>
      ))}

      <Polyline positions={polyline} color="#1E3A8A" weight={3} dashArray="5, 10" />
    </MapContainer>
  );
}
