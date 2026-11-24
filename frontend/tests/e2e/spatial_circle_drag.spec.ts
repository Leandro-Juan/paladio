import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Spatial Circle Radius Dragging E2E', () => {
  test('drags perimeter handle to expand and shorten circle radius', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-spatial-drag';
    const mockTrip = {
      id: mockTripId,
      destination: 'Tokyo',
      start_date: '2027-05-10',
      end_date: '2027-05-14',
      budget_eur: 1500,
      itinerary_data: {
        days: [
          {
            day: 1,
            theme: 'Central Tokyo',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-tokyo-station',
                    name: 'Tokyo Station',
                    category: 'station',
                    duration_mins: 30,
                    cost_eur: 0,
                    location: { latitude: 35.6812, longitude: 139.7671 },
                  },
                  arrival_time: 540,
                  departure_time: 570,
                },
              ],
            },
          },
        ],
      },
    };

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], total: 0 }),
      });
    });

    page.on('pageerror', (err) => {
      console.log('CAUGHT PAGEERROR:', err.message);
    });

    await page.goto(`/trips/${mockTripId}`);
    await page.waitForLoadState('domcontentloaded');

    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 15000 });

    const trigger = page.locator('[data-testid="speed-dial-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await trigger.click();

    const waypointBtn = page.locator('[data-testid="speed-dial-waypoint"]');
    await expect(waypointBtn).toBeVisible({ timeout: 10000 });
    await waypointBtn.click();

    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    if (mapBox) {
      await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    }

    const handle = page.locator('.paladio-radius-handle');
    await expect(handle).toBeVisible({ timeout: 10000 });

    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;

    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;

    // Drag handle outward to the right to expand radius
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(300);
    const expandedBox = await handle.boundingBox();
    expect(expandedBox).not.toBeNull();
    if (!expandedBox) return;

    expect(expandedBox.x).toBeGreaterThan(handleBox.x + 30);

    // Drag inward to shorten radius
    const expX = expandedBox.x + expandedBox.width / 2;
    const expY = expandedBox.y + expandedBox.height / 2;

    await page.mouse.move(expX, expY);
    await page.mouse.down();
    await page.mouse.move(expX - 120, expY, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(300);
    const shortenedBox = await handle.boundingBox();
    expect(shortenedBox).not.toBeNull();
    if (!shortenedBox) return;

    expect(shortenedBox.x).toBeLessThan(expandedBox.x);

    // Click center waypoint pin to open popup
    const centerPin = page.locator('.paladio-waypoint-center');
    await expect(centerPin).toBeVisible({ timeout: 5000 });
    await centerPin.click();

    // Click Clear Area Filter in the popup
    const clearBtn = page.locator('.leaflet-popup button:has-text("Clear Area Filter")');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click();

    // Circle and handle should disappear cleanly without navigation or error
    await expect(handle).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText('TELEMETRY FAULT DETECTED')).toHaveCount(0);
    expect(page.url()).toContain(`/trips/${mockTripId}`);
  });

  test('clears waypoint area filter from speed dial menu without crashing or telemetry fault', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-spatial-speed-dial';
    const mockTrip = {
      id: mockTripId,
      destination: 'Tokyo',
      start_date: '2027-05-10',
      end_date: '2027-05-14',
      budget_eur: 1500,
      itinerary_data: { days: [] },
    };

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], total: 0 }),
      });
    });

    await page.goto(`/trips/${mockTripId}`);
    await page.waitForLoadState('domcontentloaded');

    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 15000 });

    const trigger = page.locator('[data-testid="speed-dial-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await trigger.click();

    const waypointBtn = page.locator('[data-testid="speed-dial-waypoint"]');
    await expect(waypointBtn).toBeVisible({ timeout: 10000 });
    await waypointBtn.click();

    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    if (mapBox) {
      await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    }

    const handle = page.locator('.paladio-radius-handle');
    await expect(handle).toBeVisible({ timeout: 10000 });

    // Open speed dial menu again while waypoint is active
    await trigger.click();

    // Click the clear area button on speed dial
    await expect(waypointBtn).toBeVisible({ timeout: 10000 });
    await waypointBtn.click();

    // Circle and handle should disappear cleanly
    await expect(handle).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText('TELEMETRY FAULT DETECTED')).toHaveCount(0);
    expect(page.url()).toContain(`/trips/${mockTripId}`);
  });
});
