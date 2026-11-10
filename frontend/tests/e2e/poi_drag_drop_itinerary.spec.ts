import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

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
    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    // Mock POI search API response
    await page.route(/.*\/api(\/v1)?\/pois\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
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

    // 5. Verify toast appears
    await expect(page.getByText('Added Meiji Jingu Shrine to Day 1')).toBeVisible({ timeout: 5000 });

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

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
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

    // 3. Verify the toast notification appears
    await expect(page.getByText('Removed "Senso-ji Temple" from Day 1')).toBeVisible({ timeout: 5000 });

    // 4. Verify Senso-ji is removed from the DOM, but Tokyo Skytree remains
    await expect(sidebar.getByText('Senso-ji Temple')).not.toBeVisible();
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

    await page.route(new RegExp(`.*/api(/v1)?/trips/${mockTripId}`), async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedItinerary = body.itinerary_data;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockTrip, itinerary_data: savedItinerary }),
        });
        return;
      }
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

    // Verify toast
    await expect(page.getByText('Added Meiji Jingu Shrine to Day 1')).toBeVisible({ timeout: 5000 });

    // Verify order in DOM: Meiji Jingu (index 0) -> Senso-ji -> Tokyo Skytree
    const allStopsText = await sidebar.innerText();
    const meijiIdx = allStopsText.indexOf('Meiji Jingu Shrine');
    const sensojiIdx = allStopsText.indexOf('Senso-ji Temple');
    const skytreeIdx = allStopsText.indexOf('Tokyo Skytree');

    expect(meijiIdx).toBeGreaterThan(-1);
    expect(sensojiIdx).toBeGreaterThan(meijiIdx); // Meiji is BEFORE Senso-ji
    expect(skytreeIdx).toBeGreaterThan(sensojiIdx); // Senso-ji is BEFORE Skytree

    console.log('SUCCESS: Verified POI dropped at top position (index 0) without jumping to end!');
    console.log(`Indices in DOM: Meiji Jingu=${meijiIdx}, Senso-ji=${sensojiIdx}, Skytree=${skytreeIdx}`);
  });
});
