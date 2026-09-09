"use client";
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useRouter } from 'next/navigation';

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

interface VaultTrip {
  id?: string;
  destination: string;
  country?: string;
  lat: number;
  lng: number;
}

interface VaultMapProps {
  trips: VaultTrip[];
}

export default function VaultMap({ trips }: VaultMapProps) {
  const router = useRouter();
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    // Fetch world geojson to draw country borders with error handling / fallback
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`GeoJSON fetch failed with status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (isMounted && data && (data.type === 'FeatureCollection' || Array.isArray(data.features))) {
          setGeoData(data);
        }
      })
      .catch(err => {
        console.warn('World GeoJSON borders unavailable, falling back to clean basemap:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visitedCountries = trips
    .map(t => t.country || t.destination || '')
    .filter(Boolean);

  const geoJsonStyle = (feature: any) => {
    const countryName = feature?.properties?.name;
    const isVisited = countryName && visitedCountries.some(c => 
      typeof c === 'string' && c.toLowerCase().includes(countryName.toLowerCase())
    );
    return {
      fillColor: isVisited ? '#1E3A8A' : '#E2E8F0', // Accent blue or light gray
      weight: 1,
      opacity: 1,
      color: '#FFFFFF', // White borders between countries
      fillOpacity: isVisited ? 0.7 : 0.3
    };
  };

  const validTrips = trips.filter(
    t => typeof t.lat === 'number' && !isNaN(t.lat) && typeof t.lng === 'number' && !isNaN(t.lng)
  );

  return (
    <MapContainer 
      center={[30, 0]} 
      zoom={2} 
      minZoom={2}
      style={{ height: '100%', width: '100%', borderRadius: '8px', background: '#F8FAFC' }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* Esri World Light Gray Base Map */}
      <TileLayer
        attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />

      {geoData && (
        <GeoJSON data={geoData as any} style={geoJsonStyle} />
      )}

      <MarkerClusterGroup>
        {validTrips.map((trip) => (
        <Marker 
          key={trip.id || `${trip.lat}-${trip.lng}`} 
          position={[trip.lat, trip.lng]} 
          icon={accentIcon}
          eventHandlers={{
            click: () => {
              if (trip.id) router.push(`/vault/${trip.id}`);
            },
          }}
        >
          <Popup className="premium-popup">
            <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => trip.id && router.push(`/vault/${trip.id}`)}>
              <strong className="font-display" style={{ display: 'block', fontSize: '1.1rem' }}>{trip.destination}</strong>
              <span className="font-mono text-muted text-xs mt-1">CLICK TO VIEW MISSION</span>
            </div>
          </Popup>
        </Marker>
      ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
