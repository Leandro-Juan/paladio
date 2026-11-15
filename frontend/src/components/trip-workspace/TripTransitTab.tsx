'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, triggerGtfsCompileApi } from '@/utils/api';
import { notify } from '@/utils/notify';
import { BookmarkIcon, CompassIcon, ChevronLeftIcon, ChevronRightIcon, RadarIcon } from '@/components/icons';
import { getTripDayDate } from '@/utils/date';
import { registerTransitLineColor } from '@/utils/transitColors';
import type { SpatialCircleFilter } from './TripMapView';
import { SpatialFilterCard } from './SpatialFilterCard';
import {
  TripTransitDirectionsView,
  DirectionsRouteResult,
} from './TripTransitDirectionsView';

export interface TripTransitTabProps {
  tripId?: string;
  tripStartDate?: string;
  destinationCity: string;
  selectedDay: number | 'all';
  tripDays?: Array<{
    day_number: number;
    pois: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      category?: string;
    }>;
  }>;
  hotel?: { name: string; address?: string; lat?: number; lng?: number } | null;
  airport?: { name: string; iata?: string; lat?: number; lng?: number } | null;
  savedPoiIds: Set<string>;
  onToggleSavePoi: (id: string) => void;
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
  onFocusFromInspector?: (poi: {
    id?: string;
    lat: number;
    lng: number;
    name: string;
    category: string;
    durationMins?: number;
    costEur?: number;
  }) => void;
  activeMapPickField?: 'origin' | 'destination' | null;
  onStartMapPick?: (field: 'origin' | 'destination') => void;
  onCancelMapPick?: () => void;
  onRouteCalculated?: (
    routeResult: DirectionsRouteResult | null,
    activeMode: 'primary' | 'alternative'
  ) => void;
  spatialCircle?: SpatialCircleFilter | null;
  onSpatialCircleChange?: (circle: SpatialCircleFilter | null) => void;
  isDroppingWaypoint?: boolean;
  onToggleDropWaypoint?: () => void;
  onClearSpatialCircle?: () => void;
}

export type TransitSubView = 'directions' | 'lines' | 'nearby';
export type TransitModeFilter = 'metro' | 'rail' | 'tram' | 'bus';

interface TransitLineChip {
  line_id: string;
  short_name: string;
  mode: string;
  color: string;
  text_color: string;
}

interface TransitStationSummary {
  id: string;
  name: string;
  original_name?: string | null;
  lat: number;
  lon: number;
  wheelchair_boarding?: number | null;
  stop_count: number;
  lines: TransitLineChip[];
  distance_meters?: number;
  walk_mins?: number;
}

interface NearbyAnchorGroup {
  anchor_id: string;
  anchor_name: string;
  anchor_type: string;
  stations: TransitStationSummary[];
}

interface TransitLineItem {
  id: string;
  agency_id?: string | null;
  short_name?: string | null;
  long_name?: string | null;
  mode: string;
  color: string;
  text_color: string;
  color_source: string;
  station_count: number;
}

interface StationDeparture {
  line_id: string;
  line_short_name: string;
  mode: string;
  color: string;
  text_color: string;
  headsign?: string | null;
  departure_seconds: number;
}

function formatDepartureSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const isNextDay = h >= 24;
  const displayH = String(h % 24).padStart(2, '0');
  const displayM = String(m).padStart(2, '0');
  return `${displayH}:${displayM}${isNextDay ? ' (+1)' : ''}`;
}

export const ALL_TRANSIT_MODES: TransitModeFilter[] = ['metro', 'rail', 'tram', 'bus'];

export function TripTransitTab({
  tripId,
  tripStartDate,
  destinationCity,
  selectedDay,
  tripDays = [],
  hotel,
  airport,
  savedPoiIds,
  onToggleSavePoi,
  onInspectPoi,
  onFocusFromInspector,
  activeMapPickField,
  onStartMapPick,
  onCancelMapPick,
  onRouteCalculated,
  spatialCircle,
  onSpatialCircleChange,
  isDroppingWaypoint,
  onToggleDropWaypoint,
  onClearSpatialCircle,
}: TripTransitTabProps) {
  const [subView, setSubView] = useState<TransitSubView>(() => (spatialCircle ? 'nearby' : 'directions'));

  // Switch to nearby subview when spatial circle filter is activated
  useEffect(() => {
    if (spatialCircle) {
      const timer = setTimeout(() => {
        setSubView('nearby');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [spatialCircle]);

  // Broadcast active transit sub-view so TripMapView only loads bbox stations in Nearby mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('paladio:transit-subview', { detail: { subView } }));
    }
  }, [subView]);
  const [activeModes, setActiveModes] = useState<Set<TransitModeFilter>>(
    new Set(ALL_TRANSIT_MODES)
  );
  const [transitStatus, setTransitStatus] = useState<string>('CHECKING');
  const [coveredRange, setCoveredRange] = useState<{ start: string; end: string } | null>(null);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Data states
  const [nearbyGroups, setNearbyGroups] = useState<NearbyAnchorGroup[]>([]);
  const [lines, setLines] = useState<TransitLineItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

  // Drill-in station state
  const [drillStationId, setDrillStationId] = useState<string | null>(null);
  const [stationDetail, setStationDetail] = useState<Record<string, unknown> | null>(null);
  const [departures, setDepartures] = useState<StationDeparture[]>([]);
  const [departureTimeSeconds, setDepartureTimeSeconds] = useState<number>(32400); // Default to 09:00 AM morning schedule
  const [isLoadingDrill, setIsLoadingDrill] = useState<boolean>(false);

  // 1. Fetch Availability
  const fetchAvailability = useCallback(async () => {
    if (!destinationCity && !tripId) return;
    try {
      let endpoint = '';
      if (tripId) {
        endpoint = `/trips/${tripId}/transit/availability`;
      } else {
        endpoint = `/trips/transit-status?city=${encodeURIComponent(destinationCity)}`;
      }

      const data = await apiFetch<{
        city?: string;
        gtfs_status?: string;
        derived_status?: string;
        status?: string;
        capabilities?: Record<string, unknown>;
        feed_valid_to?: string | null;
        valid_until?: string | null;
      }>(endpoint);

      const vu = data.feed_valid_to || data.valid_until;
      let expired = false;
      if (vu) {
        const exp = new Date(vu).getTime();
        expired = Number.isFinite(exp) && exp < Date.now();
        setIsExpired(expired);
      }

      const ds = (data.derived_status || '').toUpperCase();
      const gs = (data.gtfs_status || '').toUpperCase();
      const st = (data.status || '').toUpperCase();

      let resolved = 'NOT_REQUESTED';
      if (ds === 'READY' || gs === 'READY') {
        resolved = ds === 'READY' ? (expired ? 'EXPIRED' : 'READY') : 'BUILDING';
      } else if (ds === 'BUILDING' || gs === 'BUILDING' || st === 'BUILDING') {
        resolved = 'BUILDING';
      } else if (ds === 'QUEUED' || gs === 'QUEUED' || st === 'QUEUED') {
        resolved = 'QUEUED';
      } else if (ds === 'FAILED' || gs === 'FAILED' || st === 'FAILED') {
        resolved = 'FAILED';
      } else if (ds === 'UNAVAILABLE' || gs === 'UNAVAILABLE') {
        resolved = 'UNAVAILABLE';
      } else {
        resolved = ds || gs || st || 'NOT_REQUESTED';
      }

      setTransitStatus(resolved);

      const capRange = (data.capabilities as { covered_date_range?: { start: string; end: string } })?.covered_date_range;
      if (capRange) setCoveredRange(capRange);
    } catch {
      setTransitStatus('UNAVAILABLE');
    }
  }, [tripId, destinationCity]);

  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      if (!isCancelled) await fetchAvailability();
    };
    void run();

    let interval: NodeJS.Timeout | null = null;
    if (['BUILDING', 'QUEUED', 'CHECKING'].includes(transitStatus) || isDownloading) {
      interval = setInterval(() => {
        if (!isCancelled) void fetchAvailability();
      }, 3000);
    }
    return () => {
      isCancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [fetchAvailability, transitStatus, isDownloading]);

  // Listen to background transit events for instant real-time updates
  useEffect(() => {
    const onTransitUpdate = (e: Event) => {
      const customEvt = e as CustomEvent<{ city?: string; city_name?: string }>;
      const eventCity = customEvt.detail?.city || customEvt.detail?.city_name;
      if (!eventCity || !destinationCity || eventCity.toLowerCase() === destinationCity.toLowerCase()) {
        void fetchAvailability();
      }
    };

    window.addEventListener('paladio:transit_event', onTransitUpdate);
    window.addEventListener('paladio:transit_download_started', onTransitUpdate);
    window.addEventListener('paladio:transit_tiles_ready', onTransitUpdate);
    window.addEventListener('paladio:transit_derivation_ready', onTransitUpdate);
    window.addEventListener('paladio:transit_compile_failed', onTransitUpdate);

    return () => {
      window.removeEventListener('paladio:transit_event', onTransitUpdate);
      window.removeEventListener('paladio:transit_download_started', onTransitUpdate);
      window.removeEventListener('paladio:transit_tiles_ready', onTransitUpdate);
      window.removeEventListener('paladio:transit_derivation_ready', onTransitUpdate);
      window.removeEventListener('paladio:transit_compile_failed', onTransitUpdate);
    };
  }, [fetchAvailability, destinationCity]);

  // 2. Fetch Nearby or Lines when active
  const dayIndex = typeof selectedDay === 'number' ? Math.max(0, selectedDay - 1) : 0;

  useEffect(() => {
    if (!['READY', 'EXPIRED'].includes(transitStatus)) return;
    if (!tripId) return;

    let isCancelled = false;
    const loadContent = async () => {
      setIsLoadingData(true);
      try {
        if (subView === 'nearby') {
          const modeParams = Array.from(activeModes).join(',');
          let nearbyUrl = `/trips/${tripId}/transit/nearby?day=${dayIndex}&modes=${modeParams}`;
          if (spatialCircle) {
            nearbyUrl += `&center_lat=${spatialCircle.lat}&center_lng=${spatialCircle.lng}&radius=${spatialCircle.radiusMeters}`;
          } else {
            nearbyUrl += `&radius=800`;
          }
          const res = await apiFetch<{ grouped_stations: NearbyAnchorGroup[] }>(nearbyUrl);
          if (!isCancelled) {
            setNearbyGroups(res.grouped_stations || []);
            (res.grouped_stations || []).forEach((g) => {
              (g.stations || []).forEach((s) => {
                (s.lines || []).forEach((l) => {
                  if (l.color) {
                    if (l.short_name) registerTransitLineColor(l.short_name, l.color);
                    if (l.line_id) registerTransitLineColor(l.line_id, l.color);
                  }
                });
              });
            });
          }
        } else {
          let linesUrl = `/trips/${tripId}/transit/lines`;
          if (spatialCircle) {
            linesUrl += `?center_lat=${spatialCircle.lat}&center_lng=${spatialCircle.lng}&radius=${spatialCircle.radiusMeters}`;
          }
          const res = await apiFetch<{ lines: TransitLineItem[] }>(linesUrl);
          if (!isCancelled) {
            setLines(res.lines || []);
            (res.lines || []).forEach((l) => {
              if (l.color) {
                if (l.short_name) registerTransitLineColor(l.short_name, l.color);
                if (l.id) registerTransitLineColor(l.id, l.color);
              }
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load transit data:', err);
      } finally {
        if (!isCancelled) setIsLoadingData(false);
      }
    };

    void loadContent();
    return () => {
      isCancelled = true;
    };
  }, [transitStatus, tripId, subView, dayIndex, activeModes, spatialCircle]);

  // 3. Drill-in Station Fetch
  useEffect(() => {
    let isCancelled = false;
    const loadStation = async () => {
      if (!drillStationId || !tripId) {
        setStationDetail(null);
        setDepartures([]);
        return;
      }
      setIsLoadingDrill(true);
      try {
        const detail = await apiFetch<Record<string, unknown>>(
          `/trips/${tripId}/transit/stations/${drillStationId}`
        );
        if (!isCancelled) {
          setStationDetail(detail);
        }

        // Fetch departures for planned trip day
        const dateStr = getTripDayDate(tripStartDate, selectedDay);
        const deps = await apiFetch<StationDeparture[]>(
          `/trips/${tripId}/transit/stations/${drillStationId}/departures?date=${dateStr}&seconds=${departureTimeSeconds}&limit=8`
        );
        if (!isCancelled) {
          setDepartures(deps || []);
        }
      } catch (err) {
        console.warn('Failed to load station drill-in:', err);
      } finally {
        if (!isCancelled) setIsLoadingDrill(false);
      }
    };

    void loadStation();
    return () => {
      isCancelled = true;
    };
  }, [drillStationId, tripId, tripStartDate, selectedDay, departureTimeSeconds]);

  const toggleMode = (mode: TransitModeFilter) => {
    setActiveModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        if (next.size > 1) next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  };

  const handleTriggerDownload = async () => {
    if (!destinationCity) return;
    setIsDownloading(true);
    setTransitStatus('BUILDING');
    try {
      await triggerGtfsCompileApi(destinationCity);
      await fetchAvailability();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start transit download';
      notify.error('Download failed', msg);
      setTransitStatus('FAILED');
    } finally {
      setIsDownloading(false);
    }
  };

  // Station card click handler (selects station and opens drill-in / inspector)
  const handleStationClick = (st: TransitStationSummary) => {
    const stableId = st.id.startsWith('gtfs:') ? st.id : `gtfs:${destinationCity}:${st.id}`;
    setDrillStationId(st.id);
    if (onInspectPoi) {
      onInspectPoi(stableId, {
        id: stableId,
        name: st.name,
        original_name: st.original_name,
        lat: st.lat,
        lng: st.lon,
        category: 'transit',
        lines: st.lines,
        wheelchair_boarding: st.wheelchair_boarding,
      });
    }
    if (onFocusFromInspector) {
      onFocusFromInspector({
        id: stableId,
        lat: st.lat,
        lng: st.lon,
        name: st.name,
        category: 'transit',
      });
    }
  };

  // Line click handler
  const handleLineClick = async (line: TransitLineItem) => {
    if (!tripId) return;
    try {
      const detail = await apiFetch<{
        id: string;
        short_name?: string;
        color: string;
        patterns: Array<{
          geometry: { coordinates: [number, number][] };
          stops: Array<{ station_id: string; name: string; lat: number; lon: number }>;
        }>;
      }>(`/trips/${tripId}/transit/lines/${line.id}`);

      if (detail && detail.patterns && detail.patterns.length > 0) {
        const primary = detail.patterns[0];
        const activeLineData = {
          line: detail.short_name || detail.id,
          color: detail.color || '#007AFF',
          polyline: primary.geometry?.coordinates || [],
          stations: (primary.stops || []).map((s) => ({
            id: s.station_id,
            name: s.name,
            lat: s.lat,
            lng: s.lon,
          })),
        };
        window.dispatchEvent(
          new CustomEvent('paladio:show-transit-line', { detail: activeLineData })
        );
      }
    } catch (err) {
      console.warn('Could not inspect line:', err);
    }
  };

  // Drill-in Station Subview (Within tab)
  if (drillStationId && stationDetail) {
    const sName = (stationDetail.name as string) || 'Station';
    const sOrigName = stationDetail.original_name as string | null;
    const sLines = (stationDetail.serving_lines as Array<Record<string, unknown>>) || [];
    const sWheelchair = stationDetail.wheelchair_boarding as number | null;
    const stableId = `gtfs:${destinationCity}:${drillStationId}`;
    const isStationSaved = savedPoiIds.has(stableId);

    return (
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Back Button */}
        <button
          type="button"
          onClick={() => setDrillStationId(null)}
          style={{
            alignSelf: 'flex-start',
            padding: '4px 8px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ChevronLeftIcon size={12} /> Back to {subView === 'nearby' ? 'Nearby' : 'Lines'}
        </button>

        {/* Station Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {sName}
            </div>
            {sOrigName && sOrigName !== sName && (
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {sOrigName}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onToggleSavePoi(stableId)}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: isStationSaved ? '1px solid #F59E0B' : '1px solid var(--color-border)',
              background: isStationSaved ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
              color: isStationSaved ? '#F59E0B' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
            title={isStationSaved ? 'Saved' : 'Save Station'}
          >
            <BookmarkIcon size={14} fill={isStationSaved ? '#F59E0B' : 'none'} />
          </button>
        </div>

        {/* Explicit Accessibility Badge (PLAN.md Section 3.3) */}
        {sWheelchair === 1 && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(52, 199, 89, 0.1)',
              color: '#34C759',
              fontSize: '10px',
              fontWeight: 700,
            }}
          >
            ♿ Wheelchair Accessible
          </div>
        )}

        {/* Serving Lines Chips */}
        {sLines.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Serving Lines
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {sLines.map((sl, idx) => {
                const chipBg = (sl.color as string) || '#007AFF';
                const chipColor = (sl.text_color as string) || '#FFFFFF';
                const sNameShort = (sl.short_name as string) || (sl.line_id as string);
                const headsign = sl.headsign as string | null;
                return (
                  <div
                    key={`${sl.line_id}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: chipBg,
                      color: chipColor,
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                    title={headsign ? `Towards ${headsign}` : undefined}
                  >
                    <span>{sNameShort}</span>
                    {headsign && <span style={{ opacity: 0.85, fontWeight: 500, fontSize: '10px' }}>→ {headsign}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduled Departures for Selected Trip Day */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Scheduled Departures ({selectedDay === 'all' ? 'All Days' : `Day ${selectedDay}`})
            </div>
            <div style={{ display: 'flex', gap: '3px' }}>
              {[
                { label: '09:00', secs: 32400 },
                { label: '12:00', secs: 43200 },
                { label: '15:00', secs: 54000 },
                { label: '18:00', secs: 64800 },
              ].map((slot) => {
                const isSlotActive = departureTimeSeconds === slot.secs;
                return (
                  <button
                    key={slot.secs}
                    type="button"
                    onClick={() => setDepartureTimeSeconds(slot.secs)}
                    style={{
                      padding: '1px 6px',
                      borderRadius: '4px',
                      border: `1px solid ${isSlotActive ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                      background: isSlotActive ? 'var(--color-accent-primary)' : 'transparent',
                      color: isSlotActive ? '#FFFFFF' : 'var(--color-text-muted)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-code, monospace)',
                      fontWeight: isSlotActive ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>
          {isLoadingDrill ? (
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Loading scheduled departures...</div>
          ) : departures.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {departures.map((dep, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-card)',
                    border: '1px solid var(--color-border)',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: dep.color,
                        color: dep.text_color,
                        fontWeight: 700,
                        fontSize: '10px',
                      }}
                    >
                      {dep.line_short_name}
                    </span>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {dep.headsign ? `Towards ${dep.headsign}` : dep.mode}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-code, monospace)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {formatDepartureSeconds(dep.departure_seconds)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              No further scheduled departures for {selectedDay === 'all' ? 'all days' : `Day ${selectedDay}`}.
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. READY / EXPIRED Normal Browsing State
  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Expired / Out of range Warning Note (PLAN.md Section 3.1) */}
      {isExpired && coveredRange && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            fontSize: '11px',
            color: '#D97706',
          }}
        >
          ⚠️ Schedule feed covered {coveredRange.start} to {coveredRange.end}. Typical service headways shown.
        </div>
      )}

      {/* Transit Header with Waypoint Area Filter Button */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Transit & Directions
          </div>
          {onToggleDropWaypoint && (
            <button
              type="button"
              onClick={onToggleDropWaypoint}
              title={spatialCircle ? 'Adjust Waypoint Radius Filter' : isDroppingWaypoint ? 'Cancel Waypoint Placement' : 'Drop Waypoint on Map'}
              aria-label="Area Filter"
              data-testid="transit-toggle-waypoint-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: spatialCircle
                  ? 'rgba(15, 76, 92, 0.1)'
                  : isDroppingWaypoint
                  ? 'var(--color-accent-primary, #0F4C5C)'
                  : 'var(--color-surface-card, #FFFFFF)',
                border: `1px solid ${
                  spatialCircle || isDroppingWaypoint
                    ? 'var(--color-accent-primary, #0F4C5C)'
                    : 'var(--color-border)'
                }`,
                borderRadius: '9999px',
                color: isDroppingWaypoint ? '#FFFFFF' : 'var(--color-accent-primary, #0F4C5C)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: isDroppingWaypoint
                  ? '0 2px 8px rgba(15, 76, 92, 0.25)'
                  : 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
                transition: 'all 0.15s ease',
              }}
            >
              <RadarIcon size={13} color={isDroppingWaypoint ? '#FFFFFF' : 'var(--color-accent-primary, #0F4C5C)'} />
              <span>{spatialCircle ? 'Area Filter' : isDroppingWaypoint ? 'Click Map' : 'Area Filter'}</span>
            </button>
          )}
        </div>

        <SpatialFilterCard
          spatialCircle={spatialCircle}
          onSpatialCircleChange={onSpatialCircleChange}
          isDroppingWaypoint={isDroppingWaypoint}
          onToggleDropWaypoint={onToggleDropWaypoint}
          onClearSpatialCircle={onClearSpatialCircle}
        />
      </div>

      {/* Segmented Control: [ Directions | Lines | Nearby ] */}
      <div
        style={{
          display: 'flex',
          background: 'var(--color-bg-secondary, #F4EFE6)',
          borderRadius: '8px',
          padding: '2px',
          border: '1px solid var(--color-border)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setDrillStationId(null);
            if (subView !== 'directions') {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
                window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
              }
              setSubView('directions');
            }
          }}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '12px',
            fontWeight: subView === 'directions' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: subView === 'directions' ? 'var(--color-surface-card)' : 'transparent',
            color: subView === 'directions' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            boxShadow: subView === 'directions' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          Directions
        </button>
        <button
          type="button"
          onClick={() => {
            setDrillStationId(null);
            if (subView !== 'lines') {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
                window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
              }
              setSubView('lines');
            }
          }}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '12px',
            fontWeight: subView === 'lines' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: subView === 'lines' ? 'var(--color-surface-card)' : 'transparent',
            color: subView === 'lines' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            boxShadow: subView === 'lines' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          Lines
        </button>
        <button
          type="button"
          onClick={() => {
            setDrillStationId(null);
            if (subView !== 'nearby') {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('paladio:clear-directions-route'));
                window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
              }
              setSubView('nearby');
            }
          }}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '12px',
            fontWeight: subView === 'nearby' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: subView === 'nearby' ? 'var(--color-surface-card)' : 'transparent',
            color: subView === 'nearby' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            boxShadow: subView === 'nearby' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          Nearby
        </button>
      </div>

      {/* Mode Filter Chips: [ Metro, Rail, Tram, Bus ] */}
      {subView === 'nearby' && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {ALL_TRANSIT_MODES.map((mode) => {
            const isActive = activeModes.has(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => toggleMode(mode)}
                style={{
                  padding: '3px 9px',
                  borderRadius: '6px',
                  border: isActive ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border)',
                  background: isActive ? 'rgba(15, 76, 92, 0.08)' : 'transparent',
                  color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {mode}
              </button>
            );
          })}
        </div>
      )}

      {/* Subview Content */}
      {subView === 'directions' ? (
        <TripTransitDirectionsView
          tripId={tripId}
          destinationCity={destinationCity}
          tripStartDate={tripStartDate}
          selectedDay={selectedDay}
          tripDays={tripDays}
          hotel={hotel}
          airport={airport}
          activeMapPickField={activeMapPickField}
          onStartMapPick={onStartMapPick}
          onCancelMapPick={onCancelMapPick}
          onRouteCalculated={onRouteCalculated}
          onInspectPoi={onInspectPoi}
          onSelectTransitLine={handleLineClick}
        />
      ) : transitStatus === 'CHECKING' ? (
        <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>Checking transit network availability...</div>
        </div>
      ) : isDownloading || transitStatus === 'BUILDING' || transitStatus === 'QUEUED' ? (
        <div style={{ padding: '24px 16px', borderRadius: '12px', border: '1px solid var(--color-border)', background: 'var(--color-surface-card)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {transitStatus === 'QUEUED' ? 'Transit Download Queued' : 'Downloading Transit Data'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Retrieving lines, routes, and station stops for {destinationCity}...
            </div>
          </div>
        </div>
      ) : !['READY', 'EXPIRED'].includes(transitStatus) ? (
        <div style={{ padding: '24px 16px', borderRadius: '12px', border: '1px solid var(--color-border)', background: 'var(--color-surface-card)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(15, 76, 92, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent-primary)' }}>
            <CompassIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              GTFS Feed Not Downloaded
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
              Point-to-point transit directions are fully active via Transitous. Download the GTFS feed to browse lines and nearby station clusters.
            </div>
          </div>
          <button
            type="button"
            data-testid="transit-build-button"
            onClick={handleTriggerDownload}
            disabled={isDownloading}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-accent-primary)',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isDownloading ? 'not-allowed' : 'pointer',
              opacity: isDownloading ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isDownloading && (
              <span style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
            )}
            {isDownloading ? `Downloading ${destinationCity} GTFS...` : `Download ${destinationCity} GTFS`}
          </button>
        </div>
      ) : isLoadingData ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>
          Loading {subView === 'nearby' ? 'nearby stations...' : 'network lines...'}
        </div>
      ) : subView === 'nearby' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {nearbyGroups.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>
              {spatialCircle
                ? `No transit stations found within ${spatialCircle.radiusMeters}m of waypoint.`
                : `No transit stations found within 800m of today's stops.`}
            </div>
          ) : (
            nearbyGroups.map((grp) => (
              <div key={grp.anchor_id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {grp.anchor_type === 'waypoint'
                    ? `Near Waypoint Radius (${spatialCircle?.radiusMeters || 800}m)`
                    : grp.anchor_type === 'lodging'
                    ? 'Near your hotel'
                    : `Near ${grp.anchor_name}`}
                </div>
                {grp.stations.map((st) => {
                  const stableId = `gtfs:${destinationCity}:${st.id}`;
                  const isSaved = savedPoiIds.has(stableId);
                  return (
                    <div
                      key={st.id}
                      onClick={() => handleStationClick(st)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'var(--color-surface-card)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {st.name}
                          </div>
                          {st.original_name && st.original_name !== st.name && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {st.original_name}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSavePoi(stableId);
                          }}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'transparent',
                            color: isSaved ? '#F59E0B' : 'var(--color-text-muted)',
                            cursor: 'pointer',
                          }}
                          title={isSaved ? 'Saved' : 'Save Station'}
                        >
                          <BookmarkIcon size={13} fill={isSaved ? '#F59E0B' : 'none'} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Serving line chips */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {st.lines.slice(0, 4).map((line) => (
                            <span
                              key={line.line_id}
                              style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: line.color,
                                color: line.text_color,
                                fontSize: '10px',
                                fontWeight: 700,
                              }}
                            >
                              {line.short_name}
                            </span>
                          ))}
                          {st.lines.length > 4 && (
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                              +{st.lines.length - 4}
                            </span>
                          )}
                        </div>

                        {/* Walking distance & time */}
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          ~{st.walk_mins} min walk ({st.distance_meters}m)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Lines View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lines.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>
              No transit lines available.
            </div>
          ) : (
            lines.map((l) => (
              <div
                key={l.id}
                onClick={() => handleLineClick(l)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: l.color,
                      color: l.text_color,
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {l.short_name || l.id}
                  </span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {l.long_name || l.short_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {l.mode} • {l.station_count} stations
                    </div>
                  </div>
                </div>
                <div style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                  <ChevronRightIcon size={12} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
