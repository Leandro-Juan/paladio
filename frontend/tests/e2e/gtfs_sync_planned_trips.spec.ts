import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('GTFS Sync with Planned Trips Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('replaces refresh button, opens sync modal, pre-selects missing trips, and triggers download', async ({ page }) => {
    let syncPayload: any = null;

    const mockPlannedTrips = [
      {
        trip_id: 'trip-1-tokyo',
        destination: 'Tokyo',
        city_clean: 'tokyo',
        start_date: '2026-11-01',
        end_date: '2026-11-08',
        gtfs_status: 'READY',
        is_downloaded: true,
        is_building: false,
        is_queued: false,
      },
      {
        trip_id: 'trip-2-paris',
        destination: 'Paris',
        city_clean: 'paris',
        start_date: '2026-12-10',
        end_date: '2026-12-17',
        gtfs_status: 'NOT_DOWNLOADED',
        is_downloaded: false,
        is_building: false,
        is_queued: false,
      },
      {
        trip_id: 'trip-3-barcelona',
        destination: 'Barcelona',
        city_clean: 'barcelona',
        start_date: '2027-01-05',
        end_date: '2027-01-12',
        gtfs_status: 'NOT_DOWNLOADED',
        is_downloaded: false,
        is_building: false,
        is_queued: false,
      },
    ];

    await page.route(/.*\/api(\/v1)?\/users.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/transit\/planned-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPlannedTrips),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/transit\/sync-planned/, async (route) => {
      syncPayload = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          triggered: syncPayload.cities || [],
          queued: [],
          already_ready: [],
          message: `GTFS download and compilation process initiated for: ${(syncPayload.cities || []).join(', ')}.`,
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/transit\/registry/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_active_process: false,
          active_processes_count: 0,
          active_cities: [],
          total_cities: 1,
          compiled_cities: 1,
          queued_cities: 0,
          cities: [
            {
              city: 'tokyo',
              display_name: 'Tokyo',
              status: 'READY',
              osm_status: 'READY',
              gtfs_status: 'READY',
              is_ready: true,
              is_building: false,
              is_queued: false,
              is_downloaded: true,
              is_compiled: true,
              has_feed: true,
              valid_until: '2027-01-01T00:00:00Z',
            },
          ],
        }),
      });
    });

    await page.goto('/config');

    // 1. Verify old button is gone and new button exists
    await expect(page.getByText('REFRESH STATUS')).not.toBeVisible();
    const syncBtn = page.getByTestId('sync-gtfs-trips-btn');
    await expect(syncBtn).toBeVisible();
    await expect(syncBtn).toHaveText(/SYNC WITH PLANNED TRIPS/);

    // 2. Click button to open modal
    await syncBtn.click();
    const modal = page.getByTestId('sync-gtfs-trips-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Sync GTFS with Planned Trips');

    // 3. Verify trips in modal: Tokyo has READY badge, Paris & Barcelona have NOT DOWNLOADED
    await expect(page.getByTestId('trip-status-ready-trip-1-tokyo')).toBeVisible();
    await expect(page.getByTestId('trip-status-missing-trip-2-paris')).toBeVisible();
    await expect(page.getByTestId('trip-status-missing-trip-3-barcelona')).toBeVisible();

    // 4. Verify checkboxes: Paris and Barcelona are pre-checked, Tokyo is NOT pre-checked
    const tokyoCb = page.getByTestId('sync-trip-checkbox-trip-1-tokyo');
    const parisCb = page.getByTestId('sync-trip-checkbox-trip-2-paris');
    const barcelonaCb = page.getByTestId('sync-trip-checkbox-trip-3-barcelona');

    await expect(tokyoCb).not.toBeChecked();
    await expect(parisCb).toBeChecked();
    await expect(barcelonaCb).toBeChecked();

    // Confirm button shows DOWNLOAD GTFS (2)
    const confirmBtn = page.getByTestId('confirm-sync-gtfs-btn');
    await expect(confirmBtn).toContainText('DOWNLOAD GTFS (2)');

    // 5. Uncheck Barcelona, check Tokyo -> now Paris and Tokyo are selected (2)
    await barcelonaCb.uncheck();
    await expect(confirmBtn).toContainText('DOWNLOAD GTFS (1)');

    await tokyoCb.check();
    await expect(confirmBtn).toContainText('DOWNLOAD GTFS (2)');

    // 6. Submit sync
    await confirmBtn.click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Sync API should have been called with ['paris', 'tokyo']
    expect(syncPayload).not.toBeNull();
    expect(syncPayload.cities).toContain('paris');
    expect(syncPayload.cities).toContain('tokyo');
    expect(syncPayload.cities).not.toContain('barcelona');

    // Feedback message should be shown on the config page
    await expect(page.getByText(/GTFS download and compilation process initiated/)).toBeVisible();
  });
});
