"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { PoiCategoryType } from '@/utils/poiCategory';
import { EmptyState } from '@/components/EmptyState';
import { getApiBaseUrl, fetchCurrentUser } from '@/utils/api';
import { ReticleCompassIllustration } from '@/components/illustrations/TacticalIllustrations';
import { PoiDetail } from '@/types/domain';
import { PoiDetailView } from './PoiDetailView';
import {
  SearchIcon,
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  InfoIcon,
  GripVerticalIcon,
  CloseIcon,
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

export interface TripPlacesSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  city?: string;
  places?: PlaceItem[];
  onPlaceClick?: (place: PlaceItem) => void;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
  onCategoryPoisChange?: (pois: PoiApiItem[]) => void;
  hotelAnchor?: { name: string; lat: number; lng: number };
  airportAnchor?: { name: string; lat: number; lng: number };
  tripId?: string;
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
}

function setGlobalActiveSearchPoi(poiPayload: unknown) {
  if (typeof window !== 'undefined') {
    (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = poiPayload;
  }
}

export function TripPlacesSidebar({
  isOpen,
  onToggle,
  city = 'Madrid',
  onPlaceClick,
  categoryFilter,
  onCategoryFilterChange,
  onCategoryPoisChange,
  hotelAnchor,
  airportAnchor,
  tripId,
  onInspectPoi,
  inspectedPoiId,
  onCloseInspect,
  onAddToDay,
  onFocusFromInspector,
  availableDays,
  initialDay,
}: TripPlacesSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [searchData, setSearchData] = useState<PoiSearchResponseData | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Solid Drag Preview overlay
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const [activeDragPlace, setActiveDragPlace] = useState<{
    name: string;
    category?: string;
    durationMins?: number;
    costEur?: number;
    width: number;
    initialX: number;
    initialY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const activeDragPlaceRef = useRef<typeof activeDragPlace>(null);

  useEffect(() => {
    activeDragPlaceRef.current = activeDragPlace;
  }, [activeDragPlace]);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      if (dragPreviewRef.current && activeDragPlaceRef.current) {
        const left = e.clientX - activeDragPlaceRef.current.offsetX;
        const top = e.clientY - activeDragPlaceRef.current.offsetY;
        dragPreviewRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      }
    };

    const handleGlobalDragEnd = () => {
      setActiveDragPlace(null);
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi;
      }
    };

    window.addEventListener('dragover', handleGlobalDragOver, { capture: true });
    window.addEventListener('dragend', handleGlobalDragEnd, { capture: false });
    window.addEventListener('drop', handleGlobalDragEnd, { capture: false });

    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, { capture: true });
      window.removeEventListener('dragend', handleGlobalDragEnd, { capture: false });
      window.removeEventListener('drop', handleGlobalDragEnd, { capture: false });
    };
  }, []);

  const [recommendedPois, setRecommendedPois] = useState<PoiApiItem[]>([]);
  const [promptSuggestions, setPromptSuggestions] = useState<Array<{ title: string; prompt: string; tag: string }>>([]);

  // Load user taste profile and initial recommendations for city
  useEffect(() => {
    let ignore = false;
    async function loadTasteContext() {
      try {
        const currentUser = await fetchCurrentUser().catch(() => null);
        if (ignore) return;
        const prefs = (currentUser?.preferences || {}) as Record<string, unknown>;
        const tagAffinities = (prefs.tag_affinities || {}) as Record<string, number>;

        const cards: Array<{ title: string; prompt: string; tag: string }> = [];
        if ((tagAffinities['art_culture'] ?? 0.5) >= 0.5) {
          cards.push({
            title: 'Art & Heritage',
            prompt: `Fine art museums and galleries in ${city}`,
            tag: 'CULTURE',
          });
        }
        if ((tagAffinities['food_culinary'] ?? 0.5) >= 0.5) {
          cards.push({
            title: 'Gastronomy & Tapas',
            prompt: `Cozy tapas bars and local wine in ${city}`,
            tag: 'DINING',
          });
        }
        if ((tagAffinities['history_heritage'] ?? 0.5) >= 0.5 || (tagAffinities['architecture'] ?? 0.5) >= 0.5) {
          cards.push({
            title: 'Historic Landmarks',
            prompt: `Historic monuments, palaces, and architecture in ${city}`,
            tag: 'LANDMARKS',
          });
        }
        if ((tagAffinities['scenic_views'] ?? 0.5) >= 0.5 || (tagAffinities['nature_outdoors'] ?? 0.5) >= 0.5) {
          cards.push({
            title: 'Scenic Vistas & Parks',
            prompt: `Scenic viewpoints and botanical parks in ${city}`,
            tag: 'SCENIC',
          });
        }
        if (cards.length < 3) {
          cards.push({
            title: 'Cozy Cafes & Bakeries',
            prompt: `Charming cafes with specialty coffee in ${city}`,
            tag: 'CAFÉ',
          });
        }
        setPromptSuggestions(cards.slice(0, 4));

        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/pois/search?city=${encodeURIComponent(city)}&query=&limit=4`);
        if (res.ok && !ignore) {
          const data: PoiSearchResponseData = await res.json();
          if (Array.isArray(data.results)) {
            setRecommendedPois(data.results);
          }
        }
      } catch (err: unknown) {
        console.debug('Failed to load taste context for sidebar:', err);
      }
    }
    loadTasteContext();
    return () => {
      ignore = true;
    };
  }, [city]);

  // Execute Search against backend
  const executeSearch = useCallback(
    async (queryText: string, cat?: string) => {
      const q = queryText.trim();
      const currentCat = cat !== undefined ? cat : activeCategory;
      const isCategoryBrowse = !q && currentCat && currentCat !== 'all';

      if (!q && !isCategoryBrowse) {
        setSearchData(null);
        setHasSearched(false);
        setIsLoading(false);
        if (onCategoryPoisChange) onCategoryPoisChange([]);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setHasSearched(true);

      try {
        const catParam = currentCat && currentCat !== 'all' ? `&category=${encodeURIComponent(currentCat)}` : '';
        const tripParam = tripId ? `&trip_id=${encodeURIComponent(tripId)}` : '';
        const baseUrl = getApiBaseUrl();
        const limit = isCategoryBrowse ? 100 : 16;
        const res = await fetch(
          `${baseUrl}/pois/search?city=${encodeURIComponent(
            city
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
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [city, tripId, hotelAnchor, airportAnchor, activeCategory, onCategoryPoisChange]
  );

  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (categoryFilter !== prevCategoryFilter) {
    setPrevCategoryFilter(categoryFilter);
    if (categoryFilter) {
      setActiveCategory(categoryFilter.toLowerCase());
      setSearchQuery('');
    } else {
      setActiveCategory('all');
      setSearchData(null);
      setHasSearched(false);
    }
  }

  // Debounced auto-search when query or active category changes
  useEffect(() => {
    const delay = searchQuery.trim() ? 350 : 0;
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

  const handleCategoryChange = (cat: string) => {
    const nextCat = activeCategory === cat ? 'all' : cat;
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

  const getScoreColor = (score: number) => {
    if (score >= 0.75) return '#10b981'; // emerald
    if (score >= 0.6) return '#06b6d4'; // cyan
    return '#f59e0b'; // amber
  };

  const handlePoiDragStart = (e: React.DragEvent, poi: PoiApiItem) => {
    const poiPayload = {
      source: 'search',
      poi: {
        id: poi.id,
        name: poi.name,
        location: {
          latitude: poi.lat,
          longitude: poi.lng,
        },
        category: poi.category,
        duration_mins: poi.duration_mins,
        cost_eur: poi.cost_eur,
      },
    };
    setGlobalActiveSearchPoi(poiPayload);
    e.dataTransfer.setData('application/paladio-poi', JSON.stringify(poiPayload));
    e.dataTransfer.effectAllowed = 'copyMove';

    let blankImg = document.getElementById('paladio-drag-blank-img') as HTMLImageElement | null;
    if (!blankImg || !blankImg.src) {
      blankImg = new Image();
      blankImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
    try {
      e.dataTransfer.setDragImage(blankImg, 0, 0);
    } catch {
      // ignore
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setActiveDragPlace({
      name: poi.name,
      category: poi.category,
      durationMins: poi.duration_mins,
      costEur: poi.cost_eur,
      width: rect.width,
      initialX: e.clientX,
      initialY: e.clientY,
      offsetX,
      offsetY,
    });
  };

  return (
    <>
      <style>{`
        @keyframes radarPulse {
          0% { transform: scale(0.95); opacity: 0.6; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.6; }
        }
        @keyframes searchItemFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmerBar {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Floating Container Anchor on the Right */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          bottom: '16px',
          zIndex: 1000,
          display: 'flex',
          pointerEvents: 'none',
        }}
      >
        {/* Toggle Collapse Button on Left Edge of the sidebar */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse POI Search' : 'Expand POI Search'}
          title={isOpen ? 'Collapse POI Search' : 'Expand POI Search'}
          style={{
            width: '32px',
            height: '36px',
            alignSelf: 'center',
            marginRight: isOpen ? '6px' : '0px',
            background: 'var(--color-surface-card)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px 0 0 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            boxShadow: 'var(--shadow-sm)',
            pointerEvents: 'auto',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.25s ease',
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Panel Body */}
        <aside
          style={{
            width: isOpen ? 'min(380px, calc(100vw - 32px))' : '0px',
            height: '100%',
            background: 'var(--color-surface-card)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 'var(--radius-lg)',
            border: isOpen ? '1px solid var(--color-border)' : 'none',
            boxShadow: isOpen ? 'var(--shadow-lg)' : 'none',
            overflow: 'hidden',
            transition: 'width 0.28s cubic-bezier(0.23, 1, 0.32, 1)',
            pointerEvents: isOpen ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isOpen &&
            (inspectedPoiId ? (
              <PoiDetailView
                poiId={inspectedPoiId}
                onClose={onCloseInspect || (() => {})}
                onAddToDay={onAddToDay}
                onFocusOnMap={onFocusFromInspector}
                availableDays={availableDays}
                initialDay={initialDay}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  width: 'min(380px, calc(100vw - 32px))',
                  minWidth: 0,
                }}
              >
              {/* Header: Title & City Tag */}
              <div
                style={{
                  padding: '14px 16px 10px 16px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: 'rgba(15, 76, 92, 0.15)',
                        color: 'var(--color-accent-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                      }}
                    >
                      <SearchIcon size={13} color="var(--color-accent-primary)" />
                    </div>
                    <span
                      className="font-display"
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      POI SEARCH ENGINE
                    </span>
                  </div>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--color-accent-primary)',
                      background: 'rgba(15, 76, 92, 0.1)',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {city} • 768D RAG
                  </span>
                </div>

                {/* Search Input Bar */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        executeSearch(searchQuery, activeCategory);
                      }
                    }}
                    placeholder='Try "El Prado" or "cozy cafes with charm"...'
                    style={{
                      width: '100%',
                      padding: '9px 32px 9px 34px',
                      background: 'var(--color-bg-main)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text-primary)',
                      fontSize: '12.5px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'border-color 0.15s ease',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent-primary)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                  />

                  {/* Left Magnifying Icon or Radar Pulse */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isLoading ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                      animation: isLoading ? 'radarPulse 1.2s infinite ease-in-out' : 'none',
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>

                  {/* Clear Button */}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchData(null);
                        setHasSearched(false);
                      }}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        fontSize: '14px',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        lineHeight: 1,
                      }}
                      title="Clear"
                    >
                      <CloseIcon size={12} />
                    </button>
                  )}
                </div>

                {/* Category Pills Row */}
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none', paddingTop: '2px' }}>
                  {['all', 'museum', 'cafe', 'restaurant', 'monument', 'attraction'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      style={{
                        flexShrink: 0,
                        padding: '2px 7px',
                        background: activeCategory === cat ? 'rgba(15, 76, 92, 0.15)' : 'transparent',
                        color: activeCategory === cat ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                        border: activeCategory === cat ? '1px solid var(--color-accent-primary)' : '1px solid transparent',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '10px',
                        fontWeight: activeCategory === cat ? 700 : 500,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Content Area */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* 1. Loading Skeleton Animation */}
                {isLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          height: '68px',
                          background: 'linear-gradient(90deg, rgba(15, 76, 92, 0.05) 25%, rgba(15, 76, 92, 0.12) 50%, rgba(15, 76, 92, 0.05) 75%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmerBar 1.5s infinite linear',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-border)',
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* 2. Error Message */}
                {errorMessage && !isLoading && (
                  <div
                    style={{
                      padding: '12px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ef4444',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertTriangleIcon size={14} color="#ef4444" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* 3. Empty / Initial Prompt State */}
                {!hasSearched && !isLoading && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1.25rem 0.5rem',
                      textAlign: 'center',
                      gap: '8px',
                    }}
                  >
                    <div style={{ marginBottom: '2px', display: 'flex', justifyContent: 'center' }}>
                      <ReticleCompassIllustration width={84} height={56} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--color-text-primary)' }}>
                      Search Places in {city}
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--color-text-muted)', lineHeight: 1.5, maxWidth: '280px' }}>
                      Enter an exact POI name like <strong>&ldquo;El Prado&rdquo;</strong>, or describe what you want with natural language like <strong>&ldquo;cozy cafes with charm&rdquo;</strong>.
                    </p>

                    {/* Taste-Based Search Prompt Cards */}
                    {promptSuggestions && promptSuggestions.length > 0 && (
                      <div style={{ width: '100%', marginTop: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                          <span
                            className="font-mono text-muted"
                            style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                          >
                            TASTE-BASED SEARCH PROMPTS
                          </span>
                          <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                          {promptSuggestions.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setSearchQuery(item.prompt);
                                executeSearch(item.prompt, activeCategory);
                              }}
                              style={{
                                padding: '8px 9px',
                                background: 'var(--color-bg-main)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                                e.currentTarget.style.background = 'rgba(15, 76, 92, 0.04)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--color-border)';
                                e.currentTarget.style.background = 'var(--color-bg-main)';
                                e.currentTarget.style.transform = 'none';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span
                                  className="font-mono"
                                  style={{
                                    fontSize: '8.5px',
                                    fontWeight: 700,
                                    color: 'var(--color-accent-primary)',
                                    background: 'rgba(15, 76, 92, 0.08)',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {item.tag}
                                </span>
                                <SearchIcon size={11} color="var(--color-text-muted)" />
                              </div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.title}
                              </div>
                              <div
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--color-text-muted)',
                                  lineHeight: 1.3,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                }}
                              >
                                &ldquo;{item.prompt}&rdquo;
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Taste-Based Recommended POIs Cards */}
                    {recommendedPois && recommendedPois.length > 0 && (
                      <div style={{ width: '100%', marginTop: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                          <span
                            className="font-mono text-muted"
                            style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                          >
                            RECOMMENDED FOR YOU • {city}
                          </span>
                          <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                          {recommendedPois.map((poi) => (
                            <div
                              key={poi.id}
                              draggable={true}
                              onDragStart={(e) => handlePoiDragStart(e, poi)}
                              onDragEnd={() => setActiveDragPlace(null)}
                              onClick={() => {
                                if (poi.id) {
                                  onInspectPoi?.(poi.id);
                                }
                                onPlaceClick?.({
                                  id: poi.id,
                                  name: poi.name,
                                  lat: poi.lat,
                                  lng: poi.lng,
                                  category: poi.category,
                                  durationMins: poi.duration_mins,
                                  costEur: poi.cost_eur,
                                });
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 10px',
                                background: 'var(--color-bg-main)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'grab',
                                transition: 'all 0.15s ease',
                              }}
                              title="Drag into itinerary or click to focus on map"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--color-border)';
                                e.currentTarget.style.transform = 'none';
                              }}
                            >
                              <div style={{ color: 'var(--color-text-muted)', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                <GripVerticalIcon size={13} color="var(--color-text-muted)" />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                  <PoiCategoryBadge category={poi.category} name={poi.name} size="sm" />
                                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {poi.name}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                  {poi.duration_mins > 0 && <span>~{poi.duration_mins}m</span>}
                                  {poi.cost_eur > 0 ? <span>€{poi.cost_eur.toFixed(1)}</span> : <span style={{ color: '#10b981' }}>Free</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlaceClick?.({
                                    id: poi.id,
                                    name: poi.name,
                                    lat: poi.lat,
                                    lng: poi.lng,
                                    category: poi.category,
                                    durationMins: poi.duration_mins,
                                    costEur: poi.cost_eur,
                                  });
                                }}
                                title="Focus on Map"
                                style={{
                                  padding: '4px 7px',
                                  background: 'rgba(15, 76, 92, 0.08)',
                                  color: 'var(--color-accent-primary)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                </svg>
                                <span>Map</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Not Found Alert Notice */}
                {searchData?.message && !isLoading && (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      animation: 'searchItemFadeIn 0.25s ease-out',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <InfoIcon size={14} color="#f59e0b" />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                        DATABASE NOTICE
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                      {searchData.message}
                    </div>
                  </div>
                )}

                {/* 5. Exact Match Highlight Card */}
                {searchData?.exact_match && !isLoading && (
                  <div
                    draggable={true}
                    onDragStart={(e) => handlePoiDragStart(e, searchData.exact_match!)}
                    onDragEnd={() => setActiveDragPlace(null)}
                    onClick={() => {
                      if (searchData.exact_match?.id) {
                        onInspectPoi?.(searchData.exact_match.id);
                      }
                      onPlaceClick?.({
                        id: searchData.exact_match!.id,
                        name: searchData.exact_match!.name,
                        lat: searchData.exact_match!.lat,
                        lng: searchData.exact_match!.lng,
                        category: searchData.exact_match!.category,
                        durationMins: searchData.exact_match!.duration_mins,
                        costEur: searchData.exact_match!.cost_eur,
                        similarity: 1.0,
                      });
                    }}
                    style={{
                      padding: '12px',
                      background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 76, 92, 0.04) 100%)',
                      border: '1.5px solid #10b981',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      animation: 'searchItemFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      cursor: 'pointer',
                    }}
                    title="Click to inspect photos and details, or drag into itinerary"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#10b981',
                          background: 'rgba(16, 185, 129, 0.18)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          letterSpacing: '0.04em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckIcon size={12} color="#10b981" />
                        <span>EXACT MATCH IN DATABASE</span>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="font-mono text-muted" style={{ fontSize: '10.5px' }}>
                          100% MATCH
                        </span>
                        <GripVerticalIcon size={14} color="#10b981" />
                      </div>
                    </div>

                    <div>
                      <h4
                        className="font-display"
                        style={{
                          margin: '2px 0 6px 0',
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--color-text-primary)',
                          lineHeight: 1.25,
                        }}
                      >
                        {searchData.exact_match.name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <PoiCategoryBadge category={searchData.exact_match.category} name={searchData.exact_match.name} />
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <ClockIcon size={11} color="var(--color-text-muted)" />
                          <span className="font-mono text-muted" style={{ fontSize: '11px' }}>
                            {searchData.exact_match.duration_mins}m
                          </span>
                        </div>
                        {searchData.exact_match.cost_eur > 0 ? (
                          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                            {searchData.exact_match.cost_eur.toFixed(2)} €
                          </span>
                        ) : (
                          <span className="font-mono" style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                            FREE
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (searchData.exact_match?.id) {
                            onInspectPoi?.(searchData.exact_match.id);
                          }
                          onPlaceClick?.({
                            id: searchData.exact_match!.id,
                            name: searchData.exact_match!.name,
                            lat: searchData.exact_match!.lat,
                            lng: searchData.exact_match!.lng,
                            category: searchData.exact_match!.category,
                            durationMins: searchData.exact_match!.duration_mins,
                            costEur: searchData.exact_match!.cost_eur,
                            similarity: 1.0,
                          });
                        }}
                        style={{
                          padding: '5px 10px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1.0')}
                      >
                        <span>📷 Inspect & Photos</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlaceClick?.({
                            id: searchData.exact_match!.id,
                            name: searchData.exact_match!.name,
                            lat: searchData.exact_match!.lat,
                            lng: searchData.exact_match!.lng,
                            category: searchData.exact_match!.category,
                            durationMins: searchData.exact_match!.duration_mins,
                            costEur: searchData.exact_match!.cost_eur,
                            similarity: 1.0,
                          });
                        }}
                        style={{
                          padding: '5px 12px',
                          background: 'var(--color-accent-primary)',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: 'var(--shadow-sm)',
                          transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1.0')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                        <span>Focus on Map</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. Subheader for Results List */}
                {searchData && searchData.results.length > 0 && !isLoading && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: searchData.exact_match ? '6px' : '0px',
                      padding: '2px 4px',
                    }}
                  >
                    <span
                      className="font-mono text-muted"
                      style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}
                    >
                      {searchData.search_type === 'category_browse'
                        ? `${activeCategory.toUpperCase()} PLACES IN ${city}`
                        : searchData.exact_match
                        ? `SIMILAR PLACES IN ${city}`
                        : `SEMANTIC DISCOVERIES IN ${city}`}
                    </span>
                    <span className="font-mono text-muted" style={{ fontSize: '10px' }}>
                      {searchData.results.length} RESULTS
                    </span>
                  </div>
                )}

                {/* 7. Ranked POI Results Cards */}
                {searchData && searchData.results.length > 0 && !isLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {searchData.results.map((poi, idx) => {
                      const scoreColor = getScoreColor(poi.similarity);
                      return (
                        <div
                          key={poi.id}
                          draggable={true}
                          onDragStart={(e) => handlePoiDragStart(e, poi)}
                          onDragEnd={() => setActiveDragPlace(null)}
                          onClick={() => {
                            if (poi.id) {
                              onInspectPoi?.(poi.id);
                            }
                            onPlaceClick?.({
                              id: poi.id,
                              name: poi.name,
                              lat: poi.lat,
                              lng: poi.lng,
                              category: poi.category,
                              durationMins: poi.duration_mins,
                              costEur: poi.cost_eur,
                              similarity: poi.similarity,
                            });
                          }}
                          style={{
                            padding: '10px',
                            background: 'var(--color-bg-main)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-sm)',
                            cursor: 'grab',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            animation: 'searchItemFadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
                            animationDelay: `${Math.min(idx * 30, 300)}ms`,
                          }}
                          title="Drag into itinerary or click to focus on map"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.borderColor = 'var(--color-border)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            {/* Grip Icon */}
                            <div style={{ display: 'flex', alignItems: 'center', height: '30px', color: 'var(--color-text-muted)' }}>
                              <GripVerticalIcon size={14} color="var(--color-text-muted)" />
                            </div>

                            {/* Rank Number Badge */}
                            <div
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(15, 76, 92, 0.08)',
                                border: '1px solid var(--color-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                color: 'var(--color-accent-primary)',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                              }}
                            >
                              {String(idx + 1).padStart(2, '0')}
                            </div>

                            {/* Name & Details */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    fontSize: '0.86rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={poi.name}
                                >
                                  {poi.name}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                                <PoiCategoryBadge category={poi.category} name={poi.name} />
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <ClockIcon size={10} color="var(--color-text-muted)" />
                                  <span className="font-mono text-muted" style={{ fontSize: '10px' }}>
                                    {poi.duration_mins}m
                                  </span>
                                </div>
                                {poi.cost_eur > 0 ? (
                                  <span className="font-mono text-muted" style={{ fontSize: '10px' }}>
                                    {poi.cost_eur.toFixed(1)}€
                                  </span>
                                ) : (
                                  <span className="font-mono" style={{ fontSize: '10px', color: '#10b981' }}>
                                    Free
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Similarity Score Tag */}
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                flexShrink: 0,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  color: scoreColor,
                                  background: `${scoreColor}18`,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  letterSpacing: '0.02em',
                                }}
                              >
                                {poi.similarity.toFixed(3)}
                              </div>
                              <span
                                className="font-mono"
                                style={{
                                  fontSize: '8.5px',
                                  color: 'var(--color-text-muted)',
                                  marginTop: '2px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                similarity
                              </span>
                            </div>
                          </div>

                          {/* Coincidence Score Progress Bar */}
                          <div
                            style={{
                              width: '100%',
                              height: '4px',
                              background: 'var(--color-border)',
                              borderRadius: '2px',
                              overflow: 'hidden',
                              position: 'relative',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, poi.similarity * 100))}%`,
                                height: '100%',
                                background: scoreColor,
                                borderRadius: '2px',
                                transition: 'width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 8. Zero Results State */}
                {searchData && searchData.results.length === 0 && !searchData.exact_match && !isLoading && (
                  <EmptyState
                    type="no-search"
                    title="No Matching POIs"
                    description={`No attractions in ${city} matched your query. Try broadening your terms or removing category filters.`}
                    style={{ border: 'none', background: 'transparent', padding: '1.5rem 1rem' }}
                  />
                )}
              </div>
            </div>
            )
          )}
        </aside>
      </div>

      {/* 100% Solid Drag Preview Overlay for Search Places */}
      {activeDragPlace && typeof document !== 'undefined' && createPortal(
        <div
          ref={dragPreviewRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: `${activeDragPlace.width}px`,
            pointerEvents: 'none',
            zIndex: 99999,
            transform: `translate3d(${activeDragPlace.initialX - activeDragPlace.offsetX}px, ${activeDragPlace.initialY - activeDragPlace.offsetY}px, 0)`,
            background: 'var(--color-surface-card, #FAF6F0)',
            backgroundColor: '#FAF6F0',
            border: '1.5px solid var(--color-accent-primary, #0F4C5C)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.12)',
            opacity: 1,
            willChange: 'transform',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--color-text-muted)',
                }}
              >
                <GripVerticalIcon size={14} color="var(--color-text-muted)" />
              </div>
              <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeDragPlace.name}
              </h4>
            </div>
            {activeDragPlace.category && (
              <PoiCategoryBadge category={activeDragPlace.category} name={activeDragPlace.name} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '2px', paddingLeft: '22px' }}>
            {activeDragPlace.durationMins ? <span>~{activeDragPlace.durationMins} min</span> : <span>Place</span>}
            {typeof activeDragPlace.costEur === 'number' && activeDragPlace.costEur > 0 && (
              <span style={{ color: 'var(--color-success)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {activeDragPlace.costEur.toFixed(2)} &euro;
              </span>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

