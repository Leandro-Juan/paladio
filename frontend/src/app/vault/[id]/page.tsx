"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import MapLoader from '@/components/MapLoader';
import { TripTimeline } from '@/components/TripTimeline';
import { Trip, getApiBaseUrl } from '@/hooks/useTrips';
import { OptimizationResult, TransitLeg, TransitRecommendation } from '@/types/domain';
import { isTripCompleted } from '@/utils/tripParser';

interface RouteItineraryData {
  metadata?: {
    engine?: string;
    version?: string;
    nodes_evaluated?: number;
  };
  days?: Array<{
    day: number;
    flight_info?: {
      origin_iata?: string;
      destination_iata?: string;
      departure_time?: string;
      arrival_time?: string;
    };
    itinerary?: {
      day_index?: number;
      path?: Array<{
        poi?: {
          name?: string;
          city?: string;
          category?: string;
          cost_eur?: number;
          duration_mins?: number;
          location?: { latitude?: number; longitude?: number };
        };
        arrival_time?: string;
        scheduled_start?: string;
        departure_time?: string;
        transit_from_previous?: TransitLeg | null;
      }>;
      total_cost?: number;
      transit_recommendation?: TransitRecommendation | null;
    };
  }>;
  pois?: Array<{
    name?: string;
    lat?: number;
    lng?: number;
    location?: { latitude?: number; longitude?: number };
  }>;
  photos?: string[];
  tickets?: Array<{ title: string; subtitle: string }>;
  total_trip_cost?: number;
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

export default function VaultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTrip() {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = getApiBaseUrl();
        const res = await fetch(`${apiUrl}/trips/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            if (isMounted) setTrip(null);
          } else {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
        } else {
          const data: Trip = await res.json();
          if (isMounted) setTrip(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to connect to backend';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (id) {
      loadTrip();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div>
        <Link href="/vault" className="text-muted text-sm font-mono" style={{ textDecoration: 'none' }}>
          ← RETURN TO VAULT
        </Link>
        <div className="bg-surface border-subtle" style={{ padding: '3rem', marginTop: '2rem', borderRadius: '8px', textAlign: 'center' }}>
          <p className="font-mono text-muted text-sm">[ RETRIEVING MISSION DATA FROM SECURE VAULT... ]</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link href="/vault" className="text-muted text-sm font-mono" style={{ textDecoration: 'none' }}>
          ← RETURN TO VAULT
        </Link>
        <div className="bg-surface border-subtle" style={{ padding: '3rem', marginTop: '2rem', borderRadius: '8px', textAlign: 'center' }}>
          <p className="font-mono text-accent text-sm">[ ERROR ACCESSING VAULT: {error.toUpperCase()} ]</p>
          <Link href="/vault" className="font-mono text-muted text-xs mt-4 inline-block">
            ← RETURN TO VAULT DASHBOARD
          </Link>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div>
        <Link href="/vault" className="text-muted text-sm font-mono" style={{ textDecoration: 'none' }}>
          ← RETURN TO VAULT
        </Link>
        <div className="bg-surface border-subtle" style={{ padding: '3rem', marginTop: '2rem', borderRadius: '8px', textAlign: 'center' }}>
          <p className="font-mono text-muted text-sm">[ MISSION DATA NOT FOUND FOR ID: {id} ]</p>
          <Link href="/vault" className="font-mono text-muted text-xs mt-4 inline-block">
            ← RETURN TO VAULT DASHBOARD
          </Link>
        </div>
      </div>
    );
  }

  const itinerary = trip.itinerary_data as RouteItineraryData | null | undefined;

  // Extract waypoint markers from itinerary_data
  const pois: { name: string; lat: number; lng: number; category?: string }[] = [];
  if (Array.isArray(itinerary?.days)) {
    itinerary.days.forEach(day => {
      if (Array.isArray(day?.itinerary?.path)) {
        day.itinerary.path.forEach(scheduledPoi => {
          const p = scheduledPoi?.poi;
          const lat = p?.location?.latitude;
          const lng = p?.location?.longitude;
          if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
            pois.push({
              name: p?.name || 'Waypoint',
              lat,
              lng,
              category: p?.category
            });
          }
        });
      }
    });
  } else if (Array.isArray(itinerary?.pois)) {
    itinerary.pois.forEach(p => {
      const lat = p?.location?.latitude ?? p?.lat;
      const lng = p?.location?.longitude ?? p?.lng;
      if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
        pois.push({
          name: p?.name || 'Waypoint',
          lat,
          lng,
          category: (p as any)?.category
        });
      }
    });
  }

  // Extract tickets from flight info or itinerary tickets
  const tickets: { title: string; subtitle: string }[] = [];
  if (Array.isArray(itinerary?.tickets)) {
    tickets.push(...itinerary.tickets);
  }
  if (Array.isArray(itinerary?.days)) {
    itinerary.days.forEach(day => {
      if (day.flight_info) {
        const origin = day.flight_info.origin_iata || 'DEP';
        const dest = day.flight_info.destination_iata || 'ARR';
        const dep = day.flight_info.departure_time || '--:--';
        const arr = day.flight_info.arrival_time || '--:--';
        tickets.push({
          title: `${origin} → ${dest} Transit Flight`,
          subtitle: `Dep: ${dep} | Arr: ${arr}`
        });
      }
    });
  }

  const photos: string[] = itinerary?.photos || [];
  const engine = itinerary?.metadata?.engine;
  const nodesEvaluated = itinerary?.metadata?.nodes_evaluated;
  const totalTripCost = itinerary?.total_trip_cost;

  return (
    <div>
      <Link href="/vault" className="text-muted text-sm font-mono" style={{ textDecoration: 'none' }}>
        ← RETURN TO VAULT
      </Link>

      <div style={{ marginTop: '1rem' }}>
        <h2 className="font-display">MISSION DETAILS: {trip.destination.toUpperCase()}</h2>
        <p className="font-mono text-muted text-sm mt-1">
          TIMEFRAME: {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginTop: '2rem' }}>
        {/* Left Column: Interactive Map & Day Routes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Map Container */}
          <div className="bg-surface border-subtle" style={{ height: '400px', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 className="font-mono text-muted text-sm">{'// GLOBAL INTERACTIVE MAP'}</h4>
              <span className="font-mono text-xs text-muted">{pois.length} WAYPOINT{pois.length !== 1 ? 'S' : ''} MAPPED</span>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <MapLoader pois={pois} />
            </div>
          </div>

          {/* Day Routes & Timeline */}
          <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h4 className="font-mono text-muted text-sm">{'// DAY ROUTES & WAYPOINTS'}</h4>
              {itinerary?.days && (
                <span className="font-mono text-xs text-accent">{itinerary.days.length} DAYS COMPUTED</span>
              )}
            </div>
            <TripTimeline
              itinerary={itinerary as OptimizationResult}
              tripId={id}
              onItineraryUpdate={(updated) =>
                setTrip((prev) => (prev ? { ...prev, itinerary_data: updated } : null))
              }
            />
          </div>

          {/* Photo Vault */}
          {photos.length > 0 && (
            <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1rem' }}>
              <h4 className="font-mono text-muted text-sm mb-4">{'// PHOTO VAULT'}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                {photos.map((photo: string, idx: number) => (
                  <div key={idx} style={{ height: '150px', backgroundImage: `url(${photo})`, backgroundSize: 'cover', borderRadius: '4px' }}></div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Mission Parameters & Ticket Wallet */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Mission Parameters Card */}
          <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1.5rem' }}>
            <h4 className="font-mono text-muted text-sm mb-4">{'// MISSION PARAMETERS'}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span className="font-mono text-xs text-muted">DESTINATION</span>
                <p className="font-display text-base mt-0.5">{trip.destination}</p>
              </div>
              <div>
                <span className="font-mono text-xs text-muted">STATUS</span>
                <p className="font-mono text-xs mt-0.5" style={{ color: isTripCompleted(trip) ? '#10B981' : 'var(--color-accent-primary)', fontWeight: 600 }}>
                  {isTripCompleted(trip) ? 'COMPLETED (ARCHIVED)' : 'CONFIRMED (UPCOMING)'}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs text-muted">DEPARTURE</span>
                <p className="font-mono text-sm mt-0.5">{formatDate(trip.start_date)}</p>
              </div>
              <div>
                <span className="font-mono text-xs text-muted">RETURN</span>
                <p className="font-mono text-sm mt-0.5">{formatDate(trip.end_date)}</p>
              </div>
              {totalTripCost !== undefined && totalTripCost !== null && (
                <div>
                  <span className="font-mono text-xs text-muted">TOTAL TRIP COST</span>
                  <p className="font-mono text-accent text-sm mt-0.5 font-bold">€{totalTripCost.toFixed(2)}</p>
                </div>
              )}
              {engine && (
                <div>
                  <span className="font-mono text-xs text-muted">OPTIMIZATION ENGINE</span>
                  <p className="font-mono text-xs mt-0.5 text-muted">{engine} {itinerary?.metadata?.version ? `v${itinerary.metadata.version}` : ''}</p>
                </div>
              )}
              {nodesEvaluated !== undefined && (
                <div>
                  <span className="font-mono text-xs text-muted">NODES EVALUATED</span>
                  <p className="font-mono text-xs mt-0.5">{nodesEvaluated.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Ticket Wallet */}
          <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1.5rem' }}>
            <h4 className="font-mono text-muted text-sm">{'// TICKET WALLET'}</h4>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {tickets.length > 0 ? (
                tickets.map((ticket, idx) => (
                  <div key={idx} style={{ padding: '1rem', border: '1px dashed var(--color-border)', borderRadius: '4px' }}>
                    <p className="font-display text-sm">{ticket.title}</p>
                    <p className="font-mono text-muted text-xs mt-1">{ticket.subtitle}</p>
                  </div>
                ))
              ) : (
                <p className="font-mono text-muted text-xs">[ NO TRANSIT TICKETS ARCHIVED ]</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
