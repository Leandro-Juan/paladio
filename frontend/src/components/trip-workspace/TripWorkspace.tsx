"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Trip } from '@/hooks/useTrips';
import { OptimizationResult, DayOutput } from '@/types/domain';
import { RouteItineraryData } from '@/app/vault/[id]/page';
import { PoiCategoryType } from '@/utils/poiCategory';
import { getScheduledPoiTimes } from '@/utils/date';

import { TripWorkspaceHeader, WorkspaceTab } from './TripWorkspaceHeader';
import { TripPlanSidebar } from './TripPlanSidebar';
import { TripPlacesSidebar, PlaceItem } from './TripPlacesSidebar';
import TripMapLoader from './TripMapLoader';
import { MapDayGroup, MapPoi } from './TripMapView';
import { TripCostsView } from './TripCostsView';
import { TripCollabView } from './TripCollabView';
import { TripPhotosView } from './TripPhotosView';
import { TripWalletView } from './wallet/TripWalletView';
import { useTripTickets } from '@/hooks/useTripTickets';

interface TripWorkspaceProps {
  trip: Trip;
  onTripUpdated?: () => void;
}

export function TripWorkspace({ trip, onTripUpdated }: TripWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('plan');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<PoiCategoryType | null>(null);
  const [focusedPlace, setFocusedPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [transitMode, setTransitMode] = useState<'simple' | 'detailed'>('simple');

  // Query tickets for live count and auto-sync status
  const { tickets: walletTickets } = useTripTickets(trip.id || '');
  const activeTicketsCount = useMemo(() => {
    if (walletTickets.length > 0) {
      return walletTickets.filter((t) => t.status !== 'cancelled').length;
    }
    return trip.tickets_count || 0;
  }, [walletTickets, trip.tickets_count]);

  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    // Backward compatibility: map transports to wallet
    const resolvedTab = tab === 'transports' ? 'wallet' : tab;
    setActiveTab(resolvedTab);
  }, []);

  // Cast itinerary data
  const itinerary = trip.itinerary_data as RouteItineraryData | null | undefined;

  // Extract structured days and waypoints
  const { mapDays, places, hotel, airport, daysOutput } = useMemo(() => {
    const mapDaysList: MapDayGroup[] = [];
    const allPlaces: PlaceItem[] = [];
    const daysOutputList: DayOutput[] = [];
    let hotelAnchor: { name: string; lat: number; lng: number } | undefined;
    let airportAnchor: { name: string; lat: number; lng: number } | undefined;

    if (Array.isArray(itinerary?.days)) {
      itinerary.days.forEach((day, dayIdx) => {
        const dayNumber = day.day ?? (dayIdx + 1);
        const dayPois: MapPoi[] = [];

        if (Array.isArray(day?.itinerary?.path)) {
          day.itinerary.path.forEach((scheduledPoi) => {
            const p = scheduledPoi?.poi;
            const lat = p?.location?.latitude;
            const lng = p?.location?.longitude;

            if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
              const { start: aTime, end: dTime } = getScheduledPoiTimes(scheduledPoi);
              const poiItem: MapPoi = {
                name: p?.name || 'Waypoint',
                lat,
                lng,
                category: p?.category,
                arrivalTime: aTime !== '--:--' ? aTime : undefined,
                departureTime: dTime !== '--:--' ? dTime : undefined,
                durationMins: p?.duration_mins,
                costEur: p?.cost_eur,
                transitFromPrevious: scheduledPoi.transit_from_previous,
              };
              dayPois.push(poiItem);

              allPlaces.push({
                name: p?.name || 'Waypoint',
                lat,
                lng,
                category: p?.category,
                day: dayNumber,
                durationMins: p?.duration_mins,
                costEur: p?.cost_eur,
              });

              const catUpper = (p?.category || '').toUpperCase();
              const nameLower = (p?.name || '').toLowerCase();
              if ((catUpper === 'HOTEL' || nameLower.includes('hotel')) && !hotelAnchor) {
                hotelAnchor = { name: p?.name || 'Hotel Base Camp', lat, lng };
              }
              if ((catUpper === 'AIRPORT' || catUpper === 'FLIGHT' || nameLower.includes('airport')) && !airportAnchor) {
                airportAnchor = { name: p?.name || 'Transit Airport', lat, lng };
              }
            }
          });
        }

        mapDaysList.push({
          dayNumber,
          label: `DAY ${dayNumber}`,
          pois: dayPois,
        });

        daysOutputList.push({
          day: dayNumber,
          theme: (day as unknown as { theme?: string }).theme,
          itinerary: day.itinerary as DayOutput['itinerary'],
          flight_info: day.flight_info as DayOutput['flight_info'],
        });
      });
    } else if (Array.isArray(itinerary?.pois)) {
      const fallbackPois: MapPoi[] = [];
      itinerary.pois.forEach((p) => {
        const lat = p?.location?.latitude ?? p?.lat;
        const lng = p?.location?.longitude ?? p?.lng;
        if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
          const item: MapPoi = {
            name: p?.name || 'Waypoint',
            lat,
            lng,
            category: (p as unknown as { category?: string })?.category,
          };
          fallbackPois.push(item);
          allPlaces.push({
            name: p?.name || 'Waypoint',
            lat,
            lng,
            category: (p as unknown as { category?: string })?.category,
            day: 1,
          });
        }
      });
      mapDaysList.push({ dayNumber: 1, label: 'DAY 1', pois: fallbackPois });
      daysOutputList.push({
        day: 1,
        itinerary: {
          path: fallbackPois.map((poi) => ({
            poi: {
              name: poi.name,
              city: trip.destination || 'Destination',
              category: poi.category || 'attraction',
              cost_eur: poi.costEur || 0,
              duration_mins: poi.durationMins || 60,
              location: { latitude: poi.lat, longitude: poi.lng },
            },
          })),
        },
      });
    }

    return {
      mapDays: mapDaysList,
      places: allPlaces,
      hotel: hotelAnchor,
      airport: airportAnchor,
      daysOutput: daysOutputList,
    };
  }, [itinerary]);

  const handlePlaceClick = useCallback((place: PlaceItem) => {
    setFocusedPlace({ lat: place.lat, lng: place.lng });
    if (place.day) {
      setSelectedDay(place.day);
    }
  }, []);

  const photos = itinerary?.photos || [];
  const participantsCount = trip.participants?.length || 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#FFFFFF',
        color: 'var(--color-text-primary, #0F172A)',
      }}
    >
      {/* Top Header with Navigation Tabs */}
      <TripWorkspaceHeader
        tripId={trip.id}
        destination={trip.destination}
        startDate={trip.start_date}
        endDate={trip.end_date}
        activeTab={activeTab === 'transports' ? 'wallet' : activeTab}
        onTabChange={handleTabChange}
        photosCount={photos.length}
        participantsCount={participantsCount}
        ticketsCount={activeTicketsCount}
      />

      {/* Main Workspace Body */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Tab 1: Plan (Full-bleed 3-panel map workspace) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: activeTab === 'plan' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'plan' ? 'auto' : 'none',
            opacity: activeTab === 'plan' ? 1 : 0,
            transform: activeTab === 'plan' ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.996)',
            transition: 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            willChange: 'opacity, transform',
          }}
        >
          {/* Background Interactive Map */}
          <TripMapLoader
            days={mapDays}
            hotel={hotel}
            airport={airport}
            activeDay={selectedDay}
            onDayChange={setSelectedDay}
            focusedPlace={focusedPlace}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            transitMode={transitMode}
          />

          {/* Left Floating Itinerary Sidebar */}
          <TripPlanSidebar
            isOpen={isLeftOpen}
            onToggle={() => setIsLeftOpen((prev) => !prev)}
            days={daysOutput}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            tripId={trip.id}
            destinationCity={trip.destination}
            itinerary={itinerary as OptimizationResult}
            onItineraryUpdate={onTripUpdated}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            transitMode={transitMode}
            onTransitModeChange={setTransitMode}
          />

          {/* Right Floating Places Sidebar */}
          <TripPlacesSidebar
            isOpen={isRightOpen}
            onToggle={() => setIsRightOpen((prev) => !prev)}
            places={places}
            onPlaceClick={handlePlaceClick}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </div>

        {/* Tab 2: Wallet (replaces transports with backward compatibility) */}
        {(activeTab === 'wallet' || activeTab === 'transports') && (
          <div key="wallet" className="animate-tab-pane" style={{ height: '100%', overflowY: 'auto' }}>
            <TripWalletView tripId={trip.id || ''} itinerary={itinerary} />
          </div>
        )}

        {/* Tab 3: Costs */}
        {activeTab === 'costs' && (
          <div key="costs" className="animate-tab-pane" style={{ height: '100%', overflowY: 'auto' }}>
            <TripCostsView trip={trip} itinerary={itinerary} onTripUpdated={onTripUpdated} />
          </div>
        )}

        {/* Tab 4: Collab */}
        {activeTab === 'collab' && (
          <div key="collab" className="animate-tab-pane" style={{ height: '100%', overflowY: 'auto' }}>
            <TripCollabView trip={trip} onTripUpdated={onTripUpdated} />
          </div>
        )}

        {/* Tab 5: Photos */}
        {activeTab === 'photos' && (
          <div key="photos" className="animate-tab-pane" style={{ height: '100%', overflowY: 'auto' }}>
            <TripPhotosView photos={photos} />
          </div>
        )}
      </div>
    </div>
  );
}
