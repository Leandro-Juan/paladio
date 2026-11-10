export function extractDestination(itineraryData: any): string {
  if (!itineraryData) return "Unknown Destination";
  
  if (Array.isArray(itineraryData.days)) {
    for (const day of itineraryData.days) {
      if (day.flight_info && day.flight_info.destination) {
        return day.flight_info.destination;
      }
      if (day.itinerary && Array.isArray(day.itinerary.path)) {
        for (const stop of day.itinerary.path) {
          if (stop.poi && stop.poi.city) {
            return stop.poi.city;
          }
        }
      }
    }
  }
  return "Unknown Destination";
}

export function countWaypoints(itineraryData: any): number {
  if (!itineraryData) return 0;
  
  if (Array.isArray(itineraryData.days)) {
    return itineraryData.days.reduce((acc: number, day: any) => {
      let count = 0;
      if (day.itinerary && Array.isArray(day.itinerary.path)) {
        count = day.itinerary.path.length;
      }
      return acc + count;
    }, 0);
  }
  
  if (Array.isArray(itineraryData)) {
    return itineraryData.length;
  }
  
  if (typeof itineraryData === 'object') {
    return Object.keys(itineraryData).length;
  }
  
  return 0;
}

/**
 * Extracts and calculates the precise return date and time for a trip.
 * Handles ISO timestamps, date-only strings, and return flight/POI times in itinerary_data.
 */
export function getTripReturnDateTime(trip: {
  end_date?: string;
  itinerary_data?: unknown;
}): Date | null {
  if (!trip || !trip.end_date) {
    return null;
  }

  const rawEndDate = trip.end_date.trim();
  if (!rawEndDate) return null;

  // Try extracting any explicit return flight or last POI time from itinerary_data
  let explicitTimeStr: string | null = null;
  const itinerary = trip.itinerary_data as {
    days?: Array<{
      flight_info?: {
        arrival_time?: string;
        departure_time?: string;
      };
      itinerary?: {
        path?: Array<{
          departure_time?: string;
          arrival_time?: string;
          scheduled_start?: string;
        }>;
      };
    }>;
  } | null | undefined;

  if (Array.isArray(itinerary?.days) && itinerary.days.length > 0) {
    const lastDay = itinerary.days[itinerary.days.length - 1];
    if (typeof lastDay?.flight_info?.arrival_time === 'string') {
      explicitTimeStr = lastDay.flight_info.arrival_time.trim();
    } else if (typeof lastDay?.flight_info?.departure_time === 'string') {
      explicitTimeStr = lastDay.flight_info.departure_time.trim();
    } else if (
      Array.isArray(lastDay?.itinerary?.path) &&
      lastDay.itinerary.path.length > 0
    ) {
      const lastPoi = lastDay.itinerary.path[lastDay.itinerary.path.length - 1];
      if (typeof lastPoi?.departure_time === 'string') {
        explicitTimeStr = lastPoi.departure_time.trim();
      } else if (typeof lastPoi?.arrival_time === 'string') {
        explicitTimeStr = lastPoi.arrival_time.trim();
      }
    }
  }

  // 1. Check if rawEndDate is date-only (e.g. "YYYY-MM-DD")
  const dateOnlyMatch = rawEndDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10) - 1;
    const day = parseInt(dateOnlyMatch[3], 10);

    // If explicit return time found from flight or itinerary (e.g. "HH:mm" or "HH:mm:ss")
    if (explicitTimeStr) {
      const timeMatch = explicitTimeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        return new Date(year, month, day, hours, minutes, seconds);
      }
      const parsedExplicit = new Date(explicitTimeStr);
      if (!isNaN(parsedExplicit.getTime())) {
        return parsedExplicit;
      }
    }

    // Default for date-only: completed at the end of the return day
    return new Date(year, month, day, 23, 59, 59, 999);
  }

  // 2. Check if rawEndDate has date and time (ISO or "YYYY-MM-DD HH:mm...")
  const parsedDate = new Date(rawEndDate);
  if (isNaN(parsedDate.getTime())) {
    return null;
  }

  // If rawEndDate parsed to midnight (00:00:00.000) and we have explicitTimeStr
  const isUtcMidnight =
    parsedDate.getUTCHours() === 0 &&
    parsedDate.getUTCMinutes() === 0 &&
    parsedDate.getUTCSeconds() === 0;

  const isLocalMidnight =
    parsedDate.getHours() === 0 &&
    parsedDate.getMinutes() === 0 &&
    parsedDate.getSeconds() === 0;

  if (isUtcMidnight || isLocalMidnight) {
    if (explicitTimeStr) {
      const timeMatch = explicitTimeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        const res = new Date(parsedDate);
        res.setHours(hours, minutes, seconds, 0);
        return res;
      }
      const parsedExplicit = new Date(explicitTimeStr);
      if (!isNaN(parsedExplicit.getTime())) {
        return parsedExplicit;
      }
    }
    // If midnight without explicit time, treat as end of that day
    const endOfDay = new Date(parsedDate);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  }

  return parsedDate;
}

/**
 * Checks whether a trip is completed.
 * A trip is complete when the date and time of today (referenceDate) is strictly after the day and time of return.
 */
export function isTripCompleted(
  trip: { end_date?: string; itinerary_data?: unknown },
  referenceDate: Date = new Date()
): boolean {
  const returnDateTime = getTripReturnDateTime(trip);
  if (!returnDateTime) return false;
  return referenceDate.getTime() > returnDateTime.getTime();
}

export interface DayMilestone {
  dayNumber: number;
  theme?: string;
  stopsCount: number;
}

export function extractDayMilestones(itineraryData: unknown): DayMilestone[] {
  if (!itineraryData || typeof itineraryData !== 'object') return [];
  const itin = itineraryData as {
    days?: Array<{
      day?: number;
      theme?: string;
      anchor?: string;
      itinerary?: {
        path?: Array<{ poi?: { name?: string } }>;
      };
    }>;
  };
  if (!Array.isArray(itin.days)) return [];
  return itin.days.map((day, idx) => {
    const stopsCount = Array.isArray(day?.itinerary?.path) ? day.itinerary.path.length : 0;
    const theme =
      day?.theme ||
      day?.anchor ||
      (day?.itinerary?.path?.[0]?.poi?.name ? `${day.itinerary.path[0].poi.name}` : undefined);
    return {
      dayNumber: typeof day?.day === 'number' ? day.day : idx + 1,
      theme,
      stopsCount,
    };
  });
}

export function extractTripCoordinates(itineraryData: unknown): { lat: number; lng: number } | null {
  if (!itineraryData || typeof itineraryData !== 'object') return null;
  const itin = itineraryData as {
    days?: Array<{
      itinerary?: {
        path?: Array<{
          poi?: {
            location?: { latitude?: number; longitude?: number };
          };
        }>;
      };
    }>;
  };
  if (!Array.isArray(itin.days)) return null;
  for (const day of itin.days) {
    if (Array.isArray(day?.itinerary?.path)) {
      for (const stop of day.itinerary.path) {
        if (
          typeof stop?.poi?.location?.latitude === 'number' &&
          typeof stop?.poi?.location?.longitude === 'number'
        ) {
          return {
            lat: stop.poi.location.latitude,
            lng: stop.poi.location.longitude,
          };
        }
      }
    }
  }
  return null;
}

export function extractRouteCorridor(itineraryData: unknown): {
  origin?: string;
  originIata?: string;
  destinationIata?: string;
} | null {
  if (!itineraryData || typeof itineraryData !== 'object') return null;
  const itin = itineraryData as {
    travel_constraints?: {
      origin_city?: string;
      origin_iata?: string;
      destination_iata?: string;
    };
    days?: Array<{
      flight_info?: {
        origin_iata?: string;
        destination_iata?: string;
      };
    }>;
  };
  const constraints = itin.travel_constraints;
  let origin = constraints?.origin_city;
  let originIata = constraints?.origin_iata;
  let destinationIata = constraints?.destination_iata;

  if (Array.isArray(itin.days)) {
    for (const day of itin.days) {
      if (day.flight_info) {
        origin = origin || day.flight_info.origin_iata;
        originIata = originIata || day.flight_info.origin_iata;
        destinationIata = destinationIata || day.flight_info.destination_iata;
        break;
      }
    }
  }

  if (origin || originIata || destinationIata) {
    return { origin, originIata, destinationIata };
  }
  return null;
}

export function extractTotalCost(itineraryData: unknown): number | null {
  if (!itineraryData || typeof itineraryData !== 'object') return null;
  const itin = itineraryData as { total_trip_cost?: unknown };
  if (typeof itin.total_trip_cost === 'number' && itin.total_trip_cost > 0) {
    return itin.total_trip_cost;
  }
  return null;
}

export function extractTripTitle(trip?: {
  destination?: string;
  itinerary_data?: unknown;
}): string {
  if (!trip) return 'Active Expedition';
  const itin = trip.itinerary_data as {
    title?: string;
    manual_constraints?: { title?: string };
    travel_constraints?: { title?: string };
  } | null | undefined;

  if (itin?.title && typeof itin.title === 'string' && itin.title.trim()) {
    return itin.title.trim();
  }
  if (
    itin?.manual_constraints?.title &&
    typeof itin.manual_constraints.title === 'string' &&
    itin.manual_constraints.title.trim()
  ) {
    return itin.manual_constraints.title.trim();
  }
  if (
    itin?.travel_constraints?.title &&
    typeof itin.travel_constraints.title === 'string' &&
    itin.travel_constraints.title.trim()
  ) {
    return itin.travel_constraints.title.trim();
  }
  return trip.destination || 'Active Expedition';
}

const COMMON_CITY_TIMEZONES: Record<string, string> = {
  tokyo: 'Asia/Tokyo',
  japan: 'Asia/Tokyo',
  madrid: 'Europe/Madrid',
  spain: 'Europe/Madrid',
  porto: 'Europe/Lisbon',
  lisbon: 'Europe/Lisbon',
  portugal: 'Europe/Lisbon',
  sevilla: 'Europe/Madrid',
  seville: 'Europe/Madrid',
  paris: 'Europe/Paris',
  rome: 'Europe/Rome',
  london: 'Europe/London',
  berlin: 'Europe/Berlin',
  vienna: 'Europe/Vienna',
  amsterdam: 'Europe/Amsterdam',
  'new york': 'America/New_York',
};

export function resolveDestinationTimezone(
  destination?: string,
  rawTimezone?: string | null
): string | null {
  if (rawTimezone && rawTimezone.trim()) return rawTimezone.trim();
  if (!destination) return null;
  const clean = destination.toLowerCase().trim();
  for (const [key, tz] of Object.entries(COMMON_CITY_TIMEZONES)) {
    if (clean.includes(key)) return tz;
  }
  return null;
}

export function formatTimezone(tz?: string | null): string | null {
  if (!tz) return null;
  try {
    const d = new Date();
    const offsetPart = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value;

    const offset = offsetPart ? offsetPart.replace('GMT', 'UTC') : '';
    const city = tz.includes('/') ? tz.split('/')[1].replace(/_/g, ' ') : tz;
    return offset ? `${city} (${offset})` : tz;
  } catch {
    return tz;
  }
}



