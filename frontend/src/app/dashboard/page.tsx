"use client";
import React from 'react';
import Link from 'next/link';
import { useTrips } from '@/hooks/useTrips';
import { ActiveTripTicket } from '@/components/ActiveTripTicket';
import { countWaypoints } from '@/utils/tripParser';

export default function DashboardPage() {
  const { trips, loading } = useTrips();
  const latestDeltas: string[] = [];

  const nextTrip = trips.length > 0 ? trips[0] : null;

  return (
    <div>
      <h2 className="font-display">Welcome to Paladio Control Center</h2>
      <p className="font-mono text-muted text-sm mt-2">{'// SYSTEM OVERVIEW'}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginTop: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 className="font-display">UPCOMING MISSION</h3>
          
          {loading ? (
            <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px' }}>
              <p className="text-muted font-mono">LOADING UPCOMING ITINERARY...</p>
            </div>
          ) : nextTrip ? (
            <Link href="/trips" style={{ textDecoration: 'none' }}>
              <ActiveTripTicket 
                destination={nextTrip.destination}
                startDate={nextTrip.start_date}
                endDate={nextTrip.end_date}
                poisCount={countWaypoints(nextTrip.itinerary_data)}
              />
            </Link>
          ) : (
            <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px' }}>
              <p className="text-muted">No active itineraries queued. Awaiting parameters.</p>
              <Link href="/engine" style={{ textDecoration: 'none' }}>
                <button style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--color-accent-primary)', color: '#FFF', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                  INITIALIZE PROTOCOL
                </button>
              </Link>
            </div>
          )}
        </div>

        <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px' }}>
          <h3 className="font-display">ML TUNING DELTAS</h3>
          <ul className="font-mono text-sm text-muted" style={{ marginTop: '1rem', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {latestDeltas.length > 0 ? latestDeltas.map((d, i) => (
              <li key={i}>&gt; [INFO] {d}</li>
            )) : <li>[ NO RECENT DELTAS ]</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
