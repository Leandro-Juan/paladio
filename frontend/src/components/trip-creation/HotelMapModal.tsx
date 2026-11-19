"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';
import { HotelIcon, PinIcon, CheckIcon } from '@/components/icons';
import { getApiBaseUrl } from '@/utils/api';

export interface HotelMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  initialHotelName?: string;
  initialHotelAddress?: string;
  initialLat?: number;
  initialLng?: number;
  onConfirm: (hotel: { name: string; address?: string; lat: number; lng: number }) => void;
}

function MapLoadingPlaceholder() {
  const { t } = useTranslation();
  return (
    <div
      className="font-mono text-xs text-muted"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-main, #F7F9FA)',
        borderRadius: '16px',
      }}
    >
      {t('engine.initializing_map')}
    </div>
  );
}

const HotelMapInner = dynamic(() => import('./HotelMapInner'), {
  ssr: false,
  loading: () => <MapLoadingPlaceholder />,
});

interface HotelSearchResult {
  name: string;
  display_name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export function HotelMapModal({
  isOpen,
  onClose,
  destination,
  initialHotelName = '',
  initialHotelAddress = '',
  initialLat,
  initialLng,
  onConfirm,
}: HotelMapModalProps) {
  const { t } = useTranslation();
  const destLower = (destination || '').toLowerCase().trim();
  const addressLower = (initialHotelAddress || '').toLowerCase().trim();
  const nameLower = (initialHotelName || '').toLowerCase().trim();
  // Check if initial hotel belongs to a previous / different destination
  const isCityMismatch = Boolean(
    destLower &&
      (addressLower || nameLower) &&
      !addressLower.includes(destLower) &&
      !nameLower.includes(destLower) &&
      !destLower.includes(addressLower)
  );

  const [hotelName, setHotelName] = useState(isCityMismatch ? '' : initialHotelName);
  const [hotelAddress, setHotelAddress] = useState(isCityMismatch ? '' : initialHotelAddress);
  const [prevInitialName, setPrevInitialName] = useState(initialHotelName);
  const [prevInitialAddress, setPrevInitialAddress] = useState(initialHotelAddress);
  const [prevDestination, setPrevDestination] = useState(destination);

  if (initialHotelName !== prevInitialName) {
    setPrevInitialName(initialHotelName);
    if (!isCityMismatch) setHotelName(initialHotelName);
  }
  if (initialHotelAddress !== prevInitialAddress) {
    setPrevInitialAddress(initialHotelAddress);
    if (!isCityMismatch) setHotelAddress(initialHotelAddress);
  }
  if (destination !== prevDestination) {
    setPrevDestination(destination);
    setHotelName('');
    setHotelAddress('');
  }

  const hasValidInitialCoords = Boolean(initialLat && initialLng && !isCityMismatch);
  const [pinPos, setPinPos] = useState<[number, number] | null>(
    hasValidInitialCoords ? [initialLat!, initialLng!] : null
  );
  const [center, setCenter] = useState<[number, number] | null>(
    hasValidInitialCoords ? [initialLat!, initialLng!] : null
  );
  const [prevLat, setPrevLat] = useState(initialLat);
  const [prevLng, setPrevLng] = useState(initialLng);
  const [isLocating, setIsLocating] = useState<boolean>(!hasValidInitialCoords);
  const [locationError, setLocationError] = useState<string | null>(null);

  if (initialLat !== prevLat || initialLng !== prevLng) {
    setPrevLat(initialLat);
    setPrevLng(initialLng);
    if (initialLat && initialLng && !isCityMismatch) {
      setPinPos([initialLat, initialLng]);
      setCenter([initialLat, initialLng]);
      setIsLocating(false);
      setLocationError(null);
    }
  }

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen && !hasValidInitialCoords) {
      setIsLocating(true);
      setLocationError(null);
    }
  }

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HotelSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReverseLoading, setIsReverseLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Automatically locate accommodation / destination dynamically when opened
  useEffect(() => {
    if (!isOpen) return;

    if (initialLat && initialLng && !isCityMismatch) {
      return;
    }

    let isMounted = true;

    const resolveLocation = async () => {
      const baseUrl = getApiBaseUrl();
      const targetQuery = isCityMismatch ? '' : (initialHotelName?.trim() || '');
      const destQuery = destination?.trim() || '';

      // 1. If an accommodation name is provided and matches destination, search & pin the hotel dynamically
      if (targetQuery && !isCityMismatch) {
        try {
          const hotelUrl = `${baseUrl}/locations/hotels?city=${encodeURIComponent(
            destQuery
          )}&q=${encodeURIComponent(targetQuery)}&limit=1`;
          const res = await fetch(hotelUrl);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lng) {
              if (isMounted) {
                const hotel = data[0];
                setPinPos([hotel.lat, hotel.lng]);
                setCenter([hotel.lat, hotel.lng]);
                setHotelName(hotel.name);
                if (hotel.address) setHotelAddress(hotel.address);
                setIsLocating(false);
                return;
              }
            }
          }
        } catch {
          // Fall through to destination resolution
        }
      }

      // 2. Resolve destination city coordinates dynamically via resolve-airport
      if (destQuery) {
        try {
          const apUrl = `${baseUrl}/locations/resolve-airport?city=${encodeURIComponent(destQuery)}`;
          const res = await fetch(apUrl);
          if (res.ok) {
            const ap = await res.json();
            if (ap && ap.latitude && ap.longitude) {
              if (isMounted) {
                setCenter([ap.latitude, ap.longitude]);
                setIsLocating(false);
                return;
              }
            }
          }
        } catch {
          // Fall through
        }

        // 3. Fallback: query locations/search dynamically
        try {
          const destUrl = `${baseUrl}/locations/search?q=${encodeURIComponent(destQuery)}&limit=1`;
          const res = await fetch(destUrl);
          if (res.ok) {
            const items = await res.json();
            if (Array.isArray(items) && items.length > 0 && items[0].latitude && items[0].longitude) {
              if (isMounted) {
                setCenter([items[0].latitude, items[0].longitude]);
                setIsLocating(false);
                return;
              }
            }
          }
        } catch {
          // Fall through
        }

        // 4. Fallback: query Nominatim dynamically for destination city
        try {
          const osmUrl = `${baseUrl}/locations/hotels?city=${encodeURIComponent(destQuery)}&q=${encodeURIComponent(destQuery)}&limit=1`;
          const res = await fetch(osmUrl);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lng) {
              if (isMounted) {
                setCenter([data[0].lat, data[0].lng]);
                setIsLocating(false);
                return;
              }
            }
          }
        } catch {
          // Fall through
        }
      }

      // If all dynamic sources failed, fail fast without any hardcoded synthetic data
      if (isMounted) {
        setIsLocating(false);
        setLocationError(
          t('engine.hotel_locate_error', { target: destination || initialHotelName })
        );
      }
    };

    void resolveLocation();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialHotelName, initialHotelAddress, initialLat, initialLng, destination, isCityMismatch, t]);

  // Handle map click with reverse geocode
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setSearchResults([]);
    setPinPos([lat, lng]);
    setIsReverseLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/locations/reverse?lat=${lat}&lon=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.name) setHotelName(data.name);
        if (data.address) setHotelAddress(data.address);
      }
    } catch {
      // Keep existing or generic
    } finally {
      setIsReverseLoading(false);
    }
  }, []);

  // Click outside to dismiss search results dropdown inside modal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search within map modal
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(
          `${baseUrl}/locations/hotels?city=${encodeURIComponent(destination || '')}&q=${encodeURIComponent(
            searchQuery.trim()
          )}&limit=6`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, destination]);

  const handleSelectSearchResult = (item: HotelSearchResult) => {
    setHotelName(item.name);
    setHotelAddress(item.address);
    setPinPos([item.lat, item.lng]);
    setCenter([item.lat, item.lng]);
    setIsLocating(false);
    setLocationError(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleConfirm = () => {
    if (!pinPos) return;
    onConfirm({
      name: hotelName.trim() || t('engine.stay_at_destination', { destination }),
      address: hotelAddress.trim() || undefined,
      lat: pinPos[0],
      lng: pinPos[1],
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-bg-main, #FAF8F5)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(217, 119, 6, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <HotelIcon size={16} color="#D97706" />
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A1A1A)',
                }}
              >
                {t('engine.locate_hotel_modal_title')}
              </h3>
            </div>
            <p
              className="font-mono text-xs"
              style={{
                margin: '4px 0 0',
                color: 'var(--color-text-muted, #71717A)',
                fontSize: '11.5px',
              }}
            >
              {t('engine.locate_hotel_modal_desc', {
                destination: destination || t('engine.destination_lower'),
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: '20px',
              padding: '4px 8px',
              borderRadius: '8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Search Bar Input */}
        <div
          ref={searchContainerRef}
          style={{
            padding: '12px 24px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            borderBottom: '1px solid var(--color-border)',
            position: 'relative',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-bg-main, #FAF8F5)',
              border: '1px solid var(--color-border)',
              borderRadius: '9999px',
              padding: '8px 16px',
            }}
          >
            <HotelIcon size={15} color="var(--color-text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  setSearchResults([]);
                }
              }}
              placeholder={t('engine.search_hotel_modal_placeholder', {
                destination: destination || t('engine.city_lower'),
              })}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: '100%',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
            />
            {isSearching && (
              <span className="font-mono text-xs text-muted" style={{ fontSize: '11px' }}>
                {t('engine.searching_upper')}
              </span>
            )}
          </div>

          {/* Quick search results dropdown inside modal */}
          {searchResults.length > 0 && (
            <div
              className="no-scrollbar"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: '24px',
                right: '24px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                zIndex: 1001,
                maxHeight: '200px',
                overflowY: 'auto',
                scrollbarWidth: 'none',
                padding: '6px',
              }}
            >
              {searchResults.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  onClick={() => handleSelectSearchResult(item)}
                  style={{
                    padding: '8px 12px',
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
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--color-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.address}
                    </div>
                  </div>
                  <PinIcon size={14} color="#D97706" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '380px', padding: '12px 24px' }}>
          {isLocating || !center ? (
            <div
              className="font-mono text-xs text-muted"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-main, #F7F9FA)',
                borderRadius: '16px',
                gap: '12px',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              {locationError ? (
                <>
                  <div style={{ color: 'var(--color-accent-amber, #D97706)', fontWeight: 600, fontSize: '13px' }}>
                    {locationError}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {t('engine.search_hotel_hint')}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: '2px solid rgba(15, 76, 92, 0.2)',
                      borderTopColor: 'var(--color-accent-primary, #0F4C5C)',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <span>
                    {initialHotelName?.trim()
                      ? t('engine.locating_quoted', { target: initialHotelName.trim().toUpperCase() })
                      : t('engine.locating_plain', {
                          target: destination ? destination.toUpperCase() : t('engine.destination_upper'),
                        })}
                  </span>
                </>
              )}
            </div>
          ) : (
            <HotelMapInner
              center={center}
              zoom={pinPos ? 16 : 14}
              pinPos={pinPos}
              onMapClick={handleMapClick}
            />
          )}
        </div>

        {/* Selected Location Details & Actions */}
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-main, #FAF8F5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: '4px',
                }}
              >
                {t('engine.accommodation_name_label')}
              </label>
              <input
                type="text"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder={t('engine.accommodation_name_placeholder')}
                style={{
                  width: '100%',
                  background: 'var(--color-surface-raised, #FFFFFF)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: '4px',
                }}
              >
                {t('engine.address_neighborhood_label')} {isReverseLoading && t('engine.resolving_suffix')}
              </label>
              <input
                type="text"
                value={hotelAddress}
                onChange={(e) => setHotelAddress(e.target.value)}
                placeholder={t('engine.address_placeholder')}
                style={{
                  width: '100%',
                  background: 'var(--color-surface-raised, #FFFFFF)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
              {pinPos
                ? t('engine.pin_coords', { lat: pinPos[0].toFixed(5), lng: pinPos[1].toFixed(5) })
                : t('engine.click_map_to_pin')}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!pinPos}
                onClick={handleConfirm}
                style={{
                  padding: '8px 20px',
                  background: pinPos ? 'var(--color-accent-primary, #0F4C5C)' : '#E2D9CC',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: pinPos ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: pinPos ? '0 2px 8px rgba(15,76,92,0.25)' : 'none',
                }}
              >
                <CheckIcon size={14} color="#FFFFFF" /> {t('engine.set_stay_anchor')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
