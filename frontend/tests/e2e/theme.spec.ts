import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';
import { THEME_TOGGLE_ENABLED } from '../../src/stores/themeStore';

test.describe('Theme Engine (Pacific Jazz)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('data-theme attribute is present on html element at initial render', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('stored choice is applied after reload', async ({ page }) => {
    test.skip(!THEME_TOGGLE_ENABLED, 'Theme toggle disabled until Phase 8');
    await page.addInitScript(() => {
      localStorage.setItem('paladio-theme', 'dark');
    });
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('system dark preference is honored when nothing is stored', async ({ browser }) => {
    test.skip(!THEME_TOGGLE_ENABLED, 'Theme toggle disabled until Phase 8');
    const context = await browser.newContext({
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await mockAuthenticatedUser(page);
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await context.close();
  });

  test('toggle choice persists across reloads', async ({ page }) => {
    test.skip(!THEME_TOGGLE_ENABLED, 'Theme toggle disabled until Phase 8');
    await page.goto('/config');
    const toggle = page.getByRole('button', { name: /switch to dark mode/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
