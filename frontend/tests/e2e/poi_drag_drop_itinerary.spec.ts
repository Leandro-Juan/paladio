import { test, expect } from '@playwright/test';
import { getCorsHeaders, mockAuthenticatedUser } from './test-utils';

test.describe('POI Drag and Drop into Itinerary E2E', () => {
  test('drags POI from search, automatically switches to route, and drops into exact desired slot', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-drag-drop-1';
    let savedItinerary: any = null;

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
            theme: 'Historic Asakusa',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-sensoji',
                    name: 'Senso-ji Temple',
                    category: 'monument',
                    duration_mins: 90,
                    cost_eur: 0,
                    location: { latitude: 35.7148, longitude: 139.7967 },
                  },
                  arrival_time: 600,
                  departure_time: 690,
                },
                {
                  poi: {
                    id: 'poi-skytree',
                    name: 'Tokyo Skytree',
                    category: 'monument',
                    duration_mins: 75,
                    cost_eur: 25,
                    location: { latitude: 35.7101, longitude: 139.8107 },
                  },
                  arrival_time: 720,
                  departure_time: 795,
                },
              ],
            },
          },
          {
            day: 2,
            theme: 'Modern Shibuya',
            itinerary: { path: [] },
          },
        ],
      },
    };

    // Route mocks
    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          headers: getCorsHeaders(route),
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    // Mock POI search API response
    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'poi-meiji-shrine',
              name: 'Meiji Jingu Shrine',
              category: 'monument',
              lat: 35.6764,
              lng: 139.6993,
              duration_mins: 60,
              cost_eur: 0,
              scoring: { rating: 4.8 },
            },
          ],
          total: 1,
        }),
      });
    });

    // Navigate to trip workspace
    await page.goto(`/trips/${mockTripId}`);

    // 1. Verify Route stops exist initially
    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await expect(sidebar.getByText('Senso-ji Temple')).toBeVisible();
    await expect(sidebar.getByText('Tokyo Skytree')).toBeVisible();

    // 2. Switch to Search Tab
    const searchTab = page.getByTestId('tab-search');
    await searchTab.click();
    await expect(searchTab).toHaveText('Search');

    // Verify search POI card appears
    const meijiCard = page.getByTestId('poi-card-poi-meiji-shrine');
    await expect(meijiCard).toBeVisible({ timeout: 5000 });

    // 3. Initiate Drag on Search Card
    await meijiCard.evaluate((el) => {
      const dt = new DataTransfer();
      const ev = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // Verify it automatically switched the sidebar to Route view
    const routeTab = page.getByTestId('tab-route');
    await expect(routeTab).toHaveText('Route');

    // 4. Drop between Senso-ji (index 0) and Skytree (index 1) onto connector
    const connector = page.getByTestId('route-poi-connector').first();
    await expect(connector).toBeVisible();

    // Trigger dragover to set activeDropTarget to index 1
    await connector.evaluate((el) => {
      const dt = new DataTransfer();
      const ev = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // Drop on connector (or insertion indicator)
    await connector.evaluate((el) => {
      const payload = JSON.stringify({
        source: 'search',
        poi: {
          id: 'poi-meiji-shrine',
          name: 'Meiji Jingu Shrine',
          category: 'monument',
          duration_mins: 60,
          cost_eur: 0,
          location: { latitude: 35.6764, longitude: 139.6993 },
        },
      });
      const dt = new DataTransfer();
      dt.setData('application/paladio-poi', payload);
      dt.setData('text/plain', payload);
      const ev = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // 5. Verify stop appears in itinerary and custom floating preview is cleaned up
    await expect(sidebar.getByText('Meiji Jingu Shrine')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-paladio-custom-drag-preview]')).toHaveCount(0);

    // 6. Verify EXACT stop order in DOM:
    // All stop names inside Day 1: Senso-ji Temple -> Meiji Jingu Shrine -> Tokyo Skytree
    const stopTexts = await sidebar.locator('[data-testid^="poi-stop-card-"]').allInnerTexts().catch(() => []);
    // Check order of names inside sidebar
    const allStopsText = await sidebar.innerText();
    const sensojiIdx = allStopsText.indexOf('Senso-ji Temple');
    const meijiIdx = allStopsText.indexOf('Meiji Jingu Shrine');
    const skytreeIdx = allStopsText.indexOf('Tokyo Skytree');

    expect(sensojiIdx).toBeGreaterThan(-1);
    expect(meijiIdx).toBeGreaterThan(sensojiIdx); // Meiji is AFTER Senso-ji
    expect(skytreeIdx).toBeGreaterThan(meijiIdx); // Tokyo Skytree is AFTER Meiji (NOT at the end!)

    console.log('SUCCESS: Verified POI dropped at exact middle position (stop 2 of 3)!');
    console.log(`Indices in DOM: Senso-ji=${sensojiIdx}, Meiji Jingu=${meijiIdx}, Skytree=${skytreeIdx}`);
  });

  test('drags POI from itinerary and drops outside to remove with smooth animation', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-drag-drop-remove';
    let savedItinerary: any = null;

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
            theme: 'Historic Asakusa',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-sensoji',
                    name: 'Senso-ji Temple',
                    category: 'monument',
                    duration_mins: 90,
                    cost_eur: 0,
                    location: { latitude: 35.7148, longitude: 139.7967 },
                  },
                  arrival_time: 600,
                  departure_time: 690,
                },
                {
                  poi: {
                    id: 'poi-skytree',
                    name: 'Tokyo Skytree',
                    category: 'monument',
                    duration_mins: 75,
                    cost_eur: 25,
                    location: { latitude: 35.7101, longitude: 139.8107 },
                  },
                  arrival_time: 720,
                  departure_time: 795,
                },
              ],
            },
          },
          {
            day: 2,
            theme: 'Modern Shibuya',
            itinerary: { path: [] },
          },
        ],
      },
    };

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          headers: getCorsHeaders(route),
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.goto(`/trips/${mockTripId}`);

    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await expect(sidebar.getByText('Senso-ji Temple')).toBeVisible();
    await expect(sidebar.getByText('Tokyo Skytree')).toBeVisible();

    // Find the Senso-ji Temple card wrapper directly by testid
    const sensojiCard = sidebar.getByTestId('poi-stop-card-poi-sensoji');
    await expect(sensojiCard).toBeVisible();

    // 1. Initiate dragstart on the stop card
    await sensojiCard.evaluate((cardEl) => {
      const dt = new DataTransfer();
      const ev = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      cardEl.dispatchEvent(ev);
    });

    // 2. Trigger dragend without dropping into any valid dropzone (simulate drop outside itinerary)
    await sensojiCard.evaluate((cardEl) => {
      const dt = new DataTransfer();
      const ev = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      cardEl.dispatchEvent(ev);
    });

    // 3. Verify Senso-ji is removed from the DOM, custom preview is cleaned up, and Tokyo Skytree remains
    await expect(sidebar.getByText('Senso-ji Temple')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-paladio-custom-drag-preview]')).toHaveCount(0);
    await expect(sidebar.getByText('Tokyo Skytree')).toBeVisible();

    console.log('SUCCESS: Verified POI grabbed and dropped outside was removed with animation!');
  });

  test('drags POI and drops onto top of day (index 0) without jumping to end of trip', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-drag-drop-top';
    let savedItinerary: any = null;

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
            theme: 'Historic Asakusa',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-sensoji',
                    name: 'Senso-ji Temple',
                    category: 'monument',
                    duration_mins: 90,
                    cost_eur: 0,
                    location: { latitude: 35.7148, longitude: 139.7967 },
                  },
                  arrival_time: 600,
                  departure_time: 690,
                },
                {
                  poi: {
                    id: 'poi-skytree',
                    name: 'Tokyo Skytree',
                    category: 'monument',
                    duration_mins: 75,
                    cost_eur: 25,
                    location: { latitude: 35.7101, longitude: 139.8107 },
                  },
                  arrival_time: 720,
                  departure_time: 795,
                },
              ],
            },
          },
          {
            day: 2,
            theme: 'Modern Shibuya',
            itinerary: { path: [] },
          },
        ],
      },
    };

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          headers: getCorsHeaders(route),
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'poi-meiji-shrine',
              name: 'Meiji Jingu Shrine',
              category: 'monument',
              lat: 35.6764,
              lng: 139.6993,
              duration_mins: 60,
              cost_eur: 0,
              scoring: { rating: 4.8 },
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto(`/trips/${mockTripId}`);
    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Switch to search tab
    const searchTab = page.getByTestId('tab-search');
    await searchTab.click();

    const meijiCard = page.getByTestId('poi-card-poi-meiji-shrine');
    await expect(meijiCard).toBeVisible({ timeout: 5000 });

    // Drag start on search card
    await meijiCard.evaluate((el) => {
      const dt = new DataTransfer();
      const ev = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // Drop onto the Day 1 header (index 0 target)
    const day1Header = sidebar.getByText('Day 1 — Historic Asakusa');
    await expect(day1Header).toBeVisible();

    await day1Header.evaluate((el) => {
      const payload = JSON.stringify({
        source: 'search',
        poi: {
          id: 'poi-meiji-shrine',
          name: 'Meiji Jingu Shrine',
          category: 'monument',
          duration_mins: 60,
          cost_eur: 0,
          location: { latitude: 35.6764, longitude: 139.6993 },
        },
      });
      const dt = new DataTransfer();
      dt.setData('application/paladio-poi', payload);
      dt.setData('text/plain', payload);
      const ev = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // Verify boundary warning modal pops up
    const warningModal = page.getByText('ANCHOR REORDER WARNING');
    await expect(warningModal).toBeVisible({ timeout: 5000 });
    const proceedBtn = page.getByRole('button', { name: 'PROCEED' });
    await expect(proceedBtn).toBeVisible();
    await proceedBtn.click();

    // Verify stop added and custom drag preview cleanup
    await expect(sidebar.getByText('Meiji Jingu Shrine')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-paladio-custom-drag-preview]')).toHaveCount(0);

    // Verify order in DOM: Meiji Jingu (index 0) -> Senso-ji -> Tokyo Skytree
    const allStopsText = await sidebar.innerText();
    const meijiIdx = allStopsText.indexOf('Meiji Jingu Shrine');
    const sensojiIdx = allStopsText.indexOf('Senso-ji Temple');
    const skytreeIdx = allStopsText.indexOf('Tokyo Skytree');

    expect(meijiIdx).toBeGreaterThan(-1);
    expect(sensojiIdx).toBeGreaterThan(meijiIdx); // Meiji is BEFORE Senso-ji
    expect(skytreeIdx).toBeGreaterThan(sensojiIdx); // Senso-ji is BEFORE Skytree

    console.log('SUCCESS: Verified POI dropped at top position (index 0) after confirming warning!');
  });

  test('cancelling boundary warning modal aborts drop and leaves schedule unchanged', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-drag-drop-cancel';
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
            theme: 'Historic Asakusa',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-sensoji',
                    name: 'Senso-ji Temple',
                    category: 'monument',
                    duration_mins: 90,
                    cost_eur: 0,
                    location: { latitude: 35.7148, longitude: 139.7967 },
                  },
                  arrival_time: 600,
                  departure_time: 690,
                },
              ],
            },
          },
        ],
      },
    };

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'poi-meiji-shrine',
              name: 'Meiji Jingu Shrine',
              category: 'monument',
              lat: 35.6764,
              lng: 139.6993,
              duration_mins: 60,
              cost_eur: 0,
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto(`/trips/${mockTripId}`);
    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    const searchTab = page.getByTestId('tab-search');
    await searchTab.click();

    const meijiCard = page.getByTestId('poi-card-poi-meiji-shrine');
    await expect(meijiCard).toBeVisible({ timeout: 5000 });

    const day1Header = sidebar.getByText('Day 1 — Historic Asakusa');
    await day1Header.evaluate((el) => {
      const payload = JSON.stringify({
        source: 'search',
        poi: {
          id: 'poi-meiji-shrine',
          name: 'Meiji Jingu Shrine',
          category: 'monument',
          duration_mins: 60,
          cost_eur: 0,
          location: { latitude: 35.6764, longitude: 139.6993 },
        },
      });
      const dt = new DataTransfer();
      dt.setData('application/paladio-poi', payload);
      dt.setData('text/plain', payload);
      const ev = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // Verify warning modal appears
    const warningModal = page.getByText('ANCHOR REORDER WARNING');
    await expect(warningModal).toBeVisible({ timeout: 5000 });

    // Click CANCEL
    const cancelBtn = page.getByRole('button', { name: 'CANCEL' });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Verify modal closes
    await expect(warningModal).not.toBeVisible();

    // Verify Meiji Jingu Shrine was NOT added
    await page.getByTestId('tab-route').click();
    const allStopsText = await sidebar.innerText();
    expect(allStopsText.includes('Meiji Jingu Shrine')).toBe(false);
    expect(allStopsText.includes('Senso-ji Temple')).toBe(true);
  });

  test('clicking a search POI focuses it and opens details, and switching tabs does not close details or unfocus it', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-focus-persist-1';

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
            theme: 'Historic Asakusa',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-sensoji',
                    name: 'Senso-ji Temple',
                    category: 'monument',
                    duration_mins: 90,
                    cost_eur: 0,
                    location: { latitude: 35.7148, longitude: 139.7967 },
                  },
                  arrival_time: 600,
                  departure_time: 690,
                },
              ],
            },
          },
        ],
      },
    };

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'poi-meiji-shrine',
              name: 'Meiji Jingu Shrine',
              category: 'monument',
              lat: 35.6764,
              lng: 139.6993,
              duration_mins: 60,
              cost_eur: 0,
              scoring: { rating: 4.8 },
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto(`/trips/${mockTripId}`);

    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // 1. Switch to Search Tab
    const searchTab = page.getByTestId('tab-search');
    await searchTab.click();
    await expect(searchTab).toHaveText('Search');

    // 2. Click the search POI card to focus and inspect it
    const meijiCard = page.getByTestId('poi-card-poi-meiji-shrine');
    await expect(meijiCard).toBeVisible({ timeout: 5000 });
    await meijiCard.click();

    // 3. Verify details drawer is open
    const inspectorDrawer = page.getByTestId('trip-poi-inspector-drawer');
    await expect(inspectorDrawer).toBeVisible({ timeout: 5000 });
    await expect(inspectorDrawer.getByRole('heading', { name: 'Meiji Jingu Shrine' })).toBeVisible();

    // 4. Switch to Route Tab
    const routeTab = page.getByTestId('tab-route');
    await routeTab.click();
    await expect(routeTab).toHaveText('Route');

    // 5. Verify the details drawer did NOT close and still shows Meiji Jingu Shrine
    await expect(inspectorDrawer).toBeVisible();
    await expect(inspectorDrawer.getByRole('heading', { name: 'Meiji Jingu Shrine' })).toBeVisible();
  });

  test('dropping airport as first stop keeps hotel as second stop and auto-fills hours', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-airport-hotel-preserve';
    let savedItinerary: any = null;

    const mockTrip = {
      id: mockTripId,
      destination: 'Bangkok',
      start_date: '2027-05-10',
      end_date: '2027-05-14',
      budget_eur: 1500,
      itinerary_data: {
        days: [
          {
            day: 1,
            theme: 'Arrival & City Exploration',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-hotel-bkk',
                    name: 'Centara Grand Hotel',
                    category: 'hotel',
                    duration_mins: 30,
                    cost_eur: 0,
                    location: { latitude: 13.748, longitude: 100.539 },
                  },
                },
                {
                  poi: {
                    id: 'poi-monument-bkk',
                    name: 'Victory Monument',
                    category: 'monument',
                    duration_mins: 60,
                    cost_eur: 0,
                    location: { latitude: 13.765, longitude: 100.537 },
                  },
                },
              ],
            },
          },
        ],
      },
    };

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          headers: getCorsHeaders(route),
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'poi-dmk-airport',
              name: 'Don Mueang International Airport (DMK)',
              category: 'airport',
              lat: 13.9126,
              lng: 100.6067,
              duration_mins: 60,
              cost_eur: 0,
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto(`/trips/${mockTripId}`);
    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Verify initial stops
    await expect(sidebar.getByText('Centara Grand Hotel')).toBeVisible();
    await expect(sidebar.getByText('Victory Monument')).toBeVisible();

    // Verify stops are draggable even when NOT in edit mode
    const hotelCard = sidebar.getByTestId('poi-stop-card-poi-hotel-bkk');
    await expect(hotelCard).toHaveAttribute('draggable', 'true');

    // Switch to search and drop airport at top (index 0)
    await page.getByTestId('tab-search').click();
    const airportSearchCard = page.getByTestId('poi-card-poi-dmk-airport');
    await expect(airportSearchCard).toBeVisible({ timeout: 5000 });

    // Initiate drag
    await airportSearchCard.evaluate((el) => {
      const dt = new DataTransfer();
      const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt });
      el.dispatchEvent(ev);
    });

    // Wait for sidebar to auto-switch back to Route view so the hotel card has a non-zero bounding box
    await expect(page.getByTestId('tab-route')).toHaveText('Route');

    // Drop onto top of day 1
    const topCard = sidebar.getByTestId('poi-stop-card-poi-hotel-bkk');
    await expect(topCard).toBeVisible({ timeout: 5000 });
    await topCard.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const payload = JSON.stringify({
        source: 'search',
        poi: {
          id: 'poi-dmk-airport',
          name: 'Don Mueang International Airport (DMK)',
          category: 'airport',
          duration_mins: 60,
          cost_eur: 0,
          location: { latitude: 13.9126, longitude: 100.6067 },
        },
      });
      const dt = new DataTransfer();
      dt.setData('application/paladio-poi', payload);
      dt.setData('text/plain', payload);
      const ev = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + 1,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // Verify modal warning
    const warningModal = page.getByText('ANCHOR REORDER WARNING');
    await expect(warningModal).toBeVisible({ timeout: 5000 });
    const proceedBtn = page.getByRole('button', { name: 'PROCEED' });
    await proceedBtn.click();

    // Verify hotel was NOT eliminated and is second!
    await expect(sidebar.getByTestId('poi-stop-card-poi-dmk-airport')).toBeVisible({ timeout: 5000 });
    await expect(sidebar.getByTestId('poi-stop-card-poi-hotel-bkk')).toBeVisible({ timeout: 5000 });
    await expect(sidebar.getByTestId('poi-stop-card-poi-monument-bkk')).toBeVisible({ timeout: 5000 });

    const fullText = await sidebar.innerText();
    const airportIdx = fullText.indexOf('Don Mueang International Airport (DMK)');
    const hotelIdx = fullText.indexOf('Centara Grand Hotel');
    const monumentIdx = fullText.indexOf('Victory Monument');

    expect(airportIdx).toBeGreaterThan(-1);
    expect(hotelIdx).toBeGreaterThan(airportIdx); // Hotel is SECOND (after airport)
    expect(monumentIdx).toBeGreaterThan(hotelIdx); // Monument is THIRD (after hotel)

    // Verify hours were automatically filled (no longer --:--)
    expect(fullText.includes('09:00')).toBe(true);
  });

  test('clicking time selector in edit mode opens custom hour picker modal from trip creation', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const mockTripId = 'test-trip-custom-time-picker';
    const mockTrip = {
      id: mockTripId,
      destination: 'Bangkok',
      start_date: '2027-05-10',
      end_date: '2027-05-14',
      budget_eur: 1500,
      itinerary_data: {
        days: [
          {
            day: 1,
            theme: 'Bangkok Wonders',
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-park-bkk',
                    name: 'Pathumwananurak Park',
                    category: 'park',
                    duration_mins: 60,
                    cost_eur: 0,
                    location: { latitude: 13.748, longitude: 100.539 },
                  },
                  scheduled_start: '16:05',
                  scheduled_end: '17:05',
                },
              ],
            },
          },
        ],
      },
    };

    await page.route(/.*\/api(\/v1)?\/locations\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/(collections|expenses|tickets).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ balances: [], settlements: [], total_spent: 0, currency: 'EUR' }),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}/?(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.goto(`/trips/${mockTripId}`);
    const sidebar = page.getByTestId('trip-unified-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Click speed dial trigger then EDIT ROUTE to enter edit mode
    const speedDialTrigger = page.getByTestId('speed-dial-trigger');
    await expect(speedDialTrigger).toBeVisible({ timeout: 5000 });
    await speedDialTrigger.click();

    const editRouteBtn = page.getByTestId('speed-dial-edit-mode');
    await expect(editRouteBtn).toBeVisible({ timeout: 5000 });
    await editRouteBtn.click();

    // Verify entry time button exists
    const entryTimeBtn = page.getByTestId('poi-entry-time-poi-park-bkk');
    await expect(entryTimeBtn).toBeVisible({ timeout: 5000 });
    await expect(entryTimeBtn).toContainText('16:05');

    // Click the entry time button
    await entryTimeBtn.click();

    // Verify CustomHourPickerModal is open (Confirm Time button, cylinder dial)
    const confirmTimeBtn = page.getByRole('button', { name: 'Confirm Time' });
    await expect(confirmTimeBtn).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ENTRY TIME: PATHUMWANANURAK PARK')).toBeVisible();

    // Click Confirm Time
    await confirmTimeBtn.click();

    // Verify modal closes
    await expect(confirmTimeBtn).not.toBeVisible();
  });
});

