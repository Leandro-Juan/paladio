import {
  BASE_URL,
  resetWorkspaceHorizontalScroll,
  createRecorderContext,
  stepLog,
  humanMove,
  humanHover,
  humanClick,
  safeHumanClick,
  humanType,
  humanScroll,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '02_trip_itinerary_days_map_edit',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  markContentStart();

  const sidebar = page.getByTestId('trip-unified-sidebar');

  // 1. Click ALL 5 day tabs + All Days
  stepLog(cursorState, 'clicking all 5 day tabs');
  const dayIds = ['day-tab-1', 'day-tab-2', 'day-tab-3', 'day-tab-4', 'day-tab-5', 'day-tab-all'];
  for (const id of dayIds) {
    const btn = page.getByTestId(id);
    if (await btn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, btn, { pauseAfter: 900 });
    }
  }
  await safeHumanClick(page, cursorState, page.getByTestId('day-tab-1'), { pauseAfter: 700 });

  // Scroll Day 1 itinerary stops smoothly
  await humanScroll(page, cursorState, sidebar, 260);
  await humanScroll(page, cursorState, sidebar, -260);

  // 2. Click a stop card to open POI Inspector Drawer
  stepLog(cursorState, 'opening POI inspector drawer');
  const stopCards = sidebar.locator('[data-testid^="poi-stop-card-"]');
  const secondStop = stopCards.nth(1);
  await safeHumanClick(page, cursorState, secondStop, { pauseAfter: 950 });

  const drawer = page.getByTestId('trip-poi-inspector-drawer');
  if (await drawer.isVisible().catch(() => false)) {
    // Photo carousel next/prev
    const nextPhotoBtn = drawer.locator('button[aria-label*="Next" i], button[aria-label*="siguiente" i]').first();
    if (await nextPhotoBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, nextPhotoBtn, { pauseAfter: 550 });
    }
    // View full photo lightbox
    const fullPhotoBtn = drawer.locator('button[aria-label*="full photo" i], button[title*="full photo" i]').first();
    if (await fullPhotoBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, fullPhotoBtn, { pauseAfter: 900 });
      const closeLightbox = page.locator('button[aria-label*="close" i], button[title*="close" i]').last();
      await safeHumanClick(page, cursorState, closeLightbox, { pauseAfter: 500 });
    }

    // Focus on map button inside drawer
    const focusMapBtn = drawer.locator('button[title*="Focus" i], button[aria-label*="Focus" i]').first();
    if (await focusMapBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, focusMapBtn, { pauseAfter: 850 });
    }

    // Scroll inside POI drawer to show description, translate, opening hours, export menu
    await humanScroll(page, cursorState, drawer, 320, 14);

    // Translate description button
    const translateBtn = page.getByTestId('translate-poi-description-btn');
    if (await translateBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, translateBtn, { pauseAfter: 800 });
    }

    // Save to collection bookmark button inside drawer
    const bookmarkBtn = drawer.locator('button[aria-label*="collection" i], button[title*="collection" i]').first();
    if (await bookmarkBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, bookmarkBtn, { pauseAfter: 650 });
      const colRow = page.locator('[data-testid^="menu-collection-row-"]').first();
      if (await colRow.isVisible().catch(() => false)) {
        await humanHover(page, cursorState, colRow, { pauseMs: 400 });
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Export / Open in Maps menu
    const exportBtn = page.getByTestId('poi-export-menu-btn');
    if (await exportBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, exportBtn, { pauseAfter: 700 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Collapse & Reopen POI Inspector Drawer via its side arrows
    const closeArrow = page.getByTestId('poi-inspector-close-arrow');
    if (await closeArrow.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, closeArrow, { scroll: false, pauseAfter: 600 });
      const reopenArrow = page.getByTestId('poi-inspector-reopen-arrow');
      if (await reopenArrow.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, reopenArrow, { scroll: false, pauseAfter: 700 });
      }
      // Close drawer cleanly
      const closeArrowAgain = page.getByTestId('poi-inspector-close-arrow');
      if (await closeArrowAgain.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closeArrowAgain, { scroll: false, pauseAfter: 450 });
      }
      await resetWorkspaceHorizontalScroll(page);
    }
  }

  // 3. Speed Dial -> Switch to Detailed Transit View!
  stepLog(cursorState, 'switching to Detailed Transit View');
  const speedDial = page.getByTestId('speed-dial-trigger');
  await safeHumanClick(page, cursorState, speedDial, { pauseAfter: 500 });
  await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-view-toggle'), { pauseAfter: 1400 });

  // Wait for detailed transit legend & transit legs to render
  await page.getByTestId('detailed-transit-legend').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  // Expand a transit leg in sidebar to show turn-by-turn steps and clickable transit line chips
  const toggleStepsBtn = sidebar.getByTestId('toggle-transit-steps-btn').first();
  if (await toggleStepsBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, toggleStepsBtn, { pauseAfter: 900 });
  } else {
    const transitLeg = sidebar.getByTestId('transit-leg-view').first();
    if (await transitLeg.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, transitLeg, { pauseAfter: 900 });
    }
  }
  const lineChip = sidebar.getByTestId('transit-line-chip').first();
  if (await lineChip.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, lineChip, { pauseAfter: 1100 });
    // Clear active transit line banner if visible
    const clearBannerBtn = page.getByTestId('active-transit-line-banner').locator('button').first();
    if (await clearBannerBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, clearBannerBtn, { pauseAfter: 550 });
    }
  }

  // Zoom in & pan map slightly in Detailed Transit mode
  const zoomIn = page.locator('.leaflet-control-zoom-in').first();
  await safeHumanClick(page, cursorState, zoomIn, { pauseAfter: 650 });
  const zoomOut = page.locator('.leaflet-control-zoom-out').first();
  await safeHumanClick(page, cursorState, zoomOut, { pauseAfter: 650 });

  // Switch back to Simple view
  if (!(await page.getByTestId('speed-dial-view-toggle').isVisible().catch(() => false))) {
    await safeHumanClick(page, cursorState, speedDial, { pauseAfter: 400 });
  }
  await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-view-toggle'), { pauseAfter: 800 });

  // 4. Speed Dial -> Enter Edit Route Mode
  stepLog(cursorState, 'entering Edit Route Mode + reoptimize');
  if (!(await page.getByTestId('speed-dial-edit-mode').isVisible().catch(() => false))) {
    await safeHumanClick(page, cursorState, speedDial, { pauseAfter: 400 });
  }
  await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-edit-mode'), { pauseAfter: 750 });

  // Inline rename Day 1 theme
  const dayNameInput = page.getByTestId('edit-day-name-input-1');
  if (await dayNameInput.isVisible().catch(() => false)) {
    await humanType(page, cursorState, dayNameInput, 'Asakusa Shrines & Riverfront', { clear: true, pressEnter: true, pauseAfter: 600 });
  }

  // Move a stop down/up & toggle lock on a stop
  const moveDownBtn = sidebar.locator('button[aria-label*="down" i], button[aria-label*="abajo" i]').nth(1);
  if (await moveDownBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, moveDownBtn, { pauseAfter: 750 });
  }
  const lockBtn = sidebar.locator('button[aria-label*="waypoint" i]').nth(1);
  if (await lockBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, lockBtn, { pauseAfter: 600 });
  }

  // Add Day 6 and Remove Day 6
  const addDayBtn = page.getByTestId('add-day-tab-btn');
  if (await addDayBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, addDayBtn, { pauseAfter: 750 });
    const removeDay6 = page.getByTestId('remove-day-tab-6');
    if (await removeDay6.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, removeDay6, { pauseAfter: 700 });
    }
  }

  // Switch back to Day 1 and run C++20 Reoptimize!
  await safeHumanClick(page, cursorState, page.getByTestId('day-tab-1'), { pauseAfter: 500 });
  const reoptBtn = page.getByTestId('route-reoptimize-btn');
  if (await reoptBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, reoptBtn, { pauseAfter: 2000 });
  }

  // Exit Edit Mode
  if (!(await page.getByTestId('speed-dial-edit-mode').isVisible().catch(() => false))) {
    await safeHumanClick(page, cursorState, speedDial, { pauseAfter: 400 });
  }
  await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-edit-mode'), { pauseAfter: 600 });

  // 5. Collapse sidebar for full-bleed map pan, then expand again
  stepLog(cursorState, 'collapsing sidebar + panning map');
  await safeHumanClick(page, cursorState, page.getByTestId('sidebar-collapse-btn'), { scroll: false, pauseAfter: 800 });
  const mapEl = page.locator('.leaflet-container').first();
  const mapBox = await mapEl.boundingBox();
  if (mapBox) {
    const cx = mapBox.x + mapBox.width * 0.52;
    const cy = mapBox.y + mapBox.height * 0.5;
    await humanMove(page, cursorState, cx, cy);
    await page.mouse.down();
    await humanMove(page, cursorState, cx - 140, cy + 60, 18);
    await page.mouse.up();
    await page.waitForTimeout(600);
    await page.mouse.down();
    await humanMove(page, cursorState, cx, cy, 18);
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
  await safeHumanClick(page, cursorState, page.getByTestId('sidebar-expand-btn'), { scroll: false, pauseAfter: 700 });

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '02_trip_itinerary_days_map_edit',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
