"use client";
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { PoiCategoryBadge } from './PoiCategoryBadge';

// Fix for default Leaflet markers in Next.js
delete (L.Icon.Default.prototype as { _getIconUrl?: string })._getIconUrl;
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
  category?: string;
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
      
      {pois.map((poi, idx) => (
        <Marker key={idx} position={[poi.lat, poi.lng]} icon={accentIcon}>
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

      <Polyline positions={polyline} color="#1E3A8A" weight={3} dashArray="5, 10" />
    </MapContainer>
  );
}
