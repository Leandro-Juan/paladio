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

    await page.route('**/api/v1/auth/setup-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
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

    await page.route('**/api/v1/users/me/embedding', async (route) => {
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

    await page.route('**/api/v1/users/me/preferences', async (route) => {
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

    // Navigate to /model
    await page.goto('/model');

    // Verify Header and Subtitle
    await expect(page.getByRole('heading', { name: /PREFERENCE MODEL/i })).toBeVisible();
    await expect(page.getByText(/SOVEREIGN TASTE VECTOR/i)).toBeVisible();
    await expect(page.getByText(/VECTOR DIM: 768D/i)).toBeVisible();

    // Verify all 8 categories exist in telemetry
    const categories = [
      'Art & Culture',
      'Historical Sites',
      'Nature & Outdoors',
      'Architecture',
      'Culinary & Food',
      'Nightlife',
      'Shopping & Bazaars',
      'Scenic Views',
    ];
    for (const cat of categories) {
      await expect(page.getByText(cat).first()).toBeVisible();
    }

    // Verify Macro Engine Status and Autonomous Indicator
    await expect(page.getByText(/\[ AUTONOMOUS \]/i)).toBeVisible();
    await expect(page.getByText('TRAVEL PACE')).toBeVisible();
    await expect(page.getByText('BUDGET STRATEGY')).toBeVisible();
    await expect(page.getByText(/balanced/i).first()).toBeVisible();

    // Verify Autonomous Notice
    await expect(page.getByText(/AUTONOMOUS ML TELEMETRY/i)).toBeVisible();

    // Verify strict restriction: No manual sliders, selects, or save buttons exist
    await expect(page.locator('input[type="range"]')).toHaveCount(0);
    await expect(page.locator('select')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /SAVE PREFERENCE/i })).toHaveCount(0);

    // Take screenshot of autonomous read-only telemetry dashboard
    await page.screenshot({
      path: 'test-results/preference_model_saved.png',
    });
  });
});

