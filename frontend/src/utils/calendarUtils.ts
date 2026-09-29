import { Trip } from '@/hooks/useTrips';
import { isTripCompleted } from '@/utils/tripParser';

export type TripStatus = 'COMPLETED' | 'ACTIVE' | 'UPCOMING';

export interface CalendarDay {
  date: Date;
  dateString: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  trips: Array<{
    trip: Trip;
    status: TripStatus;
    isStart: boolean;
    isEnd: boolean;
  }>;
}

export function formatDateToIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDayString(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getTripStatus(trip: Trip, now: Date = new Date()): TripStatus {
  if (isTripCompleted(trip)) {
    return 'COMPLETED';
  }

  const startDate = parseDayString(trip.start_date);
  const startDayTime = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0).getTime();
  const nowTime = now.getTime();

  // If start is in the future
  if (nowTime < startDayTime) {
    return 'UPCOMING';
  }

  // If it's not completed and start has passed or is today, it's ACTIVE
  return 'ACTIVE';
}

export function generateMonthGrid(year: number, month: number, trips: Trip[] = []): CalendarDay[] {
  const todayStr = formatDateToIsoDay(new Date());
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Day of week: 0 = Sun, 1 = Mon... We want Monday as index 0
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday is 6th in 0-indexed Mon-start

  const days: CalendarDay[] = [];

  // Previous month padding
  const prevMonthLastDate = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDate - i);
    days.push(createCalendarDay(d, false, todayStr, trips));
  }

  // Current month days
  for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
    const date = new Date(year, month, d);
    days.push(createCalendarDay(date, true, todayStr, trips));
  }

  // Trailing padding days to fill 5 or 6 full 7-day weeks (multiples of 7)
  const remainingDays = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remainingDays; d++) {
    const date = new Date(year, month + 1, d);
    days.push(createCalendarDay(date, false, todayStr, trips));
  }

  return days;
}

function createCalendarDay(date: Date, isCurrentMonth: boolean, todayStr: string, trips: Trip[]): CalendarDay {
  const dateString = formatDateToIsoDay(date);
  const isToday = dateString === todayStr;
  const dayTime = date.getTime();
  const now = new Date();

  const matchingTrips = trips.filter(trip => {
    if (!trip.start_date || !trip.end_date) return false;
    const start = parseDayString(trip.start_date).getTime();
    const end = parseDayString(trip.end_date).getTime();
    return dayTime >= start && dayTime <= end;
  }).map(trip => {
    const startStr = formatDateToIsoDay(parseDayString(trip.start_date));
    const endStr = formatDateToIsoDay(parseDayString(trip.end_date));
    return {
      trip,
      status: getTripStatus(trip, now),
      isStart: dateString === startStr,
      isEnd: dateString === endStr,
    };
  });

  return {
    date,
    dateString,
    dayNumber: date.getDate(),
    isCurrentMonth,
    isToday,
    trips: matchingTrips,
  };
}

export function calculateTripDurationDays(startDateStr: string, endDateStr: string): number {
  try {
    const start = parseDayString(startDateStr);
    const end = parseDayString(endDateStr);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  } catch {
    return 1;
  }
}

/**
 * Generates an RFC 5545 compliant iCalendar string for a Paladio trip
 */
export function generateIcsContent(trip: Trip): string {
  const start = parseDayString(trip.start_date);
  const end = parseDayString(trip.end_date);
  // In iCalendar, DTEND for all-day events is exclusive, so add 1 day
  const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);

  const formatIcsDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `paladio-trip-${trip.id || Date.now()}@paladio.local`;
  const summary = `Mission: ${trip.destination}`;
  const description = `Paladio Autonomous Itinerary for ${trip.destination}. Managed by Paladio Control Center.`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Paladio//Autonomous Travel Control Center//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${formatIcsDate(start)}`,
    `DTEND;VALUE=DATE:${formatIcsDate(endExclusive)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${trip.destination}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Triggers a direct browser download of the .ics file
 */
export function downloadTripIcs(trip: Trip): void {
  const content = generateIcsContent(trip);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeDest = trip.destination.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  link.href = url;
  link.setAttribute('download', `paladio_mission_${safeDest}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
