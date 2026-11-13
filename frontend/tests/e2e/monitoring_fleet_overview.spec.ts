import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Route Monitoring Fleet Overview Navigation', () => {
  test('clicking Fleet Overview button redirects from route detail to /monitoring overview', async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await mockAuthenticatedUser(page);

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
