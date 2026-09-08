"use client";
import React from 'react';
import { useTrips } from '@/hooks/useTrips';
import dynamic from 'next/dynamic';

// Dynamically import the map to avoid SSR issues with Leaflet
const VaultMap = dynamic(() => import('@/components/VaultMap'), { ssr: false, loading: () => <div className="font-mono text-muted flex items-center justify-center h-full w-full bg-surface">LOADING MAP DATA...</div> });

const CITY_COORDINATES: Record<string, [number, number]> = {
  tokyo: [35.6762, 139.6503],
  paris: [48.8566, 2.3522],
  london: [51.5074, -0.1278],
  "new york": [40.7128, -74.0060],
  rome: [41.9028, 12.4964],
  berlin: [52.5200, 13.4050],
  madrid: [40.4168, -3.7038],
  barcelona: [41.3879, 2.1699],
  kyoto: [35.0116, 135.7681],
  amsterdam: [52.3676, 4.9041],
  bangkok: [13.7563, 100.5018],
  singapore: [1.3521, 103.8198],
  sydney: [-33.8688, 151.2093],
  "san francisco": [37.7749, -122.4194],
  zurich: [47.3769, 8.5417],
  vienna: [48.2082, 16.3738]
};

function getTripCoordinates(t: { destination?: string; lat?: number; lng?: number; itinerary_data?: unknown }): { lat: number; lng: number } {
  const itinerary = t.itinerary_data as {
    days?: Array<{
      itinerary?: {
        path?: Array<{
          poi?: {
            location?: { latitude?: number; longitude?: number };
          };
        }>;
      };
    }>;
  } | null | undefined;

  const firstPoi = itinerary?.days?.[0]?.itinerary?.path?.[0]?.poi?.location;
  if (firstPoi?.latitude && firstPoi?.longitude) {
    return { lat: firstPoi.latitude, lng: firstPoi.longitude };
  }

  if (t.lat && t.lng) {
    return { lat: t.lat, lng: t.lng };
  }

  const dest = (t.destination || "").toLowerCase();
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    if (dest.includes(city)) {
      return { lat: coords[0], lng: coords[1] };
    }
  }

  // Default coordinate fallback to avoid clustering at [0, 0] in the ocean
  return { lat: 48.8566, lng: 2.3522 };
}

export default function VaultPage() {
  const { trips, loading } = useTrips();
  
  // Extract lat/lng from itinerary_data or fallback to city mapping
  const mappedTrips = trips.map((t) => {
    const coords = getTripCoordinates(t);
    return {
      id: t.id,
      destination: t.destination,
      date: t.start_date,
      lat: coords.lat,
      lng: coords.lng
    };
  });

  if (loading) return <div className="font-mono text-muted p-8">LOADING VAULT DATA...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '2rem', left: '2rem', zIndex: 1000, pointerEvents: 'none' }}>
        <h2 className="font-display" style={{ textShadow: '0 2px 4px rgba(255,255,255,0.8)' }}>ITINERARY VAULT</h2>
        <p className="font-mono text-muted text-sm mt-1" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>{'// GLOBAL MISSIONS DASHBOARD'}</p>
      </div>

      <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <VaultMap trips={mappedTrips} />
      </div>
    </div>
  );
}
