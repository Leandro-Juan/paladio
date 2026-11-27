import {
  BASE_URL,
  createRecorderContext,
  stepLog,
  humanMove,
  humanHover,
  safeHumanClick,
  humanType,
  humanScroll,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '04_trip_transit_weather_collections',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  markContentStart();

  const sidebar = page.getByTestId('trip-unified-sidebar');

  // === 1. TRANSIT TAB ===
  stepLog(cursorState, 'opening Transit tab (Directions, Lines, Nearby)');
  await safeHumanClick(page, cursorState, page.getByTestId('tab-transit'), { pauseAfter: 900 });

  // Sub-view 1: Directions
  const dirTabBtn = sidebar.getByRole('button', { name: /Directions/i }).first();
  if (await dirTabBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, dirTabBtn, { pauseAfter: 600 });
  }

  // Click a scheduled leg quick-prefill if available first
  const schedLeg = sidebar.getByTestId('directions-scheduled-legs').locator('button').first();
  if (await schedLeg.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, schedLeg, { pauseAfter: 1600 });
  } else {
    const originInput = sidebar.locator('input').nth(0);
    const destInput = sidebar.locator('input').nth(1);
    await humanType(page, cursorState, originInput, 'TRUNK', { pauseAfter: 500 });
    const firstDropItem = sidebar.locator('button').filter({ hasText: /TRUNK/i }).first();
    if (await firstDropItem.isVisible().catch(() => false)) await safeHumanClick(page, cursorState, firstDropItem, { pauseAfter: 400 });
    await humanType(page, cursorState, destInput, 'Senso', { pauseAfter: 500 });
    const secondDropItem = sidebar.locator('button').filter({ hasText: /Sens/i }).first();
    if (await secondDropItem.isVisible().catch(() => false)) await safeHumanClick(page, cursorState, secondDropItem, { pauseAfter: 400 });
    const getDirBtn = sidebar.getByRole('button', { name: /Get Directions/i }).first();
    if (await getDirBtn.isVisible().catch(() => false)) await safeHumanClick(page, cursorState, getDirBtn, { pauseAfter: 1600 });
  }

  // Test Swap A <-> B, Arrive By / Depart At, Time Picker modal
  const swapBtn = sidebar.locator('button[title*="Swap" i]').first();
  if (await swapBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, swapBtn, { pauseAfter: 700 });
  }
  const arriveBtn = sidebar.getByRole('button', { name: /Arrive by/i }).first();
  if (await arriveBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, arriveBtn, { pauseAfter: 500 });
  }
  const timeBtn = sidebar.locator('button[title*="Select departure" i], button[title*="time" i]').first();
  if (await timeBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, timeBtn, { pauseAfter: 600 });
    const manualTime = page.getByTestId('manual-time-input');
    if (await manualTime.isVisible().catch(() => false)) {
      await humanType(page, cursorState, manualTime, '10:30', { pauseAfter: 400 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
    }
    if (await page.getByTestId('manual-time-input').isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
    }
  }
  const departBtn = sidebar.getByRole('button', { name: /Depart at/i }).first();
  if (await departBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, departBtn, { pauseAfter: 450 });
  }
  const calcBtn = sidebar.getByRole('button', { name: /Get Directions/i }).first();
  if (await calcBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, calcBtn, { pauseAfter: 1500 });
  }
  // Toggle steps & alternative route if visible
  const dirStepsBtn = sidebar.getByTestId('toggle-transit-steps-btn').first();
  if (await dirStepsBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, dirStepsBtn, { pauseAfter: 800 });
  }
  await humanScroll(page, cursorState, sidebar, 240, 12);

  // Sub-view 2: Lines
  stepLog(cursorState, 'inspecting Transit Lines');
  const linesTabBtn = sidebar.getByRole('button', { name: /^Lines$/i }).first();
  if (await linesTabBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, linesTabBtn, { pauseAfter: 1600 });
    const lineCards = sidebar.locator('div').filter({ hasText: /stations/i }).filter({ hasNot: sidebar.locator('div').filter({ hasText: /stations/i }) });
    await lineCards.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const lineCount = Math.min(3, await lineCards.count());
    for (let i = 0; i < lineCount; i++) {
      await safeHumanClick(page, cursorState, lineCards.nth(i), { pauseAfter: 1200 });
    }
    const clearLineBanner = page.getByTestId('active-transit-line-banner').locator('button').first();
    if (await clearLineBanner.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, clearLineBanner, { pauseAfter: 500 });
    }
  }

  // Sub-view 3: Nearby Stations + Mode Filters + Station Drill-in & Departures
  stepLog(cursorState, 'inspecting Nearby Stations + Departures');
  const nearbyTabBtn = sidebar.getByRole('button', { name: /^Nearby$/i }).first();
  if (await nearbyTabBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, nearbyTabBtn, { pauseAfter: 2000 });
    for (const mode of ['Metro', 'Rail', 'Bus']) {
      const mBtn = sidebar.getByRole('button', { name: new RegExp(`^${mode}$`, 'i') }).first();
      if (await mBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, mBtn, { pauseAfter: 650 });
      }
    }
    // Wait for nearby station cards (leaf divs containing "walk" or "m)")
    const stationCard = sidebar.locator('div[style*="cursor: pointer"]').filter({ hasText: /walk|m\b/i }).first();
    await stationCard.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (await stationCard.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, stationCard, { pauseAfter: 1500 });
      for (const slot of ['12:00', '15:00']) {
        const sBtn = sidebar.getByRole('button', { name: slot, exact: true }).first();
        if (await sBtn.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, sBtn, { pauseAfter: 700 });
        }
      }
      await humanScroll(page, cursorState, sidebar, 240);
      const backNearby = sidebar.getByRole('button', { name: /Back to/i }).first();
      if (await backNearby.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, backNearby, { pauseAfter: 500 });
      }
    }
  }

  // === 2. WEATHER TAB ===
  stepLog(cursorState, 'opening Weather tab + forecasting days + telemetry cards');
  await safeHumanClick(page, cursorState, page.getByTestId('tab-weather'), { pauseAfter: 1500 });
  const dayCards = sidebar.locator('[data-testid^="weather-day-card-"]');
  const dCount = Math.min(5, await dayCards.count());
  for (let i = 0; i < dCount; i++) {
    await safeHumanClick(page, cursorState, dayCards.nth(i), { pauseAfter: 600 });
  }
  await humanScroll(page, cursorState, sidebar, 380);
  for (const cardId of ['weather-card-uv', 'weather-card-wind', 'weather-card-humidity', 'weather-card-aqi']) {
    const el = page.getByTestId(cardId);
    if (await el.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, el, { pauseMs: 350 });
    }
  }
  await humanScroll(page, cursorState, sidebar, -380);

  // === 3. SAVED COLLECTIONS TAB ===
  stepLog(cursorState, 'opening Collections tab + creating collection + import modal');
  await safeHumanClick(page, cursorState, page.getByTestId('tab-saved'), { pauseAfter: 900 });
  const colCards = sidebar.locator('[data-testid^="collection-card-"]');
  if ((await colCards.count()) > 0) {
    const statusBtn = sidebar.locator('[data-testid^="collection-item-status-"]').first();
    if (!(await statusBtn.isVisible().catch(() => false))) {
      await safeHumanClick(page, cursorState, colCards.first(), { pauseAfter: 650 });
    }
    const firstStatus = sidebar.locator('[data-testid^="collection-item-status-"]').first();
    if (await firstStatus.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, firstStatus, { pauseAfter: 700 });
    }
    const firstItem = sidebar.locator('[data-testid^="collection-item-"]').first();
    if (await firstItem.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, firstItem, { pauseAfter: 850 });
      const closeDrawer = page.getByTestId('poi-inspector-close-arrow');
      if (await closeDrawer.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closeDrawer, { scroll: false, pauseAfter: 350 });
      }
    }
  }

  // Create New Collection
  const newColBtn = page.getByTestId('create-new-collection-btn');
  if (await newColBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, newColBtn, { pauseAfter: 500 });
    await humanType(page, cursorState, page.getByTestId('input-new-collection-name'), 'Hidden Shrines & Gardens', { pauseAfter: 400 });
    await safeHumanClick(page, cursorState, page.getByTestId('submit-collection-btn'), { pauseAfter: 900 });
  }

  // Open Import Places Modal briefly
  const importBtn = sidebar.getByRole('button', { name: /Import/i }).first();
  if (await importBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, importBtn, { pauseAfter: 1000 });
    const cancelImport = page.getByRole('dialog').getByRole('button', { name: /Cancel/i }).first();
    if (await cancelImport.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, cancelImport, { pauseAfter: 400 });
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '04_trip_transit_weather_collections',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
