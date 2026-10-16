"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DayOutput, OptimizationResult, ScheduledPoi } from '@/types/domain';
import { PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { classifyPoiCategory, isCategoryMatch, PoiCategoryType } from '@/utils/poiCategory';
import { TransitRecommendationCard } from '@/components/TransitLegView';
import {
  Spinner,
  LightningIcon,
  WalkIcon,
  TransitIcon,
  GripVerticalIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CpuIcon,
} from '@/components/icons';
import { apiFetch } from '@/utils/api';
import { notify } from '@/utils/notify';
import { getScheduledPoiTimes, getPoiOpeningHours } from '@/utils/date';
import { useTrips } from '@/hooks/useTrips';

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

  // C++ Route Re-optimization and Drag-Drop state
  const { updateTrip, reoptimizeTrip } = useTrips();
  const [reoptimizing, setReoptimizing] = useState(false);
  const [activeDropTarget, setActiveDropTarget] = useState<{ day: number; index: number } | null>(null);
  const [hasManualChanges, setHasManualChanges] = useState(false);
  const [draggedPoi, setDraggedPoi] = useState<{ day: number; index: number } | null>(null);

  // Auto-scroll and solid drag preview refs & state
  const scrollListRef = useRef<HTMLDivElement>(null);
  const scrollVelocityRef = useRef<number>(0);
  const scrollRafRef = useRef<number | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const [activeDragItem, setActiveDragItem] = useState<{
    name: string;
    stopNum: string;
    category?: string;
    startTime: string;
    endTime: string;
    durationMins?: number;
    costEur?: number;
    openHours?: string | null;
    width: number;
    initialX: number;
    initialY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const activeDragItemRef = useRef<typeof activeDragItem>(null);
  const draggedPoiRef = useRef<typeof draggedPoi>(null);

  useEffect(() => {
    activeDragItemRef.current = activeDragItem;
    draggedPoiRef.current = draggedPoi;
  }, [activeDragItem, draggedPoi]);

  const stopAutoScroll = useCallback(() => {
    scrollVelocityRef.current = 0;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  const startAutoScrollLoop = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    const step = () => {
      if (scrollVelocityRef.current !== 0 && scrollListRef.current) {
        scrollListRef.current.scrollTop += scrollVelocityRef.current;
        scrollRafRef.current = requestAnimationFrame(step);
      } else {
        scrollRafRef.current = null;
      }
    };
    scrollRafRef.current = requestAnimationFrame(step);
  }, []);

  const handlePointerDragScroll = useCallback((clientY: number, clientX: number) => {
    const container = scrollListRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // Check horizontal bounds (allow 60px tolerance outside container)
    if (clientX < rect.left - 60 || clientX > rect.right + 60) {
      if (scrollVelocityRef.current !== 0) {
        scrollVelocityRef.current = 0;
      }
      return;
    }

    const edgeZone = 80;
    if (clientY > rect.bottom - edgeZone && clientY <= rect.bottom + 120) {
      // Dragging down near or slightly below bottom edge
      const intensity = Math.min(1.8, Math.max(0.1, (clientY - (rect.bottom - edgeZone)) / edgeZone));
      scrollVelocityRef.current = Math.round(intensity * 18);
      startAutoScrollLoop();
    } else if (clientY < rect.top + edgeZone && clientY >= rect.top - 100) {
      // Dragging up near or slightly above top edge
      const intensity = Math.min(1.8, Math.max(0.1, ((rect.top + edgeZone) - clientY) / edgeZone));
      scrollVelocityRef.current = -Math.round(intensity * 18);
      startAutoScrollLoop();
    } else {
      scrollVelocityRef.current = 0;
    }
  }, [startAutoScrollLoop]);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;

      // Update position of solid preview card if active
      if (dragPreviewRef.current && activeDragItemRef.current) {
        const left = e.clientX - activeDragItemRef.current.offsetX;
        const top = e.clientY - activeDragItemRef.current.offsetY;
        dragPreviewRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      }

      // Check auto-scroll for itinerary list
      handlePointerDragScroll(e.clientY, e.clientX);
    };

    const handleGlobalDragEnd = () => {
      stopAutoScroll();
      setActiveDragItem(null);
      setDraggedPoi(null);
      setActiveDropTarget(null);
    };

    window.addEventListener('dragover', handleGlobalDragOver, { capture: true });
    window.addEventListener('dragend', handleGlobalDragEnd, { capture: false });
    window.addEventListener('drop', handleGlobalDragEnd, { capture: false });

    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, { capture: true });
      window.removeEventListener('dragend', handleGlobalDragEnd, { capture: false });
      window.removeEventListener('drop', handleGlobalDragEnd, { capture: false });
      stopAutoScroll();
    };
  }, [handlePointerDragScroll, stopAutoScroll]);

  const formatTimeHHMM = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const recalculateDayTiming = (path: ScheduledPoi[]) => {
    let curClock = 540; // 09:00 default
    for (let k = 0; k < path.length; k++) {
      const item = path[k];
      const dur = item.poi?.duration_mins || 60;
      item.scheduled_start = formatTimeHHMM(curClock);
      curClock += dur;
      item.scheduled_end = formatTimeHHMM(curClock);
      curClock += 15; // default 15m transit buffer between stops
    }
  };

  const handleReoptimizeRoute = async () => {
    if (reoptimizing) return;
    if (!tripId) {
      notify.error('No Trip ID', 'Trip must be saved before re-optimizing with C++ engine.');
      return;
    }

    setReoptimizing(true);
    try {
      const res = await reoptimizeTrip(tripId, itinerary ? { itinerary_data: itinerary } : undefined);
      const updatedItin = res?.itinerary_data as OptimizationResult | undefined;
      if (updatedItin && onItineraryUpdate) {
        onItineraryUpdate(updatedItin);
      }
      setHasManualChanges(false);
      notify.success(
        'Route Re-optimized',
        'Deterministic C++20 engine solved TSPTW sequence and time windows.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'C++ Route Re-optimization failed';
      notify.error('Re-optimization Failed', msg);
    } finally {
      setReoptimizing(false);
    }
  };

  const handleMoveStop = (targetDayNum: number, sourceIdx: number, direction: 'up' | 'down') => {
    if (!itinerary || !onItineraryUpdate) return;
    const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
    const targetDayObj = clonedItin.days?.find((d) => (d.day ?? 1) === targetDayNum);
    if (!targetDayObj?.itinerary?.path) return;

    const path = targetDayObj.itinerary.path;
    const destIdx = direction === 'up' ? sourceIdx - 1 : sourceIdx + 1;
    if (destIdx < 0 || destIdx >= path.length) return;

    const [moved] = path.splice(sourceIdx, 1);
    path.splice(destIdx, 0, moved);

    recalculateDayTiming(path);
    onItineraryUpdate(clonedItin);
    setHasManualChanges(true);
    if (tripId) {
      updateTrip(tripId, { itinerary_data: clonedItin });
    }
  };

  const handleDrop = async (
    e: React.DragEvent,
    targetDayNum: number,
    targetIndex: number,
    cardPoiIdx?: number,
    isTopHalf?: boolean
  ) => {
    e.preventDefault();
    e.stopPropagation();
    stopAutoScroll();
    setActiveDragItem(null);
    setActiveDropTarget(null);
    setDraggedPoi(null);

    const searchDataStr = e.dataTransfer.getData('application/paladio-poi');
    const itinDataStr = e.dataTransfer.getData('application/paladio-itinerary-poi');
    const windowSearchPoi = typeof window !== 'undefined'
      ? (window as unknown as { __paladioActiveSearchPoi?: { poi?: unknown } }).__paladioActiveSearchPoi
      : null;

    if (!itinerary || !onItineraryUpdate) return;

    const clonedItin: OptimizationResult = JSON.parse(JSON.stringify(itinerary));
    if (!clonedItin.days) clonedItin.days = [];

    let targetDayObj = clonedItin.days.find((d) => (d.day ?? 1) === targetDayNum);
    if (!targetDayObj) {
      targetDayObj = { day: targetDayNum, itinerary: { path: [] } };
      clonedItin.days.push(targetDayObj);
    }
    if (!targetDayObj.itinerary) targetDayObj.itinerary = { path: [] };
    if (!targetDayObj.itinerary.path) targetDayObj.itinerary.path = [];

    if (searchDataStr || windowSearchPoi) {
      try {
        const parsed = searchDataStr ? JSON.parse(searchDataStr) : windowSearchPoi;
        const rawPoi = parsed?.poi;
        if (!rawPoi) return;

        const newStop: ScheduledPoi = {
          poi: {
            id: rawPoi.id,
            name: rawPoi.name,
            city: destinationCity || 'City',
            category: rawPoi.category || 'attraction',
            location: rawPoi.location || { latitude: 0, longitude: 0 },
            duration_mins: rawPoi.duration_mins || 60,
            cost_eur: rawPoi.cost_eur || 0,
          },
          scheduled_start: '09:00',
          scheduled_end: '10:00',
        };

        let insertIdx = targetIndex;
        if (cardPoiIdx !== undefined) {
          insertIdx = isTopHalf ? cardPoiIdx : cardPoiIdx + 1;
        }
        insertIdx = Math.max(0, Math.min(insertIdx, targetDayObj.itinerary.path.length));
        targetDayObj.itinerary.path.splice(insertIdx, 0, newStop);

        recalculateDayTiming(targetDayObj.itinerary.path);
        onItineraryUpdate(clonedItin);
        setHasManualChanges(true);

        if (tripId) {
          updateTrip(tripId, { itinerary_data: clonedItin });
        }

        notify.success(
          'Place Added to Itinerary',
          `Added "${rawPoi.name}" to Day ${targetDayNum}. Re-optimize to solve the optimal schedule.`
        );
      } catch (err) {
        console.error('Failed to add dragged POI', err);
      } finally {
        if (typeof window !== 'undefined') {
          delete (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi;
        }
      }
    } else if (itinDataStr || draggedPoiRef.current) {
      try {
        const raw = itinDataStr || (draggedPoiRef.current ? JSON.stringify(draggedPoiRef.current) : null);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const srcDayNum = parsed.day;
        const srcIdx = parsed.index;

        const srcDayObj = clonedItin.days.find((d) => (d.day ?? 1) === srcDayNum);
        if (!srcDayObj?.itinerary?.path) return;

        // If dragging within the same day
        if (srcDayNum === targetDayNum) {
          const path = srcDayObj.itinerary.path;
          let newTargetIndex: number;

          if (cardPoiIdx !== undefined) {
            // Dropped directly on a card
            if (srcIdx === cardPoiIdx) {
              return;
            }
            if (srcIdx < cardPoiIdx) {
              // Dragging DOWN onto cardPoiIdx
              if (cardPoiIdx === srcIdx + 1) {
                // Adjacent item -> swap
                newTargetIndex = cardPoiIdx;
              } else {
                newTargetIndex = isTopHalf ? cardPoiIdx - 1 : cardPoiIdx;
              }
            } else {
              // Dragging UP onto cardPoiIdx
              if (cardPoiIdx === srcIdx - 1) {
                // Adjacent item -> swap
                newTargetIndex = cardPoiIdx;
              } else {
                newTargetIndex = isTopHalf ? cardPoiIdx : cardPoiIdx + 1;
              }
            }
          } else {
            // Dropped on a slot between cards or at end
            newTargetIndex = srcIdx < targetIndex ? targetIndex - 1 : targetIndex;
          }

          newTargetIndex = Math.max(0, Math.min(newTargetIndex, path.length - 1));

          if (newTargetIndex === srcIdx) {
            return;
          }

          const [movedItem] = path.splice(srcIdx, 1);
          if (!movedItem) return;
          path.splice(newTargetIndex, 0, movedItem);

          recalculateDayTiming(path);
          onItineraryUpdate(clonedItin);
          setHasManualChanges(true);

          if (tripId) {
            updateTrip(tripId, { itinerary_data: clonedItin });
          }

          notify.info(
            'Stop Reordered',
            `Moved "${movedItem.poi?.name}" to position ${newTargetIndex + 1}.`
          );
          return;
        }

        // Cross-day move
        const [movedItem] = srcDayObj.itinerary.path.splice(srcIdx, 1);
        if (!movedItem) return;

        let insertIdx = targetIndex;
        if (cardPoiIdx !== undefined) {
          insertIdx = isTopHalf ? cardPoiIdx : cardPoiIdx + 1;
        }
        insertIdx = Math.max(0, Math.min(insertIdx, targetDayObj.itinerary.path.length));

        targetDayObj.itinerary.path.splice(insertIdx, 0, movedItem);

        recalculateDayTiming(srcDayObj.itinerary.path);
        recalculateDayTiming(targetDayObj.itinerary.path);

        onItineraryUpdate(clonedItin);
        setHasManualChanges(true);

        if (tripId) {
          updateTrip(tripId, { itinerary_data: clonedItin });
        }

        notify.info(
          'Stop Moved',
          `Moved "${movedItem.poi?.name}" to Day ${targetDayNum}.`
        );
      } catch (err) {
        console.error('Failed to reorder itinerary stop', err);
      }
    }
  };

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
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = dayTabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    setIsOverflowing(el.scrollWidth > el.clientWidth + 2);
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

  const showScrollArrows = days.length > 4 || isOverflowing;

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
          width: isOpen ? 'min(380px, calc(100vw - 32px))' : '0px',
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
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: 'min(380px, calc(100vw - 32px))', minWidth: 0 }}>
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
                  onScroll={checkScroll}
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

              {/* C++ Route Re-Optimization Action Card */}
              <div
                style={{
                  marginTop: '4px',
                  padding: '8px 10px',
                  background: 'var(--color-bg-main)',
                  border: hasManualChanges ? '1.5px solid var(--color-accent-primary)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  boxShadow: hasManualChanges ? '0 2px 8px rgba(15, 76, 92, 0.15)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <CpuIcon size={14} color="var(--color-accent-primary)" />
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-primary)', fontWeight: 700 }}>
                      RE-OPTIMIZE ROUTE
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9.5px',
                        letterSpacing: '0.06em',
                        background: 'rgba(15, 76, 92, 0.12)',
                        color: 'var(--color-accent-primary)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontWeight: 700,
                      }}
                    >
                      C++20 TSPTW
                    </span>
                  </div>
                  {hasManualChanges && (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                      Manual changes made · Solve optimal sequence &amp; times
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleReoptimizeRoute}
                  disabled={reoptimizing}
                  style={{
                    padding: '5px 10px',
                    background: 'var(--color-accent-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '10.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: reoptimizing ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: 'var(--shadow-sm)',
                    whiteSpace: 'nowrap',
                    opacity: reoptimizing ? 0.75 : 1,
                  }}
                  title="Run deterministic C++20 optimization on current stops"
                >
                  {reoptimizing ? <Spinner size={11} color="#FFFFFF" /> : <LightningIcon size={12} color="#FFFFFF" />}
                  <span>{reoptimizing ? 'SOLVING...' : 'SOLVE ROUTE'}</span>
                </button>
              </div>
            </div>

            {/* Stops & Waypoints List */}
            <div
              ref={scrollListRef}
              onDragOver={(e) => {
                e.preventDefault();
                handlePointerDragScroll(e.clientY, e.clientX);
              }}
              style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {displayedDays.map((dayObj) => {
                const path = dayObj.itinerary?.path || [];
                const transitRec = dayObj.itinerary?.transit_recommendation;

                return (
                  <div key={dayObj.day} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

                    {/* Empty Day Drop Target */}
                    {path.length === 0 && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setActiveDropTarget({ day: dayObj.day, index: 0 });
                        }}
                        onDragLeave={() => {
                          if (activeDropTarget?.day === dayObj.day && activeDropTarget?.index === 0) {
                            setActiveDropTarget(null);
                          }
                        }}
                        onDrop={(e) => handleDrop(e, dayObj.day, 0)}
                        className="font-mono text-muted"
                        style={{
                          fontSize: '11.5px',
                          padding: '1.5rem 1rem',
                          textAlign: 'center',
                          border: activeDropTarget?.day === dayObj.day && activeDropTarget?.index === 0
                            ? '2px dashed var(--color-accent-primary)'
                            : '1px dashed var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          background: activeDropTarget?.day === dayObj.day && activeDropTarget?.index === 0
                            ? 'rgba(15, 76, 92, 0.08)'
                            : 'var(--color-bg-main)',
                          color: activeDropTarget?.day === dayObj.day && activeDropTarget?.index === 0
                            ? 'var(--color-accent-primary)'
                            : 'var(--color-text-muted)',
                          transition: 'all 0.16s ease',
                          cursor: 'pointer',
                        }}
                      >
                        {activeDropTarget?.day === dayObj.day && activeDropTarget?.index === 0
                          ? '+ DROP PLACE HERE TO SCHEDULE'
                          : 'Nothing planned. Drag a place here from the right search tab.'}
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
                      const isThisDropSlot = activeDropTarget?.day === dayObj.day && activeDropTarget?.index === poiIdx;
                      const isBeingDragged = draggedPoi?.day === dayObj.day && draggedPoi?.index === poiIdx;

                      return (
                        <React.Fragment key={poiIdx}>
                          {/* Drop insertion slot before this stop */}
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              setActiveDropTarget({ day: dayObj.day, index: poiIdx });
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              if (activeDropTarget?.day === dayObj.day && activeDropTarget?.index === poiIdx) {
                                setActiveDropTarget(null);
                              }
                            }}
                            onDrop={(e) => handleDrop(e, dayObj.day, poiIdx)}
                            style={{
                              height: isThisDropSlot ? '26px' : '6px',
                              margin: isThisDropSlot ? '2px 0' : '-3px 0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                              zIndex: 10,
                            }}
                          >
                            {isThisDropSlot && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '2.5px',
                                  borderRadius: '2px',
                                  background: 'var(--color-accent-primary)',
                                  boxShadow: '0 0 8px rgba(15, 76, 92, 0.4)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <span
                                  className="font-mono"
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    background: 'var(--color-accent-primary)',
                                    color: '#FFFFFF',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  INSERT STOP #{poiIdx + 1}
                                </span>
                              </div>
                            )}
                          </div>

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

                          {/* Draggable Waypoint Card & Drop Target */}
                          <div
                            draggable={true}
                            onDragStart={(e) => {
                              const poiInfo = { day: dayObj.day, index: poiIdx };
                              setDraggedPoi(poiInfo);
                              draggedPoiRef.current = poiInfo;
                              e.dataTransfer.setData(
                                'application/paladio-itinerary-poi',
                                JSON.stringify(poiInfo)
                              );
                              e.dataTransfer.effectAllowed = 'copyMove';

                              // Suppress browser translucent ghost & file icon using pre-rendered 1x1 image
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

                              setActiveDragItem({
                                name: p?.name || 'Waypoint',
                                stopNum,
                                category: p?.category,
                                startTime,
                                endTime,
                                durationMins: p?.duration_mins,
                                costEur: p?.cost_eur,
                                openHours,
                                width: rect.width,
                                initialX: e.clientX,
                                initialY: e.clientY,
                                offsetX,
                                offsetY,
                              });
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              const rect = e.currentTarget.getBoundingClientRect();
                              const isTopHalf = e.clientY < rect.top + rect.height / 2;
                              const targetIdx = isTopHalf ? poiIdx : poiIdx + 1;
                              setActiveDropTarget({ day: dayObj.day, index: targetIdx });
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const isTopHalf = e.clientY < rect.top + rect.height / 2;
                              const targetIdx = isTopHalf ? poiIdx : poiIdx + 1;
                              handleDrop(e, dayObj.day, targetIdx, poiIdx, isTopHalf);
                            }}
                            onDragEnd={() => {
                              stopAutoScroll();
                              setActiveDragItem(null);
                              setDraggedPoi(null);
                              draggedPoiRef.current = null;
                              setActiveDropTarget(null);
                            }}
                            style={{
                              background: isBeingDragged ? 'rgba(15, 76, 92, 0.04)' : 'var(--color-bg-main)',
                              border: isBeingDragged
                                ? '1.5px dashed var(--color-accent-teal-soft)'
                                : isCatMatch
                                  ? (categoryFilter ? '1.5px solid var(--color-accent-teal-mid)' : '1px solid var(--color-border)')
                                  : '1px dashed var(--color-border)',
                              borderRadius: 'var(--radius-md)',
                              padding: '10px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              boxShadow:
                                isBeingDragged
                                  ? 'none'
                                  : isCatMatch && categoryFilter
                                    ? 'var(--shadow-md)'
                                    : 'var(--shadow-sm)',
                              opacity: isBeingDragged ? 0.45 : (isCatMatch ? 1 : 0.35),
                              cursor: 'grab',
                              transform: isBeingDragged ? 'scale(0.98)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* 6-dot drag grip handle */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'grab',
                                  }}
                                  title="Drag to reorder stop"
                                >
                                  <GripVerticalIcon size={14} color="var(--color-text-muted)" />
                                </div>

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

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {p?.category && (
                                  <PoiCategoryBadge category={p.category} name={p.name} />
                                )}
                                {/* Accessible Up/Down Reorder Controls */}
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveStop(dayObj.day, poiIdx, 'up');
                                    }}
                                    disabled={poiIdx === 0}
                                    style={{
                                      background: 'none',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '3px',
                                      padding: '2px',
                                      cursor: poiIdx === 0 ? 'not-allowed' : 'pointer',
                                      opacity: poiIdx === 0 ? 0.3 : 0.8,
                                      display: 'flex',
                                      alignItems: 'center',
                                      color: 'var(--color-text-muted)',
                                    }}
                                    title="Move stop up"
                                    aria-label={`Move stop ${p?.name || 'Waypoint'} up`}
                                  >
                                    <ChevronUpIcon size={11} color="currentColor" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveStop(dayObj.day, poiIdx, 'down');
                                    }}
                                    disabled={poiIdx === path.length - 1}
                                    style={{
                                      background: 'none',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '3px',
                                      padding: '2px',
                                      cursor: poiIdx === path.length - 1 ? 'not-allowed' : 'pointer',
                                      opacity: poiIdx === path.length - 1 ? 0.3 : 0.8,
                                      display: 'flex',
                                      alignItems: 'center',
                                      color: 'var(--color-text-muted)',
                                    }}
                                    title="Move stop down"
                                    aria-label={`Move stop ${p?.name || 'Waypoint'} down`}
                                  >
                                    <ChevronDownIcon size={11} color="currentColor" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '2px', paddingLeft: '22px' }}>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '-2px', paddingLeft: '22px' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>&bull;</span>
                                <span>{openHours}</span>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}

                    {/* Drop insertion slot at the end of the day */}
                    {path.length > 0 && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          setActiveDropTarget({ day: dayObj.day, index: path.length });
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length) {
                            setActiveDropTarget(null);
                          }
                        }}
                        onDrop={(e) => handleDrop(e, dayObj.day, path.length)}
                        style={{
                          height: activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length ? '26px' : '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          marginTop: '2px',
                        }}
                      >
                        {activeDropTarget?.day === dayObj.day && activeDropTarget?.index === path.length && (
                          <div
                            style={{
                              width: '100%',
                              height: '2.5px',
                              borderRadius: '2px',
                              background: 'var(--color-accent-primary)',
                              boxShadow: '0 0 8px rgba(15, 76, 92, 0.4)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span
                              className="font-mono"
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                background: 'var(--color-accent-primary)',
                                color: '#FFFFFF',
                                padding: '1px 6px',
                                borderRadius: '3px',
                                letterSpacing: '0.04em',
                              }}
                            >
                              APPEND AT END OF DAY {dayObj.day}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
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
      {/* 100% Solid Drag Preview Overlay */}
      {activeDragItem && typeof document !== 'undefined' && createPortal(
        <div
          ref={dragPreviewRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: `${activeDragItem.width}px`,
            pointerEvents: 'none',
            zIndex: 99999,
            transform: `translate3d(${activeDragItem.initialX - activeDragItem.offsetX}px, ${activeDragItem.initialY - activeDragItem.offsetY}px, 0)`,
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

              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'var(--color-accent-primary)',
                  color: '#FFFFFF',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                }}
              >
                {activeDragItem.stopNum}
              </span>
              <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeDragItem.name}
              </h4>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {activeDragItem.category && (
                <PoiCategoryBadge category={activeDragItem.category} name={activeDragItem.name} />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '2px', paddingLeft: '22px' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {activeDragItem.startTime}
              {' '}&rarr;{' '}
              {activeDragItem.endTime}
              {activeDragItem.durationMins ? ` (${activeDragItem.durationMins}m)` : ''}
            </span>
            {typeof activeDragItem.costEur === 'number' && activeDragItem.costEur > 0 && (
              <span style={{ color: 'var(--color-success)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {activeDragItem.costEur.toFixed(2)} &euro;
              </span>
            )}
          </div>

          {activeDragItem.openHours && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '-2px', paddingLeft: '22px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>&bull;</span>
              <span>{activeDragItem.openHours}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}