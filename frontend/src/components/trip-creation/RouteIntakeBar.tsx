"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { PlaneIcon, ArrowRightIcon, ClockIcon } from '@/components/icons';
import { getApiBaseUrl } from '@/utils/api';
import { CustomHourPickerModal } from './CustomHourPickerModal';

export interface LocationItem {
  city: string;
  country: string;
  country_name?: string;
  airport_name: string;
  airport_iata: string;
  airport_icao?: string;
  distance_km?: number | null;
  display_name: string;
  display_airport: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface RouteIntakeBarProps {
  origin: string;
  destination: string;
  originIata?: string;
  destIata?: string;
  onOriginChange: (val: string) => void;
  onDestinationChange: (val: string) => void;
  onOriginIataChange?: (val: string) => void;
  onDestIataChange?: (val: string) => void;
  departureHour?: string;
  arrivalHour?: string;
  onDepartureHourChange?: (val: string) => void;
  onArrivalHourChange?: (val: string) => void;
  startDate?: string;
  endDate?: string;
  disabled?: boolean;
}

function formatHeaderDate(dateStr: string | undefined, intlLocale: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const mIndex = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const parsed = new Date(y, mIndex, d);
  if (isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'short',
    day: '2-digit',
  }).format(parsed);
}

export function RouteIntakeBar({
  origin,
  destination,
  originIata: controlledOriginIata,
  destIata: controlledDestIata,
  onOriginChange,
  onDestinationChange,
  onOriginIataChange,
  onDestIataChange,
  departureHour = '09:00',
  arrivalHour = '20:00',
  onDepartureHourChange,
  onArrivalHourChange,
  startDate,
  endDate,
  disabled = false,
}: RouteIntakeBarProps) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  // Active dropdown: null | 'origin' | 'destination'
  const [activeMenu, setActiveMenu] = useState<'origin' | 'destination' | null>(null);

  // Search input queries for dropdowns
  const [originQuery, setOriginQuery] = useState(origin);
  const [destinationQuery, setDestinationQuery] = useState(destination);

  // Resolved IATAs (internal fallback if not controlled)
  const [internalOriginIata, setInternalOriginIata] = useState('');
  const [internalDestIata, setInternalDestIata] = useState('');

  const originIata = controlledOriginIata ?? internalOriginIata;
  const destIata = controlledDestIata ?? internalDestIata;

  const setOriginIata = useCallback(
    (val: string) => {
      setInternalOriginIata(val);
      onOriginIataChange?.(val);
    },
    [onOriginIataChange]
  );

  const setDestIata = useCallback(
    (val: string) => {
      setInternalDestIata(val);
      onDestIataChange?.(val);
    },
    [onDestIataChange]
  );

  // Results
  const [originResults, setOriginResults] = useState<LocationItem[]>([]);
  const [destinationResults, setDestinationResults] = useState<LocationItem[]>([]);
  const [isLoadingOrigin, setIsLoadingOrigin] = useState(false);
  const [isLoadingDest, setIsLoadingDest] = useState(false);

  // Swap animation trigger
  const [isSwapping, setIsSwapping] = useState(false);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom Hour Picker Modal state: null | 'departure' | 'arrival'
  const [activeHourPicker, setActiveHourPicker] = useState<'departure' | 'arrival' | null>(null);

  // Refs for click outside
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    };
  }, []);

  // Dynamic search fetcher
  const fetchLocations = useCallback(async (query: string, signal?: AbortSignal): Promise<LocationItem[]> => {
    if (!query || query.trim().length < 1) return [];
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/locations/search?q=${encodeURIComponent(query.trim())}&limit=8`, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, []);

  // Sync query state if props change externally
  const [prevOrigin, setPrevOrigin] = useState(origin);
  if (origin !== prevOrigin) {
    setPrevOrigin(origin);
    setOriginQuery(origin);
  }

  const [prevDestination, setPrevDestination] = useState(destination);
  if (destination !== prevDestination) {
    setPrevDestination(destination);
    setDestinationQuery(destination);
  }

  // Click outside to dismiss menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search for Origin
  useEffect(() => {
    if (activeMenu !== 'origin') return;
    const query = (originQuery || origin).trim();
    if (!query) {
      const timer = setTimeout(() => {
        setOriginResults([]);
        setIsLoadingOrigin(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoadingOrigin(true);
      const results = await fetchLocations(query, controller.signal);
      if (!controller.signal.aborted) {
        setOriginResults(results);
        setIsLoadingOrigin(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [originQuery, activeMenu, fetchLocations, origin]);

  // Debounced search for Destination
  useEffect(() => {
    if (activeMenu !== 'destination') return;
    const query = (destinationQuery || destination).trim();
    if (!query) {
      const timer = setTimeout(() => {
        setDestinationResults([]);
        setIsLoadingDest(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoadingDest(true);
      const results = await fetchLocations(query, controller.signal);
      if (!controller.signal.aborted) {
        setDestinationResults(results);
        setIsLoadingDest(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destinationQuery, activeMenu, fetchLocations, destination]);

  // Swap origin and destination
  const handleSwap = () => {
    if (disabled) return;
    setIsSwapping(true);
    const tempOrig = origin;
    const tempIata = originIata;
    onOriginChange(destination);
    onDestinationChange(tempOrig);
    setOriginQuery(destination);
    setDestinationQuery(tempOrig);
    setOriginIata(destIata);
    setDestIata(tempIata);
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    swapTimerRef.current = setTimeout(() => setIsSwapping(false), 300);
  };

  const handleSelectOrigin = (item: LocationItem) => {
    onOriginChange(item.city);
    setOriginQuery(item.city);
    setOriginIata(item.airport_iata);
    setActiveMenu(null);
  };

  const handleSelectDest = (item: LocationItem) => {
    onDestinationChange(item.city);
    setDestinationQuery(item.city);
    setDestIata(item.airport_iata);
    setActiveMenu(null);
  };

  const handleOriginIataDirectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    setOriginIata(val);
  };

  const handleDestIataDirectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    setDestIata(val);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Flight Route Sketch Card (IATA -> IATA, Search Box, Hour Input) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--color-bg-main, #FAF8F5)',
          border: '1px solid var(--color-border)',
          borderRadius: '20px',
          padding: '16px 20px',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Origin Column (Left) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
          {/* Large IATA Header - Directly Editable Monospace Input */}
          <input
            type="text"
            value={originIata}
            onChange={handleOriginIataDirectChange}
            disabled={disabled}
            maxLength={3}
            placeholder={t('engine.orig_placeholder')}
            spellCheck={false}
            autoComplete="off"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              color: 'var(--color-text-primary, #1A1A1A)',
              lineHeight: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              textAlign: 'center',
              width: '90px',
              padding: 0,
              margin: 0,
              textTransform: 'uppercase',
              cursor: disabled ? 'not-allowed' : 'text',
              caretColor: '#2563EB',
            }}
            title={t('engine.edit_orig_iata_title')}
          />

          {/* Search Box Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              maxWidth: '220px',
              background: 'var(--color-surface-raised, #FFFFFF)',
              border: activeMenu === 'origin' ? '1.5px solid #2563EB' : '1px solid var(--color-border)',
              borderRadius: '9999px',
              padding: '6px 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease',
            }}
          >
            <PlaneIcon size={14} color="var(--color-text-muted)" />
            <input
              type="text"
              disabled={disabled}
              value={originQuery}
              onChange={(e) => {
                setOriginQuery(e.target.value);
                onOriginChange(e.target.value);
                if (originIata) setOriginIata('');
                setActiveMenu('origin');
              }}
              onFocus={() => {
                setActiveMenu('origin');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setActiveMenu(null);
                } else if (e.key === 'Enter' && activeMenu === 'origin') {
                  e.preventDefault();
                  if (originResults.length > 0) {
                    handleSelectOrigin(originResults[0]);
                  }
                }
              }}
              placeholder={t('engine.search_city_airport_placeholder')}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-primary, #1A1A1A)',
                padding: 0,
              }}
            />
          </div>

          {/* Outbound Time Card */}
          {onDepartureHourChange && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setActiveHourPicker('departure')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: '3px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                padding: '6px 14px',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: '100%',
                maxWidth: '220px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
              title={t('engine.customize_arrival_time_title')}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.01em',
                }}
              >
                {t('engine.route_outbound_label')}{startDate ? ` · ${formatHeaderDate(startDate, intlLocale)}` : ''}
              </span>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A1A1A)',
                }}
              >
                <ClockIcon size={12} color="var(--color-text-muted)" />
                <span>{t('engine.arr_short')} {departureHour || '09:00'}</span>
              </div>
            </button>
          )}
        </div>

        {/* Center: Direction / Swap Arrow Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button
            type="button"
            disabled={disabled}
            onClick={handleSwap}
            title={t('engine.swap_route_title')}
            aria-label={t('engine.swap_route_aria')}
            style={{
              background: 'var(--color-surface-raised, #FFFFFF)',
              border: '1px solid var(--color-border)',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text-primary, #1A1A1A)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transform: isSwapping ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease',
            }}
          >
            <ArrowRightIcon size={16} />
          </button>
        </div>

        {/* Destination Column (Right) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
          {/* Large IATA Header - Directly Editable Monospace Input */}
          <input
            type="text"
            value={destIata}
            onChange={handleDestIataDirectChange}
            disabled={disabled}
            maxLength={3}
            placeholder={t('engine.dest_placeholder')}
            spellCheck={false}
            autoComplete="off"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              color: 'var(--color-accent-primary, #0F4C5C)',
              lineHeight: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              textAlign: 'center',
              width: '90px',
              padding: 0,
              margin: 0,
              textTransform: 'uppercase',
              cursor: disabled ? 'not-allowed' : 'text',
              caretColor: 'var(--color-accent-primary, #0F4C5C)',
            }}
            title={t('engine.edit_dest_iata_title')}
          />

          {/* Search Box Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              maxWidth: '220px',
              background: 'var(--color-surface-raised, #FFFFFF)',
              border: activeMenu === 'destination' ? '1.5px solid var(--color-accent-primary, #0F4C5C)' : '1px solid var(--color-border)',
              borderRadius: '9999px',
              padding: '6px 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease',
            }}
          >
            <PlaneIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
            <input
              type="text"
              required
              disabled={disabled}
              value={destinationQuery}
              onChange={(e) => {
                setDestinationQuery(e.target.value);
                onDestinationChange(e.target.value);
                if (destIata) setDestIata('');
                setActiveMenu('destination');
              }}
              onFocus={() => {
                setActiveMenu('destination');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setActiveMenu(null);
                } else if (e.key === 'Enter' && activeMenu === 'destination') {
                  e.preventDefault();
                  if (destinationResults.length > 0) {
                    handleSelectDest(destinationResults[0]);
                  }
                }
              }}
              placeholder={t('engine.search_city_airport_placeholder')}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-primary, #1A1A1A)',
                padding: 0,
              }}
            />
          </div>

          {/* Return Time Card */}
          {onArrivalHourChange && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setActiveHourPicker('arrival')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: '3px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                padding: '6px 14px',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: '100%',
                maxWidth: '220px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
              title={t('engine.customize_return_time_title')}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.01em',
                }}
              >
                {t('engine.route_return_label')}{endDate ? ` · ${formatHeaderDate(endDate, intlLocale)}` : ''}
              </span>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A1A1A)',
                }}
              >
                <ClockIcon size={12} color="var(--color-text-muted)" />
                <span>{t('engine.dep_short')} {arrivalHour || '20:00'}</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Deployed Dropdown Menu for Origin */}
      {activeMenu === 'origin' && (originQuery.trim().length > 0 || originResults.length > 0 || isLoadingOrigin) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            width: '320px',
            maxWidth: '100%',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '16px',
            padding: '8px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            zIndex: 60,
          }}
        >
          <div
            className="no-scrollbar"
            style={{
              maxHeight: '240px',
              overflowY: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {originQuery.trim().length > 0 && originResults.length === 0 && !isLoadingOrigin && (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--color-text-muted, #71717A)',
                }}
              >
                {t('engine.no_matching_cities', { query: originQuery })}
              </div>
            )}

            {originResults.map((item, idx) => (
              <div
                key={`${item.city}-${item.airport_iata}-${idx}`}
                onClick={() => handleSelectOrigin(item)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary, #1A1A1A)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.display_name}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted, #71717A)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '2px',
                    }}
                  >
                    <PlaneIcon size={12} color="var(--color-text-muted)" />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.airport_name}
                    </span>
                    {item.distance_km && item.distance_km > 0 ? (
                      <span className="font-mono text-xs" style={{ opacity: 0.7 }}>
                        ({item.distance_km}km)
                      </span>
                    ) : null}
                  </div>
                </div>

                <span
                  className="font-mono"
                  style={{
                    background: 'rgba(15, 76, 92, 0.08)',
                    color: 'var(--color-accent-primary, #0F4C5C)',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '3px 7px',
                    borderRadius: '6px',
                    flexShrink: 0,
                  }}
                >
                  {item.airport_iata}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deployed Dropdown Menu for Destination */}
      {activeMenu === 'destination' && (destinationQuery.trim().length > 0 || destinationResults.length > 0 || isLoadingDest) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '320px',
            maxWidth: '100%',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '16px',
            padding: '8px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            zIndex: 60,
          }}
        >
          <div
            className="no-scrollbar"
            style={{
              maxHeight: '240px',
              overflowY: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {destinationQuery.trim().length > 0 && destinationResults.length === 0 && !isLoadingDest && (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--color-text-muted, #71717A)',
                }}
              >
                {t('engine.no_matching_cities', { query: destinationQuery })}
              </div>
            )}

            {destinationResults.map((item, idx) => (
              <div
                key={`${item.city}-${item.airport_iata}-${idx}`}
                onClick={() => handleSelectDest(item)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-main, #F7F9FA)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary, #1A1A1A)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.display_name}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted, #71717A)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '2px',
                    }}
                  >
                    <PlaneIcon size={12} color="var(--color-text-muted)" />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.airport_name}
                    </span>
                    {item.distance_km && item.distance_km > 0 ? (
                      <span className="font-mono text-xs" style={{ opacity: 0.7 }}>
                        ({item.distance_km}km)
                      </span>
                    ) : null}
                  </div>
                </div>

                <span
                  className="font-mono"
                  style={{
                    background: 'rgba(15, 76, 92, 0.08)',
                    color: 'var(--color-accent-primary, #0F4C5C)',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '3px 7px',
                    borderRadius: '6px',
                    flexShrink: 0,
                  }}
                >
                  {item.airport_iata}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Hour Picker Modals */}
      <CustomHourPickerModal
        isOpen={activeHourPicker === 'departure'}
        onClose={() => setActiveHourPicker(null)}
        value={departureHour || '09:00'}
        onChange={(val) => {
          if (onDepartureHourChange) onDepartureHourChange(val);
        }}
        anchorLabel={t('engine.departure_time_label')}
      />

      <CustomHourPickerModal
        isOpen={activeHourPicker === 'arrival'}
        onClose={() => setActiveHourPicker(null)}
        value={arrivalHour || '20:00'}
        onChange={(val) => {
          if (onArrivalHourChange) onArrivalHourChange(val);
        }}
        anchorLabel={t('engine.arrival_return_time_label')}
      />
    </div>
  );
}
