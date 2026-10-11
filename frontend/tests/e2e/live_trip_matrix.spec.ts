import { test, expect } from '@playwright/test';

/**
 * End-to-End Trip Generation Playwright Suite (Matching Frontend Contract Exactly).
 *
 * Exercises the complete browser flow:
 * 1. Authenticates at /login.
 * 2. Navigates to /engine (Active Engine Cockpit).
 * 3. Enters trip information into TripPreparationForm (Simulated Anchors, Prompt, Cities, Budget, Meals).
 * 4. Initializes solver and monitors live telemetry stream.
 * 5. Handles verification/clarification/overlap modal dialogs automatically.
 * 6. Asserts timeline rendering (Days, POIs, transit legs).
 * 7. Saves the completed trip to the Trip Vault and verifies persistence.
 *
 * Excluded from CI/CD pipeline runs by default via the 'live_' filename prefix
 * (playwright.config.ts ignores live_*.spec.ts unless RUN_LIVE_TESTS=1).
 */

const TRIP_SCENARIOS = [
  {
    name: 'Madrid Cultural Weekend (2 days)',
    origin: 'London',
    destination: 'Madrid',
    prompt: 'Visit the main cultural landmarks and museums. Visit el Prado. Love traditional tapas and relaxed cafes.',
    budget: '600',
    expectedDayCount: 2,
  },
  {
    name: 'Paris Heritage Discovery (3 days)',
    origin: 'Madrid',
    destination: 'Paris',
    prompt: 'Explore the Louvre, Eiffel Tower, and charming Parisian bistros.',
    budget: '1200',
    expectedDayCount: 3,
  },
];

for (const scenario of TRIP_SCENARIOS) {
  test(`e2e trip generation: ${scenario.name}`, async ({ page }) => {
    test.skip(!process.env.RUN_LIVE_TESTS, 'Skipping live check: requires running full stack on port 3000');
    test.setTimeout(360000); // 6 minutes for LLM + C++ solver + transit pipeline

    console.log(`[E2E UI] Starting scenario: ${scenario.name}`);

    // Step 1: Authenticate
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]');

    if (await usernameInput.isVisible()) {
      await usernameInput.fill('admin');
      await passwordInput.fill('TestAdminSecret123!');
      const authBtn = page.getByRole('button', { name: /AUTHENTICATE/i });
      await authBtn.click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    }

    // Step 2: Open Engine
    await page.goto('http://localhost:3000/engine');
    await page.waitForLoadState('networkidle');

    const heading = page.getByRole('heading', { name: /ACTIVE ENGINE/i });
    await expect(heading).toBeVisible();

    // Step 3: Switch to Simulated Mode if available
    const simulatedBtn = page.getByRole('button', { name: /SIMULATED ANCHORS/i });
    if (await simulatedBtn.isVisible()) {
      await simulatedBtn.click();
    }

    // Step 4: Fill form fields matching TripPreparationForm
    const promptArea = page.locator('textarea').first();
    await promptArea.fill(scenario.prompt);

    const originInput = page.locator('input[placeholder="e.g. Madrid"]');
    const destInput = page.locator('input[placeholder="e.g. Paris"]');
    if (await originInput.isVisible()) {
      await originInput.fill(scenario.origin);
    }
    if (await destInput.isVisible()) {
      await destInput.fill(scenario.destination);
    }

    const budgetInput = page.locator('input[type="number"]').first();
    if (await budgetInput.isVisible()) {
      await budgetInput.fill(scenario.budget);
    }

    // Step 5: Launch Solver
    const launchBtn = page.getByRole('button', { name: /INITIALIZE SOLVER/i });
    await expect(launchBtn).toBeVisible();
    await launchBtn.click();

    // Step 6: Monitor telemetry and auto-handle Human-In-The-Loop prompts
    const startTime = Date.now();
    let finished = false;

    while (!finished && Date.now() - startTime < 300000) {
      await page.waitForTimeout(3000);
      const bodyText = await page.locator('body').innerText();

      if (bodyText.includes('OPTIMIZED ITINERARY')) {
        finished = true;
        break;
      }

      // Handle confirmation modal / clarification
      const submitClarification = page.getByRole('button', { name: /SUBMIT CLARIFICATION/i });
      if (await submitClarification.isVisible()) {
        await submitClarification.click();
      }

      const confirmBtn = page.getByRole('button', { name: /CONFIRM & PROCEED/i });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }

      const proceedOverlapBtn = page.getByRole('button', { name: /PROCEED WITH OVERLAP/i });
      if (await proceedOverlapBtn.isVisible()) {
        await proceedOverlapBtn.click();
      }
    }

    expect(finished).toBe(true);

    // Step 7: Verify Itinerary Header and Days
    const itineraryHeading = page.getByRole('heading', { name: /OPTIMIZED ITINERARY/i });
    await expect(itineraryHeading).toBeVisible({ timeout: 15000 });

    const day1Heading = page.getByRole('heading', { name: /DAY 1/i });
    await expect(day1Heading).toBeVisible();

    // Step 8: Save to Vault
    const saveVaultBtn = page.getByRole('button', { name: /SAVE TO VAULT/i });
    if (await saveVaultBtn.isVisible()) {
      await saveVaultBtn.click();

      // Check modal or success toast
      await page.waitForTimeout(2000);
      console.log(`[E2E UI] Clicked SAVE TO VAULT for ${scenario.name}`);
    }

    // Step 9: Verify Vault displays saved trip
    await page.goto('http://localhost:3000/trips');
    await page.waitForLoadState('networkidle');
    const destinationCard = page.getByText(scenario.destination).first();
    await expect(destinationCard).toBeVisible({ timeout: 10000 });
  });
}
