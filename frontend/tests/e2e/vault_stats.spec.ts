import { test, expect } from '@playwright/test';
import { mockPaladioWebSocket } from './test-utils';

test('Vault page displays travel stats tab on left, removes cluster badge, and zooms cleanly', async ({ page }) => {
  // Set auth credentials
  await page.addInitScript(() => {
    localStorage.setItem('paladio_token', 'mock-valid-token');
  });

  await mockPaladioWebSocket(page);

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
        id: 'mock-user-123',
        email: 'admin@paladio.internal',
        username: 'admin',
        role: 'admin',
        is_active: true,
        preferences: {},
        has_embedding: false,
        created_at: new Date().toISOString(),
      }),
    });
  });

  await page.route(/.*\/api(\/v1)?\/trips\/trip-sevilla/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'trip-sevilla',
        destination: 'Sevilla',
        start_date: '2026-10-18T00:00:00.000Z',
        end_date: '2026-10-19T00:00:00.000Z',
        itinerary_data: { days: [] },
      }),
    });
  });

  // Provide realistic trips matching the user's database: Sevilla, Porto, Madrid x2 (completed), Tokyo (upcoming)
  await page.route(/.*\/api(\/v1)?\/trips\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'trip-sevilla',
          destination: 'Sevilla',
          start_date: '2026-10-18T00:00:00.000Z',
          end_date: '2026-10-19T00:00:00.000Z',
          itinerary_data: {
            photos: ['https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1200&q=80'],
            travel_constraints: {
              prompt: 'Weekend immersion in Andalusian architecture, flamenco performances, and authentic tapas bars.',
              origin_city: 'Madrid',
              pace: 'balanced',
              travel_tastes: ['cultural'],
              booking_anchors: { hotel: { name: 'Sevilla Center' } },
            },
            days: [
              { itinerary: { path: [{ poi: { location: { latitude: 37.3891, longitude: -5.9845 }, scoring: { google_rating: 4.8 } } }] } }
            ]
          }
        },
        {
          id: 'trip-porto',
          destination: 'Porto',
          start_date: '2026-10-01T00:00:00.000Z',
          end_date: '2026-10-06T00:00:00.000Z',
          itinerary_data: {
            photos: ['https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=80'],
            travel_constraints: {
              prompt: 'Exploring historic wine cellars, Douro riverfront, and traditional Portuguese taverns with friends.',
              origin_city: 'Madrid',
              travel_tastes: ['relaxed', 'cultural'],
              booking_anchors: { hotel: { name: 'Grand Central Hotel Porto' } },
            },
            days: [
              { itinerary: { path: [{ poi: { location: { latitude: 41.1579, longitude: -8.6291 }, scoring: { google_rating: 4.6 } } }] } }
            ]
          }
        },
        {
          id: 'trip-madrid-1',
          destination: 'Madrid',
          start_date: '2026-10-18T00:00:00.000Z',
          end_date: '2026-10-23T00:00:00.000Z',
          itinerary_data: {
            photos: ['https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=80'],
            travel_constraints: {
              prompt: 'I am planning a trip with my girlfriend, we love museums and modern art but in the night a bit of party',
              origin_city: 'Alicante',
              pace: 'balanced',
              travel_tastes: ['cultural', 'art'],
              booking_anchors: { hotel: { name: 'Madrid Center' } },
            },
            days: [
              { itinerary: { path: [{ poi: { location: { latitude: 40.4168, longitude: -3.7038 } } }] } }
            ]
          }
        },
        {
          id: 'trip-madrid-2',
          destination: 'Madrid',
          start_date: '2026-09-24T00:00:00.000Z',
          end_date: '2026-09-27T17:00:00.000Z',
          itinerary_data: {
            travel_constraints: {
              origin_city: 'Alicante',
              travel_tastes: ['cultural', 'relaxed'],
              booking_anchors: { hotel: { name: 'The Westin Palace Madrid' } },
            },
            days: [
              { itinerary: { path: [{ poi: { location: { latitude: 40.4168, longitude: -3.7038 } } }] } }
            ]
          }
        },
        {
          id: 'trip-tokyo',
          destination: 'Tokyo',
          start_date: '2027-10-21T00:00:00.000Z',
          end_date: '2027-10-25T00:00:00.000Z',
          itinerary_data: {
            days: [
              { itinerary: { path: [{ poi: { location: { latitude: 35.6762, longitude: 139.6503 } } }] } }
            ]
          }
        }
      ]),
    });
  });

  await page.goto('/vault');
  await page.waitForLoadState('networkidle');

  // Verify that the statistics panel is present
  const statsHeading = page.locator('text=General statistics');
  await expect(statsHeading).toBeVisible({ timeout: 10000 });

  // Verify that removed top telemetry items do NOT exist
  await expect(page.locator('text=PALADIO TELEMETRY')).toHaveCount(0);
  await expect(page.locator('text=LIVE VAULT')).toHaveCount(0);
  await expect(page.locator('text=VAULT DETAIL')).toHaveCount(0);

  // Verify sites visited text is present (POIs visited replaced)
  await expect(page.locator('text=sites visited')).toBeVisible();

  // Verify countries visited gauge is present
  await expect(page.locator('text=Countries visited')).toBeVisible();

  // Verify Most engaged section lists countries (Spain, Portugal) instead of cities
  const mostEngaged = page.locator('text=Most engaged');
  await expect(mostEngaged).toBeVisible();
  await expect(page.locator('button:has-text("Spain")').first()).toBeVisible();
  await expect(page.locator('button:has-text("Portugal")').first()).toBeVisible();

  // Verify individual waypoint markers are present instead of circles
  const markers = page.locator('.paladio-map-marker');
  await expect(markers.first()).toBeVisible({ timeout: 10000 });
  const waypoints = page.locator('.paladio-map-waypoint');
  await expect(waypoints.first()).toBeVisible();
  const markerCount = await markers.count();
  expect(markerCount).toBeGreaterThanOrEqual(3);

  // Verify that the circle cluster badge with count does NOT exist
  const clusterBadges = page.locator('.paladio-cluster-badge');
  await expect(clusterBadges).toHaveCount(0);

  // Wait for rendering to settle
  await page.waitForTimeout(600);

  // Take screenshot for visual inspection
  await page.locator('body').screenshot({
    path: 'test-results/vault_with_stats_tab.png',
  });

  // Verify the toggle collapse arrow button (matches trip details tabs)
  const collapseBtn = page.getByTestId('stats-collapse-btn');
  await expect(collapseBtn).toBeVisible();
  await collapseBtn.click();
  await page.waitForTimeout(500);

  // Take collapsed screenshot
  await page.locator('body').screenshot({
    path: 'test-results/vault_stats_collapsed.png',
  });

  // Verify the expand arrow button appears on the right edge
  const expandBtn = page.getByTestId('stats-expand-btn');
  await expect(expandBtn).toBeVisible();

  // Re-open the drawer to test waypoint click with drawer open
  await expandBtn.click();
  await page.waitForTimeout(400);

  // Click on a waypoint marker to deploy the trip card
  await markers.first().click();
  await page.waitForTimeout(500);

  // Assert that the deployed card appears
  const deployedCard = page.getByTestId('deployed-trip-card');
  await expect(deployedCard).toBeVisible({ timeout: 5000 });

  // Assert card content matches updated specifications
  await expect(page.locator('text=Travel Guide').first()).toBeVisible();
  
  // Assert ARCHIVED badge and Days Guide subtitle are removed
  await expect(deployedCard.locator('text=ARCHIVED')).toHaveCount(0);
  await expect(deployedCard.locator('text=Days Guide')).toHaveCount(0);

  // Assert country flag row and prompt narrative are visible
  await expect(page.getByTestId('deployed-trip-flag-row')).toBeVisible();
  await expect(page.getByTestId('deployed-trip-prompt')).toBeVisible();

  // Assert mission profile & lodging telemetry box replaces old POI box
  const telemetryBox = page.getByTestId('deployed-trip-telemetry');
  await expect(telemetryBox).toBeVisible();
  await expect(telemetryBox.locator('text=Base Camp').first()).toBeVisible();

  // Assert dynamic POI rating is calculated from real POIs and hardcoded 4.9 is absent
  const ratingEl = page.getByTestId('deployed-trip-rating');
  await expect(ratingEl).toBeVisible();
  await expect(ratingEl).toHaveText('4.8');
  await expect(deployedCard.locator('text=4.9')).toHaveCount(0);

  // Assert the prominent SEE TRIP button is visible
  const seeTripBtn = page.getByTestId('deployed-trip-see-btn');
  await expect(seeTripBtn).toBeVisible();
  await expect(seeTripBtn).toContainText('SEE TRIP');

  // Take screenshot with the deployed card active on the pictographic map
  await page.locator('body').screenshot({
    path: 'test-results/vault_deployed_trip_card.png',
  });

  // Verify close button dismisses the card
  const closeBtn = page.getByTestId('deployed-trip-close-btn');
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await page.waitForTimeout(300);
  await expect(deployedCard).not.toBeVisible();

  // Test Porto trip card with user's specific prompt, Portugal flag, and dynamic rating (4.6)
  const portoMarker = markers.nth(1);
  await portoMarker.click({ force: true });
  await expect(deployedCard).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Porto Travel Guide')).toBeVisible();
  const portoPrompt = page.getByTestId('deployed-trip-prompt');
  await expect(portoPrompt).toContainText('Exploring historic wine cellars');
  await expect(deployedCard.locator('text=Portugal')).toBeVisible();
  await expect(page.getByTestId('deployed-trip-rating')).toHaveText('4.6');

  await closeBtn.click();
  await page.waitForTimeout(300);

  // Test trip without prompt & unrated (trip-madrid-2 at Sep 24): prompt and rating elements should be omitted
  const fallbackMarker = markers.nth(2);
  await fallbackMarker.click({ force: true });
  await expect(deployedCard).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Madrid Travel Guide')).toBeVisible();
  await expect(page.getByTestId('deployed-trip-prompt')).toHaveCount(0);
  await expect(page.getByTestId('deployed-trip-rating')).toHaveCount(0);

  // Take screenshot of fallback card without prompt
  await page.locator('body').screenshot({
    path: 'test-results/vault_fallback_deployed_card.png',
  });

  await closeBtn.click();
  await page.waitForTimeout(300);

  // Re-deploy and verify SEE TRIP navigation
  await markers.first().click({ force: true });
  await expect(deployedCard).toBeVisible({ timeout: 5000 });
  await page.getByTestId('deployed-trip-see-btn').click();
  await expect(page).toHaveURL(/\/vault\/trip-sevilla/, { timeout: 10000 });
});

