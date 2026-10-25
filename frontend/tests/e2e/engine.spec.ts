import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Engine Trip Preparation Cockpit', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('renders initial two boxes (Blank Trip and Personalized Trip) with plus buttons and without telemetry or badges', async ({ page }) => {
    await page.goto('/engine');

    // Heading check
    const heading = page.getByRole('heading', { name: /NEW TRIP/i });
    await expect(heading).toBeVisible();

    // Verify badges are removed
    await expect(page.getByText('AI Solver Engine')).not.toBeVisible();
    await expect(page.getByText('Self-Guided Canvas')).not.toBeVisible();

    // Verify telemetry tabs are removed
    await expect(page.getByRole('button', { name: /01 \/\/ MISSION PREPARATION/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /02 \/\/ TELEMETRY CONSOLE/i })).not.toBeVisible();
    await expect(page.getByText('OUTPUT TELEMETRY')).not.toBeVisible();

    // Verify dual boxes are present
    const blankHeading = page.getByRole('heading', { name: /Blank Trip/i });
    const personalizedHeading = page.getByRole('heading', { name: /Personalized Trip/i });
    await expect(blankHeading).toBeVisible();
    await expect(personalizedHeading).toBeVisible();
    console.log('BLANK HEADING BOX:', await blankHeading.boundingBox());

    // Verify plus buttons are present
    const blankPlusBtn = page.getByRole('button', { name: /Create Blank Trip/i });
    const personalizedPlusBtn = page.getByRole('button', { name: /Create Personalized Trip/i });
    await expect(blankPlusBtn).toBeVisible();
    await expect(personalizedPlusBtn).toBeVisible();
  });

  test('transitions smoothly to Blank Trip configuration and back to selection', async ({ page }) => {
    await page.goto('/engine');

    // Click plus button to enter Blank Trip mode
    const blankPlusBtn = page.getByRole('button', { name: /Create Blank Trip/i });
    await blankPlusBtn.click();

    // Verify back navigation button appears
    const backBtn = page.getByRole('button', { name: /Back to trip types/i });
    await expect(backBtn).toBeVisible();

    // Verify Blank Trip CTA button and form inputs exist
    const createBlankBtn = page.getByRole('button', { name: /CREATE BLANK TRIP/i });
    await expect(createBlankBtn).toBeVisible();
    const destInput = page.locator('input[placeholder*="Destination (e.g. Paris"]');
    await expect(destInput).toHaveValue('Paris');

    // Click back to return to initial selection
    await backBtn.click();
    await expect(page.getByRole('button', { name: /Create Blank Trip/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Personalized Trip/i })).toBeVisible();
  });

  test('transitions smoothly to Personalized Trip configuration and back to selection', async ({ page }) => {
    await page.goto('/engine');

    // Click plus button to enter Personalized Trip mode
    const personalizedPlusBtn = page.getByRole('button', { name: /Create Personalized Trip/i });
    await personalizedPlusBtn.click();

    // Verify back navigation button appears
    const backBtn = page.getByRole('button', { name: /Back to trip types/i });
    await expect(backBtn).toBeVisible();

    // Verify Personalized Trip prompt textarea and launch CTA exist
    const promptArea = page.locator('textarea');
    await expect(promptArea).toBeVisible();
    const launchBtn = page.getByRole('button', { name: /INITIALIZE & OPTIMIZE TRIP/i });
    await expect(launchBtn).toBeVisible();

    // Click back to return to initial selection
    await backBtn.click();
    await expect(page.getByRole('button', { name: /Create Blank Trip/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Personalized Trip/i })).toBeVisible();
  });

  test('captures visual screenshots of the trip creation flow', async ({ page }) => {
    await page.goto('/engine');
    await expect(page.getByRole('button', { name: /Create Blank Trip/i })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/home/leandro/.gemini/antigravity/brain/0f1f9f15-d5a2-40ed-8d71-236d76954dc5/trip_creation_initial.png' });

    await page.getByRole('button', { name: /Create Blank Trip/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/home/leandro/.gemini/antigravity/brain/0f1f9f15-d5a2-40ed-8d71-236d76954dc5/trip_creation_blank.png' });

    await page.getByRole('button', { name: /Back to trip types/i }).click();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: /Create Personalized Trip/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/home/leandro/.gemini/antigravity/brain/0f1f9f15-d5a2-40ed-8d71-236d76954dc5/trip_creation_personalized.png' });
  });
});

