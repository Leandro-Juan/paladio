"use client";

import React, { useState, useEffect } from 'react';
import { DayOutput, OptimizationResult, ScheduledPoi } from '@/types/domain';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { TransitRecommendationCard } from '@/components/TransitLegView';
import { Spinner, LightningIcon, WalkIcon, TransitIcon } from '@/components/icons';
import { apiFetch } from '@/utils/api';
import { notify } from '@/utils/notify';

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

  const handleUpgradeTransit = async () => {
    if (upgrading || isUpgraded) return;
    setUpgrading(true);
    try {
      let endpoint = '';
      if (tripId) {
        endpoint = `/trips/${tripId}/upgrade-transit`;
      } else if (destinationCity) {
        endpoint = `/trips/upgrade-transit?city=${encodeURIComponent(destinationCity)}`;
      } else {
        throw new Error('No trip or city identified.');
      }

      const res = await apiFetch<{ itinerary: OptimizationResult; message?: string }>(endpoint, {
        method: 'POST',
      });

      if (res?.itinerary) {
        const updated = {
          ...res.itinerary,
          metadata: {
            ...res.itinerary.metadata,
            transit_upgraded: true,
          },
        };
        if (onItineraryUpdate) onItineraryUpdate(updated);
        notify.success('Transit Upgraded', 'Public transit lines and real schedules integrated.');
        setUpgraded(true);
      }
    } catch (err) {
      console.error(err);
      notify.error('Upgrade Failed', 'Could not upgrade transit directions at this time.');
    } finally {
      setUpgrading(false);
    }
  };

  // Check if any day or leg contains public transit legs
  const hasPublicTransit = React.useMemo(() => {
    return days.some((d) =>
      Boolean(d.itinerary?.transit_recommendation) ||
      d.itinerary?.path?.some((p) => {
        const t = p.transit_from_previous;
        return Boolean(t && (t.mode === 'transit' || (t.cost_eur && t.cost_eur > 0)));
      })
    );
  }, [days]);

  const isGtfsReady = gtfsStatus === 'READY';
  const showUpgradeToolbar = (isGtfsReady || gtfsStatus === 'INDEXING') && !isUpgraded && hasPublicTransit;

  // Filter displayed days based on selectedDay
  const displayedDays = selectedDay === 'all'
    ? days
    : days.filter((d) => d.day === selectedDay);

  // Compute total cost across displayed days
  const totalCost = days.reduce((sum, d) => {
    const dayCost = (d.itinerary?.path || []).reduce((dSum, item) => dSum + (item.poi?.cost_eur || 0), 0);
    return sum + dayCost;
  }, 0);

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        bottom: '12px',
        left: '12px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'stretch',
        pointerEvents: 'none',
      }}
    >
      {/* Panel Body */}
      <aside
        style={{
          width: isOpen ? '380px' : '0px',
          height: '100%',
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
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
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: '380px' }}>
            {/* Header Toolbar */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-mono text-muted" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  {'// ITINERARY TIMELINE'}
                </span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: '#1E3A8A', fontWeight: 700 }}>
                  EST. {totalCost.toFixed(2)} &euro;
                </span>
              </div>

              {/* Day Selection Tabs */}
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                <button
                  type="button"
                  onClick={() => onSelectDay('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: selectedDay === 'all' ? '#1E3A8A' : '#E2E8F0',
                    background: selectedDay === 'all' ? '#1E3A8A' : '#FFFFFF',
                    color: selectedDay === 'all' ? '#FFFFFF' : '#475569',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: selectedDay === 'all' ? '0 1px 3px rgba(30, 58, 138, 0.2)' : 'none',
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
                      onClick={() => onSelectDay(d.day)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: isSel ? '#1E3A8A' : '#E2E8F0',
                        background: isSel ? '#1E3A8A' : '#FFFFFF',
                        color: isSel ? '#FFFFFF' : '#475569',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: isSel ? '0 1px 3px rgba(30, 58, 138, 0.2)' : 'none',
                      }}
                    >
                      DAY {d.day}
                    </button>
                  );
                })}
              </div>

              {/* Active Category Filter Indicator */}
              {categoryFilter && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: 'rgba(30, 58, 138, 0.06)',
                    border: '1px solid rgba(30, 58, 138, 0.18)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                >
                  <span style={{ color: '#1E3A8A', fontWeight: 600 }}>
                    FILTERED: {categoryFilter.toUpperCase()}
                  </span>
                  {onCategoryFilterChange && (
                    <button
                      type="button"
                      onClick={() => onCategoryFilterChange(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748B',
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
                    background: 'rgba(30, 58, 138, 0.05)',
                    border: '1px solid rgba(30, 58, 138, 0.15)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LightningIcon size={13} color="#1E3A8A" />
                    <span className="font-mono" style={{ fontSize: '11px', color: '#1E3A8A', fontWeight: 600 }}>
                      REAL PUBLIC TRANSIT
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleUpgradeTransit}
                    disabled={upgrading || !isGtfsReady}
                    style={{
                      padding: '3px 8px',
                      background: '#1E3A8A',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      cursor: isGtfsReady ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: upgrading ? 0.7 : 1,
                    }}
                  >
                    {upgrading ? <Spinner size={10} color="#FFF" /> : null}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                      <span className="font-display" style={{ fontSize: '0.95rem', color: '#1E3A8A', fontWeight: 700 }}>
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
                      <div className="font-mono text-muted" style={{ fontSize: '12px', padding: '1rem', textAlign: 'center', border: '1px dashed #CBD5E1', borderRadius: '6px', background: '#F8FAFC' }}>
                        No scheduled stops for this day. Free exploration.
                      </div>
                    )}

                    {/* POI Cards */}
                    {path.map((scheduledPoi: ScheduledPoi, poiIdx: number) => {
                      const p = scheduledPoi.poi;
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
                                borderLeft: '2px dashed #93C5FD',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                color: '#64748B',
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
                                      <WalkIcon size={12} color="#64748B" />
                                    ) : (
                                      <TransitIcon size={12} color="#1E3A8A" />
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
                              background: '#FFFFFF',
                              border: isCatMatch
                                ? (categoryFilter ? '1.5px solid #2563EB' : '1px solid #E2E8F0')
                                : '1px dashed #CBD5E1',
                              borderRadius: '10px',
                              padding: '10px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              boxShadow:
                                isCatMatch && categoryFilter
                                  ? '0 2px 10px rgba(37, 99, 235, 0.12)'
                                  : '0 1px 3px rgba(15, 23, 42, 0.04)',
                              opacity: isCatMatch ? 1 : 0.35,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: '#1E3A8A',
                                    color: '#FFFFFF',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {stopNum}
                                </span>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0F172A', fontWeight: 600 }}>
                                  {p?.name || 'Waypoint'}
                                </h4>
                              </div>
                              {p?.category && (
                                <PoiCategoryBadge category={p.category} name={p.name} />
                              )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'monospace', color: '#64748B', marginTop: '2px' }}>
                              <span>
                                {scheduledPoi.arrival_time ? scheduledPoi.arrival_time.substring(11, 16) : '--:--'}
                                {' '}&rarr;{' '}
                                {scheduledPoi.departure_time ? scheduledPoi.departure_time.substring(11, 16) : '--:--'}
                                {p?.duration_mins ? ` (${p.duration_mins}m)` : ''}
                              </span>
                              {typeof p?.cost_eur === 'number' && p.cost_eur > 0 && (
                                <span style={{ color: '#059669', fontWeight: 600 }}>
                                  {p.cost_eur.toFixed(2)} &euro;
                                </span>
                              )}
                            </div>
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
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#475569',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
          pointerEvents: 'auto',
          transition: 'color 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#1E3A8A';
          e.currentTarget.style.background = '#F8FAFC';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#475569';
          e.currentTarget.style.background = '#FFFFFF';
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
