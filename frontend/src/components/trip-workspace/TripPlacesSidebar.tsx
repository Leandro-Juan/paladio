"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { PoiCategoryType } from '@/utils/poiCategory';
import { EmptyState } from '@/components/EmptyState';
import { getApiBaseUrl } from '@/utils/api';
import {
  SearchIcon,
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  InfoIcon,
  GripVerticalIcon,
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

interface TripPlacesSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  city?: string;
  places?: PlaceItem[];
  onPlaceClick?: (place: PlaceItem) => void;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
}

interface PoiApiItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  duration_mins: number;
  cost_eur: number;
  similarity: number;
  match_type?: string;
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

const SUGGESTION_PROMPTS = [
  'El Prado',
  'Good and cozy cafes with charm',
  'Museums of modern art',
  'Tapas & wine',
  'Statue of Liberty',
];

export function TripPlacesSidebar({
  isOpen,
  onToggle,
  city = 'Madrid',
  onPlaceClick,
  categoryFilter,
  onCategoryFilterChange,
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
    };

    window.addEventListener('dragover', handleGlobalDragOver, { capture: true });
    window.addEventListener('dragend', handleGlobalDragEnd, { capture: true });
    window.addEventListener('drop', handleGlobalDragEnd, { capture: true });

    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, { capture: true });
      window.removeEventListener('dragend', handleGlobalDragEnd, { capture: true });
      window.removeEventListener('drop', handleGlobalDragEnd, { capture: true });
    };
  }, []);

  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (categoryFilter !== prevCategoryFilter) {
    setPrevCategoryFilter(categoryFilter);
    if (categoryFilter) {
      setActiveCategory(categoryFilter.toLowerCase());
    }
  }

  // Execute Search against backend
  const executeSearch = React.useCallback(
    async (queryText: string, cat?: string) => {
      const q = queryText.trim();
      if (!q) {
        setSearchData(null);
        setHasSearched(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setHasSearched(true);

      try {
        const catParam = cat && cat !== 'all' ? `&category=${encodeURIComponent(cat)}` : '';
        const baseUrl = getApiBaseUrl();
        const res = await fetch(
          `${baseUrl}/pois/search?city=${encodeURIComponent(
            city
          )}&query=${encodeURIComponent(q)}${catParam}&limit=16`
        );
        if (!res.ok) {
          throw new Error(`Search failed (HTTP ${res.status})`);
        }
        const data: PoiSearchResponseData = await res.json();
        setSearchData(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error executing POI search';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [city]
  );

  // Debounced auto-search when query changes
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery.trim()) {
        setSearchData(null);
        setHasSearched(false);
      } else {
        executeSearch(searchQuery, activeCategory);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, activeCategory, executeSearch]);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    if (onCategoryFilterChange) {
      onCategoryFilterChange(cat === 'all' ? null : (cat as PoiCategoryType));
    }
    if (searchQuery.trim()) {
      executeSearch(searchQuery, cat);
    }
  };

  const handleSelectPrompt = (prompt: string) => {
    setSearchQuery(prompt);
    executeSearch(prompt, activeCategory);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.75) return '#10b981'; // emerald
    if (score >= 0.6) return '#06b6d4'; // cyan
    return '#f59e0b'; // amber
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
          {isOpen && (
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
                      ✕
                    </button>
                  )}
                </div>

                {/* Suggestion Chips */}
                <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                  {SUGGESTION_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSelectPrompt(p)}
                      style={{
                        flexShrink: 0,
                        padding: '3px 8px',
                        background: searchQuery.toLowerCase() === p.toLowerCase() ? 'var(--color-accent-primary)' : 'rgba(15, 76, 92, 0.07)',
                        color: searchQuery.toLowerCase() === p.toLowerCase() ? '#FFFFFF' : 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '12px',
                        fontSize: '10.5px',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (searchQuery.toLowerCase() !== p.toLowerCase()) {
                          e.currentTarget.style.color = 'var(--color-accent-primary)';
                          e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (searchQuery.toLowerCase() !== p.toLowerCase()) {
                          e.currentTarget.style.color = 'var(--color-text-muted)';
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                        }
                      }}
                    >
                      {p}
                    </button>
                  ))}
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
                      padding: '2.5rem 1rem',
                      textAlign: 'center',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'rgba(15, 76, 92, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-accent-primary)',
                      }}
                    >
                      <SearchIcon size={20} color="var(--color-accent-primary)" />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>
                      Search Places in {city}
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--color-text-muted)', lineHeight: 1.5, maxWidth: '280px' }}>
                      Enter an exact POI name like <strong>&ldquo;El Prado&rdquo;</strong>, or describe what you want with natural language like <strong>&ldquo;cozy cafes with charm&rdquo;</strong>.
                    </p>
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
                    onDragStart={(e) => {
                      const poiPayload = {
                        source: 'search',
                        poi: {
                          id: searchData.exact_match!.id,
                          name: searchData.exact_match!.name,
                          location: {
                            latitude: searchData.exact_match!.lat,
                            longitude: searchData.exact_match!.lng,
                          },
                          category: searchData.exact_match!.category,
                          duration_mins: searchData.exact_match!.duration_mins,
                          cost_eur: searchData.exact_match!.cost_eur,
                        },
                      };
                      e.dataTransfer.setData('application/paladio-poi', JSON.stringify(poiPayload));
                      e.dataTransfer.setData('text/plain', searchData.exact_match!.name);
                      e.dataTransfer.effectAllowed = 'copy';

                      const canvas = document.createElement('canvas');
                      canvas.width = 1;
                      canvas.height = 1;
                      e.dataTransfer.setDragImage(canvas, 0, 0);

                      const rect = e.currentTarget.getBoundingClientRect();
                      const offsetX = e.clientX - rect.left;
                      const offsetY = e.clientY - rect.top;

                      setActiveDragPlace({
                        name: searchData.exact_match!.name,
                        category: searchData.exact_match!.category,
                        durationMins: searchData.exact_match!.duration_mins,
                        costEur: searchData.exact_match!.cost_eur,
                        width: rect.width,
                        initialX: e.clientX,
                        initialY: e.clientY,
                        offsetX,
                        offsetY,
                      });
                    }}
                    onDragEnd={() => setActiveDragPlace(null)}
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
                      cursor: 'grab',
                    }}
                    title="Drag into itinerary or click Focus on Map"
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

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                      <button
                        type="button"
                        onClick={() =>
                          onPlaceClick?.({
                            id: searchData.exact_match!.id,
                            name: searchData.exact_match!.name,
                            lat: searchData.exact_match!.lat,
                            lng: searchData.exact_match!.lng,
                            category: searchData.exact_match!.category,
                            durationMins: searchData.exact_match!.duration_mins,
                            costEur: searchData.exact_match!.cost_eur,
                            similarity: 1.0,
                          })
                        }
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
                      {searchData.exact_match ? `SIMILAR PLACES IN ${city}` : `SEMANTIC DISCOVERIES IN ${city}`}
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
                          onDragStart={(e) => {
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
                            e.dataTransfer.setData('application/paladio-poi', JSON.stringify(poiPayload));
                            e.dataTransfer.setData('text/plain', poi.name);
                            e.dataTransfer.effectAllowed = 'copy';

                            const canvas = document.createElement('canvas');
                            canvas.width = 1;
                            canvas.height = 1;
                            e.dataTransfer.setDragImage(canvas, 0, 0);

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
                          }}
                          onDragEnd={() => setActiveDragPlace(null)}
                          onClick={() =>
                            onPlaceClick?.({
                              id: poi.id,
                              name: poi.name,
                              lat: poi.lat,
                              lng: poi.lng,
                              category: poi.category,
                              durationMins: poi.duration_mins,
                              costEur: poi.cost_eur,
                              similarity: poi.similarity,
                            })
                          }
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

