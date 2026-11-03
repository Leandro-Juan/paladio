import { test, expect } from '@playwright/test';
import { mockPaladioWebSocket } from './test-utils';

test.describe('Preference Model & Taste Vector Telemetry', () => {
  test('renders 8D affinity radar, active pace and budget, and persists preference updates', async ({ page }) => {
    let currentPrefs = {
      pace: 'balanced',
      budget_tier: 'balanced',
      tag_affinities: {
        art_culture: 0.5,
        history_heritage: 0.5,
        nature_outdoors: 0.5,
        architecture: 0.5,
        food_culinary: 0.5,
        nightlife: 0.5,
        shopping: 0.5,
        scenic_views: 0.5,
      },
    };

    await mockPaladioWebSocket(page);

    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-token');
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
          preferences: currentPrefs,
          has_embedding: true,
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/users\/me\/embedding/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'admin-id',
          embedding: Array(768).fill(0.5),
          dimension: 768,
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/users\/me\/preferences/, async (route) => {
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        currentPrefs = body.preferences || currentPrefs;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'admin-id',
            email: 'admin@paladio.internal',
            username: 'admin',
            role: 'admin',
            is_active: true,
            preferences: currentPrefs,
            has_embedding: true,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to /dashboard
    await page.goto('/dashboard');

    // Verify Preference Model Telemetry section is removed from /dashboard
    await expect(page.getByRole('heading', { name: /PREFERENCE MODEL/i })).not.toBeVisible();
    await expect(page.locator('[data-testid="preference-model-section"]')).not.toBeVisible();

    // Verify Upcoming Trips section is rendered at the bottom of the dashboard
    const upcomingTripsSection = page.locator('[data-testid="upcoming-trips-section"]');
    await expect(upcomingTripsSection).toBeVisible();
    await expect(upcomingTripsSection.getByRole('heading', { name: /UPCOMING TRIPS/i })).toBeVisible();
  });
});

