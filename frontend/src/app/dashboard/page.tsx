"use client";
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTrips } from '@/hooks/useTrips';
import { ActiveTripTicket } from '@/components/ActiveTripTicket';
import { CurrencyConverterWidget } from '@/components/CurrencyConverterWidget';
import { Calendar } from '@/components/Calendar';
import { PreferenceModelSection } from '@/components/PreferenceModelSection';
import { countWaypoints } from '@/utils/tripParser';

export default function DashboardPage() {
  const router = useRouter();
  const { trips, upcomingTrips, loading } = useTrips();

  const nextTrip = upcomingTrips.length > 0 ? upcomingTrips[0] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '3rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="font-display">Welcome to Paladio Control Center</h2>
          <p className="font-mono text-muted text-sm mt-1">{'// SOVEREIGN MISSION CONTROL & TEMPORAL DISPATCH'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span
            className="font-mono text-xs"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(34, 197, 94, 0.1)',
              color: '#16A34A',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              fontWeight: 600,
            }}
          >
            ● TELEMETRY ONLINE
          </span>
          <Link
            href="/engine"
            style={{
              padding: '6px 14px',
              background: 'var(--color-accent-primary)',
              color: '#FFF',
              borderRadius: '6px',
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>+</span> NEW MISSION
          </Link>
        </div>
      </div>

      {/* Top Cards Row: Upcoming Mission & Currency Dispatch */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.25fr) minmax(320px, 1fr)', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 className="font-display" style={{ fontSize: '1.1rem' }}>UPCOMING MISSION</h3>
          
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

        {/* Currency Conversion Widget */}
        <CurrencyConverterWidget />
      </div>

      {/* Calendar Section */}
      <Calendar
        trips={trips}
        onSelectDate={(_, dateString) => router.push(`/engine?start_date=${dateString}`)}
      />

      {/* Preference Model Section */}
      <PreferenceModelSection />
    </div>
  );
}
