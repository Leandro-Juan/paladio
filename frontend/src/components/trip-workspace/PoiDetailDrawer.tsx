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

interface PoiDetailDrawerProps {
  poiId: string | null;
  onClose: () => void;
  onAddToDay?: (dayNumber: number, poi: PoiDetail) => void;
  onFocusOnMap?: (poi: { lat: number; lng: number; name: string; category: string; durationMins?: number; costEur?: number }) => void;
  availableDays?: number[];
  initialDay?: number;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function PoiDetailDrawer({
  poiId,
  onClose,
  onAddToDay,
  onFocusOnMap,
  availableDays = [1, 2, 3],
  initialDay = 1,
}: PoiDetailDrawerProps) {
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
          setError(err instanceof Error ? err.message : 'Error fetching POI');
          setLoading(false);
        }
      }
    }

    fetchPoi();

    return () => {
      isMounted = false;
    };
  }, [poiId]);

  // Handle escape key to close drawer or lightbox
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

  if (!poiId) return null;

  const photos: PoiPhotoItem[] = poi?.photos || [];
  const currentPhoto = photos[activePhotoIdx];

  // Calculate current open status
  const now = new Date();
  const currentDayIdx = (now.getDay() + 6) % 7; // Convert Sun(0)-Sat(6) to Mon(0)-Sun(6)
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let isOpenNow = false;
  let todayHoursLabel = 'Schedule unavailable';

  if (poi?.daily_windows && poi.daily_windows[currentDayIdx]) {
    const todayWindows = poi.daily_windows[currentDayIdx];
    if (Array.isArray(todayWindows) && todayWindows.length > 0) {
      todayHoursLabel = todayWindows
        .map((w) => {
          const sH = String(Math.floor(w.start / 60)).padStart(2, '0');
          const sM = String(w.start % 60).padStart(2, '0');
          const eH = String(Math.floor(w.end / 60)).padStart(2, '0');
          const eM = String(w.end % 60).padStart(2, '0');
          return `${sH}:${sM} – ${eH}:${eM}`;
        })
        .join(', ');

      isOpenNow = todayWindows.some((w) => currentMinutes >= w.start && currentMinutes < w.end);
    }
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: '56px',
          right: 0,
          bottom: 0,
          width: '450px',
          maxWidth: '100vw',
          zIndex: 1200,
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(28px)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.55)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'poiDrawerSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* 1. Header Bar */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.75)',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--color-text-primary, #FFFFFF)',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
            >
              <span>&larr; Back</span>
            </button>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10.5px',
                fontWeight: 700,
                color: 'var(--color-accent-teal-soft, #7CC4D1)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              POI INSPECTOR
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {poi?.doc_quality && (
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
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
                color: 'var(--color-text-muted, #94A3B8)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
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
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  margin: '0 auto 16px auto',
                  border: '3px solid rgba(255, 255, 255, 0.1)',
                  borderTopColor: 'var(--color-accent-primary, #2563EB)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p className="font-mono text-muted text-sm">{'// RESOLVING WIKIMEDIA SIGHTS & SPECS...'}</p>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ color: '#EF4444', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>{error}</p>
              <button
                type="button"
                onClick={() => onClose()}
                style={{
                  marginTop: '12px',
                  padding: '6px 14px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#FFFFFF',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Return to Search
              </button>
            </div>
          )}

          {poi && !loading && (
            <>
              {/* Photo Hero Carousel */}
              <div style={{ position: 'relative', width: '100%', background: '#090D16' }}>
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
                        height: '240px',
                        backgroundImage: `url(${currentPhoto.url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        cursor: 'zoom-in',
                        transition: 'background-image 0.25s ease-in-out',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(15,23,42,0.85) 100%)',
                        }}
                      />

                      {/* Photo Counter Pill */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          background: 'rgba(0, 0, 0, 0.65)',
                          backdropFilter: 'blur(8px)',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono, monospace)',
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
                              background: 'rgba(0, 0, 0, 0.5)',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '50%',
                              width: '30px',
                              height: '30px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backdropFilter: 'blur(4px)',
                            }}
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
                              background: 'rgba(0, 0, 0, 0.5)',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '50%',
                              width: '30px',
                              height: '30px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backdropFilter: 'blur(4px)',
                            }}
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
                          left: '12px',
                          right: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#E2E8F0',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                          }}
                        >
                          {currentPhoto.caption || poi.name}
                        </span>
                        {currentPhoto.license_name && (
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontFamily: 'var(--font-mono, monospace)',
                              color: '#94A3B8',
                              background: 'rgba(0,0,0,0.5)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              whiteSpace: 'nowrap',
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
                          background: 'rgba(10, 15, 29, 0.85)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        {photos.map((p, idx) => (
                          <div
                            key={idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActivePhotoIdx(idx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setActivePhotoIdx(idx);
                              }
                            }}
                            style={{
                              flexShrink: 0,
                              width: '60px',
                              height: '42px',
                              borderRadius: '4px',
                              backgroundImage: `url(${p.thumbnail_url || p.url})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              cursor: 'pointer',
                              border: idx === activePhotoIdx ? '2px solid #10B981' : '1px solid rgba(255, 255, 255, 0.15)',
                              opacity: idx === activePhotoIdx ? 1.0 : 0.65,
                              transition: 'all 0.15s ease',
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Zero-Mock Tactical Schematic Fallback */
                  <div
                    style={{
                      height: '200px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'radial-gradient(circle, rgba(15, 76, 92, 0.25) 0%, rgba(9, 13, 22, 0.95) 100%)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '20px',
                      textAlign: 'center',
                    }}
                  >
                    <ViewfinderPhotoIllustration size={54} color="#7CC4D1" />
                    <span
                      style={{
                        marginTop: '10px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--color-accent-teal-soft, #7CC4D1)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {'// COMMUNITY IMAGERY PENDING'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #94A3B8)', marginTop: '2px' }}>
                      No Wikimedia photos cataloged for this node yet
                    </span>
                  </div>
                )}
              </div>

              {/* Body Details Container */}
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Title & Badges */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <PoiCategoryBadge category={poi.category} name={poi.name} size="sm" />
                    {poi.neighborhood && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono, monospace)',
                          color: 'var(--color-text-muted, #94A3B8)',
                        }}
                      >
                        📍 {poi.neighborhood}
                      </span>
                    )}
                  </div>

                  <h3
                    className="font-display"
                    style={{
                      margin: 0,
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary, #FFFFFF)',
                      lineHeight: 1.25,
                    }}
                  >
                    {poi.name}
                  </h3>
                </div>

                {/* Primary Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Day selector dropdown */}
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(Number(e.target.value))}
                      style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFFFFF',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '11.5px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      {availableDays.map((d) => (
                        <option key={d} value={d}>
                          Day {d}
                        </option>
                      ))}
                    </select>

                    {/* Add to Itinerary Button */}
                    <button
                      type="button"
                      onClick={handleAddClick}
                      style={{
                        flex: 1,
                        padding: '8px 14px',
                        background: addedToast ? '#10B981' : 'var(--color-accent-primary, #2563EB)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-sans, sans-serif)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      {addedToast ? (
                        <>
                          <CheckIcon size={14} color="#FFFFFF" />
                          <span>Added to Day {selectedDay}!</span>
                        </>
                      ) : (
                        <span>+ Add to Itinerary</span>
                      )}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Focus on Map */}
                    <button
                      type="button"
                      onClick={() =>
                        onFocusOnMap?.({
                          lat: poi.lat,
                          lng: poi.lng,
                          name: poi.name,
                          category: poi.category,
                          durationMins: poi.duration_mins,
                          costEur: poi.cost_eur,
                        })
                      }
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: 'var(--color-text-primary, #FFFFFF)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                      </svg>
                      <span>Focus on Map</span>
                    </button>

                    {/* Official Website */}
                    {poi.website && (
                      <a
                        href={poi.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '6px 10px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: 'var(--color-text-muted, #94A3B8)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <span>Website &#8599;</span>
                      </a>
                    )}

                    {/* Wikipedia */}
                    {poi.wikipedia_title && (
                      <a
                        href={`https://wikipedia.org/wiki/${encodeURIComponent(poi.wikipedia_title.replace(/^[a-z]+:/, ''))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '6px 10px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: 'var(--color-text-muted, #94A3B8)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <span>Wikipedia &#8599;</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Key Metrics Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    padding: '10px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                  }}
                >
                  {/* Duration */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '9.5px', textTransform: 'uppercase' }}>
                      Visit Duration
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ClockIcon size={12} color="#7CC4D1" />
                      <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF' }}>
                        ~{poi.duration_mins}m
                      </span>
                    </div>
                  </div>

                  {/* Admission Cost */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '9.5px', textTransform: 'uppercase' }}>
                      Admission
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: poi.cost_eur === 0 ? '#10B981' : '#E06D53',
                      }}
                    >
                      {poi.cost_eur === 0 ? 'FREE' : `${poi.cost_eur.toFixed(2)} €`}
                    </span>
                  </div>

                  {/* Rating / Score */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '9.5px', textTransform: 'uppercase' }}>
                      Authority
                    </span>
                    <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#F59E0B' }}>
                      ★ {poi.scoring?.rating ? poi.scoring.rating.toFixed(1) : '4.8'}
                    </span>
                  </div>
                </div>

                {/* Operational Hours Section */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: isOpenNow ? '#10B981' : '#F59E0B',
                          boxShadow: isOpenNow ? '0 0 8px #10B981' : 'none',
                        }}
                      />
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isOpenNow ? '#10B981' : '#F59E0B',
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
                        color: 'var(--color-accent-teal-soft, #7CC4D1)',
                        fontSize: '10.5px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {showHoursGrid ? 'Hide 7-day ▲' : 'All 7 Days ▼'}
                    </button>
                  </div>

                  <div style={{ fontSize: '11.5px', color: '#E2E8F0', fontFamily: 'var(--font-mono, monospace)' }}>
                    Today ({DAY_NAMES[currentDayIdx]}): <strong style={{ color: '#FFFFFF' }}>{todayHoursLabel}</strong>
                  </div>

                  {/* 7-day schedule grid */}
                  {showHoursGrid && poi.daily_windows && (
                    <div
                      style={{
                        marginTop: '6px',
                        paddingTop: '8px',
                        borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
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
                          hoursStr = win
                            .map((w) => {
                              const sH = String(Math.floor(w.start / 60)).padStart(2, '0');
                              const sM = String(w.start % 60).padStart(2, '0');
                              const eH = String(Math.floor(w.end / 60)).padStart(2, '0');
                              const eM = String(w.end % 60).padStart(2, '0');
                              return `${sH}:${sM}–${eH}:${eM}`;
                            })
                            .join(', ');
                        }

                        return (
                          <div
                            key={dName}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '10.5px',
                              fontFamily: 'var(--font-mono, monospace)',
                              color: isToday ? '#10B981' : '#94A3B8',
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Historical & Cultural Overview
                    </span>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#CBD5E1',
                        fontFamily: 'var(--font-sans, sans-serif)',
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
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--color-text-muted, #94A3B8)',
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
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '24px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon size={20} />
          </button>

          <img
            src={currentPhoto.url}
            alt={currentPhoto.caption || poi?.name || 'POI photo'}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            }}
          />

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: '16px',
              textAlign: 'center',
              maxWidth: '800px',
            }}
          >
            <h4 style={{ margin: '0 0 4px 0', color: '#FFFFFF', fontSize: '15px' }}>
              {currentPhoto.caption || poi?.name}
            </h4>
            <p style={{ margin: 0, color: '#94A3B8', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              {currentPhoto.author && `By ${currentPhoto.author} • `}
              {currentPhoto.license_name || 'Creative Commons'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
