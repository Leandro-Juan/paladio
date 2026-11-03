"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trip, getApiBaseUrl } from '@/hooks/useTrips';
import { isTripCompleted } from '@/utils/tripParser';
import { PastTripRecap } from '@/components/past-trip/PastTripRecap';
import { PaladioLoader } from '@/components/common/PaladioLoader';

export default function VaultTripRecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          // Guard: If trip is not yet ended, redirect to the active planning workspace
          if (!isTripCompleted(data)) {
            router.replace(`/trips/${data.id}`);
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
  }, [id, router]);

  const loadTrip = useCallback(async () => {
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/trips/${id}`);
      if (res.ok) {
        const data: Trip = await res.json();
        setTrip(data);
      }
    } catch (e) {
      console.error('Failed to reload trip', e);
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
              href="/vault"
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
              &larr; RETURN TO VAULT
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
            href="/vault"
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
            &larr; RETURN TO VAULT
          </Link>
        </div>
      </div>
    );
  }

  return <PastTripRecap trip={trip} onTripUpdated={loadTrip} />;
}
