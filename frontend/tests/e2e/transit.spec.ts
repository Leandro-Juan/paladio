import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Transit Steps & Public Transit Routing', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('renders transit summary, line chips, fare and expandable turn-by-turn steps', async ({ page }) => {
    const mockTransitItinerary = {
      days: [
        {
          day: 1,
          flight_info: null,
          itinerary: {
            total_score: 180.0,
            total_cost_eur: 26.50,
            total_time_mins: 360,
            transit_recommendation: {
              type: '24H_PASS_RECOMMENDED',
              single_tickets_total_eur: 12.50,
              pass_name: 'Abono Turístico 1 Día (Zona A)',
              pass_price_eur: 8.40,
              savings_eur: 4.10,
              includes_airport: true,
              message: 'Buy the Abono Turístico 1 Día (Zona A) for 8.40€ instead of individual fares (12.50€) to save 4.10€!',
            },
            path: [
              {
                poi: {
                  name: 'Puerta del Sol',
                  category: 'attraction',
                  duration_mins: 60,
                  cost_eur: 0.0,
                },
                scheduled_start: '09:00',
                scheduled_end: '10:00',
              },
              {
                poi: {
                  name: 'Santiago Bernabéu Stadium',
                  category: 'attraction',
                  duration_mins: 120,
                  cost_eur: 25.0,
                },
                scheduled_start: '10:30',
                scheduled_end: '12:30',
                transit_from_previous: {
                  duration_mins: 30,
                  cost_eur: 1.50,
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

    await page.addInitScript((data) => {
      sessionStorage.setItem('paladio_itinerary', JSON.stringify(data));
    }, mockTransitItinerary);

    await page.goto('/engine');

    // 1. Verify Day header and Transit Recommendation Card
    await expect(page.getByRole('heading', { name: 'DAY 1' })).toBeVisible();
    await expect(page.getByTestId('transit-recommendation-card')).toBeVisible();
    await expect(page.getByText(/24H PASS RECOMMENDED/i)).toBeVisible();
    await expect(page.getByText(/save 4.10€/i)).toBeVisible();

    // 2. Verify Waypoints
    await expect(page.getByText('Puerta del Sol')).toBeVisible();
    await expect(page.getByText('Santiago Bernabéu Stadium')).toBeVisible();

    // 3. Verify Transit Leg Summary
    const transitLeg = page.getByTestId('transit-leg-view');
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
    const fareDisclaimer = page.getByTestId('transit-fare-disclaimer');
    await expect(fareDisclaimer).toBeVisible();
    await expect(fareDisclaimer).toContainText(/fares are fetched automatically and may not be 100% accurate/i);

    // Verify Timeline Bottom Transit Disclaimer
    const timelineDisclaimer = page.getByTestId('timeline-transit-disclaimer');
    await expect(timelineDisclaimer).toBeVisible();
    await expect(timelineDisclaimer).toContainText(/may not be 100% accurate/i);

    // 4. Test Toggle Turn-by-Turn Steps
    const toggleBtn = transitLeg.getByTestId('toggle-transit-steps-btn');
    await expect(toggleBtn).toHaveText(/DIRECTIONS \(5 STEPS\) ▼/);

    // Steps container initially not visible
    await expect(page.getByTestId('transit-steps-container')).not.toBeVisible();

    // Click expand
    await toggleBtn.click();
    await expect(page.getByTestId('transit-steps-container')).toBeVisible();
    await expect(toggleBtn).toHaveText(/HIDE DIRECTIONS ▲/);

    // Verify individual instructions
    await expect(page.getByText('Walk 40m · Enter the SOL Station')).toBeVisible();
    await expect(page.getByText('Take Line 1 toward PINAR DE CHAMARTIN (2 stops)')).toBeVisible();
    await expect(page.getByText('Transfer at TRIBUNAL Station')).toBeVisible();
    await expect(page.getByText('Take Line 10 toward TRES OLIVOS (3 stops)')).toBeVisible();
    await expect(page.getByText('Exit at NUEVOS MINISTERIOS Station · Walk 300m to Santiago Bernabéu')).toBeVisible();

    // Verify steps disclaimer
    await expect(page.getByTestId('transit-steps-disclaimer')).toBeVisible();
    await expect(page.getByTestId('transit-steps-disclaimer')).toContainText(/fares and schedules are fetched automatically and may not be 100% accurate/i);

    // Capture visual screenshot of the expanded transit directions
    await page.screenshot({ path: 'test-results/transit_steps_rendered.png', fullPage: true });

    // Click collapse
    await toggleBtn.click();
    await expect(page.getByTestId('transit-steps-container')).not.toBeVisible();
  });

  test('renders estimated fare badge when transit price is estimated', async ({ page }) => {
    const mockEstimatedItinerary = {
      days: [
        {
          day: 1,
          itinerary: {
            path: [
              {
                poi: { name: 'Origin Point', category: 'hotel' },
                scheduled_start: '09:00',
              },
              {
                poi: { name: 'Destination Point', category: 'attraction' },
                scheduled_start: '09:45',
                transit_from_previous: {
                  duration_mins: 20,
                  cost_eur: 2.10,
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

    await page.addInitScript((data) => {
      sessionStorage.setItem('paladio_itinerary', JSON.stringify(data));
    }, mockEstimatedItinerary);

    await page.goto('/engine');

    const transitLeg = page.getByTestId('transit-leg-view');
    await expect(transitLeg).toBeVisible();
    await expect(transitLeg.getByTestId('estimated-fare-badge')).toBeVisible();
    await expect(transitLeg.getByTestId('estimated-fare-badge')).toHaveText('ESTIMATED FARE');
  });
});
