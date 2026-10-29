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
} from '@/components/icons';

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

// Regex to detect direct coordinate input: "40.4168, -3.7038" or "40.4168 -3.7038"
const COORD_REGEX = /^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/;

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
  const [prevSelectedDay, setPrevSelectedDay] = useState<number | undefined>(selectedDay);
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

  // Route Calculation State
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<DirectionsRouteResult | null>(null);
  const [activeLegView, setActiveLegView] = useState<'primary' | 'alternative'>('primary');

  const originContainerRef = useRef<HTMLDivElement>(null);
  const destContainerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Click outside to dismiss autocomplete dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        originContainerRef.current &&
        !originContainerRef.current.contains(e.target as Node)
      ) {
        setIsOriginMenuOpen(false);
      }
      if (destContainerRef.current && !destContainerRef.current.contains(e.target as Node)) {
        setIsDestMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      } else {
        setDestSite(site);
        setDestQuery(site.name);
        setIsDestMenuOpen(false);
      }

      if (onCancelMapPick) onCancelMapPick();
    };

    window.addEventListener('paladio:map-picked-location', handleMapPickedLocation);
    return () => {
      window.removeEventListener('paladio:map-picked-location', handleMapPickedLocation);
    };
  }, [onCancelMapPick]);

  // Dynamic place fetcher
  const fetchPlaces = useCallback(
    async (q: string): Promise<PlaceSearchResult[]> => {
      if (!q || q.trim().length < 1) return [];
      try {
        const baseUrl = getApiBaseUrl();
        const url = `${baseUrl}/locations/places?city=${encodeURIComponent(
          destinationCity || ''
        )}&q=${encodeURIComponent(q.trim())}&limit=8`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    [destinationCity]
  );

  // Handle typing in Origin input
  const handleOriginChange = (val: string) => {
    setOriginQuery(val);
    setIsOriginMenuOpen(true);

    // Direct coordinate check
    const match = val.match(COORD_REGEX);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setOriginSite({
          name: `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          lat,
          lng,
        });
        setOriginResults([]);
        return;
      }
    }

    if (originSite && originSite.name !== val) {
      setOriginSite(null);
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setOriginResults([]);
      setIsOriginSearching(false);
      return;
    }

    setIsOriginSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await fetchPlaces(val);
      setOriginResults(results);
      setIsOriginSearching(false);
    }, 280);
  };

  // Handle typing in Destination input
  const handleDestChange = (val: string) => {
    setDestQuery(val);
    setIsDestMenuOpen(true);

    // Direct coordinate check
    const match = val.match(COORD_REGEX);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setDestSite({
          name: `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          lat,
          lng,
        });
        setDestResults([]);
        return;
      }
    }

    if (destSite && destSite.name !== val) {
      setDestSite(null);
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setDestResults([]);
      setIsDestSearching(false);
      return;
    }

    setIsDestSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await fetchPlaces(val);
      setDestResults(results);
      setIsDestSearching(false);
    }, 280);
  };

  // Select place from dropdown
  const handleSelectOrigin = (site: DirectionSite) => {
    setOriginSite(site);
    setOriginQuery(site.name);
    setIsOriginMenuOpen(false);
  };

  const handleSelectDest = (site: DirectionSite) => {
    setDestSite(site);
    setDestQuery(site.name);
    setIsDestMenuOpen(false);
  };

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

  // Quick anchors generator (Hotel, Airport, Day POIs)
  const renderQuickAnchors = (field: 'origin' | 'destination') => {
    const anchors: Array<{
      name: string;
      address?: string;
      lat: number;
      lng: number;
      category: string;
    }> = [];

    if (hotel && typeof hotel.lat === 'number' && typeof hotel.lng === 'number') {
      anchors.push({
        name: `Hotel: ${hotel.name}`,
        address: hotel.address || hotel.name,
        lat: hotel.lat,
        lng: hotel.lng,
        category: 'hotel',
      });
    }

    if (airport && typeof airport.lat === 'number' && typeof airport.lng === 'number') {
      anchors.push({
        name: `Airport: ${airport.name}`,
        lat: airport.lat,
        lng: airport.lng,
        category: 'transit',
      });
    }

    // Include day POIs
    const activeDayPois =
      typeof selectedDayOption === 'number'
        ? tripDays.find((d) => d.day_number === selectedDayOption)?.pois || []
        : [];

    activeDayPois.forEach((p) => {
      if (typeof p.lat === 'number' && typeof p.lng === 'number') {
        anchors.push({
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          category: p.category || 'attraction',
        });
      }
    });

    if (anchors.length === 0) return null;

    return (
      <div style={{ marginBottom: '8px' }}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-muted)',
            padding: '4px 6px',
          }}
        >
          Trip Anchors & Places
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {anchors.map((item, idx) => (
            <div
              key={`quick-${item.name}-${idx}`}
              onClick={() => {
                if (field === 'origin') handleSelectOrigin(item);
                else handleSelectDest(item);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--color-text-primary)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {item.category === 'hotel' ? (
                <HotelIcon size={12} color="var(--color-accent-teal, #0F4C5C)" />
              ) : item.category === 'transit' ? (
                <PlaneIcon size={12} color="var(--color-accent-primary, #0F4C5C)" />
              ) : (
                <PinIcon size={12} color="var(--color-accent-primary, #0F4C5C)" />
              )}
              <span
                style={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </span>
            </div>
          ))}
        </div>
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
              type="text"
              placeholder="Origin (place name, address, or lat,lng)"
              value={originQuery}
              onChange={(e) => handleOriginChange(e.target.value)}
              onFocus={() => setIsOriginMenuOpen(true)}
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
              {renderQuickAnchors('origin')}
              {isOriginSearching && (
                <div style={{ padding: '8px', textAlign: 'center', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                  Searching places...
                </div>
              )}
              {originResults.map((item, idx) => (
                <div
                  key={`orig-res-${item.name}-${idx}`}
                  onClick={() => handleSelectOrigin(item)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.address}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '9.5px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: '4px',
                      background: 'rgba(15, 76, 92, 0.08)',
                      color: 'var(--color-accent-primary)',
                    }}
                  >
                    {item.category}
                  </span>
                </div>
              ))}
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
              type="text"
              placeholder="Destination (place name, address, or lat,lng)"
              value={destQuery}
              onChange={(e) => handleDestChange(e.target.value)}
              onFocus={() => setIsDestMenuOpen(true)}
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
              {renderQuickAnchors('destination')}
              {isDestSearching && (
                <div style={{ padding: '8px', textAlign: 'center', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                  Searching places...
                </div>
              )}
              {destResults.map((item, idx) => (
                <div
                  key={`dest-res-${item.name}-${idx}`}
                  onClick={() => handleSelectDest(item)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.address}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '9.5px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: '4px',
                      background: 'rgba(15, 76, 92, 0.08)',
                      color: 'var(--color-accent-primary)',
                    }}
                  >
                    {item.category}
                  </span>
                </div>
              ))}
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

        {/* Day Selector */}
        <select
          value={selectedDayOption}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedDayOption(val === 'general' ? 'general' : parseInt(val, 10));
          }}
          style={{
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-main)',
            borderRadius: '6px',
            padding: '3px 6px',
            fontSize: '11.5px',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        >
          {tripDays.map((d) => (
            <option key={d.day_number} value={d.day_number}>
              Day {d.day_number}
            </option>
          ))}
          {tripDays.length === 0 && <option value={1}>Day 1</option>}
          <option value="general">General</option>
        </select>

        {/* Time input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ClockIcon size={12} color="var(--color-text-muted)" />
          <input
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            style={{
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main)',
              borderRadius: '6px',
              padding: '3px 6px',
              fontSize: '11.5px',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-code, monospace)',
              fontWeight: 600,
              outline: 'none',
            }}
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
