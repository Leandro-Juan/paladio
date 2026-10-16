"use client";

import React, { useState, useMemo, useCallback } from 'react';
import NextImage from 'next/image';
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
  const [isRightOpen, setIsRightOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [categoryFilter, setCategoryFilter] = useState<PoiCategoryType | null>(null);
  const [focusedPlace, setFocusedPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [transitMode, setTransitMode] = useState<'simple' | 'detailed'>('simple');

  const handleToggleLeft = useCallback(() => {
    setIsLeftOpen((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsRightOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleRight = useCallback(() => {
    setIsRightOpen((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsLeftOpen(false);
      }
      return next;
    });
  }, []);

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

  // Local reactive itinerary data
  const [prevItineraryProp, setPrevItineraryProp] = useState(trip.itinerary_data);
  const [currentItinerary, setCurrentItinerary] = useState<RouteItineraryData | null | undefined>(
    trip.itinerary_data as RouteItineraryData | null | undefined
  );

  if (trip.itinerary_data !== prevItineraryProp) {
    setPrevItineraryProp(trip.itinerary_data);
    setCurrentItinerary(trip.itinerary_data as RouteItineraryData | null | undefined);
  }

  const itinerary = currentItinerary;

  const handleItineraryUpdate = useCallback((updated: OptimizationResult) => {
    setCurrentItinerary(updated as unknown as RouteItineraryData);
  }, []);

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
            const lat =
              p?.location?.latitude ??
              (p as unknown as { lat?: number })?.lat ??
              (p as unknown as { latitude?: number })?.latitude;
            const lng =
              p?.location?.longitude ??
              (p as unknown as { lng?: number })?.lng ??
              (p as unknown as { longitude?: number })?.longitude;

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

    if (!hotelAnchor) {
      const hInfo = (itinerary as unknown as { hotel?: { name?: string; location?: { latitude?: number; longitude?: number }; lat?: number; lng?: number } })?.hotel ||
        (itinerary as unknown as { travel_constraints?: { hotel?: { name?: string; location?: { latitude?: number; longitude?: number }; lat?: number; lng?: number } } })?.travel_constraints?.hotel;
      if (hInfo) {
        const lat = hInfo.lat ?? hInfo.location?.latitude;
        const lng = hInfo.lng ?? hInfo.location?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          hotelAnchor = { name: hInfo.name || 'Hotel Base Camp', lat, lng };
        }
      }
    }
    if (!airportAnchor) {
      const aInfo = (itinerary as unknown as { airport?: { name?: string; location?: { latitude?: number; longitude?: number }; lat?: number; lng?: number } })?.airport;
      if (aInfo) {
        const lat = aInfo.lat ?? aInfo.location?.latitude;
        const lng = aInfo.lng ?? aInfo.location?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          airportAnchor = { name: aInfo.name || 'Transit Airport', lat, lng };
        }
      }
    }

    return {
      mapDays: mapDaysList,
      places: allPlaces,
      hotel: hotelAnchor,
      airport: airportAnchor,
      daysOutput: daysOutputList,
    };
  }, [itinerary, trip.destination]);

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
        background: 'var(--color-bg-main)',
        color: 'var(--color-text-main)',
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
            onToggle={handleToggleLeft}
            days={daysOutput}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            tripId={trip.id}
            destinationCity={trip.destination}
            itinerary={itinerary as OptimizationResult}
            onItineraryUpdate={handleItineraryUpdate}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            transitMode={transitMode}
            onTransitModeChange={setTransitMode}
          />

          {/* Right Floating POI Search Engine Sidebar */}
          <TripPlacesSidebar
            isOpen={isRightOpen}
            onToggle={handleToggleRight}
            city={trip.destination}
            places={places}
            onPlaceClick={handlePlaceClick}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            hotelAnchor={hotel}
            airportAnchor={airport}
            tripId={trip.id}
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

      {/* Pre-rendered 1x1 transparent image for suppressing native browser drag ghost/file icons */}
      <NextImage
        id="paladio-drag-blank-img"
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        alt=""
        width={1}
        height={1}
        unoptimized
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
