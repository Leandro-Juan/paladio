"use client";
import React from 'react';
import Link from 'next/link';

export default function VaultPage() {
  // To be fetched from the backend database of saved itineraries
  const pastTrips: any[] = [];

  return (
    <div>
      <h2 className="font-display">ITINERARY VAULT</h2>
      <p className="font-mono text-muted text-sm mt-2">// ARCHIVED MISSIONS</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '2rem' }}>
        {pastTrips.length > 0 ? pastTrips.map(trip => (
          <Link href={`/vault/${trip.id}`} key={trip.id} style={{ display: 'block' }}>
            <div className="bg-surface border-subtle" style={{ 
              display: 'flex', 
              borderRadius: '8px', 
              overflow: 'hidden',
              height: '200px',
              transition: 'border-color 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
            >
              <div style={{ flex: '0 0 300px', backgroundImage: `url(${trip.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 className="font-display" style={{ fontSize: '1.5rem' }}>{trip.destination}</h3>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>{trip.date}</p>
                <div style={{ marginTop: 'auto', display: 'flex', gap: '2rem' }}>
                  <div className="font-mono">
                    <span className="text-muted text-sm">OPTIMIZATION SCORE: </span>
                    <span className="text-accent">{trip.score}</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        )) : (
          <div className="font-mono text-muted text-sm">[ NO ARCHIVED MISSIONS FOUND ]</div>
        )}
      </div>
    </div>
  );
}
