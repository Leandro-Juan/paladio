import {
  BASE_URL,
  createRecorderContext,
  stepLog,
  humanMove,
  humanHover,
  safeHumanClick,
  humanType,
  humanScroll,
  humanDragSlider,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '06_trip_config_agent_multicity',
    useAuthState: true,
  });

  // Preserve unused shared import reference cleanly if linting checks
  void humanDragSlider;

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  markContentStart();

  // === 1. CONFIGURATION TAB ===
  stepLog(cursorState, 'opening Configuration tab');
  await safeHumanClick(page, cursorState, page.locator('button[aria-label="Configuration"]').first(), { pauseAfter: 1000 });

  const tabPane = page.locator('.animate-tab-pane').first();
  const scrollConfigBy = async (deltaY, steps = 12) => {
    // Move cursor over left configuration column so wheel scrolls .animate-tab-pane rather than sticky Activity panel
    await humanMove(page, cursorState, 520, 420, 8);
    await humanScroll(page, cursorState, null, deltaY, steps);
  };

  // Scroll through Title, RouteIntakeBar, HotelStayAnchorBar, Cover Photo, Description/Briefing
  stepLog(cursorState, 'scrolling through Configuration sections + CurrencyWheelPicker + Pace');
  await scrollConfigBy(460, 12);
  await scrollConfigBy(480, 12);

  // Open & close CurrencyWheelPicker near Target Budget / Base Currency
  const changeCurrencyBtn = page.locator('button[title*="currency" i]').first();
  if (await changeCurrencyBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, changeCurrencyBtn, { pauseAfter: 700 });
    const wheelDialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[placeholder*="currency" i]') }).last();
    if (await wheelDialog.isVisible().catch(() => false)) {
      await page.waitForTimeout(450);
      const closeWheelBtn = wheelDialog.locator('button[aria-label="Close"]').first();
      if (await closeWheelBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closeWheelBtn, { pauseAfter: 400 });
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
      }
    }
  }

  // Scroll down to PaladioDateRangePicker & Exploration Pace cards -> click packed then balanced
  await scrollConfigBy(520, 12);
  const packedPaceBtn = page.getByRole('button', { name: /Packed/i }).first();
  const balancedPaceBtn = page.getByRole('button', { name: /Balanced/i }).first();
  if (await packedPaceBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, packedPaceBtn, { pauseAfter: 600 });
  }
  if (await balancedPaceBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, balancedPaceBtn, { pauseAfter: 550 });
  }

  // Continue scrolling through ParticipantsManager, Lifecycle Status, Shift Dates + Duplicate, Danger Zone
  await scrollConfigBy(560, 14);
  await scrollConfigBy(560, 14);
  await scrollConfigBy(560, 14);

  // Scroll back up smoothly
  await scrollConfigBy(-900, 14);
  await scrollConfigBy(-900, 14);
  await scrollConfigBy(-850, 14);

  // Click shift-start-date-btn -> showcase PaladioSingleDatePicker -> Escape/close cleanly
  stepLog(cursorState, 'showcasing shift-start-date-btn & PaladioSingleDatePicker');
  const shiftDateBtn = page.getByTestId('shift-start-date-btn');
  if (await safeHumanClick(page, cursorState, shiftDateBtn, { pauseAfter: 850 })) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const doneDateBtn = page.getByRole('button', { name: /^Done$/i }).last();
    if (await doneDateBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, doneDateBtn, { pauseAfter: 400 });
    }
  }

  // Scroll back to top of Config view for Activity panel toggle
  await scrollConfigBy(-1200, 12);

  // Open TripActivityTimeline via open-activity-panel-btn (if already open, close first so open button is showcased)
  stepLog(cursorState, 'showcasing TripActivityTimeline revisions & close');
  const timeline = page.getByTestId('trip-activity-timeline');
  if (await timeline.isVisible().catch(() => false)) {
    const closeExistingBtn = timeline.locator('button[aria-label*="Close" i]').first();
    if (await closeExistingBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, closeExistingBtn, { pauseAfter: 400 });
    }
  }

  const openActivityBtn = page.getByTestId('open-activity-panel-btn');
  if (await safeHumanClick(page, cursorState, openActivityBtn, { pauseAfter: 800 })) {
    if (await timeline.isVisible().catch(() => false)) {
      const timelineBody = timeline.locator('div').filter({ has: page.locator('[data-testid^="revision-item-"]') }).first();
      if (await timelineBody.isVisible().catch(() => false)) {
        await humanScroll(page, cursorState, timelineBody, 450, 14);
        await page.waitForTimeout(450);
        await humanScroll(page, cursorState, timelineBody, -450, 12);
      } else {
        await humanScroll(page, cursorState, timeline, 380, 12);
      }
      const closePanelBtn = timeline.locator('button[aria-label*="Close" i]').first();
      if (await closePanelBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closePanelBtn, { pauseAfter: 450 });
      }
    }
  }

  // Click DELETE EXPEDITION -> show confirmation dialog -> immediately click Cancel
  stepLog(cursorState, 'showcasing DELETE EXPEDITION confirmation modal & canceling');
  const deleteExpBtn = page.getByRole('button', { name: /DELETE EXPEDITION/i }).first();
  if (await safeHumanClick(page, cursorState, deleteExpBtn, { pauseAfter: 750 })) {
    const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /Confirm Deletion/i }).first();
    if (await confirmDialog.isVisible().catch(() => false)) {
      const cancelDeleteBtn = confirmDialog.getByRole('button', { name: /^Cancel$/i }).first();
      await safeHumanClick(page, cursorState, cancelDeleteBtn, { pauseAfter: 450 });
    }
  }

  // Scroll back up to top cleanly
  await scrollConfigBy(-1500, 10);
  await tabPane.evaluate((el) => { el.scrollTop = 0; }).catch(() => {});

  // === 2. HEADER ACTIONS: OFFLINE PIN & SHARE MODAL ===
  stepLog(cursorState, 'clicking Download Offline pin & Share Expedition modal');
  const offlineBtn = page.locator('button[aria-label*="offline" i]').first();
  if (await offlineBtn.isVisible().catch(() => false) && await offlineBtn.isEnabled().catch(() => false)) {
    await safeHumanClick(page, cursorState, offlineBtn, { pauseAfter: 900 });
  }

  const shareBtn = page.getByRole('button', { name: /Share Expedition/i }).first();
  if (await safeHumanClick(page, cursorState, shareBtn, { pauseAfter: 750 })) {
    const shareDialog = page.locator('[role="dialog"][aria-labelledby="share-modal-title"]').first();
    if (await shareDialog.isVisible().catch(() => false)) {
      // Toggle Day pills (Day 1, Day 2, All Days)
      for (const dayRegex of [/^Day 1$/i, /^Day 2$/i, /^All Days/i]) {
        const dayPill = shareDialog.getByRole('button', { name: dayRegex }).first();
        if (await dayPill.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, dayPill, { pauseAfter: 400 });
        }
      }

      // Open Package Profile <select>
      const profileSelect = shareDialog.locator('select[aria-label="Package profile"]').first();
      if (await profileSelect.isVisible().catch(() => false)) {
        await humanHover(page, cursorState, profileSelect, { pauseMs: 250 });
        await profileSelect.selectOption('community_shareable').catch(() => {});
        await page.waitForTimeout(550);
        await profileSelect.selectOption('full_vault').catch(() => {});
        await page.waitForTimeout(450);
      }

      // Click .ics and .gpx Export buttons
      const icsExportBtn = shareDialog
        .locator('div')
        .filter({ hasText: 'Calendar Sync (.ics)' })
        .filter({ has: shareDialog.getByRole('button', { name: /^Export$/i }) })
        .last()
        .getByRole('button', { name: /^Export$/i })
        .first();
      if (await icsExportBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, icsExportBtn, { pauseAfter: 650 });
      }

      const gpxExportBtn = shareDialog
        .locator('div')
        .filter({ hasText: 'GPS Route & Waypoints (.gpx)' })
        .filter({ has: shareDialog.getByRole('button', { name: /^Export$/i }) })
        .last()
        .getByRole('button', { name: /^Export$/i })
        .first();
      if (await gpxExportBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, gpxExportBtn, { pauseAfter: 650 });
      }

      // Copy link
      const copyLinkBtn = shareDialog.getByRole('button', { name: /Copy link/i }).first();
      if (await copyLinkBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, copyLinkBtn, { pauseAfter: 600 });
      }

      // Close Share modal
      const closeShareBtn = shareDialog.locator('button[aria-label="Close share dialog"]').first();
      await safeHumanClick(page, cursorState, closeShareBtn, { pauseAfter: 450 });
    }
  }

  // === 3. PLAN -> AGENT TAB ===
  stepLog(cursorState, 'switching to Plan -> Trip Agent tab');
  await safeHumanClick(page, cursorState, page.locator('button[aria-label="Plan"]').first(), { pauseAfter: 700 });
  const sidebar = page.getByTestId('trip-unified-sidebar');
  await safeHumanClick(page, cursorState, page.getByTestId('tab-agent'), { pauseAfter: 900 });

  // Open ModelSelectorPopover, search, clear, close via Escape
  stepLog(cursorState, 'opening agent-model-selector-btn ModelSelectorPopover');
  const modelBtn = page.getByTestId('agent-model-selector-btn');
  if (await safeHumanClick(page, cursorState, modelBtn, { pauseAfter: 650 })) {
    const modelDialog = page.locator('[role="dialog"][aria-label="Select AI Model"]').first();
    if (await modelDialog.isVisible().catch(() => false)) {
      const modelSearch = modelDialog.locator('input[placeholder="Search models..."]').first();
      if (await modelSearch.isVisible().catch(() => false)) {
        await humanType(page, cursorState, modelSearch, 'llama', { pauseAfter: 550 });
        const clearModelBtn = modelDialog.locator('button[aria-label="Clear search"]').first();
        if (await clearModelBtn.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, clearModelBtn, { pauseAfter: 450 });
        }
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
      if (await modelDialog.isVisible().catch(() => false)) {
        await humanMove(page, cursorState, 960, 300);
        await page.mouse.click(960, 300);
        await page.waitForTimeout(350);
      }
    }
  }

  // Send prompt in AgentComposer & wait up to 28s for streaming reply
  stepLog(cursorState, 'sending live Trip Agent prompt & waiting for response');
  const agentTextarea = sidebar.locator('textarea').first();
  await page.waitForFunction(() => {
    const ta = document.querySelector('[data-testid="trip-unified-sidebar"] textarea');
    return ta && !ta.disabled;
  }, { timeout: 8000 }).catch(() => {});

  if (await agentTextarea.isVisible().catch(() => false) && await agentTextarea.isEnabled().catch(() => false)) {
    await humanType(
      page,
      cursorState,
      agentTextarea,
      'Recommend 3 iconic architecture spots or kissaten cafes near Shibuya for Day 2',
      { delay: 26, pressEnter: true, pauseAfter: 800 }
    );

    const cancelGenBtn = sidebar.locator('button[title="Cancel Generation"]').first();
    await cancelGenBtn.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    await cancelGenBtn.waitFor({ state: 'hidden', timeout: 28000 }).catch(() => {});
    await page.waitForTimeout(900);

    // Expand tool-call disclosure if present
    const toolDisclosure = sidebar.locator('button[title*="tool" i]').first();
    if (await toolDisclosure.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, toolDisclosure, { pauseAfter: 700 });
    }

    // Interact with AgentPoiCards if returned
    const nextPlacesBtn = sidebar.locator('button[aria-label="Next places"]').first();
    if (await nextPlacesBtn.isVisible().catch(() => false) && await nextPlacesBtn.isEnabled().catch(() => false)) {
      await safeHumanClick(page, cursorState, nextPlacesBtn, { pauseAfter: 600 });
    }
    const inspectPoiBtn = sidebar.locator('button[title*="Focus on map" i]').first();
    if (await inspectPoiBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, inspectPoiBtn, { pauseAfter: 1100 });
      const closeDrawer = page.getByTestId('poi-inspector-close-arrow');
      if (await closeDrawer.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closeDrawer, { scroll: false, pauseAfter: 400 });
      }
    }
  } else {
    // Fallback: click a quick-prompt chip if enabled
    const quickChip = sidebar.locator('button').filter({ hasText: /Optimize Day|Rainy Day|Add Dinner/i }).first();
    if (await quickChip.isVisible().catch(() => false) && await quickChip.isEnabled().catch(() => false)) {
      await safeHumanClick(page, cursorState, quickChip, { pauseAfter: 2500 });
    }
  }

  // === 4. MULTI-CITY WORKSPACE GLIMPSE ===
  // Madrid
  stepLog(cursorState, 'navigating to demo-trip-madrid-active for multi-city transit showcase');
  await page.goto(`${BASE_URL}/trips/demo-trip-madrid-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });

  for (const id of ['day-tab-1', 'day-tab-2', 'day-tab-3', 'day-tab-4']) {
    const dBtn = page.getByTestId(id);
    if (await dBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, dBtn, { pauseAfter: 750 });
    }
  }

  const madridSpeedDial = page.getByTestId('speed-dial-trigger');
  if (await safeHumanClick(page, cursorState, madridSpeedDial, { pauseAfter: 450 })) {
    await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-view-toggle'), { pauseAfter: 1700 });
  }

  // London
  stepLog(cursorState, 'navigating to demo-trip-london-active for All Days hulls + London Underground');
  await page.goto(`${BASE_URL}/trips/demo-trip-london-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });

  const londonAllDays = page.getByTestId('day-tab-all');
  if (await londonAllDays.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, londonAllDays, { pauseAfter: 1100 });
  }

  const londonSpeedDial = page.getByTestId('speed-dial-trigger');
  if (await safeHumanClick(page, cursorState, londonSpeedDial, { pauseAfter: 450 })) {
    await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-view-toggle'), { pauseAfter: 1800 });
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '06_trip_config_agent_multicity',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
