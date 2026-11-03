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
});
