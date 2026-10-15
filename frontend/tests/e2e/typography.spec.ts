import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Typography Engine (Inter Universal & Classic Switcher)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('data-typography attribute is present and defaults to inter', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-typography', 'inter');
  });

  test('stored typography choice is applied on reload', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('paladio-typography', 'classic');
    });
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-typography', 'classic');
  });

  test('toggle button on /config switches between inter and classic typography', async ({ page }) => {
    await page.goto('/config');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-typography', 'inter');

    // Click Switch to Classic Typography button
    const switchToClassicBtn = page.getByRole('button', { name: /switch to classic typography/i });
    await expect(switchToClassicBtn).toBeVisible();
    await switchToClassicBtn.click();
    await expect(html).toHaveAttribute('data-typography', 'classic');

    // Reload page to verify persistence
    await page.reload();
    await expect(html).toHaveAttribute('data-typography', 'classic');

    // Click Switch to Inter Typography button
    const switchToInterBtn = page.getByRole('button', { name: /switch to inter typography/i });
    await expect(switchToInterBtn).toBeVisible();
    await switchToInterBtn.click();
    await expect(html).toHaveAttribute('data-typography', 'inter');
  });

  test('card selection on /config switches typography', async ({ page }) => {
    await page.goto('/config');
    const html = page.locator('html');

    // Click Classic Editorial card
    const classicCard = page.getByRole('button', { name: /set typography to classic editorial/i });
    await expect(classicCard).toBeVisible();
    await classicCard.click();
    await expect(html).toHaveAttribute('data-typography', 'classic');

    // Click Inter card
    const interCard = page.getByRole('button', { name: /set typography to inter \(universal\)/i });
    await expect(interCard).toBeVisible();
    await interCard.click();
    await expect(html).toHaveAttribute('data-typography', 'inter');
  });
});
