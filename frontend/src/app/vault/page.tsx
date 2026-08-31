"use client";
import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the map to avoid SSR issues with Leaflet
const VaultMap = dynamic(() => import('@/components/VaultMap'), { ssr: false, loading: () => <div className="font-mono text-muted flex items-center justify-center h-full w-full bg-surface">LOADING MAP DATA...</div> });

export default function VaultPage() {
  const pastTrips: unknown[] = [
    {
      id: "tokyo-hyper",
      destination: "Tokyo Hyper-Optimization",
      date: "2024-05-12",
      score: 99.4,
      lat: 35.6762,
      lng: 139.6503,
    },
    {
      id: "paris-efficiency",
      destination: "Paris Efficiency Run",
      date: "2023-09-21",
      score: 97.8,
      lat: 48.8566,
      lng: 2.3522,
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '2rem', left: '2rem', zIndex: 1000, pointerEvents: 'none' }}>
        <h2 className="font-display" style={{ textShadow: '0 2px 4px rgba(255,255,255,0.8)' }}>ITINERARY VAULT</h2>
        <p className="font-mono text-muted text-sm mt-1" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>{'// GLOBAL MISSIONS DASHBOARD'}</p>
      </div>

      <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <VaultMap trips={pastTrips} />
      </div>
    </div>
  );
}
