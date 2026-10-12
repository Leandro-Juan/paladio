"use client";

import React from 'react';
import { RouteItineraryData } from '@/app/vault/[id]/page';
import { TransitRecommendationCard } from '@/components/TransitLegView';

interface TripTransportsViewProps {
  itinerary?: RouteItineraryData | null;
}

export function TripTransportsView({ itinerary }: TripTransportsViewProps) {
  // Extract tickets and flights
  const tickets: Array<{
    title: string;
    subtitle: string;
    origin?: string;
    destination?: string;
    flightNumber?: string;
    departure?: string;
    arrival?: string;
  }> = [];

  if (Array.isArray(itinerary?.days)) {
    const seen = new Set<string>();
    itinerary.days.forEach((day) => {
      const dayFlights = [
        day.flight_info,
        (day as unknown as { inbound_flight?: Record<string, unknown> }).inbound_flight,
        (day as unknown as { outbound_flight?: Record<string, unknown> }).outbound_flight,
      ].filter(Boolean) as Array<Record<string, unknown>>;

      dayFlights.forEach((f) => {
        const origin = (f.origin_iata as string) || 'DEP';
        const dest = (f.destination_iata as string) || 'ARR';
        const dep = (f.departure_time as string) || '--:--';
        const arr = (f.arrival_time as string) || '--:--';
        const flightNum = (f.flight_number as string) || (f.airline as string) || '';

        const key = `${origin}-${dest}-${dep}`;
        if (!seen.has(key)) {
          seen.add(key);
          tickets.push({
            title: `${origin} \u2192 ${dest} Transit Flight`,
            subtitle: `Dep: ${dep} | Arr: ${arr}`,
            origin,
            destination: dest,
            flightNumber: flightNum,
            departure: dep,
            arrival: arr,
          });
        }
      });
    });
  }

  // Find any daily transit recommendations
  const transitRecommendations = (itinerary?.days || [])
    .map((d) => d.itinerary?.transit_recommendation)
    .filter(Boolean);

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1000px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}
    >
      <div>
        <h2 className="font-display" style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-text-primary)' }}>
          TRANSPORTS & TRANSIT GATEWAYS
        </h2>
        <p className="font-mono text-muted text-sm mt-1">
          {'// AIRPORT TRANSIT LEGS, FLIGHT DISPATCH & PUBLIC PASSES'}
        </p>
      </div>

      {/* Flight Cards Grid */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 className="font-mono text-muted text-xs">{'// FLIGHT BOARDING PASSES'}</h3>
        {tickets.length === 0 ? (
          <div
            className="font-mono text-muted text-sm"
            style={{
              padding: '2rem',
              textAlign: 'center',
              background: 'var(--color-surface-card)',
              border: '1px dashed var(--color-border-subtle)',
              borderRadius: '10px',
            }}
          >
            [ NO COMMERCIAL FLIGHT TICKETS ATTACHED TO THIS ITINERARY ]
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {tickets.map((t, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      color: 'var(--color-accent-teal)',
                      background: 'var(--color-accent-teal-soft)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                    }}
                  >
                    AIR TRANSIT
                  </span>
                  {t.flightNumber && (
                    <span className="font-mono text-xs text-muted">
                      {t.flightNumber}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.5rem 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {t.origin}
                    </div>
                    <div className="font-mono text-xs text-muted">DEPARTURE</div>
                  </div>
                  <div style={{ color: 'var(--color-accent-teal)', fontSize: '1.2rem' }}>&rarr;</div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {t.destination}
                    </div>
                    <div className="font-mono text-xs text-muted">ARRIVAL</div>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--color-border-subtle)',
                    paddingTop: '0.5rem',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>DEP: {t.departure ? t.departure.substring(0, 16) : '--:--'}</span>
                  <span>ARR: {t.arrival ? t.arrival.substring(0, 16) : '--:--'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Public Transit Recommendations */}
      {transitRecommendations.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 className="font-mono text-muted text-xs">{'// TRANSIT PASS SAVINGS ADVISORY'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {transitRecommendations.map((rec, idx) => (
              rec && <TransitRecommendationCard key={idx} recommendation={rec} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
