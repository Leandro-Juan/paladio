import { test, expect } from '@playwright/test';

test.describe('Engine Trip Preparation Cockpit', () => {
  test('renders mission preparation form with default constraints and anchor mode switcher', async ({ page }) => {
    await page.goto('/engine');

    // Heading check
    const heading = page.getByRole('heading', { name: /ACTIVE ENGINE/i });
    await expect(heading).toBeVisible();

    // Tab switcher check
    const prepTab = page.getByRole('button', { name: /01 \/\/ MISSION PREPARATION/i });
    const consoleTab = page.getByRole('button', { name: /02 \/\/ TELEMETRY CONSOLE/i });
    await expect(prepTab).toBeVisible();
    await expect(consoleTab).toBeVisible();

    // Form inputs: Budget Ceiling
    const budgetInput = page.locator('input[type="number"]');
    await expect(budgetInput).toHaveValue('1500');

    // Meal constraints check: Lunch and Dinner
    await expect(page.getByText('LUNCH')).toBeVisible();
    await expect(page.getByText('DINNER')).toBeVisible();

    // Ingestion mode buttons
    const simulatedBtn = page.getByRole('button', { name: /SIMULATED ANCHORS \(TEST MODE\)/i });
    const directBtn = page.getByRole('button', { name: /DIRECT TICKET INGESTION \(PROD\)/i });
    await expect(simulatedBtn).toBeVisible();
    await expect(directBtn).toBeVisible();

    // In simulated mode, origin and destination inputs exist
    const originInput = page.locator('input[placeholder="e.g. Madrid"]');
    const destInput = page.locator('input[placeholder="e.g. Paris"]');
    await expect(originInput).toHaveValue('Madrid');
    await expect(destInput).toHaveValue('Paris');

    // Switch to Direct Ticket Ingestion mode
    await directBtn.click();
    const rawTextarea = page.locator('textarea[placeholder*="Flight outbound"]');
    await expect(rawTextarea).toBeVisible();

    // Switch back to Simulated mode
    await simulatedBtn.click();
    await expect(originInput).toBeVisible();

    // Switch to Telemetry Console tab
    await consoleTab.click();
    const quickInput = page.locator('input[placeholder*="Quick prompt"]');
    await expect(quickInput).toBeVisible();
  });

  test('launches simulated mission from preparation cockpit and switches to telemetry console', async ({ page }) => {
    await page.goto('/engine');

    // Verify initial preparation tab is active
    const launchBtn = page.getByRole('button', { name: /INITIALIZE SOLVER/i });
    await expect(launchBtn).toBeVisible();

    // Click initiate swarm mission
    await launchBtn.click();

    // Should automatically switch to Telemetry Console tab
    const quickInput = page.locator('input[placeholder*="Quick prompt"]');
    await expect(quickInput).toBeVisible();

    // The launch button from the prep tab should no longer be rendered
    await expect(launchBtn).not.toBeVisible();
  });
});
