import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Trips Page - Abort Mission Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });
  test('clicking ABORT opens modal with visible CONFIRM ABORT button', async ({ page }) => {
    const now = new Date();
    const startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await page.route(/.*\/api\/v1\/trips\/?(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'trip-madrid-1',
              destination: 'Madrid',
              start_date: startDate,
              end_date: endDate,
              itinerary_data: { days: [] },
            },
          ]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/trips');
    await expect(page.getByText('Madrid')).toBeVisible();

    const abortBtn = page.getByRole('button', { name: 'ABORT' });
    await expect(abortBtn).toBeVisible();
    await abortBtn.click();

    // Verify modal is open and has title
    await expect(page.getByText('ABORT MISSION?')).toBeVisible();

    // Verify CONFIRM ABORT button is visible and has correct red styling
    const confirmBtn = page.getByRole('button', { name: 'CONFIRM ABORT' });
    await expect(confirmBtn).toBeVisible();

    const color = await confirmBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // #DC2626 corresponds to rgb(220, 38, 38)
    expect(color).toBe('rgb(220, 38, 38)');

    const cancelBtn = page.getByRole('button', { name: 'CANCEL' });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(page.getByText('ABORT MISSION?')).not.toBeVisible();
  });
});
