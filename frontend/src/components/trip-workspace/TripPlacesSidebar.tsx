"use client";

import React, { useState, useMemo } from 'react';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';

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
  const [internalCategory, setInternalCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const activeCategoryValue = categoryFilter !== undefined ? (categoryFilter || 'all') : internalCategory;

  const handleCategorySelect = (val: string) => {
    setInternalCategory(val);
    if (onCategoryFilterChange) {
      onCategoryFilterChange(val === 'all' ? null : (val as PoiCategoryType));
    }
  };

  // Filter places based on search query and category
  const filteredPlaces = useMemo(() => {
    return places.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));

      const categoryType = classifyPoiCategory(p.category, p.name).type;
      const matchesCategory =
        activeCategoryValue === 'all' || isCategoryMatch(activeCategoryValue, categoryType);

      return matchesSearch && matchesCategory;
    });
  }, [places, searchQuery, activeCategoryValue]);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '12px',
          bottom: '12px',
          right: '12px',
          zIndex: 15000,
          display: 'flex',
          alignItems: 'stretch',
          pointerEvents: 'none',
        }}
      >
        {/* Floating Edge Collapse Toggle (TREK Style) */}
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
            background: '#FFFFFF',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid #E2E8F0',
            borderRadius: '8px 0 0 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
            pointerEvents: 'auto',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1E3A8A')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
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
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: '16px',
            border: isOpen ? '1px solid #E2E8F0' : 'none',
            boxShadow: isOpen ? '0 12px 36px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.04)' : 'none',
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
                  borderBottom: '1px solid #E2E8F0', background: '#FFFFFF',
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
                    background: '#1E3A8A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-display, inherit)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(30, 58, 138, 0.25)',
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
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      color: '#0F172A',
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
                    stroke="#94A3B8"
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
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      color: '#475569',
                      fontSize: '11px',
                      outline: 'none',
                      fontFamily: 'monospace',
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
                  <div className="font-mono text-muted" style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '12px' }}>
                    [ NO MATCHING PLACES FOUND ]
                  </div>
                ) : (
                  filteredPlaces.map((place, idx) => (
                    <div
                      key={`${place.name}-${idx}`}
                      onClick={() => onPlaceClick?.(place)}
                      style={{
                        padding: '10px',
                        background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      }}
                    >
                      {/* Avatar / Category Indicator */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: '#EFF6FF',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: '#1E3A8A',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                        }}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {place.name}
                          </span>
                          {place.day && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                color: '#1E3A8A',
                                background: 'rgba(59, 130, 246, 0.2)',
                                padding: '1px 5px',
                                borderRadius: '4px',
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
            background: 'rgba(0, 0, 0, 0.75)',
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
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '1.5rem',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-display" style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A' }}>
                ADD PLACE / ACTIVITY
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            <div
              style={{
                background: '#EFF6FF',
                border: '1px solid #DBEAFE',
                borderRadius: '8px',
                padding: '1rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.85rem',
                color: '#1E3A8A',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>{'// POI SEARCH INTEGRATION'}</div>
              <p style={{ margin: 0 }}>
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
                  background: '#1E3A8A',
                  color: '#0F172A',
                  border: 'none',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-display, inherit)',
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
