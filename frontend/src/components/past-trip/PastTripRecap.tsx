"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { ChevronLeftIcon } from '@/components/icons';
import type { Trip, TripExpense, TripSettlement } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { useTripTickets } from '@/hooks/useTripTickets';
import { useTrips } from '@/hooks/useTrips';
import { getCountryForDestination } from '@/components/VaultMap';
import { PastTripUserProfile } from './PastTripUserProfile';
import { PastTripFlightTicket } from './PastTripFlightTicket';
import { PastTripParticipants } from './PastTripParticipants';
import TripMapLoader from '@/components/trip-workspace/TripMapLoader';
import type { MapDayGroup, MapPoi } from '@/components/trip-workspace/TripMapView';
import { getScheduledPoiTimes } from '@/utils/date';
import { PastTripDayDots } from './PastTripDayDots';
import { PastTripTabs, PastTripTabId } from './PastTripTabs';
import { PastTripSummaryPanel } from './PastTripSummaryPanel';
import type { DisplayExpenseItem } from '@/components/trip-workspace/costs/ExpenseRow';
import { TripShareModal } from '@/components/trip-workspace/TripShareModal';

interface PastTripRecapProps {
  trip: Trip;
  onTripUpdated?: () => void;
}

export function PastTripRecap({ trip, onTripUpdated }: PastTripRecapProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { updateTrip, getTripExpenses, getTripSettlement } = useTrips();
  const { tickets } = useTripTickets(trip.id || '');

  const [activeTab, setActiveTab] = useState<PastTripTabId>('about');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

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
  const heroPhotoUrl = typeof photos[0] === 'string' ? photos[0] : (photos[0] as unknown as { url?: string })?.url;

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

  // Extract map days, hotel, and airport for TripMapLoader
  const { mapDays, hotel, airport } = useMemo(() => {
    const mapDaysList: MapDayGroup[] = [];
    let hotelAnchor: { name: string; lat: number; lng: number } | undefined;
    let airportAnchor: { name: string; lat: number; lng: number } | undefined;

    const itinObj = trip.itinerary_data as {
      days?: Array<{
        day?: number;
        theme?: string;
        itinerary?: {
          path?: Array<{
            poi?: {
              id?: string;
              name?: string;
              category?: string;
              location?: { latitude?: number; longitude?: number };
              lat?: number;
              lng?: number;
              duration_mins?: number;
              cost_eur?: number;
            };
            arrival_time?: string;
            departure_time?: string;
            transit_from_previous?: unknown;
          }>;
        };
      }>;
      hotel?: { name?: string; location?: { latitude?: number; longitude?: number }; lat?: number; lng?: number };
      travel_constraints?: {
        hotel?: { name?: string; location?: { latitude?: number; longitude?: number }; lat?: number; lng?: number };
      };
      airport?: { name?: string; location?: { latitude?: number; longitude?: number }; lat?: number; lng?: number };
    } | null | undefined;

    if (Array.isArray(itinObj?.days)) {
      itinObj.days.forEach((day, dayIdx) => {
        const dayNumber = day.day ?? (dayIdx + 1);
        const dayPois: MapPoi[] = [];

        if (Array.isArray(day?.itinerary?.path)) {
          day.itinerary.path.forEach((scheduledPoi) => {
            const p = scheduledPoi?.poi;
            const lat =
              p?.location?.latitude ??
              p?.lat;
            const lng =
              p?.location?.longitude ??
              p?.lng;

            if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
              const { start: aTime, end: dTime } = getScheduledPoiTimes(scheduledPoi as any);
              const poiItem: MapPoi = {
                id: p?.id,
                name: p?.name || t('vault.waypoint_default'),
                lat,
                lng,
                category: p?.category,
                arrivalTime: aTime !== '--:--' ? aTime : undefined,
                departureTime: dTime !== '--:--' ? dTime : undefined,
                durationMins: p?.duration_mins,
                costEur: p?.cost_eur,
                transitFromPrevious: scheduledPoi.transit_from_previous as any,
              };
              dayPois.push(poiItem);

              const catUpper = (p?.category || '').toUpperCase();
              const nameLower = (p?.name || '').toLowerCase();
              if ((catUpper === 'HOTEL' || nameLower.includes('hotel')) && !hotelAnchor) {
                hotelAnchor = { name: p?.name || t('vault.hotel_base_camp'), lat, lng };
              }
              if ((catUpper === 'AIRPORT' || catUpper === 'FLIGHT' || nameLower.includes('airport')) && !airportAnchor) {
                airportAnchor = { name: p?.name || t('vault.transit_airport'), lat, lng };
              }
            }
          });
        }

        mapDaysList.push({
          dayNumber,
          label: t('vault.day_upper', { number: dayNumber }),
          theme: day.theme,
          pois: dayPois,
        });
      });
    }

    if (!hotelAnchor) {
      const hInfo = itinObj?.hotel || itinObj?.travel_constraints?.hotel;
      if (hInfo) {
        const lat = hInfo.lat ?? hInfo.location?.latitude;
        const lng = hInfo.lng ?? hInfo.location?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          hotelAnchor = { name: hInfo.name || t('vault.hotel_base_camp'), lat, lng };
        }
      }
    }
    if (!airportAnchor) {
      const aInfo = itinObj?.airport;
      if (aInfo) {
        const lat = aInfo.lat ?? aInfo.location?.latitude;
        const lng = aInfo.lng ?? aInfo.location?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          airportAnchor = { name: aInfo.name || t('vault.transit_airport'), lat, lng };
        }
      }
    }

    return {
      mapDays: mapDaysList,
      hotel: hotelAnchor,
      airport: airportAnchor,
    };
  }, [trip.itinerary_data, t]);

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
        payerName: e.payer_name || t('vault.traveler_singular'),
      };
    });
  }, [expenses, t]);

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
        height: '100vh',
        width: '100vw',
        background: 'var(--color-bg-main, #F5EFEB)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Header matching Trip Workspace Header */}
      <header
        style={{
          height: '56px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 100,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
          <Link
            href="/vault"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              fontWeight: 600,
            }}
          >
            <ChevronLeftIcon size={12} /> {t('vault.vault_back_btn')}
          </Link>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
            <h1
              className="font-display"
              style={{
                fontSize: '1.45rem',
                fontWeight: 300,
                color: 'var(--color-text-primary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '-0.01em',
              }}
            >
              {trip.destination}
            </h1>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              background: 'var(--color-bg-main)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-teal-deep, #0F4C5C)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>{t('workspace.share_expedition')}</span>
          </button>
        </div>
      </header>

      {/* Main Full-Screen Layout Grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 340px) 1fr',
          overflow: 'hidden',
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
            overflowY: 'auto',
            height: '100%',
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
            padding: '1.5rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            overflowY: 'auto',
            height: '100%',
          }}
        >
          {/* 1. Sovereign Keyless Vector Map (identical to Trip Workspace) */}
          <div
            style={{
              height: '380px',
              minHeight: '340px',
              width: '100%',
              borderRadius: '16px',
              overflow: 'hidden',
              position: 'relative',
              border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.12))',
              boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0, 0, 0, 0.06))',
              flexShrink: 0,
            }}
          >
            <TripMapLoader
              days={mapDays}
              hotel={hotel}
              airport={airport}
              activeDay={selectedDay === null ? 'all' : selectedDay}
              onDayChange={(d) => setSelectedDay(d === 'all' ? null : d)}
              isSidebarOpen={false}
              destinationCity={trip.destination}
              readOnly={true}
            />
          </div>

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
                destination={trip.destination}
                tripId={trip.id}
              />
            </section>

            {/* Right Panel: Travelers, Dates, Spend, Action, Photo */}
            <aside>
              <PastTripSummaryPanel
                destination={trip.destination}
                startDate={trip.start_date}
                endDate={trip.end_date}
                participants={trip.participants}
                totalCost={totalCost}
                currency={tripCurrency}
                settlement={settlement}
                heroPhotoUrl={heroPhotoUrl}
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
        @media (prefers-reduced-motion: reduce) {
          @keyframes spinSlow {
            from {
              transform: none;
            }
            to {
              transform: none;
            }
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

      {trip.id && (
        <TripShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          tripId={trip.id}
          destination={trip.destination}
          startDate={trip.start_date}
          endDate={trip.end_date}
          itineraryData={trip.itinerary_data}
        />
      )}
    </div>
  );
}
