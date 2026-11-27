import {
  BASE_URL,
  RECORD_USER,
  RECORD_PASSWORD,
  createRecorderContext,
  stepLog,
  humanHover,
  safeHumanClick,
  humanType,
  humanScroll,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '01_auth_and_dashboard',
    useAuthState: false,
  });

  // 1. Open /login unauthenticated and mark content start on the Pacific Jazz auth view
  stepLog(cursorState, 'navigating to /login (unauthenticated)');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const identifierInput = page.locator('#identifier-input');
  await identifierInput.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(550);
  markContentStart();

  // Authenticate as recording user
  stepLog(cursorState, `authenticating as ${RECORD_USER} on /login`);
  await humanType(page, cursorState, identifierInput, RECORD_USER, { pauseAfter: 350 });
  const passwordInput = page.locator('input[type="password"]');
  await humanType(page, cursorState, passwordInput, RECORD_PASSWORD, { pauseAfter: 400 });
  const submitBtn = page.locator('button[type="submit"]');
  await safeHumanClick(page, cursorState, submitBtn, { pauseAfter: 500 });

  await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  await waitForAppReady(page);
  await page.waitForTimeout(600);

  // 2. Hover ActiveTripTicket, HarmonicRadarWidget (radar + Pace/Budget cards), and BestOfferCard
  stepLog(cursorState, 'hovering ActiveTripTicket, HarmonicRadarWidget, and BestOfferCard');
  const heroCard = page.locator('[class*="heroCol"] [class*="heroCard"], [class*="heroCol"] a').first();
  if (await heroCard.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, heroCard, { pauseMs: 700 });
  }

  const radarCard = page.locator('[class*="radarCol"] [class*="radarCard"], [class*="radarCol"] svg.recharts-surface').first();
  if (await radarCard.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, radarCard, { pauseMs: 650 });
  }
  const statusCards = page.locator('[class*="radarCol"] [class*="statusCard"]');
  const statusCount = Math.min(2, await statusCards.count());
  for (let i = 0; i < statusCount; i++) {
    await humanHover(page, cursorState, statusCards.nth(i), { pauseMs: 450 });
  }

  const bestOfferCard = page.locator('[class*="squareTicketCol"] > div').first();
  if (await bestOfferCard.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, bestOfferCard, { pauseMs: 700 });
  }

  // 3. RecommendedPoisSection: hover all 3 cards (poi-heart-btn), dismiss one, reset if visible
  stepLog(cursorState, 'interacting with RecommendedPoisSection');
  const recSection = page.locator('[class*="recommendedPoisCol"]').first();
  if (await recSection.isVisible().catch(() => false)) {
    await recSection.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
  }

  const heartBtns = page.getByTestId('poi-heart-btn');
  const heartCount = Math.min(3, await heartBtns.count());
  for (let i = 0; i < heartCount; i++) {
    await humanHover(page, cursorState, heartBtns.nth(i), { pauseMs: 450 });
  }

  const dismissBtn = page.getByTestId('poi-dismiss-btn').first();
  if (await dismissBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, dismissBtn, { pauseAfter: 800 });
  }

  const resetRecsBtn = page.getByRole('button', { name: /Reset Recommendations|Reset Dismissed/i }).first();
  if (await resetRecsBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, resetRecsBtn, { pauseAfter: 750 });
  }

  // 4. Operations Calendar: Annual -> MissionInspectorModal -> Month (Next/Prev/Today) -> Holiday mode -> Sync -> Plan -> Export .ics
  stepLog(cursorState, 'interacting with Operations Calendar');
  const calendarCard = page.locator('[class*="calendarCard"]').first();
  await calendarCard.waitFor({ state: 'visible', timeout: 10000 });
  await calendarCard.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // In ANNUAL view, click a trip chip in the legend (or mini trip cell) to open MissionInspectorModal
  const tripChip = calendarCard.locator('[class*="tripLegendChip"][title*="Click to inspect" i]').first();
  const miniTripCell = calendarCard.locator('[class*="miniDayCell"]:has([class*="miniTripIndicator"])').first();
  if (await tripChip.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, tripChip, { pauseAfter: 900 });
  } else if (await miniTripCell.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, miniTripCell, { pauseAfter: 900 });
  }

  const closeInspectorBtn = page.locator('button[aria-label="Close inspector"]').first();
  if (await closeInspectorBtn.isVisible().catch(() => false)) {
    const dossierLink = page.getByRole('link', { name: /VIEW FULL MISSION DOSSIER/i }).first();
    if (await dossierLink.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, dossierLink, { pauseMs: 450 });
    }
    const inspectorCloseBtn = page.getByRole('button', { name: /^CLOSE$/i }).first();
    if (await inspectorCloseBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, inspectorCloseBtn, { pauseAfter: 550 });
    } else {
      await safeHumanClick(page, cursorState, closeInspectorBtn, { pauseAfter: 550 });
    }
  }

  // Switch view toggle to MONTH, click Next, Prev, Today
  await safeHumanClick(page, cursorState, calendarCard.locator('button[aria-label="Month focus view"]'), { pauseAfter: 800 });
  await safeHumanClick(page, cursorState, calendarCard.locator('button[aria-label="Next month"]'), { pauseAfter: 650 });
  await safeHumanClick(page, cursorState, calendarCard.locator('button[aria-label="Previous month"]'), { pauseAfter: 650 });
  await safeHumanClick(page, cursorState, calendarCard.locator('button[aria-label="Today"]'), { pauseAfter: 700 });

  // Switch mode toggle to HOLIDAY, paint 2 open dates, sync official public holidays
  await safeHumanClick(page, cursorState, calendarCard.locator('button[aria-label="Mark holidays mode"]'), { pauseAfter: 700 });

  for (let i = 0; i < 2; i++) {
    const openDays = calendarCard.locator(
      '[class*="dayCell"]:not([class*="dayCellOutside"]):not([class*="dayCellHoliday"]):not([class*="dayCellPublicHoliday"])[title^="Click to plan mission"]'
    );
    const openCount = await openDays.count();
    if (openCount > 0) {
      const targetIdx = Math.min(openCount - 1, Math.max(0, Math.floor(openCount / 2) + i));
      await safeHumanClick(page, cursorState, openDays.nth(targetIdx), { pauseAfter: 550 });
    }
  }

  const syncHolidaysBtn = calendarCard.locator('button[title*="Sync official public holidays" i]').first();
  if (await syncHolidaysBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, syncHolidaysBtn, { pauseAfter: 1000 });
  }

  // Switch back to PLAN mode, hover & click Export .ics
  await safeHumanClick(page, cursorState, calendarCard.locator('button[aria-label="Plan trips mode"]'), { pauseAfter: 650 });
  const exportIcsBtn = calendarCard.locator('button[aria-label="Export whole calendar to .ics"]').first();
  if (await exportIcsBtn.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, exportIcsBtn, { pauseMs: 400 });
    const downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await safeHumanClick(page, cursorState, exportIcsBtn, { pauseAfter: 800 });
    await downloadPromise;
  }

  // 5. UpcomingTripsSection: hover cards, click abort icon/button to open confirmation modal, click Cancel
  stepLog(cursorState, 'inspecting UpcomingTripsSection and abort confirmation modal');
  const upcomingSection = page.getByTestId('upcoming-trips-section');
  await upcomingSection.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(450);

  const tripCards = upcomingSection.getByTestId('upcoming-trip-card');
  const tripCardCount = Math.min(3, await tripCards.count());
  for (let i = 0; i < tripCardCount; i++) {
    await humanHover(page, cursorState, tripCards.nth(i), { pauseMs: 380 });
  }

  const abortBtn = upcomingSection.getByRole('button', { name: /^ABORT$/i }).first();
  if (await abortBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, abortBtn, { pauseAfter: 800 });
    const cancelAbortBtn = page.getByRole('button', { name: /^CANCEL$/i }).last();
    if (await cancelAbortBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, cancelAbortBtn, { pauseAfter: 550 });
    }
  }

  // 6. SavedCollectionsSection: toggle visited on Architectural Landmarks, create collection, AddPoiFromTripsModal, AddPoiModal
  stepLog(cursorState, 'interacting with SavedCollectionsSection');
  const collectionsSection = page.getByTestId('saved-collections-section');
  await collectionsSection.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(450);

  const archCard = collectionsSection
    .locator('[data-testid^="saved-collection-card-"]')
    .filter({ hasText: /Architectural Landmarks/i })
    .first();
  const statusTargetCard = (await archCard.isVisible().catch(() => false))
    ? archCard
    : collectionsSection.locator('[data-testid^="saved-collection-card-"]').first();
  const visitStatusBtn = statusTargetCard.locator('[data-testid^="collection-item-status-"]').first();
  if (await visitStatusBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, visitStatusBtn, { pauseAfter: 750 });
  }

  // Create "Jazz Kissaten & Craft" collection
  const createColBtn = page.getByTestId('dashboard-create-collection-btn');
  await safeHumanClick(page, cursorState, createColBtn, { pauseAfter: 550 });

  const createForm = page.getByTestId('dashboard-create-collection-form');
  if (await createForm.isVisible().catch(() => false)) {
    await humanType(page, cursorState, page.getByTestId('dashboard-new-collection-name'), 'Jazz Kissaten & Craft', {
      pauseAfter: 350,
    });
    const swatches = createForm.locator('[class*="colorSwatches"] button');
    if ((await swatches.count()) > 2) {
      await safeHumanClick(page, cursorState, swatches.nth(2), { pauseAfter: 350 });
    } else if ((await swatches.count()) > 0) {
      await safeHumanClick(page, cursorState, swatches.first(), { pauseAfter: 350 });
    }
    await safeHumanClick(page, cursorState, page.getByTestId('dashboard-submit-collection-btn'), { pauseAfter: 1000 });
  }

  // Close form if duplicate kept it open
  if (await createForm.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, createColBtn, { pauseAfter: 400 });
  }

  // Open AddPoiFromTripsModal on the new collection card
  const jazzCard = collectionsSection
    .locator('[data-testid^="saved-collection-card-"]')
    .filter({ hasText: /Jazz Kissaten & Craft/i })
    .first();
  const activeColCard = (await jazzCard.isVisible().catch(() => false))
    ? jazzCard
    : collectionsSection.locator('[data-testid^="saved-collection-card-"]').first();

  const fromTripsBtn = activeColCard.locator('[data-testid^="add-from-trips-btn-"]').first();
  if (await fromTripsBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, fromTripsBtn, { pauseAfter: 700 });
    const modal = page.getByTestId('add-from-trips-modal');
    if (await modal.isVisible().catch(() => false)) {
      const searchInput = page.getByTestId('add-from-trips-search-input');
      const firstCand = modal.locator('[data-testid^="trip-poi-candidate-"]').first();
      let searchTerm = 'Museum';
      if (await firstCand.isVisible().catch(() => false)) {
        const rawText = (await firstCand.innerText().catch(() => '')) || '';
        const token = rawText.split(/\s+/).find((w) => /^[A-Za-z]{4,}$/.test(w));
        if (token) searchTerm = token;
      }
      await humanType(page, cursorState, searchInput, searchTerm, { pauseAfter: 600 });

      // Select a trip filter pill in the filter bar, then ensure candidates are visible before adding
      const allTripsPill = modal.getByRole('button', { name: /All Trips/i }).first();
      if (await allTripsPill.isVisible().catch(() => false)) {
        const specificTripPill = allTripsPill.locator('..').locator('button').nth(1);
        if (await specificTripPill.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, specificTripPill, { pauseAfter: 550 });
        }
      }
      if ((await modal.locator('[data-testid^="add-trip-poi-btn-"]').count()) === 0) {
        await humanType(page, cursorState, searchInput, '', { clear: true, pauseAfter: 350 });
        if (await allTripsPill.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, allTripsPill, { pauseAfter: 450 });
        }
      }

      // Add 1-2 POIs
      for (let i = 0; i < 2; i++) {
        const addBtn = modal.locator('[data-testid^="add-trip-poi-btn-"]').first();
        if (await addBtn.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, addBtn, { pauseAfter: 650 });
        }
      }

      // Close modal
      const closeModalBtn = modal.locator('button[aria-label="Close"]').first();
      await safeHumanClick(page, cursorState, closeModalBtn, { pauseAfter: 550 });
    }
  }

  // Briefly open AddPoiModal manually & close cleanly
  const addManualBtn = activeColCard.locator('[data-testid^="add-manual-poi-btn-"]').first();
  if (await addManualBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, addManualBtn, { pauseAfter: 750 });
    const addPoiModal = page.getByTestId('add-poi-modal');
    if (await addPoiModal.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, page.getByTestId('close-add-poi-modal-btn'), { pauseAfter: 550 });
    }
  }

  // Scroll back toward top so sidebar & notifications are in clear focus
  await humanScroll(page, cursorState, null, -1200, 10);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
  await page.waitForTimeout(500);

  // 7. Open NotificationBell -> showcase NotificationCenter popover -> close
  stepLog(cursorState, 'opening NotificationBell and NotificationCenter popover');
  const bellBtn = page.locator('button[aria-label*="Notifications" i], button[title="View Notifications"]').first();
  if (await bellBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, bellBtn, { pauseAfter: 1000 });
    const notifDialog = page.locator('[role="dialog"][aria-label="Notifications"]').first();
    if (await notifDialog.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, notifDialog, { pauseMs: 650 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
    }
  }

  // 8. Collapse AppSidebar (show floating toggle) and expand it again
  stepLog(cursorState, 'collapsing and expanding AppSidebar');
  const collapseSidebarBtn = page.locator('button[aria-label="Collapse sidebar"]').first();
  if (await collapseSidebarBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, collapseSidebarBtn, { pauseAfter: 900 });
    const expandSidebarBtn = page.locator('button[aria-label="Expand sidebar"]').first();
    if (await expandSidebarBtn.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, expandSidebarBtn, { pauseMs: 400 });
      await safeHumanClick(page, cursorState, expandSidebarBtn, { pauseAfter: 700 });
    }
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '01_auth_and_dashboard',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
