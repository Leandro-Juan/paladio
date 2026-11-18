import { ScheduledPoi, TransitLeg } from '@/types/domain';
import { formatPoiTime, getScheduledPoiTimes } from '@/utils/date';
import { isHotelPoi, isAirportPoi } from '@/utils/poiCategory';

export interface SchedulableItem {
  poi?: {
    id?: string;
    name?: string;
    city?: string;
    category?: string;
    duration_mins?: number;
    cost_eur?: number;
    location?: { latitude?: number; longitude?: number };
    photo_url?: string;
    locked?: boolean;
    is_fixed?: boolean;
  } | null;
  scheduled_start?: string;
  scheduled_end?: string;
  arrival_time?: string;
  departure_time?: string;
  arrival_time_mins?: number;
  departure_time_mins?: number;
  transit_from_previous?: TransitLeg | { duration_mins?: number } | null;
  travel_time_mins_from_prev?: number;
  is_fixed?: boolean;
  locked?: boolean;
}

/**
 * Parses an HH:mm time string into total minutes from midnight.
 * Returns null if invalid.
 */
function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || timeStr === '--:--') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Automatically calculates and populates realistic scheduled start and end times
 * for all stops in a day's path, based on adjacent stop hours, POI duration, and transit.
 */
export function autoFillDayItineraryHours(path: (ScheduledPoi | SchedulableItem)[]): void {
  if (!Array.isArray(path) || path.length === 0) return;

  // 1. Find the earliest valid reference time in the day
  let baseStartMins: number | null = null;
  let firstTimedIdx = -1;

  for (let i = 0; i < path.length; i++) {
    const stop = path[i];
    const { start } = getScheduledPoiTimes(stop as ScheduledPoi);
    const parsed = parseTimeToMinutes(start);
    if (parsed !== null) {
      baseStartMins = parsed;
      firstTimedIdx = i;
      break;
    }
  }

  // If no stop has any time, default the initial stop of the day to 09:00 (540 mins)
  if (baseStartMins === null || firstTimedIdx === -1) {
    baseStartMins = 9 * 60; // 09:00
    firstTimedIdx = 0;
  }

  // 2. If firstTimedIdx > 0, work backward to index 0 to assign realistic earlier start times
  if (firstTimedIdx > 0) {
    let prevEndMins = baseStartMins;
    for (let i = firstTimedIdx - 1; i >= 0; i--) {
      const stop = path[i];
      const isHotel = isHotelPoi(stop.poi);
      let duration = stop.poi?.duration_mins ?? 60;
      if (isHotel && i === 0) duration = Math.min(duration, 15);
      if (duration <= 0) duration = (i === 0 && isHotel) ? 0 : 30;

      const transit = stop.transit_from_previous?.duration_mins ?? stop.travel_time_mins_from_prev ?? 15;
      const startMins = Math.max(7 * 60, prevEndMins - transit - duration);
      const endMins = startMins + duration;
      const startStr = formatPoiTime(startMins);
      const endStr = formatPoiTime(endMins);

      stop.scheduled_start = startStr;
      stop.scheduled_end = endStr;
      stop.arrival_time = startStr;
      stop.departure_time = endStr;
      stop.arrival_time_mins = startMins;
      stop.departure_time_mins = endMins;

      prevEndMins = startMins;
    }
  }

  // 3. Forward pass through all stops to compute/propagate start and end times
  let runningMins = baseStartMins;
  if (firstTimedIdx > 0 && typeof path[0]?.arrival_time_mins === 'number') {
    runningMins = path[0].arrival_time_mins;
  }

  for (let i = 0; i < path.length; i++) {
    const stop = path[i];
    const isHotel = isHotelPoi(stop.poi);
    const isAirport = isAirportPoi(stop.poi);

    // If i > 0, account for transit from previous stop
    if (i > 0) {
      const transit = stop.transit_from_previous?.duration_mins ?? stop.travel_time_mins_from_prev ?? 15;
      runningMins += transit;
    }

    // Check if this stop has an explicit user-locked time that is later
    const rawStop = stop as unknown as { is_fixed?: boolean; locked?: boolean };
    const rawPoi = stop.poi as unknown as { is_fixed?: boolean; locked?: boolean } | undefined;
    const isExplicitlyLocked =
      rawStop?.is_fixed === true ||
      rawStop?.locked === true ||
      rawPoi?.is_fixed === true ||
      rawPoi?.locked === true;

    if (isExplicitlyLocked && typeof stop.arrival_time_mins === 'number' && stop.arrival_time_mins >= runningMins) {
      runningMins = stop.arrival_time_mins;
    }

    // Determine duration for this stop
    let durationMins = stop.poi?.duration_mins ?? 60;
    if (isHotel) {
      if (i === 0 || i === path.length - 1) {
        durationMins = Math.min(durationMins, 15);
      }
    } else if (isAirport) {
      durationMins = Math.max(durationMins, 45);
    }
    if (durationMins <= 0) {
      durationMins = (i === 0 && isHotel) ? 0 : 30;
    }

    const stopStartMins = runningMins;
    const stopEndMins = runningMins + durationMins;

    const startStr = formatPoiTime(stopStartMins);
    const endStr = formatPoiTime(stopEndMins);

    stop.scheduled_start = startStr;
    stop.scheduled_end = endStr;
    stop.arrival_time = startStr;
    stop.departure_time = endStr;
    stop.arrival_time_mins = stopStartMins;
    stop.departure_time_mins = stopEndMins;

    runningMins = stopEndMins;
  }
}
