"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Trip, TripExpense, TripSettlement } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { useTripTickets } from '@/hooks/useTripTickets';
import { useTrips } from '@/hooks/useTrips';
import { getCountryForDestination } from '@/components/VaultMap';
import { PastTripUserProfile } from './PastTripUserProfile';
import { PastTripFlightTicket } from './PastTripFlightTicket';
import { PastTripParticipants } from './PastTripParticipants';
import { PastTripRouteMap } from './PastTripRouteMap';
import { PastTripDayDots } from './PastTripDayDots';
import { PastTripTabs, PastTripTabId } from './PastTripTabs';
import { PastTripSummaryPanel } from './PastTripSummaryPanel';
import type { DisplayExpenseItem } from '@/components/trip-workspace/costs/ExpenseRow';

interface PastTripRecapProps {
  trip: Trip;
  onTripUpdated?: () => void;
}

export function PastTripRecap({ trip, onTripUpdated }: PastTripRecapProps) {
  const { user } = useAuth();
  const { updateTrip, getTripExpenses, getTripSettlement } = useTrips();
  const { tickets } = useTripTickets(trip.id || '');

  const [activeTab, setActiveTab] = useState<PastTripTabId>('about');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [settlement, setSettlement] = useState<TripSettlement | null>(null);

  // Load expenses and settlement dynamically
  const tripId = trip.id || '';
  useEffect(() => {
    if (!tripId) return;
    let isMounted = true;

    async function loadFinances() {
      const [expData, setlData] = await Promise.all([
        getTripExpenses(tripId),
        getTripSettlement(tripId),
      ]);
      if (!isMounted) return;
      if (expData) setExpenses(expData);
      if (setlData) setSettlement(setlData);
    }

    loadFinances();
    return () => {
      isMounted = false;
    };
  }, [tripId, getTripExpenses, getTripSettlement]);

  // Extract itinerary data fields safely
  const itin = useMemo(() => {
    return (trip.itinerary_data || {}) as {
      description?: string;
      notes?: string;
      photos?: string[];
      travel_constraints?: {
        departure_city?: string;
        origin_iata?: string;
      };
      days?: Array<{
        day?: number;
        itinerary?: {
          path?: Array<{
            poi?: {
              name?: string;
            };
          }>;
        };
      }>;
    };
  }, [trip.itinerary_data]);

  const description = itin.description || '';
  const notes = itin.notes || '';
  const photos = itin.photos || [];

  // Find first POI name for photo resolution
  const firstPoiName = useMemo(() => {
    const firstPath = itin.days?.[0]?.itinerary?.path;
    return firstPath?.[0]?.poi?.name;
  }, [itin]);

  // Compute total waypoints
  const totalWaypoints = useMemo(() => {
    let count = 0;
    if (itin.days && Array.isArray(itin.days)) {
      itin.days.forEach((d) => {
        if (d.itinerary?.path && Array.isArray(d.itinerary.path)) {
          count += d.itinerary.path.length;
        }
      });
    }
    return count;
  }, [itin]);

  // Compute total days
  const totalDays = useMemo(() => {
    if (itin.days && Array.isArray(itin.days) && itin.days.length > 0) {
      return itin.days.length;
    }
    try {
      const s = new Date(trip.start_date);
      const e = new Date(trip.end_date);
      return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    } catch {
      return 1;
    }
  }, [itin, trip.start_date, trip.end_date]);

  // Find primary flight ticket
  const flightTicket = useMemo(() => {
    const flightTickets = tickets.filter((t) => t.ticket_type === 'flight');
    return flightTickets.length > 0 ? flightTickets[0] : null;
  }, [tickets]);

  // Map expenses to DisplayExpenseItem
  const expenseItems: DisplayExpenseItem[] = useMemo(() => {
    return expenses.map((e) => {
      const amt = Number(e.amount) || 0;
      return {
        id: e.id,
        source: 'logged',
        title: e.description,
        category: e.category,
        amount: amt,
        convertedAmount: amt,
        currency: e.currency || 'EUR',
        date: e.expense_date || undefined,
        payerId: e.payer_id,
        payerName: e.payer_name || 'Traveler',
      };
    });
  }, [expenses]);

  const totalCost = useMemo(() => {
    if (settlement?.total_expenses !== undefined) {
      return settlement.total_expenses;
    }
    return expenseItems.reduce((sum, item) => sum + item.amount, 0);
  }, [settlement, expenseItems]);

  const tripCurrency = settlement?.currency || expenses[0]?.currency || 'EUR';

  // Save description and notes directly into itinerary_data
  const handleSaveDescriptionAndNotes = useCallback(
    async (newDesc: string, newNotes: string) => {
      if (!trip.id) return false;
      const updatedItin = {
        ...(typeof trip.itinerary_data === 'object' && trip.itinerary_data !== null
          ? trip.itinerary_data
          : {}),
        description: newDesc,
        notes: newNotes,
      };

      const res = await updateTrip(trip.id, {
        itinerary_data: updatedItin,
      });

      if (res) {
        if (onTripUpdated) onTripUpdated();
        return true;
      }
      return false;
    },
    [trip.id, trip.itinerary_data, updateTrip, onTripUpdated]
  );

  const countryName = getCountryForDestination(trip.destination);
  const primaryParticipant = trip.participants?.[0] || null;

  return (
    <div
      style={{
        minHeight: '100%',
        width: '100%',
        background: 'var(--color-bg-main, #F5EFEB)',
        padding: '1.5rem',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      {/* Centered Mockup Card Shell */}
      <div
        style={{
          width: '100%',
          maxWidth: '1280px',
          background: 'var(--color-surface-card, #FAF6F0)',
          borderRadius: '24px',
          boxShadow: 'var(--shadow-card, 0 10px 40px rgba(0, 0, 0, 0.07))',
          border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
          display: 'grid',
          gridTemplateColumns: 'minmax(270px, 320px) 1fr',
          overflow: 'hidden',
          minHeight: '800px',
        }}
        className="vault-recap-grid"
      >
        {/* LEFT COLUMN: User Profile, Flight Ticket, Participants */}
        <aside
          style={{
            background: 'var(--color-surface-card, #FAF6F0)',
            borderRight: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
            padding: '1.5rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* User profile & telemetry badges */}
          <PastTripUserProfile
            primaryParticipant={primaryParticipant}
            currentUsername={user?.username}
            totalWaypoints={totalWaypoints}
            totalDays={totalDays}
          />

          {/* Flight ticket card with barcode */}
          <PastTripFlightTicket
            ticket={flightTicket}
            destination={trip.destination}
            startDate={trip.start_date}
            endDate={trip.end_date}
            travelersCount={Math.max(1, trip.participants?.length || 1)}
            totalCost={totalCost}
            currency={tripCurrency}
            origin={itin.travel_constraints?.departure_city}
          />

          {/* Participants list (placed directly below the flight ticket) */}
          <PastTripParticipants
            participants={trip.participants}
            fallbackUserName={user?.username}
          />
        </aside>

        {/* RIGHT MAIN AREA: Map Banner, Day Dots, Tabs, Split Body */}
        <main
          style={{
            background: '#FFFFFF',
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            overflowY: 'auto',
          }}
        >
          {/* 1. Hero Map Banner (substituting the photo in the mockup) */}
          <PastTripRouteMap
            destination={trip.destination}
            country={countryName}
            itineraryData={trip.itinerary_data}
            selectedDay={selectedDay}
            height="290px"
          />

          {/* 2. Carousel Day Dots (matching mockup pagination dots) */}
          <PastTripDayDots
            totalDays={totalDays}
            selectedDay={selectedDay}
            onSelectDay={(d) => setSelectedDay(d)}
          />

          {/* 3. Bottom Area: Tabs on Left, Summary + Photo on Right */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.95fr)',
              gap: '2rem',
              marginTop: '0.5rem',
            }}
            className="vault-recap-split"
          >
            {/* Tabs & Content */}
            <section>
              <PastTripTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                description={description}
                notes={notes}
                onSaveDescriptionAndNotes={handleSaveDescriptionAndNotes}
                itineraryData={trip.itinerary_data}
                selectedDay={selectedDay}
                participants={trip.participants || []}
                settlement={settlement}
                expenseItems={expenseItems}
                currency={tripCurrency}
                photos={photos}
              />
            </section>

            {/* Right Panel: Travelers, Dates, Spend, Action, Photo */}
            <aside>
              <PastTripSummaryPanel
                tripId={tripId}
                destination={trip.destination}
                startDate={trip.start_date}
                endDate={trip.end_date}
                participants={trip.participants}
                totalCost={totalCost}
                currency={tripCurrency}
                settlement={settlement}
                heroPhotoUrl={photos[0]}
                firstPoiName={firstPoiName}
              />
            </aside>
          </div>
        </main>
      </div>

      <style jsx global>{`
        @keyframes spinSlow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @media (max-width: 960px) {
          .vault-recap-grid {
            grid-template-columns: 1fr !important;
          }
          .vault-recap-split {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
