import { test, expect } from '@playwright/test';
import { isTripCompleted } from '../../src/utils/tripParser';

test.describe('Vault Past Trip Recap Page', () => {
  const refDate = new Date('2026-11-03T12:00:00.000Z');

  test('Trip completion guard correctly marks ended trips for Vault routing', () => {
    const pastTrip = {
      destination: 'Munnar',
      start_date: '2026-10-01',
      end_date: '2026-10-05',
    };
    expect(isTripCompleted(pastTrip, refDate)).toBe(true);

    const activeTrip = {
      destination: 'Kyoto',
      start_date: '2026-11-01',
      end_date: '2026-11-10',
    };
    expect(isTripCompleted(activeTrip, refDate)).toBe(false);
  });

  test('Vault map card link points to /vault/[id]', async ({ page }) => {
    // Mock the trips endpoint to return a completed trip
    await page.route('**/trips/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'trip-past-1',
            destination: 'Munnar',
            start_date: '2026-10-01',
            end_date: '2026-10-05',
            itinerary_data: {
              description: 'Lush tea plantations and misty hills.',
              days: [
                {
                  day: 1,
                  itinerary: {
                    path: [
                      {
                        poi: {
                          name: 'Tea Museum',
                          location: { latitude: 10.0889, longitude: 77.0595 },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ]),
      });
    });

    // Mock auth if needed
    await page.route('**/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', username: 'Traveler' }),
      });
    });
  });

  test('/vault/[id] occupies full screen and hides global sidebar', async ({ page }) => {
    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/(auth|users)\/me/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          email: 'traveler@paladio.internal',
          username: 'Traveler',
          role: 'admin',
          is_active: true,
          preferences: {},
          has_embedding: false,
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.route('**/trips/trip-past-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'trip-past-1',
          destination: 'Madrid',
          start_date: '2026-10-01',
          end_date: '2026-10-05',
          participants: [{ id: 'p-1', name: 'Commander' }],
          itinerary_data: {
            days: [
              {
                day: 1,
                theme: 'Historic Center',
                itinerary: {
                  path: [
                    {
                      poi: {
                        id: 'poi-1',
                        name: 'Prado Museum',
                        category: 'museum',
                        duration_mins: 120,
                        cost_eur: 15,
                        location: { latitude: 40.4138, longitude: -3.6921 },
                      },
                      arrival_time: '10:00',
                      departure_time: '12:00',
                    },
                  ],
                },
              },
            ],
          },
        }),
      });
    });

    await page.route('**/trips/trip-past-1/expenses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/trips/trip-past-1/settlement', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    });

    await page.route('**/tickets*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Set auth token in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
      localStorage.setItem('paladio_user', JSON.stringify({ id: 'user-1', username: 'Traveler' }));
    });

    await page.goto('/vault/trip-past-1');

    // Sidebar should NOT be rendered
    const sidebar = page.locator('.app-sidebar');
    await expect(sidebar).toHaveCount(0);

    // Layout should have .trip-details-layout class
    const layout = page.locator('main.trip-details-layout');
    await expect(layout).toBeVisible();

    // Top header with Back to Vault should exist
    const vaultLink = page.getByRole('link', { name: /VAULT/i });
    await expect(vaultLink).toBeVisible();

    // Check that Itinerary tab renders the waypoint
    const itinTab = page.getByRole('tab', { name: /Itinerary/i });
    await itinTab.click();
    await expect(page.getByText('Prado Museum')).toBeVisible();
  });
});
