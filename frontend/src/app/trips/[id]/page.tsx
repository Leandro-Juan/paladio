"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Trip, getApiBaseUrl } from '@/hooks/useTrips';
import { TripWorkspace } from '@/components/trip-workspace/TripWorkspace';

export default function TripWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadSignal, setReloadSignal] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchTrip() {
      try {
        const apiUrl = getApiBaseUrl();
        const res = await fetch(`${apiUrl}/trips/${id}`);
        if (!isMounted) return;
        if (!res.ok) {
          if (res.status === 404) {
            setTrip(null);
          } else {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
        } else {
          const data: Trip = await res.json();
          setTrip(data);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to connect to backend';
        setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchTrip();
    return () => {
      isMounted = false;
    };
  }, [id, reloadSignal]);

  const loadTrip = useCallback(() => {
    setLoading(true);
    setReloadSignal((s) => s + 1);
  }, []);

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0B0F17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div className="font-mono text-muted text-sm">[ LOADING TRIP WORKSPACE... ]</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0B0F17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            textAlign: 'center',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          <h3 className="font-display" style={{ color: '#F87171', margin: 0 }}>
            MISSION TELEMETRY ERROR
          </h3>
          <p className="font-mono text-muted text-sm mt-2">{error}</p>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={loadTrip}
              style={{
                padding: '6px 14px',
                background: '#2563EB',
                color: '#FFF',
                border: 'none',
                borderRadius: '6px',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              RETRY
            </button>
            <Link
              href="/trips"
              style={{
                padding: '6px 14px',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#94A3B8',
                borderRadius: '6px',
                fontFamily: 'monospace',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              &larr; RETURN TO TRIPS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0B0F17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            textAlign: 'center',
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          <h3 className="font-display" style={{ color: '#FFF', margin: 0 }}>
            MISSION NOT FOUND
          </h3>
          <p className="font-mono text-muted text-sm mt-2">
            [ MISSION DATA NOT FOUND FOR ID: {id} ]
          </p>
          <Link
            href="/trips"
            style={{
              marginTop: '1.5rem',
              display: 'inline-block',
              padding: '6px 14px',
              background: '#2563EB',
              color: '#FFF',
              borderRadius: '6px',
              fontFamily: 'monospace',
              textDecoration: 'none',
              fontSize: '0.85rem',
            }}
          >
            &larr; RETURN TO TRIPS
          </Link>
        </div>
      </div>
    );
  }

  return <TripWorkspace trip={trip} onTripUpdated={loadTrip} />;
}
