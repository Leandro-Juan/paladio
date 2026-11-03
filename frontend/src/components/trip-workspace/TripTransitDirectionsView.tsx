'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, getApiBaseUrl } from '@/utils/api';
import { getTripDayDate } from '@/utils/date';
import { TransitLeg } from '@/types/domain';
import { TransitLegView } from '@/components/TransitLegView';
import {
  PinIcon,
  CrosshairIcon,
  SwapIcon,
  TransitIcon,
  WalkIcon,
  ClockIcon,
  CheckIcon,
  CloseIcon,
  Spinner,
  HotelIcon,
  PlaneIcon,
  InfoIcon,
  ChevronDownIcon,
} from '@/components/icons';
import { CustomHourPickerModal } from '@/components/trip-creation/CustomHourPickerModal';

export interface DirectionSite {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  category?: string;
}

export interface DirectionsRouteResult {
  primary_mode: 'transit' | 'pedestrian';
  primary_leg: TransitLeg;
  alternative_leg: TransitLeg | null;
  recommendation_reason: string;
  origin: DirectionSite;
  destination: DirectionSite;
}

export interface TripTransitDirectionsViewProps {
  tripId?: string;
  destinationCity: string;
  tripStartDate?: string;
  selectedDay: number | 'all';
  tripDays?: Array<{
    day_number: number;
    pois: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      category?: string;
    }>;
  }>;
  hotel?: { name: string; address?: string; lat?: number; lng?: number } | null;
  airport?: { name: string; iata?: string; lat?: number; lng?: number } | null;
  activeMapPickField?: 'origin' | 'destination' | null;
  onStartMapPick?: (field: 'origin' | 'destination') => void;
  onCancelMapPick?: () => void;
  onRouteCalculated?: (
    routeResult: DirectionsRouteResult | null,
    activeMode: 'primary' | 'alternative'
  ) => void;
}

interface PlaceSearchResult {
  name: string;
  display_name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  category: string;
}

// Robust coordinate parser supporting standard pairs: "35.6895, 139.6917", "35.6895 139.6917", "35.6895N, 139.6917E"
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const clean = input.trim();
  const latLngMatch = clean.match(
    /^(?:lat(?:itude)?:\s*)?(-?\d+(?:\.\d+)?)\s*(?:°)?\s*([NSns])?[,\s]+(?:lon(?:gitude)?|lng:\s*)?(-?\d+(?:\.\d+)?)\s*(?:°)?\s*([EWew])?$/i
  );
  if (latLngMatch) {
    let lat = parseFloat(latLngMatch[1]);
    const latDir = latLngMatch[2]?.toUpperCase();
    let lng = parseFloat(latLngMatch[3]);
    const lngDir = latLngMatch[4]?.toUpperCase();

    if (latDir === 'S') lat = -Math.abs(lat);
    if (latDir === 'N') lat = Math.abs(lat);
    if (lngDir === 'W') lng = -Math.abs(lng);
    if (lngDir === 'E') lng = Math.abs(lng);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng };
    }
  }
  return null;
}

export function TripTransitDirectionsView({
  tripId,
  destinationCity,
  tripStartDate,
  selectedDay,
  tripDays = [],
  hotel,
  airport,
  activeMapPickField,
  onStartMapPick,
  onCancelMapPick,
  onRouteCalculated,
}: TripTransitDirectionsViewProps) {
  // Origin State
  const [originQuery, setOriginQuery] = useState<string>('');
  const [originSite, setOriginSite] = useState<DirectionSite | null>(null);
  const [originResults, setOriginResults] = useState<PlaceSearchResult[]>([]);
  const [isOriginMenuOpen, setIsOriginMenuOpen] = useState<boolean>(false);
  const [isOriginSearching, setIsOriginSearching] = useState<boolean>(false);

  // Destination State
  const [destQuery, setDestQuery] = useState<string>('');
  const [destSite, setDestSite] = useState<DirectionSite | null>(null);
  const [destResults, setDestResults] = useState<PlaceSearchResult[]>([]);
  const [isDestMenuOpen, setIsDestMenuOpen] = useState<boolean>(false);
  const [isDestSearching, setIsDestSearching] = useState<boolean>(false);

  // Schedule Controls
  const [scheduleMode, setScheduleMode] = useState<'depart_at' | 'arrive_by'>('depart_at');
  const [prevSelectedDay, setPrevSelectedDay] = useState<number | 'all' | undefined>(selectedDay);
  const [selectedDayOption, setSelectedDayOption] = useState<number | 'general'>(
    typeof selectedDay === 'number' ? selectedDay : 1
  );

  // Sync active day changes from parent during render (React-recommended pattern)
  if (selectedDay !== prevSelectedDay) {
    setPrevSelectedDay(selectedDay);
    if (typeof selectedDay === 'number') {
      setSelectedDayOption(selectedDay);
    }
  }

  const [timeValue, setTimeValue] = useState<string>('09:00');
  const [isHourPickerOpen, setIsHourPickerOpen] = useState<boolean>(false);
  const [isDayMenuOpen, setIsDayMenuOpen] = useState<boolean>(false);

  // Route Calculation State
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<DirectionsRouteResult | null>(null);
  const [activeLegView, setActiveLegView] = useState<'primary' | 'alternative'>('primary');

  const originContainerRef = useRef<HTMLDivElement>(null);
  const destContainerRef = useRef<HTMLDivElement>(null);
  const originInputRef = useRef<HTMLInputElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);
  const dayMenuRef = useRef<HTMLDivElement>(null);

  const originSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const destSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Click outside to dismiss autocomplete dropdowns and menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        originContainerRef.current &&
        !originContainerRef.current.contains(e.target as Node)
      ) {
        setIsOriginMenuOpen(false);
      }
      if (
        destContainerRef.current &&
        !destContainerRef.current.contains(e.target as Node)
      ) {
        setIsDestMenuOpen(false);
      }
      if (
        dayMenuRef.current &&
        !dayMenuRef.current.contains(e.target as Node)
      ) {
        setIsDayMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen for map click-to-pick events emitted by TripMapView
  // Listen for map click-to-pick events emitted by TripMapView
  useEffect(() => {
    const handleMapPickedLocation = (e: Event) => {
      const customEvent = e as CustomEvent<{
        field: 'origin' | 'destination';
        name: string;
        lat: number;
        lng: number;
        address?: string;
      }>;
      const data = customEvent.detail;
      if (!data) return;

      const site: DirectionSite = {
        name: data.name || `Pin (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)})`,
        address: data.address || `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`,
        lat: data.lat,
        lng: data.lng,
      };

      if (data.field === 'origin') {
        setOriginSite(site);
        setOriginQuery(site.name);
        setIsOriginMenuOpen(false);

        // Auto-advance to destination map pick & focus input B
        if (onStartMapPick) {
          onStartMapPick('destination');
        }
        setTimeout(() => {
          destInputRef.current?.focus();
          setIsDestMenuOpen(true);
        }, 60);
      } else {
        setDestSite(site);
        setDestQuery(site.name);
        setIsDestMenuOpen(false);
        if (onCancelMapPick) onCancelMapPick();
      }
    };

    window.addEventListener('paladio:map-picked-location', handleMapPickedLocation);
    return () => {
      window.removeEventListener('paladio:map-picked-location', handleMapPickedLocation);
    };
  }, [onStartMapPick, onCancelMapPick]);

  // Dynamic place & airport fetcher
  const fetchPlaces = useCallback(
    async (q: string): Promise<PlaceSearchResult[]> => {
      if (!q || q.trim().length < 1) return [];
      const cleanQ = q.trim();
      const baseUrl = getApiBaseUrl();
      const places: PlaceSearchResult[] = [];

      try {
        const url = `${baseUrl}/locations/places?city=${encodeURIComponent(
          destinationCity || ''
        )}&q=${encodeURIComponent(cleanQ)}&limit=8`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            places.push(...data);
          }
        }
      } catch {
        // Continue to airport check
      }

      // Check if query could be an airport/IATA or commercial terminal
      const isPotentialAirport =
        cleanQ.length === 3 ||
        /\b(airport|aeroport|aeropuerto|terminal|intl|hnd|nrt|cdg|fco|jfk|mad|bcn)\b/i.test(cleanQ);

      if (isPotentialAirport) {
        try {
          const airportRes = await fetch(
            `${baseUrl}/locations/search?q=${encodeURIComponent(cleanQ)}&limit=4`
          );
          if (airportRes.ok) {
            const airportData = await airportRes.json();
            if (Array.isArray(airportData)) {
              for (const item of airportData) {
                if (item.airport_name && item.latitude && item.longitude) {
                  const exists = places.some(
                    (p) =>
                      p.name.toLowerCase() === item.airport_name.toLowerCase() ||
                      p.name.toLowerCase().includes(item.airport_iata?.toLowerCase())
                  );
                  if (!exists) {
                    places.push({
                      name: item.display_airport || `${item.airport_name} (${item.airport_iata})`,
                      display_name: `${item.airport_name} (${item.airport_iata}), ${item.city}`,
                      address: `${item.city}, ${item.country_name || item.country}`,
                      city: item.city,
                      lat: item.latitude,
                      lng: item.longitude,
                      category: 'airport',
                    });
                  }
                }
              }
            }
          }
        } catch {
          // Ignore airport search failure
        }
      }

      return places;
    },
    [destinationCity]
  );

  // Memoized deduplicated trip anchors and places (Hotel 1st, Airport 2nd, deduplicated Day POIs)
  const allTripPlaces = React.useMemo(() => {
    const list: Array<DirectionSite & { isAnchor?: boolean; badgeLabel?: string }> = [];
    const seenNames = new Set<string>();
    const seenCoords = new Set<string>();

    const getCoordKey = (lat: number, lng: number) =>
      `${lat.toFixed(3)},${lng.toFixed(3)}`;

    const normalize = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    // 1. Hotel first (if configured)
    if (hotel && typeof hotel.lat === 'number' && typeof hotel.lng === 'number') {
      const hotelNorm = normalize(hotel.name);
      seenNames.add(hotelNorm);
      seenCoords.add(getCoordKey(hotel.lat, hotel.lng));
      list.push({
        name: `Hotel: ${hotel.name}`,
        address: hotel.address || hotel.name,
        lat: hotel.lat,
        lng: hotel.lng,
        category: 'hotel',
        isAnchor: true,
        badgeLabel: 'HOTEL',
      });
    }

    // 2. Airport second (if configured)
    if (airport && typeof airport.lat === 'number' && typeof airport.lng === 'number') {
      const airportNorm = normalize(airport.name);
      seenNames.add(airportNorm);
      if (airport.iata) seenNames.add(normalize(airport.iata));
      seenCoords.add(getCoordKey(airport.lat, airport.lng));
      list.push({
        name: `Airport: ${airport.name}`,
        address: airport.name,
        lat: airport.lat,
        lng: airport.lng,
        category: 'transit',
        isAnchor: true,
        badgeLabel: 'AIRPORT',
      });
    }

    // 3. Day POIs
    const rawPois =
      typeof selectedDayOption === 'number'
        ? tripDays.find((d) => d.day_number === selectedDayOption)?.pois || []
        : tripDays.flatMap((d) => d.pois || []);

    rawPois.forEach((p) => {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const norm = normalize(p.name);
      const coordKey = getCoordKey(p.lat, p.lng);

      // Deduplicate against Hotel
      if (hotel) {
        const hotelNorm = normalize(hotel.name);
        if (norm === hotelNorm || norm.includes(hotelNorm) || hotelNorm.includes(norm)) {
          return;
        }
      }
      // Deduplicate against Airport
      if (airport) {
        const airportNorm = normalize(airport.name);
        if (norm === airportNorm || norm.includes(airportNorm) || airportNorm.includes(norm)) {
          return;
        }
      }

      // Deduplicate across POIs
      if (seenNames.has(norm) || seenCoords.has(coordKey)) {
        return;
      }

      seenNames.add(norm);
      seenCoords.add(coordKey);
      list.push({
        name: p.name,
        address: p.name,
        lat: p.lat,
        lng: p.lng,
        category: p.category || 'attraction',
        badgeLabel: 'TRIP STOP',
      });
    });

    return list;
  }, [hotel, airport, tripDays, selectedDayOption]);

  // Select place from dropdown
  const handleSelectOrigin = (site: DirectionSite) => {
    setOriginSite(site);
    setOriginQuery(site.name);
    setIsOriginMenuOpen(false);

    // Auto-advance to destination
    if (activeMapPickField === 'origin') {
      onStartMapPick?.('destination');
    }
    setTimeout(() => {
      destInputRef.current?.focus();
      setIsDestMenuOpen(true);
    }, 60);
  };

  const handleSelectDest = (site: DirectionSite) => {
    setDestSite(site);
    setDestQuery(site.name);
    setIsDestMenuOpen(false);
    if (onCancelMapPick) onCancelMapPick();
  };

  // Direct coordinate selection
  const handleSelectCoordinate = async (
    field: 'origin' | 'destination',
    coord: { lat: number; lng: number }
  ) => {
    const fallbackName = `Coordinates (${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)})`;
    const initialSite: DirectionSite = {
      name: fallbackName,
      address: `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`,
      lat: coord.lat,
      lng: coord.lng,
    };

    if (field === 'origin') {
      handleSelectOrigin(initialSite);
    } else {
      handleSelectDest(initialSite);
    }

    // Reverse geocode in background to obtain pretty location address
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/locations/reverse?lat=${coord.lat}&lon=${coord.lng}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          const enrichedSite: DirectionSite = {
            name: data.name,
            address: data.address || `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`,
            lat: coord.lat,
            lng: coord.lng,
          };
          if (field === 'origin') {
            setOriginSite(enrichedSite);
            setOriginQuery(enrichedSite.name);
          } else {
            setDestSite(enrichedSite);
            setDestQuery(enrichedSite.name);
          }
        }
      }
    } catch {
      // Keep coordinates fallback
    }
  };

  // Handle typing in Origin input
  const handleOriginChange = (val: string) => {
    setOriginQuery(val);
    setIsOriginMenuOpen(true);

    if (originSite && originSite.name !== val) {
      setOriginSite(null);
    }

    if (originSearchTimerRef.current) clearTimeout(originSearchTimerRef.current);
    if (!val.trim()) {
      setOriginResults([]);
      setIsOriginSearching(false);
      return;
    }

    setIsOriginSearching(true);
    originSearchTimerRef.current = setTimeout(async () => {
      const results = await fetchPlaces(val);
      setOriginResults(results);
      setIsOriginSearching(false);
    }, 200);
  };

  // Handle typing in Destination input
  const handleDestChange = (val: string) => {
    setDestQuery(val);
    setIsDestMenuOpen(true);

    if (destSite && destSite.name !== val) {
      setDestSite(null);
    }

    if (destSearchTimerRef.current) clearTimeout(destSearchTimerRef.current);
    if (!val.trim()) {
      setDestResults([]);
      setIsDestSearching(false);
      return;
    }

    setIsDestSearching(true);
    destSearchTimerRef.current = setTimeout(async () => {
      const results = await fetchPlaces(val);
      setDestResults(results);
      setIsDestSearching(false);
    }, 200);
  };

  // Filter trip places matching current queries
  const matchingTripPlacesOrigin = React.useMemo(() => {
    if (!originQuery.trim()) return [];
    const qLower = originQuery.toLowerCase().trim();
    return allTripPlaces.filter(
      (item) =>
        item.name.toLowerCase().includes(qLower) ||
        (item.address && item.address.toLowerCase().includes(qLower))
    );
  }, [allTripPlaces, originQuery]);

  const matchingTripPlacesDest = React.useMemo(() => {
    if (!destQuery.trim()) return [];
    const qLower = destQuery.toLowerCase().trim();
    return allTripPlaces.filter(
      (item) =>
        item.name.toLowerCase().includes(qLower) ||
        (item.address && item.address.toLowerCase().includes(qLower))
    );
  }, [allTripPlaces, destQuery]);

  // Swap Origin and Destination
  const handleSwapSites = () => {
    const prevOrigSite = originSite;
    const prevOrigQuery = originQuery;
    setOriginSite(destSite);
    setOriginQuery(destQuery);
    setDestSite(prevOrigSite);
    setDestQuery(prevOrigQuery);

    if (routeResult && destSite && prevOrigSite) {
      // Re-trigger calculation with inverted parameters
      void triggerCalculate(destSite, prevOrigSite);
    }
  };

  // Build scheduled ISO departure timestamp
  const getScheduledDateTimeIso = (): string => {
    let dateStr = tripStartDate || '2026-09-10';
    if (typeof selectedDayOption === 'number' && tripStartDate) {
      dateStr = getTripDayDate(tripStartDate, selectedDayOption - 1);
    }
    return `${dateStr}T${timeValue}:00`;
  };

  // Calculate Route
  const triggerCalculate = async (
    overrideOrig?: DirectionSite,
    overrideDest?: DirectionSite
  ) => {
    const orig = overrideOrig || originSite;
    const dest = overrideDest || destSite;
    if (!orig || !dest) {
      setErrorMsg('Please select both Origin and Destination locations.');
      return;
    }

    setIsCalculating(true);
    setErrorMsg(null);

    try {
      const payload = {
        origin: { name: orig.name, lat: orig.lat, lon: orig.lng },
        destination: { name: dest.name, lat: dest.lat, lon: dest.lng },
        date_time: getScheduledDateTimeIso(),
        date_time_type: scheduleMode === 'depart_at' ? 1 : 2,
        city: destinationCity,
      };

      const endpoint = tripId
        ? `/trips/${tripId}/transit/directions`
        : '/transit/directions';

      const data = await apiFetch<{
        primary_mode: 'transit' | 'pedestrian';
        primary_leg: TransitLeg;
        alternative_leg: TransitLeg | null;
        recommendation_reason: string;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res: DirectionsRouteResult = {
        primary_mode: data.primary_mode,
        primary_leg: data.primary_leg,
        alternative_leg: data.alternative_leg,
        recommendation_reason: data.recommendation_reason,
        origin: orig,
        destination: dest,
      };

      setRouteResult(res);
      setActiveLegView('primary');

      if (onRouteCalculated) {
        onRouteCalculated(res, 'primary');
      }

      // Emit event to update map polyline and tactical pins
      window.dispatchEvent(
        new CustomEvent('paladio:show-directions-route', {
          detail: {
            activeLeg: data.primary_leg,
            primary_leg: data.primary_leg,
            alternative_leg: data.alternative_leg,
            origin: orig,
            destination: dest,
          },
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not calculate transit route.';
      setErrorMsg(msg);
    } finally {
      setIsCalculating(false);
    }
  };

  // Toggle between primary and alternative route
  const handleToggleLegView = (mode: 'primary' | 'alternative') => {
    if (!routeResult) return;
    setActiveLegView(mode);

    const activeLeg =
      mode === 'primary' ? routeResult.primary_leg : routeResult.alternative_leg;
    if (!activeLeg) return;

    if (onRouteCalculated) {
      onRouteCalculated(routeResult, mode);
    }

    window.dispatchEvent(
      new CustomEvent('paladio:show-directions-route', {
        detail: {
          activeLeg,
          primary_leg: routeResult.primary_leg,
          alternative_leg: routeResult.alternative_leg,
          origin: routeResult.origin,
          destination: routeResult.destination,
        },
      })
    );
  };

  // Clear directions and route polylines
  const handleClearRoute = () => {
    setRouteResult(null);
    setErrorMsg(null);
    if (onRouteCalculated) {
      onRouteCalculated(null, 'primary');
    }
    window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
  };

  // Keyboard navigation for Origin
  const handleOriginKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const coord = parseCoordinates(originQuery);
      if (coord) {
        void handleSelectCoordinate('origin', coord);
        return;
      }
      if (matchingTripPlacesOrigin.length > 0) {
        handleSelectOrigin(matchingTripPlacesOrigin[0]);
      } else if (originResults.length > 0) {
        handleSelectOrigin(originResults[0]);
      }
    }
  };

  // Keyboard navigation for Destination
  const handleDestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const coord = parseCoordinates(destQuery);
      if (coord) {
        void handleSelectCoordinate('destination', coord);
        return;
      }
      if (matchingTripPlacesDest.length > 0) {
        handleSelectDest(matchingTripPlacesDest[0]);
      } else if (destResults.length > 0) {
        handleSelectDest(destResults[0]);
      }
    }
  };

  const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('hotel') || cat.includes('lodging') || cat.includes('accommodation')) {
      return <HotelIcon size={13} color="var(--color-accent-teal, #0F4C5C)" />;
    }
    if (cat.includes('airport') || cat.includes('flight') || cat.includes('plane')) {
      return <PlaneIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />;
    }
    if (
      cat.includes('transit') ||
      cat.includes('station') ||
      cat.includes('subway') ||
      cat.includes('rail') ||
      cat.includes('bus')
    ) {
      return <TransitIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />;
    }
    return <PinIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />;
  };

  // Unified progressive dropdown menu renderer
  const renderDropdownMenu = (field: 'origin' | 'destination') => {
    const query = field === 'origin' ? originQuery : destQuery;
    const isSearching = field === 'origin' ? isOriginSearching : isDestSearching;
    const liveResults = field === 'origin' ? originResults : destResults;
    const matchingTripPlaces =
      field === 'origin' ? matchingTripPlacesOrigin : matchingTripPlacesDest;
    const cleanQ = query.trim();
    const parsedCoord = parseCoordinates(cleanQ);

    // Case 1: When nothing is written, show pinned Hotel, Airport, and deduplicated trip POIs
    if (!cleanQ) {
      if (allTripPlaces.length === 0) {
        return (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--color-text-muted)',
            }}
          >
            No trip places or anchors found. Type a place name or coordinates above.
          </div>
        );
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-muted)',
              padding: '4px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Trip Anchors & Places</span>
            <span style={{ fontSize: '9.5px', opacity: 0.7 }}>{allTripPlaces.length} places</span>
          </div>

          {allTripPlaces.map((item, idx) => (
            <div
              key={`anchor-${item.name}-${idx}`}
              onClick={() => {
                if (field === 'origin') handleSelectOrigin(item);
                else handleSelectDest(item);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '7px 8px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                {getCategoryIcon(item.category || '')}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </div>
                  {item.address && item.address !== item.name && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.address}
                    </div>
                  )}
                </div>
              </div>

              {item.badgeLabel && (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    background: item.isAnchor
                      ? 'rgba(15, 76, 92, 0.1)'
                      : 'rgba(15, 76, 92, 0.05)',
                    color: 'var(--color-accent-primary, #0F4C5C)',
                    flexShrink: 0,
                    fontFamily: 'var(--font-code, monospace)',
                  }}
                >
                  {item.badgeLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Case 2: When user is typing, progressively show best matching places (Trip POIs + live search)
    const filteredLive = liveResults.filter((res) => {
      const resNorm = res.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return !matchingTripPlaces.some((tp) => {
        const tpNorm = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          tpNorm === resNorm ||
          (Math.abs(tp.lat - res.lat) < 0.001 && Math.abs(tp.lng - res.lng) < 0.001)
        );
      });
    });

    const hasAnyResults =
      Boolean(parsedCoord) || matchingTripPlaces.length > 0 || filteredLive.length > 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {/* Coordinate Action if input matches coordinates */}
        {parsedCoord && (
          <div
            onClick={() => void handleSelectCoordinate(field, parsedCoord)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(15, 76, 92, 0.06)',
              border: '1px dashed var(--color-accent-primary, #0F4C5C)',
              marginBottom: '6px',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(15, 76, 92, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 76, 92, 0.06)';
            }}
          >
            <CrosshairIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: 'var(--color-accent-primary, #0F4C5C)',
                }}
              >
                Use Coordinates: {parsedCoord.lat.toFixed(5)}, {parsedCoord.lng.toFixed(5)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Direct GPS Geographic Coordinate
              </div>
            </div>
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(15, 76, 92, 0.12)',
                color: 'var(--color-accent-primary)',
                fontFamily: 'var(--font-code, monospace)',
              }}
            >
              GPS PIN
            </span>
          </div>
        )}

        {/* Searching Indicator */}
        {isSearching && (
          <div
            style={{
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: 'var(--color-text-muted)',
            }}
          >
            <Spinner size={12} color="var(--color-accent-primary)" />
            <span>Searching places matching &quot;{cleanQ}&quot;...</span>
          </div>
        )}

        {/* Matching Trip POIs & Anchors */}
        {matchingTripPlaces.map((item, idx) => (
          <div
            key={`match-tp-${item.name}-${idx}`}
            onClick={() => {
              if (field === 'origin') handleSelectOrigin(item);
              else handleSelectDest(item);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '7px 8px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              {getCategoryIcon(item.category || '')}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.name}
                </div>
                {item.address && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.address}
                  </div>
                )}
              </div>
            </div>

            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 5px',
                borderRadius: '4px',
                background: 'rgba(15, 76, 92, 0.08)',
                color: 'var(--color-accent-primary)',
                flexShrink: 0,
                fontFamily: 'var(--font-code, monospace)',
              }}
            >
              {item.badgeLabel || 'TRIP PLACE'}
            </span>
          </div>
        ))}

        {/* Live Search Results */}
        {filteredLive.map((item, idx) => (
          <div
            key={`live-${item.name}-${idx}`}
            onClick={() => {
              if (field === 'origin') handleSelectOrigin(item);
              else handleSelectDest(item);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '7px 8px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              {getCategoryIcon(item.category || '')}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.name}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.address || item.display_name}
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 5px',
                borderRadius: '4px',
                background: 'rgba(15, 76, 92, 0.08)',
                color: 'var(--color-accent-primary)',
                flexShrink: 0,
                fontFamily: 'var(--font-code, monospace)',
              }}
            >
              {item.category || 'PLACE'}
            </span>
          </div>
        ))}

        {/* Empty State */}
        {!hasAnyResults && !isSearching && (
          <div
            style={{
              padding: '16px 12px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--color-text-muted)',
            }}
          >
            No matching places found for &quot;{cleanQ}&quot;
          </div>
        )}
      </div>
    );
  };

  const isOriginPinned = Boolean(originSite);
  const isDestPinned = Boolean(destSite);
  const isPickingOrigin = activeMapPickField === 'origin';
  const isPickingDest = activeMapPickField === 'destination';

  const activeDisplayLeg =
    routeResult &&
    (activeLegView === 'primary'
      ? routeResult.primary_leg
      : routeResult.alternative_leg || routeResult.primary_leg);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 1. Origin & Destination Site Intake Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'var(--color-surface-card, #FFFFFF)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          padding: '12px',
          position: 'relative',
        }}
      >
        {/* Origin Input */}
        <div ref={originContainerRef} style={{ position: 'relative', width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-bg-main, #FAF8F5)',
              border: isPickingOrigin
                ? '1.5px solid var(--color-accent-primary, #0F4C5C)'
                : isOriginMenuOpen
                ? '1.5px solid var(--color-accent-primary, #0F4C5C)'
                : '1px solid var(--color-border)',
              borderRadius: '9999px',
              padding: '6px 10px 6px 12px',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontWeight: 700,
                fontSize: '11px',
                color: isOriginPinned
                  ? 'var(--color-accent-primary)'
                  : 'var(--color-text-muted)',
                width: '16px',
                textAlign: 'center',
              }}
            >
              A
            </span>
            <input
              ref={originInputRef}
              type="text"
              placeholder="Origin (place name, address, or lat,lng)"
              value={originQuery}
              onChange={(e) => handleOriginChange(e.target.value)}
              onFocus={() => setIsOriginMenuOpen(true)}
              onKeyDown={handleOriginKeyDown}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '12.5px',
                color: 'var(--color-text-primary)',
              }}
            />
            {originQuery && (
              <button
                type="button"
                onClick={() => {
                  setOriginQuery('');
                  setOriginSite(null);
                  setOriginResults([]);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <CloseIcon size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isPickingOrigin) {
                  if (onCancelMapPick) onCancelMapPick();
                } else {
                  if (onStartMapPick) onStartMapPick('origin');
                }
              }}
              title="Pick origin on map"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '9999px',
                border: isPickingOrigin
                  ? '1px solid var(--color-accent-primary)'
                  : '1px solid var(--color-border)',
                background: isPickingOrigin
                  ? 'rgba(15, 76, 92, 0.14)'
                  : 'var(--color-surface-raised, #FFFFFF)',
                color: isPickingOrigin
                  ? 'var(--color-accent-primary)'
                  : 'var(--color-text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <CrosshairIcon size={11} color={isPickingOrigin ? 'var(--color-accent-primary)' : 'currentColor'} />
              <span>{isPickingOrigin ? 'Picking...' : 'Map'}</span>
            </button>
          </div>

          {/* Origin Autocomplete Dropdown */}
          {isOriginMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 60,
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {renderDropdownMenu('origin')}
            </div>
          )}
        </div>

        {/* Swap Origin/Destination Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '14px',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={handleSwapSites}
            title="Swap Origin and Destination"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised, #FFFFFF)',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              zIndex: 2,
            }}
          >
            <SwapIcon size={12} />
          </button>
        </div>

        {/* Destination Input */}
        <div ref={destContainerRef} style={{ position: 'relative', width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-bg-main, #FAF8F5)',
              border: isPickingDest
                ? '1.5px solid var(--color-accent-primary, #0F4C5C)'
                : isDestMenuOpen
                ? '1.5px solid var(--color-accent-primary, #0F4C5C)'
                : '1px solid var(--color-border)',
              borderRadius: '9999px',
              padding: '6px 10px 6px 12px',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontWeight: 700,
                fontSize: '11px',
                color: isDestPinned
                  ? '#059669'
                  : 'var(--color-text-muted)',
                width: '16px',
                textAlign: 'center',
              }}
            >
              B
            </span>
            <input
              ref={destInputRef}
              type="text"
              placeholder="Destination (place name, address, or lat,lng)"
              value={destQuery}
              onChange={(e) => handleDestChange(e.target.value)}
              onFocus={() => setIsDestMenuOpen(true)}
              onKeyDown={handleDestKeyDown}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '12.5px',
                color: 'var(--color-text-primary)',
              }}
            />
            {destQuery && (
              <button
                type="button"
                onClick={() => {
                  setDestQuery('');
                  setDestSite(null);
                  setDestResults([]);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <CloseIcon size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isPickingDest) {
                  if (onCancelMapPick) onCancelMapPick();
                } else {
                  if (onStartMapPick) onStartMapPick('destination');
                }
              }}
              title="Pick destination on map"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '9999px',
                border: isPickingDest
                  ? '1px solid var(--color-accent-primary)'
                  : '1px solid var(--color-border)',
                background: isPickingDest
                  ? 'rgba(15, 76, 92, 0.14)'
                  : 'var(--color-surface-raised, #FFFFFF)',
                color: isPickingDest
                  ? 'var(--color-accent-primary)'
                  : 'var(--color-text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <CrosshairIcon size={11} color={isPickingDest ? 'var(--color-accent-primary)' : 'currentColor'} />
              <span>{isPickingDest ? 'Picking...' : 'Map'}</span>
            </button>
          </div>

          {/* Destination Autocomplete Dropdown */}
          {isDestMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 60,
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {renderDropdownMenu('destination')}
            </div>
          )}
        </div>
      </div>

      {/* 2. Multimodal Schedule Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          padding: '8px 12px',
        }}
      >
        {/* Depart at / Arrive by toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg-main)', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            onClick={() => setScheduleMode('depart_at')}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: scheduleMode === 'depart_at' ? 700 : 500,
              borderRadius: '4px',
              border: 'none',
              background: scheduleMode === 'depart_at' ? 'var(--color-surface-raised)' : 'transparent',
              color: scheduleMode === 'depart_at' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            Depart at
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode('arrive_by')}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: scheduleMode === 'arrive_by' ? 700 : 500,
              borderRadius: '4px',
              border: 'none',
              background: scheduleMode === 'arrive_by' ? 'var(--color-surface-raised)' : 'transparent',
              color: scheduleMode === 'arrive_by' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            Arrive by
          </button>
        </div>

        {/* Custom Day Selector Popover */}
        <div ref={dayMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsDayMenuOpen((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised, #FFFFFF)',
              color: 'var(--color-text-primary)',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{selectedDayOption === 'general' ? 'General' : `Day ${selectedDayOption}`}</span>
            <ChevronDownIcon
              size={12}
              color="var(--color-text-muted)"
              style={{
                transform: isDayMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>

          {isDayMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 70,
                minWidth: '110px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '4px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {tripDays.map((d) => {
                const isSelected = selectedDayOption === d.day_number;
                return (
                  <button
                    key={d.day_number}
                    type="button"
                    onClick={() => {
                      setSelectedDayOption(d.day_number);
                      setIsDayMenuOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? 'var(--color-bg-main, #F7F9FA)' : 'transparent',
                      color: isSelected ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-primary)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>Day {d.day_number}</span>
                    {isSelected && <CheckIcon size={11} color="var(--color-accent-primary)" />}
                  </button>
                );
              })}
              {tripDays.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayOption(1);
                    setIsDayMenuOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-accent-primary)',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  Day 1
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedDayOption('general');
                  setIsDayMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: selectedDayOption === 'general' ? 'var(--color-bg-main, #F7F9FA)' : 'transparent',
                  color: selectedDayOption === 'general' ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-primary)',
                  fontWeight: selectedDayOption === 'general' ? 700 : 500,
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (selectedDayOption !== 'general') e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
                }}
                onMouseLeave={(e) => {
                  if (selectedDayOption !== 'general') e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>General</span>
                {selectedDayOption === 'general' && <CheckIcon size={11} color="var(--color-accent-primary)" />}
              </button>
            </div>
          )}
        </div>

        {/* Custom Hour Picker Trigger (no duplicate leftmost clock icon) */}
        <div>
          <button
            type="button"
            onClick={() => setIsHourPickerOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised, #FFFFFF)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-code, monospace)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease',
            }}
            title="Click to select scheduled time"
          >
            <ClockIcon size={12} color="var(--color-text-muted)" />
            <span>{timeValue}</span>
          </button>

          <CustomHourPickerModal
            isOpen={isHourPickerOpen}
            onClose={() => setIsHourPickerOpen(false)}
            value={timeValue}
            onChange={(newVal) => setTimeValue(newVal)}
            anchorLabel={scheduleMode === 'depart_at' ? 'Departure Time' : 'Arrival Time'}
          />
        </div>
      </div>

      {/* 3. Action Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          disabled={!isOriginPinned || !isDestPinned || isCalculating}
          onClick={() => triggerCalculate()}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background:
              !isOriginPinned || !isDestPinned
                ? 'var(--color-border)'
                : 'var(--color-accent-primary, #0F4C5C)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 700,
            cursor: !isOriginPinned || !isDestPinned || isCalculating ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {isCalculating ? (
            <>
              <Spinner size={12} color="#FFFFFF" />
              <span>Calculating Route...</span>
            </>
          ) : (
            <>
              <TransitIcon size={13} color="#FFFFFF" />
              <span>Get Directions</span>
            </>
          )}
        </button>

        {routeResult && (
          <button
            type="button"
            onClick={handleClearRoute}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#DC2626',
            fontSize: '12px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 4. Route Calculation Result */}
      {routeResult && activeDisplayLeg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          {/* Realism Heuristic Recommendation Badge */}
          {routeResult.recommendation_reason && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'rgba(15, 76, 92, 0.08)',
                border: '1px solid rgba(15, 76, 92, 0.18)',
                fontSize: '11.5px',
                color: 'var(--color-accent-primary)',
                lineHeight: 1.4,
              }}
            >
              <InfoIcon size={14} color="var(--color-accent-primary)" style={{ marginTop: '1px' }} />
              <div>
                <strong>Recommendation: </strong>
                {routeResult.recommendation_reason}
              </div>
            </div>
          )}

          {/* Active Route Step-by-Step View */}
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {activeDisplayLeg.mode === 'transit' ? (
                  <TransitIcon size={14} color="var(--color-accent-primary)" />
                ) : (
                  <WalkIcon size={14} color="var(--color-accent-primary)" />
                )}
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {activeDisplayLeg.mode === 'transit' ? 'Public Transit Route' : 'Direct Walking Route'}
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-code, monospace)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--color-accent-primary)',
                }}
              >
                {activeDisplayLeg.duration_mins} MIN
                {activeDisplayLeg.cost_eur > 0 && ` • €${activeDisplayLeg.cost_eur.toFixed(2)}`}
              </span>
            </div>

            <TransitLegView
              transitLeg={activeDisplayLeg}
              originName={routeResult.origin.name}
              destinationName={routeResult.destination.name}
              defaultExpanded={true}
            />
          </div>

          {/* Alternative Route Toggle Card */}
          {routeResult.alternative_leg && (
            <div
              onClick={() =>
                handleToggleLegView(
                  activeLegView === 'primary' ? 'alternative' : 'primary'
                )
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-raised)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeLegView === 'primary' ? (
                  routeResult.alternative_leg.mode === 'pedestrian' ? (
                    <WalkIcon size={14} color="var(--color-text-muted)" />
                  ) : (
                    <TransitIcon size={14} color="var(--color-text-muted)" />
                  )
                ) : (
                  <CheckIcon size={14} color="var(--color-accent-primary)" />
                )}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {activeLegView === 'primary'
                      ? routeResult.alternative_leg.mode === 'pedestrian'
                        ? 'Compare with Direct Walk'
                        : 'Compare with Public Transit'
                      : 'Switch back to Primary Route'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {activeLegView === 'primary'
                      ? `${routeResult.alternative_leg.duration_mins} min • ${
                          routeResult.alternative_leg.cost_eur > 0
                            ? `€${routeResult.alternative_leg.cost_eur.toFixed(2)}`
                            : '0€'
                        }`
                      : `${routeResult.primary_leg.duration_mins} min • ${
                          routeResult.primary_leg.cost_eur > 0
                            ? `€${routeResult.primary_leg.cost_eur.toFixed(2)}`
                            : '0€'
                        }`}
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-accent-primary)',
                  textDecoration: 'underline',
                }}
              >
                {activeLegView === 'primary' ? 'View Route' : 'Show'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
