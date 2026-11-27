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
          total_cost_eur: 150,
          total_time_mins: 600,
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

test('renders transit summary, line chips, fare and expandable turn-by-turn steps in TripTimeline', async ({ mount }) => {
  const mockTransitItinerary: OptimizationResult = {
    metadata: { engine: 'BranchAndBound', version: '2.0', nodes_evaluated: 42 },
    travel_constraints: { destination_city: 'Madrid' },
    total_trip_cost: 26.5,
    days: [
      {
        day: 1,
        itinerary: {
          total_cost_eur: 26.5,
          total_time_mins: 360,
          transit_recommendation: {
            type: '24H_PASS_RECOMMENDED',
            single_tickets_total_eur: 12.5,
            pass_name: 'Abono Turístico 1 Día (Zona A)',
            pass_price_eur: 8.4,
            savings_eur: 4.1,
            includes_airport: true,
            message: 'Buy the Abono Turístico 1 Día (Zona A) for 8.40€ instead of individual fares (12.50€) to save 4.10€!',
          },
          path: [
            {
              poi: {
                id: 'p1',
                name: 'Puerta del Sol',
                city: 'Madrid',
                category: 'attraction',
                duration_mins: 60,
                cost_eur: 0.0,
                location: { latitude: 40.4169, longitude: -3.7036 },
              },
              scheduled_start: '09:00',
              scheduled_end: '10:00',
            },
            {
              poi: {
                id: 'p2',
                name: 'Santiago Bernabéu Stadium',
                city: 'Madrid',
                category: 'attraction',
                duration_mins: 120,
                cost_eur: 25.0,
                location: { latitude: 40.4531, longitude: -3.6883 },
              },
              scheduled_start: '10:30',
              scheduled_end: '12:30',
              transit_from_previous: {
                duration_mins: 30,
                cost_eur: 1.5,
                cost_is_estimated: false,
                mode: 'transit',
                price_source: 'official_crtm_tariff',
                steps: [
                  {
                    type: 'walk',
                    instruction: 'Walk 40m · Enter the SOL Station',
                    duration_mins: 2,
                    distance_km: 0.04,
                    station_name: 'Sol',
                  },
                  {
                    type: 'transit_board',
                    instruction: 'Take Line 1 toward PINAR DE CHAMARTIN (2 stops)',
                    duration_mins: 8,
                    distance_km: 1.06,
                    transit_line: '1',
                    headsign: 'PINAR DE CHAMARTIN',
                    station_name: 'Sol',
                  },
                  {
                    type: 'transfer',
                    instruction: 'Transfer at TRIBUNAL Station',
                    duration_mins: 3,
                    distance_km: 0.1,
                    station_name: 'Tribunal',
                  },
                  {
                    type: 'transit_board',
                    instruction: 'Take Line 10 toward TRES OLIVOS (3 stops)',
                    duration_mins: 12,
                    distance_km: 2.66,
                    transit_line: '10',
                    headsign: 'TRES OLIVOS',
                    station_name: 'Tribunal',
                  },
                  {
                    type: 'walk',
                    instruction: 'Exit at NUEVOS MINISTERIOS Station · Walk 300m to Santiago Bernabéu',
                    duration_mins: 5,
                    distance_km: 0.3,
                    station_name: 'Nuevos Ministerios',
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };

  const component = await mount(<TripTimeline itinerary={mockTransitItinerary} />);

  // 1. Verify Day header and Transit Recommendation Card
  await expect(component.getByRole('heading', { name: 'DAY 1' })).toBeVisible();
  await expect(component.getByTestId('transit-recommendation-card')).toBeVisible();
  await expect(component.getByText(/24H PASS RECOMMENDED/i)).toBeVisible();
  await expect(component.getByText(/save 4.10€/i)).toBeVisible();

  // 2. Verify Waypoints
  await expect(component.getByText('Puerta del Sol')).toBeVisible();
  await expect(component.getByText('Santiago Bernabéu Stadium')).toBeVisible();

  // 3. Verify Transit Leg Summary
  const transitLeg = component.getByTestId('transit-leg-view');
  await expect(transitLeg).toBeVisible();
  await expect(transitLeg.getByText('PUBLIC TRANSIT')).toBeVisible();
  await expect(transitLeg.getByText('30 MINS')).toBeVisible();
  await expect(transitLeg.getByText('1.50 €')).toBeVisible();

  // Verify Transit Line Chips
  const lineChips = transitLeg.getByTestId('transit-line-chip');
  await expect(lineChips).toHaveCount(2);
  await expect(lineChips.nth(0)).toHaveText('LINE 1');
  await expect(lineChips.nth(1)).toHaveText('LINE 10');

  // Verify Transit Fare Disclaimer in Transit Recommendation Card
  const fareDisclaimer = component.getByTestId('transit-fare-disclaimer');
  await expect(fareDisclaimer).toBeVisible();
  await expect(fareDisclaimer).toContainText(/fares are fetched automatically and may not be 100% accurate/i);

  // Verify Timeline Bottom Transit Disclaimer
  const timelineDisclaimer = component.getByTestId('timeline-transit-disclaimer');
  await expect(timelineDisclaimer).toBeVisible();
  await expect(timelineDisclaimer).toContainText(/may not be 100% accurate/i);

  // 4. Test Toggle Turn-by-Turn Steps
  const toggleBtn = transitLeg.getByTestId('toggle-transit-steps-btn');
  await expect(toggleBtn).toHaveText(/DIRECTIONS \(5 STEPS\) ▼/);

  // Steps container initially not visible
  await expect(component.getByTestId('transit-steps-container')).not.toBeVisible();

  // Click expand
  await toggleBtn.click();
  await expect(component.getByTestId('transit-steps-container')).toBeVisible();
  await expect(toggleBtn).toHaveText(/HIDE DIRECTIONS ▲/);

  // Verify individual instructions
  await expect(component.getByText('Walk 40m · Enter the SOL Station')).toBeVisible();
  await expect(component.getByText('Take Line 1 toward PINAR DE CHAMARTIN (2 stops)')).toBeVisible();
  await expect(component.getByText('Transfer at TRIBUNAL Station')).toBeVisible();
  await expect(component.getByText('Take Line 10 toward TRES OLIVOS (3 stops)')).toBeVisible();
  await expect(component.getByText('Exit at NUEVOS MINISTERIOS Station · Walk 300m to Santiago Bernabéu')).toBeVisible();

  // Click collapse
  await toggleBtn.click();
  await expect(component.getByTestId('transit-steps-container')).not.toBeVisible();
});

test('renders estimated fare badge when transit price is estimated in TripTimeline', async ({ mount }) => {
  const mockEstimatedItinerary: OptimizationResult = {
    metadata: { engine: 'BranchAndBound', version: '2.0', nodes_evaluated: 42 },
    travel_constraints: { destination_city: 'Paris' },
    total_trip_cost: 100,
    days: [
      {
        day: 1,
        itinerary: {
          path: [
            {
              poi: { id: 'p1', name: 'Origin Point', city: 'Paris', category: 'hotel', duration_mins: 60, cost_eur: 0, location: { latitude: 48.85, longitude: 2.35 } },
              scheduled_start: '09:00',
            },
            {
              poi: { id: 'p2', name: 'Destination Point', city: 'Paris', category: 'attraction', duration_mins: 90, cost_eur: 15, location: { latitude: 48.86, longitude: 2.36 } },
              scheduled_start: '09:45',
              transit_from_previous: {
                duration_mins: 20,
                cost_eur: 2.1,
                cost_is_estimated: true,
                mode: 'transit',
                steps: [
                  {
                    type: 'walk',
                    instruction: 'Walk 350m to bus stop',
                    duration_mins: 4,
                    distance_km: 0.35,
                  },
                  {
                    type: 'transit',
                    instruction: 'Catch the 27 bus towards Plaza de Castilla',
                    duration_mins: 16,
                    distance_km: 2.8,
                    transit_line: '27',
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };

  const component = await mount(<TripTimeline itinerary={mockEstimatedItinerary} />);

  const transitLeg = component.getByTestId('transit-leg-view');
  await expect(transitLeg).toBeVisible();
  await expect(transitLeg.getByTestId('estimated-fare-badge')).toBeVisible();
  await expect(transitLeg.getByTestId('estimated-fare-badge')).toHaveText('ESTIMATED FARE');
});

test('formats transit duration in hours when over 59 minutes and minutes otherwise', async ({ mount }) => {
  const mockLongTransitItinerary: OptimizationResult = {
    metadata: { engine: 'BranchAndBound', version: '2.0', nodes_evaluated: 4 },
    travel_constraints: { destination_city: 'Rome' },
    total_trip_cost: 9,
    days: [
      {
        day: 1,
        theme: 'Long Transit Formatting',
        itinerary: {
          day_index: 0,
          total_cost_eur: 0,
          total_time_mins: 300,
          path: [
            {
              poi: { id: 'p1', name: 'Airport', city: 'Rome', category: 'airport', duration_mins: 60, cost_eur: 0, location: { latitude: 41.8, longitude: 12.25 } },
              scheduled_start: '09:00',
            },
            {
              poi: { id: 'p2', name: 'Suburb Stop', city: 'Rome', category: 'attraction', duration_mins: 60, cost_eur: 0, location: { latitude: 41.85, longitude: 12.4 } },
              scheduled_start: '10:00',
              transit_from_previous: {
                duration_mins: 59,
                cost_eur: 1.5,
                cost_is_estimated: false,
                mode: 'transit',
                steps: [
                  { type: 'transit', instruction: 'Regional bus', duration_mins: 59, distance_km: 15 },
                ],
              },
            },
            {
              poi: { id: 'p3', name: 'Exact Hour Stop', city: 'Rome', category: 'attraction', duration_mins: 60, cost_eur: 0, location: { latitude: 41.88, longitude: 12.48 } },
              scheduled_start: '12:00',
              transit_from_previous: {
                duration_mins: 60,
                cost_eur: 3.0,
                cost_is_estimated: false,
                mode: 'transit',
                steps: [
                  { type: 'transit', instruction: 'Express train', duration_mins: 60, distance_km: 25 },
                ],
              },
            },
            {
              poi: { id: 'p4', name: 'City Center', city: 'Rome', category: 'hotel', duration_mins: 0, cost_eur: 0, location: { latitude: 41.9, longitude: 12.5 } },
              scheduled_start: '14:15',
              transit_from_previous: {
                duration_mins: 75,
                cost_eur: 4.5,
                cost_is_estimated: false,
                mode: 'transit',
                steps: [
                  { type: 'walk', instruction: 'Walk to station', duration_mins: 10, distance_km: 0.7 },
                  { type: 'transit', instruction: 'Intercity rail', duration_mins: 65, distance_km: 40 },
                ],
              },
            },
          ],
        },
      },
    ],
  };

  const component = await mount(<TripTimeline itinerary={mockLongTransitItinerary} />);
  const legs = component.getByTestId('transit-leg-view');
  await expect(legs).toHaveCount(3);
  await expect(legs.nth(0).getByText('59 MINS')).toBeVisible();
  await expect(legs.nth(1).getByText('1H')).toBeVisible();
  await expect(legs.nth(2).getByText('1H 15M')).toBeVisible();

  await legs.nth(2).click();
  await expect(legs.nth(2).getByText('10m')).toBeVisible();
  await expect(legs.nth(2).getByText('1h 5m')).toBeVisible();
});
