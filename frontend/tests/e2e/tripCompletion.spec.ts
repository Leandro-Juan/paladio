import { test, expect } from '@playwright/test';
import { isTripCompleted, getTripReturnDateTime } from '../../src/utils/tripParser';

test.describe('Trip Completion Logic', () => {
  // Reference date: 2026-09-17 at 14:00:00 (local or UTC)
  const refDate = new Date('2026-09-17T14:00:00.000Z');

  test.describe('isTripCompleted', () => {
    test('returns false for future trips (e.g. 23/9/2026 - 29/9/2026)', () => {
      const futureTrip = {
        destination: 'Paris',
        start_date: '2026-09-23T00:00:00.000Z',
        end_date: '2026-09-29T00:00:00.000Z',
      };
      expect(isTripCompleted(futureTrip, refDate)).toBe(false);
    });

    test('returns false for future trips with date-only format', () => {
      const futureTrip = {
        destination: 'Madrid',
        start_date: '2026-09-23',
        end_date: '2026-09-29',
      };
      expect(isTripCompleted(futureTrip, refDate)).toBe(false);
    });

    test('returns true for past completed trips (e.g. ended 10/9/2026)', () => {
      const pastTrip = {
        destination: 'Tokyo',
        start_date: '2026-09-01',
        end_date: '2026-09-10',
      };
      expect(isTripCompleted(pastTrip, refDate)).toBe(true);
    });

    test('returns true for past completed trips with ISO string timestamp', () => {
      const pastTrip = {
        destination: 'Rome',
        start_date: '2026-09-01T10:00:00.000Z',
        end_date: '2026-09-15T18:00:00.000Z',
      };
      expect(isTripCompleted(pastTrip, refDate)).toBe(true);
    });

    test('same-day trip: returns true if return flight arrival time has passed', () => {
      // Return flight arrival at 11:00, refDate is 14:00
      const trip = {
        destination: 'London',
        start_date: '2026-09-15',
        end_date: '2026-09-17',
        itinerary_data: {
          days: [
            { day: 1 },
            {
              day: 2,
              flight_info: {
                destination_iata: 'HOME',
                departure_time: '09:00',
                arrival_time: '11:00',
              },
            },
          ],
        },
      };
      // In local time, 11:00 has passed if refDate is 14:00 on the same date
      const localRefDate = new Date(2026, 8, 17, 14, 0, 0); // Sept 17, 14:00 local
      expect(isTripCompleted(trip, localRefDate)).toBe(true);
    });

    test('same-day trip: returns false if return flight arrival time is in the future', () => {
      // Return flight arrival at 18:00, refDate is 14:00
      const trip = {
        destination: 'London',
        start_date: '2026-09-15',
        end_date: '2026-09-17',
        itinerary_data: {
          days: [
            { day: 1 },
            {
              day: 2,
              flight_info: {
                destination_iata: 'HOME',
                departure_time: '16:00',
                arrival_time: '18:00',
              },
            },
          ],
        },
      };
      const localRefDate = new Date(2026, 8, 17, 14, 0, 0);
      expect(isTripCompleted(trip, localRefDate)).toBe(false);
    });

    test('same-day trip: uses last POI departure time if flight_info is absent', () => {
      const finishedTrip = {
        destination: 'Berlin',
        start_date: '2026-09-16',
        end_date: '2026-09-17',
        itinerary_data: {
          days: [
            {
              day: 1,
              itinerary: {
                path: [{ poi: { name: 'Gate' }, departure_time: '12:30' }],
              },
            },
          ],
        },
      };
      const localRefDate = new Date(2026, 8, 17, 14, 0, 0);
      expect(isTripCompleted(finishedTrip, localRefDate)).toBe(true);

      const ongoingTrip = {
        destination: 'Berlin',
        start_date: '2026-09-16',
        end_date: '2026-09-17',
        itinerary_data: {
          days: [
            {
              day: 1,
              itinerary: {
                path: [{ poi: { name: 'Museum' }, departure_time: '17:00' }],
              },
            },
          ],
        },
      };
      expect(isTripCompleted(ongoingTrip, localRefDate)).toBe(false);
    });

    test('same-day trip: date-only with no time is not complete until the day has passed', () => {
      const trip = {
        destination: 'Amsterdam',
        start_date: '2026-09-14',
        end_date: '2026-09-17',
      };
      const localAtNoon = new Date(2026, 8, 17, 12, 0, 0);
      expect(isTripCompleted(trip, localAtNoon)).toBe(false);

      const nextDayMorning = new Date(2026, 8, 18, 1, 0, 0);
      expect(isTripCompleted(trip, nextDayMorning)).toBe(true);
    });

    test('handles missing, null, or empty trips gracefully', () => {
      expect(isTripCompleted({} as any, refDate)).toBe(false);
      expect(isTripCompleted({ end_date: '' }, refDate)).toBe(false);
      expect(isTripCompleted({ end_date: 'invalid-date' }, refDate)).toBe(false);
    });
  });

  test.describe('getTripReturnDateTime', () => {
    test('parses ISO string with time', () => {
      const trip = { end_date: '2026-09-29T18:45:00.000Z' };
      const parsed = getTripReturnDateTime(trip);
      expect(parsed).not.toBeNull();
      expect(parsed?.toISOString()).toBe('2026-09-29T18:45:00.000Z');
    });

    test('returns null for missing end_date', () => {
      expect(getTripReturnDateTime({})).toBeNull();
    });
  });
});
