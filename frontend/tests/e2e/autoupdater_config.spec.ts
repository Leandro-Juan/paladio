import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Configuration Page - Auto-Updater and Stop Updates Control', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('displays auto-updater, toggles stop automatic updates, and checks releases', async ({ page }) => {
    let mockStatus = {
      auto_update_enabled: true,
      check_interval_hours: 6,
      github_repo: 'Leandro-Juan/paladio',
      last_checked_at: '2026-10-29T18:00:00Z',
      current_version: '2.0.0',
      latest_version: '2.0.0',
      update_available: false,
      release_title: 'Release v2.0.0',
      release_notes: 'Initial stable 2.0.0 sovereign release.',
      release_url: 'https://github.com/Leandro-Juan/paladio/releases/tag/v2.0.0',
      download_url: 'https://github.com/Leandro-Juan/paladio/archive/refs/tags/v2.0.0.tar.gz',
      download_status: 'idle',
      downloaded_file: null,
      downloaded_at: null,
      file_sha256: null,
      file_size_bytes: null,
      last_error: null,
    };

    // Route system update endpoints
    await page.route(/.*\/api(\/v1)?\/system\/update\/status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStatus),
      });
    });

    await page.route(/.*\/api(\/v1)?\/system\/update\/config/, async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      mockStatus = {
        ...mockStatus,
        auto_update_enabled: payload.auto_update_enabled ?? mockStatus.auto_update_enabled,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', config: mockStatus }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/system\/update\/check.*/, async (route) => {
      mockStatus = {
        ...mockStatus,
        latest_version: '2.1.0',
        update_available: true,
        release_title: 'Paladio 2.1.0 Feature Release',
        release_notes: 'New sovereign transit caching and auto-updater enhancements.',
        download_url: 'https://github.com/Leandro-Juan/paladio/archive/refs/tags/v2.1.0.tar.gz',
        last_checked_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', telemetry: mockStatus }),
      });
    });

    // Mock other config page dependencies to prevent unhandled errors
    await page.route(/.*\/api(\/v1)?\/users.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/transit\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_active_process: false,
          active_processes_count: 0,
          active_cities: [],
          total_cities: 0,
          compiled_cities: 0,
          queued_cities: 0,
          cities: [],
        }),
      });
    });

    // 1. Navigate to /config
    await page.goto('/config');

    // 2. Verify System Updates section is rendered
    await expect(page.getByText('System Updates & Auto-Updater')).toBeVisible();
    await expect(page.getByText('GITHUB REPO: Leandro-Juan/paladio')).toBeVisible();
    await expect(page.getByText('v2.0.0').first()).toBeVisible();

    // 3. Verify Active Auto-Update status and STOP button
    const stopButton = page.getByRole('button', { name: 'STOP AUTOMATIC UPDATES' });
    await expect(stopButton).toBeVisible();

    // 4. Click STOP AUTOMATIC UPDATES
    await stopButton.click();

    // 5. Verify status changed to STOPPED and button changed to ENABLE AUTOMATIC UPDATES
    await expect(page.getByText('STOPPED', { exact: true })).toBeVisible();
    await expect(page.getByText('Automatic updates stopped.')).toBeVisible();
    const enableButton = page.getByRole('button', { name: 'ENABLE AUTOMATIC UPDATES' });
    await expect(enableButton).toBeVisible();

    // 6. Trigger Check for Updates
    const checkButton = page.getByRole('button', { name: 'CHECK FOR UPDATES' });
    await checkButton.click();

    // 7. Verify update detected
    await expect(page.getByText('New update found: v2.1.0')).toBeVisible();
    await expect(page.getByText('DOWNLOAD LATEST (v2.1.0)')).toBeVisible();
  });
});
