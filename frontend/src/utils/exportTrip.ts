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
 * Exports raw itinerary JSON for developer and tooling consumption.
 */
export function downloadItineraryJson(trip: TripExportData): void {
  const data = trip.itinerary_data || trip;
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
export function downloadItineraryIcs(trip: TripExportData): void {
  const icsData = generateIcsCalendar(trip);
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
