"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DayOutput, OptimizationResult, ScheduledPoi, PoiDetail } from '@/types/domain';
import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { PoiCategoryIcon, PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { MinimalistPoiCard } from './MinimalistPoiCard';
import { TransitRecommendationCard, TransitLegView } from '@/components/TransitLegView';
import { EmptyState } from '@/components/EmptyState';
import { TripTransitTab } from './TripTransitTab';
import { getApiBaseUrl, getAuthToken } from '@/utils/api';
import { notify } from '@/utils/notify';
import { getScheduledPoiTimes, getPoiOpeningHours } from '@/utils/date';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { resolveDestinationCurrency, getCurrencyInfo } from '@/utils/currencyResolver';
import { isPointInPolygon, computeClusterPolygon } from '@/utils/clusterHull';
import { getDayColor } from './TripMapView';
import {
  SearchIcon,
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  InfoIcon,
  CloseIcon,
  Spinner,
  LockIcon,
  UnlockIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  WalkIcon,
  TransitIcon,
  PlusIcon,
  EditIcon,
  CpuIcon,
  LayersViewIcon,
  StarIcon,
} from '@/components/icons';

export interface PlaceItem {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  day?: number;
  durationMins?: number;
  costEur?: number;
  similarity?: number;
  matchType?: string;
  description?: string;
}

export interface PoiApiItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  duration_mins: number;
  cost_eur: number;
  similarity: number;
  iconicity_score?: number;
  match_type?: string;
  description?: string;
  photo_url?: string;
  thumbnail_url?: string;
}

interface SearchPoiThumbnailProps {
  id?: string;
  name: string;
  category?: string;
  photoUrl?: string;
  city?: string;
}

function SearchPoiThumbnail({ id, name, category, photoUrl, city = '' }: SearchPoiThumbnailProps) {
  const { getPhoto, requestPhoto } = usePoiPhotos();
  const [imgFailed, setImgFailed] = useState(false);

  const resolvedPhoto = photoUrl || getPhoto(id) || getPhoto(name);

  useEffect(() => {
    if (!resolvedPhoto && (id || name)) {
      requestPhoto({ id, name, city, photo_url: photoUrl });
    }
  }, [id, name, city, photoUrl, resolvedPhoto, requestPhoto]);

  return (
    <div
      style={{
        width: '40px',
        height: '40px',
        minWidth: '40px',
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--color-bg-secondary, #F4EFE6)',
        border: '1.5px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    >
      {resolvedPhoto && !imgFailed ? (
        <img
          src={resolvedPhoto}
          alt={name}
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            display: 'block',
          }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <PoiCategoryIcon category={category} name={name} size={18} color="var(--color-text-muted)" />
      )}
    </div>
  );
}

interface PoiSearchResponseData {
  city: string;
  query: string;
  search_type: string;
  exact_match_found: boolean;
  message?: string | null;
  exact_match?: PoiApiItem | null;
  results: PoiApiItem[];
  total?: number | null;
}

export interface TripUnifiedSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  tripId?: string;
  tripStartDate?: string;
  destinationCity?: string;
  days: DayOutput[];
  selectedDay: number | 'all';
  onSelectDay: (day: number | 'all') => void;
  itinerary?: OptimizationResult | null;
  onItineraryUpdate?: (updated: OptimizationResult) => void;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
  transitMode?: 'simple' | 'detailed';
  onTransitModeChange?: (mode: 'simple' | 'detailed') => void;
  places?: PlaceItem[];
  onPlaceClick?: (place: PlaceItem) => void;
  onCategoryPoisChange?: (pois: PoiApiItem[]) => void;
  hotelAnchor?: { name: string; lat: number; lng: number };
  airportAnchor?: { name: string; lat: number; lng: number };
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
  inspectedPoiId?: string | null;
  onCloseInspect?: () => void;
  onAddToDay?: (dayNumber: number, poi: PoiDetail) => void;
  onFocusFromInspector?: (poi: {
    lat: number;
    lng: number;
    name: string;
    category: string;
    durationMins?: number;
    costEur?: number;
  }) => void;
  availableDays?: number[];
  initialDay?: number;
  isEditMode?: boolean;
  onToggleEditMode?: () => void;
  onReoptimizeDay?: () => Promise<void>;
  isReoptimizing?: boolean;
  onToggleTransitMode?: () => void;
  activeMapPickField?: 'origin' | 'destination' | null;
  onStartMapPick?: (field: 'origin' | 'destination') => void;
  onCancelMapPick?: () => void;
  onRouteCalculated?: (routeResult: any, activeMode: 'primary' | 'alternative') => void;
  sidebarTab?: MainTabType;
  onTabChange?: (tab: MainTabType) => void;
}

export type MainTabType = 'route' | 'search' | 'transit' | 'saved';

const PROJECT_CATEGORIES: { id: string; label: string; iconType: PoiCategoryType }[] = [
  { id: 'all', label: 'All', iconType: 'general' },
  { id: 'attraction', label: 'Attractions', iconType: 'attraction' },
  { id: 'museum', label: 'Museums', iconType: 'museum' },
  { id: 'restaurant', label: 'Restaurants', iconType: 'restaurant' },
  { id: 'cafe', label: 'Cafés', iconType: 'cafe' },
  { id: 'landmark', label: 'Monuments', iconType: 'landmark' },
  { id: 'park', label: 'Parks', iconType: 'park' },
  { id: 'hotel', label: 'Stays', iconType: 'hotel' },
  { id: 'shopping', label: 'Shopping', iconType: 'shopping' },
];

interface HoverScrollRowProps {
  children: React.ReactNode;
  testId?: string;
  style?: React.CSSProperties;
}

/**
 * Component for Smooth Horizontal Edge-Hover Scrolling.
 * When the mouse cursor is within edgeThreshold px of the left or right edge,
 * it runs a continuous requestAnimationFrame scroll loop with smooth velocity.
 */
function HoverScrollRow({ children, testId, style }: HoverScrollRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const velocityRef = useRef<number>(0);

  const stopScrolling = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    velocityRef.current = 0;
  }, []);

  const stepScroll = useCallback(() => {
    function loop() {
      const el = containerRef.current;
      if (!el || velocityRef.current === 0) {
        stopScrolling();
        return;
      }
      el.scrollLeft += velocityRef.current;
      rafIdRef.current = requestAnimationFrame(loop);
    }
    rafIdRef.current = requestAnimationFrame(loop);
  }, [stopScrolling]);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const edgeThreshold = 48;
    const maxSpeed = 9;

    if (mouseX < edgeThreshold) {
      const intensity = (edgeThreshold - mouseX) / edgeThreshold;
      velocityRef.current = -Math.max(1, intensity * maxSpeed);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(stepScroll);
      }
    } else if (mouseX > rect.width - edgeThreshold) {
      const intensity = (mouseX - (rect.width - edgeThreshold)) / edgeThreshold;
      velocityRef.current = Math.max(1, intensity * maxSpeed);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(stepScroll);
      }
    } else {
      stopScrolling();
    }
  };

  const onMouseLeave = () => {
    stopScrolling();
  };

  useEffect(() => {
    return () => {
      stopScrolling();
    };
  }, [stopScrolling]);

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        cursor: 'default',
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Creates a route-styled ghost drag image resembling MinimalistPoiCard
 */
export function createRouteCardDragImage(poi: {
  name: string;
  category?: string;
  duration_mins?: number;
  cost_eur?: number;
}): HTMLElement {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.top = '-9999px';
  el.style.left = '-9999px';
  el.style.width = '320px';
  el.style.padding = '10px 14px';
  el.style.background = 'var(--color-surface-card, #FFFFFF)';
  el.style.borderRadius = '14px';
  el.style.border = '1.5px solid var(--color-accent-primary, #0F4C5C)';
  el.style.boxShadow = '0 12px 28px rgba(15, 76, 92, 0.25), 0 2px 6px rgba(0, 0, 0, 0.08)';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'space-between';
  el.style.gap = '10px';
  el.style.fontFamily = 'var(--font-sans, system-ui, sans-serif)';
  el.style.zIndex = '99999';
  el.style.pointerEvents = 'none';

  const name = poi.name || 'Scheduled Place';
  const cat = poi.category || 'Waypoint';
  const dur = poi.duration_mins ? `${poi.duration_mins}m` : '60m';

  el.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
      <div style="width: 24px; height: 24px; border-radius: 6px; background: rgba(15, 76, 92, 0.12); color: #0F4C5C; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; font-family: monospace;">
        +
      </div>
      <div style="min-width: 0;">
        <div style="font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">
          ${name}
        </div>
        <div style="font-size: 11px; color: #64748b; text-transform: capitalize;">
          ${cat} · ${dur}
        </div>
      </div>
    </div>
    <div style="font-size: 10px; font-weight: 700; font-family: monospace; color: #0F4C5C; background: rgba(15, 76, 92, 0.08); padding: 3px 8px; border-radius: 9999px; white-space: nowrap;">
      ROUTE STOP
    </div>
  `;

  document.body.appendChild(el);
  return el;
}

export interface DropdownOption<T> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface CustomDropdownProps<T> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  prefix?: string;
  ariaLabel?: string;
  minWidth?: string;
  align?: 'left' | 'right';
  testId?: string;
}

/**
 * Custom Dropdown menu inspired by Dstudio side-menu aesthetic.
 * Replaces native browser selects with floating blurred card popovers.
 */
export function CustomDropdown<T extends string | number>({
  value,
  options,
  onChange,
  prefix,
  ariaLabel,
  minWidth = '160px',
  align = 'left',
  testId,
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        data-testid={testId}
        aria-label={ariaLabel || prefix || 'Select option'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '9999px',
          border: `1px solid ${isOpen ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
          background: isOpen ? 'var(--color-surface-raised, #F8FAFC)' : 'var(--color-surface-card, #FFFFFF)',
          color: 'var(--color-text-primary)',
          fontSize: '11.5px',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 2px rgba(15, 76, 92, 0.15)' : 'var(--shadow-sm)',
          transition: 'all 0.18s cubic-bezier(0.23, 1, 0.32, 1)',
          whiteSpace: 'nowrap',
        }}
      >
        {prefix && <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{prefix}</span>}
        <span>{selectedOption?.label}</span>
        <span
          style={{
            display: 'inline-flex',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: 'var(--color-text-muted)',
            marginLeft: '2px',
          }}
        >
          <ChevronDownIcon size={12} color="currentColor" />
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            minWidth,
            background: 'var(--color-surface-card, #FFFFFF)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 14px 34px -4px rgba(15, 76, 92, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)',
            padding: '6px',
            zIndex: 2500,
            animation: 'fadeInScale 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={String(opt.value)}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 12px',
                  borderRadius: '10px',
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                  background: isSelected ? 'rgba(15, 76, 92, 0.08)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {opt.icon}
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <span style={{ color: 'var(--color-accent-primary)', display: 'inline-flex' }}>
                    <CheckIcon size={13} color="currentColor" />
                  </span>
                )}
                {opt.badge && !isSelected && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      color: 'var(--color-text-muted)',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      background: 'var(--color-surface-subtle)',
                    }}
                  >
                    {opt.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PriceRangeSliderDropdownProps {
  value: [number, number];
  onChange: (range: [number, number]) => void;
  currencySymbol?: string;
}

export function PriceRangeSliderDropdown({ value, onChange, currencySymbol = '€' }: PriceRangeSliderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const sym = currencySymbol || '€';
  const isAny = value[0] === 0 && value[1] >= 100;
  const label = isAny
    ? 'Price: Any'
    : value[0] === 0
    ? `Price: < ${sym}${value[1]}`
    : `Price: ${sym}${value[0]} – ${sym}${value[1]}${value[1] >= 100 ? '+' : ''}`;

  const minPercent = Math.max(0, Math.min(100, (value[0] / 100) * 100));
  const maxPercent = Math.max(0, Math.min(100, (value[1] / 100) * 100));

  const presets = [
    { label: 'Free', range: [0, 0] as [number, number] },
    { label: `${sym}`, range: [0, 10] as [number, number] },
    { label: `${sym}${sym}`, range: [10, 25] as [number, number] },
    { label: `${sym}${sym}${sym}`, range: [25, 100] as [number, number] },
    { label: 'Any', range: [0, 100] as [number, number] },
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Filter by Price Range"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '9999px',
          border: `1px solid ${!isAny || isOpen ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
          background: isOpen ? 'var(--color-surface-raised, #F8FAFC)' : 'var(--color-surface-card, #FFFFFF)',
          color: 'var(--color-text-primary)',
          fontSize: '11.5px',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 2px rgba(15, 76, 92, 0.15)' : 'var(--shadow-sm)',
          transition: 'all 0.18s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{label}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--color-text-muted)', display: 'inline-flex' }}>
          <ChevronDownIcon size={12} color="currentColor" />
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '260px',
            background: 'var(--color-surface-card, #FFFFFF)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 14px 34px -4px rgba(15, 76, 92, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)',
            padding: '14px',
            zIndex: 2500,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
              PRICE RANGE
            </span>
            <button
              type="button"
              onClick={() => onChange([0, 100])}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--color-accent-teal-mid, #14788D)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0',
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
            <span>{sym}{value[0]}</span>
            <span>{value[1] >= 100 ? `${sym}100+` : `${sym}${value[1]}`}</span>
          </div>

          {/* Single Continuous Glider Line with Two Points */}
          <div className="paladio-dual-slider-container" style={{ margin: '6px 0 2px 0' }}>
            {/* Inactive background track */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '4px',
                borderRadius: '9999px',
                background: 'var(--color-border, #E2D9CC)',
              }}
            />
            {/* Active range colored segment between min and max points */}
            <div
              style={{
                position: 'absolute',
                left: `${minPercent}%`,
                width: `${Math.max(0, maxPercent - minPercent)}%`,
                height: '4px',
                borderRadius: '9999px',
                background: 'var(--color-accent-primary, #0F4C5C)',
              }}
            />
            {/* Min Handle Point */}
            <input
              type="range"
              className="paladio-range-input"
              aria-label={`Minimum price ${sym}${value[0]}`}
              min="0"
              max="100"
              step="5"
              value={value[0]}
              style={{ zIndex: value[0] > 90 ? 5 : 3 }}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange([Math.min(val, value[1]), value[1]]);
              }}
            />
            {/* Max Handle Point */}
            <input
              type="range"
              className="paladio-range-input"
              aria-label={`Maximum price ${sym}${value[1]}`}
              min="0"
              max="100"
              step="5"
              value={value[1]}
              style={{ zIndex: 4 }}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange([value[0], Math.max(val, value[0])]);
              }}
            />
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid var(--color-border)' }}>
            {presets.map((p) => {
              const isSelected = value[0] === p.range[0] && value[1] === p.range[1];
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange(p.range)}
                  style={{
                    padding: '4px 9px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: isSelected ? 'var(--color-accent-primary)' : 'var(--color-surface-subtle)',
                    color: isSelected ? '#FFFFFF' : 'var(--color-text-primary)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface DurationRangeSliderDropdownProps {
  value: [number, number];
  onChange: (range: [number, number]) => void;
}

function formatDurationMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function DurationRangeSliderDropdown({ value, onChange }: DurationRangeSliderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isAny = value[0] <= 15 && value[1] >= 240;
  const label = isAny
    ? 'Duration: Any'
    : `Duration: ${formatDurationMins(value[0])} – ${formatDurationMins(value[1])}${value[1] >= 240 ? '+' : ''}`;

  const minPercent = Math.max(0, Math.min(100, ((value[0] - 15) / (240 - 15)) * 100));
  const maxPercent = Math.max(0, Math.min(100, ((value[1] - 15) / (240 - 15)) * 100));

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Filter by Duration Range"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '9999px',
          border: `1px solid ${!isAny || isOpen ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
          background: isOpen ? 'var(--color-surface-raised, #F8FAFC)' : 'var(--color-surface-card, #FFFFFF)',
          color: 'var(--color-text-primary)',
          fontSize: '11.5px',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 2px rgba(15, 76, 92, 0.15)' : 'var(--shadow-sm)',
          transition: 'all 0.18s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{label}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--color-text-muted)', display: 'inline-flex' }}>
          <ChevronDownIcon size={12} color="currentColor" />
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '260px',
            background: 'var(--color-surface-card, #FFFFFF)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 14px 34px -4px rgba(15, 76, 92, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)',
            padding: '14px',
            zIndex: 2500,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
              DURATION RANGE
            </span>
            <button
              type="button"
              onClick={() => onChange([15, 240])}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--color-accent-teal-mid, #14788D)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0',
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
            <span>{formatDurationMins(value[0])}</span>
            <span>{value[1] >= 240 ? '4h+' : formatDurationMins(value[1])}</span>
          </div>

          {/* Single Continuous Glider Line with Two Points */}
          <div className="paladio-dual-slider-container" style={{ margin: '6px 0 2px 0' }}>
            {/* Inactive background track */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '4px',
                borderRadius: '9999px',
                background: 'var(--color-border, #E2D9CC)',
              }}
            />
            {/* Active range colored segment between min and max points */}
            <div
              style={{
                position: 'absolute',
                left: `${minPercent}%`,
                width: `${Math.max(0, maxPercent - minPercent)}%`,
                height: '4px',
                borderRadius: '9999px',
                background: 'var(--color-accent-primary, #0F4C5C)',
              }}
            />
            {/* Min Handle Point */}
            <input
              type="range"
              className="paladio-range-input"
              aria-label={`Minimum duration ${formatDurationMins(value[0])}`}
              min="15"
              max="240"
              step="15"
              value={value[0]}
              style={{ zIndex: value[0] > 210 ? 5 : 3 }}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange([Math.min(val, value[1]), value[1]]);
              }}
            />
            {/* Max Handle Point */}
            <input
              type="range"
              className="paladio-range-input"
              aria-label={`Maximum duration ${formatDurationMins(value[1])}`}
              min="15"
              max="240"
              step="15"
              value={value[1]}
              style={{ zIndex: 4 }}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange([value[0], Math.max(val, value[0])]);
              }}
            />
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid var(--color-border)' }}>
            {[
              { label: '< 45m', range: [15, 45] as [number, number] },
              { label: '1 - 2h', range: [60, 120] as [number, number] },
              { label: '> 2h', range: [120, 240] as [number, number] },
              { label: 'Any', range: [15, 240] as [number, number] },
            ].map((p) => {
              const isSelected = value[0] === p.range[0] && value[1] === p.range[1];
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange(p.range)}
                  style={{
                    padding: '4px 9px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: isSelected ? 'var(--color-accent-primary)' : 'var(--color-surface-subtle)',
                    color: isSelected ? '#FFFFFF' : 'var(--color-text-primary)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface RatingStarFilterDropdownProps {
  value: number; // 0 for all, or 0.5 - 5.0
  onChange: (rating: number) => void;
}

export function RatingStarFilterDropdown({ value, onChange }: RatingStarFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHoverRating(null);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeRating = hoverRating !== null ? hoverRating : value;
  const isFiltered = value > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Filter by Minimum Star Rating"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '9999px',
          border: `1px solid ${isFiltered || isOpen ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
          background: isOpen ? 'var(--color-surface-raised, #F8FAFC)' : 'var(--color-surface-card, #FFFFFF)',
          color: isFiltered ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
          fontSize: '11.5px',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 2px rgba(15, 76, 92, 0.15)' : 'var(--shadow-sm)',
          transition: 'all 0.18s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{isFiltered ? `Rating: ${value.toFixed(1)}★+` : 'Rating: Any'}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--color-text-muted)', display: 'inline-flex' }}>
          <ChevronDownIcon size={12} color="currentColor" />
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '210px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--color-surface-card, #FFFFFF)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 14px 34px -4px rgba(15, 76, 92, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)',
            padding: '14px',
            zIndex: 2500,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
              MINIMUM RATING
            </span>
            <button
              type="button"
              onClick={() => {
                onChange(0);
                setHoverRating(null);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--color-accent-teal-mid, #14788D)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0',
              }}
            >
              Reset
            </button>
          </div>

          {/* 5 empty stars row with half-star hover/click */}
          <div
            onMouseLeave={() => setHoverRating(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 0',
              background: 'var(--color-surface-subtle, #F8FAFC)',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
            }}
          >
            {[1, 2, 3, 4, 5].map((starIdx) => {
              const fullFilled = activeRating >= starIdx;
              const halfFilled = !fullFilled && activeRating >= starIdx - 0.5;

              return (
                <div
                  key={starIdx}
                  style={{
                    position: 'relative',
                    width: '24px',
                    height: '24px',
                    userSelect: 'none',
                  }}
                >
                  {/* Empty star outline */}
                  {!fullFilled && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <StarIcon size={20} fill="none" color="var(--color-border, #CBD5E1)" style={{ display: 'block' }} />
                    </div>
                  )}

                  {/* Half filled foreground */}
                  {halfFilled && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '50%',
                        height: '100%',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <StarIcon size={20} fill="#F59E0B" color="#F59E0B" style={{ display: 'block' }} />
                      </div>
                    </div>
                  )}

                  {/* Full filled foreground */}
                  {fullFilled && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <StarIcon size={20} fill="#F59E0B" color="#F59E0B" style={{ display: 'block' }} />
                    </div>
                  )}

                  {/* Left half interactive target (0.5 stars) */}
                  <div
                    onMouseEnter={() => setHoverRating(starIdx - 0.5)}
                    onClick={() => {
                      const next = value === starIdx - 0.5 ? 0 : starIdx - 0.5;
                      onChange(next);
                      setHoverRating(null);
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '50%',
                      height: '100%',
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                  />

                  {/* Right half interactive target (1.0 stars) */}
                  <div
                    onMouseEnter={() => setHoverRating(starIdx)}
                    onClick={() => {
                      const next = value === starIdx ? 0 : starIdx;
                      onChange(next);
                      setHoverRating(null);
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: '50%',
                      height: '100%',
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ textAlign: 'center', fontSize: '11px', color: activeRating > 0 ? '#B45309' : 'var(--color-text-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {activeRating > 0 ? `★ ${activeRating.toFixed(1)} & above` : 'Any rating'}
          </div>
        </div>
      )}
    </div>
  );
}

export function TripUnifiedSidebar({
  isOpen,
  onToggle,
  tripId,
  tripStartDate,
  destinationCity = '',
  days,
  selectedDay,
  onSelectDay,
  itinerary,
  onItineraryUpdate,
  categoryFilter,
  onCategoryFilterChange,
  transitMode = 'simple',
  onTransitModeChange,
  places = [],
  onPlaceClick,
  onCategoryPoisChange,
  hotelAnchor,
  airportAnchor,
  onInspectPoi,
  inspectedPoiId,
  onCloseInspect,
  onAddToDay,
  onFocusFromInspector,
  availableDays = [],
  initialDay = 1,
  isEditMode = false,
  onReoptimizeDay,
  isReoptimizing = false,
  onToggleTransitMode,
  activeMapPickField,
  onStartMapPick,
  onCancelMapPick,
  onRouteCalculated,
  sidebarTab,
  onTabChange,
}: TripUnifiedSidebarProps) {
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const destCurrencyMeta = useMemo(() => resolveDestinationCurrency(destinationCity), [destinationCity]);
  const activeCurrencyCode = (user?.preferences?.default_currency as string) || destCurrencyMeta.currency || 'EUR';
  const currencySymbol = useMemo(() => {
    const info = getCurrencyInfo(activeCurrencyCode);
    return info?.symbol || destCurrencyMeta.symbol || '€';
  }, [activeCurrencyCode, destCurrencyMeta.symbol]);

  // Search Tab State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchReqSeqRef = useRef<number>(0);
  const [searchData, setSearchData] = useState<PoiSearchResponseData | null>(null);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Primary Tabs State
  const [internalActiveTab, setInternalActiveTab] = useState<MainTabType>('route');
  const activeTab = sidebarTab !== undefined ? sidebarTab : internalActiveTab;
  const setActiveTab = useCallback(
    (tab: MainTabType) => {
      setInternalActiveTab(tab);
      onTabChange?.(tab);
      if (tab === 'route') {
        setActiveCategory('all');
        onCategoryFilterChange?.(null);
        onCategoryPoisChange?.([]);
      }
    },
    [onTabChange, onCategoryFilterChange, onCategoryPoisChange]
  );

  // Filters state
  const [costRange, setCostRange] = useState<[number, number]>([0, 100]);
  const [durationRange, setDurationRange] = useState<[number, number]>([15, 240]);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortOption, setSortOption] = useState<'best' | 'rating' | 'cost' | 'name'>('best');

  // Saved / Bookmarked state
  const [savedPoiIds, setSavedPoiIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined' && tripId) {
      try {
        const stored = localStorage.getItem(`paladio_saved_pois_${tripId}`);
        if (stored) return new Set(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
    return new Set<string>();
  });

  const toggleSavePoi = useCallback((poiId: string) => {
    setSavedPoiIds((prev) => {
      const next = new Set(prev);
      if (next.has(poiId)) {
        next.delete(poiId);
        notify.info('Removed from Saved', 'Place removed from your saved list.');
      } else {
        next.add(poiId);
        notify.success('Saved Place', 'Place bookmarked for this trip.');
      }
      if (typeof window !== 'undefined' && tripId) {
        try {
          localStorage.setItem(`paladio_saved_pois_${tripId}`, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [tripId]);

  // Route Drag-and-drop state
  const [activeDropTarget, setActiveDropTarget] = useState<{ day: number; index: number } | null>(null);
  const [draggedPoi, setDraggedPoi] = useState<{ day: number; index: number } | null>(null);
  const [unlockConfirmAnchor, setUnlockConfirmAnchor] = useState<{
    dayNum: number;
    poiIdx: number;
    name: string;
    type: string;
  } | null>(null);


  // Auto-switch to route tab when any POI begins being dragged from search or inspector
  useEffect(() => {
    const handleSwitchToRoute = () => {
      setActiveTab('route');
    };
    window.addEventListener('paladio:switch-to-route', handleSwitchToRoute);
    return () => window.removeEventListener('paladio:switch-to-route', handleSwitchToRoute);
  }, []);


  // Active Day Convex Hull for POI search prioritization (excluding transit and lodging anchors to match map territory)
  const activeDayHull = useMemo<[number, number][] | null>(() => {
    if (selectedDay === 'all') return null;
    const targetDayData = days.find((d) => d.day === selectedDay);
    if (!targetDayData?.itinerary?.path || targetDayData.itinerary.path.length === 0) return null;
    const cityPoints: { lat: number; lng: number }[] = [];
    targetDayData.itinerary.path.forEach((sp: ScheduledPoi) => {
      const p = sp.poi;
      if (!p) return;
      const cat = (p.category || '').toLowerCase();
      const normName = (p.name || '').toLowerCase();
      if (
        cat === 'airport' ||
        cat === 'flight' ||
        cat === 'hotel' ||
        cat === 'lodging' ||
        normName.includes('airport') ||
        normName.includes('flight') ||
        normName.includes('(start)') ||
        normName.includes('(end)')
      ) {
        return;
      }
      const lat = p.location?.latitude ?? (p as any).lat;
      const lng = p.location?.longitude ?? (p as any).lng;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        cityPoints.push({ lat, lng });
      }
    });
    // Fallback if day only had transit or lodging anchors
    if (cityPoints.length === 0) {
      targetDayData.itinerary.path.forEach((sp: ScheduledPoi) => {
        const p = sp.poi;
        if (!p) return;
        const lat = p.location?.latitude ?? (p as any).lat;
        const lng = p.location?.longitude ?? (p as any).lng;
        if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
          cityPoints.push({ lat, lng });
        }
      });
    }
    if (cityPoints.length === 0) return null;
    return computeClusterPolygon(cityPoints);
  }, [days, selectedDay]);

  // Active Day Bounding Box for backend spatial search prioritization
  const activeDayBounds = useMemo<string | null>(() => {
    if (selectedDay === 'all') return null;
    const targetDayData = days.find((d) => d.day === selectedDay);
    if (!targetDayData?.itinerary?.path || targetDayData.itinerary.path.length === 0) return null;
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    let count = 0;
    targetDayData.itinerary.path.forEach((sp: ScheduledPoi) => {
      const p = sp.poi;
      if (!p) return;
      const lat = p.location?.latitude ?? (p as any).lat;
      const lng = p.location?.longitude ?? (p as any).lng;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        count++;
      }
    });
    if (count === 0) return null;
    // Add ~1.5km buffer (approx 0.015 degrees)
    return `${(minLat - 0.015).toFixed(6)},${(minLng - 0.015).toFixed(6)},${(maxLat + 0.015).toFixed(6)},${(maxLng + 0.015).toFixed(6)}`;
  }, [days, selectedDay]);

  // Execute Dynamic POI Search
  const executeSearch = useCallback(
    async (queryText: string, cat?: string, offset: number = 0, append: boolean = false) => {
      const q = queryText.trim();
      const currentCat = cat !== undefined ? cat : activeCategory;
      const isCategoryBrowse = !q && currentCat && currentCat !== 'all';
      const isAllBrowse = !q && (!currentCat || currentCat === 'all');

      if (append) {
        setIsLoadingMore(true);
      } else {
        if (searchAbortRef.current) {
          searchAbortRef.current.abort();
        }
        searchAbortRef.current = new AbortController();
        setIsLoadingSearch(true);
      }
      const reqId = ++searchReqSeqRef.current;
      const signal = searchAbortRef.current?.signal;
      setSearchErrorMessage(null);
      setHasSearched(true);

      try {
        const catParam = currentCat && currentCat !== 'all' ? `&category=${encodeURIComponent(currentCat)}` : '';
        const tripParam = tripId ? `&trip_id=${encodeURIComponent(tripId)}` : '';
        const dayParam = selectedDay !== 'all' ? `&day=${encodeURIComponent(String(selectedDay))}` : '';
        const boundsParam = activeDayBounds ? `&bounds=${encodeURIComponent(activeDayBounds)}` : '';
        const hullParam =
          activeDayHull && activeDayHull.length >= 3
            ? `&polygon=${encodeURIComponent(
                activeDayHull.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join(';')
              )}`
            : '';
        const offsetParam = offset > 0 ? `&offset=${offset}` : '';
        const baseUrl = getApiBaseUrl();
        const limit = isCategoryBrowse ? 60 : isAllBrowse ? 40 : 25;

        const headers: Record<string, string> = {};
        const token = getAuthToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(
          `${baseUrl}/pois/search?city=${encodeURIComponent(
            destinationCity
          )}&query=${encodeURIComponent(q)}${catParam}${tripParam}${dayParam}${boundsParam}${hullParam}&limit=${limit}${offsetParam}`,
          { headers, signal }
        );
        if (!res.ok) {
          throw new Error(`Search failed (HTTP ${res.status})`);
        }
        const data: PoiSearchResponseData = await res.json();

        // Stale check: ignore response if superseded by a newer search request
        if (reqId !== searchReqSeqRef.current) {
          return;
        }

        // Inject trip-specific anchors when user queries "hotel" or "airport"
        const normQ = q.toLowerCase();
        if (hotelAnchor && normQ.includes('hot')) {
          const hotelItem: PoiApiItem = {
            id: `trip-hotel-anchor-${tripId || 'hotel'}`,
            name: hotelAnchor.name,
            category: 'hotel',
            lat: hotelAnchor.lat,
            lng: hotelAnchor.lng,
            duration_mins: 30,
            cost_eur: 0,
            similarity: 1.0,
            match_type: 'trip_hotel_base',
          };
          data.exact_match = hotelItem;
          data.exact_match_found = true;
          if (!data.results.some((r) => r.name.toLowerCase() === hotelAnchor.name.toLowerCase())) {
            data.results.unshift(hotelItem);
          }
        } else if (airportAnchor && (normQ.includes('air') || normQ.includes('aero') || normQ.includes('flight'))) {
          const airportItem: PoiApiItem = {
            id: `trip-airport-anchor-${tripId || 'airport'}`,
            name: airportAnchor.name,
            category: 'airport',
            lat: airportAnchor.lat,
            lng: airportAnchor.lng,
            duration_mins: 60,
            cost_eur: 0,
            similarity: 1.0,
            match_type: 'trip_airport_gateway',
          };
          data.exact_match = airportItem;
          data.exact_match_found = true;
          if (!data.results.some((r) => r.name.toLowerCase() === airportAnchor.name.toLowerCase())) {
            data.results.unshift(airportItem);
          }
        }

        if (append) {
          setSearchData((prev) => {
            if (!prev) return data;
            const existingIds = new Set(prev.results.map((r) => r.id));
            const newResults = data.results.filter((r) => !existingIds.has(r.id));
            const merged = [...prev.results, ...newResults];
            if (onCategoryPoisChange && activeTab === 'search' && reqId === searchReqSeqRef.current) {
              onCategoryPoisChange(merged);
            }
            return {
              ...data,
              results: merged,
              total: data.total ?? prev.total,
            };
          });
        } else {
          setSearchData(data);
          if (onCategoryPoisChange && activeTab === 'search' && reqId === searchReqSeqRef.current) {
            onCategoryPoisChange(data.results || []);
          }
        }
      } catch (err: unknown) {
        if (reqId !== searchReqSeqRef.current) {
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const msg = err instanceof Error ? err.message : 'Error executing POI search';
        setSearchErrorMessage(msg);
      } finally {
        if (reqId === searchReqSeqRef.current) {
          setIsLoadingSearch(false);
          setIsLoadingMore(false);
        }
      }
    },
    [destinationCity, tripId, hotelAnchor, airportAnchor, activeCategory, onCategoryPoisChange, selectedDay, activeDayBounds, activeDayHull, activeTab]
  );

  const handleLoadMore = useCallback(() => {
    if (isLoadingSearch || isLoadingMore || !searchData) return;
    const currentOffset = searchData.results.length;
    executeSearch(searchQuery, activeCategory, currentOffset, true);
  }, [isLoadingSearch, isLoadingMore, searchData, searchQuery, activeCategory, executeSearch]);

  // Sync external categoryFilter
  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (categoryFilter !== prevCategoryFilter) {
    setPrevCategoryFilter(categoryFilter);
    if (categoryFilter) {
      setActiveCategory(categoryFilter.toLowerCase());
    } else {
      setActiveCategory('all');
    }
  }

  // Debounced auto-search & recommendations loader
  useEffect(() => {
    if (activeTab !== 'search') return;
    const delay = searchQuery.trim() ? 320 : 0;
    const timer = setTimeout(() => {
      executeSearch(searchQuery, activeCategory);
    }, delay);

    return () => clearTimeout(timer);
  }, [searchQuery, activeCategory, activeTab, executeSearch]);

  const handleCategoryClick = (catId: string) => {
    const nextCat = activeCategory === catId ? 'all' : catId;
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    searchReqSeqRef.current += 1;
    const nextFilter = nextCat === 'all' ? null : (nextCat as PoiCategoryType);
    setPrevCategoryFilter(nextFilter);
    setActiveCategory(nextCat);
    setSearchQuery('');
    setSearchData(null);
    if (onCategoryPoisChange) {
      onCategoryPoisChange([]);
    }
    if (onCategoryFilterChange) {
      onCategoryFilterChange(nextFilter);
    }
  };

  // Route POI IDs and names to exclude already visited stops from recommendations
  const routePoiIdentifiers = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    days.forEach((dayObj) => {
      (dayObj.itinerary?.path || []).forEach((sp: ScheduledPoi) => {
        if (sp.poi?.id) ids.add(String(sp.poi.id).toLowerCase());
        if (sp.poi?.name) names.add(sp.poi.name.trim().toLowerCase());
      });
    });
    return { ids, names };
  }, [days]);

  // Filtered & Sorted Search Results
  const filteredSearchResults = useMemo(() => {
    if (!searchData?.results) return [];
    let list = [...searchData.results];

    // In the "All" tab when browsing recommendations (no typed query), exclude stops already in the route
    if (!searchQuery.trim() && activeCategory === 'all') {
      list = list.filter(
        (p) =>
          !routePoiIdentifiers.ids.has(String(p.id).toLowerCase()) &&
          !routePoiIdentifiers.names.has(p.name.trim().toLowerCase())
      );
    }

    // Cost range filter: [min, max] where max >= 100 means 100+
    if (costRange[0] > 0 || costRange[1] < 100) {
      list = list.filter((p) => {
        const cost = p.cost_eur || 0;
        if (cost < costRange[0]) return false;
        if (costRange[1] < 100 && cost > costRange[1]) return false;
        return true;
      });
    }

    // Duration range filter: [min, max] in mins where max >= 240 means 240m+ (4h+)
    if (durationRange[0] > 15 || durationRange[1] < 240) {
      list = list.filter((p) => {
        const dur = p.duration_mins || 60;
        if (dur < durationRange[0]) return false;
        if (durationRange[1] < 240 && dur > durationRange[1]) return false;
        return true;
      });
    }

    // Rating star filter (0.5 to 5.0)
    if (minRating > 0) {
      list = list.filter((p) => {
        const r = (p as any).rating ?? (p as any).scoring?.rating ?? 0;
        return r >= minRating;
      });
    }

    // Sort
    if (sortOption === 'cost') {
      list.sort((a, b) => a.cost_eur - b.cost_eur);
    } else if (sortOption === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === 'best') {
      // Iconicity is a really important factor (60% iconicity + 40% affinity/similarity)
      list.sort((a, b) => {
        const iconA = a.iconicity_score ?? (a as any).scoring?.iconicity_score ?? 0;
        const iconB = b.iconicity_score ?? (b as any).scoring?.iconicity_score ?? 0;
        const scoreA = 0.60 * iconA + 0.40 * (a.similarity || 0);
        const scoreB = 0.60 * iconB + 0.40 * (b.similarity || 0);
        return scoreB - scoreA;
      });
    } else if (sortOption === 'rating') {
      list.sort((a, b) => {
        const rateA = (a as any).rating ?? (a as any).scoring?.rating ?? 0;
        const rateB = (b as any).rating ?? (b as any).scoring?.rating ?? 0;
        return rateB - rateA;
      });
    }

    // Convex Hull prioritization for selected day (if all days, no hull prioritization)
    if (activeDayHull && activeDayHull.length >= 3 && selectedDay !== 'all') {
      list.sort((a, b) => {
        const aIn = isPointInPolygon([a.lat, a.lng], activeDayHull);
        const bIn = isPointInPolygon([b.lat, b.lng], activeDayHull);
        if (aIn && !bIn) return -1;
        if (!aIn && bIn) return 1;
        return 0;
      });
    }

    return list;
  }, [searchData, costRange, durationRange, minRating, sortOption, searchQuery, activeCategory, routePoiIdentifiers, activeDayHull, selectedDay]);

  // Displayed days in Route tab
  const displayedDays = useMemo(() => {
    return selectedDay === 'all' ? days : days.filter((d) => d.day === selectedDay);
  }, [days, selectedDay]);

  // Anchor check helper
  const checkFixedAnchor = useCallback(
    (
      scheduledPoi: ScheduledPoi,
      idx: number,
      pathLength: number,
      dayNum: number,
      totalDays: number
    ): { isFixed: boolean; isAnchor: boolean; type?: string; label?: string } => {
      const p = scheduledPoi.poi;
      const isExplicitlyLocked = (scheduledPoi as unknown as { is_fixed?: boolean }).is_fixed === true;
      const isExplicitlyUnlocked = (scheduledPoi as unknown as { is_fixed?: boolean }).is_fixed === false;

      const normName = (p?.name || '').toLowerCase();
      const normCat = (p?.category || '').toLowerCase();
      const isAirport =
        normCat.includes('airport') ||
        normName.includes('airport') ||
        (airportAnchor && normName.includes(airportAnchor.name.toLowerCase()));
      const isHotel =
        normCat.includes('hotel') ||
        normName.includes('hotel') ||
        (hotelAnchor && normName.includes(hotelAnchor.name.toLowerCase()));

      let defaultAnchorType: string | undefined;
      let defaultLabel: string | undefined;

      if (isAirport) {
        if (dayNum === 1 && idx === 0) {
          defaultAnchorType = 'airport';
          defaultLabel = 'TRIP ARRIVAL';
        } else if (dayNum === totalDays && idx === pathLength - 1) {
          defaultAnchorType = 'airport';
          defaultLabel = 'TRIP DEPARTURE';
        } else {
          defaultAnchorType = 'airport';
          defaultLabel = 'AIRPORT STOP';
        }
      } else if (isHotel) {
        if (idx === 0) {
          defaultAnchorType = 'hotel';
          defaultLabel = 'DAY ORIGIN';
        } else if (idx === pathLength - 1) {
          defaultAnchorType = 'hotel';
          defaultLabel = 'DAY DESTINATION';
        } else {
          defaultAnchorType = 'hotel';
          defaultLabel = 'HOTEL BASE';
        }
      }

      const isDefaultAnchor = Boolean(defaultAnchorType);

      if (isExplicitlyUnlocked) return { isFixed: false, isAnchor: isDefaultAnchor, type: defaultAnchorType, label: defaultLabel };
      if (isExplicitlyLocked) {
        return { isFixed: true, isAnchor: isDefaultAnchor, type: defaultAnchorType || 'custom', label: defaultLabel || 'LOCKED STOP' };
      }
      if (isDefaultAnchor) return { isFixed: true, isAnchor: true, type: defaultAnchorType, label: defaultLabel };

      return { isFixed: false, isAnchor: false };
    },
    [airportAnchor, hotelAnchor]
  );

  // Toggle lock state of a scheduled waypoint (solver anchor / fixed stop)
  const handleToggleLock = useCallback(
    (
      dayNum: number,
      poiIdx: number,
      scheduledPoi: ScheduledPoi,
      anchorInfo: { isFixed: boolean; isAnchor: boolean; type?: string; label?: string }
    ) => {
      if (!itinerary || !onItineraryUpdate) return;

      const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
      const targetDay = clonedItin.days?.find((d) => (d.day ?? 1) === dayNum);
      if (!targetDay?.itinerary?.path?.[poiIdx]) return;

      const currentItem = targetDay.itinerary.path[poiIdx];
      const newLockState = !anchorInfo.isFixed;
      (currentItem as unknown as { locked?: boolean; is_fixed?: boolean }).locked = newLockState;
      (currentItem as unknown as { locked?: boolean; is_fixed?: boolean }).is_fixed = newLockState;
      if (currentItem.poi) {
        (currentItem.poi as unknown as { locked?: boolean; is_fixed?: boolean }).locked = newLockState;
        (currentItem.poi as unknown as { locked?: boolean; is_fixed?: boolean }).is_fixed = newLockState;
      }

      onItineraryUpdate(clonedItin);
      notify.info(
        newLockState ? 'Waypoint Locked' : 'Waypoint Unlocked',
        newLockState
          ? `"${scheduledPoi.poi?.name || 'Waypoint'}" is pinned and will stay fixed during solver optimization.`
          : `"${scheduledPoi.poi?.name || 'Waypoint'}" is now flexible.`
      );
    },
    [itinerary, onItineraryUpdate]
  );

  // Move scheduled waypoint up or down in the route sequence
  const handleMoveStop = useCallback(
    (targetDayNum: number, sourceIdx: number, direction: 'up' | 'down') => {
      if (!itinerary || !onItineraryUpdate) return;
      const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
      const targetDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === targetDayNum);
      if (!targetDayObj?.itinerary?.path) return;

      const path = targetDayObj.itinerary.path;
      const targetIdx = direction === 'up' ? sourceIdx - 1 : sourceIdx + 1;
      if (targetIdx < 0 || targetIdx >= path.length) return;

      const [movedItem] = path.splice(sourceIdx, 1);
      if (!movedItem) return;
      path.splice(targetIdx, 0, movedItem);

      onItineraryUpdate(clonedItin);
      notify.info('Stop Reordered', `Moved "${movedItem.poi?.name || 'Waypoint'}" to position ${targetIdx + 1}.`);
    },
    [itinerary, onItineraryUpdate]
  );

  // Drag and drop handlers for Route reordering
  const handleDrop = (e: React.DragEvent, targetDayNum: number, targetIdx: number) => {
    e.preventDefault();
    setActiveDropTarget(null);

    const rawData = e.dataTransfer.getData('application/paladio-poi');
    if (!rawData || !itinerary || !onItineraryUpdate) return;

    try {
      const payload = JSON.parse(rawData);
      const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
      const targetDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === targetDayNum);
      if (!targetDayObj) return;

      if (!targetDayObj.itinerary) {
        targetDayObj.itinerary = { path: [] };
      }

      if (payload.source === 'route') {
        const srcDayNum = payload.day;
        const srcIdx = payload.index;
        const srcDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === srcDayNum);
        if (!srcDayObj?.itinerary?.path) return;

        const [movedItem] = srcDayObj.itinerary.path.splice(srcIdx, 1);
        if (movedItem) {
          targetDayObj.itinerary.path.splice(targetIdx, 0, movedItem);
          onItineraryUpdate(clonedItin);
          notify.success('Waypoint Reordered', `Moved stop to Day ${targetDayNum}`);
        }
      } else if (payload.source === 'search' || payload.source === 'inspector' || payload.source === 'map') {
        const poi = payload.poi;
        const lat = poi.location?.latitude ?? poi.lat ?? 0;
        const lng = poi.location?.longitude ?? poi.lng ?? 0;
        const newScheduled: ScheduledPoi = {
          poi: {
            id: poi.id,
            name: poi.name,
            city: destinationCity,
            category: poi.category,
            duration_mins: poi.duration_mins || 60,
            cost_eur: poi.cost_eur || 0,
            location: {
              latitude: lat,
              longitude: lng,
            },
          },
        };
        targetDayObj.itinerary.path.splice(targetIdx, 0, newScheduled);
        onItineraryUpdate(clonedItin);
        notify.success('Place Added', `Added ${poi.name} to Day ${targetDayNum}`);
      }
    } catch (err) {
      console.error('Failed to handle drop:', err);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        bottom: '16px',
        zIndex: 1000,
        display: 'flex',
        pointerEvents: 'none',
      }}
    >
      {/* Floating Toggle Tab when collapsed */}
      <button
        type="button"
        data-testid="sidebar-expand-btn"
        onClick={onToggle}
        aria-label="Open sidebar menu"
        title="Open sidebar menu"
        style={{
          pointerEvents: isOpen ? 'none' : 'auto',
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? 'translateX(-16px) scale(0.92)' : 'translateX(0) scale(1)',
          position: 'absolute',
          top: '16px',
          left: 0,
          alignSelf: 'flex-start',
          width: '26px',
          height: '42px',
          borderRadius: '0 10px 10px 0',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          borderLeft: 'none',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--color-accent-primary)',
          transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 1060,
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <ChevronRightIcon size={16} />
      </button>

      {/* Main Single Floating Card Container with External Collapse Arrow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          height: '100%',
          position: 'relative',
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(-100% - 24px))',
          transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s ease',
          visibility: isOpen ? 'visible' : 'hidden',
          transitionProperty: 'transform, opacity, visibility',
        }}
      >
        <aside
          data-testid="trip-unified-sidebar"
          style={{
            pointerEvents: isOpen ? 'auto' : 'none',
            width: activeTab === 'route' ? 'min(380px, calc(100vw - 32px))' : 'min(520px, calc(100vw - 32px))',
            height: '100%',
            background: 'var(--color-surface-card, #FFFFFF)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            borderRadius: '24px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 45px -10px rgba(15, 76, 92, 0.15), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            transition: 'width 0.28s cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        >
          {/* Top Navigation Pill Tabs (Matching Photo Structure) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px 10px 18px',
              borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
              background: 'var(--color-surface-card)',
              flexShrink: 0,
            }}
          >
                {/* Pill Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Route Tab (Replaces Chat) */}
                  <button
                    type="button"
                    data-testid="tab-route"
                    onClick={() => setActiveTab('route')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '7px 16px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'route' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'route' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'route' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: activeTab === 'route' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span>Route</span>
                  </button>

                  {/* Search Tab */}
                  <button
                    type="button"
                    data-testid="tab-search"
                    onClick={() => setActiveTab('search')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '7px 16px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'search' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'search' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'search' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: activeTab === 'search' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <SearchIcon size={13} color="currentColor" />
                    <span>Search</span>
                  </button>

                  {/* Transit Tab */}
                  <button
                    type="button"
                    data-testid="tab-transit"
                    onClick={() => setActiveTab('transit')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '7px 16px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'transit' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'transit' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'transit' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: activeTab === 'transit' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="15" rx="2" />
                      <circle cx="7" cy="14" r="1" />
                      <circle cx="17" cy="14" r="1" />
                      <path d="M7 8h10" />
                      <path d="M5 21l2-3" />
                      <path d="M19 21l-2-3" />
                    </svg>
                    <span>Transit</span>
                  </button>

                  {/* Saved Tab */}
                  <button
                    type="button"
                    data-testid="tab-saved"
                    onClick={() => setActiveTab('saved')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '7px 16px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'saved' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'saved' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'saved' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: activeTab === 'saved' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>Saved</span>
                    {savedPoiIds.size > 0 && (
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '9999px',
                          background: activeTab === 'saved' ? 'rgba(255,255,255,0.25)' : 'rgba(15,76,92,0.12)',
                          color: activeTab === 'saved' ? '#FFFFFF' : 'var(--color-accent-primary)',
                        }}
                      >
                        {savedPoiIds.size}
                      </span>
                    )}
                  </button>
                </div>

                {/* Right Area: Day View Indicator (Search & Saved tabs) or Edit/Solve Actions (Route tab) */}
                {activeTab !== 'route' ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      background: selectedDay === 'all' ? 'rgba(15, 76, 92, 0.08)' : `${getDayColor(selectedDay as number)}18`,
                      border: `1px solid ${selectedDay === 'all' ? 'rgba(15, 76, 92, 0.25)' : `${getDayColor(selectedDay as number)}40`}`,
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono, monospace)',
                      letterSpacing: '0.04em',
                      color: selectedDay === 'all' ? '#0F4C5C' : getDayColor(selectedDay as number),
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: selectedDay === 'all' ? '#0F4C5C' : getDayColor(selectedDay as number),
                      }}
                    />
                    {selectedDay === 'all' ? 'ALL DAYS' : `DAY ${selectedDay}`}
                  </div>
                ) : isEditMode && onReoptimizeDay ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={onReoptimizeDay}
                      disabled={isReoptimizing}
                      data-testid="route-reoptimize-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(15, 76, 92, 0.08)',
                        color: 'var(--color-accent-teal-deep, #0F4C5C)',
                        border: '1px solid rgba(15, 76, 92, 0.25)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: isReoptimizing ? 'wait' : 'pointer',
                        opacity: isReoptimizing ? 0.7 : 1,
                      }}
                      title="Re-run C++ optimization solver with locked stops preserved"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ animation: isReoptimizing ? 'spin 1s linear infinite' : 'none' }}
                      >
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </svg>
                      <span>{isReoptimizing ? 'Solving...' : 'Solve'}</span>
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Secondary Sub-Bar with Smooth Edge-Hover Scrolling */}
              {activeTab === 'route' ? (
                /* 1. Days Bar for Route View (No Arrows, Smooth Hover-to-Scroll) */
                <HoverScrollRow
                  testId="day-selector-tabs"
                  style={{
                    gap: '12px',
                    padding: '8px 18px',
                    borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
                    background: 'var(--color-surface-card)',
                  }}
                >
                    <button
                      type="button"
                      data-testid="day-tab-all"
                      onClick={() => onSelectDay('all')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: selectedDay === 'all' ? '2.5px solid var(--color-accent-primary)' : '2.5px solid transparent',
                        padding: '6px 4px',
                        color: selectedDay === 'all' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                        fontSize: '12px',
                        fontWeight: selectedDay === 'all' ? 700 : 500,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        cursor: 'pointer',
                        transition: 'all 0.16s ease',
                      }}
                    >
                      ALL DAYS
                    </button>

                    {days.map((d) => {
                      const isSel = selectedDay === d.day;
                      return (
                        <button
                          key={d.day}
                          type="button"
                          data-testid={`day-tab-${d.day}`}
                          onClick={() => onSelectDay(d.day)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: isSel ? '2.5px solid var(--color-accent-primary)' : '2.5px solid transparent',
                            padding: '6px 4px',
                            color: isSel ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                            fontSize: '12px',
                            fontWeight: isSel ? 700 : 500,
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            cursor: 'pointer',
                            transition: 'all 0.16s ease',
                          }}
                        >
                          DAY {d.day}
                        </button>
                      );
                    })}
                  </HoverScrollRow>
                ) : activeTab === 'search' ? (
                  /* 2. Categories Bar for Search View (Smooth Hover-to-Scroll) */
                  <HoverScrollRow
                    testId="category-selector-tabs"
                    style={{
                      gap: '16px',
                      padding: '8px 18px',
                      borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
                      background: 'var(--color-surface-card)',
                    }}
                  >
                    {PROJECT_CATEGORIES.map((cat) => {
                      const isSel = activeCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          data-testid={`category-tab-${cat.id}`}
                          onClick={() => handleCategoryClick(cat.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: isSel ? '2.5px solid var(--color-accent-primary)' : '2.5px solid transparent',
                            padding: '6px 2px',
                            color: isSel ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                            fontSize: '12px',
                            fontWeight: isSel ? 700 : 500,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            cursor: 'pointer',
                            transition: 'all 0.16s ease',
                          }}
                        >
                        <PoiCategoryIcon category={cat.id} size={14} />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </HoverScrollRow>
              ) : null}

              {/* Main Content Area */}
              <div
                className="no-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* VIEW A: ROUTE TAB CONTENT */}
                {activeTab === 'route' && (
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Scheduled Days and Stops Timeline */}
                    {displayedDays.map((dayObj) => {
                      const path = dayObj.itinerary?.path || [];

                      return (
                        <div key={dayObj.day} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottom: '1px solid var(--color-border)',
                              paddingBottom: '4px',
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              Day {dayObj.day} {dayObj.theme ? `— ${dayObj.theme}` : ''}
                            </span>
                            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                              {path.length} STOPS
                            </span>
                          </div>

                          {/* Empty day drop slot */}
                          {path.length === 0 && (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setActiveDropTarget({ day: dayObj.day, index: 0 });
                              }}
                              onDragLeave={() => setActiveDropTarget(null)}
                              onDrop={(e) => handleDrop(e, dayObj.day, 0)}
                              style={{
                                padding: '18px 14px',
                                textAlign: 'center',
                                border: '1.5px dashed var(--color-border)',
                                borderRadius: '12px',
                                fontSize: '12px',
                                color: 'var(--color-text-muted)',
                                background: activeDropTarget?.day === dayObj.day ? 'rgba(15, 76, 92, 0.06)' : 'transparent',
                              }}
                            >
                              No places scheduled yet. Search and add places, or switch to the Search tab above.
                            </div>
                          )}

                          {path.map((scheduledPoi: ScheduledPoi, poiIdx: number) => {
                            const p = scheduledPoi.poi;
                            const { start: startTime, end: endTime } = getScheduledPoiTimes(scheduledPoi);
                            const transitFromPrev = scheduledPoi.transit_from_previous;
                            const stopNum = String(poiIdx + 1).padStart(2, '0');
                            const anchorInfo = checkFixedAnchor(scheduledPoi, poiIdx, path.length, dayObj.day, days.length);

                            return (
                              <React.Fragment key={p?.id || `poi-${poiIdx}`}>
                                {/* Transit Leg between stops */}
                                {poiIdx > 0 && (
                                  transitMode === 'detailed' && transitFromPrev ? (
                                    <div style={{ margin: '2px 0 2px 24px' }}>
                                      <TransitLegView transitLeg={transitFromPrev} />
                                    </div>
                                  ) : (
                                    <div
                                      data-testid="route-poi-connector"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        paddingLeft: '32px',
                                        height: '18px',
                                        position: 'relative',
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: '0px',
                                          height: '100%',
                                          borderLeft: '2px dashed var(--color-accent-teal-deep, #0F4C5C)',
                                          opacity: 0.9,
                                        }}
                                      />
                                    </div>
                                  )
                                )}

                                <div
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    setActiveDropTarget({ day: dayObj.day, index: poiIdx });
                                  }}
                                  onDragLeave={() => setActiveDropTarget(null)}
                                  onDrop={(e) => handleDrop(e, dayObj.day, poiIdx)}
                                >
                                  <MinimalistPoiCard
                                    id={p?.id}
                                    name={p?.name || 'Scheduled Place'}
                                    category={p?.category}
                                    startTime={startTime}
                                    endTime={endTime}
                                    durationMins={p?.duration_mins}
                                    costEur={p?.cost_eur}
                                    city={destinationCity}
                                    isEditMode={isEditMode}
                                    stopNum={stopNum}
                                    anchorInfo={anchorInfo}
                                    draggable={isEditMode && !anchorInfo.isFixed}
                                    onDragStart={(e) => {
                                      if (!isEditMode || anchorInfo.isFixed) {
                                        e.preventDefault();
                                        return;
                                      }
                                      const poiInfo = { source: 'route', day: dayObj.day, index: poiIdx };
                                      setDraggedPoi(poiInfo);
                                      e.dataTransfer.setData('application/paladio-poi', JSON.stringify(poiInfo));
                                      e.dataTransfer.effectAllowed = 'copyMove';
                                    }}
                                    onDragEnd={() => {
                                      setDraggedPoi(null);
                                      setActiveDropTarget(null);
                                    }}
                                    canMoveUp={poiIdx > 0}
                                    canMoveDown={poiIdx < path.length - 1}
                                    onMoveUp={(e) => {
                                      e.stopPropagation();
                                      handleMoveStop(dayObj.day, poiIdx, 'up');
                                    }}
                                    onMoveDown={(e) => {
                                      e.stopPropagation();
                                      handleMoveStop(dayObj.day, poiIdx, 'down');
                                    }}
                                    onToggleLock={(e) => {
                                      e.stopPropagation();
                                      handleToggleLock(dayObj.day, poiIdx, scheduledPoi, anchorInfo);
                                    }}
                                    onClick={() => {
                                      const pId = p?.id || p?.name;
                                      const lat = p?.location?.latitude ?? (p as unknown as { lat?: number })?.lat;
                                      const lng = p?.location?.longitude ?? (p as unknown as { lng?: number })?.lng;
                                      if (pId && onInspectPoi) {
                                        onInspectPoi(pId, {
                                          ...p,
                                          lat,
                                          lng,
                                          day: dayObj.day,
                                        } as unknown as Record<string, unknown>);
                                      }
                                      if (typeof lat === 'number' && typeof lng === 'number') {
                                        onPlaceClick?.({
                                          id: pId,
                                          name: p?.name || 'Waypoint',
                                          lat,
                                          lng,
                                          category: p?.category || 'attraction',
                                          durationMins: p?.duration_mins,
                                          costEur: p?.cost_eur,
                                          day: dayObj.day,
                                        });
                                      }
                                    }}
                                  />
                                </div>
                              </React.Fragment>
                            );
                          })}

                          {/* Append-to-day Drop Zone */}
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              setActiveDropTarget({ day: dayObj.day, index: path.length });
                            }}
                            onDragLeave={() => setActiveDropTarget(null)}
                            onDrop={(e) => handleDrop(e, dayObj.day, path.length)}
                            style={{
                              height:
                                activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length
                                  ? '38px'
                                  : '12px',
                              borderRadius: '12px',
                              border:
                                activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length
                                  ? '2px dashed var(--color-accent-primary)'
                                  : '2px dashed transparent',
                              background:
                                activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length
                                  ? 'rgba(15, 76, 92, 0.08)'
                                  : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                              margin: '2px 0',
                            }}
                          >
                            {activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--color-accent-primary)',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                + DROP HERE TO ADD TO DAY {dayObj.day}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* VIEW B: SEARCH TAB CONTENT (Exact Match to User Reference Layout) */}
                {activeTab === 'search' && (
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 1. Top Options Pill Dropdowns (Matching Reference) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', overflow: 'visible' }}>

                      <CustomDropdown
                        ariaLabel="Sort Order"
                        value={sortOption}
                        onChange={(val) => setSortOption(val as any)}
                        options={[
                          { value: 'best', label: 'Recommended' },
                          { value: 'rating', label: 'Top Rated' },
                          { value: 'cost', label: 'Lowest Cost' },
                          { value: 'name', label: 'Alphabetical' },
                        ]}
                        testId="sort-order-dropdown"
                      />
                    </div>

                    {/* 2. Elevated Search Box Card (Matching Flight Search Form Card) */}
                    <div
                      style={{
                        background: 'var(--color-surface-subtle, #FAFAFA)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '16px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      {/* Search Input Field */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: 'var(--color-surface-card, #FFFFFF)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                        }}
                      >
                        <SearchIcon size={14} color="var(--color-text-muted)" />
                        <input
                          type="text"
                          data-testid="unified-search-input"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={`Search attractions, food, sights in ${destinationCity || 'city'}...`}
                          style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontSize: '13px',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear Search Query"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--color-text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                            }}
                          >
                            <CloseIcon size={12} />
                          </button>
                        )}
                      </div>

                      {/* Full-width Prominent Search Button */}
                      <button
                        type="button"
                        data-testid="unified-search-btn"
                        onClick={() => executeSearch(searchQuery, activeCategory)}
                        disabled={isLoadingSearch}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'var(--color-accent-primary)',
                          color: '#FFFFFF',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          cursor: isLoadingSearch ? 'not-allowed' : 'pointer',
                          transition: 'all 0.16s ease',
                          boxShadow: '0 2px 6px rgba(15, 76, 92, 0.25)',
                        }}
                      >
                        {isLoadingSearch ? (
                          <Spinner size={14} color="#FFFFFF" />
                        ) : (
                          <SearchIcon size={14} color="#FFFFFF" />
                        )}
                        <span>{isLoadingSearch ? 'Searching...' : 'Search'}</span>
                      </button>
                    </div>

                    {/* 3. Filter Chips Row (Matching [Filters] [Stops] [Times] [Price]) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                        overflow: 'visible',
                        paddingBottom: '2px',
                      }}
                    >
                      {/* Price range slider filter */}
                      <PriceRangeSliderDropdown
                        value={costRange}
                        onChange={setCostRange}
                        currencySymbol={currencySymbol}
                      />

                      {/* Duration range slider filter */}
                      <DurationRangeSliderDropdown
                        value={durationRange}
                        onChange={setDurationRange}
                      />

                      {/* Star rating filter on the right */}
                      <RatingStarFilterDropdown
                        value={minRating}
                        onChange={setMinRating}
                      />
                    </div>

                    {/* 4. Section Header: Best Places Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {searchQuery
                            ? `Results for "${searchQuery}"`
                            : activeCategory === 'all'
                            ? 'Recommended for you'
                            : `Top ${activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} in ${destinationCity || 'City'}`}
                        </span>
                        <InfoIcon size={13} color="var(--color-text-muted)" />
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                        {filteredSearchResults.length === 0
                          ? '0 PLACES'
                          : searchData?.total != null
                          ? searchData.total > 1000
                            ? '+1000 PLACES'
                            : `${searchData.total} PLACES`
                          : `${filteredSearchResults.length} PLACES`}
                      </span>
                    </div>

                    {/* 5. Results List: Cards Styled like Reference Flight Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filteredSearchResults.map((poi) => (
                        <div
                          key={poi.id}
                          data-testid={`poi-card-${poi.id}`}
                          draggable={true}
                          onDragStart={(e) => {
                            const ghost = createRouteCardDragImage(poi);
                            e.dataTransfer.setDragImage(ghost, 20, 20);
                            setTimeout(() => ghost.remove(), 0);

                            e.dataTransfer.setData(
                              'application/paladio-poi',
                              JSON.stringify({
                                source: 'search',
                                poi: {
                                  id: poi.id,
                                  name: poi.name,
                                  category: poi.category,
                                  lat: poi.lat,
                                  lng: poi.lng,
                                  duration_mins: poi.duration_mins,
                                  cost_eur: poi.cost_eur,
                                  location: { latitude: poi.lat, longitude: poi.lng },
                                },
                              })
                            );
                            e.dataTransfer.effectAllowed = 'copyMove';

                            // Switch to Route tab automatically so user can drop into any day!
                            setTimeout(() => {
                              setActiveTab('route');
                            }, 50);
                          }}
                          onClick={() => {
                            onPlaceClick?.({
                              id: poi.id,
                              name: poi.name,
                              lat: poi.lat,
                              lng: poi.lng,
                              category: poi.category,
                              durationMins: poi.duration_mins,
                              costEur: poi.cost_eur,
                              description: poi.description,
                            });
                          }}
                          style={{
                            background: 'var(--color-surface-card, #FFFFFF)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '16px',
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: 'var(--shadow-sm)',
                            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 76, 92, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                          }}
                        >
                          {/* Card Top Row: Badge, Title & Price Tag */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <SearchPoiThumbnail
                                id={poi.id}
                                name={poi.name}
                                category={poi.category}
                                photoUrl={poi.photo_url || poi.thumbnail_url}
                                city={destinationCity}
                              />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: 'var(--color-text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {poi.name}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                                  {poi.category || 'Attraction'} · {poi.duration_mins} mins
                                </div>
                              </div>
                            </div>

                            {/* Price Tag */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {poi.cost_eur === 0 ? 'FREE' : `${currencySymbol}${poi.cost_eur}`}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>/pax</div>
                            </div>
                          </div>

                          {/* Card Middle Row: Duration & Details Indicator */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              color: 'var(--color-text-muted)',
                              borderTop: '1px dashed var(--color-border)',
                              paddingTop: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <ClockIcon size={12} color="var(--color-text-muted)" />
                              <span>Suggested stay: {poi.duration_mins} mins</span>
                            </div>
                            {poi.similarity > 0 && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  color: 'var(--color-success)',
                                }}
                              >
                                {Math.round(poi.similarity * 100)}% AFFINITY
                              </span>
                            )}
                          </div>
                        </div>
                      ))}

                      {filteredSearchResults.length > 0 &&
                        searchData?.results &&
                        (searchData.total != null
                          ? searchData.results.length < searchData.total
                          : searchData.results.length >= 15) && (
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              paddingTop: '10px',
                              paddingBottom: '8px',
                            }}
                          >
                            <button
                              type="button"
                              data-testid="load-more-pois-btn"
                              onClick={handleLoadMore}
                              disabled={isLoadingMore}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 24px',
                                borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-card)',
                                color: 'var(--color-text-primary)',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                                opacity: isLoadingMore ? 0.7 : 1,
                                boxShadow: 'var(--shadow-sm)',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                if (!isLoadingMore) e.currentTarget.style.background = 'var(--color-surface-subtle)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isLoadingMore) e.currentTarget.style.background = 'var(--color-surface-card)';
                              }}
                            >
                              {isLoadingMore ? <Spinner size={12} color="currentColor" /> : null}
                              <span>{isLoadingMore ? 'Loading more places...' : 'Load More Places'}</span>
                            </button>
                          </div>
                        )}

                      {filteredSearchResults.length === 0 && hasSearched && !isLoadingSearch && (
                        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-text-muted)' }}>
                          No matching places found. Try another search query or category filter.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW C: TRANSIT TAB CONTENT */}
                {activeTab === 'transit' && (
                  <TripTransitTab
                    tripId={tripId}
                    tripStartDate={tripStartDate}
                    destinationCity={destinationCity}
                    selectedDay={selectedDay}
                    tripDays={days.map((d: DayOutput) => ({
                      day_number: d.day,
                      pois: (d.itinerary?.path || []).map((s: ScheduledPoi, sIdx: number) => ({
                        id: s.poi.id || `poi-${d.day}-${sIdx}`,
                        name: s.poi.name,
                        lat: s.poi.location.latitude,
                        lng: s.poi.location.longitude,
                        category: s.poi.category,
                      })),
                    }))}
                    hotel={hotelAnchor}
                    airport={airportAnchor}
                    savedPoiIds={savedPoiIds}
                    onToggleSavePoi={toggleSavePoi}
                    onInspectPoi={onInspectPoi}
                    onFocusFromInspector={onFocusFromInspector}
                    activeMapPickField={activeMapPickField}
                    onStartMapPick={onStartMapPick}
                    onCancelMapPick={onCancelMapPick}
                    onRouteCalculated={onRouteCalculated}
                  />
                )}

                {/* VIEW D: SAVED TAB CONTENT */}
                {activeTab === 'saved' && (
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Saved Places ({savedPoiIds.size})
                    </div>
                    {savedPoiIds.size === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                        No places saved yet. Click &quot;+ Bookmark&quot; on any place in the Search tab to save it here for quick access.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Array.from(savedPoiIds).map((id) => {
                          const isStation = id.startsWith('gtfs:') || id.toLowerCase().startsWith('osm-transit-');
                          const displayName = isStation
                            ? (id.startsWith('gtfs:') ? id.split(':').slice(2).join(':') : id)
                            : id;

                          return (
                            <div
                              key={id}
                              onClick={() => {
                                onInspectPoi?.(id, {
                                  id,
                                  name: isStation ? `Station ${displayName}` : `Saved Place #${id}`,
                                  category: isStation ? 'transit' : 'attraction',
                                });
                              }}
                              style={{
                                padding: '10px 14px',
                                borderRadius: '12px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-card)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'transform 0.1s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontFamily: 'var(--font-code, monospace)',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: isStation ? 'rgba(8, 145, 178, 0.12)' : 'rgba(15, 76, 92, 0.08)',
                                    color: isStation ? 'var(--color-accent-teal-mid, #0891B2)' : 'var(--color-accent-primary)',
                                    textTransform: 'uppercase',
                                    flexShrink: 0,
                                  }}
                                >
                                  {isStation ? 'Transit' : 'Place'}
                                </span>
                                <span
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'var(--color-text-primary)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {isStation ? `Station (${displayName})` : `Place #${id}`}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSavePoi(id);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--color-danger, #EF4444)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  padding: '4px 6px',
                                  flexShrink: 0,
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
        </aside>

        {/* External arrow button outside the menu to close it */}
        <button
          type="button"
          data-testid="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label="Close sidebar menu"
          title="Close sidebar menu"
          style={{
            pointerEvents: 'auto',
            alignSelf: 'flex-start',
            marginTop: '16px',
            marginLeft: '-1px',
            width: '26px',
            height: '42px',
            borderRadius: '0 10px 10px 0',
            background: 'var(--color-surface-card, #FFFFFF)',
            border: '1px solid var(--color-border)',
            borderLeft: 'none',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 1060,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-accent-primary)';
            e.currentTarget.style.background = 'var(--color-surface-raised)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
            e.currentTarget.style.background = 'var(--color-surface-card)';
          }}
        >
          <ChevronLeftIcon size={16} />
        </button>
      </div>
    </div>
  );
}
