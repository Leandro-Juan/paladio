"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trip, useTrips } from '@/hooks/useTrips';
import { OptimizationResult, DayOutput, RouteItineraryData, PoiDetail, TripPhotoItem } from '@/types/domain';
import { PoiCategoryType } from '@/utils/poiCategory';
import { getScheduledPoiTimes } from '@/utils/date';
import { notify } from '@/utils/notify';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

import { TripWorkspaceHeader, WorkspaceTab } from './TripWorkspaceHeader';
import { TripUnifiedSidebar, MainTabType } from './TripUnifiedSidebar';
import { TripSpeedDial } from './TripSpeedDial';
import { PoiDetailView } from './PoiDetailView';
import { PlaceItem, PoiApiItem } from '@/types/workspace';
import TripMapLoader from './TripMapLoader';
import { MapDayGroup, MapPoi, CategoryPoiItem, SpatialCircleFilter } from './TripMapView';
import { ActiveTransitLineData } from '@/utils/transitColors';
import { TripCostsView } from './TripCostsView';
import { TripConfigView } from './TripConfigView';
import { TripPhotosView } from './TripPhotosView';
import { TripWalletView } from './wallet/TripWalletView';
import { WorkspaceContextData } from '@/components/trip-agent';

interface TripWorkspaceProps {
  trip: Trip;
  onTripUpdated?: () => void;
}

export function TripWorkspace({ trip, onTripUpdated }: TripWorkspaceProps) {
  const { updateTrip, reoptimizeTrip } = useTrips();
  const searchParams = useSearchParams();
  const initialSidebarTab = useMemo<MainTabType>(() => {
    const tab = searchParams?.get('tab');
    if (tab === 'saved' || tab === 'collections') return 'saved';
    if (tab === 'agent') return 'agent';
    return 'route';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('plan');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isReoptimizing, setIsReoptimizing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<PoiCategoryType | null>(null);
  const [focusedPlace, setFocusedPlace] = useState<(PlaceItem & { timestamp?: number }) | null>(null);
  const [transitMode, setTransitMode] = useState<'simple' | 'detailed'>('simple');
  const [categoryPois, setCategoryPois] = useState<CategoryPoiItem[]>([]);
  const [sidebarTab, setSidebarTab] = useState<MainTabType>(initialSidebarTab);
  const [inspectedPoiId, setInspectedPoiId] = useState<string | null>(null);
  const [inspectedPoiFallback, setInspectedPoiFallback] = useState<Partial<PoiDetail> | null>(null);
  const [renderedPoi, setRenderedPoi] = useState<{ id: string; fallback: Partial<PoiDetail> | null } | null>(null);
  const [activeTransitLine, setActiveTransitLine] = useState<ActiveTransitLineData | null>(null);
  const [activeMapPickField, setActiveMapPickField] = useState<'origin' | 'destination' | null>(null);
  const [spatialCircle, setSpatialCircle] = useState<SpatialCircleFilter | null>(null);
  const [isDroppingWaypoint, setIsDroppingWaypoint] = useState(false);

  const handleToggleDropWaypoint = useCallback(() => {
    setIsDroppingWaypoint((prev) => {
      const next = !prev;
      if (next) {
        window.setTimeout(() => {
          notify.info('Waypoint Drop Mode', 'Click anywhere on the map to place the area search center.');
        }, 0);
      }
      return next;
    });
  }, []);

  const handleSetSpatialCircle = useCallback((circle: SpatialCircleFilter | null) => {
    setSpatialCircle(circle);
    if (circle && sidebarTab === 'route') {
      setSidebarTab('search');
    }
  }, [sidebarTab]);

  const handleClearSpatialCircle = useCallback(() => {
    setSpatialCircle(null);
    setIsDroppingWaypoint(false);
    window.setTimeout(() => {
      notify.info('Area Filter Cleared', 'Returned to full city results.');
    }, 0);
  }, []);

  const agentUiContext: WorkspaceContextData = useMemo(() => ({
    active_tab: activeTab,
    selected_day: selectedDay,
    selected_stop_id: inspectedPoiId || undefined,
    destination: trip.destination,
  }), [activeTab, selectedDay, inspectedPoiId, trip.destination]);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      const next = !prev;
      window.setTimeout(() => {
        notify.info(
          next ? 'Route Editing Mode Active' : 'Route Editing Mode Disabled',
          next
            ? 'You can now drag & reorder waypoints, reorder days, and manage stop locks.'
            : 'Waypoint orders and stop locks are now locked.'
        );
      }, 0);
      return next;
    });
  }, []);

  const handleToggleTransitMode = useCallback(() => {
    setTransitMode((prev) => (prev === 'simple' ? 'detailed' : 'simple'));
  }, []);

  const handleCategoryPoisChange = useCallback((pois: PoiApiItem[]) => {
    setCategoryPois(
      pois.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        durationMins: p.duration_mins,
        costEur: p.cost_eur,
        similarity: p.similarity,
        description: p.description,
      }))
    );
  }, []);

  const handleCategoryFilterChange = useCallback((cat: PoiCategoryType | null) => {
    setCategoryFilter(cat);
    setCategoryPois([]);
  }, []);

  const handleSidebarTabChange = useCallback((tab: MainTabType) => {
    setSidebarTab(tab);
    if (tab !== 'transit') {
      setActiveTransitLine(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
        window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
      }
    }
    if (tab === 'route' || tab === 'transit' || tab === 'weather' || tab === 'agent') {
      // Clear category search results
      setCategoryFilter(null);
      setCategoryPois([]);
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab);
    if (tab !== 'plan') {
      setActiveTransitLine(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
        window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
      }
    }
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

  const handleItineraryUpdate = useCallback(
    (updated: OptimizationResult) => {
      setCurrentItinerary(updated as unknown as RouteItineraryData);
      if (trip.id) {
        updateTrip(trip.id, { itinerary_data: updated as unknown as Record<string, unknown> });
      }
    },
    [trip.id, updateTrip]
  );

  const handleReoptimizeDay = useCallback(async () => {
    if (isReoptimizing) return;
    if (!trip.id) {
      notify.error('No Trip ID', 'Trip must be saved before solving routes with C++ engine.');
      return;
    }
    const targetDay = selectedDay === 'all' ? undefined : selectedDay;
    setIsReoptimizing(true);
    try {
      const res = await reoptimizeTrip(
        trip.id,
        currentItinerary ? { itinerary_data: currentItinerary } : undefined,
        targetDay
      );
      const updatedItin = res?.itinerary_data as RouteItineraryData | undefined;
      if (updatedItin) {
        setCurrentItinerary(updatedItin);
      }
      notify.success(
        targetDay !== undefined ? `Day ${targetDay} Re-optimized` : 'All Days Re-optimized',
        'Deterministic engine solved optimal sequence and transit timing.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Route re-optimization failed';
      notify.error('Re-optimization Failed', msg);
    } finally {
      setIsReoptimizing(false);
    }
  }, [isReoptimizing, trip.id, selectedDay, currentItinerary, reoptimizeTrip]);

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
                id: p?.id,
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
                id: p?.id,
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
          theme: (day as unknown as { theme?: string }).theme,
          pois: dayPois,
        });

        daysOutputList.push({
          day: dayNumber,
          theme: (day as unknown as { theme?: string }).theme,
          itinerary: day.itinerary as DayOutput['itinerary'],
          flight_info: day.flight_info as DayOutput['flight_info'],
        });
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
  }, [itinerary]);

  const handlePlaceClick = useCallback((place: PlaceItem) => {
    setFocusedPlace({
      ...place,
      timestamp: Date.now(),
    });
    if (place.day) {
      setSelectedDay(place.day);
    }
    // Always show POI details on the right when a POI is clicked
    if (place.id || place.name) {
      const pid = place.id || place.name || 'waypoint';
      const fallback = {
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        duration_mins: place.durationMins,
        cost_eur: place.costEur,
        description: place.description,
      };
      setInspectedPoiId(pid);
      setInspectedPoiFallback(fallback);
      setRenderedPoi({ id: pid, fallback });
    }
  }, []);

  const handleSelectDay = useCallback((day: number | 'all') => {
    setSelectedDay(day);
    setFocusedPlace((prev) => (prev?.day && prev.day !== day ? null : prev));
    setActiveTransitLine(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
      window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
    }
  }, []);

  const isInspectorOpen = Boolean(inspectedPoiId);

  const handleInspectPoi = useCallback((id: string, fallbackData?: Partial<PoiDetail>) => {
    setInspectedPoiId(id);
    setInspectedPoiFallback(fallbackData || null);
    setRenderedPoi({ id, fallback: fallbackData || null });
    setIsSidebarOpen(true);

    const lat = fallbackData?.lat ?? (fallbackData as unknown as { location?: { latitude?: number } })?.location?.latitude;
    const lng = fallbackData?.lng ?? (fallbackData as unknown as { location?: { longitude?: number } })?.location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      setFocusedPlace({
        id,
        name: fallbackData?.name || id,
        lat,
        lng,
        category: (fallbackData?.category as string) || 'attraction',
        durationMins: fallbackData?.duration_mins,
        costEur: fallbackData?.cost_eur,
        timestamp: Date.now(),
      });
    }
  }, []);

  // Check for deep-linked POI inspection via query parameters
  const deepLinkPoi = searchParams?.get('poi');
  const deepLinkName = searchParams?.get('name');
  const deepLinkLat = searchParams?.get('lat');
  const deepLinkLng = searchParams?.get('lng');
  const deepLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const targetKey = deepLinkPoi || deepLinkName;
    if (!targetKey || deepLinkHandledRef.current === targetKey) return;

    const targetLower = targetKey.trim().toLowerCase();
    const nameLower = (deepLinkName || '').trim().toLowerCase();

    // Try finding in parsed places
    const matchedPlace = places.find((p) => {
      const pId = (p.id || '').toLowerCase();
      const pName = (p.name || '').trim().toLowerCase();
      return (
        (deepLinkPoi && pId === deepLinkPoi.toLowerCase()) ||
        pName === targetLower ||
        (nameLower && pName === nameLower)
      );
    });

    if (matchedPlace) {
      deepLinkHandledRef.current = targetKey;
      queueMicrotask(() => {
        handlePlaceClick(matchedPlace);
      });
    } else if (trip) {
      // If not in standard places array or trip has no waypoints yet, inspect directly
      deepLinkHandledRef.current = targetKey;
      const parsedLat = deepLinkLat ? parseFloat(deepLinkLat) : undefined;
      const parsedLng = deepLinkLng ? parseFloat(deepLinkLng) : undefined;
      const hasCoords = typeof parsedLat === 'number' && typeof parsedLng === 'number' && !isNaN(parsedLat) && !isNaN(parsedLng);
      queueMicrotask(() => {
        handleInspectPoi(deepLinkPoi || deepLinkName || 'waypoint', {
          id: deepLinkPoi || undefined,
          name: deepLinkName || deepLinkPoi || 'Waypoint',
          lat: hasCoords ? parsedLat : undefined,
          lng: hasCoords ? parsedLng : undefined,
        });
      });
    }
  }, [deepLinkPoi, deepLinkName, deepLinkLat, deepLinkLng, places, trip, handlePlaceClick, handleInspectPoi]);

  const scheduledPoiDay = useMemo(() => {
    if (!inspectedPoiId && !inspectedPoiFallback?.name) return null;
    const idToMatch = (inspectedPoiId || '').toLowerCase();
    const nameToMatch = (inspectedPoiFallback?.name || '').toLowerCase();

    for (const d of daysOutput) {
      const path = d.itinerary?.path || [];
      const found = path.some((step) => {
        const stepId = (step.poi?.id || '').toLowerCase();
        const stepName = (step.poi?.name || '').toLowerCase();
        return (
          (stepId && idToMatch && stepId === idToMatch) ||
          (stepName && nameToMatch && stepName === nameToMatch) ||
          (stepName && idToMatch && stepName === idToMatch)
        );
      });
      if (found) return d.day;
    }
    return null;
  }, [inspectedPoiId, inspectedPoiFallback?.name, daysOutput]);

  const handleCloseInspect = useCallback(() => {
    setInspectedPoiId(null);
    setInspectedPoiFallback(null);
  }, []);

  useEffect(() => {
    const handleSwitchToRoute = () => {
      setIsSidebarOpen(true);
    };
    const handleShowTransitLine = (e: Event) => {
      const customEvent = e as CustomEvent<ActiveTransitLineData>;
      if (customEvent.detail) {
        setActiveTransitLine(customEvent.detail);
      }
    };
    const handleClearTransitLine = () => {
      setActiveTransitLine(null);
    };
    const handlePoiDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) {
        const deletedId = customEvent.detail.id;
        setInspectedPoiId((prev) => (prev === deletedId ? null : prev));
        setInspectedPoiFallback((prev) => (prev?.id === deletedId ? null : prev));
        setRenderedPoi((prev) => (prev?.id === deletedId ? null : prev));
      }
    };

    const handleInspectPoiEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; fallbackData?: Partial<PoiDetail> }>;
      if (customEvent.detail?.id) {
        handleInspectPoi(customEvent.detail.id, customEvent.detail.fallbackData);
      }
    };

    window.addEventListener('paladio:switch-to-route', handleSwitchToRoute);
    window.addEventListener('paladio:show-transit-line', handleShowTransitLine);
    window.addEventListener('paladio:clear-transit-line', handleClearTransitLine);
    window.addEventListener('paladio:inspect-poi', handleInspectPoiEvent);
    window.addEventListener('paladio:poi-deleted', handlePoiDeleted);
    return () => {
      window.removeEventListener('paladio:switch-to-route', handleSwitchToRoute);
      window.removeEventListener('paladio:show-transit-line', handleShowTransitLine);
      window.removeEventListener('paladio:clear-transit-line', handleClearTransitLine);
      window.removeEventListener('paladio:inspect-poi', handleInspectPoiEvent);
      window.removeEventListener('paladio:poi-deleted', handlePoiDeleted);
    };
  }, [handleInspectPoi]);

  const handleFocusFromDrawer = useCallback(
    (poi: { id?: string; lat: number; lng: number; name: string; category: string; durationMins?: number; costEur?: number }) => {
      handlePlaceClick({
        id: poi.id || inspectedPoiId || undefined,
        name: poi.name,
        lat: poi.lat,
        lng: poi.lng,
        category: poi.category,
        durationMins: poi.durationMins,
        costEur: poi.costEur,
      });
    },
    [handlePlaceClick, inspectedPoiId]
  );

  const handlePoiLoaded = useCallback((loadedPoi: PoiDetail) => {
    if (
      typeof loadedPoi.lat === 'number' &&
      typeof loadedPoi.lng === 'number' &&
      !isNaN(loadedPoi.lat) &&
      !isNaN(loadedPoi.lng) &&
      !(loadedPoi.lat === 0 && loadedPoi.lng === 0)
    ) {
      setFocusedPlace((prev) => {
        if (
          prev &&
          Math.abs(prev.lat - loadedPoi.lat) < 0.0001 &&
          Math.abs(prev.lng - loadedPoi.lng) < 0.0001
        ) {
          return prev;
        }
        return {
          id: loadedPoi.id,
          name: loadedPoi.name,
          lat: loadedPoi.lat,
          lng: loadedPoi.lng,
          category: (loadedPoi.category as string) || 'attraction',
          durationMins: loadedPoi.duration_mins,
          costEur: loadedPoi.cost_eur,
          timestamp: Date.now(),
        };
      });
    }
  }, []);

  const handleAddPoiToDay = useCallback(
    (dayNum: number, poi: PoiDetail) => {
      if (!currentItinerary) return;
      const cloned: RouteItineraryData = JSON.parse(JSON.stringify(currentItinerary));
      if (!Array.isArray(cloned.days)) cloned.days = [];
      let targetDay = cloned.days.find((d) => (d.day ?? 1) === dayNum);
      if (!targetDay) {
        targetDay = { day: dayNum, itinerary: { path: [] } };
        cloned.days.push(targetDay);
      }
      if (!targetDay.itinerary) targetDay.itinerary = { path: [] };
      if (!Array.isArray(targetDay.itinerary.path)) targetDay.itinerary.path = [];

      const newStop = {
        poi: {
          id: poi.id,
          name: poi.name,
          city: poi.city || trip.destination,
          category: poi.category,
          location: { latitude: poi.lat, longitude: poi.lng },
          duration_mins: poi.duration_mins || 60,
          cost_eur: poi.cost_eur || 0,
        },
        scheduled_start: '10:00',
        scheduled_end: '11:00',
      };
      targetDay.itinerary.path.push(newStop);
      setCurrentItinerary(cloned);
      if (trip.id) {
        updateTrip(trip.id, { itinerary_data: cloned as unknown as Record<string, unknown> });
      }
      notify.success(
        'Place Added to Itinerary',
        `Added "${poi.name}" to Day ${dayNum}. Click Re-Optimize Route to recalculate.`
      );
    },
    [currentItinerary, trip.destination, trip.id, updateTrip]
  );

  const photos = itinerary?.photos || [];

  const handlePhotosChange = useCallback(
    (updatedPhotos: Array<string | TripPhotoItem>) => {
      const cloned = currentItinerary
        ? { ...currentItinerary, photos: updatedPhotos }
        : { photos: updatedPhotos };
      setCurrentItinerary(cloned as RouteItineraryData);
      if (onTripUpdated) {
        onTripUpdated();
      }
    },
    [currentItinerary, onTripUpdated]
  );

  const handleUpdatePoi = useCallback(
    (updatedPoi: PoiDetail) => {
      if (!currentItinerary || !updatedPoi?.id) return;
      const cloned: RouteItineraryData = JSON.parse(JSON.stringify(currentItinerary));
      let changed = false;

      if (Array.isArray(cloned.days)) {
        for (const day of cloned.days) {
          if (Array.isArray(day.itinerary?.path)) {
            for (const stop of day.itinerary.path) {
              if (stop.poi && (stop.poi.id === updatedPoi.id || stop.poi.name === updatedPoi.name)) {
                stop.poi.name = updatedPoi.name;
                stop.poi.category = updatedPoi.category;
                if (updatedPoi.duration_mins) stop.poi.duration_mins = updatedPoi.duration_mins;
                if (typeof updatedPoi.cost_eur === 'number') stop.poi.cost_eur = updatedPoi.cost_eur;
                changed = true;
              }
            }
          }
        }
      }

      if (changed) {
        setCurrentItinerary(cloned);
        if (trip.id) {
          updateTrip(trip.id, { itinerary_data: cloned as unknown as Record<string, unknown> });
        }
      }
    },
    [currentItinerary, trip.id, updateTrip]
  );

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
        itineraryData={trip.itinerary_data}
        activeTab={activeTab}
        onTabChange={handleTabChange}
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
            onDayChange={handleSelectDay}
            focusedPlace={focusedPlace}
            categoryFilter={sidebarTab === 'route' ? null : categoryFilter}
            onCategoryFilterChange={handleCategoryFilterChange}
            transitMode={transitMode}
            categoryPois={sidebarTab === 'route' ? [] : categoryPois}
            isSidebarOpen={isSidebarOpen}
            sidebarTab={sidebarTab}
            destinationCity={trip.destination}
            activeTransitLine={activeTransitLine}
            onClearTransitLine={() => setActiveTransitLine(null)}
            activeMapPickField={activeMapPickField}
            onCancelMapPick={() => setActiveMapPickField(null)}
            spatialCircle={spatialCircle}
            onSpatialCircleChange={handleSetSpatialCircle}
            isDroppingWaypoint={isDroppingWaypoint}
            onCancelDropWaypoint={() => setIsDroppingWaypoint(false)}
            onClearSpatialCircle={handleClearSpatialCircle}
            onInspectPoi={handleInspectPoi}
            onSelectCategoryPoi={(poi) =>
              handlePlaceClick({
                id: poi.id,
                name: poi.name,
                lat: poi.lat,
                lng: poi.lng,
                category: poi.category,
                durationMins: poi.durationMins,
                costEur: poi.costEur,
                description: poi.description,
              })
            }
          />

          {/* Unified Floating Tactical Command Panel */}
          <TripUnifiedSidebar
            isOpen={isSidebarOpen}
            onToggle={handleToggleSidebar}
            tripId={trip.id}
            tripStartDate={trip.start_date}
            tripEndDate={trip.end_date}
            destinationCity={trip.destination}
            days={daysOutput}
            selectedDay={selectedDay}
            onSelectDay={handleSelectDay}
            itinerary={itinerary as OptimizationResult}
            onItineraryUpdate={handleItineraryUpdate}
            categoryFilter={sidebarTab === 'route' ? null : categoryFilter}
            onCategoryFilterChange={handleCategoryFilterChange}
            transitMode={transitMode}
            onTransitModeChange={setTransitMode}
            places={places}
            onPlaceClick={handlePlaceClick}
            onCategoryPoisChange={handleCategoryPoisChange}
            hotelAnchor={hotel}
            airportAnchor={airport}
            onInspectPoi={handleInspectPoi}
            inspectedPoiId={inspectedPoiId}
            onCloseInspect={handleCloseInspect}
            onAddToDay={handleAddPoiToDay}
            onFocusFromInspector={handleFocusFromDrawer}
            availableDays={daysOutput.map((d) => d.day)}
            initialDay={typeof selectedDay === 'number' ? selectedDay : 1}
            sidebarTab={sidebarTab}
            onTabChange={handleSidebarTabChange}
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            onReoptimizeDay={handleReoptimizeDay}
            isReoptimizing={isReoptimizing}
            onToggleTransitMode={handleToggleTransitMode}
            activeMapPickField={activeMapPickField}
            onStartMapPick={(field) => setActiveMapPickField(field)}
            onCancelMapPick={() => setActiveMapPickField(null)}
            spatialCircle={spatialCircle}
            onSpatialCircleChange={handleSetSpatialCircle}
            isDroppingWaypoint={isDroppingWaypoint}
            onToggleDropWaypoint={handleToggleDropWaypoint}
            onClearSpatialCircle={handleClearSpatialCircle}
            uiContext={agentUiContext}
            onTripUpdated={onTripUpdated}
          />

          {/* Radiating Speed Dial Actions Button docked next to left panel bottom */}
          <TripSpeedDial
            dockSide="left"
            isPanelOpen={isSidebarOpen}
            panelWidth={
              sidebarTab === 'route'
                ? transitMode === 'detailed'
                  ? 'min(520px, calc(100vw - 32px))'
                  : 'min(380px, calc(100vw - 32px))'
                : 'min(520px, calc(100vw - 32px))'
            }
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            onReoptimizeDay={handleReoptimizeDay}
            isReoptimizing={isReoptimizing}
            transitMode={transitMode}
            onToggleTransitMode={handleToggleTransitMode}
            selectedDay={selectedDay}
            isDroppingWaypoint={isDroppingWaypoint}
            onToggleDropWaypoint={handleToggleDropWaypoint}
            spatialCircle={spatialCircle}
            onClearSpatialCircle={handleClearSpatialCircle}
          />

          {/* Right Floating POI Details Drawer with External Arrow Tab */}
          {renderedPoi && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                bottom: '16px',
                width: 'min(380px, calc(100vw - 32px))',
                zIndex: 1040,
                display: 'flex',
                alignItems: 'stretch',
                pointerEvents: 'none',
                transform: isInspectorOpen ? 'translateX(0)' : 'translateX(calc(100% - 10px))',
                transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* External Arrow Tab on the left to Close or Open POI Details */}
              <button
                type="button"
                data-testid={isInspectorOpen ? 'poi-inspector-close-arrow' : 'poi-inspector-reopen-arrow'}
                onClick={
                  isInspectorOpen
                    ? handleCloseInspect
                    : () => {
                        setInspectedPoiId(renderedPoi.id);
                        setInspectedPoiFallback(renderedPoi.fallback || null);
                      }
                }
                aria-label={isInspectorOpen ? 'Close POI details' : 'Reopen POI details'}
                style={{
                  pointerEvents: 'auto',
                  alignSelf: 'flex-start',
                  marginTop: '16px',
                  marginRight: '-1px',
                  width: '26px',
                  height: '42px',
                  borderRadius: '10px 0 0 10px',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  border: '1px solid var(--color-border)',
                  borderRight: 'none',
                  boxShadow: '-4px 4px 14px rgba(0, 0, 0, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: isInspectorOpen ? 'var(--color-text-secondary)' : 'var(--color-accent-primary)',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  zIndex: 1050,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-accent-primary)';
                  e.currentTarget.style.background = 'var(--color-surface-raised)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isInspectorOpen ? 'var(--color-text-secondary)' : 'var(--color-accent-primary)';
                  e.currentTarget.style.background = 'var(--color-surface-card)';
                }}
              >
                {isInspectorOpen ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
              </button>

              <aside
                data-testid="trip-poi-inspector-drawer"
                style={{
                  pointerEvents: isInspectorOpen ? 'auto' : 'none',
                  flex: '1 1 auto',
                  minWidth: 0,
                  height: '100%',
                  maxHeight: '100%',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  backdropFilter: 'blur(28px)',
                  WebkitBackdropFilter: 'blur(28px)',
                  borderRadius: '24px',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 20px 45px -10px rgba(15, 76, 92, 0.15), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <PoiDetailView
                  key={`poi-detail-${renderedPoi.id || renderedPoi.fallback?.id || renderedPoi.fallback?.name || 'none'}`}
                  poiId={renderedPoi.id}
                  fallbackPoi={renderedPoi.fallback}
                  tripId={trip.id}
                  city={trip.destination}
                  onClose={handleCloseInspect}
                  onAddToDay={handleAddPoiToDay}
                  onFocusOnMap={handleFocusFromDrawer}
                  onPoiLoaded={handlePoiLoaded}
                  availableDays={daysOutput.map((d) => d.day)}
                  initialDay={typeof selectedDay === 'number' ? selectedDay : 1}
                  selectedDay={selectedDay}
                  tripStartDate={trip.start_date}
                  scheduledDay={scheduledPoiDay}
                  activeTransitLine={activeTransitLine}
                  onSelectTransitLine={setActiveTransitLine}
                  onUpdatePoi={handleUpdatePoi}
                  onDragStartPoi={() => {
                    if (!isSidebarOpen) setIsSidebarOpen(true);
                    window.dispatchEvent(new CustomEvent('paladio:switch-to-route'));
                  }}
                />
              </aside>
            </div>
          )}
        </div>

        {/* Tab 2: Wallet */}
        {activeTab === 'wallet' && (
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

        {/* Tab 4: Photos */}
        {activeTab === 'photos' && (
          <div key="photos" className="animate-tab-pane" style={{ height: '100%', overflowY: 'auto' }}>
            <TripPhotosView
              tripId={trip.id}
              photos={photos}
              onPhotosChange={handlePhotosChange}
            />
          </div>
        )}

        {/* Tab 5: Configuration */}
        {activeTab === 'config' && (
          <div key="config" className="animate-tab-pane" style={{ height: '100%', overflowY: 'auto' }}>
            <TripConfigView trip={trip} itinerary={itinerary} onTripUpdated={onTripUpdated} />
          </div>
        )}
      </div>

      {/* Pre-rendered 1x1 transparent image for suppressing native browser drag ghost/file icons */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        id="paladio-blank-drag-pixel"
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        alt=""
        width={1}
        height={1}
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0.01,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
