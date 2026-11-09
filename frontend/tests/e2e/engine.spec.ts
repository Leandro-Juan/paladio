import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Engine Trip Preparation Cockpit', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('renders initial cockpit with mode switcher and sovereign generation controls', async ({ page }) => {
    await page.goto('/engine');

    // Heading check
    const heading = page.getByRole('heading', { name: /NEW TRIP/i });
    await expect(heading).toBeVisible();

    // Verify mode switcher buttons are present
    const personalizedModeBtn = page.getByRole('button', { name: /Personalized Trip/i });
    const blankModeBtn = page.getByRole('button', { name: /Blank Trip/i });
    const uploadDocsBtn = page.getByRole('button', { name: /Upload Documents/i });
    await expect(personalizedModeBtn).toBeVisible();
    await expect(blankModeBtn).toBeVisible();
    await expect(uploadDocsBtn).toBeVisible();

    // Default mode is personalized: CTA and prompt textarea should be visible
    const launchBtn = page.getByRole('button', { name: /Generate Sovereign Trip Plan/i });
    await expect(launchBtn).toBeVisible();
    const promptArea = page.locator('textarea');
    await expect(promptArea).toBeVisible();
  });

  test('transitions smoothly between Personalized and Blank trip configurations', async ({ page }) => {
    await page.goto('/engine');

    // Click Blank Trip mode toggle
    const blankModeBtn = page.getByRole('button', { name: /Blank Trip/i });
    await blankModeBtn.click();

    const createBlankBtn = page.getByRole('button', { name: /Create Blank Canvas Trip/i });
    await expect(createBlankBtn).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).not.toBeVisible();

    // Click Personalized Trip mode toggle to switch back
    const personalizedModeBtn = page.getByRole('button', { name: /Personalized Trip/i });
    await personalizedModeBtn.click();

    // Verify Personalized Trip CTA button and prompt textarea return
    const launchBtn = page.getByRole('button', { name: /Generate Sovereign Trip Plan/i });
    await expect(launchBtn).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('captures visual screenshots of the trip creation flow', async ({ page }) => {
    await page.goto('/engine');
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).toBeVisible();
    await page.waitForTimeout(500);
    try {
      await page.screenshot({ path: 'test-results/trip_creation_personalized.png', animations: 'disabled' });
    } catch {
      // ignore headless screenshot protocol hiccups
    }

    await page.getByRole('button', { name: /Blank Trip/i }).click();
    await expect(page.getByRole('button', { name: /Create Blank Canvas Trip/i })).toBeVisible();
    await page.waitForTimeout(500);
    try {
      await page.screenshot({ path: 'test-results/trip_creation_blank.png', animations: 'disabled' });
    } catch {
      // ignore headless screenshot protocol hiccups
    }
  });

  test('clears page and renders thinking animation dots and status message on trip creation', async ({ page }) => {
    await page.goto('/engine');
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).toBeVisible();

    const textarea = page.locator('textarea');
    await textarea.fill('Art and museums route in Paris');

    await page.getByRole('button', { name: /Generate Sovereign Trip Plan/i }).click();

    // The form and "NEW TRIP" heading should clear and thinking dots should be visible
    const thinkingDots = page.locator('.paladio-thinking-dot');
    await expect(thinkingDots.first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'NEW TRIP' })).not.toBeVisible();
  });
});


