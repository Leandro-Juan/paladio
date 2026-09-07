"use client";
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useRouter } from 'next/navigation';

// Fix for default Leaflet markers in Next.js
delete (L.Icon.Default.prototype as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker for Paladio (Navy Blue / Accent)
const accentIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface VaultMapProps {
  trips: any[];
}

export default function VaultMap({ trips }: VaultMapProps) {
  const router = useRouter();
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    // Fetch world geojson to draw country borders
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(console.error);
  }, []);

  // Countries visited based on the mock trips (Japan for Tokyo, France for Paris)
  const visitedCountries = ["Japan", "France"];

  const geoJsonStyle = (feature: any) => {
    const isVisited = visitedCountries.includes(feature.properties.name);
    return {
      fillColor: isVisited ? '#1E3A8A' : '#E2E8F0', // Accent blue or light gray
      weight: 1,
      opacity: 1,
      color: '#FFFFFF', // White borders between countries
      fillOpacity: isVisited ? 0.7 : 0.3
    };
  };

  return (
    <MapContainer 
      center={[30, 0]} 
      zoom={2} 
      minZoom={2}
      style={{ height: '100%', width: '100%', borderRadius: '8px', background: '#F8FAFC' }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* Premium Carto Light Base Map */}
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
      />

      {geoData && (
        <GeoJSON data={geoData as any} style={geoJsonStyle} />
      )}

      {trips.map((trip: any) => (
        <Marker 
          key={trip.id} 
          position={[trip.lat, trip.lng]} 
          icon={accentIcon}
          eventHandlers={{
            click: () => {
              router.push(`/vault/${trip.id}`);
            },
          }}
        >
          <Popup className="premium-popup">
            <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => router.push(`/vault/${trip.id}`)}>
              <strong className="font-display" style={{ display: 'block', fontSize: '1.1rem' }}>{trip.destination}</strong>
              <span className="font-mono text-muted text-xs mt-1">CLICK TO VIEW MISSION</span>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
