"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DayOutput, OptimizationResult, ScheduledPoi, PoiDetail } from '@/types/domain';
import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { PoiCategoryIcon, PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { MinimalistPoiCard } from './MinimalistPoiCard';
import { TransitRecommendationCard, TransitLegView } from '@/components/TransitLegView';
import { EmptyState } from '@/components/EmptyState';
import { getApiBaseUrl } from '@/utils/api';
import { notify } from '@/utils/notify';
import { getScheduledPoiTimes, getPoiOpeningHours } from '@/utils/date';
import { useTrips } from '@/hooks/useTrips';
import {
  SearchIcon,
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  InfoIcon,
  GripVerticalIcon,
  CloseIcon,
  Spinner,
  LockIcon,
  UnlockIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  WalkIcon,
  TransitIcon,
  PlusIcon,
  EditIcon,
  CpuIcon,
  LayersViewIcon,
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
  match_type?: string;
  description?: string;
}

interface PoiSearchResponseData {
  city: string;
  query: string;
  search_type: string;
  exact_match_found: boolean;
  message?: string | null;
  exact_match?: PoiApiItem | null;
  results: PoiApiItem[];
}

export interface TripUnifiedSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  tripId?: string;
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
  onInspectPoi?: (poiId: string) => void;
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
}

export type MainTabType = 'route' | 'search' | 'saved';

const PROJECT_CATEGORIES: { id: string; label: string; iconType: PoiCategoryType }[] = [
  { id: 'all', label: 'All', iconType: 'general' },
  { id: 'attraction', label: 'Attractions', iconType: 'attraction' },
  { id: 'museum', label: 'Museums', iconType: 'museum' },
  { id: 'restaurant', label: 'Restaurants', iconType: 'restaurant' },
  { id: 'cafe', label: 'Cafés', iconType: 'cafe' },
  { id: 'landmark', label: 'Monuments', iconType: 'landmark' },
  { id: 'park', label: 'Parks', iconType: 'park' },
  { id: 'transit', label: 'Transit', iconType: 'transit' },
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
            zIndex: 1200,
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

export function TripUnifiedSidebar({
  isOpen,
  onToggle,
  tripId,
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
  onToggleEditMode,
  onReoptimizeDay,
  isReoptimizing = false,
  onToggleTransitMode,
}: TripUnifiedSidebarProps) {
  // Primary Tabs State
  const [activeTab, setActiveTab] = useState<MainTabType>('route');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Search Tab State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchData, setSearchData] = useState<PoiSearchResponseData | null>(null);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Filters state
  const [targetDay, setTargetDay] = useState<number>(() => {
    if (typeof selectedDay === 'number') return selectedDay;
    return initialDay || 1;
  });
  const [costFilter, setCostFilter] = useState<'any' | 'free' | 'under15' | 'under30'>('any');
  const [durationFilter, setDurationFilter] = useState<'any' | 'quick' | 'medium' | 'long'>('any');
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

  // Sync selectedDay with targetDay
  const [prevSelectedDay, setPrevSelectedDay] = useState(selectedDay);
  if (selectedDay !== prevSelectedDay) {
    setPrevSelectedDay(selectedDay);
    if (typeof selectedDay === 'number') {
      setTargetDay(selectedDay);
    }
  }

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

  // Close overflow menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  // Execute Dynamic POI Search
  const executeSearch = useCallback(
    async (queryText: string, cat?: string) => {
      const q = queryText.trim();
      const currentCat = cat !== undefined ? cat : activeCategory;
      const isCategoryBrowse = !q && currentCat && currentCat !== 'all';

      if (!q && !isCategoryBrowse) {
        setSearchData(null);
        setHasSearched(false);
        setIsLoadingSearch(false);
        if (onCategoryPoisChange) onCategoryPoisChange([]);
        return;
      }

      setIsLoadingSearch(true);
      setSearchErrorMessage(null);
      setHasSearched(true);

      try {
        const catParam = currentCat && currentCat !== 'all' ? `&category=${encodeURIComponent(currentCat)}` : '';
        const tripParam = tripId ? `&trip_id=${encodeURIComponent(tripId)}` : '';
        const baseUrl = getApiBaseUrl();
        const limit = isCategoryBrowse ? 60 : 25;
        const res = await fetch(
          `${baseUrl}/pois/search?city=${encodeURIComponent(
            destinationCity
          )}&query=${encodeURIComponent(q)}${catParam}${tripParam}&limit=${limit}`
        );
        if (!res.ok) {
          throw new Error(`Search failed (HTTP ${res.status})`);
        }
        const data: PoiSearchResponseData = await res.json();

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

        setSearchData(data);
        if (onCategoryPoisChange) {
          onCategoryPoisChange(data.results || []);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error executing POI search';
        setSearchErrorMessage(msg);
      } finally {
        setIsLoadingSearch(false);
      }
    },
    [destinationCity, tripId, hotelAnchor, airportAnchor, activeCategory, onCategoryPoisChange]
  );

  // Sync external categoryFilter
  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (categoryFilter !== prevCategoryFilter) {
    setPrevCategoryFilter(categoryFilter);
    if (categoryFilter) {
      setActiveCategory(categoryFilter.toLowerCase());
    }
  }

  // Debounced auto-search
  useEffect(() => {
    const delay = searchQuery.trim() ? 320 : 0;
    const timer = setTimeout(() => {
      if (!searchQuery.trim()) {
        if (activeCategory && activeCategory !== 'all') {
          executeSearch('', activeCategory);
        } else {
          setSearchData(null);
          setHasSearched(false);
          if (onCategoryPoisChange) onCategoryPoisChange([]);
        }
      } else {
        executeSearch(searchQuery, activeCategory);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [searchQuery, activeCategory, executeSearch, onCategoryPoisChange]);

  const handleCategoryClick = (catId: string) => {
    const nextCat = activeCategory === catId ? 'all' : catId;
    setActiveCategory(nextCat);
    setSearchQuery('');
    if (onCategoryFilterChange) {
      onCategoryFilterChange(nextCat === 'all' ? null : (nextCat as PoiCategoryType));
    }
    if (nextCat === 'all') {
      setSearchData(null);
      setHasSearched(false);
      if (onCategoryPoisChange) onCategoryPoisChange([]);
    } else {
      executeSearch('', nextCat);
    }
  };

  // Filtered & Sorted Search Results
  const filteredSearchResults = useMemo(() => {
    if (!searchData?.results) return [];
    let list = [...searchData.results];

    // Cost filter
    if (costFilter === 'free') list = list.filter((p) => p.cost_eur === 0);
    else if (costFilter === 'under15') list = list.filter((p) => p.cost_eur <= 15);
    else if (costFilter === 'under30') list = list.filter((p) => p.cost_eur <= 30);

    // Duration filter
    if (durationFilter === 'quick') list = list.filter((p) => p.duration_mins <= 45);
    else if (durationFilter === 'medium') list = list.filter((p) => p.duration_mins > 45 && p.duration_mins <= 120);
    else if (durationFilter === 'long') list = list.filter((p) => p.duration_mins > 120);

    // Sort
    if (sortOption === 'cost') list.sort((a, b) => a.cost_eur - b.cost_eur);
    else if (sortOption === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortOption === 'rating' || sortOption === 'best') list.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    return list;
  }, [searchData, costFilter, durationFilter, sortOption]);

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
      } else if (payload.source === 'search' || payload.source === 'inspector') {
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

  const handleQuickAddPoi = (poiItem: PoiApiItem, dayNum: number) => {
    if (!itinerary || !onItineraryUpdate) {
      if (onAddToDay) {
        onAddToDay(dayNum, {
          id: poiItem.id,
          name: poiItem.name,
          city: destinationCity,
          category: poiItem.category,
          lat: poiItem.lat,
          lng: poiItem.lng,
          duration_mins: poiItem.duration_mins,
          cost_eur: poiItem.cost_eur,
          cost_is_estimated: false,
          scoring: { rating: 4.5 },
          photos: [],
        });
      }
      return;
    }
    const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
    const targetDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === dayNum);
    if (!targetDayObj) return;
    if (!targetDayObj.itinerary) targetDayObj.itinerary = { path: [] };

    // Insert before the last stop (destination hotel/airport) if one exists
    const pathLen = targetDayObj.itinerary.path.length;
    const insertIdx = pathLen > 1 ? pathLen - 1 : pathLen;

    targetDayObj.itinerary.path.splice(insertIdx, 0, {
      poi: {
        id: poiItem.id,
        name: poiItem.name,
        city: destinationCity,
        category: poiItem.category,
        duration_mins: poiItem.duration_mins,
        cost_eur: poiItem.cost_eur,
        location: {
          latitude: poiItem.lat,
          longitude: poiItem.lng,
        },
      },
    });

    onItineraryUpdate(clonedItin);
    notify.success('Place Added', `Added ${poiItem.name} to Day ${dayNum}`);
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
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open Trip Command Panel"
          title="Open Trip Command Panel"
          style={{
            pointerEvents: 'auto',
            alignSelf: 'flex-start',
            marginTop: '12px',
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-accent-primary)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <SearchIcon size={18} />
        </button>
      )}

      {/* Main Single Floating Card Container */}
      {isOpen && (
        <aside
          data-testid="trip-unified-sidebar"
          style={{
            pointerEvents: 'auto',
            width: 'min(520px, calc(100vw - 32px))',
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
            animation: 'fadeInUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
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

                {/* Right Options Menu Button */}
                <div style={{ position: 'relative' }} ref={menuRef}>
                  <button
                    type="button"
                    aria-label="Trip options menu"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-full)',
                      border: 'none',
                      background: isMenuOpen ? 'rgba(0,0,0,0.06)' : 'transparent',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {/* Popover Options Menu */}
                  {isMenuOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '38px',
                        right: '0px',
                        width: '210px',
                        background: 'var(--color-surface-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        padding: '6px',
                        zIndex: 200,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      {onToggleEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            onToggleEditMode();
                            setIsMenuOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: isEditMode ? 'rgba(15, 76, 92, 0.1)' : 'transparent',
                            color: isEditMode ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <EditIcon size={14} color="currentColor" />
                          <span>{isEditMode ? 'Finish Editing' : 'Reorder / Edit Mode'}</span>
                        </button>
                      )}

                      {onReoptimizeDay && (
                        <button
                          type="button"
                          onClick={() => {
                            onReoptimizeDay();
                            setIsMenuOpen(false);
                          }}
                          disabled={isReoptimizing}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--color-text-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            textAlign: 'left',
                            cursor: isReoptimizing ? 'not-allowed' : 'pointer',
                            opacity: isReoptimizing ? 0.6 : 1,
                          }}
                        >
                          {isReoptimizing ? <Spinner size={14} color="currentColor" /> : <CpuIcon size={14} color="currentColor" />}
                          <span>Reoptimize Route</span>
                        </button>
                      )}

                      {onToggleTransitMode && (
                        <button
                          type="button"
                          onClick={() => {
                            onToggleTransitMode();
                            setIsMenuOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--color-text-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <TransitIcon size={14} color="currentColor" />
                          <span>Transit: {transitMode.toUpperCase()}</span>
                        </button>
                      )}

                      <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />

                      <button
                        type="button"
                        onClick={() => {
                          onToggle();
                          setIsMenuOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--color-text-muted)',
                          fontSize: '12px',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <CloseIcon size={14} color="currentColor" />
                        <span>Collapse Panel</span>
                      </button>
                    </div>
                  )}
                </div>
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
                ) : (
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
              )}

              {/* Main Content Area */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
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
                                          borderLeft: '2px dotted var(--color-border)',
                                          opacity: 0.8,
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
                                    onClick={() => {
                                      if (p?.id && onInspectPoi) onInspectPoi(p.id);
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                      <CustomDropdown
                        ariaLabel="Target Day"
                        value={targetDay}
                        onChange={(val) => setTargetDay(Number(val))}
                        options={days.map((d) => ({
                          value: d.day,
                          label: `Add to Day ${d.day}`,
                        }))}
                        testId="target-day-dropdown"
                      />

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

                      <span
                        style={{
                          padding: '5px 10px',
                          borderRadius: '9999px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-card)',
                          color: 'var(--color-text-muted)',
                          fontSize: '11px',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Radius: 5 km
                      </span>
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

                      {/* Location / Destination Anchor Context */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 4px',
                          fontSize: '11px',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Location:</span>
                          <span>{destinationCity || 'Trip City'}</span>
                        </div>
                        {hotelAnchor && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--color-accent-teal-mid)' }}>Near Hotel Base</span>
                          </div>
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
                        overflowX: 'auto',
                        scrollbarWidth: 'none',
                        paddingBottom: '2px',
                      }}
                    >
                      {/* Price filter chip */}
                      <CustomDropdown
                        ariaLabel="Filter by Price"
                        value={costFilter}
                        onChange={(val) => setCostFilter(val as any)}
                        options={[
                          { value: 'any', label: 'Price: Any' },
                          { value: 'free', label: 'Free Only' },
                          { value: 'under15', label: '< €15' },
                          { value: 'under30', label: '< €30' },
                        ]}
                        testId="price-filter-dropdown"
                      />

                      {/* Duration filter chip */}
                      <CustomDropdown
                        ariaLabel="Filter by Duration"
                        value={durationFilter}
                        onChange={(val) => setDurationFilter(val as any)}
                        options={[
                          { value: 'any', label: 'Duration: Any' },
                          { value: 'quick', label: '< 45 mins' },
                          { value: 'medium', label: '1 - 2 hours' },
                          { value: 'long', label: '> 2 hours' },
                        ]}
                        testId="duration-filter-dropdown"
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
                          {searchQuery ? `Results for "${searchQuery}"` : `Top Places in ${destinationCity || 'City'}`}
                        </span>
                        <InfoIcon size={13} color="var(--color-text-muted)" />
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                        {filteredSearchResults.length} PLACES
                      </span>
                    </div>

                    {/* 5. Results List: Cards Styled like Reference Flight Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filteredSearchResults.map((poi) => {
                        const isSaved = savedPoiIds.has(poi.id);

                        return (
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
                              cursor: 'grab',
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
                            {/* Card Top Row: Badge, Title & Top-Right Action Button */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    cursor: 'grab',
                                    color: 'var(--color-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '2px',
                                  }}
                                  title="Drag to add to route"
                                >
                                  <GripVerticalIcon size={14} color="currentColor" />
                                </div>
                                <div
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    background: 'var(--color-surface-subtle, #F5EFEB)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--color-accent-primary)',
                                    flexShrink: 0,
                                  }}
                                >
                                  <PoiCategoryIcon category={poi.category} name={poi.name} size={18} />
                                </div>
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

                              {/* Price Tag & Action Pill Button */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    {poi.cost_eur === 0 ? 'FREE' : `€${poi.cost_eur}`}
                                  </div>
                                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>/pax</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleQuickAddPoi(poi, targetDay)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: 'var(--color-accent-primary)',
                                    color: '#FFFFFF',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease',
                                    boxShadow: '0 2px 6px rgba(15, 76, 92, 0.2)',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                  Add to Day {targetDay}
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
                                  {Math.round(poi.similarity * 100)}% MATCH
                                </span>
                              )}
                            </div>

                            {/* Card Bottom Row: Action Links */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                color: 'var(--color-accent-teal-mid)',
                                fontWeight: 600,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                  type="button"
                                  onClick={() => onInspectPoi && onInspectPoi(poi.id)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--color-accent-teal-mid)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPlaceClick &&
                                    onPlaceClick({
                                      id: poi.id,
                                      name: poi.name,
                                      lat: poi.lat,
                                      lng: poi.lng,
                                      category: poi.category,
                                      durationMins: poi.duration_mins,
                                      costEur: poi.cost_eur,
                                    })
                                  }
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--color-accent-teal-mid)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                >
                                  Focus Map
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleSavePoi(poi.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: isSaved ? 'var(--color-accent-secondary)' : 'var(--color-text-muted)',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: 0,
                                }}
                              >
                                {isSaved ? 'Saved' : '+ Bookmark'}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {filteredSearchResults.length === 0 && hasSearched && !isLoadingSearch && (
                        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-text-muted)' }}>
                          No matching places found. Try another search query or category filter.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW C: SAVED TAB CONTENT */}
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
                        {Array.from(savedPoiIds).map((id) => (
                          <div
                            key={id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '12px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-surface-card)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>Saved Stop #{id}</span>
                            <button
                              type="button"
                              onClick={() => toggleSavePoi(id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--color-danger)',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
        </aside>
      )}
    </div>
  );
}
