"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PoiDetail, PoiPhotoItem } from '@/types/domain';
export type { PoiDetail };
import { getApiBaseUrl, apiFetch, getAuthToken } from '@/utils/api';
import { getTripDayDate } from '@/utils/date';
import { getTransitLineTheme, ActiveTransitLineData, registerTransitLineColor, getRegisteredTransitLineColor } from '@/utils/transitColors';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { translate } from '@/stores/localeStore';
import { useDestinationCurrency, getCurrencyInfo } from '@/utils/currencyResolver';
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
  PinIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  TrashIcon,
  Spinner,
  GripVerticalIcon,
  ExpandIcon,
  HotelIcon,
  PlaneIcon,
  KeyIcon,
  PhoneIcon,
  WifiIcon,
  PawIcon,
  ParkingIcon,
  AcIcon,
  SunIcon,
  CalendarIcon,
  UtensilsIcon,
  TicketIcon,
  MuseumIcon,
  WheelchairIcon,
  TakeawayIcon,
  DeliveryIcon,
  CreditCardIcon,
  LeafIcon,
  NoSmokingIcon,
  RestroomIcon,
  UploadIcon,
  LanguagesIcon,
} from '@/components/icons';
import { isDescriptionInLocale } from '@/utils/languageDetect';
import { startCustomDragPreview } from '@/utils/dragPreview';
import { notify } from '@/utils/notify';
import { useTripCollections } from '@/hooks/useTripCollections';
import { useTripTickets } from '@/hooks/useTripTickets';
import { formatTicketDateTime, formatTicketTime } from '@/lib/wallet/format';
import { SaveToCollectionMenu } from '@/components/trip-workspace/SaveToCollectionMenu';
import { CategoryIcon } from '@/components/PoiCategoryBadge';
import { classifyPoiCategory, getPoiCategoryLabel, isHotelPoi, isAirportPoi } from '@/utils/poiCategory';
import { buildStopNavLinks } from '@/utils/navigationLinks';
import { downloadPoiGpx } from '@/utils/exportTrip';

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
  photos?: PoiPhotoItem[];
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
  departure_time?: string;
}

function formatDepartureSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const isNextDay = h >= 24;
  const displayH = String(h % 24).padStart(2, '0');
  const displayM = String(m).padStart(2, '0');
  return `${displayH}:${displayM}${isNextDay ? translate('poi_detail.next_day_suffix') : ''}`;
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

export function getTransitStationLabel(
  p?: Partial<PoiDetail> | null,
  tFn?: (key: string) => string
): string | null {
  if (!p || !isTransitPoi(p)) return null;
  const tr = tFn || translate;

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
    return tr('poi_detail.station_train');
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
    return tr('poi_detail.station_metro');
  }
  if (
    cat === 'tram' ||
    type === 'tram' ||
    stationType.includes('tram')
  ) {
    return tr('poi_detail.station_tram');
  }
  if (
    cat === 'bus_stop' ||
    cat === 'bus' ||
    type === 'bus' ||
    type === 'bus_stop' ||
    stationType.includes('bus')
  ) {
    return tr('poi_detail.station_bus');
  }
  if (cat === 'ferry' || type === 'ferry' || stationType.includes('ferry')) {
    return tr('poi_detail.station_ferry');
  }
  if (stationType.includes('station') || cat.includes('station')) {
    return tr('poi_detail.station_transit');
  }
  return tr('poi_detail.station_stop');
}

export interface InspectPoiFallback extends Partial<PoiDetail> {
  photo_url?: string;
  thumbnail_url?: string;
  serving_lines?: ServingLineDetail[];
  line?: string;
  headsign?: string;
  route_color?: string;
  departure_time?: string;
  arrival_time?: string;
  instruction?: string;
}

interface PoiDetailViewProps {
  poiId: string | null;
  fallbackPoi?: InspectPoiFallback | null;
  city?: string;
  onClose: () => void;
  onAddToDay?: (dayNumber: number, poi: PoiDetail) => void;
  onFocusOnMap?: (poi: {
    id?: string;
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
  selectedDay?: number | 'all';
  scheduledDay?: number | null;
  activeTransitLine?: ActiveTransitLineData | null;
  onSelectTransitLine?: (lineData: ActiveTransitLineData | null) => void;
  tripId?: string;
  onUpdatePoi?: (poi: PoiDetail) => void;
  onPoiLoaded?: (poi: PoiDetail) => void;
}

const DAY_NAME_KEYS = [
  'poi_detail.day_monday',
  'poi_detail.day_tuesday',
  'poi_detail.day_wednesday',
  'poi_detail.day_thursday',
  'poi_detail.day_friday',
  'poi_detail.day_saturday',
  'poi_detail.day_sunday',
];

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

interface ParsedWindow {
  start: number;
  end: number;
}

function parseAndMergeWindows(windows: unknown): ParsedWindow[] {
  if (!Array.isArray(windows)) return [];
  const parsedList: ParsedWindow[] = [];
  for (const w of windows) {
    const pw = parseWindowMinutes(w);
    if (pw) parsedList.push(pw);
  }
  if (parsedList.length === 0) return [];

  // Sort by start ascending, then by end descending so larger intervals come first
  parsedList.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge overlapping or contiguous intervals (e.g. 10:00-18:00 and 10:00-21:00 -> 10:00-21:00)
  const merged: ParsedWindow[] = [parsedList[0]];
  for (let i = 1; i < parsedList.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = parsedList[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function formatWindow(parsed: ParsedWindow): string {
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
    suffix = translate('poi_detail.next_day_suffix');
  } else {
    eH = String(rawEndHours).padStart(2, '0');
  }

  return `${sH}:${sM} – ${eH}:${eM}${suffix}`;
}

function formatWindowTime(w: unknown): string | null {
  const parsed = parseWindowMinutes(w);
  if (!parsed) return null;
  return formatWindow(parsed);
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
  selectedDay,
  scheduledDay,
  activeTransitLine,
  onSelectTransitLine,
  tripId,
  onUpdatePoi,
  onPoiLoaded,
}: PoiDetailViewProps) {
  const { isPoiSaved } = useTripCollections(tripId);
  const { tickets } = useTripTickets(tripId || '');
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  const auth = useOptionalAuth();
  const user = auth?.user;
  const { t, locale } = useTranslation();
  const destMeta = useDestinationCurrency(city || fallbackPoi?.city);
  const activeCurrencyCode = (user?.preferences?.default_currency as string) || destMeta.currency || 'EUR';
  const currencySymbol = useMemo(() => {
    const info = getCurrencyInfo(activeCurrencyCode);
    return info?.symbol || destMeta.symbol || '€';
  }, [activeCurrencyCode, destMeta.symbol]);

  const [poi, setPoi] = useState<PoiDetail | null>(() => {
    if (fallbackPoi && (fallbackPoi.name || fallbackPoi.id)) {
      return {
        id: fallbackPoi.id || poiId || '',
        name: fallbackPoi.name || t('poi_detail.waypoint_fallback'),
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
  const [loading, setLoading] = useState<boolean>(Boolean(poiId || fallbackPoi));
  const [error, setError] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [showHoursGrid, setShowHoursGrid] = useState<boolean>(false);
  const effectivePoiId = poiId || poi?.id || fallbackPoi?.id || '';
  const isSaved = effectivePoiId ? isPoiSaved(effectivePoiId) : false;

  const isTransit = useMemo(() => isTransitPoi(poi || fallbackPoi), [poi, fallbackPoi]);
  const isHotel = useMemo(() => isHotelPoi(poi || fallbackPoi), [poi, fallbackPoi]);
  const isAirport = useMemo(() => isAirportPoi(poi || fallbackPoi), [poi, fallbackPoi]);
  const transitStationLabel = useMemo(() => getTransitStationLabel(poi || fallbackPoi, t), [poi, fallbackPoi, t]);
  const [stationDetail, setStationDetail] = useState<StationDetailData | null>(null);

  // In-Place POI Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('attraction');
  const [editDuration, setEditDuration] = useState(60);
  const [editCost, setEditCost] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [showPlaceExportMenu, setShowPlaceExportMenu] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // On-demand Overview Translation State (keyed to current POI, locale, and source description)
  const [translationState, setTranslationState] = useState<{
    key: string;
    text: string;
    showingTranslated: boolean;
  } | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  const startEditing = useCallback(() => {
    if (!poi) return;
    setEditName(poi.name || '');
    setEditCategory(poi.category || 'attraction');
    setEditDuration(poi.duration_mins || 60);
    setEditCost(poi.cost_eur ?? 0);
    setEditDescription(poi.description || '');
    setEditWebsite(poi.website || '');
    setEditPhone(poi.phone || '');
    const currentPhotoUrl = poi.photos?.[0]?.url || (poi as any).photo_url || '';
    setEditPhotoUrl(currentPhotoUrl);
    setIsEditing(true);
  }, [poi]);

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      notify.warning(t('poi_detail.invalid_file_title'), t('poi_detail.invalid_file_desc'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.warning(t('poi_detail.file_too_large_title'), t('poi_detail.file_too_large_desc'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === 'string') {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          if (scale >= 1 && dataUrl.length < 350_000) {
            setEditPhotoUrl(dataUrl);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setEditPhotoUrl(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            setEditPhotoUrl(dataUrl);
          }
        };
        img.onerror = () => setEditPhotoUrl(dataUrl);
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = useCallback(async () => {
    if (!poi || !editName.trim()) return;
    setIsSavingEdit(true);
    try {
      const trimmedPhoto = editPhotoUrl.trim();
      const updatedPhotos: PoiPhotoItem[] = trimmedPhoto
        ? [
            {
              url: trimmedPhoto,
              thumbnail_url: trimmedPhoto,
              caption: editName.trim(),
            },
            ...(poi.photos || []).filter((p) => p.url !== trimmedPhoto),
          ]
        : [];

      const updatedPoiData: PoiDetail = {
        ...poi,
        name: editName.trim(),
        category: editCategory.trim().toLowerCase(),
        duration_mins: Number(editDuration) || 60,
        cost_eur: Number(editCost) || 0,
        description: editDescription.trim(),
        website: editWebsite.trim() || undefined,
        phone: editPhone.trim() || null,
        photos: updatedPhotos,
      };

      let savedPoi: PoiDetail | null = null;
      const baseUrl = getApiBaseUrl();
      try {
        const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(poi.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: updatedPoiData.name,
            category: updatedPoiData.category,
            duration_mins: updatedPoiData.duration_mins,
            cost_eur: updatedPoiData.cost_eur,
            description: updatedPoiData.description,
            website: updatedPoiData.website,
            phone: editPhone.trim(),
            lat: updatedPoiData.lat,
            lng: updatedPoiData.lng,
            photo_url: trimmedPhoto || '',
            photos: updatedPhotos.map((p) => ({
              url: p.url,
              thumbnail_url: p.thumbnail_url || p.url,
              caption: p.caption,
            })),
          }),
        });
        if (res.ok) {
          savedPoi = await res.json();
        }
      } catch (e) {
        console.warn('Backend update failed, maintaining local state:', e);
      }

      const finalPoiData: PoiDetail = {
        ...updatedPoiData,
        description_lang: savedPoi?.description_lang ?? null,
      };
      setTranslationState(null);
      setPoi(finalPoiData);
      setActivePhotoIdx(0);
      if (onUpdatePoi) {
        onUpdatePoi(finalPoiData);
      }
      window.dispatchEvent(new CustomEvent('paladio:poi-updated', { detail: finalPoiData }));
      notify.success(t('poi_detail.place_updated_title'), t('poi_detail.place_updated_desc', { name: finalPoiData.name }));
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving POI:', err);
      notify.error(t('poi_detail.update_failed_title'), t('poi_detail.update_failed_desc'));
    } finally {
      setIsSavingEdit(false);
    }
  }, [poi, editName, editCategory, editDuration, editCost, editDescription, editWebsite, editPhone, editPhotoUrl, onUpdatePoi, t]);

  const isCustomPoi = Boolean(
    poi?.id?.startsWith('custom-') ||
    poi?.cost_source === 'user' ||
    (poi as any)?.source === 'user_created' ||
    (poi as any)?.match_type === 'custom'
  );

  const [isDeletingCustom, setIsDeletingCustom] = useState(false);

  const handleDeleteCustomPoi = useCallback(async () => {
    if (!poi) return;
    if (!window.confirm(t('poi_detail.delete_confirm', { name: poi.name }))) return;
    setIsDeletingCustom(true);
    try {
      const baseUrl = getApiBaseUrl();
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(poi.id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(t('poi_detail.delete_error_status', { status: res.status }));
      }
      notify.success(t('poi_detail.place_deleted_title'), t('poi_detail.place_deleted_desc', { name: poi.name }));
      window.dispatchEvent(new CustomEvent('paladio:poi-deleted', { detail: { id: poi.id } }));
      onClose();
    } catch (err) {
      console.error('Error deleting custom POI:', err);
      notify.error(t('poi_detail.delete_failed_title'), t('poi_detail.delete_failed_desc'));
    } finally {
      setIsDeletingCustom(false);
    }
  }, [poi, onClose, t]);

  const [stationDepartures, setStationDepartures] = useState<StationDepartureItem[]>([]);
  const [departureTimeSeconds, setDepartureTimeSeconds] = useState<number>(32400); // 09:00 AM default
  const [loadingDepartures, setLoadingDepartures] = useState<boolean>(false);
  const [loadingTransitLine, setLoadingTransitLine] = useState<string | null>(null);

  // User can toggle preview day when POI does not belong to a specific route day
  const [selectedPreviewDay, setSelectedPreviewDay] = useState<number>(initialDay || 1);

  // If POI is already placed in a route day, that day ALWAYS governs.
  // Otherwise, use user's selected day (or preview day).
  const isScheduledInRoute = typeof scheduledDay === 'number';
  const effectiveDayNumber = isScheduledInRoute
    ? scheduledDay!
    : typeof selectedDay === 'number'
    ? selectedDay
    : selectedPreviewDay;

  const isGtfsStation = useMemo(() => {
    const id = poiId || poi?.id || fallbackPoi?.id || '';
    return id.startsWith('gtfs:');
  }, [poiId, poi?.id, fallbackPoi?.id]);

  const hotelTicket = useMemo(() => {
    if (!isHotel || !tickets || tickets.length === 0) return null;
    const pName = (poi?.name || fallbackPoi?.name || '').toLowerCase();
    const hotelTickets = tickets.filter((t) => t.ticket_type === 'hotel');
    if (hotelTickets.length === 0) return null;

    if (pName) {
      const matched = hotelTickets.find((t) => {
        const title = (t.title || '').toLowerCase();
        const venue = (t.location_or_venue || '').toLowerCase();
        const provider = (t.provider || '').toLowerCase();
        return (
          title.includes(pName) || pName.includes(title) ||
          (venue && (venue.includes(pName) || pName.includes(venue))) ||
          (provider && (provider.includes(pName) || pName.includes(provider)))
        );
      });
      if (matched) return matched;
    }

    if (hotelTickets.length === 1) return hotelTickets[0];

    const dateStr = getTripDayDate(tripStartDate, effectiveDayNumber);
    if (dateStr) {
      const matchedByDate = hotelTickets.find((t) => {
        const start = t.start_time?.substring(0, 10);
        const end = t.end_time?.substring(0, 10);
        if (start && end) return dateStr >= start && dateStr <= end;
        if (start) return dateStr >= start;
        return false;
      });
      if (matchedByDate) return matchedByDate;
    }

    return hotelTickets[0] || null;
  }, [isHotel, tickets, poi?.name, fallbackPoi?.name, tripStartDate, effectiveDayNumber]);

  const flightTicket = useMemo(() => {
    if (!isAirport || !tickets || tickets.length === 0) return null;
    const pName = (poi?.name || fallbackPoi?.name || '').toLowerCase();
    const flightTickets = tickets.filter((t) => t.ticket_type === 'flight');
    if (flightTickets.length === 0) return null;

    if (pName) {
      const matched = flightTickets.find((t) => {
        const title = (t.title || '').toLowerCase();
        const meta = t.metadata || {};
        const originIata = typeof meta.origin_iata === 'string' ? meta.origin_iata.toLowerCase() : '';
        const destIata = typeof meta.destination_iata === 'string' ? meta.destination_iata.toLowerCase() : '';
        const flightNum = typeof meta.flight_number === 'string' ? meta.flight_number.toLowerCase() : '';
        const provider = (t.provider || '').toLowerCase();
        return (
          title.includes(pName) || pName.includes(title) ||
          (originIata && pName.includes(originIata)) ||
          (destIata && pName.includes(destIata)) ||
          (provider && pName.includes(provider)) ||
          (flightNum && pName.includes(flightNum))
        );
      });
      if (matched) return matched;
    }

    if (flightTickets.length === 1) return flightTickets[0];

    const dateStr = getTripDayDate(tripStartDate, effectiveDayNumber);
    if (dateStr) {
      const matchedByDate = flightTickets.find((t) => {
        const start = t.start_time?.substring(0, 10);
        const end = t.end_time?.substring(0, 10);
        return start === dateStr || end === dateStr;
      });
      if (matchedByDate) return matchedByDate;
    }

    return flightTickets[0] || null;
  }, [isAirport, tickets, poi?.name, fallbackPoi?.name, tripStartDate, effectiveDayNumber]);

  const hotelChips = useMemo(() => {
    if (!isHotel || !hotelTicket) return [];
    const chips: React.ReactNode[] = [];
    const checkInStr = hotelTicket.start_time ? formatTicketTime(hotelTicket.start_time, hotelTicket.start_tz) : null;
    const checkOutStr = hotelTicket.end_time ? formatTicketTime(hotelTicket.end_time, hotelTicket.end_tz) : null;
    if (checkInStr || checkOutStr) {
      chips.push(
        <div
          key="hotel-checkin-out"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '8px 10px',
            minWidth: 0,
          }}
          title={t('poi_detail.hotel_checkin_out_title', {
            checkIn: checkInStr || '--',
            checkOut: checkOutStr || '--',
          })}
        >
          <ClockIcon size={14} color="var(--color-accent-primary)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {checkInStr && checkOutStr
                ? t('poi_detail.check_in_out')
                : checkInStr
                ? t('poi_detail.check_in')
                : t('poi_detail.check_out')}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {[checkInStr, checkOutStr].filter(Boolean).join(' / ')}
            </span>
          </div>
        </div>
      );
    }
    const room = hotelTicket.seat_or_room || (hotelTicket.metadata?.room_number as string);
    if (room) {
      chips.push(
        <div
          key="hotel-room"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '8px 10px',
            minWidth: 0,
          }}
          title={t('poi_detail.room_title', { room })}
        >
          <KeyIcon size={14} color="#10B981" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {t('poi_detail.room_label')}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {room}
            </span>
          </div>
        </div>
      );
    }
    const refCode = hotelTicket.reference_code || hotelTicket.booking_reference;
    if (refCode) {
      chips.push(
        <div
          key="hotel-conf"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '8px 10px',
            minWidth: 0,
          }}
          title={t('poi_detail.booking_ref_title', { ref: refCode })}
        >
          <BookmarkIcon size={14} color="var(--color-accent-teal-mid, #14788D)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {t('poi_detail.booking_ref_label')}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {refCode}
            </span>
          </div>
        </div>
      );
    }
    return chips;
  }, [isHotel, hotelTicket, t]);

  const airportChips = useMemo(() => {
    if (!isAirport || !flightTicket) return [];
    const chips: React.ReactNode[] = [];
    const flightNum = (flightTicket.metadata?.flight_number as string) || flightTicket.provider || flightTicket.title;
    if (flightNum) {
      chips.push(
        <div
          key="flight-num"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '8px 10px',
            minWidth: 0,
          }}
          title={t('poi_detail.flight_title', { flight: flightNum })}
        >
          <PlaneIcon size={14} color="var(--color-accent-teal-mid, #14788D)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {t('poi_detail.flight_label')}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {flightNum}
            </span>
          </div>
        </div>
      );
    }
    const depStr = flightTicket.start_time ? formatTicketTime(flightTicket.start_time, flightTicket.start_tz || flightTicket.departure_tz) : null;
    const arrStr = flightTicket.end_time ? formatTicketTime(flightTicket.end_time, flightTicket.end_tz || flightTicket.arrival_tz) : null;
    if (depStr || arrStr) {
      chips.push(
        <div
          key="flight-dep-arr"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '8px 10px',
            minWidth: 0,
          }}
          title={t('poi_detail.dep_arr_title', { dep: depStr || '--', arr: arrStr || '--' })}
        >
          <ClockIcon size={14} color="var(--color-accent-primary)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {depStr && arrStr
                ? t('poi_detail.dep_arr_short')
                : depStr
                ? t('poi_detail.departure_label')
                : t('poi_detail.arrival_label')}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {[depStr, arrStr].filter(Boolean).join(' / ')}
            </span>
          </div>
        </div>
      );
    }
    const terminal = (flightTicket.metadata?.terminal as string) || null;
    const gate = (flightTicket.metadata?.gate as string) || null;
    if (terminal || gate) {
      chips.push(
        <div
          key="flight-term-gate"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '8px 10px',
            minWidth: 0,
          }}
          title={[
            terminal ? t('poi_detail.terminal_title', { terminal }) : '',
            gate ? t('poi_detail.gate_title', { gate }) : '',
          ]
            .filter(Boolean)
            .join(', ')}
        >
          <CompassIcon size={14} color="var(--color-accent-primary)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {terminal && gate
                ? t('poi_detail.terminal_gate_label')
                : terminal
                ? t('poi_detail.terminal_label')
                : t('poi_detail.gate_label')}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-code, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {[terminal ? `T${terminal}` : '', gate ? t('poi_detail.gate_title', { gate }) : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </div>
      );
    }
    return chips;
  }, [isAirport, flightTicket, t]);

  const lineColorsMap = useMemo(() => {
    const map: Record<string, { color: string; textColor?: string }> = {};

    // 1. From poi.transit_info.line_colors
    const activePoi = poi || fallbackPoi;
    if (activePoi?.transit_info?.line_colors) {
      for (const [k, v] of Object.entries(activePoi.transit_info.line_colors)) {
        if (v?.color) {
          const entry = { color: v.color, textColor: v.text_color || undefined };
          map[k.toLowerCase()] = entry;
          registerTransitLineColor(k, v.color);
        }
      }
    }

    // 2. From stationDetail.serving_lines
    if (stationDetail?.serving_lines) {
      for (const sl of stationDetail.serving_lines) {
        if (sl.color) {
          const entry = { color: sl.color, textColor: sl.text_color || undefined };
          if (sl.short_name) {
            map[sl.short_name.toLowerCase()] = entry;
            registerTransitLineColor(sl.short_name, sl.color);
          }
          if (sl.line_id) {
            map[sl.line_id.toLowerCase()] = entry;
            registerTransitLineColor(sl.line_id, sl.color);
          }
        }
      }
    }

    // 3. From stationDepartures
    for (const dep of stationDepartures) {
      if (dep.color) {
        const entry = { color: dep.color, textColor: dep.text_color || undefined };
        if (dep.line_short_name) {
          map[dep.line_short_name.toLowerCase()] = entry;
          registerTransitLineColor(dep.line_short_name, dep.color);
        }
        if (dep.line_id) {
          map[dep.line_id.toLowerCase()] = entry;
          registerTransitLineColor(dep.line_id, dep.color);
        }
      }
    }

    // 4. From activeTransitLine
    if (activeTransitLine?.line && activeTransitLine?.color) {
      map[activeTransitLine.line.toLowerCase()] = { color: activeTransitLine.color };
      registerTransitLineColor(activeTransitLine.line, activeTransitLine.color);
    }

    return map;
  }, [poi, fallbackPoi, stationDetail, stationDepartures, activeTransitLine]);

  const getLineThemeAndText = useCallback((lineKey: string, explicitColor?: string | null, explicitTextColor?: string | null) => {
    const cleanKey = lineKey.trim().toLowerCase();
    const meta = lineColorsMap[cleanKey];
    const resolvedColor = (explicitColor && explicitColor.trim()) ? explicitColor.trim() : (meta?.color || getRegisteredTransitLineColor(lineKey));
    const theme = getTransitLineTheme(lineKey, resolvedColor);
    const textColor = (explicitTextColor && explicitTextColor.trim()) ? explicitTextColor.trim() : (meta?.textColor || (resolvedColor ? '#FFFFFF' : theme.text));
    return { theme, resolvedColor: theme.solid, textColor };
  }, [lineColorsMap]);

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
        const stops = primary.stops || [];

        // Verify that this line actually serves the current station:
        const currentStationId = stationDetail?.id || poiId || poi?.id || fallbackPoi?.id || '';
        const currentStationName = (stationDetail?.name || poi?.name || fallbackPoi?.name || '').trim().toLowerCase();
        const currentOrigName = (stationDetail?.original_name || '').trim().toLowerCase();
        const currentLat = typeof stationDetail?.lat === 'number' ? stationDetail.lat : (typeof poi?.lat === 'number' ? poi.lat : fallbackPoi?.lat);
        const currentLng = typeof stationDetail?.lon === 'number' ? stationDetail.lon : (typeof poi?.lng === 'number' ? poi.lng : fallbackPoi?.lng);

        const servesStation = stops.some((s) => {
          if (currentStationId && (s.station_id === currentStationId || currentStationId.endsWith(`:${s.station_id}`))) {
            return true;
          }
          const sName = (s.name || '').trim().toLowerCase();
          if (currentStationName && (sName === currentStationName || sName.includes(currentStationName) || currentStationName.includes(sName))) {
            return true;
          }
          if (currentOrigName && (sName === currentOrigName || sName.includes(currentOrigName))) {
            return true;
          }
          if (typeof currentLat === 'number' && typeof currentLng === 'number' && !isNaN(currentLat) && !isNaN(currentLng)) {
            const dLat = (s.lat - currentLat) * 111000;
            const dLng = (s.lon - currentLng) * 111000 * Math.cos((currentLat * Math.PI) / 180);
            return Math.sqrt(dLat * dLat + dLng * dLng) <= 600;
          }
          return false;
        });

        if (!servesStation) {
          console.debug(`Line ${lineIdentifier} station check not matched exactly; showing line anyway`);
        }

        if (detail.color) {
          if (detail.short_name) registerTransitLineColor(detail.short_name, detail.color);
          if (detail.id) registerTransitLineColor(detail.id, detail.color);
          registerTransitLineColor(lineIdentifier, detail.color);
        }

        const activeLineData: ActiveTransitLineData = {
          line: detail.short_name || detail.id,
          city: targetCity,
          color: detail.color || '#007AFF',
          polyline: primary.geometry?.coordinates || [],
          stations: stops.map((s) => ({
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
  }, [activeTransitLine, onSelectTransitLine, poi, fallbackPoi, city, stationDetail, poiId]);

  const { text: overviewDescription, lang: overviewDescriptionLang } = useMemo(() => {
    const poiDesc = poi?.description?.trim() || '';
    const fbDesc = fallbackPoi?.description?.trim() || '';
    const rawDesc = poiDesc || fbDesc;
    const rawDescLang = poiDesc ? (poi?.description_lang ?? null) : (fallbackPoi?.description_lang ?? null);
    const loc = poi?.city || fallbackPoi?.city || city;

    const hotelName = poi?.name || fallbackPoi?.name || t('poi_detail.hotel_fallback');
    const airportName = poi?.name || fallbackPoi?.name || t('poi_detail.airport_fallback');

    if (isHotel) {
      if (!rawDesc || rawDesc.includes('is a notable attraction') || rawDesc.includes('entry is free of charge') || rawDesc.includes('Recommended visit duration')) {
        return {
          text: loc
            ? t('poi_detail.hotel_auto_desc_loc', { name: hotelName, city: loc })
            : t('poi_detail.hotel_auto_desc', { name: hotelName }),
          lang: locale,
        };
      }
    }
    if (isAirport) {
      if (!rawDesc || rawDesc.includes('is a notable attraction') || rawDesc.includes('entry is free of charge') || rawDesc.includes('Recommended visit duration')) {
        return {
          text: loc
            ? t('poi_detail.airport_auto_desc_loc', { name: airportName, city: loc })
            : t('poi_detail.airport_auto_desc', { name: airportName }),
          lang: locale,
        };
      }
    }

    if (rawDesc) {
      if (isTransit && rawDesc.toLowerCase().startsWith('public transit station')) {
        return { text: '', lang: null };
      }
      return { text: rawDesc, lang: rawDescLang };
    }
    if (isTransit) {
      return { text: '', lang: null };
    }
    if (poi?.name) {
      const classified = classifyPoiCategory(poi.category || fallbackPoi?.category || undefined, poi.name);
      const cat =
        locale !== 'en' && classified.type !== 'general'
          ? getPoiCategoryLabel(classified, t).toLowerCase()
          : (poi.category || fallbackPoi?.category || t('poi_detail.waypoint_lower')).toLowerCase();
      return {
        text: loc
          ? t('poi_detail.generic_auto_desc_loc', { name: poi.name, category: cat, city: loc })
          : t('poi_detail.generic_auto_desc', { name: poi.name, category: cat }),
        lang: locale,
      };
    }
    return { text: '', lang: null };
  }, [poi, fallbackPoi, city, isTransit, isHotel, isAirport, locale, t]);

  const isDescriptionInUserLang = useMemo(
    () => isDescriptionInLocale(overviewDescription, locale, overviewDescriptionLang),
    [overviewDescription, locale, overviewDescriptionLang]
  );

  const translationKey = `${effectivePoiId}::${locale}::${overviewDescription}`;
  const activeTranslation = translationState?.key === translationKey ? translationState : null;
  const translatedDescription = activeTranslation?.text ?? null;
  const showTranslated = Boolean(activeTranslation?.showingTranslated);

  const handleToggleTranslateDescription = useCallback(async () => {
    if (!overviewDescription || isTranslating) return;
    if (activeTranslation) {
      setTranslationState({
        ...activeTranslation,
        showingTranslated: !activeTranslation.showingTranslated,
      });
      return;
    }

    setIsTranslating(true);
    try {
      const baseUrl = getApiBaseUrl();
      const targetId = effectivePoiId || 'ad-hoc';
      const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(targetId)}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_lang: locale,
          text: overviewDescription,
          source_lang: overviewDescriptionLang || undefined,
        }),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(errPayload?.detail || translate('poi_detail.translation_failed_status', { status: res.status }));
      }
      const data = await res.json();
      if (data?.translated_text) {
        setTranslationState({
          key: translationKey,
          text: data.translated_text,
          showingTranslated: true,
        });
      } else {
        throw new Error(translate('poi_detail.empty_translation_response'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : translate('poi_detail.unable_to_translate');
      notify.error(t('workspace.translation_error'), msg);
    } finally {
      setIsTranslating(false);
    }
  }, [overviewDescription, overviewDescriptionLang, isTranslating, activeTranslation, translationKey, effectivePoiId, locale, t]);

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
          name: fallbackPoi.name || t('poi_detail.waypoint_fallback'),
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

      setLoading(true);
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
          const targetDateStr = getTripDayDate(tripStartDate, effectiveDayNumber);
          setLoadingDepartures(true);
          const [stData, deps] = await Promise.all([
            apiFetch<StationDetailData>(
              `/transit/${encodeURIComponent(stationCity.toLowerCase())}/stations/${encodeURIComponent(stationRawId)}`
            ),
            apiFetch<StationDepartureItem[]>(
              `/transit/${encodeURIComponent(stationCity.toLowerCase())}/stations/${encodeURIComponent(stationRawId)}/departures?date=${targetDateStr}&seconds=${departureTimeSeconds}&limit=8`
            ).catch((err) => {
              console.warn('Could not load departures:', err);
              return [] as StationDepartureItem[];
            }),
          ]);

          if (isMounted && stData) {
            setStationDetail(stData);
            setStationDepartures(Array.isArray(deps) ? deps : []);
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
              photos: (stData.photos && stData.photos.length > 0) ? stData.photos : initialPhotos,
              scoring: {},
              transit_info: {
                lines: Array.from(new Set(stData.serving_lines.map((l) => (l.short_name || l.line_id || '').trim()).filter((l) => l.length > 0))),
                station_type: stData.serving_lines[0]?.mode || 'station',
              },
            } as unknown as PoiDetail);
            setLoadingDepartures(false);
            setLoading(false);
          }
          return;
        } catch (err) {
          console.warn('Failed to load GTFS station detail:', err);
          if (isMounted) {
            const fallbackServingLines: ServingLineDetail[] = [];

            if (fallbackPoi?.serving_lines && Array.isArray(fallbackPoi.serving_lines)) {
              fallbackServingLines.push(...fallbackPoi.serving_lines);
            } else if (fallbackPoi?.transit_info?.lines) {
              for (const l of fallbackPoi.transit_info.lines) {
                fallbackServingLines.push({
                  line_id: l,
                  direction_id: 0,
                  short_name: l,
                  headsign: fallbackPoi.headsign || '',
                  color: fallbackPoi.route_color || '#007AFF',
                  mode: 'transit',
                });
              }
            } else if (fallbackPoi?.line) {
              fallbackServingLines.push({
                line_id: fallbackPoi.line,
                direction_id: 0,
                short_name: fallbackPoi.line,
                headsign: fallbackPoi.headsign || '',
                color: fallbackPoi.route_color || '#007AFF',
                mode: 'transit',
              });
            }

            const fallbackDetail: StationDetailData = {
              id: effectiveId,
              name: fallbackPoi?.name || stationRawId,
              lat: fallbackPoi?.lat ?? 0,
              lon: fallbackPoi?.lng ?? 0,
              wheelchair_boarding: 0,
              stop_count: 1,
              serving_lines: fallbackServingLines,
              service_summary: [],
            };

            setStationDetail(fallbackDetail);
            setPoi({
              id: effectiveId,
              name: fallbackDetail.name,
              category: 'transit',
              city: stationCity,
              lat: fallbackDetail.lat,
              lng: fallbackDetail.lon,
              duration_mins: 15,
              cost_eur: 0,
              cost_is_estimated: false,
              description:
                (fallbackPoi as any)?.instruction ||
                (fallbackServingLines.length > 0
                  ? t('poi_detail.serving_lines_desc', { lines: fallbackServingLines.map((l) => l.short_name).join(', ') })
                  : ''),
              photos: fallbackPoi?.photos || initialPhotos,
              scoring: {},
              transit_info: {
                lines: fallbackServingLines.map((l) => l.short_name),
                station_type: 'station',
              },
            } as unknown as PoiDetail);

            if ((fallbackPoi as any)?.departure_time || (fallbackPoi as any)?.arrival_time) {
              setStationDepartures([
                {
                  line_id: fallbackServingLines[0]?.line_id || 'Transit',
                  line_short_name: fallbackServingLines[0]?.short_name || t('poi_detail.transit_fallback'),
                  mode: 'transit',
                  color: fallbackServingLines[0]?.color || '#007AFF',
                  text_color: '#FFFFFF',
                  headsign: fallbackServingLines[0]?.headsign || (fallbackPoi as any)?.headsign || '',
                  departure_time: (fallbackPoi as any)?.departure_time || (fallbackPoi as any)?.arrival_time || '',
                  departure_seconds: 0,
                },
              ]);
            }
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
        if (fallbackPoi?.category) params.set('category', fallbackPoi.category);
        if (typeof fallbackPoi?.lat === 'number' && !isNaN(fallbackPoi.lat) && fallbackPoi.lat !== 0) {
          params.set('lat', String(fallbackPoi.lat));
        }
        if (typeof fallbackPoi?.lng === 'number' && !isNaN(fallbackPoi.lng) && fallbackPoi.lng !== 0) {
          params.set('lng', String(fallbackPoi.lng));
        }
        if (locale) params.set('lang', locale);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const res = await fetch(`${baseUrl}/pois/${encodeURIComponent(effectiveId)}${qs}`);
        if (!res.ok) {
          if (fallbackPoi) {
            if (isMounted) setLoading(false);
            return;
          }
          throw new Error(translate('poi_detail.error_load_status', { status: res.status }));
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

          const resolvedPoiData: PoiDetail = {
            ...data,
            lat: resolvedLat,
            lng: resolvedLng,
            photos: resolvedPhotos,
            description: data.description || fallbackPoi?.description || '',
            description_lang: data.description ? (data.description_lang ?? null) : (fallbackPoi?.description_lang ?? null),
            category: data.category || fallbackPoi?.category || 'attraction',
            duration_mins: data.duration_mins || fallbackPoi?.duration_mins || 60,
            cost_eur: data.cost_eur ?? fallbackPoi?.cost_eur ?? 0,
            city: data.city || fallbackPoi?.city || city || '',
            scoring: data.scoring && Object.keys(data.scoring).length > 0 ? data.scoring : fallbackPoi?.scoring || {},
            transit_info: data.transit_info || fallbackPoi?.transit_info || null,
          };
          setPoi(resolvedPoiData);
          setLoading(false);
          onPoiLoaded?.(resolvedPoiData);
        }
      } catch (err: unknown) {
        if (isMounted) {
          if (!fallbackPoi) {
            setError(err instanceof Error ? err.message : translate('poi_detail.error_fetch_details'));
          }
          setLoading(false);
        }
      }
    }

    fetchPoi();

    return () => {
      isMounted = false;
    };
  }, [poiId, fallbackPoi, city, tripStartDate, effectiveDayNumber, locale]);

  // Re-fetch departures when user switches departure time or preview day on an already-loaded station
  const isInitialStationLoadRef = useRef(true);
  useEffect(() => {
    if (isInitialStationLoadRef.current) {
      isInitialStationLoadRef.current = false;
      return;
    }
    if (!stationDetail || !isGtfsStation) return;
    let isMounted = true;
    const parts = (poiId || fallbackPoi?.id || '').split(':');
    const stationCity = parts[1] || fallbackPoi?.city || city || '';
    const stationRawId = parts.slice(2).join(':');
    if (!stationCity || !stationRawId) return;
    const targetDateStr = getTripDayDate(tripStartDate, effectiveDayNumber);
    apiFetch<StationDepartureItem[]>(
      `/transit/${encodeURIComponent(stationCity.toLowerCase())}/stations/${encodeURIComponent(stationRawId)}/departures?date=${targetDateStr}&seconds=${departureTimeSeconds}&limit=8`
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

    return () => {
      isMounted = false;
    };
  }, [departureTimeSeconds, effectiveDayNumber, isGtfsStation, poiId, fallbackPoi?.id, fallbackPoi?.city, city, tripStartDate]);


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
      id: poi.id,
      lat: poi.lat,
      lng: poi.lng,
      name: poi.name,
      category: poi.category,
      durationMins: poi.duration_mins,
      costEur: poi.cost_eur,
    });
  }, [poi, onFocusOnMap]);

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

  const targetDayName = t(DAY_NAME_KEYS[targetDayOfWeekIdx]);

  // User taste vector affinity percentage (strictly dynamic; omitted for hotels, airports, or unrated)
  const tasteMatchPct = useMemo(() => {
    if (isHotel || isAirport) return null;
    const scoringAny = poi?.scoring as Record<string, unknown> | undefined;
    const raw = (poi as any)?.similarity ?? (poi as any)?.taste_match ?? scoringAny?.taste_match ?? scoringAny?.similarity;
    if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
      const pct = raw <= 1.0 ? Math.round(raw * 100) : Math.round(raw);
      return Math.min(99, Math.max(68, pct));
    }
    return null;
  }, [poi, isHotel, isAirport]);

  const effectiveCost = useMemo(() => {
    if (isHotel) {
      if (poi?.cost_eur && poi.cost_eur > 0) return poi.cost_eur;
      if (hotelTicket?.price && hotelTicket.price > 0) return hotelTicket.price;
      return null;
    }
    if (isAirport) {
      if (poi?.cost_eur && poi.cost_eur > 0) return poi.cost_eur;
      if (flightTicket?.price && flightTicket.price > 0) return flightTicket.price;
      return null;
    }
    return poi?.cost_eur ?? 0;
  }, [poi, isHotel, isAirport, hotelTicket, flightTicket]);

  const showPricingRow = !isTransit && (
    isEditing ||
    tasteMatchPct !== null ||
    (!isHotel && !isAirport) ||
    (isHotel && effectiveCost !== null && effectiveCost > 0) ||
    (isAirport && effectiveCost !== null && effectiveCost > 0)
  );

  if (!poiId && !fallbackPoi) {
    return null;
  }

  const photos: PoiPhotoItem[] = poi?.photos || [];
  const currentPhoto = photos[activePhotoIdx];

  // Evaluate opening hours for targetDayOfWeekIdx
  let isOpenOnTargetDay = false;
  let targetDayHoursLabel = t('poi_detail.hours_not_listed');
  const hasDailyWindows = Boolean(poi?.daily_windows && poi.daily_windows.length === 7);
  const targetWindows = hasDailyWindows ? poi?.daily_windows?.[targetDayOfWeekIdx] : null;

  if (Array.isArray(targetWindows) && targetWindows.length > 0) {
    const mergedWindows = parseAndMergeWindows(targetWindows);
    const formattedWindows = mergedWindows.map(formatWindow);

    if (formattedWindows.length > 0) {
      targetDayHoursLabel = formattedWindows.join(', ');
      isOpenOnTargetDay = true;
    }
  } else if (poi?.hours_known) {
    targetDayHoursLabel = t('poi_detail.closed');
    isOpenOnTargetDay = false;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        maxHeight: '100%',
        minHeight: 0,
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
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
          <div
            style={{
              padding: '64px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              flex: '1 1 auto',
              minHeight: '260px',
            }}
          >
            <Spinner size={32} color="var(--color-accent-primary)" />
            <p
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '12px',
                color: 'var(--color-text-muted)',
                letterSpacing: '0.04em',
                margin: 0,
              }}
            >
              {t('poi_detail.loading_comment')}
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
              {t('workspace.return_to_search')}
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
                flexShrink: 0,
              }}
            >
              {isEditing ? (
                /* Editing Mode: Photo Editor Hero Card */
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Photo Preview */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '180px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      background: editPhotoUrl
                        ? `url(${editPhotoUrl}) center / cover no-repeat`
                        : 'var(--color-surface-card)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {!editPhotoUrl && (
                      <div style={{ textAlign: 'center', padding: '16px' }}>
                        <PoiCategoryFallbackIllustration category={editCategory || poi.category} size={64} />
                        <p
                          style={{
                            margin: '8px 0 0 0',
                            fontSize: '11px',
                            fontFamily: 'var(--font-code, monospace)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          {t('poi_detail.no_image_set')}
                        </p>
                      </div>
                    )}
                    {editPhotoUrl && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          left: '8px',
                          background: 'rgba(15, 23, 42, 0.72)',
                          backdropFilter: 'blur(8px)',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-code, monospace)',
                          color: '#FFFFFF',
                        }}
                      >
                        {t('poi_detail.preview_upper')}
                      </div>
                    )}
                  </div>

                  {/* Image input & upload controls */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handlePhotoFileChange}
                  />

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="url"
                      data-testid="edit-poi-photo-input"
                      value={editPhotoUrl}
                      onChange={(e) => setEditPhotoUrl(e.target.value)}
                      placeholder={t('poi_detail.paste_image_url_placeholder')}
                      style={{
                        flex: '1 1 auto',
                        minWidth: 0,
                        padding: '6px 10px',
                        fontSize: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-card)',
                        color: 'var(--color-text-primary)',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      data-testid="edit-poi-photo-upload-btn"
                      onClick={() => photoInputRef.current?.click()}
                      title={t('poi_detail.upload_image_title')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-accent-primary)',
                        background: 'rgba(15, 76, 92, 0.08)',
                        color: 'var(--color-accent-primary)',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <UploadIcon size={12} color="currentColor" />
                      <span>{t('common.upload')}</span>
                    </button>
                    {editPhotoUrl && (
                      <button
                        type="button"
                        data-testid="edit-poi-photo-clear-btn"
                        onClick={() => setEditPhotoUrl('')}
                        title={t('poi_detail.clear_image_title')}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-text-muted)',
                          fontSize: '11.5px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {t('common.clear')}
                      </button>
                    )}
                  </div>
                </div>
              ) : photos.length > 0 ? (
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
                      minHeight: '215px',
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
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Top-left View Photo Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxOpen(true);
                      }}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        background: 'rgba(15, 23, 42, 0.72)',
                        backdropFilter: 'blur(8px)',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '10.5px',
                        fontFamily: 'var(--font-code, monospace)',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        zIndex: 2,
                        transition: 'transform 0.15s ease, background 0.15s ease',
                      }}
                      title={t('poi_detail.view_full_photo')}
                      aria-label={t('poi_detail.view_full_photo')}
                    >
                      <ExpandIcon size={12} color="#FFFFFF" />
                      <span>{t('common.view')}</span>
                    </button>

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
                          aria-label={t('poi_detail.previous_photo')}
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
                          aria-label={t('poi_detail.next_photo')}
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
                        title={t('workspace.focus_on_map')}
                        aria-label={t('workspace.focus_on_map')}
                      >
                        <CompassIcon size={15} color="#FFFFFF" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuAnchorRect(rect);
                          setShowSaveModal((prev) => !prev);
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
                        title={isSaved ? t('poi_detail.manage_collections_saved') : t('poi_detail.save_to_collections')}
                        aria-label={isSaved ? t('poi_detail.manage_collections_saved') : t('poi_detail.save_to_collections')}
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
                        flexShrink: 0,
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
                            aria-label={t('poi_detail.select_photo_aria', { num: idx + 1 })}
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
                    {t('poi_detail.category_archive_label', {
                      category: poi.category
                        ? locale !== 'en' && classifyPoiCategory(poi.category, poi.name).type !== 'general'
                          ? getPoiCategoryLabel(classifyPoiCategory(poi.category, poi.name), t)
                          : poi.category
                        : t('poi_detail.attraction_upper'),
                    })}
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
                      title={t('workspace.focus_on_map')}
                      aria-label={t('workspace.focus_on_map')}
                    >
                      <CompassIcon size={15} color="currentColor" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuAnchorRect(rect);
                        setShowSaveModal((prev) => !prev);
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
                      title={isSaved ? t('poi_detail.manage_collections_saved') : t('poi_detail.save_to_collections')}
                      aria-label={isSaved ? t('poi_detail.manage_collections_saved') : t('poi_detail.save_to_collections')}
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
                padding: '14px 14px 44px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                flexShrink: 0,
              }}
            >
              {/* Pricing & Rating Row (Hidden for transit stations, or hotels/airports without price) */}
              {showPricingRow && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    paddingTop: '2px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span
                          style={{
                            fontSize: '18px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-display, inherit)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {currencySymbol}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          data-testid="edit-poi-cost-input"
                          value={editCost}
                          onChange={(e) => setEditCost(Number(e.target.value))}
                          style={{
                            width: '74px',
                            padding: '3px 6px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface-card)',
                            fontSize: '16px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-display, inherit)',
                            color: 'var(--color-text-primary)',
                            outline: 'none',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--color-text-muted)',
                            fontFamily: 'var(--font-code, monospace)',
                          }}
                        >
                          {isHotel ? t('poi_detail.per_night') : t('workspace.per_person')}
                        </span>
                      </div>
                    ) : isHotel ? (
                      effectiveCost !== null && effectiveCost > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '22px',
                              fontWeight: 800,
                              letterSpacing: '-0.02em',
                              fontFamily: 'var(--font-display, inherit)',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {`${currencySymbol}${Math.round(effectiveCost)}`}
                          </span>
                          <span
                            style={{
                              fontSize: '12px',
                              color: 'var(--color-text-muted)',
                              fontFamily: 'var(--font-code, monospace)',
                            }}
                          >
                            {t('poi_detail.per_night')}
                          </span>
                        </div>
                      ) : null
                    ) : isAirport ? (
                      effectiveCost !== null && effectiveCost > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '22px',
                              fontWeight: 800,
                              letterSpacing: '-0.02em',
                              fontFamily: 'var(--font-display, inherit)',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {`${currencySymbol}${Math.round(effectiveCost)}`}
                          </span>
                        </div>
                      ) : null
                    ) : (
                      <>
                        <span
                          style={{
                            fontSize: '22px',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                            fontFamily: 'var(--font-display, inherit)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {poi.cost_eur === 0 ? t('workspace.free') : `${currencySymbol}${Math.round(poi.cost_eur)}`}
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--color-text-muted)',
                            fontFamily: 'var(--font-code, monospace)',
                          }}
                        >
                          {t('workspace.per_person')}
                        </span>
                      </>
                    )}
                  </div>

                  {tasteMatchPct !== null && (
                    <div
                      title={t('workspace.taste_match')}
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
                        {t('workspace.taste_match_pct', { pct: tasteMatchPct })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Subtle Divider (Only shown when top pricing row is present) */}
              {showPricingRow && (
                <div style={{ height: '1px', background: 'var(--color-border)', opacity: 0.6 }} />
              )}

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
                  {isEditing ? (
                    <input
                      type="text"
                      data-testid="edit-poi-name-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t('poi_detail.place_name_placeholder')}
                      style={{
                        flex: '1 1 auto',
                        minWidth: '140px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-card)',
                        fontSize: '17px',
                        lineHeight: 1.3,
                        fontWeight: 700,
                        fontFamily: 'var(--font-display, inherit)',
                        color: 'var(--color-text-primary)',
                        letterSpacing: '-0.01em',
                        outline: 'none',
                      }}
                    />
                  ) : (
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
                  )}
                  <button
                    type="button"
                    onClick={isEditing ? () => setIsEditing(false) : startEditing}
                    title={isEditing ? t('poi_detail.close_editor') : t('poi_detail.edit_poi_info')}
                    aria-label={t('workspace.edit_poi')}
                    data-testid="edit-poi-btn"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      background: isEditing ? 'rgba(15, 76, 92, 0.1)' : 'var(--color-surface-raised, #F8FAFC)',
                      color: isEditing ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <EditIcon size={13} color="currentColor" />
                  </button>
                  {isCustomPoi && (
                    <button
                      type="button"
                      onClick={handleDeleteCustomPoi}
                      disabled={isDeletingCustom}
                      title={t('poi_detail.delete_manual_poi')}
                      aria-label={t('poi_detail.delete_manual_poi')}
                      data-testid="delete-custom-poi-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-raised, #F8FAFC)',
                        color: 'var(--color-danger, #EF4444)',
                        cursor: isDeletingCustom ? 'not-allowed' : 'pointer',
                        padding: 0,
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                        opacity: isDeletingCustom ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isDeletingCustom) {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.borderColor = 'var(--color-danger, #EF4444)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--color-surface-raised, #F8FAFC)';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    >
                      <TrashIcon size={13} color="currentColor" />
                    </button>
                  )}
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
                  {Array.isArray(poi?.transit_info?.lines) && (() => {
                    const uniqueLines = Array.from(new Set(
                      poi.transit_info.lines
                        .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
                        .map((l) => l.trim())
                    ));
                    if (uniqueLines.length === 0) return null;
                    return (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        {uniqueLines.map((line) => {
                          const { theme, textColor } = getLineThemeAndText(line);
                          const isLineActive = activeTransitLine?.line.toLowerCase() === line.toLowerCase();
                          const isLoading = loadingTransitLine?.toLowerCase() === line.toLowerCase();
                          const activeText = textColor || '#FFFFFF';
                          return (
                            <button
                              key={line}
                              type="button"
                              onClick={() => handleTransitLineClick(line)}
                              title={t('poi_detail.show_line_route_title', { line })}
                              data-testid={`transit-line-badge-${line}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                background: isLineActive ? theme.solid : `${theme.solid}15`,
                                color: isLineActive ? activeText : theme.solid,
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
                                  background: isLineActive ? activeText : theme.solid,
                                  flexShrink: 0,
                                }}
                              />
                              <span>{line}</span>
                              {isLoading && (
                                <Spinner size={10} color="currentColor" />
                              )}
                            </button>
                          );
                        })}
                    </div>
                  );
                })()}
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
                  <span>{poi.city || t('poi_detail.destination_fallback')}</span>
                  {isEditing ? (
                    <input
                      type="url"
                      data-testid="edit-poi-website-input"
                      placeholder={t('poi_detail.website_placeholder')}
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      style={{
                        marginLeft: 'auto',
                        width: '160px',
                        padding: '2px 6px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-card)',
                        fontSize: '11px',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-code, monospace)',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    poi.website && (
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
                        {t('workspace.website')}
                      </a>
                    )
                  )}
                </div>
                {(isEditing || (poi.phone && poi.phone.trim())) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11.5px',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <PhoneIcon size={12} color="var(--color-text-muted)" />
                    {isEditing ? (
                      <input
                        type="tel"
                        data-testid="edit-poi-phone-input"
                        placeholder={t('poi_detail.phone_placeholder')}
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        style={{
                          width: '180px',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-card)',
                          fontSize: '11px',
                          color: 'var(--color-text-primary)',
                          fontFamily: 'var(--font-code, monospace)',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <a
                        href={`tel:${(poi.phone || '').split(/[;,]/)[0].trim().replace(/[^+\d]/g, '')}`}
                        data-testid="poi-phone-link"
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-code, monospace)',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                        title={t('poi_detail.call_phone_title', { phone: poi.phone || '' })}
                      >
                        {poi.phone}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Feature Chips Row */}
              {!isTransit && (
                (isHotel && hotelChips.length > 0) ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {hotelChips}
                  </div>
                ) : (isAirport && airportChips.length > 0) ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {airportChips}
                  </div>
                ) : (!isHotel && !isAirport) ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    <>
                      {/* General POI: 1. Rating Card (Omitted if not rated, or substituted with District) */}
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

                        if (isRated) {
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
                                minWidth: 0,
                              }}
                              title={
                                reviewCount
                                  ? t('poi_detail.rating_with_reviews_title', {
                                      rating: ratingNum.toFixed(1),
                                      reviews: reviewCount.toLocaleString(locale === 'en' ? undefined : locale),
                                    })
                                  : `${ratingNum.toFixed(1)} / 5.0`
                              }
                            >
                              <StarIcon
                                size={14}
                                fill="#F59E0B"
                                color="#F59E0B"
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    fontFamily: 'var(--font-code, monospace)',
                                    color: 'var(--color-text-muted)',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {reviewCount
                                    ? t('workspace.reviews_count', {
                                        count: reviewCount.toLocaleString(locale === 'en' ? undefined : locale),
                                      })
                                    : t('workspace.rating')}
                                </span>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-code, monospace)',
                                    color: 'var(--color-text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {`${ratingNum.toFixed(1)} / 5.0`}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        // Substitute with District if neighborhood exists and no rating
                        if (poi.neighborhood && poi.neighborhood.trim()) {
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
                                minWidth: 0,
                              }}
                              title={t('poi_detail.district_title', { district: poi.neighborhood })}
                            >
                              <PinIcon size={14} color="var(--color-accent-teal-mid, #14788D)" />
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    fontFamily: 'var(--font-code, monospace)',
                                    color: 'var(--color-text-muted)',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {t('poi_detail.district_label')}
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
                                  {poi.neighborhood}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        // Omit completely when rating is unlisted and no district
                        return null;
                      })()}

                      {/* General POI: 2. Duration Card (Omitted if missing and not editing) */}
                      {(isEditing || (poi.duration_mins && poi.duration_mins > 0)) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--color-surface-raised)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '10px',
                            padding: '8px 10px',
                            minWidth: 0,
                          }}
                        >
                          <ClockIcon size={14} color="var(--color-accent-primary)" />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: '9px',
                                fontFamily: 'var(--font-code, monospace)',
                                color: 'var(--color-text-muted)',
                                textTransform: 'uppercase',
                              }}
                            >
                              {t('common.duration')}
                            </span>
                            {isEditing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-code, monospace)', color: 'var(--color-text-primary)' }}>~</span>
                                <input
                                  type="number"
                                  min={5}
                                  step={5}
                                  data-testid="edit-poi-duration-input"
                                  value={editDuration}
                                  onChange={(e) => setEditDuration(Number(e.target.value))}
                                  style={{
                                    width: '42px',
                                    padding: '1px 3px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface-card)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-code, monospace)',
                                    color: 'var(--color-text-primary)',
                                    outline: 'none',
                                  }}
                                />
                                <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-code, monospace)', color: 'var(--color-text-primary)' }}>m</span>
                              </div>
                            ) : (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-code, monospace)',
                                  color: 'var(--color-text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                ~{poi.duration_mins || 60}m
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* General POI: 3. Category Card */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'var(--color-surface-raised)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '10px',
                          padding: '8px 10px',
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-accent-primary)',
                            flexShrink: 0,
                          }}
                        >
                          <CategoryIcon
                            type={classifyPoiCategory(isEditing ? editCategory : poi.category, isEditing ? editName : poi.name).type}
                            size={14}
                          />
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: '9px',
                              fontFamily: 'var(--font-code, monospace)',
                              color: 'var(--color-text-muted)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {t('workspace.category')}
                          </span>
                          {isEditing ? (
                            <select
                              data-testid="edit-poi-category-select"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              style={{
                                padding: '1px 2px',
                                borderRadius: '4px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-card)',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                fontFamily: 'var(--font-code, monospace)',
                                color: 'var(--color-text-primary)',
                                outline: 'none',
                                maxWidth: '92px',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="attraction">{t('poi_detail.opt_attraction')}</option>
                              <option value="monument">{t('poi_detail.opt_monument')}</option>
                              <option value="museum">{t('poi_detail.opt_museum')}</option>
                              <option value="restaurant">{t('poi_detail.opt_restaurant')}</option>
                              <option value="cafe">{t('poi_detail.opt_cafe')}</option>
                              <option value="park">{t('poi_detail.opt_park')}</option>
                              <option value="shopping">{t('poi_detail.opt_shopping')}</option>
                              <option value="viewpoint">{t('poi_detail.opt_viewpoint')}</option>
                              <option value="hotel">{t('poi_detail.opt_hotel')}</option>
                              <option value="airport">{t('poi_detail.opt_airport')}</option>
                              <option value="transit">{t('poi_detail.opt_transit')}</option>
                            </select>
                          ) : (
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
                              {getPoiCategoryLabel(classifyPoiCategory(poi.category, poi.name), t) ||
                                poi.category ||
                                t('poi_detail.sight_fallback')}
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  </div>
                ) : null
              )}

              {/* Amenity / Info Icon Pills Row (matching HotelTicketCard pill style) */}
              {!isTransit && ((poi.amenities && poi.amenities.length > 0) || Boolean(poi.cuisine)) && (() => {
                const AMENITY_META: Record<string, { labelKey: string; icon: React.ReactNode }> = {
                  wheelchair: { labelKey: 'poi_detail.amenity_wheelchair', icon: <WheelchairIcon size={12} /> },
                  wifi: { labelKey: 'poi_detail.amenity_wifi', icon: <WifiIcon size={12} /> },
                  outdoor_seating: { labelKey: 'poi_detail.amenity_outdoor_seating', icon: <SunIcon size={12} /> },
                  takeaway: { labelKey: 'poi_detail.amenity_takeaway', icon: <TakeawayIcon size={12} /> },
                  delivery: { labelKey: 'poi_detail.amenity_delivery', icon: <DeliveryIcon size={12} /> },
                  reservation: { labelKey: 'poi_detail.amenity_reservation', icon: <CalendarIcon size={12} /> },
                  air_conditioning: { labelKey: 'poi_detail.amenity_air_conditioning', icon: <AcIcon size={12} /> },
                  toilets: { labelKey: 'poi_detail.amenity_toilets', icon: <RestroomIcon size={12} /> },
                  cards: { labelKey: 'poi_detail.amenity_cards', icon: <CreditCardIcon size={12} /> },
                  vegetarian: { labelKey: 'poi_detail.amenity_vegetarian', icon: <LeafIcon size={12} /> },
                  vegan: { labelKey: 'poi_detail.amenity_vegan', icon: <LeafIcon size={12} /> },
                  pets: { labelKey: 'poi_detail.amenity_pets', icon: <PawIcon size={12} /> },
                  parking: { labelKey: 'poi_detail.amenity_parking', icon: <ParkingIcon size={12} /> },
                  non_smoking: { labelKey: 'poi_detail.amenity_non_smoking', icon: <NoSmokingIcon size={12} /> },
                  heritage: { labelKey: 'poi_detail.amenity_heritage', icon: <MuseumIcon size={12} /> },
                  free_entry: { labelKey: 'poi_detail.amenity_free_entry', icon: <TicketIcon size={12} /> },
                };
                const items: Array<{ key: string; label: string; icon: React.ReactNode }> = [];
                if (poi.cuisine) {
                  items.push({
                    key: 'cuisine',
                    label: t('poi_detail.amenity_cuisine', { cuisine: poi.cuisine }),
                    icon: <UtensilsIcon size={12} />,
                  });
                }
                for (const key of poi.amenities || []) {
                  const meta = AMENITY_META[key];
                  if (meta) {
                    items.push({ key, label: t(meta.labelKey), icon: meta.icon });
                  }
                }
                if (items.length === 0) return null;
                return (
                  <div
                    data-testid="poi-amenities-row"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {items.map((item) => (
                      <span
                        key={item.key}
                        title={item.label}
                        aria-label={item.label}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '5px',
                          background: 'var(--color-surface-card, #FFFFFF)',
                          border: '1px solid var(--color-border, #E2E8F0)',
                          color: 'var(--color-text-secondary, #475569)',
                          cursor: 'default',
                          transition: 'border-color 0.12s ease, color 0.12s ease',
                        }}
                      >
                        {item.icon}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Description Overview */}
              {(overviewDescription || isEditing) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
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
                      {t('workspace.overview')}
                    </span>
                    {!isEditing && overviewDescription && !isDescriptionInUserLang && (
                      <button
                        type="button"
                        onClick={handleToggleTranslateDescription}
                        disabled={isTranslating}
                        data-testid="translate-poi-description-btn"
                        aria-pressed={showTranslated}
                        aria-label={
                          isTranslating
                            ? t('workspace.translating')
                            : showTranslated
                            ? t('workspace.show_original')
                            : t('workspace.translate_description')
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          background: showTranslated ? 'var(--color-surface-card)' : 'transparent',
                          color: 'var(--color-accent, #0F766E)',
                          fontSize: '10.5px',
                          fontWeight: 600,
                          fontFamily: 'var(--font-body, inherit)',
                          cursor: isTranslating ? 'wait' : 'pointer',
                          opacity: isTranslating ? 0.7 : 1,
                          lineHeight: 1.3,
                          transition: 'background 0.15s ease, border-color 0.15s ease',
                        }}
                      >
                        {isTranslating ? (
                          <Spinner size={11} />
                        ) : (
                          <LanguagesIcon size={11} />
                        )}
                        <span>
                          {isTranslating
                            ? t('workspace.translating')
                            : showTranslated
                            ? t('workspace.show_original')
                            : t('workspace.translate_description')}
                        </span>
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <textarea
                      rows={4}
                      data-testid="edit-poi-description-input"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder={t('poi_detail.description_placeholder')}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-card)',
                        fontSize: '12.5px',
                        lineHeight: 1.6,
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-body, inherit)',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <p
                      data-testid="poi-overview-description"
                      style={{
                        margin: 0,
                        fontSize: '12.5px',
                        lineHeight: 1.6,
                        color: 'var(--color-text-secondary)',
                        fontFamily: 'var(--font-body, inherit)',
                      }}
                    >
                      {showTranslated && translatedDescription ? translatedDescription : overviewDescription}
                    </p>
                  )}
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
                          ? t('poi_detail.wheelchair_platform_yes')
                          : stationDetail.wheelchair_boarding === 2
                          ? t('poi_detail.wheelchair_platform_no')
                          : t('poi_detail.wheelchair_unspecified')}
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
                        {t('poi_detail.serving_lines_directions')}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {stationDetail.serving_lines.map((l, idx) => {
                          const lineKey = l.short_name || l.line_id;
                          const { theme, resolvedColor, textColor } = getLineThemeAndText(lineKey, l.color, l.text_color);
                          const isLineActive = activeTransitLine?.line.toLowerCase() === lineKey.toLowerCase() ||
                                               activeTransitLine?.line.toLowerCase() === l.line_id.toLowerCase();
                          return (
                            <div
                              key={`${l.line_id}-${l.direction_id}-${idx}`}
                              onClick={() => handleTransitLineClick(lineKey)}
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
                              title={t('poi_detail.view_line_on_map')}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: resolvedColor,
                                    color: textColor,
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-code, monospace)',
                                  }}
                                >
                                  {lineKey}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-primary)' }}>
                                  {l.headsign ? t('poi_detail.towards_space_lower', { headsign: l.headsign }) : (l.long_name || l.mode)}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
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
                        {selectedDay === 'all' && !isScheduledInRoute
                          ? t('poi_detail.all_days_scheduled_departures')
                          : t('poi_detail.day_scheduled_departures', { day: effectiveDayNumber })}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
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
                              onClick={() => {
                                setDepartureTimeSeconds(slot.secs);
                                setLoadingDepartures(true);
                              }}
                              style={{
                                padding: '1px 5px',
                                borderRadius: '3px',
                                border: `1px solid ${isSlotActive ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                                background: isSlotActive ? 'var(--color-accent-primary)' : 'transparent',
                                color: isSlotActive ? '#FFFFFF' : 'var(--color-text-muted)',
                                fontSize: '9.5px',
                                fontFamily: 'var(--font-code, monospace)',
                                fontWeight: isSlotActive ? 700 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                        {loadingDepartures && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                            <Spinner size={10} color="var(--color-accent-primary)" />
                          </div>
                        )}
                      </div>
                    </div>

                    {loadingDepartures && stationDepartures.length === 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '20px 0',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-code, monospace)',
                          fontSize: '11px',
                        }}
                      >
                        <Spinner size={14} color="var(--color-accent-primary)" />
                        <span>{t('poi_detail.loading_departures')}</span>
                      </div>
                    ) : stationDepartures.length === 0 ? (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {selectedDay === 'all' && !isScheduledInRoute
                          ? t('poi_detail.no_departures_all_days')
                          : t('poi_detail.no_departures_day', { day: effectiveDayNumber })}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {stationDepartures.map((dep, idx) => {
                          const lineKey = dep.line_short_name || dep.line_id;
                          const { resolvedColor, textColor } = getLineThemeAndText(lineKey, dep.color, dep.text_color);
                          return (
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
                                    background: resolvedColor,
                                    color: textColor,
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-code, monospace)',
                                  }}
                                >
                                  {lineKey}
                                </span>
                                <span style={{ color: 'var(--color-text-primary)' }}>
                                  {dep.headsign ? t('poi_detail.to_headsign', { headsign: dep.headsign }) : dep.mode}
                                </span>
                              </div>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-code, monospace)', color: 'var(--color-accent-primary)' }}>
                              {dep.departure_time
                                ? (dep.departure_time.includes('T')
                                    ? dep.departure_time.split('T')[1].slice(0, 5)
                                    : dep.departure_time.slice(0, 5))
                                : formatDepartureSeconds(dep.departure_seconds)}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hotel Reservation & Hours Panel (Dynamic from parsed ticket; omitted if no ticket data) */}
              {isHotel && hotelTicket && (hotelTicket.start_time || hotelTicket.end_time) && (
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
                      <HotelIcon size={14} color="var(--color-accent-primary, #0F766E)" />
                      <span
                        style={{
                          fontFamily: 'var(--font-code, monospace)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: 'var(--color-accent-primary, #0F766E)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {hotelTicket.provider || hotelTicket.title || t('poi_detail.reservation_fallback')}
                      </span>
                    </div>
                    {hotelTicket.reference_code && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-code, monospace)',
                          color: 'var(--color-text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {t('poi_detail.conf_prefix', { ref: hotelTicket.reference_code })}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--color-border)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {hotelTicket.start_time && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('poi_detail.checkin_colon')}</span>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {formatTicketDateTime(hotelTicket.start_time, hotelTicket.start_tz)}
                        </span>
                      </div>
                    )}
                    {hotelTicket.end_time && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('poi_detail.checkout_colon')}</span>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {formatTicketDateTime(hotelTicket.end_time, hotelTicket.end_tz)}
                        </span>
                      </div>
                    )}
                    {hotelTicket.seat_or_room && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('poi_detail.room_colon')}</span>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {hotelTicket.seat_or_room}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Airport Flight Schedule Panel (Dynamic from parsed ticket; omitted if no ticket data) */}
              {isAirport && flightTicket && (flightTicket.start_time || flightTicket.end_time) && (
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
                      <PlaneIcon size={14} color="var(--color-accent-teal-mid, #14788D)" />
                      <span
                        style={{
                          fontFamily: 'var(--font-code, monospace)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: 'var(--color-accent-teal-mid, #14788D)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {(flightTicket.metadata?.flight_number as string) || flightTicket.provider || flightTicket.title || t('poi_detail.flight_label')}
                      </span>
                    </div>
                    {flightTicket.reference_code && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-code, monospace)',
                          color: 'var(--color-text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {t('poi_detail.pnr_prefix', { ref: flightTicket.reference_code })}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      paddingTop: '4px',
                      borderTop: '1px dashed var(--color-border)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-code, monospace)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {flightTicket.start_time && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('poi_detail.departure_colon')}</span>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {formatTicketDateTime(flightTicket.start_time, flightTicket.start_tz || flightTicket.departure_tz)}
                        </span>
                      </div>
                    )}
                    {flightTicket.end_time && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('poi_detail.arrival_colon')}</span>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {formatTicketDateTime(flightTicket.end_time, flightTicket.end_tz || flightTicket.arrival_tz)}
                        </span>
                      </div>
                    )}
                    {(Boolean(flightTicket.metadata?.terminal) || Boolean(flightTicket.metadata?.gate)) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('poi_detail.terminal_gate_colon')}</span>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {[
                            flightTicket.metadata?.terminal ? `T${flightTicket.metadata.terminal}` : '',
                            flightTicket.metadata?.gate ? t('poi_detail.gate_title', { gate: String(flightTicket.metadata.gate) }) : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collapsible Opening Hours (Hidden for transit stations, hotels, airports, or when unlisted) */}
              {!isTransit && !isHotel && !isAirport && Boolean(poi?.hours_known || (poi?.daily_windows && poi.daily_windows.some((w) => Array.isArray(w) && w.length > 0)) || (poi?.osm_opening_hours && poi.osm_opening_hours.trim())) && (
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
                          ? t('poi_detail.open_on_day', { day: effectiveDayNumber })
                          : poi?.hours_known
                          ? t('poi_detail.closed_on_day', { day: effectiveDayNumber })
                          : t('poi_detail.hours_unlisted_upper')}
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-code, monospace)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        (
                        {isOpenOnTargetDay
                          ? targetDayHoursLabel
                          : poi?.hours_known
                          ? t('poi_detail.closed_all_day')
                          : t('poi_detail.check_website')}
                        )
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
                        <span>{t('poi_detail.all_days_label')}</span>
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
                        flexWrap: 'wrap',
                        gap: '4px',
                        padding: '4px 0 2px 0',
                        borderTop: '1px dashed var(--color-border)',
                        fontSize: '10px',
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-code, monospace)',
                          flexShrink: 0,
                        }}
                      >
                        {t('poi_detail.preview_label')}
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
                            flexShrink: 0,
                          }}
                        >
                          {t('trips.day_label', { number: d })}
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
                      {DAY_NAME_KEYS.map((dayKey, dayIdx) => {
                        const win = poi.daily_windows?.[dayIdx];
                        const isTarget = dayIdx === targetDayOfWeekIdx;
                        let hoursStr = poi?.hours_known ? t('poi_detail.closed') : t('poi_detail.not_listed');

                        if (Array.isArray(win) && win.length > 0) {
                          const mergedWindows = parseAndMergeWindows(win);
                          const parsedList = mergedWindows.map(formatWindow);

                          if (parsedList.length > 0) {
                            hoursStr = parsedList.join(', ');
                          }
                        }

                        return (
                          <div
                            key={dayKey}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              fontSize: '10.5px',
                              fontFamily: 'var(--font-code, monospace)',
                              color: isTarget ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                              fontWeight: isTarget ? 700 : 400,
                              padding: isTarget ? '4px 8px' : '2px 4px',
                              background: isTarget ? 'rgba(15, 76, 92, 0.08)' : 'transparent',
                              borderRadius: '6px',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <span style={{ minWidth: '65px' }}>{t(dayKey)}:</span>
                              {isTarget && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    padding: '1.5px 6px',
                                    borderRadius: '999px',
                                    background: 'var(--color-accent-primary)',
                                    color: '#FFFFFF',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    letterSpacing: '0.04em',
                                    lineHeight: '1.2',
                                    flexShrink: 0,
                                  }}
                                >
                                  {t('map.day_upper', { day: effectiveDayNumber })}
                                </span>
                              )}
                            </div>
                            <span style={{ textAlign: 'right', wordBreak: 'break-word', flex: '1 1 auto' }}>{hoursStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* In-Place Editing Action Buttons at the End */}
              {isEditing && (
                <div
                  data-testid="in-place-poi-edit-actions"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    padding: '14px 0 6px 0',
                    borderTop: '1px solid var(--color-border)',
                    marginTop: '8px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    data-testid="cancel-edit-poi-btn"
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-raised)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isSavingEdit || !editName.trim()}
                    onClick={handleSaveEdit}
                    data-testid="save-edit-poi-btn"
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--color-accent-primary, #0F4C5C)',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: isSavingEdit || !editName.trim() ? 'not-allowed' : 'pointer',
                      opacity: isSavingEdit || !editName.trim() ? 0.6 : 1,
                      boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSavingEdit ? t('add_poi.saving') : t('workspace.save_changes')}
                  </button>
                </div>
              )}

              {/* Technical GPS Metadata & Single Export / Open in Maps Button */}
              {typeof poi.lat === 'number' && typeof poi.lng === 'number' && (poi.lat !== 0 || poi.lng !== 0) && (
                <div style={{ paddingTop: '6px' }}>
                  <button
                    type="button"
                    data-testid="poi-export-menu-btn"
                    onClick={() => setShowPlaceExportMenu(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-raised, #F8FAFC)',
                      color: 'var(--color-text-primary)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                      <line x1="9" y1="3" x2="9" y2="18" />
                      <line x1="15" y1="6" x2="15" y2="21" />
                    </svg>
                    <span>{t('poi_detail.export_open_maps_btn')}</span>
                  </button>
                </div>
              )}

              {showPlaceExportMenu && typeof document !== 'undefined' && createPortal(
                <div
                  role="dialog"
                  aria-modal="true"
                  onClick={() => setShowPlaceExportMenu(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(3px)',
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxWidth: '430px',
                      backgroundColor: 'var(--color-surface-raised, #FFFFFF)',
                      borderRadius: '24px',
                      boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.06)',
                      border: '1px solid var(--color-border, #E5E7EB)',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      color: 'var(--color-text-primary, #111827)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                          {t('poi_detail.export_navigate_title')}
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary, #6B7280)' }}>
                          {poi.name}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPlaceExportMenu(false)}
                        aria-label={t('poi_detail.close_export_menu')}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          border: 'none',
                          backgroundColor: 'var(--color-bg-secondary, #F3F4F6)',
                          color: 'var(--color-text-secondary, #6B7280)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {/* GPX Waypoint Export */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 6px', borderRadius: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '14px', backgroundColor: 'var(--color-bg-secondary, #F3F4F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent-primary, #0F4C5C)', flexShrink: 0, border: '1px solid var(--color-border, #E5E7EB)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('poi_detail.gpx_waypoint_title')}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary, #6B7280)' }}>{t('poi_detail.gpx_waypoint_desc')}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            downloadPoiGpx({
                              name: poi.name,
                              lat: poi.lat,
                              lng: poi.lng,
                              description: poi.description,
                            });
                            setShowPlaceExportMenu(false);
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '10px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: 'var(--color-accent-primary, #0F4C5C)',
                            color: '#FFFFFF',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {t('poi_detail.export_btn')}
                        </button>
                      </div>

                      {/* Navigation App Deep Links */}
                      {buildStopNavLinks(poi.lat, poi.lng, poi.name).map((nav) => (
                        <div key={nav.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 6px', borderRadius: '16px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '14px', backgroundColor: 'var(--color-bg-secondary, #F3F4F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ocean, #1B8FA6)', flexShrink: 0, border: '1px solid var(--color-border, #E5E7EB)' }}>
                            <CompassIcon size={18} color="currentColor" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{nav.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary, #6B7280)' }}>{t('poi_detail.open_coords_directions')}</div>
                          </div>
                          <a
                            href={nav.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setShowPlaceExportMenu(false)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '10px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              backgroundColor: 'var(--color-surface-card, #FFFFFF)',
                              color: 'var(--color-text-primary, #111827)',
                              border: '1px solid var(--color-border, #E5E7EB)',
                              textDecoration: 'none',
                            }}
                          >
                            {t('poi_detail.open_arrow_btn')}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>,
                document.body
              )}

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
                  {t('poi_detail.gps_coords', { lat: poi.lat.toFixed(4), lng: poi.lng.toFixed(4) })}
                </span>
                <span>{t('poi_detail.id_label', { id: poi.id ? poi.id.slice(0, 14) + '...' : t('poi_detail.local_id') })}</span>
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
            padding: 0,
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Lightbox Header Banner in Paladio Colors */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              padding: '12px 18px',
              background: 'linear-gradient(135deg, var(--color-deep-sea, #0F4C5C) 0%, var(--color-hero-bg, #0A3642) 100%)',
              borderBottom: '2px solid var(--color-accent-gold, #E2B33C)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
              zIndex: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display, inherit)',
                  fontSize: '13.5px',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {poi?.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-code, monospace)',
                  fontSize: '11px',
                  color: 'var(--color-accent-gold, #E2B33C)',
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(226, 179, 60, 0.35)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {activePhotoIdx + 1} / {photos.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label={t('poi_detail.close_photo_preview')}
              title={t('common.close')}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
                flexShrink: 0,
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
              padding: '16px',
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
                aria-label={t('poi_detail.previous_photo')}
              >
                &#9664;
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhoto.url}
              alt={currentPhoto.caption || poi?.name || t('poi_detail.poi_photo_alt')}
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
                aria-label={t('poi_detail.next_photo')}
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
              padding: '0 20px 14px 20px',
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
              {currentPhoto.author && <span>{t('poi_detail.author_label', { author: currentPhoto.author })}</span>}
              {currentPhoto.license_name && (
                <span>{t('poi_detail.license_label', { license: currentPhoto.license_name })}</span>
              )}
              {currentPhoto.license_url && (
                <a
                  href={currentPhoto.license_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent-teal-soft, #7CC4D1)', textDecoration: 'underline' }}
                >
                  {t('poi_detail.license_details')}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <SaveToCollectionMenu
          isOpen={showSaveModal}
          onClose={() => {
            setShowSaveModal(false);
            setMenuAnchorRect(null);
          }}
          tripId={tripId}
          anchorRect={menuAnchorRect}
          align="right"
          poi={{
            id: effectivePoiId,
            name: poi?.name || fallbackPoi?.name || t('collections.place_fallback'),
            category: poi?.category || fallbackPoi?.category,
            cost_eur: poi?.cost_eur ?? fallbackPoi?.cost_eur ?? 0,
            duration_mins: poi?.duration_mins || fallbackPoi?.duration_mins || 60,
            photo_url: poi?.photos?.[0]?.url || fallbackPoi?.photo_url || null,
            thumbnail_url: poi?.photos?.[0]?.thumbnail_url || fallbackPoi?.photo_url || null,
            formatted_address: poi?.neighborhood || ((poi as unknown) as Record<string, unknown> | null)?.formatted_address as string || null,
            rating: poi?.scoring?.rating ?? fallbackPoi?.scoring?.rating ?? null,
          }}
        />
      )}
    </div>
  );
}
