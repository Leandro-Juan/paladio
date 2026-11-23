"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';
import { HotelIcon, PinIcon, CheckIcon, ClockIcon } from '@/components/icons';
import { getApiBaseUrl } from '@/utils/api';
import { CustomHourPickerModal } from './CustomHourPickerModal';

const HotelMapModal = dynamic(
  () => import('./HotelMapModal').then((mod) => mod.HotelMapModal),
  { ssr: false }
);

export interface HotelSearchResult {
  name: string;
  display_name: string;
  address: string;
  city: string;
  country?: string;
  lat: number;
  lng: number;
  category?: string;
}

export function getHotelCategoryBadge(item: HotelSearchResult): string {
  const normName = item.name.toLowerCase();
  const normCat = (item.category || '').toLowerCase();
  if (
    normName.includes('hostal') ||
    normName.includes('hostel') ||
    normCat.includes('hostel') ||
    normCat.includes('guest_house')
  ) {
    return 'HOSTEL';
  }
  if (
    normName.includes('suite') ||
    normName.includes('apart') ||
    normName.includes('estudio') ||
    normCat.includes('apartment')
  ) {
    return 'SUITE';
  }
  if (normName.includes('resort') || normCat.includes('resort')) {
    return 'RESORT';
  }
  return 'HOTEL';
}

interface HotelStayAnchorBarProps {
  hotelArea: string;
  hotelAddress?: string;
  hotelLat?: number;
  hotelLng?: number;
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
  checkInHour?: string;
  checkOutHour?: string;
  tripStartDate?: string;
  tripEndDate?: string;
  onCheckInHourChange?: (val: string) => void;
  onCheckOutHourChange?: (val: string) => void;
  onChange: (
    name: string,
    extra?: { address?: string; lat?: number; lng?: number }
  ) => void;
  disabled?: boolean;
}

export function HotelStayAnchorBar({
  hotelArea,
  hotelAddress,
  hotelLat,
  hotelLng,
  destination,
  checkInDate,
  checkOutDate,
  checkInHour = '15:00',
  checkOutHour = '11:00',
  tripStartDate,
  tripEndDate,
  onCheckInHourChange,
  onCheckOutHourChange,
  onChange,
  disabled = false,
}: HotelStayAnchorBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(hotelArea);
  const [results, setResults] = useState<HotelSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [activeHourPicker, setActiveHourPicker] = useState<'checkin' | 'checkout' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Synchronize when external prop changes
  const [prevHotelArea, setPrevHotelArea] = useState(hotelArea);
  const [prevDestination, setPrevDestination] = useState(destination);
  if (hotelArea !== prevHotelArea) {
    setPrevHotelArea(hotelArea);
    setQuery(hotelArea);
  }
  if (destination !== prevDestination) {
    setPrevDestination(destination);
    setResults([]);
  }

  // Click outside to dismiss menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch hotels dynamically
  const fetchHotels = useCallback(
    async (q: string, signal?: AbortSignal): Promise<HotelSearchResult[]> => {
      if (!q || q.trim().length < 1) return [];
      try {
        const baseUrl = getApiBaseUrl();
        const url = `${baseUrl}/locations/hotels?city=${encodeURIComponent(
          destination || ''
        )}&q=${encodeURIComponent(q.trim())}&limit=8`;
        const res = await fetch(url, { signal });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    [destination]
  );

  // Debounced search on typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setResults([]);
    setIsMenuOpen(true);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (!val.trim()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    searchTimerRef.current = setTimeout(async () => {
      const items = await fetchHotels(val, controller.signal);
      if (controller.signal.aborted) return;
      setResults(items);
      setIsLoading(false);

      // Auto-bind coordinates only on an exact normalized name match
      if (items.length > 0) {
        const top = items[0];
        const normVal = val.toLowerCase().trim();
        const normTop = top.name.toLowerCase().trim();
        if (normTop === normVal) {
          onChange(val, {
            address: top.address,
            lat: top.lat,
            lng: top.lng,
          });
        }
      }
    }, 250);
  };

  const handleSelectHotel = (item: HotelSearchResult) => {
    setQuery(item.name);
    onChange(item.name, {
      address: item.address,
      lat: item.lat,
      lng: item.lng,
    });
    setIsMenuOpen(false);
  };

  const handleMapConfirm = (hotel: {
    name: string;
    address?: string;
    lat: number;
    lng: number;
  }) => {
    setQuery(hotel.name);
    onChange(hotel.name, {
      address: hotel.address,
      lat: hotel.lat,
      lng: hotel.lng,
    });
  };

  const isPinned =
    typeof hotelLat === 'number' &&
    typeof hotelLng === 'number' &&
    Number.isFinite(hotelLat) &&
    Number.isFinite(hotelLng);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        zIndex: isMenuOpen ? 40 : undefined,
      }}
    >
      {/* Label Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-muted)',
          }}
        >
          {t('engine.hotel_stay_anchor_label')}
        </label>
      </div>

      {/* Main Pill Search Box matching RouteIntakeBar aesthetic */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          background: 'var(--color-bg-main, #FAF8F5)',
          border: isMenuOpen
            ? '1.5px solid var(--color-accent-primary, #0F4C5C)'
            : '1px solid var(--color-border)',
          borderRadius: '9999px',
          padding: '6px 10px 6px 14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <HotelIcon
            size={15}
            color={isPinned ? 'var(--color-accent-teal, #0F4C5C)' : 'var(--color-text-muted)'}
          />
          <input
            type="text"
            disabled={disabled}
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              setIsMenuOpen(true);
              const focusQuery = (query || hotelArea).trim();
              if (results.length === 0 && focusQuery) {
                if (abortControllerRef.current) abortControllerRef.current.abort();
                const controller = new AbortController();
                abortControllerRef.current = controller;
                setIsLoading(true);
                void fetchHotels(focusQuery, controller.signal).then((items) => {
                  if (!controller.signal.aborted) {
                    setResults(items);
                    setIsLoading(false);
                  }
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsMenuOpen(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (!isLoading && results.length > 0) {
                  handleSelectHotel(results[0]);
                } else if (!isLoading && query.trim()) {
                  setIsMenuOpen(false);
                  setIsMapModalOpen(true);
                }
              }
            }}
            placeholder={t('engine.hotel_search_placeholder')}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--color-text-primary, #1A1A1A)',
              padding: 0,
            }}
          />

          {/* Tick Indicator on the right to the hotel name showing that it correctly found it */}
          {isPinned && query.trim().length > 0 && (
            <span
              title={t('engine.hotel_verified_tooltip', {
                address: hotelAddress || query,
                lat: hotelLat?.toFixed(4) ?? '',
                lng: hotelLng?.toFixed(4) ?? '',
              })}
              data-testid="hotel-verified-tick"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#059669',
                flexShrink: 0,
                userSelect: 'none',
                cursor: 'default',
              }}
            >
              <CheckIcon size={12} color="#059669" />
            </span>
          )}
        </div>

        {/* Locate on Map Trigger Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setIsMenuOpen(false);
            setIsMapModalOpen(true);
          }}
          title={t('engine.locate_hotel_tooltip')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: isPinned
              ? 'rgba(15, 76, 92, 0.12)'
              : 'var(--color-surface-raised, #FFFFFF)',
            border: isPinned
              ? '1px solid var(--color-accent-primary, #0F4C5C)'
              : '1px solid var(--color-border)',
            borderRadius: '9999px',
            padding: '4px 12px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '11.5px',
            fontWeight: 600,
            color: isPinned
              ? 'var(--color-accent-primary, #0F4C5C)'
              : 'var(--color-text-secondary)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          <PinIcon
            size={12}
            color={
              isPinned
                ? 'var(--color-accent-primary, #0F4C5C)'
                : 'var(--color-text-muted)'
            }
          />
          <span>{isPinned ? t('engine.view_map') : t('engine.locate_on_map')}</span>
        </button>
      </div>

      {/* Hotel Check-In & Check-Out Schedule Controls */}
      {(onCheckInHourChange || onCheckOutHourChange || tripStartDate || tripEndDate || checkInDate || checkOutDate) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          {/* Check-In Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background: 'var(--color-bg-main, #FAF8F5)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
              padding: '6px 12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-text-muted)',
                }}
              >
                {t('engine.check_in_label')}
              </span>
              <span
                data-testid="hotel-checkin-date-text"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary, #1A1A1A)',
                }}
              >
                {tripStartDate || checkInDate || t('engine.arrival_fallback')}
              </span>
            </div>
            {onCheckInHourChange && (
              <button
                type="button"
                disabled={disabled}
                aria-label={t('engine.hotel_checkin_time_aria')}
                data-testid="hotel-checkin-time-btn"
                onClick={() => setActiveHourPicker('checkin')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--color-surface-raised, #FFFFFF)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '5px 10px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A1A1A)',
                  flexShrink: 0,
                }}
                title={t('engine.hotel_checkin_time_title')}
              >
                <ClockIcon size={12} color="var(--color-accent-primary, #0F4C5C)" />
                <span>{checkInHour || '15:00'}</span>
              </button>
            )}
          </div>

          {/* Check-Out Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background: 'var(--color-bg-main, #FAF8F5)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
              padding: '6px 12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-text-muted)',
                }}
              >
                {t('engine.check_out_label')}
              </span>
              <span
                data-testid="hotel-checkout-date-text"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary, #1A1A1A)',
                }}
              >
                {tripEndDate || checkOutDate || t('engine.departure_fallback')}
              </span>
            </div>
            {onCheckOutHourChange && (
              <button
                type="button"
                disabled={disabled}
                aria-label={t('engine.hotel_checkout_time_aria')}
                data-testid="hotel-checkout-time-btn"
                onClick={() => setActiveHourPicker('checkout')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--color-surface-raised, #FFFFFF)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '5px 10px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A1A1A)',
                  flexShrink: 0,
                }}
                title={t('engine.hotel_checkout_time_title')}
              >
                <ClockIcon size={12} color="var(--color-accent-primary, #0F4C5C)" />
                <span>{checkOutHour || '11:00'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Deployed Dropdown Menu matching RouteIntakeBar city search aesthetic */}
      {isMenuOpen && (results.length > 0 || isLoading || (query && query.trim().length > 0)) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
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
            {isLoading && (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--color-text-muted, #71717A)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <HotelIcon size={14} color="var(--color-accent-teal, #0F4C5C)" />
                <span>
                  {t('engine.searching_hotels_in', {
                    destination: destination || t('engine.destination_lower'),
                  })}
                </span>
              </div>
            )}

            {!isLoading && results.length === 0 && query.trim().length > 0 && (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--color-text-muted, #71717A)',
                }}
              >
                {t('engine.no_matching_hotels', { query })}
              </div>
            )}

            {!isLoading &&
              results.map((item, idx) => (
                <div
                  key={`${item.name}-${item.lat}-${idx}`}
                  onClick={() => handleSelectHotel(item)}
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
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: 'var(--color-text-primary, #1A1A1A)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.name}
                      </span>
                      {typeof item.lat === 'number' &&
                        typeof item.lng === 'number' &&
                        Number.isFinite(item.lat) &&
                        Number.isFinite(item.lng) && (
                        <span
                          title={t('engine.verified_hotel_location')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#059669',
                            flexShrink: 0,
                          }}
                        >
                          <CheckIcon size={10} color="#059669" />
                        </span>
                      )}
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
                      <HotelIcon size={12} color="var(--color-text-muted)" />
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.address || item.city}
                      </span>
                    </div>
                  </div>

                  <span
                    className="font-mono"
                    style={{
                      background: 'rgba(15, 76, 92, 0.08)',
                      color: 'var(--color-accent-primary, #0F4C5C)',
                      fontWeight: 700,
                      fontSize: '11px',
                      padding: '3px 7px',
                      borderRadius: '6px',
                      flexShrink: 0,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {t(`engine.lodging_type_${getHotelCategoryBadge(item).toLowerCase()}`)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Interactive Leaflet Map Modal */}
      {isMapModalOpen && (
        <HotelMapModal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          destination={destination}
          initialHotelName={query || hotelArea}
          initialHotelAddress={hotelAddress}
          initialLat={hotelLat}
          initialLng={hotelLng}
          onConfirm={handleMapConfirm}
        />
      )}

      {/* Hotel Check-In / Check-Out Hour Picker Modal */}
      <CustomHourPickerModal
        isOpen={activeHourPicker !== null}
        onClose={() => setActiveHourPicker(null)}
        value={activeHourPicker === 'checkin' ? (checkInHour || '15:00') : (checkOutHour || '11:00')}
        onChange={(newVal) => {
          if (activeHourPicker === 'checkin') {
            onCheckInHourChange?.(newVal);
          } else if (activeHourPicker === 'checkout') {
            onCheckOutHourChange?.(newVal);
          }
        }}
        anchorLabel={
          activeHourPicker === 'checkin'
            ? t('engine.hotel_checkin_time_label')
            : t('engine.hotel_checkout_time_label')
        }
      />
    </div>
  );
}
