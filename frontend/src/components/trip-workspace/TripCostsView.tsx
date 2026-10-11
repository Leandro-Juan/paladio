"use client";

import React from 'react';
import { Trip } from '@/hooks/useTrips';
import { TripBudgetWallet } from '@/components/TripBudgetWallet';
import { RouteItineraryData } from '@/app/vault/[id]/page';

interface TripCostsViewProps {
  trip: Trip;
  itinerary?: RouteItineraryData | null;
  onTripUpdated?: () => void;
}

export function TripCostsView({ trip, itinerary, onTripUpdated }: TripCostsViewProps) {
  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <div>
        <h2 className="font-display" style={{ margin: 0, fontSize: '1.4rem', color: '#FFF' }}>
          EXPENSES & BUDGET DISPATCH
        </h2>
        <p className="font-mono text-muted text-sm mt-1">
          {'// ITEMIZED DISSECTION, MULTI-TRAVELER SPLITTING & SETTLEMENTS'}
        </p>
      </div>

      <div
        style={{
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        }}
      >
        <TripBudgetWallet trip={trip} itinerary={itinerary} onTripUpdated={onTripUpdated} />
      </div>
    </div>
  );
}
