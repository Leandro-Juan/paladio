import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Configuration Page - Auto-Updater and Stop Updates Control', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('displays auto-updater disabled by default, enables automatic updates, and prompts with patch notes on release', async ({ page }) => {
    let mockStatus = {
      auto_update_enabled: false,
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

    await page.route(/.*\/api(\/v1)?\/system\/update\/download.*/, async (route) => {
      mockStatus = {
        ...mockStatus,
        download_status: 'downloaded',
        downloaded_file: '/app/data/updates/paladio-v2.1.0.tar.gz',
        file_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        file_size_bytes: 1048576,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', download: mockStatus }),
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

    // 3. Verify Disabled Auto-Update status by default and ENABLE button
    const statusBadge = page.getByTestId('auto-update-status-badge');
    await expect(statusBadge).toHaveText('DISABLED');
    await expect(page.getByText('Automatic updates are off by default. Paladio will notify you with patch notes and ask before installing.')).toBeVisible();
    const enableButton = page.getByRole('button', { name: 'ENABLE AUTOMATIC UPDATES' });
    await expect(enableButton).toBeVisible();

    // 4. Click ENABLE AUTOMATIC UPDATES
    await enableButton.click();

    // 5. Verify status changed to ACTIVE and button changed to DISABLE AUTOMATIC UPDATES
    await expect(statusBadge).toHaveText('ACTIVE');
    await expect(page.getByText('System automatically downloads and installs new releases in the background.')).toBeVisible();
    const disableButton = page.getByRole('button', { name: 'DISABLE AUTOMATIC UPDATES' });
    await expect(disableButton).toBeVisible();

    // 6. Trigger Check for Updates
    const checkButton = page.getByRole('button', { name: 'CHECK FOR UPDATES' });
    await checkButton.click();

    // 7. Verify update detected and patch notes prompt displayed
    await expect(page.getByText('NEW UPDATE AVAILABLE', { exact: true })).toBeVisible();
    await expect(page.getByText('New Update Available: v2.1.0')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paladio 2.1.0 Feature Release' })).toBeVisible();
    await expect(page.getByText('// NEW FEATURES & PATCH NOTES:')).toBeVisible();
    await expect(page.getByText('New sovereign transit caching and auto-updater enhancements.')).toBeVisible();
    await expect(page.getByText('Would you like to install this update?')).toBeVisible();

    // 8. Verify action buttons in prompt: REMIND ME LATER and INSTALL UPDATE NOW
    const remindButton = page.getByRole('button', { name: 'REMIND ME LATER' });
    const installButton = page.getByRole('button', { name: 'INSTALL UPDATE NOW (v2.1.0)' });
    await expect(remindButton).toBeVisible();
    await expect(installButton).toBeVisible();

    // 9. Click INSTALL UPDATE NOW and verify download action triggers
    await installButton.click();
    await expect(page.getByText('Successfully downloaded Paladio v2.1.0 archive!')).toBeVisible();
  });
});
