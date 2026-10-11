/**
 * Formats an ISO timestamp into a human-readable date and time string.
 * Example: "Sep 16, 2026, 17:45"
 */
export function formatFullDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

/**
 * Returns a concise relative time string (e.g., "just now", "5m ago", "2h ago", "3d ago").
 */
export function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 5) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Safely formats a POI time string, ISO timestamp, or minute number into HH:MM format.
 * Returns '--:--' if invalid or missing.
 */
export function formatPoiTime(val?: string | number | null): string {
  if (val === undefined || val === null || val === '') return '--:--';
  if (typeof val === 'number') {
    const h = Math.floor(val / 60) % 24;
    const m = Math.floor(val % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  if (str === '--:--' || str === '') return '--:--';
  if (str.includes('T')) {
    const afterT = str.split('T')[1];
    return afterT.substring(0, 5);
  }
  if (str.includes(' ') && str.includes(':')) {
    const afterSpace = str.split(' ')[1];
    return afterSpace.substring(0, 5);
  }
  if (str.includes(':')) {
    const parts = str.split(':');
    const h = parts[0].padStart(2, '0');
    const m = (parts[1] || '00').substring(0, 2);
    return `${h}:${m}`;
  }
  return str;
}

/**
 * Extracts and formats the scheduled start and end times for a ScheduledPoi.
 */
export function getScheduledPoiTimes(scheduledPoi: {
  scheduled_start?: string;
  scheduled_end?: string;
  arrival_time?: string;
  departure_time?: string;
  arrival_time_mins?: number;
  departure_time_mins?: number;
  poi?: {
    duration_mins?: number;
  };
}): { start: string; end: string } {
  let start = '--:--';
  if (scheduledPoi.scheduled_start) {
    start = formatPoiTime(scheduledPoi.scheduled_start);
  } else if (scheduledPoi.arrival_time) {
    start = formatPoiTime(scheduledPoi.arrival_time);
  } else if (typeof scheduledPoi.arrival_time_mins === 'number') {
    start = formatPoiTime(scheduledPoi.arrival_time_mins);
  }

  let end = '--:--';
  if (scheduledPoi.scheduled_end) {
    end = formatPoiTime(scheduledPoi.scheduled_end);
  } else if (scheduledPoi.departure_time) {
    end = formatPoiTime(scheduledPoi.departure_time);
  } else if (typeof scheduledPoi.departure_time_mins === 'number') {
    end = formatPoiTime(scheduledPoi.departure_time_mins);
  }

  if (end === '--:--' && start !== '--:--' && scheduledPoi.poi?.duration_mins) {
    const parts = start.split(':');
    if (parts.length === 2) {
      const sMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      end = formatPoiTime(sMins + scheduledPoi.poi.duration_mins);
    }
  }

  return { start, end };
}

/**
 * Extracts human-readable opening hours for a POI on a given day.
 */
export function getPoiOpeningHours(
  p?: {
    osm_opening_hours?: string | null;
    open_time_mins_by_day?: number[];
    close_time_mins_by_day?: number[];
    open_time_mins?: number;
    close_time_mins?: number;
  },
  dayNumber?: number
): string | null {
  if (!p) return null;
  if (p.osm_opening_hours) return p.osm_opening_hours;

  let openMins: number | undefined;
  let closeMins: number | undefined;

  if (Array.isArray(p.open_time_mins_by_day) && p.open_time_mins_by_day.length > 0) {
    const dayIdx =
      typeof dayNumber === 'number' && dayNumber > 0
        ? (dayNumber - 1) % p.open_time_mins_by_day.length
        : 0;
    openMins = p.open_time_mins_by_day[dayIdx];
    closeMins = Array.isArray(p.close_time_mins_by_day)
      ? p.close_time_mins_by_day[dayIdx]
      : undefined;
  } else {
    openMins = p.open_time_mins;
    closeMins = p.close_time_mins;
  }

  if (openMins === undefined || openMins === null || openMins < 0) return null;
  if (closeMins === undefined || closeMins === null || closeMins < 0) return null;

  if (openMins === 0 && closeMins >= 1440) {
    return 'Open 24h';
  }

  const oH = String(Math.floor(openMins / 60) % 24).padStart(2, '0');
  const oM = String(openMins % 60).padStart(2, '0');
  const cH = String(Math.floor(closeMins / 60) % 24).padStart(2, '0');
  const cM = String(closeMins % 60).padStart(2, '0');

  return `Open ${oH}:${oM} – ${cH}:${cM}`;
}

