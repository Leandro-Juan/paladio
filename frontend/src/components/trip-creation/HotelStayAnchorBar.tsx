"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { HotelIcon, PinIcon, CheckIcon } from '@/components/icons';
import { getApiBaseUrl } from '@/utils/api';

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
  onChange,
  disabled = false,
}: HotelStayAnchorBarProps) {
  const [query, setQuery] = useState(hotelArea);
  const [results, setResults] = useState<HotelSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    async (q: string): Promise<HotelSearchResult[]> => {
      if (!q || q.trim().length < 1) return [];
      try {
        const baseUrl = getApiBaseUrl();
        const url = `${baseUrl}/locations/hotels?city=${encodeURIComponent(
          destination || ''
        )}&q=${encodeURIComponent(q.trim())}&limit=8`;
        const res = await fetch(url);
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
    setIsMenuOpen(true);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      const items = await fetchHotels(val);
      setResults(items);
      setIsLoading(false);

      // Auto-bind coordinates if top item strongly matches query
      if (items.length > 0) {
        const top = items[0];
        const normVal = val.toLowerCase().trim();
        const normTop = top.name.toLowerCase().trim();
        if (normTop === normVal || normTop.includes(normVal) || normVal.includes(normTop)) {
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

  const isPinned = typeof hotelLat === 'number' && typeof hotelLng === 'number';

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
          Hotel / Stay Anchor
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
              if (results.length === 0 && (query || hotelArea)) {
                setIsLoading(true);
                void fetchHotels(query || hotelArea).then((items) => {
                  setResults(items);
                  setIsLoading(false);
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (results.length > 0) {
                  handleSelectHotel(results[0]);
                } else if (query.trim()) {
                  setIsMenuOpen(false);
                  setIsMapModalOpen(true);
                }
              }
            }}
            placeholder="Search hotel by name or neighborhood anchor..."
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
              title={`Hotel verified: ${hotelAddress || query} (${hotelLat?.toFixed(4)}, ${hotelLng?.toFixed(4)})`}
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
          title="Locate hotel or stay on map"
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
          <span>{isPinned ? 'View Map' : 'Locate on Map'}</span>
        </button>
      </div>

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
                <span>Searching hotels in {destination || 'destination'}...</span>
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
                No matching hotels found for &quot;{query}&quot;
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
                      {typeof item.lat === 'number' && typeof item.lng === 'number' && (
                        <span
                          title="Verified Hotel Location"
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
                    {getHotelCategoryBadge(item)}
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
    </div>
  );
}
