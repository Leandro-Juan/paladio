"use client";

import React, { useState, useMemo } from 'react';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { PoiCategoryType } from '@/utils/poiCategory';
import { EmptyState } from '@/components/EmptyState';

export interface PlaceItem {
  name: string;
  lat: number;
  lng: number;
  category?: string;
  day?: number;
  durationMins?: number;
  costEur?: number;
}

interface TripPlacesSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  places: PlaceItem[];
  onPlaceClick?: (place: PlaceItem) => void;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
}

export function TripPlacesSidebar({
  isOpen,
  onToggle,
  places,
  onPlaceClick,
  categoryFilter,
  onCategoryFilterChange,
}: TripPlacesSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Filter places based on search text and active categoryFilter prop
  const filteredPlaces = useMemo(() => {
    return places.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        !categoryFilter || (p.category && p.category.toLowerCase() === categoryFilter.toLowerCase());
      return matchesSearch && matchesCategory;
    });
  }, [places, searchQuery, categoryFilter]);

  const handleCategorySelect = (val: string) => {
    if (val === 'all') {
      onCategoryFilterChange?.(null);
    } else {
      onCategoryFilterChange?.(val as PoiCategoryType);
    }
  };

  const activeCategoryValue = categoryFilter ? categoryFilter.toLowerCase() : 'all';

  return (
    <>
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
          aria-label={isOpen ? 'Collapse Places Sidebar' : 'Expand Places Sidebar'}
          title={isOpen ? 'Collapse' : 'Expand Places'}
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
            width: isOpen ? '340px' : '0px',
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
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: '340px' }}>
              {/* Header Actions */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* + Add Place/Activity Button */}
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    background: 'var(--color-accent-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
                  <span>Add Place / Activity</span>
                </button>

                {/* Search Input */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search places..."
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 30px',
                      background: 'var(--color-bg-main)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text-primary)',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ position: 'absolute', left: '10px', top: '9px' }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>

                {/* Category Dropdown & Total Count */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <select
                    value={activeCategoryValue}
                    onChange={(e) => handleCategorySelect(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      background: 'var(--color-bg-main)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)',
                      fontSize: '11px',
                      outline: 'none',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <option value="all">ALL CATEGORIES</option>
                    <option value="museum">MUSEUM</option>
                    <option value="restaurant">RESTAURANT</option>
                    <option value="cafe">CAFE</option>
                    <option value="landmark">LANDMARK</option>
                    <option value="hotel">HOTEL</option>
                    <option value="park">PARK</option>
                    <option value="bar">BAR</option>
                    <option value="shopping">SHOPPING</option>
                    <option value="transit">TRANSIT</option>
                    <option value="attraction">ATTRACTION</option>
                  </select>
                  <span className="font-mono text-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {filteredPlaces.length} PLACES
                  </span>
                </div>
              </div>

              {/* Places List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredPlaces.length === 0 ? (
                  <EmptyState
                    type="no-search"
                    title="No Matching Places"
                    description="Try adjusting your search query or selecting a different category."
                    style={{ border: 'none', background: 'transparent', padding: '1.5rem 1rem' }}
                  />
                ) : (
                  filteredPlaces.map((place, idx) => (
                    <div
                      key={`${place.name}-${idx}`}
                      onClick={() => onPlaceClick?.(place)}
                      style={{
                        padding: '10px',
                        background: 'var(--color-bg-main)',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    >
                      {/* Avatar / Category Indicator */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(15, 76, 92, 0.08)',
                          border: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: 'var(--color-accent-primary)',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {place.name}
                          </span>
                          {place.day && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--color-accent-primary)',
                                background: 'rgba(15, 76, 92, 0.1)',
                                padding: '1px 5px',
                                borderRadius: 'var(--radius-sm)',
                                flexShrink: 0,
                              }}
                            >
                              D{place.day}
                            </span>
                          )}
                        </div>
                        {place.category && (
                          <div style={{ marginTop: '2px' }}>
                            <PoiCategoryBadge category={place.category} name={place.name} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Add Place / Activity Placeholder Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8, 28, 36, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              width: '100%',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.75rem',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 300, color: 'var(--color-text-primary)' }}>
                ADD PLACE / ACTIVITY
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                color: 'var(--color-text-primary)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--color-accent-primary)' }}>
                {'// POI SEARCH INTEGRATION'}
              </div>
              <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
                Live POI discovery and custom waypoint insertion will be activated in the upcoming release.
                Currently, all scheduled waypoints and clusters are synchronized dynamically with your itinerary.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '6px 16px',
                  background: 'var(--color-accent-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                GOT IT
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
