import { test, expect } from '@playwright/test';
import { getCorsHeaders, mockAuthenticatedUser, mockPaladioWebSocket } from './test-utils';

function buildTokyo45Trip() {
  const days = [1, 2, 3].map((dayNum) => ({
    day_number: dayNum,
    date: `2025-01-0${dayNum}`,
    itinerary: {
      path: Array.from({ length: 15 }, (_, idx) => ({
        poi: {
          id: `tokyo-poi-${dayNum}-${idx}`,
          name: `Tokyo Landmark D${dayNum}-${idx + 1}`,
          category: 'sight',
          location: {
            latitude: 35.6762 + dayNum * 0.004 + idx * 0.001,
            longitude: 139.6503 + idx * 0.001,
          },
          scoring: { google_rating: 4.7 },
        },
        arrival_time: '09:00',
        departure_time: '10:00',
      })),
    },
  }));

  const makeSvg = (label: string) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#0F4C5C"/><text x="20" y="105" fill="#FFFFFF" font-size="20">${label}</text></svg>`
    );

  return {
    id: 'trip-tokyo-45',
    destination: 'Tokyo',
    destination_iata: 'HND',
    start_date: '2025-01-01T00:00:00.000Z',
    end_date: '2025-01-03T00:00:00.000Z',
    status: 'completed',
    itinerary_data: {
      title: 'Winter in Tokyo',
      photos: [makeSvg('Tokyo 1'), makeSvg('Tokyo 2')],
      travel_constraints: {
        prompt: 'Winter architecture, temples, and coffee bars across Tokyo.',
        origin_city: 'Madrid',
        booking_anchors: { hotel: { name: 'Park Hotel Tokyo', lat: 35.6634, lng: 139.7596 } },
      },
      days,
    },
  };
}

test.describe('Vault Multi-City & Fallback Tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockPaladioWebSocket(page);
    await mockAuthenticatedUser(page);

    const tokyo45Trip = buildTokyo45Trip();
    const tokyoEmptyTrip = {
      id: 'trip-tokyo-empty',
      destination: 'Tokyo',
      destination_iata: 'HND',
      start_date: '2025-05-01T00:00:00.000Z',
      end_date: '2025-05-02T00:00:00.000Z',
      status: 'completed',
      itinerary_data: {
        title: 'Tokyo Spring Anchor',
        travel_constraints: {
          booking_anchors: { hotel: { name: 'Hotel Gracery Shinjuku', lat: 35.6956, lng: 139.7019 } },
        },
        days: [
          { day_number: 1, date: '2025-05-01', itinerary: { path: [] } },
          { day_number: 2, date: '2025-05-02', itinerary: { path: [] } },
        ],
      },
    };
    const kyotoTrip = {
      id: 'trip-kyoto-1',
      destination: 'Kyoto',
      destination_iata: 'KIX',
      start_date: '2025-08-10T00:00:00.000Z',
      end_date: '2025-08-13T00:00:00.000Z',
      status: 'completed',
      itinerary_data: {
        title: 'Kyoto Shrines',
        days: [
          {
            day_number: 1,
            date: '2025-08-10',
            itinerary: {
              path: [{ poi: { id: 'kyoto-1', name: 'Fushimi Inari', location: { latitude: 34.9671, longitude: 135.7727 } } }],
            },
          },
        ],
      },
    };

    const allTrips = [tokyo45Trip, tokyoEmptyTrip, kyotoTrip];

    await page.route(/.*\/api(\/v1)?\/trips\/[^/]+\/expenses\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/[^/]+\/settlement\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/[^/]+\/tickets\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ tickets: [], suggestions: [], has_drift: false }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/trip-tokyo-45\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(tokyo45Trip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/trip-tokyo-empty\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(tokyoEmptyTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(allTrips),
      });
    });

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({
          iata: 'HND',
          name: 'Tokyo Haneda Airport',
          city: 'Tokyo',
          country: 'JP',
          lat: 35.5494,
          lng: 139.7798,
        }),
      });
    });
  });

  test('Vault map shows numbered pins for multi-expedition cities and expedition switcher in card', async ({ page }) => {
    await page.goto('/vault');
    await page.waitForLoadState('networkidle');

    const markers = page.locator('.paladio-map-waypoint');
    await expect(markers.first()).toBeVisible({ timeout: 10000 });

    const markerCount = await markers.count();
    expect(markerCount).toBeGreaterThan(1);

    await markers.first().click({ force: true });

    const deployedCard = page.locator('[data-testid="deployed-trip-card"]');
    await expect(deployedCard).toBeVisible();

    const switcher = page.locator('[data-testid="deployed-trip-expedition-switcher"]');
    await expect(switcher).toBeVisible();
    const switcherButtons = switcher.locator('button');
    const btnCount = await switcherButtons.count();
    expect(btnCount).toBeGreaterThan(1);

    await switcherButtons.nth(1).click();
    await page.waitForTimeout(300);
    await expect(deployedCard).toBeVisible();
  });

  test('Trip with empty days does not snap to Porto and stays anchored to Tokyo / Airport', async ({ page }) => {
    await page.goto('/vault/trip-tokyo-empty');
    await page.waitForLoadState('networkidle');

    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 10000 });

    const day2 = page.locator('text=Day 2').first();
    if (await day2.isVisible()) {
      await day2.click();
      await page.waitForTimeout(500);
    }

    const portoElement = page.locator('text=Porto, Portugal');
    await expect(portoElement).not.toBeVisible();
  });

  test('Winter in Tokyo past trip displays 45 waypoints, itinerary, and photos tab', async ({ page }) => {
    await page.goto('/vault/trip-tokyo-45');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Tokyo').first()).toBeVisible({ timeout: 10000 });

    const waypointsCounter = page.locator('text=45');
    await expect(waypointsCounter.first()).toBeVisible();

    const photosTab = page.locator('button:has-text("Photos"), [role="tab"]:has-text("Photos")').first();
    await expect(photosTab).toBeVisible();
    await photosTab.click();

    await page.waitForTimeout(500);
    const photosContainer = page.locator('img');
    const imgCount = await photosContainer.count();
    expect(imgCount).toBeGreaterThan(0);
  });
});
