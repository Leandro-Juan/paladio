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

export function getSafeDate(dateString?: string): string {
  try {
    if (dateString) {
      const d = new Date(dateString);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
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
    if (lastDay?.flight_info?.arrival_time) {
      explicitTimeStr = lastDay.flight_info.arrival_time.trim();
    } else if (lastDay?.flight_info?.departure_time) {
      explicitTimeStr = lastDay.flight_info.departure_time.trim();
    } else if (
      Array.isArray(lastDay?.itinerary?.path) &&
      lastDay.itinerary.path.length > 0
    ) {
      const lastPoi = lastDay.itinerary.path[lastDay.itinerary.path.length - 1];
      if (lastPoi?.departure_time) {
        explicitTimeStr = lastPoi.departure_time.trim();
      } else if (lastPoi?.arrival_time) {
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
