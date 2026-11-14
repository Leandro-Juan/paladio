import { test, expect, Page } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

async function mockMarketEndpoints(page: Page) {
  const mockRouteId = 'route-mad-fco-01';
  const mockRoute = {
    id: mockRouteId,
    origin_iata: 'MAD',
    destination_code: 'FCO',
    destination_name: 'Rome',
    earliest_date: '2027-05-01',
    latest_date: '2027-05-31',
    min_nights: 3,
    max_nights: 5,
    travelers: 1,
    max_budget_eur: 250,
    currency: 'EUR',
    is_active: true,
    schedule: 'Daily 03:00 UTC',
    status: 'ACTIVE',
    current_price_eur: 112,
    baseline_p50_eur: 140,
    baseline_p10_eur: 95,
    lowest_ever_eur: 78,
    discount_pct: null,
    last_scanned_at: '2027-01-15T03:00:00Z',
    ticks_count: 42,
    verdict: 'GOOD',
    verdict_percentile: 28,
    verdict_confidence: 'established',
    corpus_status: 'ready',
  };

  await page.route(/.*\/api(\/v1)?\/market\/summary.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        monitored_routes: 1,
        deals_detected: 0,
        ticks_scanned_today: 42,
        avg_savings_pct: 20,
      }),
    });
  });

  await page.route(new RegExp(`.*/api(/v1)?/market/routes/${mockRouteId}/stats.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        current_price_eur: 112,
        current_percentile: 28,
        p10_deal_eur: 95,
        p50_median_eur: 140,
        p90_peak_eur: 210,
        lowest_ever_eur: 78,
        lowest_ever_date: '2027-05-12',
        total_observations: 42,
        landed_fee_ratio: 1.0,
        next_scan_minutes: 180,
        itinerary_realism_score: null,
        deal_savings_eur: null,
        deal_savings_pct: null,
        currency: 'EUR',
      }),
    });
  });

  await page.route(new RegExp(`.*/api(/v1)?/market/routes/${mockRouteId}/history.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        points: [],
        p10_deal_eur: 95,
        p50_median_eur: 140,
        p90_peak_eur: 210,
        lowest_ever_eur: 78,
        currency: 'EUR',
      }),
    });
  });

  await page.route(new RegExp(`.*/api(/v1)?/market/routes/${mockRouteId}/calendar.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        months: [],
        route_label: 'MAD ⇄ FCO',
        p10_deal_eur: 95,
        p50_median_eur: 140,
        p90_peak_eur: 210,
        view: 'roundtrip',
        pricing: 'package',
        top_dates: [],
        currency: 'EUR',
      }),
    });
  });

  await page.route(new RegExp(`.*/api(/v1)?/market/routes/${mockRouteId}/events.*`), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route(new RegExp(`.*/api(/v1)?/market/routes/${mockRouteId}/deals.*`), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route(/.*\/api(\/v1)?\/market\/routes(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockRoute]),
    });
  });

  await page.route(/.*\/api(\/v1)?\/market\/deals.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

test.describe('Route Monitoring Fleet Overview Navigation', () => {
  test('clicking Fleet Overview button redirects from route detail to /monitoring overview', async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await mockAuthenticatedUser(page);
    await mockMarketEndpoints(page);

    // 1. Visit /monitoring page
    await page.goto('/monitoring');
    await page.waitForLoadState('networkidle');

    // 2. Verify Fleet Overview table is rendered
    await expect(page.getByRole('heading', { name: /Route Price & Tariff Telemetry/i })).toBeVisible();

    // 3. Directly navigate to a route detail page like dashboard does: /monitoring?route=...
    // Let's get the route ID from one of the rows
    const inspectBtn = page.getByRole('button', { name: /Inspect/i }).first();
    await expect(inspectBtn).toBeVisible({ timeout: 10000 });
    await inspectBtn.click();

    // Verify detail view is displayed
    const fleetOverviewBtn = page.getByRole('button', { name: /Fleet Overview|monitored routes/i });
    await expect(fleetOverviewBtn).toBeVisible({ timeout: 10000 });

    // Click Fleet Overview button
    await fleetOverviewBtn.click();

    // Verify it redirects back to /monitoring and shows the Fleet Overview
    await expect(page).toHaveURL(/\/monitoring(?!\?)/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Route Price & Tariff Telemetry/i })).toBeVisible();
  });

  test('when arriving via /monitoring?route=... clicking Fleet Overview redirects to /monitoring', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await mockMarketEndpoints(page);

    // 1. First visit /monitoring to find a valid route ID
    await page.goto('/monitoring');
    await page.waitForLoadState('networkidle');

    // 2. Click inspect to get the route ID from URL
    const inspectBtn = page.getByRole('button', { name: /Inspect/i }).first();
    await inspectBtn.click();
    await expect(page.getByRole('button', { name: /Fleet Overview|monitored routes/i })).toBeVisible({ timeout: 10000 });

    const routeUrl = page.url();
    const urlObj = new URL(routeUrl);
    const routeId = urlObj.searchParams.get('route');

    if (routeId) {
      // 3. Simulate arriving from dashboard offer click: navigate directly to /monitoring?route=<id>
      await page.goto(`/monitoring?route=${routeId}`);
      await page.waitForLoadState('networkidle');

      // 4. Verify detail view is rendered
      const fleetOverviewBtn = page.getByRole('button', { name: /Fleet Overview|monitored routes/i });
      await expect(fleetOverviewBtn).toBeVisible({ timeout: 10000 });

      // 5. Click Fleet Overview button
      await fleetOverviewBtn.click();

      // 6. Verify URL is redirected to /monitoring without route query param and Overview table is shown
      await expect(page).toHaveURL('/monitoring', { timeout: 10000 });
      await expect(page.getByRole('heading', { name: /Route Price & Tariff Telemetry/i })).toBeVisible({ timeout: 10000 });
    }
  });
});
