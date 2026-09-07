"use client";
import React, { useState } from 'react';
import { useTrips } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { countWaypoints } from '@/utils/tripParser';

export default function TripsPage() {
  const { trips, loading, deleteTrip } = useTrips();
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="font-display">UPCOMING TRIPS</h2>
        <p className="font-mono text-muted text-sm mt-2">{'// CONFIRMED ITINERARIES'}</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <p className="font-mono text-muted">LOADING DATA...</p>
        ) : trips.length === 0 ? (
          <div className="bg-surface border-subtle" style={{ padding: '3rem', textAlign: 'center', borderRadius: '8px' }}>
            <p className="font-mono text-muted">NO UPCOMING TRIPS FOUND.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {trips.map((trip: any, idx: number) => (
              <div key={idx} className="bg-surface border-subtle" style={{ borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-accent-primary)', color: '#FFF', padding: '1rem' }}>
                  <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>{trip.destination}</h3>
                  <p className="font-mono text-sm" style={{ opacity: 0.8, marginTop: '4px' }}>
                    {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="font-mono text-sm text-muted">WAYPOINTS</span>
                    <span className="font-mono" style={{ fontWeight: 600 }}>
                      {countWaypoints(trip.itinerary_data)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="font-mono text-sm text-muted">STATUS</span>
                    <span className="font-mono text-accent" style={{ fontWeight: 600 }}>CONFIRMED</span>
                  </div>
                  <button 
                    onClick={() => setTripToDelete(trip.id)}
                    style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.5rem', 
                      background: 'transparent', 
                      border: '1px solid var(--color-accent-secondary)', 
                      color: 'var(--color-accent-secondary)', 
                      borderRadius: '4px', 
                      cursor: 'pointer', 
                      fontFamily: 'var(--font-display)',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--color-accent-secondary)'; e.currentTarget.style.color = '#FFF'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-accent-secondary)'; }}
                  >
                    ABORT MISSION
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal 
        isOpen={tripToDelete !== null}
        title="ABORT MISSION?"
        message="Are you sure you want to delete this itinerary? This action cannot be undone and the route data will be permanently purged from the system."
        confirmText="CONFIRM ABORT"
        cancelText="CANCEL"
        isDanger={true}
        onConfirm={async () => {
          if (tripToDelete) {
            await deleteTrip(tripToDelete);
            setTripToDelete(null);
          }
        }}
        onCancel={() => setTripToDelete(null)}
      />
    </div>
  );
}
