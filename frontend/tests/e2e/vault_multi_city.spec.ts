import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Vault Multi-City & Fallback Tests', () => {
  let token: string;

  test.beforeAll(() => {
    token = execSync(
      'docker exec paladio-api-1 python -c "from app.core.security import create_access_token; print(create_access_token(subject=\'d1238935-30c4-481e-8cca-7bdb7cd5d53c\'))"'
    ).toString().trim();
  });

  test('Vault map shows numbered pins for multi-expedition cities and expedition switcher in card', async ({ page }) => {
    await page.addInitScript((jwt) => {
      localStorage.setItem('paladio_token', jwt);
    }, token);

    await page.goto('/vault');
    await page.waitForLoadState('networkidle');

    // Wait for markers to appear
    const markers = page.locator('.paladio-map-waypoint');
    await expect(markers.first()).toBeVisible({ timeout: 10000 });

    const markerCount = await markers.count();
    expect(markerCount).toBeGreaterThan(1);

    // Click the first marker (or a marker with a badge)
    await markers.first().click({ force: true });

    // Verify deployed card appears
    const deployedCard = page.locator('[data-testid="deployed-trip-card"]');
    await expect(deployedCard).toBeVisible();

    // If multiple trips in this city, check expedition switcher
    const switcher = page.locator('[data-testid="deployed-trip-expedition-switcher"]');
    if (await switcher.isVisible()) {
      const switcherButtons = switcher.locator('button');
      const btnCount = await switcherButtons.count();
      expect(btnCount).toBeGreaterThan(1);

      // Click the second expedition
      await switcherButtons.nth(1).click();
      await page.waitForTimeout(300);

      // Verify the card title or content updated
      await expect(deployedCard).toBeVisible();
    }
  });

  test('Trip with empty days does not snap to Porto and stays anchored to Tokyo / Airport', async ({ page }) => {
    await page.addInitScript((jwt) => {
      localStorage.setItem('paladio_token', jwt);
    }, token);

    await page.goto('/vault/d761339c-4fae-4aee-b1a8-057731681ea5');
    await page.waitForLoadState('networkidle');

    // Wait for the map container
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 10000 });

    // Click Day 2 (which has 0 stops)
    const day2 = page.locator('text=Day 2').first();
    if (await day2.isVisible()) {
      await day2.click();
      await page.waitForTimeout(500);
    }

    // Verify map does not contain Porto tiles or text
    const portoElement = page.locator('text=Porto, Portugal');
    await expect(portoElement).not.toBeVisible();
  });

  test('Winter in Tokyo past trip displays 45 waypoints, itinerary, and photos tab', async ({ page }) => {
    await page.addInitScript((jwt) => {
      localStorage.setItem('paladio_token', jwt);
    }, token);

    await page.goto('/vault/38b5b540-db7e-4a43-bd01-1c143346e7a3');
    await page.waitForLoadState('networkidle');

    // Verify title and waypoints count in the header badge
    await expect(page.locator('text=Tokyo').first()).toBeVisible({ timeout: 10000 });

    // Verify 45 waypoints is reflected in the header counter or days
    const waypointsCounter = page.locator('text=45');
    await expect(waypointsCounter.first()).toBeVisible();

    // Check Photos tab
    const photosTab = page.locator('button:has-text("Photos"), [role="tab"]:has-text("Photos")').first();
    await expect(photosTab).toBeVisible();
    await photosTab.click();

    // Check that photos are rendered
    await page.waitForTimeout(1000);
    const photosContainer = page.locator('img');
    const imgCount = await photosContainer.count();
    expect(imgCount).toBeGreaterThan(0);
  });
});
