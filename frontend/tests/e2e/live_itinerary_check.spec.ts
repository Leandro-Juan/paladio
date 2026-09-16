import { test, expect } from '@playwright/test';

test('create itinerary from scratch and verify rendering', async ({ page }) => {
  test.setTimeout(360000); // 6 mins timeout for full LLM and C++ solver flow

  console.log('Navigating to login page...');
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');

  // Fill in login form
  console.log('Filling in credentials...');
  const usernameInput = page.locator('input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]');
  
  await usernameInput.fill('admin');
  await passwordInput.fill('TestAdminSecret123!');
  
  const authBtn = page.getByRole('button', { name: /AUTHENTICATE/i });
  await authBtn.click();

  // Wait for redirect to /vault or /
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log('Logged in! Current URL:', page.url());

  // Listen to WebSocket messages
  page.on('websocket', (ws) => {
    console.log('WebSocket opened:', ws.url());
    ws.on('framesent', (event) => console.log('[WS OUT]:', event.payload?.toString().slice(0, 150)));
    ws.on('framereceived', (event) => {
      const payload = event.payload?.toString() || '';
      try {
        const parsed = JSON.parse(payload);
        console.log('[WS IN EVENT]:', parsed.event, parsed.status, parsed.data ? '(has data)' : '');
      } catch {
        console.log('[WS IN RAW]:', payload.slice(0, 100));
      }
    });
  });

  // Navigate to /engine
  console.log('Navigating to /engine...');
  await page.goto('http://localhost:3000/engine');
  await page.waitForLoadState('networkidle');

  // Ensure Preparation form is visible
  const heading = page.getByRole('heading', { name: /ACTIVE ENGINE/i });
  await expect(heading).toBeVisible();

  // Switch to simulated mode if not already
  const simulatedBtn = page.getByRole('button', { name: /SIMULATED ANCHORS/i });
  if (await simulatedBtn.isVisible()) {
    await simulatedBtn.click();
  }

  // Set Prompt
  const promptArea = page.locator('textarea').first();
  await promptArea.fill('Visit the main cultural landmarks and museums. Visit el Prado. Love traditional bistros and relaxed cafes.');

  // Origin & Destination
  const originInput = page.locator('input[placeholder="e.g. Madrid"]');
  const destInput = page.locator('input[placeholder="e.g. Paris"]');
  if (await originInput.isVisible()) {
    await originInput.fill('Madrid');
  }
  if (await destInput.isVisible()) {
    await destInput.fill('Madrid');
  }

  // Click Initialize Solver
  const launchBtn = page.getByRole('button', { name: /INITIALIZE SOLVER/i });
  await expect(launchBtn).toBeVisible();
  console.log('Clicking INITIALIZE SOLVER...');
  await launchBtn.click();

  // Should switch to Telemetry Console tab
  const quickInput = page.locator('input[placeholder*="Quick prompt"]');
  await expect(quickInput).toBeVisible({ timeout: 10000 });
  console.log('Switched to telemetry tab successfully.');

  // Wait for either CLARIFICATION_REQUIRED, SOLVER ACTIVE, or OPTIMIZED ITINERARY
  let finished = false;
  const startTime = Date.now();

  while (!finished && Date.now() - startTime < 330000) {
    await page.waitForTimeout(4000);
    const textContent = await page.locator('body').innerText();
    
    if (textContent.includes('OPTIMIZED ITINERARY')) {
      console.log('SUCCESS: OPTIMIZED ITINERARY heading detected on page!');
      finished = true;
      break;
    }

    if (textContent.includes('CLARIFICATION REQUIRED')) {
      console.log('CLARIFICATION REQUIRED appeared! Submitting missing fields...');
      const submitClarification = page.getByRole('button', { name: /SUBMIT CLARIFICATION/i });
      if (await submitClarification.isVisible()) {
        await submitClarification.click();
      }
    }

    const inferencing = textContent.includes('SOLVER ACTIVE');
    console.log(`Status check at ${(Date.now() - startTime) / 1000}s: SOLVER ACTIVE=${inferencing}`);
  }

  // Allow DOM to settle
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/browser_itinerary_result.png', fullPage: true });
  console.log('Saved screenshot to browser_itinerary_result.png');

  // Verify that OPTIMIZED ITINERARY is visible
  const itineraryHeading = page.getByRole('heading', { name: /OPTIMIZED ITINERARY/i });
  await expect(itineraryHeading).toBeVisible({ timeout: 15000 });

  // Verify that DAY 1 and DAY 2 are visible
  const day1Heading = page.getByRole('heading', { name: /DAY 1/i });
  await expect(day1Heading).toBeVisible();

  const day2Heading = page.getByRole('heading', { name: /DAY 2/i });
  await expect(day2Heading).toBeVisible();

  // Verify that mandatory POI (Museo del Prado) is rendered
  const pradoPoi = page.getByText(/Museo del Prado/i).first();
  await expect(pradoPoi).toBeVisible();

  // Verify Airport Leg Surcharge & Transit Fare (Madrid Line 8: 1.50 + 3.00 = 4.50 EUR)
  const surchargeBadge = page.locator('[data-testid="airport-surcharge-badge"]').first();
  await expect(surchargeBadge).toBeVisible({ timeout: 10000 });
  await expect(surchargeBadge).toContainText('+3.00 € AIRPORT SURCHARGE INCLUDED');

  const fare450 = page.getByText('4.50 €').first();
  await expect(fare450).toBeVisible();

  // Verify that estimated fare badge is NOT present on this verified leg
  const transitLeg = page.locator('[data-testid="transit-leg-view"]').first();
  const estimatedBadge = transitLeg.locator('[data-testid="estimated-fare-badge"]');
  await expect(estimatedBadge).toHaveCount(0);
});
