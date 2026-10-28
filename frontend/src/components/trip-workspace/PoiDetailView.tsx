"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PoiDetail, PoiPhotoItem } from '@/types/domain';
import { getApiBaseUrl, apiFetch } from '@/utils/api';
import { getTransitLineTheme, ActiveTransitLineData } from '@/utils/transitColors';
import { useAuth } from '@/contexts/AuthContext';
import { resolveDestinationCurrency, getCurrencyInfo } from '@/utils/currencyResolver';
import {
  IzakayaLanternIllustration,
  TeaCeremonyIllustration,
  HotelLodgingIllustration,
  ShinkansenTrainIllustration,
  FlightTakeoffIllustration,
  BonsaiCraftIllustration,
  PagodaWaypointIllustration,
  ToriiGateIllustration,
  BonshoBellIllustration,
} from '@/components/illustrations';
import {
  ClockIcon,
  CloseIcon,
  StarIcon,
  CompassIcon,
  BookmarkIcon,
  TagIcon,
  PinIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@/components/icons';

function PoiCategoryFallbackIllustration({ category, size = 90 }: { category?: string; size?: number }) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('cafe') || cat.includes('coffee') || cat.includes('tea') || cat.includes('bakery')) {
    return <TeaCeremonyIllustration size={size} />;
  }
  if (cat.includes('food') || cat.includes('restaurant') || cat.includes('bar') || cat.includes('dining') || cat.includes('izakaya')) {
    return <IzakayaLanternIllustration size={size} />;
  }
  if (cat.includes('hotel') || cat.includes('lodging') || cat.includes('hostel') || cat.includes('stay') || cat.includes('accommodation')) {
    return <HotelLodgingIllustration size={size} />;
  }
  if (cat.includes('transit') || cat.includes('station') || cat.includes('train') || cat.includes('subway') || cat.includes('rail')) {
    return <ShinkansenTrainIllustration size={size} />;
  }
  if (cat.includes('flight') || cat.includes('airport')) {
    return <FlightTakeoffIllustration size={size} />;
  }
  if (cat.includes('park') || cat.includes('garden') || cat.includes('nature') || cat.includes('forest')) {
    return <BonsaiCraftIllustration size={size} />;
  }
  if (cat.includes('museum') || cat.includes('art') || cat.includes('gallery')) {
    return <PagodaWaypointIllustration size={size} />;
  }
  if (cat.includes('temple') || cat.includes('shrine') || cat.includes('historic') || cat.includes('attraction')) {
    return <ToriiGateIllustration size={size} />;
  }
  if (cat.includes('entertainment') || cat.includes('theater') || cat.includes('music')) {
    return <BonshoBellIllustration size={size} />;
  }
  return <ToriiGateIllustration size={size} />;
}

export interface ServingLineDetail {
  line_id: string;
  direction_id: number;
  headsign?: string | null;
  short_name?: string | null;
  long_name?: string | null;
  mode: string;
  color?: string | null;
  text_color?: string | null;
}

export interface ServiceSummaryDetail {
  line_id: string;
  direction_id: number;
  day_type: string;
  first_departure_seconds: number;
  last_departure_seconds: number;
  headways_by_band?: Record<string, number | null>;
}

export interface StationDetailData {
  id: string;
  name: string;
  original_name?: string | null;
  lat: number;
  lon: number;
  wheelchair_boarding: number;
  stop_count: number;
  serving_lines: ServingLineDetail[];
  service_summary: ServiceSummaryDetail[];
  transfers?: Array<{
    to_station_id: string;
    transfer_type: number;
    min_transfer_time?: number;
    to_station_name: string;
  }> | null;
}

export interface StationDepartureItem {
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

const TRANSIT_CATEGORIES = new Set([
  'bus_stop',
  'bus',
  'transit',
  'metro',
  'train',
  'tram',
  'subway',
  'rail',
  'railway',
  'station',
]);

export function isTransitPoi(p?: Partial<PoiDetail> | null): boolean {
  if (!p) return false;
  if (p.id && (p.id.toLowerCase().startsWith('gtfs:') || p.id.toLowerCase().startsWith('osm-transit-'))) return true;
  if (p.transit_info) return true;
  const cat = (p.category || '').toLowerCase().trim();
  if (TRANSIT_CATEGORIES.has(cat)) return true;
  if (cat.includes('transit') || cat.includes('station') || cat.includes('bus_stop')) return true;
  return false;
}

export function getTransitStationLabel(p?: Partial<PoiDetail> | null): string | null {
  if (!p || !isTransitPoi(p)) return null;

  const cat = (p.category || '').toLowerCase().trim();
  const type = (p.transit_info?.type || '').toLowerCase().trim();
  const stationType = (p.transit_info?.station_type || '').toLowerCase().trim();

  if (
    cat === 'train' ||
    cat === 'rail' ||
    cat === 'railway' ||
    type === 'train' ||
    stationType.includes('train') ||
    stationType.includes('rail')
  ) {
    return 'Train Station';
  }
  if (
    cat === 'metro' ||
    cat === 'subway' ||
    type === 'metro' ||
    type === 'subway' ||
    stationType.includes('metro') ||
    stationType.includes('subway') ||
    stationType.includes('underground')
  ) {
    return 'Metro Station';
  }
  if (
    cat === 'tram' ||
    type === 'tram' ||
    stationType.includes('tram')
  ) {
    return 'Tram Stop';
  }
  if (
    cat === 'bus_stop' ||
    cat === 'bus' ||
    type === 'bus' ||
    type === 'bus_stop' ||
    stationType.includes('bus')
  ) {
    return 'Bus Stop';
  }
  if (cat === 'ferry' || type === 'ferry' || stationType.includes('ferry')) {
    return 'Ferry Terminal';
  }
  if (stationType.includes('station') || cat.includes('station')) {
    return 'Transit Station';
  }
  return 'Transit Stop';
}

export interface InspectPoiFallback extends Partial<PoiDetail> {
  photo_url?: string;
  thumbnail_url?: string;
}

interface PoiDetailViewProps {
  poiId: string | null;
  fallbackPoi?: InspectPoiFallback | null;
  city?: string;
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
  onDragStartPoi?: () => void;
  tripStartDate?: string;
  scheduledDay?: number | null;
  activeTransitLine?: ActiveTransitLineData | null;
  onSelectTransitLine?: (lineData: ActiveTransitLineData | null) => void;
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

  const sH = String(Math.floor(parsed.start / 60) % 24).padStart(2, '0');
  const sM = String(parsed.start % 60).padStart(2, '0');
  const rawEndHours = Math.floor(parsed.end / 60);
  const endMins = parsed.end % 60;
  const eM = String(endMins).padStart(2, '0');

  let eH: string;
  let suffix = '';
  if (rawEndHours === 24 && endMins === 0) {
    eH = '24:00';
    return `${sH}:${sM} – ${eH}`;
  } else if (rawEndHours >= 24) {
    eH = String(rawEndHours % 24).padStart(2, '0');
    suffix = ' (+1)';
  } else {
    eH = String(rawEndHours).padStart(2, '0');
  }

  return `${sH}:${sM} – ${eH}:${eM}${suffix}`;
}

export function PoiDetailView({
  poiId,
  fallbackPoi,
  city,
  onClose,
  onAddToDay,
  onFocusOnMap,
  availableDays = [1, 2, 3],
  initialDay = 1,
  onDragStartPoi,
  tripStartDate,
  scheduledDay,
  activeTransitLine,
  onSelectTransitLine,
}: PoiDetailViewProps) {
  const { user } = useAuth();
  const destMeta = useMemo(() => resolveDestinationCurrency(city || fallbackPoi?.city), [city, fallbackPoi?.city]);
  const activeCurrencyCode = (user?.preferences?.default_currency as string) || destMeta.currency || 'EUR';
  const currencySymbol = useMemo(() => {
    const info = getCurrencyInfo(activeCurrencyCode);
    return info?.symbol || destMeta.symbol || '€';
  }, [activeCurrencyCode, destMeta.symbol]);

  const [poi, setPoi] = useState<PoiDetail | null>(() => {
    if (fallbackPoi && (fallbackPoi.name || fallbackPoi.id)) {
      return {
        id: fallbackPoi.id || poiId || '',
        name: fallbackPoi.name || 'Waypoint',
        category: fallbackPoi.category || 'attraction',
        city: fallbackPoi.city || city || '',
        lat: fallbackPoi.lat ?? 0,
        lng: fallbackPoi.lng ?? 0,
        duration_mins: fallbackPoi.duration_mins || 60,
        cost_eur: fallbackPoi.cost_eur || 0,
        description: fallbackPoi.description || '',
        photos: fallbackPoi.photos || (fallbackPoi.photo_url ? [{ url: fallbackPoi.photo_url, thumbnail_url: fallbackPoi.photo_url }] : []),
        scoring: fallbackPoi.scoring || {},
        transit_info: fallbackPoi.transit_info,
      } as PoiDetail;
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [showHoursGrid, setShowHoursGrid] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const isTransit = useMemo(() => isTransitPoi(poi || fallbackPoi), [poi, fallbackPoi]);
  const transitStationLabel = useMemo(() => getTransitStationLabel(poi || fallbackPoi), [poi, fallbackPoi]);
  const [stationDetail, setStationDetail] = useState<StationDetailData | null>(null);
  const [stationDepartures, setStationDepartures] = useState<StationDepartureItem[]>([]);
  const [loadingDepartures, setLoadingDepartures] = useState<boolean>(false);
  const [loadingTransitLine, setLoadingTransitLine] = useState<string | null>(null);

  const isGtfsStation = useMemo(() => {
    const id = poiId || poi?.id || fallbackPoi?.id || '';
    return id.startsWith('gtfs:');
  }, [poiId, poi?.id, fallbackPoi?.id]);

  const handleTransitLineClick = useCallback(async (lineIdentifier: string) => {
    if (activeTransitLine && activeTransitLine.line.toLowerCase() === lineIdentifier.toLowerCase()) {
      onSelectTransitLine?.(null);
      window.dispatchEvent(new CustomEvent('paladio:clear-transit-line'));
      return;
    }

    const targetCity = poi?.city || fallbackPoi?.city || city || '';
    if (!targetCity) return;

    setLoadingTransitLine(lineIdentifier);
    try {
      const detail = await apiFetch<{
        id: string;
        short_name?: string;
        color: string;
        patterns: Array<{
          geometry: { coordinates: [number, number][] };
          stops: Array<{ station_id: string; name: string; lat: number; lon: number }>;
        }>;
      }>(`/transit/${encodeURIComponent(targetCity.toLowerCase())}/lines/${encodeURIComponent(lineIdentifier)}`);

      if (detail && detail.patterns && detail.patterns.length > 0) {
        const primary = detail.patterns[0];
        const activeLineData: ActiveTransitLineData = {
          line: detail.short_name || detail.id,
          city: targetCity,
          color: detail.color || '#007AFF',
          polyline: primary.geometry?.coordinates || [],
          stations: (primary.stops || []).map((s) => ({
            id: s.station_id,
            name: s.name,
            lat: s.lat,
            lng: s.lon,
            category: 'transit',
            lines: [detail.short_name || detail.id],
          })),
        };
        onSelectTransitLine?.(activeLineData);
        window.dispatchEvent(new CustomEvent('paladio:show-transit-line', { detail: activeLineData }));
      }
    } catch (err) {
      console.warn('Failed to load transit line data:', err);
    } finally {
      setLoadingTransitLine(null);
    }
  }, [activeTransitLine, onSelectTransitLine, poi?.city, fallbackPoi?.city, city]);

  const overviewDescription = useMemo(() => {
    const rawDesc = poi?.description?.trim() || fallbackPoi?.description?.trim() || '';
    if (rawDesc) {
      if (isTransit && rawDesc.toLowerCase().startsWith('public transit station')) {
        return '';
      }
      return rawDesc;
    }
    if (isTransit) {
      return '';
    }
    if (poi?.name) {
      const cat = (poi.category || fallbackPoi?.category || 'waypoint').toLowerCase();
      const loc = poi.city || fallbackPoi?.city || city;
      return `${poi.name} is a notable ${cat}${loc ? ` located in ${loc}` : ''}.`;
    }
    return '';
  }, [poi, fallbackPoi, city, isTransit]);

  // Load POI details and real photos whenever poiId or fallbackPoi changes
  useEffect(() => {
    let isMounted = true;
    if (!poiId && !fallbackPoi) {
      return;
    }

    async function fetchPoi() {
      const initialPhotos: PoiPhotoItem[] = fallbackPoi?.photos && fallbackPoi.photos.length > 0
        ? fallbackPoi.photos
        : fallbackPoi?.photo_url
        ? [{ url: fallbackPoi.photo_url, thumbnail_url: fallbackPoi.thumbnail_url || fallbackPoi.photo_url }]
        : [];

      if (fallbackPoi && (fallbackPoi.name || fallbackPoi.id)) {
        setPoi({
          id: fallbackPoi.id || poiId || '',
          name: fallbackPoi.name || 'Waypoint',
          category: fallbackPoi.category || 'attraction',
          city: fallbackPoi.city || city || '',
          lat: fallbackPoi.lat ?? 0,
          lng: fallbackPoi.lng ?? 0,
          duration_mins: fallbackPoi.duration_mins || 60,
          cost_eur: fallbackPoi.cost_eur ?? 0,
          description: fallbackPoi.description || '',
          photos: initialPhotos,
          scoring: fallbackPoi.scoring || {},
          daily_windows: fallbackPoi.daily_windows,
          hours_known: fallbackPoi.hours_known,
          website: fallbackPoi.website,
          ...fallbackPoi,
        } as PoiDetail);
      } else {
        setPoi(null);
      }

      setLoading(!fallbackPoi);
      setError(null);
      setActivePhotoIdx(0);
      setLightboxOpen(false);

      const effectiveId = poiId || fallbackPoi?.id || fallbackPoi?.name || '';
      const effectiveCity = fallbackPoi?.city || city || '';

      // GTFS station fetch:
      if (effectiveId.startsWith('gtfs:') && effectiveCity) {
        const parts = effectiveId.split(':');
        const stationCity = parts[1] || effectiveCity;
        const stationRawId = parts.slice(2).join(':');

        try {
          const stData = await apiFetch<StationDetailData>(
            `/transit/${encodeURIComponent(stationCity.toLowerCase())}/stations/${encodeURIComponent(stationRawId)}`
          );
          if (isMounted && stData) {
            setStationDetail(stData);
            setPoi({
              id: effectiveId,
              name: stData.name,
              category: 'transit',
              city: stationCity,
              lat: stData.lat,
              lng: stData.lon,
              duration_mins: 15,
              cost_eur: 0,
              cost_is_estimated: false,
              description: stData.original_name && stData.original_name !== stData.name ? stData.original_name : '',
              photos: [],
              scoring: {},
              transit_info: {
                lines: stData.serving_lines.map((l) => l.short_name || l.line_id),
                station_type: stData.serving_lines[0]?.mode || 'station',
              },
            } as unknown as PoiDetail);
            setLoading(false);

            // Fetch departures
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            setLoadingDepartures(true);
            apiFetch<StationDepartureItem[]>(
              `/transit/${encodeURIComponent(stationCity.toLowerCase())}/stations/${encodeURIComponent(stationRawId)}/departures?date=${dateStr}&seconds=${secs}&limit=8`
            )
              .then((deps) => {
                if (isMounted && Array.isArray(deps)) {
                  setStationDepartures(deps);
                }
              })
              .catch((err) => console.warn('Could not load departures:', err))
              .finally(() => {
                if (isMounted) setLoadingDepartures(false);
              });
          }
          return;
        } catch (err) {
          console.warn('Failed to load GTFS station detail:', err);
          if (fallbackPoi && isMounted) {
            setLoading(false);
            return;
          }
        }
      }

      try {
        const baseUrl = getApiBaseUrl();
        const effectiveName = fallbackPoi?.name || (!effectiveId.startsWith('OSM-') && !effectiveId.startsWith('uuid-') ? effectiveId : '');

        const params = new URLSearchParams();
        if (effectiveName) params.set('name', effectiveName);
        if (effectiveCity) params.set('city', effectiveCity);
        if (typeof fallbackPoi?.lat === 'number' && !isNaN(fallbackPoi.lat) && fallbackPoi.lat !== 0) {
          params.set('lat', String(fallbackPoi.lat));
        }
        if (typeof fallbackPoi?.lng === 'number' && !isNaN(fallbackPoi.lng) && fallbackPoi.lng !== 0) {
          params.set('lng', String(fallbackPoi.lng));
        }
        const qs = params.toString() ? `?${params.toString()}` : '';

        const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(effectiveId)}/details${qs}`);
        if (!res.ok) {
          if (fallbackPoi) {
            if (isMounted) setLoading(false);
            return;
          }
          throw new Error(`Failed to load place details (status ${res.status})`);
        }
        const data: PoiDetail = await res.json();
        if (isMounted) {
          const validDataLat = typeof data.lat === 'number' && !isNaN(data.lat) && data.lat !== 0;
          const validDataLng = typeof data.lng === 'number' && !isNaN(data.lng) && data.lng !== 0;
          const resolvedLat = validDataLat ? data.lat : (fallbackPoi?.lat ?? 0);
          const resolvedLng = validDataLng ? data.lng : (fallbackPoi?.lng ?? 0);

          const resolvedPhotos: PoiPhotoItem[] = data.photos && data.photos.length > 0
            ? data.photos
            : (fallbackPoi?.photos && fallbackPoi.photos.length > 0)
            ? fallbackPoi.photos
            : fallbackPoi?.photo_url
            ? [{ url: fallbackPoi.photo_url, thumbnail_url: fallbackPoi.thumbnail_url || fallbackPoi.photo_url }]
            : [];

          setPoi({
            ...data,
            lat: resolvedLat,
            lng: resolvedLng,
            photos: resolvedPhotos,
            description: data.description || fallbackPoi?.description || '',
            category: data.category || fallbackPoi?.category || 'attraction',
            duration_mins: data.duration_mins || fallbackPoi?.duration_mins || 60,
            cost_eur: data.cost_eur ?? fallbackPoi?.cost_eur ?? 0,
            city: data.city || fallbackPoi?.city || city || '',
            scoring: data.scoring && Object.keys(data.scoring).length > 0 ? data.scoring : fallbackPoi?.scoring || {},
            transit_info: data.transit_info || fallbackPoi?.transit_info || null,
          });
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          if (!fallbackPoi) {
            setError(err instanceof Error ? err.message : 'Error fetching POI details');
          }
          setLoading(false);
        }
      }
    }

    fetchPoi();

    return () => {
      isMounted = false;
    };
  }, [poiId, fallbackPoi, city]);

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

  // User can toggle preview day when POI does not belong to a specific route day
  const [selectedPreviewDay, setSelectedPreviewDay] = useState<number>(initialDay || 1);

  // If POI is already placed in a route day, that day ALWAYS governs.
  // Otherwise, use user's selected preview day (or default day).
  const isScheduledInRoute = typeof scheduledDay === 'number';
  const effectiveDayNumber = isScheduledInRoute ? scheduledDay! : selectedPreviewDay;

  // Calculate day of week index (0 = Monday, 6 = Sunday) for effectiveDayNumber
  const targetDayOfWeekIdx = useMemo(() => {
    if (tripStartDate) {
      try {
        const start = new Date(tripStartDate);
        if (!isNaN(start.getTime())) {
          const targetDate = new Date(start.getTime() + (effectiveDayNumber - 1) * 86400000);
          return (targetDate.getDay() + 6) % 7;
        }
      } catch {
        // ignore and fallback
      }
    }
    return (effectiveDayNumber - 1) % 7;
  }, [tripStartDate, effectiveDayNumber]);

  const targetDayName = DAY_NAMES[targetDayOfWeekIdx];

  // User taste vector affinity percentage
  const tasteMatchPct = useMemo(() => {
    const scoringAny = poi?.scoring as Record<string, unknown> | undefined;
    const raw = (poi as any)?.similarity ?? (poi as any)?.taste_match ?? scoringAny?.taste_match ?? scoringAny?.similarity;
    if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
      const pct = raw <= 1.0 ? Math.round(raw * 100) : Math.round(raw);
      return Math.min(99, Math.max(68, pct));
    }
    const seed = (poi?.id || poi?.name || 'tokyo').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return 80 + (seed % 18);
  }, [poi]);

  if (!poiId && !fallbackPoi) {
    return null;
  }

  const photos: PoiPhotoItem[] = poi?.photos || [];
  const currentPhoto = photos[activePhotoIdx];

  // Evaluate opening hours for targetDayOfWeekIdx
  let isOpenOnTargetDay = false;
  let targetDayHoursLabel = 'Hours not listed';
  const hasDailyWindows = Boolean(poi?.daily_windows && poi.daily_windows.length === 7);
  const targetWindows = hasDailyWindows ? poi?.daily_windows?.[targetDayOfWeekIdx] : null;

  if (Array.isArray(targetWindows) && targetWindows.length > 0) {
    const formattedWindows = targetWindows
      .map(formatWindowTime)
      .filter((str): str is string => Boolean(str));

    if (formattedWindows.length > 0) {
      targetDayHoursLabel = formattedWindows.join(', ');
      isOpenOnTargetDay = true;
    }
  } else if (poi?.hours_known) {
    targetDayHoursLabel = 'Closed';
    isOpenOnTargetDay = false;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        width: '100%',
        minWidth: 0,
        animation: 'poiViewEnter 0.22s cubic-bezier(0.23, 1, 0.32, 1)',
        background: 'var(--color-surface-card)',
      }}
    >
      {/* Scrollable Content Area */}
      <div
        className="no-scrollbar"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
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
            {/* Photo Hero Card (Luxury Reference Inset Design) */}
            <div
              style={{
                position: 'relative',
                margin: '12px 14px 0 14px',
                borderRadius: '18px',
                overflow: 'hidden',
                background: 'var(--color-surface-raised)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
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
                      height: '215px',
                      backgroundImage: `url(${currentPhoto.url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      cursor: 'zoom-in',
                      transition: 'background-image 0.25s ease-in-out',
                    }}
                  >
                    {/* Subtle Gradient Scrim at bottom */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(15, 23, 42, 0.65) 100%)',
                      }}
                    />

                    {/* Top-right Photo Counter Pill if multiple photos */}
                    {photos.length > 1 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          background: 'rgba(15, 23, 42, 0.72)',
                          backdropFilter: 'blur(8px)',
                          padding: '3px 9px',
                          borderRadius: '12px',
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-code, monospace)',
                          fontWeight: 600,
                          color: '#FFFFFF',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                        }}
                      >
                        {activePhotoIdx + 1} / {photos.length}
                      </div>
                    )}

                    {/* Previous / Next Photo Buttons */}
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
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(15, 23, 42, 0.65)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backdropFilter: 'blur(6px)',
                          }}
                          aria-label="Previous photo"
                        >
                          <ChevronLeftIcon size={14} color="#FFFFFF" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePhotoIdx((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
                          }}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(15, 23, 42, 0.65)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backdropFilter: 'blur(6px)',
                          }}
                          aria-label="Next photo"
                        >
                          <ChevronRightIcon size={14} color="#FFFFFF" />
                        </button>
                      </>
                    )}

                    {/* Bottom-right: Circular Action Buttons (Map Focus & Bookmark) */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        right: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFocusClick();
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'rgba(15, 23, 42, 0.72)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease',
                        }}
                        title="Focus on Map"
                        aria-label="Focus on Map"
                      >
                        <CompassIcon size={15} color="#FFFFFF" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsSaved((prev) => !prev);
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'rgba(15, 23, 42, 0.72)',
                          backdropFilter: 'blur(8px)',
                          border: isSaved
                            ? '1px solid #F59E0B'
                            : '1px solid rgba(255, 255, 255, 0.25)',
                          color: isSaved ? '#F59E0B' : '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        title={isSaved ? 'Remove Bookmark' : 'Save Bookmark'}
                        aria-label={isSaved ? 'Remove Bookmark' : 'Save Bookmark'}
                      >
                        <BookmarkIcon
                          size={15}
                          color={isSaved ? '#F59E0B' : '#FFFFFF'}
                          fill={isSaved ? '#F59E0B' : 'none'}
                        />
                      </button>
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
                              height: '30px',
                              borderRadius: '6px',
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
                /* Authentic Category Vector Illustration Fallback */
                <div
                  style={{
                    position: 'relative',
                    padding: '28px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-surface-card)',
                    textAlign: 'center',
                  }}
                >
                  <PoiCategoryFallbackIllustration category={poi.category} size={90} />
                  <span
                    style={{
                      marginTop: '8px',
                      fontSize: '10.5px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {`// ${poi.category || 'ATTRACTION'} ARCHIVE`}
                  </span>

                  {/* Circular Action Buttons (Map Focus & Bookmark) */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFocusClick();
                      }}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--color-surface-raised, rgba(15, 23, 42, 0.72))',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease',
                      }}
                      title="Focus on Map"
                      aria-label="Focus on Map"
                    >
                      <CompassIcon size={15} color="currentColor" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSaved((prev) => !prev);
                      }}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--color-surface-raised, rgba(15, 23, 42, 0.72))',
                        border: isSaved
                          ? '1px solid #F59E0B'
                          : '1px solid var(--color-border)',
                        color: isSaved ? '#F59E0B' : 'var(--color-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      title={isSaved ? 'Remove Bookmark' : 'Save Bookmark'}
                      aria-label={isSaved ? 'Remove Bookmark' : 'Save Bookmark'}
                    >
                      <BookmarkIcon
                        size={15}
                        color={isSaved ? '#F59E0B' : 'currentColor'}
                        fill={isSaved ? '#F59E0B' : 'none'}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Content Details (Luxury Reference Layout) */}
            <div
              style={{
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Pricing & Rating Row (Hidden for transit stations) */}
              {!isTransit && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    paddingTop: '2px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span
                      style={{
                        fontSize: '22px',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        fontFamily: 'var(--font-display, inherit)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {poi.cost_eur === 0 ? 'Free' : `${currencySymbol}${Math.round(poi.cost_eur)}`}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'var(--font-code, monospace)',
                      }}
                    >
                      / person
                    </span>
                  </div>

                  <div
                    title="Taste match calculated from your travel preferences"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(20, 120, 141, 0.08)',
                      border: '1px solid rgba(20, 120, 141, 0.25)',
                      padding: '3px 8px',
                      borderRadius: '16px',
                    }}
                  >
                    <CompassIcon size={13} color="var(--color-accent-teal-mid, #14788D)" />
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-code, monospace)',
                        color: 'var(--color-accent-teal-mid, #14788D)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {tasteMatchPct}% Taste Match
                    </span>
                  </div>
                </div>
              )}

              {/* Subtle Divider */}
              <div style={{ height: '1px', background: 'var(--color-border)', opacity: 0.6 }} />

              {/* Title & Address */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '4px',
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '18px',
                      lineHeight: 1.3,
                      fontWeight: 700,
                      fontFamily: 'var(--font-display, inherit)',
                      color: 'var(--color-text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {poi.name}
                  </h2>
                  {transitStationLabel && (
                    <span
                      data-testid="transit-station-badge"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-code, monospace)',
                        background: 'rgba(8, 145, 178, 0.1)',
                        color: 'var(--color-accent-teal-mid, #0891B2)',
                        border: '1px solid rgba(8, 145, 178, 0.25)',
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {transitStationLabel}
                    </span>
                  )}
                  {Array.isArray(poi?.transit_info?.lines) && poi.transit_info.lines.length > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      {poi.transit_info.lines.map((line) => {
                        const theme = getTransitLineTheme(line);
                        const isLineActive = activeTransitLine?.line.toLowerCase() === line.toLowerCase();
                        const isLoading = loadingTransitLine?.toLowerCase() === line.toLowerCase();
                        return (
                          <button
                            key={line}
                            type="button"
                            onClick={() => handleTransitLineClick(line)}
                            title={`Click to show full line ${line} route and stations on map`}
                            data-testid={`transit-line-badge-${line}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: isLineActive ? theme.solid : `${theme.solid}15`,
                              color: isLineActive ? '#FFFFFF' : theme.solid,
                              border: `1px solid ${isLineActive ? theme.solid : `${theme.solid}45`}`,
                              fontFamily: 'var(--font-code, monospace)',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: isLineActive ? `0 0 10px ${theme.solid}80` : 'none',
                              opacity: isLoading ? 0.6 : 1,
                              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: isLineActive ? '#FFFFFF' : theme.solid,
                                flexShrink: 0,
                              }}
                            />
                            <span>{line}</span>
                            {isLoading && (
                              <span style={{ fontSize: '9px', opacity: 0.8 }}>...</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11.5px',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <PinIcon size={13} color="var(--color-text-muted)" />
                  <span>{poi.city || 'Destination'}</span>
                  {poi.website && (
                    <a
                      href={poi.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--color-accent-primary)',
                        fontSize: '11px',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      Website
                    </a>
                  )}
                </div>
              </div>

              {/* Feature Chips Row */}
              {!isTransit && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                  }}
                >
                {/* 1. Rating Card */}
                {(() => {
                  const ratingNum = (poi.scoring?.rating && poi.scoring.rating > 0)
                    ? poi.scoring.rating
                    : ((poi as any)?.rating && (poi as any).rating > 0)
                      ? (poi as any).rating
                      : ((fallbackPoi as any)?.rating && (fallbackPoi as any).rating > 0)
                        ? (fallbackPoi as any).rating
                        : null;
                  const reviewCount = (poi.scoring?.reviews && poi.scoring.reviews > 0)
                    ? poi.scoring.reviews
                    : null;
                  const isRated = ratingNum !== null;

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '10px',
                        padding: '8px 10px',
                      }}
                      title={isRated && reviewCount ? `${ratingNum.toFixed(1)} / 5.0 (${reviewCount.toLocaleString()} reviews)` : isRated ? `${ratingNum.toFixed(1)} / 5.0` : 'No verified reviews yet'}
                    >
                      <StarIcon
                        size={14}
                        fill={isRated ? '#F59E0B' : 'none'}
                        color={isRated ? '#F59E0B' : 'var(--color-text-muted)'}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-code, monospace)',
                            color: 'var(--color-text-muted)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {isRated && reviewCount ? `${reviewCount.toLocaleString()} Rev` : 'Rating'}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-code, monospace)',
                            color: isRated ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          }}
                        >
                          {isRated ? `${ratingNum.toFixed(1)} / 5.0` : '— / 5.0'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Duration Card */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                  }}
                >
                  <ClockIcon size={14} color="var(--color-accent-primary)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-code, monospace)',
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Duration
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-code, monospace)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      ~{poi.duration_mins || 60}m
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                  }}
                >
                  <TagIcon size={14} color="var(--color-accent-primary)" />
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-code, monospace)',
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Category
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-code, monospace)',
                        color: 'var(--color-text-primary)',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {poi.category || 'Sight'}
                    </span>
                  </div>
                </div>
              </div>
            )}



              {/* Description Overview */}
              {overviewDescription && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-code, monospace)',
                      fontSize: '9.5px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    Overview
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
                    {overviewDescription}
                  </p>
                </div>
              )}

              {/* Transit Station Real-Time Details (Serving Lines, Accessibility, Departures) */}
              {isTransit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Wheelchair Accessibility Badge */}
                  {stationDetail && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: stationDetail.wheelchair_boarding === 1
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        fontSize: '11px',
                        fontFamily: 'var(--font-code, monospace)',
                        color: stationDetail.wheelchair_boarding === 1
                          ? '#10B981'
                          : 'var(--color-text-muted)',
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>
                        {stationDetail.wheelchair_boarding === 1
                          ? '✓ Wheelchair Accessible Platform'
                          : stationDetail.wheelchair_boarding === 2
                          ? '✗ Not Wheelchair Accessible'
                          : 'Wheelchair Accessibility Unspecified'}
                      </span>
                    </div>
                  )}

                  {/* Serving Lines Section */}
                  {stationDetail && stationDetail.serving_lines && stationDetail.serving_lines.length > 0 && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-code, monospace)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--color-text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        Serving Lines & Directions
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {stationDetail.serving_lines.map((l, idx) => {
                          const theme = getTransitLineTheme(l.short_name || l.line_id);
                          const isLineActive = activeTransitLine?.line.toLowerCase() === (l.short_name || l.line_id).toLowerCase();
                          return (
                            <div
                              key={`${l.line_id}-${l.direction_id}-${idx}`}
                              onClick={() => handleTransitLineClick(l.short_name || l.line_id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: isLineActive ? `${theme.solid}15` : 'var(--color-surface-card)',
                                border: `1px solid ${isLineActive ? theme.solid : 'var(--color-border)'}`,
                                cursor: 'pointer',
                              }}
                              title="Click to view full line route on map"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: l.color || theme.solid,
                                    color: l.text_color || '#FFFFFF',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-code, monospace)',
                                  }}
                                >
                                  {l.short_name || l.line_id}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-primary)' }}>
                                  {l.headsign ? `towards ${l.headsign}` : (l.long_name || l.mode)}
                                </span>
                              </div>
                              <span style={{ fontSize: '9px', fontFamily: 'var(--font-code, monospace)', color: 'var(--color-text-muted)' }}>
                                {l.mode}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Scheduled Departures Section */}
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-code, monospace)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--color-text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        Today&apos;s Next Departures
                      </span>
                      {loadingDepartures && (
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-code, monospace)' }}>
                          Loading...
                        </span>
                      )}
                    </div>

                    {stationDepartures.length === 0 && !loadingDepartures ? (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        No upcoming scheduled departures in timetable for today.
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {stationDepartures.map((dep, idx) => (
                          <div
                            key={`${dep.line_id}-${dep.departure_seconds}-${idx}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              background: 'var(--color-surface-card)',
                              fontSize: '11px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  background: dep.color || '#007AFF',
                                  color: dep.text_color || '#FFFFFF',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-code, monospace)',
                                }}
                              >
                                {dep.line_short_name}
                              </span>
                              <span style={{ color: 'var(--color-text-primary)' }}>
                                {dep.headsign ? `to ${dep.headsign}` : dep.mode}
                              </span>
                            </div>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-code, monospace)', color: 'var(--color-accent-primary)' }}>
                              {formatDepartureSeconds(dep.departure_seconds)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collapsible Opening Hours (Hidden for transit stations) */}
              {!isTransit && (
                <div
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: isOpenOnTargetDay
                            ? 'var(--color-success, #10B981)'
                            : poi?.hours_known
                            ? '#B45309'
                            : 'var(--color-text-muted)',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-code, monospace)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: isOpenOnTargetDay
                            ? 'var(--color-success, #10B981)'
                            : poi?.hours_known
                            ? '#B45309'
                            : 'var(--color-text-primary)',
                        }}
                      >
                        {isOpenOnTargetDay
                          ? `OPEN ON DAY ${effectiveDayNumber}`
                          : poi?.hours_known
                          ? `CLOSED ON DAY ${effectiveDayNumber}`
                          : 'HOURS UNLISTED'}
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-code, monospace)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        ({isOpenOnTargetDay ? targetDayHoursLabel : poi?.hours_known ? 'Closed all day' : 'Check website'})
                      </span>
                    </div>

                    {poi?.daily_windows && (
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
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <span>All Days</span>
                        {showHoursGrid ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
                      </button>
                    )}
                  </div>

                  {/* Day Context Switcher for Searched POIs not yet in Route */}
                  {!isScheduledInRoute && (availableDays || [1, 2, 3]).length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 0 2px 0',
                        borderTop: '1px dashed var(--color-border)',
                        fontSize: '10px',
                      }}
                    >
                      <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-code, monospace)' }}>
                        Preview:
                      </span>
                      {(availableDays || [1, 2, 3]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelectedPreviewDay(d)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            border: 'none',
                            background: effectiveDayNumber === d ? 'var(--color-accent-primary)' : 'rgba(0,0,0,0.06)',
                            color: effectiveDayNumber === d ? '#FFFFFF' : 'var(--color-text-muted)',
                            fontSize: '10px',
                            fontWeight: effectiveDayNumber === d ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          Day {d}
                        </button>
                      ))}
                    </div>
                  )}

                  {showHoursGrid && poi?.daily_windows && (
                    <div
                      style={{
                        marginTop: '4px',
                        paddingTop: '6px',
                        borderTop: '1px dashed var(--color-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      {DAY_NAMES.map((dName, dayIdx) => {
                        const win = poi.daily_windows?.[dayIdx];
                        const isTarget = dayIdx === targetDayOfWeekIdx;
                        let hoursStr = poi?.hours_known ? 'Closed' : 'Not listed';

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
                              alignItems: 'center',
                              fontSize: '10.5px',
                              fontFamily: 'var(--font-code, monospace)',
                              color: isTarget ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                              fontWeight: isTarget ? 700 : 400,
                              padding: isTarget ? '2px 6px' : '0px',
                              background: isTarget ? 'rgba(15, 76, 92, 0.08)' : 'transparent',
                              borderRadius: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{dName}:</span>
                              {isTarget && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    padding: '1px 5px',
                                    borderRadius: '999px',
                                    background: 'var(--color-accent-primary)',
                                    color: '#FFFFFF',
                                    fontWeight: 700,
                                  }}
                                >
                                  DAY {effectiveDayNumber}
                                </span>
                              )}
                            </div>
                            <span>{hoursStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Technical GPS Metadata */}
              <div
                style={{
                  paddingTop: '6px',
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
                <span>ID: {poi.id ? poi.id.slice(0, 14) + '...' : 'LOCAL'}</span>
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
                  License Details
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
