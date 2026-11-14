'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { CloseIcon, PinIcon, SearchIcon, CheckIcon } from '@/components/icons';
import { getApiBaseUrl } from '@/utils/api';

export interface PoiLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  onConfirm: (loc: { lat: number; lng: number; address?: string; suggestedName?: string }) => void;
}

const PoiMapPickerInner = dynamic(() => import('./PoiMapPickerInner'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-main, #FAF8F5)',
        borderRadius: '16px',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '12px',
        color: 'var(--color-text-muted)',
      }}
    >
      INITIALIZING MAP...
    </div>
  ),
});

interface PlaceSearchResult {
  name: string;
  display_name?: string;
  address?: string;
  category?: string;
  lat: number;
  lng: number;
  source?: string;
}

export function PoiLocationPickerModal({
  isOpen,
  onClose,
  city,
  initialLat,
  initialLng,
  initialAddress = '',
  onConfirm,
}: PoiLocationPickerModalProps) {
  const hasValidInitial =
    typeof initialLat === 'number' && !isNaN(initialLat) && typeof initialLng === 'number' && !isNaN(initialLng);

  const [pinPos, setPinPos] = useState<[number, number] | null>(
    hasValidInitial ? [initialLat!, initialLng!] : null
  );
  const [center, setCenter] = useState<[number, number] | null>(
    hasValidInitial ? [initialLat!, initialLng!] : null
  );
  const [resolvedAddress, setResolvedAddress] = useState(initialAddress);
  const [suggestedName, setSuggestedName] = useState('');
  const [isLocating, setIsLocating] = useState(!hasValidInitial);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReverseLoading, setIsReverseLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [prevInitialKey, setPrevInitialKey] = useState(
    `${isOpen}|${initialLat ?? ''}|${initialLng ?? ''}|${initialAddress}`
  );
  const currentInitialKey = `${isOpen}|${initialLat ?? ''}|${initialLng ?? ''}|${initialAddress}`;
  if (currentInitialKey !== prevInitialKey) {
    setPrevInitialKey(currentInitialKey);
    if (isOpen) {
      if (hasValidInitial) {
        setPinPos([initialLat!, initialLng!]);
        setCenter([initialLat!, initialLng!]);
        setIsLocating(false);
        setLocationError(null);
      } else {
        setIsLocating(true);
        setLocationError(null);
      }
      setResolvedAddress(initialAddress || '');
    }
  }

  // Resolve city center dynamically if no initial coords
  useEffect(() => {
    if (!isOpen || hasValidInitial) return;
    let active = true;

    const resolveCityCenter = async () => {
      const baseUrl = getApiBaseUrl();
      const destQuery = (city || '').trim();
      if (destQuery) {
        try {
          const apRes = await fetch(`${baseUrl}/locations/resolve-airport?city=${encodeURIComponent(destQuery)}`);
          if (apRes.ok) {
            const ap = await apRes.json();
            if (ap?.latitude && ap?.longitude && active) {
              setCenter([ap.latitude, ap.longitude]);
              setIsLocating(false);
              return;
            }
          }
        } catch {
          // fall through
        }

        try {
          const searchRes = await fetch(`${baseUrl}/locations/search?q=${encodeURIComponent(destQuery)}&limit=1`);
          if (searchRes.ok) {
            const items = await searchRes.json();
            if (Array.isArray(items) && items[0]?.latitude && items[0]?.longitude && active) {
              setCenter([items[0].latitude, items[0].longitude]);
              setIsLocating(false);
              return;
            }
          }
        } catch {
          // fall through
        }

        try {
          const placeRes = await fetch(
            `${baseUrl}/locations/places?city=${encodeURIComponent(destQuery)}&q=${encodeURIComponent(destQuery)}&limit=1`
          );
          if (placeRes.ok) {
            const items = await placeRes.json();
            if (Array.isArray(items) && items[0]?.lat && items[0]?.lng && active) {
              setCenter([items[0].lat, items[0].lng]);
              setIsLocating(false);
              return;
            }
          }
        } catch {
          // fall through
        }
      }

      if (active) {
        setIsLocating(false);
        setLocationError(`Could not automatically center map on "${city || 'destination'}". Use the street search above.`);
      }
    };

    void resolveCityCenter();
    return () => {
      active = false;
    };
  }, [isOpen, hasValidInitial, city]);

  // Dismiss search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced street / place search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(
          `${baseUrl}/locations/places?city=${encodeURIComponent(city || '')}&q=${encodeURIComponent(q)}&limit=8`
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
    }, 260);

    return () => clearTimeout(timer);
  }, [searchQuery, city]);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setSearchResults([]);
    setPinPos([lat, lng]);
    setIsReverseLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/locations/reverse?lat=${lat}&lon=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.address) setResolvedAddress(data.address);
        if (data.name) setSuggestedName(data.name);
      }
    } catch {
      // Keep coords even if reverse fails
    } finally {
      setIsReverseLoading(false);
    }
  }, []);

  const handleSelectResult = (item: PlaceSearchResult) => {
    setPinPos([item.lat, item.lng]);
    setCenter([item.lat, item.lng]);
    setResolvedAddress(item.address || item.display_name || item.name);
    setSuggestedName(item.name || '');
    setIsLocating(false);
    setLocationError(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick Place Location on Map"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100010,
        background: 'rgba(15, 23, 42, 0.62)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        data-testid="poi-location-picker-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '760px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-bg-main, #FAF8F5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'rgba(15, 76, 92, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent-primary, #0F4C5C)',
              }}
            >
              <PinIcon size={16} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Locate on Map
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Search a street, address, or landmark in {city || 'destination'}, or click on the map to drop a pin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close map picker"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              color: 'var(--color-text-muted)',
              display: 'flex',
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Street / Place Search Bar */}
        <div ref={searchContainerRef} style={{ padding: '12px 22px', position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-card, #FFFFFF)',
            }}
          >
            <SearchIcon size={15} color="var(--color-text-muted)" />
            <input
              type="text"
              data-testid="poi-map-street-search-input"
              placeholder={`Search street, square, or place in ${city || 'city'}...`}
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) setSearchResults([]);
              }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
            />
            {isSearching && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                Searching...
              </span>
            )}
          </div>

          {searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% - 4px)',
                left: '22px',
                right: '22px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.16)',
                maxHeight: '240px',
                overflowY: 'auto',
                zIndex: 500,
              }}
            >
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.name}-${item.lat}-${item.lng}-${idx}`}
                  type="button"
                  onClick={() => handleSelectResult(item)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: idx < searchResults.length - 1 ? '1px solid var(--color-border)' : 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {item.name}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                    {item.address || item.display_name || `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map Canvas */}
        <div style={{ height: '380px', padding: '14px 22px', position: 'relative' }}>
          {isLocating ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-main, #FAF8F5)',
                borderRadius: '16px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-muted)',
              }}
            >
              RESOLVING CITY COORDINATES...
            </div>
          ) : center ? (
            <PoiMapPickerInner
              center={center}
              zoom={pinPos ? 16 : 13}
              pinPos={pinPos}
              onMapClick={handleMapClick}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-main, #FAF8F5)',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'center',
                fontSize: '13px',
                color: 'var(--color-text-muted)',
              }}
            >
              {locationError || 'Search a street or place above to position the map.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px 18px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            background: 'var(--color-bg-main, #FAF8F5)',
          }}
        >
          <div style={{ flex: 1, minWidth: '200px' }}>
            {pinPos ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {isReverseLoading ? 'Resolving street address...' : resolvedAddress || 'Pinned Location'}
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                  {pinPos[0].toFixed(6)}, {pinPos[1].toFixed(6)}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Click anywhere on the map or select a search result to pin the place.
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-card, #FFFFFF)',
                color: 'var(--color-text-secondary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!pinPos}
              data-testid="confirm-poi-map-location-btn"
              onClick={() => {
                if (!pinPos) return;
                onConfirm({
                  lat: pinPos[0],
                  lng: pinPos[1],
                  address: resolvedAddress.trim() || undefined,
                  suggestedName: suggestedName.trim() || undefined,
                });
                onClose();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '9999px',
                border: 'none',
                background: pinPos ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: pinPos ? 'pointer' : 'not-allowed',
              }}
            >
              <CheckIcon size={14} color="#FFFFFF" />
              Use This Location
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
