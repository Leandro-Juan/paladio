"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trip, getApiBaseUrl } from '@/hooks/useTrips';
import { isTripCompleted } from '@/utils/tripParser';
import { TripWorkspace } from '@/components/trip-workspace/TripWorkspace';
import { PaladioLoader } from '@/components/common/PaladioLoader';

export default function TripWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const forceWorkspace = searchParams?.get('workspace') === '1' || searchParams?.get('force') === '1';

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
          // If the trip has already ended, redirect directly to its Vault recap page
          if (isTripCompleted(data) && !forceWorkspace) {
            router.replace(`/vault/${data.id}`);
            return;
          }
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
  }, [id]);

  const loadTrip = useCallback(async () => {
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/trips/${id}`);
      if (res.ok) {
        const data: Trip = await res.json();
        setTrip(data);
      }
    } catch (e) {
      console.error('Failed to reload trip in background', e);
    }
  }, [id]);

  if (loading) {
    return <PaladioLoader variant="fullscreen" />;
  }

  if (error) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-bg-main)',
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
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-danger)',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          <h3 className="font-display" style={{ color: 'var(--color-danger)', margin: 0 }}>
            MISSION TELEMETRY ERROR
          </h3>
          <p className="font-mono text-muted text-sm mt-2">{error}</p>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={loadTrip}
              style={{
                padding: '8px 16px',
                background: 'var(--color-accent-primary)',
                color: 'var(--color-text-on-accent, #FFFFFF)',
                border: 'none',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              RETRY
            </button>
            <Link
              href="/dashboard"
              style={{
                padding: '8px 16px',
                background: 'var(--color-surface-card)',
                color: 'var(--color-text-main)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              &larr; RETURN TO DASHBOARD
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
          background: 'var(--color-bg-main)',
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
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          <h3 className="font-display" style={{ color: 'var(--color-text-main)', margin: 0 }}>
            MISSION NOT FOUND
          </h3>
          <p className="font-mono text-muted text-sm mt-2">
            [ MISSION DATA NOT FOUND FOR ID: {id} ]
          </p>
          <Link
            href="/dashboard"
            style={{
              marginTop: '1.5rem',
              display: 'inline-block',
              padding: '8px 16px',
              background: 'var(--color-accent-primary)',
              color: 'var(--color-text-on-accent, #FFFFFF)',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            &larr; RETURN TO DASHBOARD
          </Link>
        </div>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<PaladioLoader variant="fullscreen" />}>
      <TripWorkspace trip={trip} onTripUpdated={loadTrip} />
    </React.Suspense>
  );
}
