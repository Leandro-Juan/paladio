"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { PoiDetail, PoiPhotoItem } from '@/types/domain';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { getApiBaseUrl } from '@/utils/api';
import { ViewfinderPhotoIllustration } from '@/components/illustrations/TransitIllustrations';
import {
  ClockIcon,
  CloseIcon,
  CheckIcon,
} from '@/components/icons';

interface PoiDetailViewProps {
  poiId: string | null;
  onClose: () => void;
  onAddToDay?: (dayNumber: number, poi: PoiDetail) => void;
  onFocusOnMap?: (poi: {
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

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Defensive parser for opening hours window.
 * Handles both backend tuples `[startMin, endMin]` and objects `{ start: number, end: number }`.
 * Avoids `NaN:NaN - NaN:NaN` under all circumstances.
 */
function parseWindowMinutes(w: unknown): { start: number; end: number } | null {
  if (!w) return null;
  let startMin: number | undefined;
  let endMin: number | undefined;

  if (Array.isArray(w) && w.length >= 2) {
    startMin = typeof w[0] === 'number' ? w[0] : parseInt(String(w[0]), 10);
    endMin = typeof w[1] === 'number' ? w[1] : parseInt(String(w[1]), 10);
  } else if (typeof w === 'object' && w !== null) {
    const obj = w as { start?: unknown; end?: unknown };
    startMin = typeof obj.start === 'number' ? obj.start : parseInt(String(obj.start), 10);
    endMin = typeof obj.end === 'number' ? obj.end : parseInt(String(obj.end), 10);
  }

  if (
    typeof startMin !== 'number' ||
    isNaN(startMin) ||
    typeof endMin !== 'number' ||
    isNaN(endMin) ||
    startMin < 0 ||
    endMin <= startMin
  ) {
    return null;
  }

  return { start: startMin, end: endMin };
}

function formatWindowTime(w: unknown): string | null {
  const parsed = parseWindowMinutes(w);
  if (!parsed) return null;

  const sH = String(Math.floor(parsed.start / 60)).padStart(2, '0');
  const sM = String(parsed.start % 60).padStart(2, '0');
  const eH = String(Math.floor(parsed.end / 60)).padStart(2, '0');
  const eM = String(parsed.end % 60).padStart(2, '0');

  return `${sH}:${sM} – ${eH}:${eM}`;
}

export function PoiDetailView({
  poiId,
  onClose,
  onAddToDay,
  onFocusOnMap,
  availableDays = [1, 2, 3],
  initialDay = 1,
}: PoiDetailViewProps) {
  const [poi, setPoi] = useState<PoiDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<number>(initialDay || 1);
  const [showHoursGrid, setShowHoursGrid] = useState<boolean>(false);
  const [addedToast, setAddedToast] = useState<boolean>(false);

  // Load POI details and real photos whenever poiId changes
  useEffect(() => {
    let isMounted = true;
    if (!poiId) {
      return;
    }

    async function fetchPoi() {
      setLoading(true);
      setError(null);
      setActivePhotoIdx(0);
      setLightboxOpen(false);

      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(poiId!)}/details`);
        if (!res.ok) {
          throw new Error(`Failed to load place details (status ${res.status})`);
        }
        const data: PoiDetail = await res.json();
        if (isMounted) {
          setPoi(data);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error fetching POI details');
          setLoading(false);
        }
      }
    }

    fetchPoi();

    return () => {
      isMounted = false;
    };
  }, [poiId]);

  // Handle escape key to close view or lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxOpen) {
          setLightboxOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, onClose]);

  const handleAddClick = useCallback(() => {
    if (!poi || !onAddToDay) return;
    onAddToDay(selectedDay, poi);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2000);
  }, [poi, onAddToDay, selectedDay]);

  const handleFocusClick = useCallback(() => {
    if (!poi || !onFocusOnMap) return;
    onFocusOnMap({
      lat: poi.lat,
      lng: poi.lng,
      name: poi.name,
      category: poi.category,
      durationMins: poi.duration_mins,
      costEur: poi.cost_eur,
    });
  }, [poi, onFocusOnMap]);

  if (!poiId) {
    return null;
  }

  const photos: PoiPhotoItem[] = poi?.photos || [];
  const currentPhoto = photos[activePhotoIdx];

  // Calculate current open status defensively
  const now = new Date();
  const currentDayIdx = (now.getDay() + 6) % 7; // Convert Sun(0)-Sat(6) to Mon(0)-Sun(6)
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let isOpenNow = false;
  let todayHoursLabel = 'Hours not available';

  if (poi?.daily_windows && poi.daily_windows[currentDayIdx]) {
    const rawWindows = poi.daily_windows[currentDayIdx];
    if (Array.isArray(rawWindows) && rawWindows.length > 0) {
      const formattedWindows = rawWindows
        .map(formatWindowTime)
        .filter((str): str is string => Boolean(str));

      if (formattedWindows.length > 0) {
        todayHoursLabel = formattedWindows.join(', ');
        isOpenNow = rawWindows.some((w) => {
          const parsed = parseWindowMinutes(w);
          return parsed ? currentMinutes >= parsed.start && currentMinutes < parsed.end : false;
        });
      }
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: 'min(380px, calc(100vw - 32px))',
        minWidth: 0,
        animation: 'poiViewEnter 0.22s cubic-bezier(0.23, 1, 0.32, 1)',
        background: 'var(--color-surface-card)',
      }}
    >
      {/* 1. Header Bar */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-code, monospace)',
              fontWeight: 600,
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              e.currentTarget.style.color = 'var(--color-accent-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-primary)';
            }}
            title="Return to POI Search"
            aria-label="Back to Search"
          >
            <span>&larr; Search</span>
          </button>
          <span
            style={{
              fontFamily: 'var(--font-code, monospace)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {'// POI INSPECTOR'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {poi?.doc_quality && (
            <span
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '9.5px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'var(--color-surface-raised)',
                color: 'var(--color-accent-primary)',
                border: '1px solid var(--color-border)',
                letterSpacing: '0.04em',
              }}
            >
              TIER {poi.doc_quality}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            title="Close Inspector"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                margin: '0 auto 16px auto',
                border: '3px solid var(--color-border)',
                borderTopColor: 'var(--color-accent-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '12px',
                color: 'var(--color-text-muted)',
              }}
            >
              {'// RESOLVING WIKIMEDIA SIGHTS & SPECS...'}
            </p>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p
              style={{
                color: 'var(--color-danger, #B3261E)',
                fontSize: '13px',
                fontFamily: 'var(--font-code, monospace)',
              }}
            >
              {error}
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: '12px',
                padding: '6px 14px',
                background: 'var(--color-surface-raised)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '11.5px',
              }}
            >
              Return to Search
            </button>
          </div>
        )}

        {poi && !loading && (
          <>
            {/* Photo Hero Carousel */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                background: 'var(--color-surface-raised)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              {photos.length > 0 ? (
                <div>
                  {/* Main Image Container */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setLightboxOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setLightboxOpen(true);
                      }
                    }}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '210px',
                      backgroundImage: `url(${currentPhoto.url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      cursor: 'zoom-in',
                      transition: 'background-image 0.25s ease-in-out',
                    }}
                  >
                    {/* Subtle Gradient Scrim at bottom for caption contrast */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(15, 23, 42, 0.72) 100%)',
                      }}
                    />

                    {/* Top-left Fullscreen Lightbox Hint Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxOpen(true);
                      }}
                      style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: 'rgba(15, 76, 92, 0.78)',
                        backdropFilter: 'blur(8px)',
                        padding: '3px 7px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-code, monospace)',
                        fontWeight: 600,
                        color: 'var(--color-text-on-accent)',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Open full-resolution photo viewer"
                    >
                      <span>⤢</span> Full
                    </button>

                    {/* Photo Counter Pill */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(15, 23, 42, 0.78)',
                        backdropFilter: 'blur(8px)',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-code, monospace)',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      {activePhotoIdx + 1} / {photos.length}
                    </div>

                    {/* Next / Prev Controls */}
                    {photos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
                          }}
                          style={{
                            position: 'absolute',
                            left: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(15, 23, 42, 0.65)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backdropFilter: 'blur(6px)',
                            fontSize: '11px',
                          }}
                          aria-label="Previous photo"
                        >
                          &#9664;
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePhotoIdx((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
                          }}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(15, 23, 42, 0.65)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backdropFilter: 'blur(6px)',
                            fontSize: '11px',
                          }}
                          aria-label="Next photo"
                        >
                          &#9654;
                        </button>
                      </>
                    )}

                    {/* Caption & Attribution Bar */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '10px',
                        right: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#FFFFFF',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                        }}
                      >
                        {currentPhoto.caption || poi.name}
                      </span>
                      {currentPhoto.license_name && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-code, monospace)',
                            color: '#E2E8F0',
                            background: 'rgba(15, 76, 92, 0.85)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                          }}
                        >
                          {currentPhoto.license_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Strip */}
                  {photos.length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        padding: '8px 12px',
                        overflowX: 'auto',
                        background: 'var(--color-surface-card)',
                      }}
                    >
                      {photos.map((item, idx) => {
                        const isActive = idx === activePhotoIdx;
                        return (
                          <button
                            key={item.url || idx}
                            type="button"
                            onClick={() => setActivePhotoIdx(idx)}
                            style={{
                              flex: '0 0 46px',
                              height: '32px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundImage: `url(${item.url})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              border: 'none',
                              outline: isActive ? '2px solid var(--color-accent-primary)' : '1px solid var(--color-border)',
                              outlineOffset: '1px',
                              cursor: 'pointer',
                              opacity: isActive ? 1 : 0.65,
                              transition: 'all 0.15s ease',
                            }}
                            aria-label={`Select photo ${idx + 1}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Authentic Illustration Fallback when no Wikimedia photo exists */
                <div
                  style={{
                    padding: '28px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-surface-card)',
                    textAlign: 'center',
                  }}
                >
                  <ViewfinderPhotoIllustration size={80} />
                  <span
                    style={{
                      marginTop: '8px',
                      fontSize: '10.5px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {'// COMMUNITY IMAGERY PENDING'}
                  </span>
                </div>
              )}
            </div>

            {/* Content Details */}
            <div
              style={{
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Category & City Tag */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <PoiCategoryBadge category={poi.category} size="md" />
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-code, monospace)',
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {poi.city || 'Destination'}
                </span>
              </div>

              {/* Title */}
              <h2
                style={{
                  margin: 0,
                  fontSize: '19px',
                  lineHeight: 1.25,
                  fontWeight: 700,
                  fontFamily: 'var(--font-display, inherit)',
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                {poi.name}
              </h2>

              {/* Action Buttons: Add to Itinerary & Focus */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {availableDays && availableDays.length > 0 && (
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(Number(e.target.value))}
                      style={{
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '11.5px',
                        fontFamily: 'var(--font-code, monospace)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                      title="Select target day in itinerary"
                    >
                      {availableDays.map((d) => (
                        <option key={d} value={d}>
                          Day {d}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={handleAddClick}
                    style={{
                      flex: 1,
                      background: addedToast ? 'var(--color-success, #1F7A4D)' : 'var(--color-accent-primary)',
                      color: 'var(--color-text-on-accent)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'background-color 0.2s ease',
                    }}
                  >
                    {addedToast ? (
                      <>
                        <CheckIcon size={14} />
                        <span>Added to Day {selectedDay}!</span>
                      </>
                    ) : (
                      <>
                        <span>+ Add to Itinerary</span>
                      </>
                    )}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleFocusClick}
                    style={{
                      flex: 1,
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                      e.currentTarget.style.color = 'var(--color-accent-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }}
                  >
                    <span>🎯 Focus on Map</span>
                  </button>

                  {poi.website && (
                    <a
                      href={poi.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                        fontSize: '11px',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                        e.currentTarget.style.color = 'var(--color-accent-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                      }}
                    >
                      <span>Website</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
              </div>

              {/* 3-Column Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {/* Duration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Visit Duration
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ClockIcon size={12} />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-code, monospace)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      ~{poi.duration_mins || 60}m
                    </span>
                  </div>
                </div>

                {/* Admission */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Admission
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-code, monospace)',
                      color: poi.cost_eur === 0 ? 'var(--color-success, #1F7A4D)' : 'var(--color-accent-primary)',
                    }}
                  >
                    {poi.cost_eur === 0 ? 'FREE' : `${poi.cost_eur.toFixed(2)} €`}
                  </span>
                </div>

                {/* Rating / Score */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Authority
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-code, monospace)',
                      color: '#B45309',
                    }}
                  >
                    ★ {poi.scoring?.rating ? poi.scoring.rating.toFixed(1) : '4.8'}
                  </span>
                </div>
              </div>

              {/* Operational Hours Section */}
              <div
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: isOpenNow ? 'var(--color-success, #1F7A4D)' : 'var(--color-accent-warning, #B45309)',
                        boxShadow: isOpenNow ? '0 0 6px var(--color-success, #1F7A4D)' : 'none',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-code, monospace)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: isOpenNow ? 'var(--color-success, #1F7A4D)' : '#B45309',
                      }}
                    >
                      {isOpenNow ? 'OPEN NOW' : 'CLOSED NOW'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowHoursGrid((prev) => !prev)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent-primary)',
                      fontSize: '10.5px',
                      fontFamily: 'var(--font-code, monospace)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showHoursGrid ? 'Hide 7-day ▲' : 'All 7 Days ▼'}
                  </button>
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-code, monospace)',
                  }}
                >
                  Today ({DAY_NAMES[currentDayIdx]}):{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{todayHoursLabel}</strong>
                </div>

                {/* 7-day schedule grid */}
                {showHoursGrid && poi.daily_windows && (
                  <div
                    style={{
                      marginTop: '6px',
                      paddingTop: '8px',
                      borderTop: '1px dashed var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {DAY_NAMES.map((dName, dayIdx) => {
                      const win = poi.daily_windows?.[dayIdx];
                      const isToday = dayIdx === currentDayIdx;
                      let hoursStr = 'Closed';

                      if (Array.isArray(win) && win.length > 0) {
                        const parsedList = win
                          .map(formatWindowTime)
                          .filter((str): str is string => Boolean(str));

                        if (parsedList.length > 0) {
                          hoursStr = parsedList.join(', ');
                        }
                      }

                      return (
                        <div
                          key={dName}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '10.5px',
                            fontFamily: 'var(--font-code, monospace)',
                            color: isToday ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                            fontWeight: isToday ? 700 : 400,
                          }}
                        >
                          <span>{dName}:</span>
                          <span>{hoursStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Description */}
              {poi.description && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-code, monospace)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {'// HISTORICAL & CULTURAL OVERVIEW'}
                  </span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12.5px',
                      lineHeight: 1.6,
                      color: 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-body, inherit)',
                    }}
                  >
                    {poi.description}
                  </p>
                </div>
              )}

              {/* GPS Coordinates & Technical Specs */}
              <div
                style={{
                  paddingTop: '10px',
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-code, monospace)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <span>
                  GPS: {poi.lat.toFixed(4)}° N, {poi.lng.toFixed(4)}° E
                </span>
                <span>ID: {poi.id.slice(0, 18)}...</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lightbox Full-Screen Modal */}
      {lightboxOpen && currentPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(8, 28, 36, 0.94)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '24px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Lightbox Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              maxWidth: '1200px',
              margin: '0 auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-code, monospace)',
                  fontSize: '12px',
                  color: 'var(--color-accent-teal-soft, #7CC4D1)',
                  fontWeight: 600,
                }}
              >
                {poi?.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-code, monospace)',
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.6)',
                }}
              >
                {activePhotoIdx + 1} / {photos.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Lightbox Main Viewport */}
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '1200px',
              width: '100%',
              margin: '0 auto',
            }}
          >
            {/* Prev Image */}
            {photos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
                }}
                style={{
                  position: 'absolute',
                  left: '12px',
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
                aria-label="Previous photo"
              >
                &#9664;
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhoto.url}
              alt={currentPhoto.caption || poi?.name || 'POI photo'}
              style={{
                maxHeight: '75vh',
                maxWidth: '90vw',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              }}
              onClick={(e) => e.stopPropagation()}
            />

            {/* Next Image */}
            {photos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIdx((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
                }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
                aria-label="Next photo"
              >
                &#9654;
              </button>
            )}
          </div>

          {/* Lightbox Footer Caption & License */}
          <div
            style={{
              maxWidth: '1200px',
              width: '100%',
              margin: '0 auto',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <p
              style={{
                color: '#FFFFFF',
                fontSize: '13px',
                margin: 0,
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}
            >
              {currentPhoto.caption || poi?.name}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.6)',
                fontFamily: 'var(--font-code, monospace)',
              }}
            >
              {currentPhoto.author && <span>Author: {currentPhoto.author}</span>}
              {currentPhoto.license_name && (
                <span>License: {currentPhoto.license_name}</span>
              )}
              {currentPhoto.license_url && (
                <a
                  href={currentPhoto.license_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent-teal-soft, #7CC4D1)', textDecoration: 'underline' }}
                >
                  License Details ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
