import { test, expect } from '@playwright/test';
import { mockPaladioWebSocket } from './test-utils';

test.describe('Dashboard Upcoming Trips Cards (Card Design from Image)', () => {
  test('renders upcoming trip cards with exact design specifications', async ({ page }) => {
    await mockPaladioWebSocket(page);

    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

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
          id: 'admin-id',
          email: 'admin@paladio.internal',
          username: 'admin',
          role: 'admin',
          is_active: true,
          preferences: {},
          has_embedding: true,
        }),
      });
    });

    // Mock an upcoming trip matching the card in the reference image
    await page.route(/.*\/api(\/v1)?\/trips\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'trip-cabo-001',
            destination: 'Cabo San Lucas, B.C.S., Mexico',
            start_date: '2026-11-20',
            end_date: '2026-11-29',
            status: 'confirmed',
            created_at: '2026-11-01T10:00:00Z',
            participants: [
              { id: 'p1', name: 'Kai Edwards', role: 'organizer' },
              { id: 'p2', name: 'Quinn Nguyen', role: 'traveler' },
              { id: 'p3', name: 'Lucas Scott', role: 'traveler' },
            ],
            itinerary_data: {
              title: "Kai's Bachelorette",
              photos: [
                'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80',
              ],
              travel_constraints: {
                travel_tastes: ['adventure', 'relaxation'],
              },
              days: [],
            },
          },
        ]),
      });
    });

    // Mock Route Monitoring Market endpoints
    await page.route(/.*\/api(\/v1)?\/market\/summary.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ monitored_routes: 1, deals_detected: 0, ticks_scanned_today: 0, avg_savings_pct: 0 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/market\/routes.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route(/.*\/api(\/v1)?\/market\/deals.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');

    // 1. Verify Preference Model is NOT on dashboard
    await expect(page.getByRole('heading', { name: /PREFERENCE MODEL/i })).not.toBeVisible();

    // 2. Locate Upcoming Trips section at bottom
    const upcomingSection = page.locator('[data-testid="upcoming-trips-section"]');
    await expect(upcomingSection).toBeVisible();
    await expect(upcomingSection.getByRole('heading', { name: /UPCOMING TRIPS/i })).toBeVisible();
    await expect(upcomingSection.getByRole('link', { name: /Plan New Trip/i })).not.toBeVisible();

    // 3. Locate the specific trip card
    const card = upcomingSection.locator('[data-testid="upcoming-trip-card"]').first();
    await expect(card).toBeVisible();

    // 4. Verify Header: Title and Destination Subtitle
    await expect(card.getByRole('heading', { level: 3, name: "Kai's Bachelorette" })).toBeVisible();
    await expect(card.getByText('Cabo San Lucas, B.C.S., Mexico')).toBeVisible();

    // 5. Verify Weather Badge is removed and Corridor Badge is present in top right
    await expect(card.locator('[class*="weatherBadge"]')).not.toBeVisible();
    const corridorBadge = card.locator('[data-testid="trip-corridor-badge"]');
    await expect(corridorBadge).toBeVisible();
    await expect(corridorBadge).toHaveText(/MAD → SJD/i);

    // 6. Verify Meta Row: Duration (10 days) and Date Range pill
    await expect(card.getByText(/10 days/i)).toBeVisible();
    await expect(card.getByText(/Nov 20 - Nov 29/i)).toBeVisible();

    // 7. Verify Image Banner and Countdown Badge (X days without exclamation mark)
    const banner = card.locator('img[class*="bannerImage"]');
    await expect(banner).toBeVisible();
    const countdown = card.locator('[class*="countdownBadge"]');
    await expect(countdown).toBeVisible();
    await expect(countdown).toHaveText(/\d+ days$/);
    await expect(countdown).not.toHaveText(/!/);

    // 8. Verify Notes and Confirmed badge are removed
    await expect(card.getByText('notes:')).not.toBeVisible();
    await expect(card.getByText(/^Confirmed$/i)).not.toBeVisible();

    // 9. Verify Going avatars
    await expect(card.getByText('going:')).toBeVisible();
    await expect(card.getByText('QN')).toBeVisible(); // Quinn Nguyen initials

    // 10. Verify View more details link
    const detailsLink = card.getByRole('link', { name: /View more details/i });
    await expect(detailsLink).toBeVisible();
    await expect(detailsLink).toHaveAttribute('href', '/trips/trip-cabo-001');

    // Capture visual screenshot of the upcoming trip card
    await card.screenshot({ path: 'test-results/upcoming_trip_card_verified.png' });
  });
});
