import { test, expect } from '@playwright/experimental-ct-react';
import { TripTimeline } from '../../src/components/TripTimeline';
import { OptimizationResult } from '../../src/types/domain';

test('renders POI category badges correctly for museum, restaurant, cafe, bus stop, hotel, and flight', async ({ mount }) => {
  const mockItinerary: OptimizationResult = {
    metadata: { engine: 'BranchAndBound', version: '2.0', nodes_evaluated: 42 },
    travel_constraints: {},
    total_trip_cost: 250,
    days: [
      {
        day: 1,
        flight_info: {
          origin_iata: 'MAD',
          destination_iata: 'CDG',
          departure_time: '08:00',
          arrival_time: '10:15',
        },
        itinerary: {
          day_index: 1,
          total_cost: 150,
          total_duration_mins: 600,
          is_valid: true,
          constraint_violations: [],
          path: [
            {
              poi: {
                name: 'Louvre Museum',
                city: 'Paris',
                category: 'museum',
                cost_eur: 17,
                duration_mins: 120,
                location: { latitude: 48.8606, longitude: 2.3376 },
                open_time_mins: 540,
                close_time_mins: 1080,
              },
              arrival_time_mins: 660,
              departure_time_mins: 780,
              arrival_time: '11:00',
              departure_time: '13:00',
              scheduled_start: '11:00',
              scheduled_end: '13:00',
              travel_time_mins_from_prev: 15,
              cost_from_prev: 2,
            },
            {
              poi: {
                name: 'Le Petit Bistro',
                city: 'Paris',
                category: 'restaurant',
                cost_eur: 35,
                duration_mins: 60,
                location: { latitude: 48.855, longitude: 2.34 },
                open_time_mins: 720,
                close_time_mins: 900,
              },
              arrival_time_mins: 800,
              departure_time_mins: 860,
              arrival_time: '13:20',
              departure_time: '14:20',
              scheduled_start: '13:20',
              scheduled_end: '14:20',
              travel_time_mins_from_prev: 20,
              cost_from_prev: 0,
            },
            {
              poi: {
                name: 'Café de Flore',
                city: 'Paris',
                category: 'cafe',
                cost_eur: 12,
                duration_mins: 45,
                location: { latitude: 48.854, longitude: 2.332 },
                open_time_mins: 480,
                close_time_mins: 1200,
              },
              arrival_time_mins: 880,
              departure_time_mins: 925,
              arrival_time: '14:40',
              departure_time: '15:25',
              scheduled_start: '14:40',
              scheduled_end: '15:25',
              travel_time_mins_from_prev: 10,
              cost_from_prev: 0,
            },
            {
              poi: {
                name: 'Palais Royal Bus Stop',
                city: 'Paris',
                category: 'bus_stop',
                cost_eur: 2,
                duration_mins: 15,
                location: { latitude: 48.862, longitude: 2.336 },
                open_time_mins: 360,
                close_time_mins: 1400,
              },
              arrival_time_mins: 940,
              departure_time_mins: 955,
              arrival_time: '15:40',
              departure_time: '15:55',
              scheduled_start: '15:40',
              scheduled_end: '15:55',
              travel_time_mins_from_prev: 15,
              cost_from_prev: 2,
            },
            {
              poi: {
                name: 'Grand Central Hotel',
                city: 'Paris',
                category: 'hotel',
                cost_eur: 180,
                duration_mins: 60,
                location: { latitude: 48.87, longitude: 2.33 },
                open_time_mins: 0,
                close_time_mins: 1440,
              },
              arrival_time_mins: 1140,
              departure_time_mins: 1200,
              arrival_time: '19:00',
              departure_time: '20:00',
              scheduled_start: '19:00',
              scheduled_end: '20:00',
              travel_time_mins_from_prev: 30,
              cost_from_prev: 0,
            },
          ],
        },
      },
    ],
  };

  const component = await mount(<TripTimeline itinerary={mockItinerary} />);

  // Verify badges count
  const badges = component.locator('[data-testid="poi-category-badge"]');
  await expect(badges).toHaveCount(6);

  // Verify Flight stop and badge
  await expect(component.getByText('Flight to CDG')).toBeVisible();
  await expect(badges.nth(0)).toContainText('FLIGHT');

  // Verify Louvre Museum and MUSEUM badge
  await expect(component.getByText('Louvre Museum')).toBeVisible();
  await expect(badges.nth(1)).toContainText('MUSEUM');

  // Verify Le Petit Bistro and RESTAURANT badge
  await expect(component.getByText('Le Petit Bistro')).toBeVisible();
  await expect(badges.nth(2)).toContainText('RESTAURANT');

  // Verify Café de Flore and CAFÉ badge
  await expect(component.getByText('Café de Flore')).toBeVisible();
  await expect(badges.nth(3)).toContainText('CAFÉ');

  // Verify Palais Royal Bus Stop and BUS STOP badge
  await expect(component.getByText('Palais Royal Bus Stop')).toBeVisible();
  await expect(badges.nth(4)).toContainText('BUS STOP');

  // Verify Grand Central Hotel and HOTEL badge
  await expect(component.getByText('Grand Central Hotel')).toBeVisible();
  await expect(badges.nth(5)).toContainText('HOTEL');
});

test('renders upgrade button disabled and gray with info tooltip when estimated transit exists', async ({ mount, page }) => {
  const estimItinerary: OptimizationResult = {
    metadata: { engine: 'BranchAndBound', version: '2.0', nodes_evaluated: 42 },
    travel_constraints: { destination_city: 'Paris' },
    total_trip_cost: 150,
    days: [
      {
        day: 1,
        itinerary: {
          path: [
            {
              poi: { id: 'p1', name: 'Start Point', city: 'Paris', category: 'HOTEL', cost_eur: 0, duration_mins: 60, location: { latitude: 48.8, longitude: 2.3 } },
              scheduled_start: '09:00',
              scheduled_end: '10:00',
            },
            {
              poi: { id: 'p2', name: 'End Point', city: 'Paris', category: 'MUSEUM', cost_eur: 15, duration_mins: 90, location: { latitude: 48.85, longitude: 2.35 } },
              scheduled_start: '10:30',
              scheduled_end: '12:00',
              transit_from_previous: {
                mode: 'transit',
                cost_eur: 2.1,
                cost_is_estimated: true,
                price_source: 'fallback_estimate',
                duration_mins: 20,
                steps: [],
              },
            },
          ],
        },
      },
    ],
  };

  const component = await mount(<TripTimeline itinerary={estimItinerary} />);

  // Upgrade button should be present
  const btn = component.locator('[data-testid="upgrade-transit-btn"]');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('UPGRADE TO REAL PUBLIC TRANSIT');

  // Should be disabled because GTFS is not ready
  await expect(btn).toBeDisabled();

  // Info icon should be present to the left of the button
  const infoIcon = component.locator('[data-testid="transit-info-icon"]');
  await expect(infoIcon).toBeVisible();

  // Tooltip appears on hover
  await infoIcon.hover();
  const tooltip = component.locator('[data-testid="transit-info-tooltip"]');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Public transit schedule data (GTFS) for this city');
});

test('hides upgrade button when itinerary is already marked as upgraded', async ({ mount }) => {
  const upgradedItinerary: OptimizationResult = {
    is_upgraded: true,
    metadata: { engine: 'BranchAndBound', version: '2.0', nodes_evaluated: 42, transit_upgraded: true },
    travel_constraints: { destination_city: 'Madrid' },
    total_trip_cost: 150,
    days: [
      {
        day: 1,
        itinerary: {
          path: [
            {
              poi: { id: 'p1', name: 'Start Point', city: 'Madrid', category: 'HOTEL', cost_eur: 0, duration_mins: 60, location: { latitude: 40.4, longitude: -3.7 } },
              scheduled_start: '09:00',
              scheduled_end: '10:00',
            },
            {
              poi: { id: 'p2', name: 'End Point', city: 'Madrid', category: 'MUSEUM', cost_eur: 12, duration_mins: 90, location: { latitude: 40.41, longitude: -3.69 } },
              scheduled_start: '10:30',
              scheduled_end: '12:00',
              transit_from_previous: {
                mode: 'transit',
                cost_eur: 1.5,
                cost_is_estimated: false,
                duration_mins: 15,
                steps: [],
              },
            },
          ],
        },
      },
    ],
  };

  const component = await mount(<TripTimeline itinerary={upgradedItinerary} />);

  // Upgrade toolbar and button should NOT exist
  await expect(component.locator('[data-testid="transit-upgrade-toolbar"]')).toHaveCount(0);
  await expect(component.locator('[data-testid="upgrade-transit-btn"]')).toHaveCount(0);
});
