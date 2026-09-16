import { test, expect } from '@playwright/test';

test('create Paris itinerary from scratch and verify completion without timeout', async ({ page }) => {
  test.setTimeout(360000); // 6 mins timeout for full flow

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

  // Switch to simulated mode if present
  const simulatedBtn = page.getByRole('button', { name: /SIMULATED ANCHORS/i });
  if (await simulatedBtn.isVisible()) {
    await simulatedBtn.click();
  }

  // Set Prompt
  const promptArea = page.locator('textarea').first();
  await promptArea.fill('Visit the Louvre, Eiffel Tower, Notre-Dame, and traditional French bistros.');

  // Origin & Destination for Paris
  const originInput = page.locator('input[placeholder="e.g. Madrid"]');
  const destInput = page.locator('input[placeholder="e.g. Paris"]');
  if (await originInput.isVisible()) {
    await originInput.fill('Paris');
  }
  if (await destInput.isVisible()) {
    await destInput.fill('Paris');
  }

  // Click Initialize Solver
  const launchBtn = page.getByRole('button', { name: /INITIALIZE SOLVER/i });
  await expect(launchBtn).toBeEnabled();
  console.log('Launching Paris solver...');
  await launchBtn.click();

  // Monitor the solver timeline
  console.log('Waiting for solver completion or itinerary view...');

  // Wait for either the itinerary result or critical error
  await Promise.race([
    page.waitForSelector('[data-testid="transit-leg-view"]', { timeout: 300000 }),
    page.waitForSelector('text=CRITICAL ERROR', { timeout: 300000 }),
    page.waitForSelector('text=Optimization failed', { timeout: 300000 }),
  ]);

  // Ensure there is NO critical error or timeout message
  const criticalError = page.locator('text=CRITICAL ERROR');
  const errorCount = await criticalError.count();
  if (errorCount > 0) {
    const errText = await criticalError.first().innerText();
    console.error('Found unexpected error on page:', errText);
    expect(errorCount).toBe(0);
  }

  // Verify that transit legs are rendered
  const transitLegs = page.locator('[data-testid="transit-leg-view"]');
  const count = await transitLegs.count();
  console.log(`Found ${count} rendered transit legs in Paris itinerary!`);
  expect(count).toBeGreaterThan(0);

  // Take screenshot for verification artifact
  await page.screenshot({
    path: 'test-results/paris_itinerary_result.png',
    fullPage: true,
  });
  console.log('Screenshot saved to paris_itinerary_result.png');
});
