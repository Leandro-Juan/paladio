"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DayOutput, OptimizationResult, ScheduledPoi, PoiDetail } from '@/types/domain';
import { classifyPoiCategory, getPoiCategoryLabel, isCategoryMatch, PoiCategoryType, isAirportPoi, isHotelPoi } from '@/utils/poiCategory';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import { translate } from '@/stores/localeStore';
import { PoiCategoryIcon, PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { MinimalistPoiCard } from './MinimalistPoiCard';
import { TransitRecommendationCard, TransitLegView } from '@/components/TransitLegView';
import { EmptyState } from '@/components/EmptyState';
import { TripTransitTab } from './TripTransitTab';
import { TripWeatherTab } from './TripWeatherTab';
import { CollectionsTab } from './CollectionsTab';
import { AgentTab, WorkspaceContextData } from '@/components/trip-agent';
import { SaveToCollectionMenu } from './SaveToCollectionMenu';
import { AddPoiModal } from './AddPoiModal';
import { Modal } from '@/components/Modal';
import { useTripCollections } from '@/hooks/useTripCollections';
import { getApiBaseUrl, getAuthToken, downloadCityPoisApi, fetchCityPoisStatusApi } from '@/utils/api';
import { hydrateDayTransitIndices } from '@/utils/transitFetch';
import { autoFillDayItineraryHours } from '@/utils/itinerarySchedule';
import { notify } from '@/utils/notify';
import { formatTransitDuration, getScheduledPoiTimes, getPoiOpeningHours } from '@/utils/date';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useDestinationCurrency, getCurrencyInfo } from '@/utils/currencyResolver';
import { isPointInPolygon, computeClusterPolygon } from '@/utils/clusterHull';
import { getDayColor, SpatialCircleFilter } from './TripMapView';
import {
  startCustomDragPreview,
  cleanupCustomDragPreview,
  markPaladioDropHandled,
  resetPaladioDropHandled,
  isPaladioDropHandled,
} from '@/utils/dragPreview';
export {
  startCustomDragPreview,
  cleanupCustomDragPreview,
  markPaladioDropHandled,
  resetPaladioDropHandled,
  isPaladioDropHandled,
};
import {
  SearchIcon,
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  BookmarkIcon,
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
  TrashIcon,
} from '@/components/icons';

import type { PlaceItem, PoiApiItem } from '@/types/workspace';
export type { PlaceItem, PoiApiItem };

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
          draggable={false}
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
  city_total_pois?: number | null;
  is_hydrating?: boolean;
}

export function isCustomPoi(p: { id?: string; match_type?: string; source?: string; metadata?: any; metadata_field?: any; cost_source?: string }) {
  const idStr = String(p?.id || '');
  const matchType = p?.match_type;
  const source = p?.source || p?.metadata?.source || (p as any)?.metadata_field?.source;
  const costSource = p?.cost_source;
  return (
    idStr.startsWith('custom-') ||
    matchType === 'custom' ||
    source === 'user_created' ||
    costSource === 'user'
  );
}

export interface TripUnifiedSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  tripId?: string;
  tripStartDate?: string;
  tripEndDate?: string;
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
  onInspectPoi?: (
    poiId: string,
    fallbackData?: Record<string, unknown>,
    options?: { focusMap?: boolean }
  ) => void;
  inspectedPoiId?: string | null;
  onCloseInspect?: () => void;
  onAddToDay?: (dayNumber: number, poi: PoiDetail) => void;
  onAddDay?: () => void;
  onRemoveDay?: (dayNum: number) => void;
  onReorderDays?: (fromDayNum: number, toDayNum: number) => void;
  onRenameDay?: (dayNumber: number, newTheme: string) => void;
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
  uiContext?: WorkspaceContextData;
  onTripUpdated?: () => void;
  spatialCircle?: SpatialCircleFilter | null;
  onSpatialCircleChange?: (circle: SpatialCircleFilter | null) => void;
  isDroppingWaypoint?: boolean;
  onToggleDropWaypoint?: () => void;
  onClearSpatialCircle?: () => void;
}

export type MainTabType = 'route' | 'search' | 'transit' | 'weather' | 'saved' | 'agent';

const PROJECT_CATEGORIES: { id: string; labelKey: string; iconType: PoiCategoryType }[] = [
  { id: 'all', labelKey: 'sidebar.cat_all', iconType: 'general' },
  { id: 'attraction', labelKey: 'sidebar.cat_attractions', iconType: 'attraction' },
  { id: 'museum', labelKey: 'sidebar.cat_museums', iconType: 'museum' },
  { id: 'restaurant', labelKey: 'sidebar.cat_restaurants', iconType: 'restaurant' },
  { id: 'cafe', labelKey: 'sidebar.cat_cafes', iconType: 'cafe' },
  { id: 'landmark', labelKey: 'sidebar.cat_landmarks', iconType: 'landmark' },
  { id: 'park', labelKey: 'sidebar.cat_parks', iconType: 'park' },
  { id: 'shopping', labelKey: 'sidebar.cat_shopping', iconType: 'shopping' },
];

interface DayNameInlineEditorProps {
  dayNumber: number;
  theme: string;
  dayLabel: string;
  placeholder?: string;
  onSave?: (newName: string) => void;
}

function DayNameInlineEditor({
  dayNumber,
  theme,
  dayLabel,
  placeholder,
  onSave,
}: DayNameInlineEditorProps) {
  const [prevTheme, setPrevTheme] = useState(theme);
  const [value, setValue] = useState(theme);
  const [isFocused, setIsFocused] = useState(false);

  if (theme !== prevTheme) {
    setPrevTheme(theme);
    setValue(theme);
  }

  const handleCommit = useCallback(() => {
    setIsFocused(false);
    const trimmed = value.trim();
    if (trimmed !== (theme || '').trim()) {
      onSave?.(trimmed);
    }
  }, [value, theme, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setValue(theme || '');
        e.currentTarget.blur();
      }
    },
    [theme]
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {dayLabel} —
      </span>
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          flex: 1,
          minWidth: 0,
        }}
      >
        <input
          type="text"
          data-testid={`edit-day-name-input-${dayNumber}`}
          aria-label={`${dayLabel} name`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={60}
          style={{
            width: '100%',
            height: '24px',
            padding: '2px 22px 2px 7px',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'inherit',
            color: 'var(--color-text-primary)',
            background: isFocused
              ? 'var(--color-surface, #FFFFFF)'
              : 'var(--color-surface-subtle, rgba(0, 0, 0, 0.03))',
            border: `1px solid ${isFocused ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)'}`,
            borderRadius: '6px',
            outline: 'none',
            boxShadow: isFocused ? '0 0 0 2px rgba(15, 76, 92, 0.15)' : 'none',
            transition: 'all 0.15s ease',
          }}
        />
        <EditIcon
          size={11}
          color={isFocused ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-muted)'}
          style={{
            position: 'absolute',
            right: '6px',
            pointerEvents: 'none',
            opacity: isFocused ? 1 : 0.6,
          }}
        />
      </div>
    </div>
  );
}

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

  const name = poi.name || translate('sidebar.scheduled_place_fallback');
  const cat = poi.category || translate('poi_detail.waypoint_fallback');
  const dur = poi.duration_mins
    ? translate('collections.duration_short', { mins: poi.duration_mins })
    : translate('collections.duration_short', { mins: 60 });

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
      ${translate('sidebar.route_stop_upper')}
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuMount = useAnimatedMount(isOpen, 130);

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
        aria-label={ariaLabel || prefix || t('sidebar.select_option')}
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

      {menuMount.shouldRender && (
        <div
          role="listbox"
          className="paladio-popover"
          data-state={menuMount.dataState}
          data-origin={align === 'right' ? 'top-right' : 'top-left'}
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuMount = useAnimatedMount(isOpen, 130);

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
    ? t('sidebar.price_any')
    : value[0] === 0
    ? t('sidebar.price_lt', { sym, max: value[1] })
    : t('sidebar.price_range_val', {
        sym,
        min: value[0],
        max: value[1],
        plus: value[1] >= 100 ? '+' : '',
      });

  const minPercent = Math.max(0, Math.min(100, (value[0] / 100) * 100));
  const maxPercent = Math.max(0, Math.min(100, (value[1] / 100) * 100));

  const presets = [
    { label: t('workspace.free'), range: [0, 0] as [number, number] },
    { label: `${sym}`, range: [0, 10] as [number, number] },
    { label: `${sym}${sym}`, range: [10, 25] as [number, number] },
    { label: `${sym}${sym}${sym}`, range: [25, 100] as [number, number] },
    { label: t('sidebar.any_label'), range: [0, 100] as [number, number] },
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={t('sidebar.filter_price_aria')}
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

      {menuMount.shouldRender && (
        <div
          className="paladio-popover"
          data-state={menuMount.dataState}
          data-origin="top-left"
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
              {t('sidebar.price_range_upper')}
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
              {t('sidebar.reset_btn')}
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
              aria-label={t('sidebar.min_price_aria', { sym, value: value[0] })}
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
              aria-label={t('sidebar.max_price_aria', { sym, value: value[1] })}
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
  if (mins < 60) return translate('collections.duration_short', { mins });
  if (mins % 60 === 0) return translate('sidebar.hours_short', { hours: mins / 60 });
  return translate('sidebar.hours_mins_short', {
    hours: Math.floor(mins / 60),
    mins: mins % 60,
  });
}

export function DurationRangeSliderDropdown({ value, onChange }: DurationRangeSliderDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuMount = useAnimatedMount(isOpen, 130);

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
    ? t('sidebar.duration_any')
    : t('sidebar.duration_range_val', {
        min: formatDurationMins(value[0]),
        max: formatDurationMins(value[1]),
        plus: value[1] >= 240 ? '+' : '',
      });

  const minPercent = Math.max(0, Math.min(100, ((value[0] - 15) / (240 - 15)) * 100));
  const maxPercent = Math.max(0, Math.min(100, ((value[1] - 15) / (240 - 15)) * 100));

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={t('sidebar.filter_duration_aria')}
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

      {menuMount.shouldRender && (
        <div
          className="paladio-popover"
          data-state={menuMount.dataState}
          data-origin="top-left"
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
              {t('sidebar.duration_range_upper')}
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
              {t('sidebar.reset_btn')}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
            <span>{formatDurationMins(value[0])}</span>
            <span>{value[1] >= 240 ? t('sidebar.duration_4h_plus') : formatDurationMins(value[1])}</span>
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
              aria-label={t('sidebar.min_duration_aria', { value: formatDurationMins(value[0]) })}
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
              aria-label={t('sidebar.max_duration_aria', { value: formatDurationMins(value[1]) })}
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
              { label: t('sidebar.preset_lt_45m'), range: [15, 45] as [number, number] },
              { label: t('sidebar.preset_1_2h'), range: [60, 120] as [number, number] },
              { label: t('sidebar.preset_gt_2h'), range: [120, 240] as [number, number] },
              { label: t('sidebar.any_label'), range: [15, 240] as [number, number] },
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuMount = useAnimatedMount(isOpen, 130);

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
        aria-label={t('sidebar.filter_rating_aria')}
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
        <span>{isFiltered ? t('sidebar.rating_min_chip', { value: value.toFixed(1) }) : t('sidebar.rating_any')}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--color-text-muted)', display: 'inline-flex' }}>
          <ChevronDownIcon size={12} color="currentColor" />
        </span>
      </button>

      {menuMount.shouldRender && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2500,
          }}
        >
          <div
            className="paladio-popover"
            data-state={menuMount.dataState}
            data-origin="top"
            style={{
              width: '210px',
              maxWidth: 'calc(100vw - 32px)',
              background: 'var(--color-surface-card, #FFFFFF)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderRadius: '16px',
              border: '1px solid var(--color-border)',
              boxShadow: '0 14px 34px -4px rgba(15, 76, 92, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
              {t('sidebar.minimum_rating_upper')}
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
              {t('sidebar.reset_btn')}
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
            {activeRating > 0 ? t('sidebar.rating_and_above', { value: activeRating.toFixed(1) }) : t('sidebar.any_rating')}
          </div>
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
  tripEndDate,
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
  onAddDay,
  onRemoveDay,
  onReorderDays,
  onRenameDay,
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
  uiContext,
  onTripUpdated,
  spatialCircle,
  onSpatialCircleChange,
  isDroppingWaypoint,
  onToggleDropWaypoint,
  onClearSpatialCircle,
}: TripUnifiedSidebarProps) {
  const { t, locale } = useTranslation();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const destCurrencyMeta = useDestinationCurrency(destinationCity);
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
  const [draggedDayTab, setDraggedDayTab] = useState<number | null>(null);
  const [dragOverDayTab, setDragOverDayTab] = useState<number | null>(null);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAddPoiModalOpen, setIsAddPoiModalOpen] = useState(false);
  const [onlyCustomPois, setOnlyCustomPois] = useState(false);
  const [isDownloadingPois, setIsDownloadingPois] = useState(false);

  const handlePoiCreated = useCallback(
    (newPoi: PoiApiItem) => {
      setSearchData((prev) => {
        if (!prev) {
          return {
            city: destinationCity,
            query: '',
            search_type: 'custom',
            exact_match_found: true,
            exact_match: newPoi,
            results: [newPoi],
            total: 1,
          };
        }
        return {
          ...prev,
          results: [newPoi, ...prev.results.filter((p) => p.id !== newPoi.id)],
        };
      });
      if (onInspectPoi && newPoi.id) {
        onInspectPoi(newPoi.id, newPoi as unknown as Record<string, unknown>);
      }
    },
    [destinationCity, onInspectPoi]
  );

  // Primary Tabs State
  const [internalActiveTab, setInternalActiveTab] = useState<MainTabType>('route');
  const [agentTabVisited, setAgentTabVisited] = useState(false);
  const activeTab = sidebarTab !== undefined ? sidebarTab : internalActiveTab;

  if (activeTab === 'agent' && !agentTabVisited) {
    setAgentTabVisited(true);
  }

  const [deletingPoiId, setDeletingPoiId] = useState<string | null>(null);

  const handleDeletePoi = useCallback(
    async (poi: { id: string; name?: string }) => {
      if (!window.confirm(t('poi_detail.delete_confirm', { name: poi.name || t('sidebar.this_place') }))) {
        return;
      }
      setDeletingPoiId(poi.id);
      try {
        const baseUrl = getApiBaseUrl();
        const headers: Record<string, string> = {};
        const token = getAuthToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(poi.id)}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(t('poi_detail.delete_error_status', { status: res.status }));
        }
        setSearchData((prev) => {
          if (!prev) return prev;
          const filtered = prev.results.filter((p) => p.id !== poi.id);
          if (onCategoryPoisChange && activeTab === 'search') {
            onCategoryPoisChange(filtered);
          }
          return {
            ...prev,
            results: filtered,
            total: prev.total != null ? Math.max(0, prev.total - 1) : filtered.length,
          };
        });
        notify.success(
          t('poi_detail.place_deleted_title'),
          t('poi_detail.place_deleted_desc', { name: poi.name || t('sidebar.custom_place') })
        );
        window.dispatchEvent(new CustomEvent('paladio:poi-deleted', { detail: { id: poi.id } }));
      } catch (err: unknown) {
        console.error('Error deleting custom POI:', err);
        notify.error(t('poi_detail.delete_failed_title'), t('poi_detail.delete_failed_desc'));
      } finally {
        setDeletingPoiId(null);
      }
    },
    [onCategoryPoisChange, activeTab, t]
  );

  useEffect(() => {
    const handlePoiUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<PoiDetail>;
      if (!customEvent.detail) return;
      const updated = customEvent.detail;
      setSearchData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          results: prev.results.map((p) =>
            p.id === updated.id
              ? {
                  ...p,
                  name: updated.name,
                  category: updated.category,
                  duration_mins: updated.duration_mins,
                  cost_eur: updated.cost_eur,
                }
              : p
          ),
        };
      });
    };
    const handlePoiDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (!customEvent.detail?.id) return;
      const deletedId = customEvent.detail.id;
      setSearchData((prev) => {
        if (!prev) return prev;
        const filtered = prev.results.filter((p) => p.id !== deletedId);
        if (onCategoryPoisChange && activeTab === 'search') {
          onCategoryPoisChange(filtered);
        }
        return {
          ...prev,
          results: filtered,
          total: prev.total != null ? Math.max(0, prev.total - 1) : filtered.length,
        };
      });
    };
    window.addEventListener('paladio:poi-updated', handlePoiUpdated);
    window.addEventListener('paladio:poi-deleted', handlePoiDeleted);
    return () => {
      window.removeEventListener('paladio:poi-updated', handlePoiUpdated);
      window.removeEventListener('paladio:poi-deleted', handlePoiDeleted);
    };
  }, [onCategoryPoisChange, activeTab]);
  const [isExternalPoiDragging, setIsExternalPoiDragging] = useState(false);
  const setActiveTab = useCallback(
    (tab: MainTabType) => {
      setInternalActiveTab(tab);
      onTabChange?.(tab);
      const hasWindowDrag =
        typeof window !== 'undefined' &&
        Boolean(
          (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi ||
            (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi
        );
      if (tab === 'route' && !hasWindowDrag && !isExternalPoiDragging && !spatialCircle) {
        setActiveCategory('all');
        onCategoryFilterChange?.(null);
        onCategoryPoisChange?.([]);
      }
    },
    [onTabChange, onCategoryFilterChange, onCategoryPoisChange, isExternalPoiDragging, spatialCircle]
  );

  // Filters state
  const [costRange, setCostRange] = useState<[number, number]>([0, 100]);
  const [durationRange, setDurationRange] = useState<[number, number]>([15, 240]);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortOption, setSortOption] = useState<'best' | 'rating' | 'cost' | 'name'>('best');

  // Collections & Saved state
  const {
    collections,
    isPoiSaved,
    poiCollectionMap,
  } = useTripCollections(tripId);

  const [modalPoi, setModalPoi] = useState<{
    id: string;
    name: string;
    category?: string;
    cost_eur?: number;
    duration_mins?: number;
    photo_url?: string | null;
    thumbnail_url?: string | null;
    formatted_address?: string | null;
    rating?: number | null;
  } | null>(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);

  const savedPoiIds = useMemo(() => {
    return new Set<string>(poiCollectionMap.keys());
  }, [poiCollectionMap]);

  const toggleSavePoi = useCallback((poiId: string) => {
    setModalPoi({
      id: poiId,
      name: poiId.startsWith('gtfs:')
        ? t('sidebar.station_fallback_id', { id: poiId.split(':').slice(2).join(':') })
        : t('collections.place_number_fallback', { id: poiId }),
      category: poiId.startsWith('gtfs:') ? 'transit' : 'attraction',
    });
  }, [t]);

  // Route Drag-and-drop state
  const [activeDropTarget, setActiveDropTarget] = useState<{ day: number; index: number } | null>(null);
  const [justInserted, setJustInserted] = useState<{ day: number; index: number; key: number } | null>(null);
  const [draggedPoi, setDraggedPoi] = useState<{
    day: number;
    index: number;
    id?: string;
    source?: string;
    poi?: unknown;
  } | null>(null);
  const [removingPoi, setRemovingPoi] = useState<{ day: number; index: number; id?: string } | null>(null);
  const [unlockConfirmAnchor, setUnlockConfirmAnchor] = useState<{
    dayNum: number;
    poiIdx: number;
    name: string;
    type: string;
  } | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{
    payload: { source?: string; day?: number; index?: number; poi?: Record<string, unknown> };
    targetDayNum: number;
    targetIdx: number;
    poiName: string;
    position: 'first' | 'last';
  } | null>(null);

  // Auto-switch to route tab when any POI begins being dragged from search or inspector
  useEffect(() => {
    const handleSwitchToRoute = () => {
      setIsExternalPoiDragging(true);
      setInternalActiveTab('route');
      onTabChange?.('route');
    };
    window.addEventListener('paladio:switch-to-route', handleSwitchToRoute);
    return () => window.removeEventListener('paladio:switch-to-route', handleSwitchToRoute);
  }, [onTabChange]);

  // Day Hover Switch State & Timer during POI drag
  const [dragHoveredDay, setDragHoveredDay] = useState<number | 'all' | null>(null);
  const dayHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearDayHoverTimer = useCallback(() => {
    if (dayHoverTimerRef.current) {
      clearTimeout(dayHoverTimerRef.current);
      dayHoverTimerRef.current = null;
    }
    setDragHoveredDay(null);
  }, []);

  const isPoiDragActive = useCallback((e?: React.DragEvent | DragEvent) => {
    if (draggedPoi !== null) return true;
    if (typeof window !== 'undefined') {
      const win = window as unknown as { __paladioActivePoi?: unknown; __paladioActiveSearchPoi?: unknown };
      if (win.__paladioActivePoi || win.__paladioActiveSearchPoi) return true;
    }
    if (e && 'dataTransfer' in e && e.dataTransfer) {
      return e.dataTransfer.types.includes('application/paladio-poi') || e.dataTransfer.types.includes('text/plain');
    }
    return false;
  }, [draggedPoi]);

  const handleDayTabDragOver = useCallback((e: React.DragEvent, targetDay: number | 'all') => {
    if (!isPoiDragActive(e)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setDragHoveredDay(targetDay);
    if (targetDay !== selectedDay && !dayHoverTimerRef.current) {
      dayHoverTimerRef.current = setTimeout(() => {
        onSelectDay(targetDay);
        dayHoverTimerRef.current = null;
      }, 180);
    }
  }, [isPoiDragActive, selectedDay, onSelectDay]);

  const handleDayTabDragLeave = useCallback((e: React.DragEvent) => {
    if (e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      return;
    }
    clearDayHoverTimer();
  }, [clearDayHoverTimer]);

  // Vertical edge-hover auto-scrolling for Route itinerary when dragging a POI
  const mainContentScrollRef = useRef<HTMLDivElement>(null);
  const verticalScrollRafRef = useRef<number | null>(null);
  const verticalScrollVelocityRef = useRef<number>(0);

  const stopVerticalScroll = useCallback(() => {
    if (verticalScrollRafRef.current !== null) {
      cancelAnimationFrame(verticalScrollRafRef.current);
      verticalScrollRafRef.current = null;
    }
    verticalScrollVelocityRef.current = 0;
  }, []);

  const startVerticalScroll = useCallback(() => {
    if (verticalScrollRafRef.current !== null) return;
    const loop = () => {
      const el = mainContentScrollRef.current;
      if (!el || verticalScrollVelocityRef.current === 0) {
        stopVerticalScroll();
        return;
      }
      el.scrollTop += verticalScrollVelocityRef.current;
      verticalScrollRafRef.current = requestAnimationFrame(loop);
    };
    verticalScrollRafRef.current = requestAnimationFrame(loop);
  }, [stopVerticalScroll]);

  const updateVerticalScrollVelocity = useCallback((clientY: number) => {
    const el = mainContentScrollRef.current;
    if (!el || activeTab !== 'route') {
      stopVerticalScroll();
      return;
    }
    const rect = el.getBoundingClientRect();
    const edgeThreshold = 75; // px from top or bottom edge
    const maxSpeed = 16;      // max pixels per frame

    const distFromTop = clientY - rect.top;
    const distFromBottom = rect.bottom - clientY;

    if (distFromBottom >= -40 && distFromBottom < edgeThreshold) {
      const clamped = Math.max(0, distFromBottom);
      const intensity = (edgeThreshold - clamped) / edgeThreshold;
      verticalScrollVelocityRef.current = Math.max(3, Math.round(intensity * maxSpeed));
      startVerticalScroll();
    } else if (distFromTop >= -20 && distFromTop < edgeThreshold) {
      const clamped = Math.max(0, distFromTop);
      const intensity = (edgeThreshold - clamped) / edgeThreshold;
      verticalScrollVelocityRef.current = -Math.max(3, Math.round(intensity * maxSpeed));
      startVerticalScroll();
    } else {
      stopVerticalScroll();
    }
  }, [activeTab, startVerticalScroll, stopVerticalScroll]);

  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      if (!isPoiDragActive(e)) {
        stopVerticalScroll();
        return;
      }
      const el = mainContentScrollRef.current;
      if (!el || activeTab !== 'route') return;
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left - 20 && e.clientX <= rect.right + 20) {
        updateVerticalScrollVelocity(e.clientY);
      } else {
        stopVerticalScroll();
      }
    };

    window.addEventListener('dragover', handleWindowDragOver);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      stopVerticalScroll();
    };
  }, [isPoiDragActive, activeTab, updateVerticalScrollVelocity, stopVerticalScroll]);

  // Reset active drop target and clean up drag state if dragging ends anywhere without inserting
  useEffect(() => {
    let dragEndTimer: number | null = null;

    const handleDragStartCancelTimer = () => {
      if (dragEndTimer !== null) {
        window.clearTimeout(dragEndTimer);
        dragEndTimer = null;
      }
    };

    const handleDragEnded = (ev?: Event) => {
      if (ev?.type === 'mouseup') {
        const win =
          typeof window !== 'undefined'
            ? (window as unknown as { __paladioActivePoi?: unknown; __paladioActiveSearchPoi?: unknown })
            : null;
        const hasActiveDrag =
          Boolean(document.querySelector('[data-paladio-custom-drag-preview]')) ||
          Boolean(win?.__paladioActivePoi || win?.__paladioActiveSearchPoi);
        if (!hasActiveDrag) {
          return;
        }
      }
      cleanupCustomDragPreview(false);
      clearDayHoverTimer();
      stopVerticalScroll();
      setActiveDropTarget(null);
      if (dragEndTimer !== null) {
        window.clearTimeout(dragEndTimer);
      }
      dragEndTimer = window.setTimeout(() => {
        dragEndTimer = null;
        setDraggedPoi(null);
        setIsExternalPoiDragging(false);
        if (typeof window !== 'undefined') {
          (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = null;
          (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = null;
        }
      }, 120);
    };

    window.addEventListener('dragstart', handleDragStartCancelTimer, true);
    window.addEventListener('dragend', handleDragEnded, true);
    window.addEventListener('mouseup', handleDragEnded, true);
    window.addEventListener('drop', handleDragEnded, false);
    window.addEventListener('paladio:drag-ended', handleDragEnded, true);
    return () => {
      if (dragEndTimer !== null) {
        window.clearTimeout(dragEndTimer);
        dragEndTimer = null;
      }
      window.removeEventListener('dragstart', handleDragStartCancelTimer, true);
      window.removeEventListener('dragend', handleDragEnded, true);
      window.removeEventListener('mouseup', handleDragEnded, true);
      window.removeEventListener('drop', handleDragEnded, false);
      window.removeEventListener('paladio:drag-ended', handleDragEnded, true);
    };
  }, [clearDayHoverTimer, stopVerticalScroll]);


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
    async (queryText: string, cat?: string, offset: number = 0, append: boolean = false, customOnly?: boolean) => {
      const q = queryText.trim();
      const currentCat = cat !== undefined ? cat : activeCategory;
      const isCategoryBrowse = !q && currentCat && currentCat !== 'all';
      const isAllBrowse = !q && (!currentCat || currentCat === 'all');
      const isCustomOnly = customOnly !== undefined ? customOnly : onlyCustomPois;

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
        // Only apply day spatial territory hints when browsing without an explicit typed query
        const useDaySpatialHint = !q && !spatialCircle;
        const boundsParam = useDaySpatialHint && activeDayBounds ? `&bounds=${encodeURIComponent(activeDayBounds)}` : '';
        const hullParam =
          useDaySpatialHint && activeDayHull && activeDayHull.length >= 3
            ? `&polygon=${encodeURIComponent(
                activeDayHull.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join(';')
              )}`
            : '';
        const customParam = isCustomOnly ? '&custom_only=true' : '';
        const circleParam = spatialCircle
          ? `&circle_lat=${spatialCircle.lat}&circle_lng=${spatialCircle.lng}&circle_radius=${spatialCircle.radiusMeters}`
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
          )}&query=${encodeURIComponent(q)}${catParam}${tripParam}${dayParam}${boundsParam}${hullParam}${circleParam}${customParam}&limit=${limit}${offsetParam}`,
          { headers, signal }
        );
        if (!res.ok) {
          throw new Error(t('sidebar.search_failed_status', { status: res.status }));
        }
        const data: PoiSearchResponseData = await res.json();

        // Stale check: ignore response if superseded by a newer search request
        if (reqId !== searchReqSeqRef.current) {
          return;
        }

        if (!Array.isArray(data.results)) {
          data.results = [];
        }

        // Ensure exact_match is included in results list so exact-name queries never show 0 items
        if (data.exact_match_found && data.exact_match) {
          const exactId = String(data.exact_match.id);
          if (!data.results.some((r) => String(r.id) === exactId)) {
            data.results.unshift(data.exact_match);
          }
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
          if ((data.city_total_pois || 0) > 0) {
            setIsDownloadingPois(false);
          } else if (data.is_hydrating) {
            setIsDownloadingPois(true);
          }
          if (onCategoryPoisChange && activeTab === 'search' && reqId === searchReqSeqRef.current) {
            onCategoryPoisChange(data.results || []);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          if (reqId === searchReqSeqRef.current) {
            setIsLoadingSearch(false);
            setIsLoadingMore(false);
          }
          return;
        }
        if (reqId !== searchReqSeqRef.current) {
          return;
        }
        const msg = err instanceof Error ? err.message : t('sidebar.search_error_fallback');
        setSearchErrorMessage(msg);
      } finally {
        if (reqId === searchReqSeqRef.current) {
          setIsLoadingSearch(false);
          setIsLoadingMore(false);
        }
      }
    },
    [destinationCity, tripId, hotelAnchor, airportAnchor, activeCategory, onCategoryPoisChange, selectedDay, activeDayBounds, activeDayHull, activeTab, onlyCustomPois, spatialCircle, t]
  );

  const handleLoadMore = useCallback(() => {
    if (isLoadingSearch || isLoadingMore || !searchData) return;
    const currentOffset = searchData.results.length;
    executeSearch(searchQuery, activeCategory, currentOffset, true);
  }, [isLoadingSearch, isLoadingMore, searchData, searchQuery, activeCategory, executeSearch]);

  const handleDownloadPoiDatabase = useCallback(async () => {
    if (!destinationCity || isDownloadingPois) return;
    try {
      setIsDownloadingPois(true);
      notify.info(
        t('sidebar.downloading_pois_title'),
        t('sidebar.downloading_pois_desc', { city: destinationCity })
      );
      await downloadCityPoisApi(destinationCity);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('sidebar.download_failed_desc');
      notify.error(t('sidebar.download_failed_title'), msg);
      setIsDownloadingPois(false);
    }
  }, [destinationCity, isDownloadingPois, t]);

  // Listen for POI hydration events from WebSocket and refresh search once complete
  useEffect(() => {
    if (!destinationCity) return;
    const cleanDest = destinationCity.trim().toLowerCase();

    const handleHydrationEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ city?: string; city_name?: string; city_id?: string; stage?: string }>;
      const eventCity = (customEvt.detail?.city || customEvt.detail?.city_name || customEvt.detail?.city_id || '').toLowerCase();
      if (!eventCity || cleanDest.includes(eventCity) || eventCity.includes(cleanDest)) {
        if (e.type === 'paladio:city_hydration_started') {
          if ((searchData?.city_total_pois || 0) === 0) {
            setIsDownloadingPois(true);
          }
        } else if (e.type === 'paladio:city_hydration_completed' || e.type === 'paladio:city_hydration_failed') {
          setIsDownloadingPois(false);
          void executeSearch(searchQuery, activeCategory);
        }
      }
    };

    window.addEventListener('paladio:city_hydration_started', handleHydrationEvent);
    window.addEventListener('paladio:city_hydration_completed', handleHydrationEvent);
    window.addEventListener('paladio:city_hydration_failed', handleHydrationEvent);

    return () => {
      window.removeEventListener('paladio:city_hydration_started', handleHydrationEvent);
      window.removeEventListener('paladio:city_hydration_completed', handleHydrationEvent);
      window.removeEventListener('paladio:city_hydration_failed', handleHydrationEvent);
    };
  }, [destinationCity, executeSearch, searchQuery, activeCategory, searchData?.city_total_pois]);

  // Polling fallback when isDownloadingPois is active
  useEffect(() => {
    if (!isDownloadingPois || !destinationCity) return;

    const interval = setInterval(async () => {
      try {
        const status = await fetchCityPoisStatusApi(destinationCity);
        if (status.poi_count > 0 || !status.is_hydrating) {
          setIsDownloadingPois(false);
          void executeSearch(searchQuery, activeCategory);
        }
      } catch {
        // ignore polling errors
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isDownloadingPois, destinationCity, executeSearch, searchQuery, activeCategory]);

  const isPoiDatabaseEmpty = Boolean(
    !isLoadingSearch &&
    destinationCity &&
    searchData &&
    (searchData.city_total_pois === 0 || (searchData.total === 0 && !searchQuery.trim() && activeCategory === 'all'))
  );

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
    setIsLoadingSearch(false);
    setIsLoadingMore(false);
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

    // Custom POIs only filter
    if (onlyCustomPois) {
      list = list.filter((p) => {
        const idStr = String(p.id || '');
        const matchType = (p as any).match_type;
        const source = (p as any).source || (p as any).metadata?.source;
        const costSource = (p as any).cost_source;
        return (
          idStr.startsWith('custom-') ||
          matchType === 'custom' ||
          source === 'user_created' ||
          costSource === 'user'
        );
      });
    }

    // Sort
    if (sortOption === 'cost') {
      list.sort((a, b) => a.cost_eur - b.cost_eur);
    } else if (sortOption === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, locale === 'en' ? undefined : locale));
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

    // By default in Recommendations ("all" tab, no search query), always surface Hotel (#1) and Airport (#2) first
    if (!searchQuery.trim() && activeCategory === 'all' && !onlyCustomPois) {
      const anchorItems: PoiApiItem[] = [];
      if (hotelAnchor && typeof hotelAnchor.lat === 'number' && typeof hotelAnchor.lng === 'number') {
        anchorItems.push({
          id: `trip-hotel-anchor-${tripId || 'hotel'}`,
          name: hotelAnchor.name,
          category: 'hotel',
          lat: hotelAnchor.lat,
          lng: hotelAnchor.lng,
          duration_mins: 30,
          cost_eur: 0,
          similarity: 1.0,
          match_type: 'trip_hotel_base',
          description: t('sidebar.hotel_base_desc', { city: destinationCity || t('sidebar.your_trip') }),
        });
      }
      if (airportAnchor && typeof airportAnchor.lat === 'number' && typeof airportAnchor.lng === 'number') {
        anchorItems.push({
          id: `trip-airport-anchor-${tripId || 'airport'}`,
          name: airportAnchor.name,
          category: 'airport',
          lat: airportAnchor.lat,
          lng: airportAnchor.lng,
          duration_mins: 60,
          cost_eur: 0,
          similarity: 1.0,
          match_type: 'trip_airport_gateway',
          description: t('sidebar.airport_gateway_desc', { city: destinationCity || t('sidebar.your_trip') }),
        });
      }
      if (anchorItems.length > 0) {
        const anchorIds = new Set(anchorItems.map((a) => String(a.id).toLowerCase()));
        const anchorNames = new Set(anchorItems.map((a) => a.name.trim().toLowerCase()));
        list = [
          ...anchorItems,
          ...list.filter(
            (item) =>
              !anchorIds.has(String(item.id).toLowerCase()) &&
              !anchorNames.has(item.name.trim().toLowerCase())
          ),
        ];
      }
    }

    return list;
  }, [searchData, costRange, durationRange, minRating, onlyCustomPois, sortOption, searchQuery, activeCategory, routePoiIdentifiers, activeDayHull, selectedDay, hotelAnchor, airportAnchor, tripId, destinationCity, locale, t]);

  // Displayed days in Route tab
  const displayedDays = useMemo(() => {
    if (selectedDay === 'all') return days;
    return days.filter((d) => d.day === selectedDay || (draggedPoi !== null && d.day === draggedPoi.day));
  }, [days, selectedDay, draggedPoi]);

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
      const rawItem = scheduledPoi as unknown as { is_fixed?: boolean; locked?: boolean };
      const rawPoi = p as unknown as { is_fixed?: boolean; locked?: boolean } | undefined;
      const isExplicitlyLocked =
        rawItem?.is_fixed === true ||
        rawItem?.locked === true ||
        rawPoi?.is_fixed === true ||
        rawPoi?.locked === true;
      const isExplicitlyUnlocked =
        rawItem?.is_fixed === false || rawItem?.locked === false;

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
          defaultLabel = t('sidebar.anchor_trip_arrival');
        } else if (dayNum === totalDays && idx === pathLength - 1) {
          defaultAnchorType = 'airport';
          defaultLabel = t('sidebar.anchor_trip_departure');
        } else {
          defaultAnchorType = 'airport';
          defaultLabel = t('sidebar.anchor_airport_stop');
        }
      } else if (isHotel) {
        if (idx === 0) {
          defaultAnchorType = 'hotel';
          defaultLabel = t('sidebar.anchor_day_origin');
        } else if (idx === pathLength - 1) {
          defaultAnchorType = 'hotel';
          defaultLabel = t('sidebar.anchor_day_destination');
        } else {
          defaultAnchorType = 'hotel';
          defaultLabel = t('sidebar.anchor_hotel_base');
        }
      }

      const isDefaultAnchor = Boolean(defaultAnchorType);

      if (isExplicitlyUnlocked) return { isFixed: false, isAnchor: isDefaultAnchor, type: defaultAnchorType, label: defaultLabel };
      if (isExplicitlyLocked) {
        return { isFixed: true, isAnchor: isDefaultAnchor, type: defaultAnchorType || 'custom', label: defaultLabel || t('sidebar.anchor_locked_stop') };
      }
      if (isDefaultAnchor) return { isFixed: true, isAnchor: true, type: defaultAnchorType, label: defaultLabel };

      return { isFixed: false, isAnchor: false };
    },
    [airportAnchor, hotelAnchor, t]
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
        newLockState ? t('sidebar.waypoint_locked_title') : t('sidebar.waypoint_unlocked_title'),
        newLockState
          ? t('sidebar.waypoint_locked_desc', { name: scheduledPoi.poi?.name || t('poi_detail.waypoint_fallback') })
          : t('sidebar.waypoint_unlocked_desc', { name: scheduledPoi.poi?.name || t('poi_detail.waypoint_fallback') })
      );
    },
    [itinerary, onItineraryUpdate, t]
  );

  // Parse HH:MM into minutes since midnight for schedule conflict checks
  const parseTimeToMins = useCallback((val?: string): number | null => {
    if (!val || val === '--:--') return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(val.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    return h * 60 + min;
  }, []);

  const getStopConflict = useCallback(
    (path: ScheduledPoi[], idx: number): string | null => {
      const stop = path[idx];
      if (!stop) return null;
      const { start, end } = getScheduledPoiTimes(stop);
      const startMins = parseTimeToMins(start);
      const endMins = parseTimeToMins(end);

      if (startMins !== null && endMins !== null && endMins < startMins) {
        return t('sidebar.conflict_exit_before_entry', { end, start });
      }
      if (idx > 0 && startMins !== null) {
        const prev = path[idx - 1];
        const { end: prevEnd } = getScheduledPoiTimes(prev);
        const prevEndMins = parseTimeToMins(prevEnd);
        const transitMins = stop.transit_from_previous?.duration_mins ?? 0;
        if (prevEndMins !== null) {
          if (startMins < prevEndMins) {
            return t('sidebar.conflict_overlaps_prev', { end: prevEnd });
          }
          if (transitMins > 0 && startMins < prevEndMins + transitMins) {
            return t('sidebar.conflict_transit_prev', {
              duration: formatTransitDuration(transitMins, { variant: 'short', t }),
              end: prevEnd,
            });
          }
        }
      }
      if (idx + 1 < path.length && endMins !== null) {
        const next = path[idx + 1];
        const { start: nextStart } = getScheduledPoiTimes(next);
        const nextStartMins = parseTimeToMins(nextStart);
        const nextTransitMins = next.transit_from_previous?.duration_mins ?? 0;
        if (nextStartMins !== null) {
          if (endMins > nextStartMins) {
            return t('sidebar.conflict_overlaps_next', { start: nextStart });
          }
          if (nextTransitMins > 0 && endMins + nextTransitMins > nextStartMins) {
            return t('sidebar.conflict_transit_next', {
              duration: formatTransitDuration(nextTransitMins, { variant: 'short', t }),
              start: nextStart,
            });
          }
        }
      }
      return null;
    },
    [parseTimeToMins, t]
  );

  const handleUpdateStopTimes = useCallback(
    (dayNum: number, poiIdx: number, newStart: string, newEnd: string) => {
      if (!itinerary || !onItineraryUpdate) return;
      const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
      const targetDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === dayNum);
      const path = targetDayObj?.itinerary?.path;
      if (!path || !path[poiIdx]) return;

      const stop = path[poiIdx];
      if (newStart) {
        stop.scheduled_start = newStart;
        stop.arrival_time = newStart;
        const sm = parseTimeToMins(newStart);
        if (sm !== null) stop.arrival_time_mins = sm;
      }
      if (newEnd) {
        stop.scheduled_end = newEnd;
        stop.departure_time = newEnd;
        const em = parseTimeToMins(newEnd);
        if (em !== null) stop.departure_time_mins = em;
      }

      onItineraryUpdate(clonedItin);

      const conflict = getStopConflict(path, poiIdx);
      if (conflict) {
        notify.warning(t('sidebar.schedule_conflict_title'), `${stop.poi?.name || t('sidebar.stop_fallback')}: ${conflict}`);
      }
    },
    [itinerary, onItineraryUpdate, parseTimeToMins, getStopConflict, t]
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

      autoFillDayItineraryHours(path);

      onItineraryUpdate(clonedItin);
      const minIdx = Math.min(sourceIdx, targetIdx);
      const maxIdx = Math.max(sourceIdx, targetIdx);
      void hydrateDayTransitIndices(clonedItin, targetDayNum, [minIdx, maxIdx, maxIdx + 1], destinationCity, tripId).then(
        (hydrated) => {
          if (hydrated) {
            const dayObj = hydrated.days?.find((d) => (d.day ?? 1) === targetDayNum);
            if (dayObj?.itinerary?.path) autoFillDayItineraryHours(dayObj.itinerary.path);
            onItineraryUpdate(hydrated);
          }
        }
      );
    },
    [itinerary, onItineraryUpdate, destinationCity, tripId, t]
  );

  // Remove scheduled waypoint from the route (e.g. dropped outside route or collection, or '-' in edit mode)
  const handleRemoveStopFromRoute = useCallback(
    (targetDayNum: number, sourceIdx: number, poiId?: string, poiName?: string) => {
      if (!itinerary || !onItineraryUpdate) return;
      const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
      const targetDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === targetDayNum);
      if (!targetDayObj?.itinerary?.path) return;

      const path = targetDayObj.itinerary.path;
      let removeIdx = -1;
      if (sourceIdx >= 0 && sourceIdx < path.length) {
        if (!poiId || path[sourceIdx]?.poi?.id === poiId || path[sourceIdx]?.poi?.name === poiName) {
          removeIdx = sourceIdx;
        }
      }
      if (removeIdx === -1 && poiId) {
        removeIdx = path.findIndex((item) => item.poi?.id === poiId);
      }
      if (removeIdx === -1 && poiName) {
        removeIdx = path.findIndex((item) => item.poi?.name === poiName);
      }
      if (removeIdx === -1 && sourceIdx >= 0 && sourceIdx < path.length) {
        removeIdx = sourceIdx;
      }

      if (removeIdx >= 0 && removeIdx < path.length) {
        const [removedItem] = path.splice(removeIdx, 1);
        if (removedItem) {
          autoFillDayItineraryHours(path);
          onItineraryUpdate(clonedItin);
          void hydrateDayTransitIndices(clonedItin, targetDayNum, [removeIdx], destinationCity, tripId).then(
            (hydrated) => {
              if (hydrated) {
                const dayObj = hydrated.days?.find((d) => (d.day ?? 1) === targetDayNum);
                if (dayObj?.itinerary?.path) autoFillDayItineraryHours(dayObj.itinerary.path);
                onItineraryUpdate(hydrated);
              }
            }
          );
        }
      }
    },
    [itinerary, onItineraryUpdate, destinationCity, tripId, t]
  );

  // Drag and drop handlers for Route reordering
  const executeDrop = useCallback(
    (
      payload: { source?: string; day?: number; index?: number; poi?: Record<string, unknown> },
      targetDayNum: number,
      targetIdx: number
    ) => {
      if (!payload || !itinerary || !onItineraryUpdate) return;

      try {
        const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
        if (!Array.isArray(clonedItin.days)) {
          clonedItin.days = [];
        }
        let targetDayObj = clonedItin.days.find((d) => (d.day ?? 1) === targetDayNum);
        if (!targetDayObj) {
          targetDayObj = { day: targetDayNum, itinerary: { path: [] } };
          clonedItin.days.push(targetDayObj);
        }

        if (!targetDayObj.itinerary) {
          targetDayObj.itinerary = { path: [] };
        }
        if (!Array.isArray(targetDayObj.itinerary.path)) {
          targetDayObj.itinerary.path = [];
        }

        if (payload.source === 'route') {
          const srcDayNum = payload.day;
          const srcIdx = payload.index;
          if (typeof srcDayNum !== 'number' || typeof srcIdx !== 'number') return;
          const srcDayObj = clonedItin.days.find((d) => (d.day ?? 1) === srcDayNum);
          if (!srcDayObj?.itinerary?.path) return;

          const [movedItem] = srcDayObj.itinerary.path.splice(srcIdx, 1);
          if (movedItem) {
            let adjustedTargetIdx = targetIdx;
            if (srcDayNum === targetDayNum && srcIdx < targetIdx) {
              adjustedTargetIdx = targetIdx - 1;
            }
            const safeIdx = Math.max(0, Math.min(adjustedTargetIdx, targetDayObj.itinerary.path.length));
            targetDayObj.itinerary.path.splice(safeIdx, 0, movedItem);

            autoFillDayItineraryHours(targetDayObj.itinerary.path);
            if (srcDayNum !== targetDayNum && srcDayObj.itinerary.path) {
              autoFillDayItineraryHours(srcDayObj.itinerary.path);
            }

            onItineraryUpdate(clonedItin);
            const indicesToHydrate =
              srcDayNum === targetDayNum
                ? [Math.min(srcIdx, safeIdx), Math.min(srcIdx, safeIdx) + 1, safeIdx, safeIdx + 1]
                : [safeIdx, safeIdx + 1];
            void hydrateDayTransitIndices(clonedItin, targetDayNum, indicesToHydrate, destinationCity, tripId).then(
              (hydrated) => {
                if (hydrated) {
                  const dayObj = hydrated.days?.find((d) => (d.day ?? 1) === targetDayNum);
                  if (dayObj?.itinerary?.path) autoFillDayItineraryHours(dayObj.itinerary.path);
                  onItineraryUpdate(hydrated);
                }
              }
            );
          }
        } else if (payload.source === 'search' || payload.source === 'inspector' || payload.source === 'map' || payload.source === 'collection') {
          const poi = payload.poi;
          if (!poi) return;
          const lat = ((poi.location as { latitude?: number } | undefined)?.latitude ?? poi.lat ?? 0) as number;
          const lng = ((poi.location as { longitude?: number } | undefined)?.longitude ?? poi.lng ?? 0) as number;
          const poiName = (poi.name as string) || t('poi_detail.waypoint_fallback');
          const newScheduled: ScheduledPoi = {
            poi: {
              id: (poi.id as string) || poiName,
              name: poiName,
              city: destinationCity,
              category: (poi.category as string) || 'attraction',
              duration_mins: (poi.duration_mins as number) || (poi.durationMins as number) || 60,
              cost_eur: (poi.cost_eur as number) || (poi.costEur as number) || 0,
              location: {
                latitude: lat,
                longitude: lng,
              },
            },
          };
          const safeIdx = Math.max(0, Math.min(targetIdx, targetDayObj.itinerary.path.length));
          targetDayObj.itinerary.path.splice(safeIdx, 0, newScheduled);

          autoFillDayItineraryHours(targetDayObj.itinerary.path);

          onItineraryUpdate(clonedItin);
          void hydrateDayTransitIndices(clonedItin, targetDayNum, [safeIdx, safeIdx + 1], destinationCity, tripId).then(
            (hydrated) => {
              if (hydrated) {
                const dayObj = hydrated.days?.find((d) => (d.day ?? 1) === targetDayNum);
                if (dayObj?.itinerary?.path) autoFillDayItineraryHours(dayObj.itinerary.path);
                onItineraryUpdate(hydrated);
              }
            }
          );
          setJustInserted((prev) => ({ day: targetDayNum, index: safeIdx, key: (prev?.key ?? 0) + 1 }));
          window.setTimeout(() => setJustInserted(null), 800);
        }
      } catch (err) {
        console.error('Failed to execute drop:', err);
      }
    },
    [itinerary, onItineraryUpdate, destinationCity, tripId, t]
  );

  const handleDrop = (e: React.DragEvent, targetDayNum: number, targetIdx: number) => {
    e.preventDefault();
    cleanupCustomDragPreview();
    setActiveDropTarget(null);
    markPaladioDropHandled();

    let payload: { source?: string; day?: number; index?: number; poi?: Record<string, unknown> } | null = null;
    try {
      const rawData = e.dataTransfer.getData('application/paladio-poi') || e.dataTransfer.getData('text/plain');
      if (rawData) {
        payload = JSON.parse(rawData);
      }
    } catch {
      payload = null;
    }

    if (!payload && typeof window !== 'undefined') {
      const win = window as unknown as { __paladioActivePoi?: unknown; __paladioActiveSearchPoi?: unknown };
      payload = (win.__paladioActivePoi || win.__paladioActiveSearchPoi || draggedPoi) as typeof payload;
    }

    if (!payload || !itinerary || !onItineraryUpdate) return;

    try {
      const targetDayObj = itinerary.days?.find((d) => (d.day ?? 1) === targetDayNum);
      const currentPath = targetDayObj?.itinerary?.path || [];
      const currentLength = currentPath.length;

      let willChange = false;
      let finalIdx = 0;
      let newLength = 0;
      let poiName = t('poi_detail.waypoint_fallback');

      if (payload.source === 'route') {
        const srcDayNum = payload.day;
        const srcIdx = payload.index;
        if (typeof srcDayNum === 'number' && typeof srcIdx === 'number') {
          const srcDayObj = itinerary.days?.find((d) => (d.day ?? 1) === srcDayNum);
          const srcItem = srcDayObj?.itinerary?.path?.[srcIdx];
          poiName = srcItem?.poi?.name || t('poi_detail.waypoint_fallback');
          let adjustedTargetIdx = targetIdx;
          if (srcDayNum === targetDayNum && srcIdx < targetIdx) {
            adjustedTargetIdx = targetIdx - 1;
          }
          finalIdx = Math.max(0, Math.min(adjustedTargetIdx, srcDayNum === targetDayNum ? currentLength - 1 : currentLength));
          newLength = srcDayNum === targetDayNum ? currentLength : currentLength + 1;
          willChange = srcDayNum !== targetDayNum || srcIdx !== finalIdx;
        }
      } else {
        const poi = payload.poi;
        poiName = (poi?.name as string) || t('poi_detail.waypoint_fallback');
        finalIdx = Math.max(0, Math.min(targetIdx, currentLength));
        newLength = currentLength + 1;
        willChange = true;
      }

      const isFirst = finalIdx === 0;
      const isLast = finalIdx === newLength - 1;

      // Warn if user tries to drag a POI as the first or last of any day with existing stops
      if (willChange && currentLength > 0 && (isFirst || isLast)) {
        setPendingDrop({
          payload,
          targetDayNum,
          targetIdx,
          poiName,
          position: isFirst ? 'first' : 'last',
        });
        return;
      }

      executeDrop(payload, targetDayNum, targetIdx);
    } catch (err) {
      console.error('Failed to handle drop:', err);
    } finally {
      if (typeof window !== 'undefined') {
        (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = null;
        (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = null;
      }
    }
  };

  const handleDayTabDrop = useCallback((e: React.DragEvent, targetDay: number | 'all') => {
    clearDayHoverTimer();
    stopVerticalScroll();
    if (targetDay !== 'all') {
      onSelectDay(targetDay);
      const targetDayData = days.find((d) => d.day === targetDay);
      const targetLen = targetDayData?.itinerary?.path?.length || 0;
      handleDrop(e, targetDay, targetLen);
    } else {
      onSelectDay('all');
      if (displayedDays.length > 0) {
        handleDrop(e, displayedDays[0].day, 0);
      }
    }
  }, [clearDayHoverTimer, stopVerticalScroll, onSelectDay, days, displayedDays, handleDrop]);

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
        aria-label={t('workspace.open_sidebar')}
        data-tooltip={t('workspace.open_sidebar')}
        data-tooltip-position="right"
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
            width:
              activeTab === 'route'
                ? 'min(380px, calc(100vw - 32px))'
                : 'min(520px, calc(100vw - 32px))',
            height: '100%',
            background: 'var(--color-surface-card, #FFFFFF)',
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
                  {/* Route Tab */}
                  <button
                    type="button"
                    data-testid="tab-route"
                    data-tooltip={t('sidebar.tab_route')}
                    data-tooltip-position="bottom"
                    aria-label={t('sidebar.tab_route')}
                    onClick={() => setActiveTab('route')}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setActiveTab('route');
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (activeTab !== 'route') setActiveTab('route');
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      padding: activeTab === 'route' ? '7px 16px' : '7px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'route' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'route' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'route' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-snappy), color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
                      boxShadow: activeTab === 'route' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    {activeTab === 'route' && <span>{t('sidebar.tab_route')}</span>}
                  </button>

                  {/* Search Tab */}
                  <button
                    type="button"
                    data-testid="tab-search"
                    data-tooltip={t('sidebar.tab_search')}
                    data-tooltip-position="bottom"
                    aria-label={t('sidebar.tab_search')}
                    onClick={() => setActiveTab('search')}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setActiveTab('search');
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (activeTab !== 'search') setActiveTab('search');
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      padding: activeTab === 'search' ? '7px 16px' : '7px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'search' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'search' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'search' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-snappy), color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
                      boxShadow: activeTab === 'search' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <SearchIcon size={13} color="currentColor" />
                    {activeTab === 'search' && <span>{t('sidebar.tab_search')}</span>}
                  </button>

                  {/* Transit Tab */}
                  <button
                    type="button"
                    data-testid="tab-transit"
                    data-tooltip={t('sidebar.tab_transit')}
                    data-tooltip-position="bottom"
                    aria-label={t('sidebar.tab_transit')}
                    onClick={() => setActiveTab('transit')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      padding: activeTab === 'transit' ? '7px 16px' : '7px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'transit' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'transit' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'transit' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-snappy), color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
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
                    {activeTab === 'transit' && <span>{t('sidebar.tab_transit')}</span>}
                  </button>

                  {/* Weather Tab */}
                  <button
                    type="button"
                    data-testid="tab-weather"
                    data-tooltip={t('sidebar.tab_weather')}
                    data-tooltip-position="bottom"
                    aria-label={t('sidebar.tab_weather')}
                    onClick={() => setActiveTab('weather')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      padding: activeTab === 'weather' ? '7px 16px' : '7px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'weather' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'weather' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'weather' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-snappy), color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
                      boxShadow: activeTab === 'weather' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                    </svg>
                    {activeTab === 'weather' && <span>{t('sidebar.tab_weather')}</span>}
                  </button>

                  {/* Collections Tab */}
                  <button
                    type="button"
                    data-testid="tab-saved"
                    data-tooltip={t('sidebar.tab_collections')}
                    data-tooltip-position="bottom"
                    aria-label={t('sidebar.tab_collections')}
                    onClick={() => setActiveTab('saved')}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setActiveTab('saved');
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (activeTab !== 'saved') setActiveTab('saved');
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      padding: activeTab === 'saved' ? '7px 16px' : '7px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'saved' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'saved' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'saved' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-snappy), color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
                      boxShadow: activeTab === 'saved' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {activeTab === 'saved' && <span>{t('sidebar.tab_collections')}</span>}
                  </button>

                  {/* Agent Tab */}
                  <button
                    type="button"
                    data-testid="tab-agent"
                    data-tooltip={t('sidebar.tab_agent_tooltip')}
                    data-tooltip-position="bottom"
                    aria-label={t('sidebar.tab_agent_tooltip')}
                    onClick={() => setActiveTab('agent')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      padding: activeTab === 'agent' ? '7px 16px' : '7px 10px',
                      borderRadius: '9999px',
                      border: 'none',
                      background: activeTab === 'agent' ? 'var(--color-accent-primary)' : 'transparent',
                      color: activeTab === 'agent' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '13px',
                      fontWeight: activeTab === 'agent' ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-snappy), color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
                      boxShadow: activeTab === 'agent' ? '0 2px 8px rgba(15, 76, 92, 0.28)' : 'none',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="12 8 8 16 12 14 16 16 12 8" />
                    </svg>
                    {activeTab === 'agent' && <span>{t('sidebar.tab_agent_short')}</span>}
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
                    {selectedDay === 'all' ? t('sidebar.all_days_upper') : t('map.day_upper', { day: selectedDay })}
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
                      data-tooltip={t('sidebar.solve_tooltip')}
                      data-tooltip-position="bottom"
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
                      <span>{isReoptimizing ? t('sidebar.solving_btn') : t('sidebar.solve_btn')}</span>
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
                      onDragOver={(e) => handleDayTabDragOver(e, 'all')}
                      onDragLeave={handleDayTabDragLeave}
                      onDrop={(e) => handleDayTabDrop(e, 'all')}
                      style={{
                        background: dragHoveredDay === 'all' ? 'rgba(15, 76, 92, 0.12)' : 'transparent',
                        borderRadius: dragHoveredDay === 'all' ? '6px 6px 0 0' : 0,
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
                        transition:
                          'background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), border-radius var(--transition-fast)',
                      }}
                    >
                      {t('sidebar.all_days_upper')}
                    </button>

                    {days.map((d) => {
                      const isSel = selectedDay === d.day;
                      const isDragOver = dragOverDayTab === d.day && draggedDayTab !== d.day;
                      const isPoiDragHover = dragHoveredDay === d.day;
                      return (
                        <div
                          key={d.day}
                          draggable={isEditMode && days.length > 1 && Boolean(onReorderDays)}
                          onDragStart={(e) => {
                            if (!isEditMode || days.length <= 1 || !onReorderDays) return;
                            setDraggedDayTab(d.day);
                            e.dataTransfer.setData('application/paladio-day', String(d.day));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (draggedDayTab !== null) {
                              if (!isEditMode || draggedDayTab === d.day) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              setDragOverDayTab(d.day);
                              return;
                            }
                            handleDayTabDragOver(e, d.day);
                          }}
                          onDragLeave={(e) => {
                            if (dragOverDayTab === d.day) setDragOverDayTab(null);
                            handleDayTabDragLeave(e);
                          }}
                          onDrop={(e) => {
                            if (draggedDayTab !== null) {
                              if (!isEditMode) return;
                              e.preventDefault();
                              e.stopPropagation();
                              const fromDay = draggedDayTab;
                              setDraggedDayTab(null);
                              setDragOverDayTab(null);
                              if (fromDay !== d.day) {
                                onReorderDays?.(fromDay, d.day);
                              }
                              return;
                            }
                            handleDayTabDrop(e, d.day);
                          }}
                          onDragEnd={() => {
                            setDraggedDayTab(null);
                            setDragOverDayTab(null);
                            clearDayHoverTimer();
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderBottom: isSel ? '2.5px solid var(--color-accent-primary)' : '2.5px solid transparent',
                            borderLeft: isDragOver ? '2px solid var(--color-accent-primary)' : 'none',
                            background: isDragOver || isPoiDragHover ? 'rgba(15, 76, 92, 0.12)' : 'transparent',
                            borderRadius: isDragOver || isPoiDragHover ? '6px 6px 0 0' : 0,
                            padding: isEditMode ? '0 2px' : '0 6px',
                            flexShrink: 0,
                            opacity: draggedDayTab === d.day ? 0.5 : 1,
                            cursor: isEditMode && days.length > 1 && onReorderDays ? 'grab' : 'pointer',
                            transition:
                              'background-color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast), border-radius var(--transition-fast)',
                          }}
                        >
                          <button
                            type="button"
                            data-testid={`day-tab-${d.day}`}
                            onClick={() => onSelectDay(d.day)}
                            onDoubleClick={() => {
                              if (isEditMode) {
                                onSelectDay(d.day);
                                setTimeout(() => {
                                  const input = document.querySelector<HTMLInputElement>(`[data-testid="edit-day-name-input-${d.day}"]`);
                                  input?.focus();
                                  input?.select();
                                }, 60);
                              }
                            }}
                            title={
                              isEditMode && days.length > 1 && onReorderDays
                                ? t('sidebar.day_tab_reorder_title', { day: d.day })
                                : d.theme
                                ? `${t('trips.day_label', { number: d.day })} — ${d.theme}`
                                : t('trips.day_label', { number: d.day })
                            }
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: '6px 2px 6px 4px',
                              color: isSel ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                              fontSize: '12px',
                              fontWeight: isSel ? 700 : 500,
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                              whiteSpace: 'nowrap',
                              cursor: 'inherit',
                            }}
                          >
                            {t('map.day_upper', { day: d.day })}
                          </button>
                          {isEditMode && onRemoveDay && (
                            <button
                              type="button"
                              data-testid={`remove-day-tab-${d.day}`}
                              aria-label={t('sidebar.remove_day_aria', { day: d.day })}
                              title={
                                days.length <= 1
                                  ? t('sidebar.min_one_day_required')
                                  : t('sidebar.remove_day_aria', { day: d.day })
                              }
                              disabled={days.length <= 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveDay(d.day);
                              }}
                              style={{
                                width: '15px',
                                height: '15px',
                                borderRadius: '50%',
                                border: '1px solid var(--color-border)',
                                background: 'transparent',
                                color: days.length <= 1 ? 'var(--color-text-muted)' : '#DC2626',
                                opacity: days.length <= 1 ? 0.35 : 0.8,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                fontWeight: 700,
                                lineHeight: 1,
                                padding: 0,
                                cursor: days.length <= 1 ? 'not-allowed' : 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              -
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {isEditMode && onAddDay && (
                      <button
                        type="button"
                        data-testid="add-day-tab-btn"
                        aria-label={t('sidebar.add_day_aria')}
                        title={t('sidebar.add_day_title')}
                        onClick={onAddDay}
                        style={{
                          marginLeft: 'auto',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-card)',
                          color: 'var(--color-accent-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '14px',
                          fontWeight: 700,
                          lineHeight: 1,
                          padding: 0,
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.16s ease',
                        }}
                      >
                        +
                      </button>
                    )}
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
                        <span>{t(cat.labelKey)}</span>
                      </button>
                    );
                  })}
                </HoverScrollRow>
              ) : null}

              {/* Main Content Area */}
              <div
                ref={mainContentScrollRef}
                className="no-scrollbar"
                onDragOver={(e) => {
                  if (isPoiDragActive(e)) {
                    updateVerticalScrollVelocity(e.clientY);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) {
                    return;
                  }
                  stopVerticalScroll();
                }}
                style={{
                  flex: 1,
                  background: 'var(--color-surface-card, #FFFFFF)',
                  overflowY: activeTab === 'agent' ? 'hidden' : 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* VIEW A: ROUTE TAB CONTENT */}
                <div
                  className={activeTab === 'route' ? 'animate-tab-pane' : undefined}
                  style={{
                    display: activeTab === 'route' ? 'flex' : 'none',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDragLeave={(e) => {
                      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) {
                        setActiveDropTarget(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (activeDropTarget) {
                        handleDrop(e, activeDropTarget.day, activeDropTarget.index);
                      } else if (displayedDays.length > 0) {
                        const fallbackDay =
                          displayedDays.find((d) => selectedDay === 'all' || d.day === selectedDay) || displayedDays[0];
                        handleDrop(e, fallbackDay.day, fallbackDay.itinerary?.path?.length || 0);
                      }
                    }}
                    style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}
                  >
                    {/* Scheduled Days and Stops Timeline */}
                    {displayedDays.map((dayObj) => {
                      const path = dayObj.itinerary?.path || [];
                      const isHiddenDraggedSourceDay =
                        draggedPoi !== null && selectedDay !== 'all' && dayObj.day !== selectedDay;

                      return (
                        <div
                          key={dayObj.day}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                            const container = e.currentTarget;
                            const cards = container.querySelectorAll<HTMLElement>('[data-paladio-stop-index]');
                            if (cards.length === 0) {
                              setActiveDropTarget({ day: dayObj.day, index: 0 });
                              return;
                            }
                            const cursorY = e.clientY;
                            let targetIdx = path.length;
                            for (let ci = 0; ci < cards.length; ci++) {
                              const rect = cards[ci].getBoundingClientRect();
                              const midY = rect.top + rect.height / 2;
                              if (cursorY < midY) {
                                targetIdx = ci;
                                break;
                              }
                            }
                            setActiveDropTarget({ day: dayObj.day, index: targetIdx });
                          }}
                          onDragLeave={(e) => {
                            if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) {
                              setActiveDropTarget(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            let targetIdx = path.length;
                            if (activeDropTarget && activeDropTarget.day === dayObj.day) {
                              targetIdx = activeDropTarget.index;
                            } else {
                              const container = e.currentTarget;
                              const cards = container.querySelectorAll<HTMLElement>('[data-paladio-stop-index]');
                              const cursorY = e.clientY;
                              for (let ci = 0; ci < cards.length; ci++) {
                                const rect = cards[ci].getBoundingClientRect();
                                const midY = rect.top + rect.height / 2;
                                if (cursorY < midY) {
                                  targetIdx = ci;
                                  break;
                                }
                              }
                            }
                            handleDrop(e, dayObj.day, targetIdx);
                          }}
                          style={
                            isHiddenDraggedSourceDay
                              ? {
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px',
                                  position: 'fixed',
                                  left: '-9999px',
                                  top: 0,
                                  width: '360px',
                                  opacity: 0,
                                  pointerEvents: 'none',
                                }
                              : { display: 'flex', flexDirection: 'column', gap: '8px' }
                          }
                        >
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                              setActiveDropTarget({ day: dayObj.day, index: 0 });
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDrop(e, dayObj.day, 0);
                            }}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottom: '1px solid var(--color-border)',
                              paddingBottom: '4px',
                              gap: '8px',
                            }}
                          >
                            {isEditMode && onRenameDay ? (
                              <DayNameInlineEditor
                                dayNumber={dayObj.day}
                                theme={dayObj.theme || ''}
                                dayLabel={t('trips.day_label', { number: dayObj.day })}
                                placeholder={t('sidebar.day_name_placeholder') || 'Day theme or name...'}
                                onSave={(newName) => onRenameDay(dayObj.day, newName)}
                              />
                            ) : (
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {t('trips.day_label', { number: dayObj.day })}{dayObj.theme ? ` — ${dayObj.theme}` : ''}
                              </span>
                            )}
                            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                              {t('sidebar.stops_upper_count', { count: path.length })}
                            </span>
                          </div>

                          {/* Empty day drop slot */}
                          {path.length === 0 && (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
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
                              {t('sidebar.empty_day_drop')}
                            </div>
                          )}

                          {path.map((scheduledPoi: ScheduledPoi, poiIdx: number) => {
                            const p = scheduledPoi.poi;
                            const prevPoi = poiIdx > 0 ? path[poiIdx - 1]?.poi : null;
                            const { start: startTime, end: endTime } = getScheduledPoiTimes(scheduledPoi);
                            const transitFromPrev = scheduledPoi.transit_from_previous;
                            const stopNum = String(poiIdx + 1).padStart(2, '0');
                            const anchorInfo = checkFixedAnchor(scheduledPoi, poiIdx, path.length, dayObj.day, days.length);

                            return (
                              <React.Fragment key={`${p?.id || 'poi'}-${poiIdx}`}>
                                {/* Insertion indicator before stop if targeted */}
                                {activeDropTarget?.day === dayObj.day && activeDropTarget?.index === poiIdx && (
                                  <div
                                    data-testid="route-drop-insert-indicator"
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDrop(e, dayObj.day, poiIdx);
                                    }}
                                    style={{
                                      height: '32px',
                                      borderRadius: '10px',
                                      border: '2px dashed var(--color-accent-teal-deep, #0F4C5C)',
                                      background: 'rgba(15, 76, 92, 0.08)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      margin: '2px 0',
                                      transition: 'all 0.15s ease',
                                      pointerEvents: 'auto',
                                      cursor: 'copy',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--color-accent-teal-deep, #0F4C5C)',
                                        letterSpacing: '0.04em',
                                      }}
                                    >
                                      {t('sidebar.insert_at_stop_upper', { num: stopNum })}
                                    </span>
                                  </div>
                                )}

                                {/* Transit Leg / Connector between stops (Droppable) */}
                                {poiIdx > 0 && (
                                  transitMode === 'detailed' && transitFromPrev ? (
                                    <div
                                      style={{ margin: '2px 0 2px 16px' }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                                        setActiveDropTarget({ day: dayObj.day, index: poiIdx });
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDrop(e, dayObj.day, poiIdx);
                                      }}
                                    >
                                      <TransitLegView
                                        transitLeg={transitFromPrev}
                                        originName={prevPoi?.name}
                                        destinationName={p?.name}
                                        city={destinationCity}
                                        tripId={tripId}
                                        defaultExpanded={false}
                                        onInspectPoi={onInspectPoi}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      data-testid="route-poi-connector"
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                                        setActiveDropTarget({ day: dayObj.day, index: poiIdx });
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDrop(e, dayObj.day, poiIdx);
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        paddingLeft: '32px',
                                        height: activeDropTarget?.day === dayObj.day && activeDropTarget?.index === poiIdx ? '28px' : '18px',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'height 0.15s ease',
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
                                  key={justInserted?.day === dayObj.day && justInserted.index === poiIdx ? `ins-${justInserted.key}` : undefined}
                                  data-paladio-stop-index={poiIdx}
                                  className={justInserted?.day === dayObj.day && justInserted.index === poiIdx ? 'paladio-poi-insert' : undefined}
                                  style={justInserted?.day === dayObj.day && justInserted.index === poiIdx ? { animation: 'paladioPoiInsert 0.5s cubic-bezier(0.22, 1, 0.36, 1)', borderRadius: '12px' } : undefined}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const isUpperHalf = e.clientY < rect.top + rect.height / 2;
                                    const targetIdx = isUpperHalf ? poiIdx : poiIdx + 1;
                                    setActiveDropTarget({ day: dayObj.day, index: targetIdx });
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const isUpperHalf = e.clientY < rect.top + rect.height / 2;
                                    const targetIdx = isUpperHalf ? poiIdx : poiIdx + 1;
                                    handleDrop(e, dayObj.day, targetIdx);
                                  }}
                                >
                                  <MinimalistPoiCard
                                    id={p?.id}
                                    name={p?.name || t('sidebar.scheduled_place_fallback')}
                                    category={p?.category}
                                    startTime={startTime}
                                    endTime={endTime}
                                    durationMins={p?.duration_mins}
                                    costEur={p?.cost_eur}
                                    city={destinationCity}
                                    isEditMode={isEditMode}
                                    stopNum={stopNum}
                                    anchorInfo={anchorInfo}
                                    draggable={true}
                                    isBeingDragged={draggedPoi?.day === dayObj.day && draggedPoi?.index === poiIdx}
                                    isRemoving={removingPoi?.day === dayObj.day && (removingPoi?.id === p?.id || removingPoi?.index === poiIdx)}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const isUpperHalf = e.clientY < rect.top + rect.height / 2;
                                      const targetIdx = isUpperHalf ? poiIdx : poiIdx + 1;
                                      setActiveDropTarget({ day: dayObj.day, index: targetIdx });
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const isUpperHalf = e.clientY < rect.top + rect.height / 2;
                                      const targetIdx = isUpperHalf ? poiIdx : poiIdx + 1;
                                      handleDrop(e, dayObj.day, targetIdx);
                                    }}
                                    onDragStart={(e) => {
                                      startCustomDragPreview(e, {
                                        name: p?.name || t('sidebar.scheduled_place_fallback'),
                                        category: p?.category,
                                        duration_mins: p?.duration_mins,
                                        cost_eur: p?.cost_eur,
                                      });
                                      const poiInfo = {
                                        source: 'route',
                                        day: dayObj.day,
                                        index: poiIdx,
                                        id: p?.id,
                                        poi: p,
                                      };
                                      setDraggedPoi(poiInfo);
                                      const serialized = JSON.stringify(poiInfo);
                                      if (typeof window !== 'undefined') {
                                        (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = poiInfo;
                                      }
                                      resetPaladioDropHandled();
                                      e.dataTransfer.setData('application/paladio-poi', serialized);
                                      e.dataTransfer.setData('text/plain', serialized);
                                      e.dataTransfer.effectAllowed = 'copyMove';
                                    }}
                                    onDragEnd={() => {
                                      cleanupCustomDragPreview();
                                      const handled = isPaladioDropHandled();
                                      const curDay = dayObj.day;
                                      const curIdx = poiIdx;
                                      const curId = p?.id;
                                      const curName = p?.name;

                                      if (!handled) {
                                        // Dropped outside itinerary: trigger smooth removal animation
                                        setRemovingPoi({ day: curDay, index: curIdx, id: curId });
                                        window.setTimeout(() => {
                                          handleRemoveStopFromRoute(curDay, curIdx, curId, curName);
                                          setRemovingPoi(null);
                                        }, 280);
                                      }

                                      setDraggedPoi(null);
                                      setActiveDropTarget(null);
                                      if (typeof window !== 'undefined') {
                                        (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = null;
                                      }
                                      resetPaladioDropHandled();
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
                                    onRemove={
                                      isEditMode
                                        ? (e) => {
                                            e.stopPropagation();
                                            handleRemoveStopFromRoute(dayObj.day, poiIdx, p?.id, p?.name);
                                          }
                                        : undefined
                                    }
                                    onUpdateTimes={(newStart, newEnd) =>
                                      handleUpdateStopTimes(dayObj.day, poiIdx, newStart, newEnd)
                                    }
                                    timeConflict={isEditMode ? getStopConflict(path, poiIdx) : null}
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
                                          name: p?.name || t('poi_detail.waypoint_fallback'),
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
                              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                              setActiveDropTarget({ day: dayObj.day, index: path.length });
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDrop(e, dayObj.day, path.length);
                            }}
                            style={{
                              height:
                                activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length
                                  ? '38px'
                                  : '14px',
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
                                {t('sidebar.drop_add_day_upper', { day: dayObj.day })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* VIEW B: SEARCH TAB CONTENT (Exact Match to User Reference Layout) */}
                <div
                  className={activeTab === 'search' ? 'animate-tab-pane' : undefined}
                  style={
                    activeTab === 'search'
                      ? {
                          display: 'flex',
                          flexDirection: 'column',
                          flex: 1,
                          minHeight: 0,
                        }
                      : isExternalPoiDragging
                      ? {
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'fixed',
                          left: '-9999px',
                          top: 0,
                          width: '360px',
                          opacity: 0,
                          pointerEvents: 'none',
                        }
                      : {
                          display: 'none',
                          flexDirection: 'column',
                          flex: 1,
                          minHeight: 0,
                        }
                  }
                >
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 1. Top Options Pill Dropdowns & Add POI button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%', overflow: 'visible' }}>
                      <CustomDropdown
                        ariaLabel={t('sidebar.sort_order_aria')}
                        value={sortOption}
                        onChange={(val) => setSortOption(val as any)}
                        options={[
                          { value: 'best', label: t('sidebar.sort_recommended') },
                          { value: 'rating', label: t('sidebar.sort_top_rated') },
                          { value: 'cost', label: t('sidebar.sort_lowest_cost') },
                          { value: 'name', label: t('sidebar.sort_alphabetical') },
                        ]}
                        testId="sort-order-dropdown"
                      />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setIsAddPoiModalOpen(true)}
                          data-tooltip={t('sidebar.add_new_poi_tooltip')}
                          data-tooltip-position="top"
                          aria-label={t('sidebar.add_new_poi_tooltip')}
                          data-testid="add-new-poi-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            background: 'var(--color-surface-card, #FFFFFF)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '9999px',
                            color: 'var(--color-accent-primary, #0F4C5C)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
                            transition: 'all 0.15s ease',
                            flexShrink: 0,
                          }}
                        >
                          <PlusIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
                          <span>{t('sidebar.add_poi_btn')}</span>
                        </button>
                      </div>
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              executeSearch(searchQuery, activeCategory);
                            }
                          }}
                          placeholder={t('sidebar.search_placeholder', { city: destinationCity || t('sidebar.city_fallback_lower') })}
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
                            aria-label={t('sidebar.clear_search_aria')}
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
                          cursor: 'pointer',
                          transition: 'all 0.16s ease',
                          boxShadow: '0 2px 6px rgba(15, 76, 92, 0.25)',
                        }}
                      >
                        {isLoadingSearch ? (
                          <Spinner size={14} color="#FFFFFF" />
                        ) : (
                          <SearchIcon size={14} color="#FFFFFF" />
                        )}
                        <span>{isLoadingSearch ? t('sidebar.searching_btn') : t('sidebar.search_btn')}</span>
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

                      {/* Custom POIs toggle button */}
                      <button
                        type="button"
                        data-testid="toggle-custom-pois-btn"
                        aria-pressed={onlyCustomPois}
                        onClick={() => {
                          const nextState = !onlyCustomPois;
                          setOnlyCustomPois(nextState);
                          if (nextState) {
                            executeSearch(searchQuery, activeCategory, 0, false, true);
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '9999px',
                          border: `1px solid ${onlyCustomPois ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)'}`,
                          background: onlyCustomPois ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-surface-card, #FFFFFF)',
                          color: onlyCustomPois ? '#FFFFFF' : 'var(--color-text-primary)',
                          fontSize: '11.5px',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: onlyCustomPois ? '0 2px 8px rgba(15, 76, 92, 0.25)' : 'var(--shadow-sm)',
                          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                          marginLeft: 'auto',
                        }}
                        data-tooltip={onlyCustomPois ? t('sidebar.custom_only_tooltip_on') : t('sidebar.custom_only_tooltip_off')}
                        data-tooltip-position="top"
                        aria-label={onlyCustomPois ? t('sidebar.custom_only_tooltip_on') : t('sidebar.custom_only_tooltip_off')}
                      >
                        <span>{onlyCustomPois ? t('sidebar.custom_only_btn') : t('sidebar.all_pois_btn')}</span>
                      </button>
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
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {searchQuery
                          ? t('sidebar.results_for', { query: searchQuery })
                          : activeCategory === 'all'
                          ? t('sidebar.recommended_for_you')
                          : t('sidebar.top_category_in_city', {
                              category: t(`sidebar.active_cat_${activeCategory}`),
                              city: destinationCity || t('sidebar.city_fallback_upper'),
                            })}
                      </span>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                        {isPoiDatabaseEmpty
                          ? t('sidebar.zero_places_upper')
                          : filteredSearchResults.length === 0
                          ? t('sidebar.zero_places_upper')
                          : searchData?.total != null
                          ? searchData.total > 1000
                            ? t('sidebar.plus_places_upper', { count: Math.floor(searchData.total / 500) * 500 })
                            : t('sidebar.places_upper_count', { count: searchData.total })
                          : t('sidebar.places_upper_count', { count: filteredSearchResults.length })}
                      </span>
                    </div>

                    {/* POI Database Download Card */}
                    {(isPoiDatabaseEmpty || (isDownloadingPois && (searchData?.city_total_pois || 0) === 0)) && (
                      <div
                        data-testid="poi-database-download-card"
                        style={{
                          background: 'var(--color-surface-subtle, #FAFAFA)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '14px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          marginTop: '6px',
                          marginBottom: '4px',
                          boxShadow: 'var(--shadow-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: isDownloadingPois ? 'var(--color-accent-gold-soft)' : 'var(--color-surface-card)',
                              border: `1px solid ${isDownloadingPois ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isDownloadingPois ? (
                              <Spinner size={18} color="var(--color-accent-gold)" />
                            ) : (
                              <SearchIcon size={18} color="var(--color-accent-primary)" />
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {isDownloadingPois ? t('sidebar.downloading_db_title') : t('sidebar.db_required_title')}
                              </span>
                              <span
                                className="font-mono"
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: isDownloadingPois ? 'var(--color-accent-gold-soft)' : 'var(--color-surface-page)',
                                  color: isDownloadingPois ? 'var(--color-accent-gold)' : 'var(--color-text-muted)',
                                  fontWeight: 600,
                                }}
                              >
                                {isDownloadingPois ? t('sidebar.downloading_badge_upper') : t('sidebar.not_installed_badge_upper')}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                              {isDownloadingPois
                                ? t('sidebar.downloading_db_desc', { city: destinationCity || t('sidebar.this_city') })
                                : t('sidebar.db_required_desc', { city: destinationCity || t('sidebar.this_city') })}
                            </p>
                          </div>
                        </div>

                        {!isDownloadingPois ? (
                          <button
                            type="button"
                            data-testid="download-pois-database-btn"
                            onClick={handleDownloadPoiDatabase}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'var(--color-accent-primary)',
                              color: '#FFFFFF',
                              fontSize: '13px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.16s ease',
                              boxShadow: '0 2px 6px rgba(15, 76, 92, 0.25)',
                            }}
                          >
                            <SearchIcon size={14} color="#FFFFFF" />
                            <span>{t('sidebar.download_db_btn')}</span>
                          </button>
                        ) : (
                          <div
                            data-testid="download-pois-spinner"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px 16px',
                              borderRadius: '8px',
                              background: 'var(--color-surface-card)',
                              border: '1px solid var(--color-border)',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--color-accent-gold)',
                            }}
                          >
                            <Spinner size={14} color="var(--color-accent-gold)" />
                            <span>{t('sidebar.downloading_db_inline', { city: destinationCity || t('sidebar.city_fallback_lower') })}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Results List: Cards Styled like Reference Flight Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filteredSearchResults.map((poi) => {
                        const isAnchorRecommendation =
                          poi.match_type === 'trip_hotel_base' || poi.match_type === 'trip_airport_gateway';
                        return (
                        <div
                          key={poi.id}
                          data-testid={`poi-card-${poi.id}`}
                          data-anchor-recommendation={isAnchorRecommendation ? 'true' : 'false'}
                          draggable={true}
                          onDragStart={(e) => {
                            startCustomDragPreview(e, poi);
                            const payload = {
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
                            };
                            const serialized = JSON.stringify(payload);
                            if (typeof window !== 'undefined') {
                              (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = payload;
                              (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = payload;
                            }
                            e.dataTransfer.setData('application/paladio-poi', serialized);
                            e.dataTransfer.setData('text/plain', serialized);
                            e.dataTransfer.effectAllowed = 'copyMove';

                            // Defer switching to Route tab by one animation frame so the browser finishes
                            // initializing the native HTML5 drag session before this container moves offscreen.
                            window.requestAnimationFrame(() => {
                              if ((window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi) {
                                window.dispatchEvent(new CustomEvent('paladio:switch-to-route'));
                              }
                            });
                          }}
                          onDragEnd={() => {
                            cleanupCustomDragPreview();
                            if (typeof window !== 'undefined') {
                              const win = window as unknown as {
                                __paladioActivePoi?: unknown;
                                __paladioActiveSearchPoi?: unknown;
                              };
                              win.__paladioActivePoi = null;
                              win.__paladioActiveSearchPoi = null;
                            }
                            resetPaladioDropHandled();
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
                            border: isAnchorRecommendation
                              ? '2px solid var(--color-accent-primary, #0F4C5C)'
                              : '1px solid var(--color-border)',
                            borderRadius: '16px',
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: isAnchorRecommendation
                              ? '0 0 0 2px rgba(15, 76, 92, 0.12), var(--shadow-sm)'
                              : 'var(--shadow-sm)',
                            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 76, 92, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = isAnchorRecommendation
                              ? '0 0 0 2px rgba(15, 76, 92, 0.12), var(--shadow-sm)'
                              : 'var(--shadow-sm)';
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
                                  {(poi.category
                                    ? (() => {
                                        const classified = classifyPoiCategory(poi.category || undefined, poi.name || undefined);
                                        return locale !== 'en' && classified.type !== 'general'
                                          ? getPoiCategoryLabel(classified, t)
                                          : poi.category;
                                      })()
                                    : t('sidebar.default_attraction'))}{' '}
                                  · {t('sidebar.duration_mins_long', { mins: poi.duration_mins })}
                                </div>
                              </div>
                            </div>

                            {/* Price Tag & Bookmark */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              {!isAnchorRecommendation && (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    {poi.cost_eur === 0 ? t('sidebar.free_upper') : `${currencySymbol}${poi.cost_eur}`}
                                  </div>
                                  {poi.cost_eur > 0 && (
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{t('sidebar.per_pax_short')}</div>
                                  )}
                                </div>
                              )}
                              {isCustomPoi(poi) && (
                                <button
                                  type="button"
                                  data-testid={`delete-custom-poi-${poi.id}`}
                                  data-tooltip={t('sidebar.delete_manual_poi')}
                                  data-tooltip-position="left"
                                  aria-label={t('sidebar.delete_manual_poi')}
                                  disabled={deletingPoiId === poi.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePoi(poi);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    padding: '5px 7px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: deletingPoiId === poi.id ? 'not-allowed' : 'pointer',
                                    color: 'var(--color-danger, #EF4444)',
                                    transition: 'all 0.15s ease',
                                    opacity: deletingPoiId === poi.id ? 0.5 : 1,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingPoiId !== poi.id) {
                                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                      e.currentTarget.style.borderColor = 'var(--color-danger, #EF4444)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.borderColor = 'var(--color-border)';
                                  }}
                                >
                                  <TrashIcon size={13} color="var(--color-danger, #EF4444)" />
                                </button>
                              )}
                              <button
                                type="button"
                                data-testid={`search-poi-bookmark-${poi.id}`}
                                data-tooltip={isPoiSaved(poi.id) ? t('sidebar.saved_in_collections') : t('sidebar.save_to_collections')}
                                data-tooltip-position="left"
                                aria-label={isPoiSaved(poi.id) ? t('sidebar.saved_in_collections') : t('sidebar.save_to_collections')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setMenuAnchorRect(rect);
                                  setModalPoi((prev) =>
                                    prev?.id === poi.id
                                      ? null
                                      : {
                                          id: poi.id,
                                          name: poi.name,
                                          category: poi.category,
                                          cost_eur: poi.cost_eur,
                                          duration_mins: poi.duration_mins,
                                          photo_url: poi.photo_url || poi.thumbnail_url,
                                          thumbnail_url: poi.thumbnail_url || poi.photo_url,
                                        }
                                  );
                                }}
                                style={{
                                  background: isPoiSaved(poi.id) ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                                  border: isPoiSaved(poi.id) ? '1px solid #F59E0B' : '1px solid var(--color-border)',
                                  borderRadius: '8px',
                                  padding: '5px 7px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: isPoiSaved(poi.id) ? '#F59E0B' : 'var(--color-text-muted)',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <BookmarkIcon size={13} fill={isPoiSaved(poi.id) ? '#F59E0B' : 'none'} />
                              </button>
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
                              <span>{t('sidebar.suggested_stay', { mins: poi.duration_mins })}</span>
                            </div>
                            {!isAnchorRecommendation && poi.similarity > 0 ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  color: 'var(--color-success)',
                                }}
                              >
                                {t('sidebar.affinity_pct_upper', { pct: Math.round(poi.similarity * 100) })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        );
                      })}

                      {filteredSearchResults.length > 0 &&
                        !isPoiDatabaseEmpty &&
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
                              <span>{isLoadingMore ? t('sidebar.loading_more_places') : t('sidebar.load_more_places')}</span>
                            </button>
                          </div>
                        )}

                      {filteredSearchResults.length === 0 && !isPoiDatabaseEmpty && hasSearched && !isLoadingSearch && (
                        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-text-muted)' }}>
                          {t('sidebar.no_matching_places')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* VIEW C: TRANSIT TAB CONTENT */}
                {activeTab === 'transit' && (
                  <div
                    className="animate-tab-pane"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                    }}
                  >
                    <TripTransitTab
                      tripId={tripId}
                      tripStartDate={tripStartDate}
                      destinationCity={destinationCity}
                      selectedDay={selectedDay}
                      tripDays={days.map((d: DayOutput) => ({
                        day_number: d.day,
                        pois: (d.itinerary?.path || [])
                          .filter((s: ScheduledPoi) => Boolean(s?.poi))
                          .map((s: ScheduledPoi, sIdx: number) => {
                            const p = s.poi;
                            const lat = p.location?.latitude ?? (p as unknown as { lat?: number }).lat ?? 0;
                            const lng = p.location?.longitude ?? (p as unknown as { lng?: number }).lng ?? 0;
                            return {
                              id: p.id || `poi-${d.day}-${sIdx}`,
                              name: p.name || t('poi_detail.waypoint_fallback'),
                              lat,
                              lng,
                              category: p.category || 'attraction',
                            };
                          }),
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
                  </div>
                )}

                {/* VIEW WEATHER: WEATHER TAB CONTENT */}
                {activeTab === 'weather' && (
                  <div
                    className="animate-tab-pane"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                    }}
                  >
                    <TripWeatherTab
                      destinationCity={destinationCity || ''}
                      tripStartDate={tripStartDate}
                      tripEndDate={tripEndDate}
                      selectedDay={selectedDay}
                      onSelectDay={onSelectDay}
                      coordinates={
                        hotelAnchor
                          ? { lat: hotelAnchor.lat, lng: hotelAnchor.lng }
                          : airportAnchor
                          ? { lat: airportAnchor.lat, lng: airportAnchor.lng }
                          : days?.[0]?.itinerary?.path?.[0]?.poi?.location
                          ? {
                              lat: days[0].itinerary.path[0].poi.location.latitude,
                              lng: days[0].itinerary.path[0].poi.location.longitude,
                            }
                          : undefined
                      }
                      tripDaysCount={days.length || 7}
                    />
                  </div>
                )}

                {/* VIEW D: COLLECTIONS TAB CONTENT */}
                <div
                  className={activeTab === 'saved' ? 'animate-tab-pane' : undefined}
                  style={
                    activeTab === 'saved'
                      ? {
                          display: 'flex',
                          flexDirection: 'column',
                          flex: 1,
                          minHeight: 0,
                        }
                      : isExternalPoiDragging
                      ? {
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'fixed',
                          left: '-9999px',
                          top: 0,
                          width: '360px',
                          opacity: 0,
                          pointerEvents: 'none',
                        }
                      : {
                          display: 'none',
                          flexDirection: 'column',
                          flex: 1,
                          minHeight: 0,
                        }
                  }
                >
                  <CollectionsTab
                    tripId={tripId || ''}
                    destinationCity={destinationCity}
                    onPlaceClick={onPlaceClick}
                    onInspectPoi={onInspectPoi}
                    onAddToDay={onAddToDay}
                    tripDaysCount={days.length || 7}
                    currencySymbol={currencySymbol}
                  />
                </div>

                {/* VIEW E: AGENT TAB CONTENT */}
                {(activeTab === 'agent' || agentTabVisited) && (
                  <div
                    className={activeTab === 'agent' ? 'animate-tab-pane' : undefined}
                    style={{
                      display: activeTab === 'agent' ? 'flex' : 'none',
                      flexDirection: 'column',
                      flex: 1,
                      height: '100%',
                      overflow: 'hidden',
                    }}
                  >
                    <AgentTab
                      tripId={tripId || ''}
                      uiContext={uiContext}
                      onTripUpdated={onTripUpdated}
                      onInspectPoi={onInspectPoi}
                    />
                  </div>
                )}
              </div>
        </aside>

        {/* External arrow button outside the menu to close it */}
        <button
          type="button"
          data-testid="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label={t('sidebar.close_sidebar')}
          data-tooltip={t('sidebar.close_sidebar')}
          data-tooltip-position="right"
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

      {modalPoi && (
        <SaveToCollectionMenu
          isOpen={Boolean(modalPoi)}
          onClose={() => {
            setModalPoi(null);
            setMenuAnchorRect(null);
          }}
          tripId={tripId}
          poi={modalPoi}
          anchorRect={menuAnchorRect}
          align="right"
        />
      )}

      <AddPoiModal
        isOpen={isAddPoiModalOpen}
        onClose={() => setIsAddPoiModalOpen(false)}
        city={destinationCity}
        defaultLat={hotelAnchor?.lat ?? airportAnchor?.lat ?? searchData?.results?.[0]?.lat}
        defaultLng={hotelAnchor?.lng ?? airportAnchor?.lng ?? searchData?.results?.[0]?.lng}
        onPoiCreated={handlePoiCreated}
      />

      <Modal
        isOpen={Boolean(pendingDrop)}
        variant="warning"
        title={t('sidebar.anchor_reorder_title')}
        message={
          pendingDrop
            ? t('sidebar.anchor_reorder_msg', {
                name: pendingDrop.poiName,
                position: pendingDrop.position === 'first' ? t('sidebar.position_first_stop') : t('sidebar.position_last_stop'),
                day: pendingDrop.targetDayNum,
              })
            : t('sidebar.confirm_reorder_fallback')
        }
        confirmText={t('sidebar.proceed_upper')}
        cancelText={t('sidebar.cancel_upper')}
        onConfirm={() => {
          if (pendingDrop) {
            executeDrop(pendingDrop.payload, pendingDrop.targetDayNum, pendingDrop.targetIdx);
            setPendingDrop(null);
          }
        }}
        onCancel={() => setPendingDrop(null)}
      />
    </div>
  );
}
