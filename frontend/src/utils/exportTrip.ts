import { getApiBaseUrl, getAuthToken } from '@/utils/api';

export interface TripExportData {
  id?: string;
  destination: string;
  start_date?: string;
  end_date?: string;
  itinerary_data?: unknown;
}

/**
 * Downloads a self-contained .trip archive from the backend API.
 * Supports 'full_vault' (all data & documents) and 'community_shareable' (sanitized).
 */
export async function downloadTripPackage(
  tripId: string,
  profile: 'full_vault' | 'community_shareable' = 'full_vault',
  destinationName?: string
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();
  const res = await fetch(`${baseUrl}/trips/${tripId}/export?profile=${profile}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to export trip package (${res.status})`);
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;

  const cleanDest = destinationName
    ? destinationName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    : 'paladio_trip';
  const profileSuffix = profile === 'community_shareable' ? 'shareable' : 'vault';
  a.download = `${cleanDest}_${profileSuffix}.trip`;

  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

/**
 * Filters a trip's itinerary_data.days to a specific day or list of days.
 */
export function filterTripDays(
  trip: TripExportData,
  dayFilter?: number | number[]
): TripExportData {
  if (dayFilter === undefined) return trip;
  const targetSet = new Set(Array.isArray(dayFilter) ? dayFilter : [dayFilter]);
  if (targetSet.size === 0) return trip;
  const itin = (trip.itinerary_data || {}) as { days?: Array<Record<string, unknown>> };
  if (!Array.isArray(itin?.days)) return trip;
  const filteredDays = itin.days.filter((d, idx) => {
    const dNum =
      typeof d.day === 'number'
        ? d.day
        : typeof d.day_number === 'number'
        ? d.day_number
        : idx + 1;
    return targetSet.has(dNum);
  });
  return {
    ...trip,
    itinerary_data: {
      ...itin,
      days: filteredDays,
    },
  };
}

/**
 * Exports raw itinerary JSON for developer and tooling consumption.
 */
export function downloadItineraryJson(
  trip: TripExportData,
  dayFilter?: number | number[]
): void {
  const scoped = filterTripDays(trip, dayFilter);
  const data = scoped.itinerary_data || scoped;
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;

  const cleanDest = (trip.destination || 'trip').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  a.download = `${cleanDest}_itinerary.json`;

  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

/**
 * Generates an RFC-5545 compliant iCalendar string for the trip schedule.
 */
export function generateIcsCalendar(trip: TripExportData): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Paladio//Travel Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${trip.destination || 'Trip'} - Paladio Itinerary`,
  ];

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatUtcTimestamp = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const dtStamp = formatUtcTimestamp(now);

  const itin = trip.itinerary_data as {
    days?: Array<{
      day_number?: number;
      date?: string;
      pois?: Array<{
        name?: string;
        title?: string;
        description?: string;
        category?: string;
        address?: string;
        start_time?: string;
        time_slot?: string;
        duration_minutes?: number;
      }>;
      activities?: Array<{
        name?: string;
        title?: string;
        description?: string;
        category?: string;
        address?: string;
        start_time?: string;
        time_slot?: string;
        duration_minutes?: number;
      }>;
    }>;
  } | null | undefined;

  const days = Array.isArray(itin?.days) ? itin.days : [];
  let eventIndex = 0;

  for (const day of days) {
    const dayDateStr = day.date || trip.start_date;
    const pois = Array.isArray(day.pois) ? day.pois : (Array.isArray(day.activities) ? day.activities : []);

    for (const poi of pois) {
      eventIndex++;
      const title = poi.name || poi.title || 'Stop';
      const description = poi.description || poi.category || `Visit ${title}`;
      const location = poi.address || `${title}, ${trip.destination}`;

      let dtStartStr = '';
      let dtEndStr = '';

      if (dayDateStr) {
        const baseDate = new Date(dayDateStr);
        if (!isNaN(baseDate.getTime())) {
          let startHour = 10;
          let startMinute = 0;
          let durationHours = 2;

          const timeVal = poi.start_time || poi.time_slot;
          if (timeVal && typeof timeVal === 'string' && timeVal.includes(':')) {
            const [h, m] = timeVal.split(':').map(Number);
            if (!isNaN(h)) startHour = h;
            if (!isNaN(m)) startMinute = m;
          }

          if (poi.duration_minutes && typeof poi.duration_minutes === 'number') {
            durationHours = poi.duration_minutes / 60;
          }

          const startDate = new Date(baseDate);
          startDate.setHours(startHour, startMinute, 0, 0);

          const endDate = new Date(startDate.getTime() + Math.max(30, durationHours * 60) * 60 * 1000);

          dtStartStr = formatUtcTimestamp(startDate);
          dtEndStr = formatUtcTimestamp(endDate);
        }
      }

      if (!dtStartStr) {
        const fallbackStart = new Date();
        dtStartStr = formatUtcTimestamp(fallbackStart);
        dtEndStr = formatUtcTimestamp(new Date(fallbackStart.getTime() + 3600000));
      }

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:paladio-${trip.id || 'trip'}-${day.day_number || 1}-${eventIndex}@paladio.app`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART:${dtStartStr}`);
      lines.push(`DTEND:${dtEndStr}`);
      lines.push(`SUMMARY:${title.replace(/[\r\n]+/g, ' ')}`);
      lines.push(`DESCRIPTION:${description.replace(/[\r\n]+/g, ' ')}`);
      lines.push(`LOCATION:${location.replace(/[\r\n]+/g, ' ')}`);
      lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    }
  }

  // Fallback if no POI events were parsed
  if (eventIndex === 0) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:paladio-${trip.id || 'trip'}-overview@paladio.app`);
    lines.push(`DTSTAMP:${dtStamp}`);
    const sDate = trip.start_date ? new Date(trip.start_date) : now;
    const eDate = trip.end_date ? new Date(trip.end_date) : new Date(sDate.getTime() + 86400000 * 3);
    lines.push(`DTSTART:${formatUtcTimestamp(sDate)}`);
    lines.push(`DTEND:${formatUtcTimestamp(eDate)}`);
    lines.push(`SUMMARY:Trip to ${trip.destination || 'Destination'}`);
    lines.push(`DESCRIPTION:Paladio Expedition to ${trip.destination || 'Destination'}`);
    lines.push(`LOCATION:${trip.destination || 'Destination'}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Downloads the .ics calendar file for import into calendar clients.
 */
export function downloadItineraryIcs(
  trip: TripExportData,
  dayFilter?: number | number[]
): void {
  const icsData = generateIcsCalendar(filterTripDays(trip, dayFilter));
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;

  const cleanDest = (trip.destination || 'trip').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  a.download = `${cleanDest}_calendar.ics`;

  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export interface WholeCalendarDealExport {
  id?: string;
  origin_iata?: string;
  destination_code?: string;
  origin_name?: string;
  destination_name?: string;
  depart_date: string;
  return_date: string;
  nights?: number;
  total_price_eur?: number;
  discount_pct?: number;
}

export interface WholeCalendarExportInput {
  trips: TripExportData[];
  holidays?: Iterable<string>;
  publicHolidays?: Map<string, string> | Record<string, string>;
  monitoredDeals?: WholeCalendarDealExport[];
  calendarName?: string;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function parseIsoDateParts(dateStr?: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const match = dateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toIcsDateValue(dateStr?: string, offsetDays = 0): string | null {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) return null;
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

/**
 * Generates an RFC-5545 compliant iCalendar string for the entire Paladio calendar
 * (all trips + scheduled stops, public holidays, user PTO/holidays, and monitored deals).
 */
export function generateWholeCalendarIcs(input: WholeCalendarExportInput): {
  ics: string;
  eventCount: number;
} {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Paladio//Annual Dispatch Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(input.calendarName || 'Paladio - Whole Calendar')}`,
  ];

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatUtcTimestamp = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const dtStamp = formatUtcTimestamp(now);
  let eventCount = 0;

  // 1. Trips (multi-day all-day spans + any timed itinerary stops)
  input.trips.forEach((trip, tripIdx) => {
    const tripKey = trip.id || `idx-${tripIdx}`;
    const startVal = toIcsDateValue(trip.start_date, 0);
    const endVal = toIcsDateValue(trip.end_date || trip.start_date, 1);

    if (startVal && endVal) {
      eventCount++;
      const dest = trip.destination || 'Trip';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:paladio-cal-trip-${tripKey}-${startVal}@paladio.app`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${startVal}`);
      lines.push(`DTEND;VALUE=DATE:${endVal}`);
      lines.push(`SUMMARY:${escapeIcsText(`Trip: ${dest}`)}`);
      lines.push(`DESCRIPTION:${escapeIcsText(`Paladio Expedition to ${dest} (${trip.start_date?.slice(0, 10) || ''} to ${(trip.end_date || trip.start_date)?.slice(0, 10) || ''})`)}`);
      lines.push(`LOCATION:${escapeIcsText(dest)}`);
      lines.push('CATEGORIES:Paladio Trip');
      lines.push('TRANSP:OPAQUE');
      lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    }

    const itin = trip.itinerary_data as {
      days?: Array<{
        day_number?: number;
        date?: string;
        pois?: Array<{
          name?: string;
          title?: string;
          description?: string;
          category?: string;
          address?: string;
          start_time?: string;
          time_slot?: string;
          duration_minutes?: number;
        }>;
        activities?: Array<{
          name?: string;
          title?: string;
          description?: string;
          category?: string;
          address?: string;
          start_time?: string;
          time_slot?: string;
          duration_minutes?: number;
        }>;
      }>;
    } | null | undefined;

    const days = Array.isArray(itin?.days) ? itin.days : [];
    let poiIdx = 0;
    for (const day of days) {
      const dayDateStr = day.date || trip.start_date;
      if (!dayDateStr) continue;
      const baseDate = new Date(dayDateStr);
      if (isNaN(baseDate.getTime())) continue;

      const pois = Array.isArray(day.pois)
        ? day.pois
        : Array.isArray(day.activities)
          ? day.activities
          : [];

      for (const poi of pois) {
        poiIdx++;
        eventCount++;
        const title = poi.name || poi.title || 'Stop';
        const description = poi.description || poi.category || `Visit ${title}`;
        const location = poi.address || `${title}, ${trip.destination || ''}`;

        let startHour = 10;
        let startMinute = 0;
        let durationHours = 2;
        const timeVal = poi.start_time || poi.time_slot;
        if (timeVal && typeof timeVal === 'string' && timeVal.includes(':')) {
          const [h, m] = timeVal.split(':').map(Number);
          if (!isNaN(h)) startHour = h;
          if (!isNaN(m)) startMinute = m;
        }
        if (poi.duration_minutes && typeof poi.duration_minutes === 'number') {
          durationHours = poi.duration_minutes / 60;
        }

        const startDate = new Date(baseDate);
        startDate.setHours(startHour, startMinute, 0, 0);
        const endDate = new Date(startDate.getTime() + Math.max(30, durationHours * 60) * 60 * 1000);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:paladio-cal-trip-${tripKey}-d${day.day_number || 1}-e${poiIdx}@paladio.app`);
        lines.push(`DTSTAMP:${dtStamp}`);
        lines.push(`DTSTART:${formatUtcTimestamp(startDate)}`);
        lines.push(`DTEND:${formatUtcTimestamp(endDate)}`);
        lines.push(`SUMMARY:${escapeIcsText(title)}`);
        lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
        lines.push(`LOCATION:${escapeIcsText(location)}`);
        lines.push('CATEGORIES:Paladio Activity');
        lines.push('STATUS:CONFIRMED');
        lines.push('END:VEVENT');
      }
    }
  });

  // 2. Public Holidays
  const publicHolidayEntries: Array<[string, string]> = input.publicHolidays instanceof Map
    ? Array.from(input.publicHolidays.entries())
    : input.publicHolidays
      ? Object.entries(input.publicHolidays)
      : [];
  const publicHolidayDateSet = new Set<string>();

  for (const [dateStr, name] of publicHolidayEntries.sort(([a], [b]) => a.localeCompare(b))) {
    const startVal = toIcsDateValue(dateStr, 0);
    const endVal = toIcsDateValue(dateStr, 1);
    if (!startVal || !endVal) continue;
    publicHolidayDateSet.add(dateStr.slice(0, 10));
    eventCount++;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:paladio-cal-publicholiday-${startVal}@paladio.app`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startVal}`);
    lines.push(`DTEND;VALUE=DATE:${endVal}`);
    lines.push(`SUMMARY:${escapeIcsText(`Public Holiday: ${name}`)}`);
    lines.push('CATEGORIES:Public Holiday');
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  // 3. User Holidays / PTO
  const ptoDates = input.holidays ? Array.from(input.holidays).sort() : [];
  for (const dateStr of ptoDates) {
    const normalized = dateStr.slice(0, 10);
    if (publicHolidayDateSet.has(normalized)) continue;
    const startVal = toIcsDateValue(normalized, 0);
    const endVal = toIcsDateValue(normalized, 1);
    if (!startVal || !endVal) continue;
    eventCount++;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:paladio-cal-pto-${startVal}@paladio.app`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startVal}`);
    lines.push(`DTEND;VALUE=DATE:${endVal}`);
    lines.push('SUMMARY:Holiday / PTO');
    lines.push('CATEGORIES:Holiday,PTO');
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  }

  // 4. Monitored Deals
  const deals = input.monitoredDeals || [];
  deals.forEach((deal, idx) => {
    const startVal = toIcsDateValue(deal.depart_date, 0);
    const endVal = toIcsDateValue(deal.return_date || deal.depart_date, 1);
    if (!startVal || !endVal) return;
    eventCount++;
    const origin = deal.origin_iata || deal.origin_name || 'Origin';
    const dest = deal.destination_name || deal.destination_code || 'Destination';
    const pricePart = deal.total_price_eur != null ? ` (€${Math.round(deal.total_price_eur)})` : '';
    const discountPart = deal.discount_pct != null ? ` - ${Math.round(deal.discount_pct)}% off` : '';
    const dealUid = deal.id || `${origin}-${deal.destination_code || idx}-${startVal}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:paladio-cal-deal-${dealUid}@paladio.app`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startVal}`);
    lines.push(`DTEND;VALUE=DATE:${endVal}`);
    lines.push(`SUMMARY:${escapeIcsText(`Deal: ${origin} -> ${dest}${pricePart}`)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(`Monitored flight deal ${origin} to ${dest}${pricePart}${discountPart}`)}`);
    lines.push('CATEGORIES:Monitored Deal');
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return { ics: lines.join('\r\n'), eventCount };
}

/**
 * Downloads the whole Paladio calendar as a single .ics file.
 * Returns the number of events included in the exported file.
 */
export function downloadWholeCalendarIcs(input: WholeCalendarExportInput): number {
  const { ics, eventCount } = generateWholeCalendarIcs(input);
  if (eventCount === 0) return 0;

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'paladio_calendar.ics';

  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
  return eventCount;
}

/**
 * Decodes Google/Valhalla polyline with precision 6 (1e-6) into [lat, lon] pairs.
 */
export function decodePolyline6Client(encoded: string): Array<[number, number]> {
  if (!encoded) return [];
  const coords: Array<[number, number]> = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  const inv = 1e-6;

  while (i < encoded.length) {
    let shift = 0;
    let result = 0;
    while (i < encoded.length) {
      const b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    if (i >= encoded.length) break;

    shift = 0;
    result = 0;
    while (i < encoded.length) {
      const b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([Number((lat * inv).toFixed(6)), Number((lng * inv).toFixed(6))]);
  }
  return coords;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractCoordFromStop(stopLike: Record<string, unknown>): {
  lat: number;
  lon: number;
  name: string;
  desc: string;
  geometry: unknown;
} | null {
  const poi = (stopLike.poi && typeof stopLike.poi === 'object' ? stopLike.poi : stopLike) as Record<string, unknown>;
  const loc = (poi.location && typeof poi.location === 'object' ? poi.location : poi) as Record<string, unknown>;
  const lat = Number(loc.latitude ?? loc.lat ?? poi.latitude ?? poi.lat);
  const lon = Number(loc.longitude ?? loc.lon ?? loc.lng ?? poi.longitude ?? poi.lon ?? poi.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return null;
  }
  const name = String(poi.name || poi.title || 'Stop');
  const desc = String(poi.description || poi.category || stopLike.notes || '');
  const leg = stopLike.transit_from_previous as Record<string, unknown> | undefined;
  return {
    lat,
    lon,
    name,
    desc,
    geometry: leg?.geometry,
  };
}

function normalizeGeometryPoints(geometry: unknown): Array<[number, number]> {
  if (!geometry) return [];
  if (typeof geometry === 'string') {
    return decodePolyline6Client(geometry);
  }
  if (Array.isArray(geometry)) {
    const pts: Array<[number, number]> = [];
    for (const pt of geometry) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lat = Number(pt[0]);
        const lon = Number(pt[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          pts.push([lat, lon]);
        }
      }
    }
    return pts;
  }
  return [];
}

/**
 * Generates a GPX 1.1 XML string for the whole trip or selected days.
 */
export function generateGpxTrack(
  trip: TripExportData,
  dayFilter?: number | number[]
): string {
  const scoped = filterTripDays(trip, dayFilter);
  const itin = (scoped.itinerary_data || {}) as {
    days?: Array<Record<string, unknown>>;
  };
  const filteredDays = Array.isArray(itin?.days) ? itin.days : [];

  const wpts: string[] = [];
  const trks: string[] = [];

  filteredDays.forEach((dayObj, idx) => {
    const dNum = typeof dayObj.day === 'number' ? dayObj.day : typeof dayObj.day_number === 'number' ? dayObj.day_number : idx + 1;
    const dayItin = dayObj.itinerary as Record<string, unknown> | undefined;
    const rawStops = Array.isArray(dayItin?.path)
      ? (dayItin.path as Array<Record<string, unknown>>)
      : Array.isArray(dayObj.pois)
      ? (dayObj.pois as Array<Record<string, unknown>>)
      : Array.isArray(dayObj.activities)
      ? (dayObj.activities as Array<Record<string, unknown>>)
      : [];

    const trkpts: string[] = [];
    for (const stop of rawStops) {
      const parsed = extractCoordFromStop(stop);
      if (!parsed) continue;

      wpts.push(
        `  <wpt lat="${parsed.lat}" lon="${parsed.lon}">\n    <name>${escapeXml(parsed.name)}</name>${parsed.desc ? `\n    <desc>${escapeXml(parsed.desc)}</desc>` : ''}\n  </wpt>`
      );

      const geomPts = normalizeGeometryPoints(parsed.geometry);
      if (geomPts.length > 0) {
        for (const [gLat, gLon] of geomPts) {
          trkpts.push(`      <trkpt lat="${gLat}" lon="${gLon}" />`);
        }
      } else {
        trkpts.push(`      <trkpt lat="${parsed.lat}" lon="${parsed.lon}" />`);
      }
    }

    if (trkpts.length > 0) {
      const trkName = `Day ${dNum}${dayObj.theme ? ` - ${String(dayObj.theme)}` : ''}`;
      trks.push(
        `  <trk>\n    <name>${escapeXml(trkName)}</name>\n    <trkseg>\n${trkpts.join('\n')}\n    </trkseg>\n  </trk>`
      );
    }
  });

  const tripName = `${trip.destination || 'Paladio'} Itinerary${
    typeof dayFilter === 'number'
      ? ` - Day ${dayFilter}`
      : Array.isArray(dayFilter) && dayFilter.length > 0
      ? ` - Days ${dayFilter.join(', ')}`
      : ''
  }`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Paladio" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(tripName)}</name></metadata>`,
    ...wpts,
    ...trks,
    '</gpx>',
  ].join('\n');
}

/**
 * Downloads a GPX 1.1 route/waypoint file for external GPS/mapping apps.
 */
export function downloadGpxTrack(
  trip: TripExportData,
  dayFilter?: number | number[]
): void {
  const gpxData = generateGpxTrack(trip, dayFilter);
  const blob = new Blob([gpxData], { type: 'application/gpx+xml;charset=utf-8' });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;

  const cleanDest = (trip.destination || 'trip').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const daySuffix =
    typeof dayFilter === 'number'
      ? `_day_${dayFilter}`
      : Array.isArray(dayFilter) && dayFilter.length > 0
      ? `_days_${dayFilter.join('_')}`
      : '';
  a.download = `${cleanDest}${daySuffix}.gpx`;

  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

/**
 * Downloads a single-POI GPX 1.1 waypoint file.
 */
export function downloadPoiGpx(poi: {
  name: string;
  lat: number;
  lng: number;
  description?: string | null;
}): void {
  const gpxData = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Paladio" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(poi.name)}</name></metadata>`,
    `  <wpt lat="${poi.lat}" lon="${poi.lng}">`,
    `    <name>${escapeXml(poi.name)}</name>`,
    poi.description ? `    <desc>${escapeXml(poi.description)}</desc>` : '',
    '  </wpt>',
    '</gpx>',
  ]
    .filter(Boolean)
    .join('\n');

  const blob = new Blob([gpxData], { type: 'application/gpx+xml;charset=utf-8' });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  const cleanName = (poi.name || 'place').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  a.download = `${cleanName}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}
