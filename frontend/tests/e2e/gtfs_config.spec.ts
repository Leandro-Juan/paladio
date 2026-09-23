import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('GTFS Configuration Management - Delete and Stop Compilation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('displays DELETE for compiled city, STOP for compiling city, and CANCEL for queued city', async ({ page }) => {
    let mockRegistry = {
      has_active_process: true,
      active_processes_count: 2,
      active_cities: ['Porto (Oporto)', 'Valencia'],
      total_cities: 3,
      compiled_cities: 1,
      queued_cities: 1,
      cities: [
        {
          city: 'madrid',
          display_name: 'Madrid',
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
        {
          city: 'porto',
          display_name: 'Porto (Oporto)',
          status: 'BUILDING',
          osm_status: 'READY',
          gtfs_status: 'BUILDING',
          is_ready: false,
          is_building: true,
          is_queued: false,
          is_downloaded: false,
          is_compiled: false,
          has_feed: true,
          valid_until: null,
        },
        {
          city: 'valencia',
          display_name: 'Valencia',
          status: 'QUEUED',
          osm_status: 'READY',
          gtfs_status: 'QUEUED',
          is_ready: false,
          is_building: false,
          is_queued: true,
          is_downloaded: false,
          is_compiled: false,
          has_feed: true,
          valid_until: null,
        },
      ],
    };

    let deletedCity: string | null = null;

    await page.route(/.*\/api\/v1\/users.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(/.*\/api\/v1\/trips\/transit\/.*/, async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'DELETE') {
        const city = url.split('/').pop();
        deletedCity = city || null;
        mockRegistry = {
          ...mockRegistry,
          cities: mockRegistry.cities.filter((c) => c.city !== city),
          compiled_cities: mockRegistry.cities.filter((c) => c.city !== city && c.is_compiled).length,
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'deleted',
            city,
            message: `GTFS transit data and tasks for ${city} cleaned up successfully.`,
          }),
        });
      } else if (url.includes('/transit/registry')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRegistry),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      }
    });

    await page.goto('/config');

    // 1. Verify Madrid has DELETE button (NOT RECOMPILE)
    const madridDeleteBtn = page.getByTestId('delete-gtfs-btn-madrid');
    await expect(madridDeleteBtn).toBeVisible();
    await expect(madridDeleteBtn).toHaveText('DELETE');

    // 2. Verify Porto has enabled STOP button (can cancel compilation)
    const portoStopBtn = page.getByTestId('delete-gtfs-btn-porto');
    await expect(portoStopBtn).toBeVisible();
    await expect(portoStopBtn).toHaveText('STOP');
    await expect(portoStopBtn).toBeEnabled();

    // 3. Verify Valencia has enabled CANCEL button
    const valenciaCancelBtn = page.getByTestId('delete-gtfs-btn-valencia');
    await expect(valenciaCancelBtn).toBeVisible();
    await expect(valenciaCancelBtn).toHaveText('CANCEL');
    await expect(valenciaCancelBtn).toBeEnabled();

    // 4. Click DELETE for Madrid and check modal
    await madridDeleteBtn.click();
    const modal = page.getByTestId('gtfs-delete-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Delete GTFS Transit Data');
    await expect(modal).toContainText('Are you sure you want to permanently delete compiled GTFS transit data for Madrid?');

    // 5. Confirm deletion
    const confirmBtn = page.getByTestId('confirm-delete-gtfs-btn');
    await expect(confirmBtn).toHaveText('DELETE GTFS');
    await confirmBtn.click();

    // Verify modal closes and delete API was invoked
    await expect(modal).not.toBeVisible();
    expect(deletedCity).toBe('madrid');

    // 6. Test STOP on active compilation (Porto)
    await portoStopBtn.click();
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Stop GTFS Compilation');
    await expect(modal).toContainText('Are you sure you want to stop and cancel GTFS compilation for Porto (Oporto)?');
    await expect(page.getByTestId('confirm-delete-gtfs-btn')).toHaveText('STOP & CLEAN UP');
    await page.getByTestId('confirm-delete-gtfs-btn').click();

    await expect(modal).not.toBeVisible();
    expect(deletedCity).toBe('porto');
  });
});
