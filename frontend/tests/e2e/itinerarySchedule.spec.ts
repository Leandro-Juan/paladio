import { test, expect } from '@playwright/test';
import { autoFillDayItineraryHours, SchedulableItem } from '../../src/utils/itinerarySchedule';

test.describe('Itinerary Schedule Auto-Fill Utility', () => {
  test('handles empty path gracefully', () => {
    const emptyPath: SchedulableItem[] = [];
    autoFillDayItineraryHours(emptyPath);
    expect(emptyPath).toEqual([]);
  });

  test('auto-fills sequential realistic hours when no stops have initial times', () => {
    const path: SchedulableItem[] = [
      {
        poi: { id: 'poi-hotel-start', name: 'Grand Hotel (Start)', category: 'hotel', duration_mins: 15 },
      },
      {
        poi: { id: 'poi-monument', name: 'Victory Monument', category: 'monument', duration_mins: 60 },
        transit_from_previous: { duration_mins: 20 },
      },
      {
        poi: { id: 'poi-park', name: 'Lumpini Park', category: 'park', duration_mins: 90 },
        transit_from_previous: { duration_mins: 15 },
      },
      {
        poi: { id: 'poi-hotel-end', name: 'Grand Hotel (End)', category: 'hotel', duration_mins: 15 },
        transit_from_previous: { duration_mins: 25 },
      },
    ];

    autoFillDayItineraryHours(path);

    // Stop 0: Hotel (Start) -> 09:00 - 09:15
    expect(path[0].scheduled_start).toBe('09:00');
    expect(path[0].scheduled_end).toBe('09:15');
    expect(path[0].arrival_time_mins).toBe(540);
    expect(path[0].departure_time_mins).toBe(555);

    // Stop 1: Victory Monument -> 09:15 + 20m transit = 09:35 start, 60m duration = 10:35 end
    expect(path[1].scheduled_start).toBe('09:35');
    expect(path[1].scheduled_end).toBe('10:35');
    expect(path[1].arrival_time_mins).toBe(575);
    expect(path[1].departure_time_mins).toBe(635);

    // Stop 2: Lumpini Park -> 10:35 + 15m transit = 10:50 start, 90m duration = 12:20 end
    expect(path[2].scheduled_start).toBe('10:50');
    expect(path[2].scheduled_end).toBe('12:20');
    expect(path[2].arrival_time_mins).toBe(650);
    expect(path[2].departure_time_mins).toBe(740);

    // Stop 3: Hotel (End) -> 12:20 + 25m transit = 12:45 start, 15m duration = 13:00 end
    expect(path[3].scheduled_start).toBe('12:45');
    expect(path[3].scheduled_end).toBe('13:00');
    expect(path[3].arrival_time_mins).toBe(765);
    expect(path[3].departure_time_mins).toBe(780);
  });

  test('dropping airport as first stop preserves hotel as second stop and recalculates schedule', () => {
    // When airport is dropped at index 0, hotel shifts to index 1
    const path: SchedulableItem[] = [
      {
        poi: { id: 'poi-airport', name: 'Don Mueang Airport (DMK)', category: 'airport', duration_mins: 60 },
      },
      {
        poi: { id: 'poi-hotel', name: 'Centara Grand Hotel', category: 'hotel', duration_mins: 30 },
        transit_from_previous: { duration_mins: 35 },
      },
      {
        poi: { id: 'poi-temple', name: 'Wat Arun', category: 'attraction', duration_mins: 90 },
        transit_from_previous: { duration_mins: 20 },
      },
    ];

    autoFillDayItineraryHours(path);

    // Airport at 09:00 - 10:00 (airport default/duration 60m)
    expect(path[0].scheduled_start).toBe('09:00');
    expect(path[0].scheduled_end).toBe('10:00');

    // Hotel at index 1 is NOT deleted; starts after 35m transit at 10:35
    expect(path[1].poi?.name).toBe('Centara Grand Hotel');
    expect(path[1].scheduled_start).toBe('10:35');
    expect(path[1].scheduled_end).toBe('11:05');

    // Wat Arun at index 2 starts at 11:25
    expect(path[2].scheduled_start).toBe('11:25');
    expect(path[2].scheduled_end).toBe('12:55');
  });

  test('respects explicitly locked stop times and adjusts downstream stops', () => {
    const path: SchedulableItem[] = [
      {
        poi: { id: 'poi-start', name: 'Hotel Start', category: 'hotel', duration_mins: 15 },
        scheduled_start: '09:00',
        scheduled_end: '09:15',
        arrival_time_mins: 540,
        departure_time_mins: 555,
      },
      {
        // User locked lunch at 13:00
        poi: { id: 'poi-lunch', name: 'Raan Jay Fai', category: 'restaurant', duration_mins: 75, locked: true },
        scheduled_start: '13:00',
        scheduled_end: '14:15',
        arrival_time_mins: 13 * 60,
        departure_time_mins: 13 * 60 + 75,
        transit_from_previous: { duration_mins: 20 },
      },
      {
        poi: { id: 'poi-market', name: 'Chatuchak Market', category: 'attraction', duration_mins: 120 },
        transit_from_previous: { duration_mins: 30 },
      },
    ];

    autoFillDayItineraryHours(path);

    // Stop 0: 09:00 - 09:15
    expect(path[0].scheduled_start).toBe('09:00');

    // Stop 1: locked at 13:00 preserved
    expect(path[1].scheduled_start).toBe('13:00');
    expect(path[1].scheduled_end).toBe('14:15');

    // Stop 2: 14:15 + 30m transit = 14:45 -> 16:45
    expect(path[2].scheduled_start).toBe('14:45');
    expect(path[2].scheduled_end).toBe('16:45');
  });
});
