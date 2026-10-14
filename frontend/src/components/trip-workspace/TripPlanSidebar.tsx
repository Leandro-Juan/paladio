"use client";

import React, { useState, useEffect } from 'react';
import { DayOutput, OptimizationResult, ScheduledPoi } from '@/types/domain';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { TransitRecommendationCard } from '@/components/TransitLegView';
import { Spinner, LightningIcon, WalkIcon, TransitIcon } from '@/components/icons';
import { apiFetch } from '@/utils/api';
import { notify } from '@/utils/notify';
import { getScheduledPoiTimes, getPoiOpeningHours } from '@/utils/date';

interface TripPlanSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  days: DayOutput[];
  selectedDay: number | 'all';
  onSelectDay: (day: number | 'all') => void;
  tripId?: string;
  destinationCity?: string;
  itinerary?: OptimizationResult | null;
  onItineraryUpdate?: (updated: OptimizationResult) => void;
  categoryFilter?: PoiCategoryType | null;
  onCategoryFilterChange?: (cat: PoiCategoryType | null) => void;
  transitMode?: 'simple' | 'detailed';
  onTransitModeChange?: (mode: 'simple' | 'detailed') => void;
}

export function TripPlanSidebar({
  isOpen,
  onToggle,
  days,
  selectedDay,
  onSelectDay,
  tripId,
  destinationCity,
  itinerary,
  onItineraryUpdate,
  categoryFilter,
  onCategoryFilterChange,
  transitMode = 'simple',
  onTransitModeChange,
}: TripPlanSidebarProps) {
  // Transit upgrade state
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        if (tripId && sessionStorage.getItem(`paladio_trip_upgraded_${tripId}`) === 'true') return true;
        if (destinationCity && sessionStorage.getItem(`paladio_trip_upgraded_${destinationCity.toLowerCase()}`) === 'true') return true;
      } catch {
        // ignore
      }
    }
    return false;
  });
  const [gtfsStatus, setGtfsStatus] = useState<string | null>(null);

  // Poll GTFS status
  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        let endpoint = '';
        if (tripId) {
          endpoint = `/trips/${tripId}/transit-status`;
        } else if (destinationCity) {
          endpoint = `/trips/transit-status?city=${encodeURIComponent(destinationCity)}`;
        } else {
          return;
        }

        const data = await apiFetch<{ status?: string; is_ready?: boolean; message?: string }>(endpoint);
        if (!isMounted) return;

        const currentStatus = (data.status || (data.is_ready ? 'READY' : 'NOT_READY')).toUpperCase();
        setGtfsStatus(currentStatus);

        if (currentStatus === 'READY' && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch {
        if (!isMounted) return;
        setGtfsStatus('NOT_SUPPORTED');
      }
    };

    fetchStatus();
    intervalId = setInterval(fetchStatus, 4000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [tripId, destinationCity]);

  const isUpgraded = Boolean(itinerary?.metadata && (itinerary.metadata as Record<string, unknown>).transit_upgraded) || upgraded;
  const isGtfsReady = gtfsStatus === 'READY';
  const showUpgradeToolbar = !isUpgraded && gtfsStatus !== 'NOT_SUPPORTED';

  const handleUpgradeTransit = async () => {
    if (upgrading || isUpgraded) return;

    if (!isGtfsReady) {
      notify.info(
        'GTFS Schedules Compiling',
        'Real-world transit schedules for this city are currently compiling. Please try again shortly.'
      );
      return;
    }

    setUpgrading(true);
    try {
      let endpoint = '';
      if (tripId) {
        endpoint = `/trips/${tripId}/upgrade-transit`;
      } else if (destinationCity) {
        endpoint = `/trips/upgrade-transit?city=${encodeURIComponent(destinationCity)}`;
      }

      const res = await apiFetch<{ success: boolean; trip?: { itinerary_data?: OptimizationResult }; itinerary_data?: OptimizationResult }>(
        endpoint,
        { method: 'POST' }
      );

      const updatedItin = res.trip?.itinerary_data || res.itinerary_data;
      if (updatedItin && onItineraryUpdate) {
        onItineraryUpdate(updatedItin);
      }

      setUpgraded(true);
      if (typeof window !== 'undefined') {
        try {
          if (tripId) sessionStorage.setItem(`paladio_trip_upgraded_${tripId}`, 'true');
          if (destinationCity) sessionStorage.setItem(`paladio_trip_upgraded_${destinationCity.toLowerCase()}`, 'true');
        } catch {
          // ignore
        }
      }

      notify.success(
        'Transit Schedules Applied',
        'Itinerary upgraded with real-world public transit routes and exact timetables.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transit upgrade failed.';
      notify.error('Transit Upgrade Failed', msg);
    } finally {
      setUpgrading(false);
    }
  };

  // Day filter
  const displayedDays = selectedDay === 'all' ? days : days.filter((d) => d.day === selectedDay);

  // Carousel ref and scroll state
  const dayTabsRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = dayTabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  React.useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, days]);

  const handleScrollLeft = () => {
    if (dayTabsRef.current) {
      dayTabsRef.current.scrollBy({ left: -140, behavior: 'smooth' });
      setTimeout(checkScroll, 250);
    }
  };

  const handleScrollRight = () => {
    if (dayTabsRef.current) {
      dayTabsRef.current.scrollBy({ left: 140, behavior: 'smooth' });
      setTimeout(checkScroll, 250);
    }
  };

  // Total trip cost
  const totalCost = React.useMemo(() => {
    return days.reduce((sum, d) => sum + (d.itinerary?.total_cost || 0), 0);
  }, [days]);

  const showScrollArrows = days.length > 5;

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
      {/* Panel Body */}
      <aside
        style={{
          width: isOpen ? '380px' : '0px',
          height: '100%',
          background: 'var(--color-surface-card)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
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
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: '380px' }}>
            {/* Header Toolbar */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: 'var(--color-surface-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-mono text-muted" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  {'// ITINERARY TIMELINE'}
                </span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--color-accent-primary)', fontWeight: 700 }}>
                  EST. {totalCost.toFixed(2)} &euro;
                </span>
              </div>

              {/* Day Selection Tabs with Single-Line Carousel */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  width: '100%',
                }}
              >
                {/* Left Navigation Arrow */}
                {showScrollArrows && (
                  <button
                    type="button"
                    data-testid="day-nav-prev"
                    onClick={handleScrollLeft}
                    disabled={!canScrollLeft}
                    aria-label="Previous days"
                    style={{
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: canScrollLeft ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                      cursor: canScrollLeft ? 'pointer' : 'default',
                      opacity: canScrollLeft ? 1 : 0.4,
                      flexShrink: 0,
                      boxShadow: canScrollLeft ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}

                {/* Single Line Scrollable Tabs */}
                <div
                  ref={dayTabsRef}
                  data-testid="day-selector-tabs"
                  style={{
                    display: 'flex',
                    gap: '4px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    WebkitOverflowScrolling: 'touch',
                    flex: 1,
                    minWidth: 0,
                    scrollBehavior: 'smooth',
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    data-testid="day-tab-all"
                    onClick={() => onSelectDay('all')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: selectedDay === 'all' ? 'var(--color-accent-primary)' : 'var(--color-border)',
                      background: selectedDay === 'all' ? 'var(--color-accent-primary)' : 'var(--color-bg-main)',
                      color: selectedDay === 'all' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      boxShadow: selectedDay === 'all' ? '0 1px 3px rgba(15, 76, 92, 0.2)' : 'none',
                      transition: 'all 0.15s ease',
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
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid',
                          borderColor: isSel ? 'var(--color-accent-primary)' : 'var(--color-border)',
                          background: isSel ? 'var(--color-accent-primary)' : 'var(--color-bg-main)',
                          color: isSel ? '#FFFFFF' : 'var(--color-text-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          boxShadow: isSel ? '0 1px 3px rgba(15, 76, 92, 0.2)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        DAY {d.day}
                      </button>
                    );
                  })}
                </div>

                {/* Right Navigation Arrow */}
                {showScrollArrows && (
                  <button
                    type="button"
                    data-testid="day-nav-next"
                    onClick={handleScrollRight}
                    disabled={!canScrollRight}
                    aria-label="Next days"
                    style={{
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: canScrollRight ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                      cursor: canScrollRight ? 'pointer' : 'default',
                      opacity: canScrollRight ? 1 : 0.4,
                      flexShrink: 0,
                      boxShadow: canScrollRight ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Transit Route Mode Pill Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '3px 4px 3px 10px',
                  background: 'var(--color-bg-main)',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <TransitIcon size={12} color="var(--color-accent-primary)" />
                  <span
                    className="font-mono text-muted"
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                    }}
                  >
                    TRANSIT ROUTE
                  </span>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'var(--color-surface-card)',
                    padding: '2px',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border)',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    data-testid="transit-pill-simple"
                    onClick={() => onTransitModeChange?.('simple')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 'var(--radius-full)',
                      border: 'none',
                      background: transitMode === 'simple' ? 'var(--color-accent-primary)' : 'transparent',
                      color: transitMode === 'simple' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: transitMode === 'simple' ? '0 1px 3px rgba(15, 76, 92, 0.25)' : 'none',
                    }}
                  >
                    SIMPLE
                  </button>
                  <button
                    type="button"
                    data-testid="transit-pill-detailed"
                    onClick={() => onTransitModeChange?.('detailed')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 'var(--radius-full)',
                      border: 'none',
                      background: transitMode === 'detailed' ? 'var(--color-accent-primary)' : 'transparent',
                      color: transitMode === 'detailed' ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: transitMode === 'detailed' ? '0 1px 3px rgba(15, 76, 92, 0.25)' : 'none',
                    }}
                  >
                    DETAILED
                  </button>
                </div>
              </div>

              {/* Active Category Filter Indicator */}
              {categoryFilter && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: 'rgba(15, 76, 92, 0.08)',
                    border: '1px solid var(--color-accent-teal-soft)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                    FILTERED: {categoryFilter.toUpperCase()}
                  </span>
                  {onCategoryFilterChange && (
                    <button
                      type="button"
                      onClick={() => onCategoryFilterChange(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Discrete GTFS Upgrade Toolbar */}
              {showUpgradeToolbar && (
                <div
                  style={{
                    marginTop: '2px',
                    padding: '8px 10px',
                    background: 'rgba(15, 76, 92, 0.06)',
                    border: '1px solid var(--color-accent-teal-soft)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LightningIcon size={13} color="var(--color-accent-primary)" />
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                      REAL PUBLIC TRANSIT
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleUpgradeTransit}
                    disabled={upgrading || !isGtfsReady}
                    style={{
                      padding: '3px 8px',
                      background: 'var(--color-accent-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: isGtfsReady ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: upgrading ? 0.7 : 1,
                    }}
                  >
                    {upgrading ? <Spinner size={10} color="#FFFFFF" /> : null}
                    <span>{upgrading ? 'UPGRADING...' : 'APPLY GTFS'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Stops & Waypoints List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {displayedDays.map((dayObj) => {
                const path = dayObj.itinerary?.path || [];
                const transitRec = dayObj.itinerary?.transit_recommendation;

                return (
                  <div key={dayObj.day} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Day Group Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>
                      <span className="font-display" style={{ fontSize: '0.95rem', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        DAY {dayObj.day} {dayObj.theme ? `— ${dayObj.theme}` : ''}
                      </span>
                      <span className="font-mono text-muted" style={{ fontSize: '11px' }}>
                        {path.length} STOPS
                      </span>
                    </div>

                    {/* Transit recommendation if single tickets exceed pass */}
                    {transitRec && path.length > 1 && (transitRec.single_tickets_total_eur || 0) > 0 && (
                      <TransitRecommendationCard recommendation={transitRec} />
                    )}

                    {path.length === 0 && (
                      <div className="font-mono text-muted" style={{ fontSize: '12px', padding: '1rem', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-main)' }}>
                        No scheduled stops for this day. Free exploration.
                      </div>
                    )}

                    {path.map((scheduledPoi: ScheduledPoi, poiIdx: number) => {
                      const p = scheduledPoi.poi;
                      const { start: startTime, end: endTime } = getScheduledPoiTimes(scheduledPoi);
                      const openHours = getPoiOpeningHours(p, dayObj.day);
                      const transitFromPrev = scheduledPoi.transit_from_previous;
                      const stopNum = String(poiIdx + 1).padStart(2, '0');

                      const catType = classifyPoiCategory(p?.category, p?.name).type;
                      const isCatMatch = !categoryFilter || isCategoryMatch(categoryFilter, catType);

                      return (
                        <React.Fragment key={poiIdx}>
                          {/* Transit leg from previous POI */}
                          {transitFromPrev && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '4px 8px',
                                margin: '2px 0 2px 20px',
                                borderLeft: '2px dashed var(--color-accent-teal-soft)',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--color-text-muted)',
                                opacity: isCatMatch ? 1 : 0.35,
                                transition: 'opacity 0.15s ease',
                              }}
                            >
                              {(() => {
                                const isPedestrian = transitFromPrev.mode === 'pedestrian' || transitFromPrev.mode === 'walk';
                                const line = transitFromPrev.steps?.find((s) => s.transit_line)?.transit_line;
                                return (
                                  <>
                                    {isPedestrian ? (
                                      <WalkIcon size={12} color="var(--color-text-muted)" />
                                    ) : (
                                      <TransitIcon size={12} color="var(--color-accent-primary)" />
                                    )}
                                    <span>
                                      {isPedestrian
                                        ? `Walk ~${Math.round(transitFromPrev.duration_mins || 0)}m`
                                        : `Transit ${line ? `Line ${line} ` : ''}~${Math.round(transitFromPrev.duration_mins || 0)}m`}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Waypoint Card */}
                          <div
                            style={{
                              background: 'var(--color-bg-main)',
                              border: isCatMatch
                                ? (categoryFilter ? '1.5px solid var(--color-accent-teal-mid)' : '1px solid var(--color-border)')
                                : '1px dashed var(--color-border)',
                              borderRadius: 'var(--radius-md)',
                              padding: '10px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              boxShadow:
                                isCatMatch && categoryFilter
                                  ? 'var(--shadow-md)'
                                  : 'var(--shadow-sm)',
                              opacity: isCatMatch ? 1 : 0.35,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'var(--color-accent-primary)',
                                    color: '#FFFFFF',
                                    padding: '2px 6px',
                                    borderRadius: 'var(--radius-sm)',
                                  }}
                                >
                                  {stopNum}
                                </span>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                                  {p?.name || 'Waypoint'}
                                </h4>
                              </div>
                              {p?.category && (
                                <PoiCategoryBadge category={p.category} name={p.name} />
                              )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {startTime}
                                {' '}&rarr;{' '}
                                {endTime}
                                {p?.duration_mins ? ` (${p.duration_mins}m)` : ''}
                              </span>
                              {typeof p?.cost_eur === 'number' && p.cost_eur > 0 && (
                                <span style={{ color: 'var(--color-success)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                  {p.cost_eur.toFixed(2)} &euro;
                                </span>
                              )}
                            </div>

                            {openHours && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '-2px' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>&bull;</span>
                                <span>{openHours}</span>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* Floating Edge Collapse Toggle (TREK Style) */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? 'Collapse Itinerary Sidebar' : 'Expand Itinerary Sidebar'}
        title={isOpen ? 'Collapse' : 'Expand Itinerary'}
        style={{
          width: '32px',
          height: '36px',
          alignSelf: 'center',
          marginLeft: isOpen ? '6px' : '0px',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          boxShadow: 'var(--shadow-sm)',
          pointerEvents: 'auto',
          transition: 'color 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-accent-primary)';
          e.currentTarget.style.background = 'var(--color-bg-main)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-muted)';
          e.currentTarget.style.background = 'var(--color-surface-card)';
        }}
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
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </div>
  );
}