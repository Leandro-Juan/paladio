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

async function scrollWheelModalAndCancel(page, cursorState) {
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  const stage = dialog.locator('div[style*="perspective"]').first();
  if (await stage.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, stage, { pauseMs: 300, scroll: false });
  } else {
    await humanHover(page, cursorState, dialog, { pauseMs: 300, scroll: false });
  }
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(450);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(450);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400);

  const closeBtn = dialog.locator('button[aria-label="Close"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, closeBtn, { pauseAfter: 450, scroll: false });
  } else {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '11_config_all_10_sections',
    useAuthState: true,
  });

  // Open /dashboard -> UserMenu in AppSidebar -> click Settings (/config)
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  markContentStart();

  stepLog(cursorState, 'opening UserMenu in AppSidebar -> clicking Settings');
  const userMenuBtn = page.getByRole('button', { name: /User menu/i }).first();
  await safeHumanClick(page, cursorState, userMenuBtn, { pauseAfter: 500 });
  const settingsMenuItem = page.getByRole('menuitem', { name: /Settings/i }).first();
  await safeHumanClick(page, cursorState, settingsMenuItem, { pauseAfter: 800 });

  await page.waitForURL(/\/config/, { timeout: 12000 });
  await waitForAppReady(page);

  const settingsSidebar = page.locator('aside[aria-label="Settings Navigation"]').first();
  const mainCanvas = page.locator('main[aria-label="Settings Content"]').first();
  await settingsSidebar.waitFor({ state: 'visible', timeout: 12000 });

  const clickSidebarSection = async (title) => {
    const btn = settingsSidebar.locator('button').filter({ hasText: new RegExp(`^${title}$`, 'i') }).first();
    await safeHumanClick(page, cursorState, btn, { pauseAfter: 700 });
  };

  // 1. Showcase SettingsOverview search ("transit", "theme", clear)
  stepLog(cursorState, 'showcasing SettingsOverview search filtering');
  const overviewSearch = page.getByRole('textbox', { name: /Search settings catalog/i }).first();
  await humanType(page, cursorState, overviewSearch, 'transit', { pauseAfter: 750 });
  await humanType(page, cursorState, overviewSearch, 'theme', { clear: true, pauseAfter: 750 });
  await humanType(page, cursorState, overviewSearch, '', { clear: true, pauseAfter: 650 });

  // 2. Section 1: Personal Account (`profile`) + SettingsContextMenu
  stepLog(cursorState, 'Section 1/10: Personal Account (profile)');
  await clickSidebarSection('Personal Account');

  // Open SettingsContextMenu (···) on card and close
  const contextMenuBtn = mainCanvas.locator('button[aria-label="Options menu"]').first();
  if (await contextMenuBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, contextMenuBtn, { pauseAfter: 700 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }

  // Toggle password visibility eye icon
  const showPassBtn = mainCanvas.locator('button[aria-label="Show passphrase"]').first();
  if (await showPassBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, showPassBtn, { pauseAfter: 500 });
    const hidePassBtn = mainCanvas.locator('button[aria-label="Hide passphrase"]').first();
    if (await hidePassBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, hidePassBtn, { pauseAfter: 400 });
    }
  }

  // LanguagePickerModal scroll wheel & cancel
  const changeLangBtn = page.getByTestId('change-language-button');
  await safeHumanClick(page, cursorState, changeLangBtn, { pauseAfter: 500 });
  await scrollWheelModalAndCancel(page, cursorState);

  // Scroll down inside Personal Account
  await humanScroll(page, cursorState, mainCanvas, 320, 10);

  // Type in Home City to trigger city-suggestions-dropdown, then restore original city
  const cityInput = mainCanvas.locator('input[placeholder*="Madrid, Paris, Tokyo"]').first();
  if (await cityInput.isVisible().catch(() => false)) {
    const originalCity = (await cityInput.inputValue().catch(() => '')) || 'Madrid';
    await humanType(page, cursorState, cityInput, 'Tokyo', { clear: true, pauseAfter: 650 });
    const dropdown = page.getByTestId('city-suggestions-dropdown');
    if (await dropdown.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, dropdown, { pauseMs: 550, scroll: false });
    }
    await humanType(page, cursorState, cityInput, originalCity, { clear: true, pauseAfter: 550 });
    const firstCityOpt = dropdown.locator('button').first();
    if (await firstCityOpt.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, firstCityOpt, { pauseAfter: 450, scroll: false });
    } else {
      await page.mouse.click(500, 140);
      await page.waitForTimeout(300);
    }
  }

  // CountryWheelPicker scroll wheel & cancel
  const countryBtn = page.getByTestId('statutory-country-button');
  if (await countryBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, countryBtn, { pauseAfter: 500 });
    await scrollWheelModalAndCancel(page, cursorState);
  }

  // CurrencyWheelPicker scroll wheel & cancel
  const currencyBtn = mainCanvas.getByRole('button', { name: /Change Base Currency/i }).first();
  if (await currencyBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, currencyBtn, { pauseAfter: 500 });
    await scrollWheelModalAndCancel(page, cursorState);
  }

  // Scroll down to Units & Time Standards and toggle segmented pill back & forth
  await humanScroll(page, cursorState, mainCanvas, 420, 10);
  const imperialBtn = mainCanvas.locator('button').filter({ hasText: /Imperial/i }).first();
  if (await imperialBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, imperialBtn, { pauseAfter: 450 });
    const metricBtn = mainCanvas.locator('button').filter({ hasText: /Metric/i }).first();
    if (await metricBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, metricBtn, { pauseAfter: 450 });
    }
  }
  const prefModel = page.getByTestId('preference-model-section');
  if (await prefModel.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, prefModel, { pauseMs: 600 });
  }

  // 3. Section 2: Appearance & Interface (`appearance`) - ALL 4 sub-tabs
  stepLog(cursorState, 'Section 2/10: Appearance & Interface (all 4 sub-tabs)');
  await clickSidebarSection('Appearance & Interface');

  const appearanceTabs = mainCanvas.locator('[role="tablist"] [role="tab"]');
  // Sub-tab 1: theme (Light -> Dark -> Silent Waters -> Light)
  await safeHumanClick(page, cursorState, appearanceTabs.nth(0), { pauseAfter: 450 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Switch to dark mode"]'), { pauseAfter: 650 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Switch to silent waters"]'), { pauseAfter: 650 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Switch to light mode"]'), { pauseAfter: 550 });

  // Sub-tab 2: typography (Inter <-> Classic)
  await safeHumanClick(page, cursorState, appearanceTabs.nth(1), { pauseAfter: 450 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Set typography to Classic Editorial"]'), { pauseAfter: 650 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Set typography to Inter (universal)"]'), { pauseAfter: 550 });

  // Sub-tab 3: navigation (Sidebar <-> Floating Dock -> Sidebar)
  await safeHumanClick(page, cursorState, appearanceTabs.nth(2), { pauseAfter: 450 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Set navigation to Floating Bottom Dock"]'), { pauseAfter: 650 });
  await safeHumanClick(page, cursorState, mainCanvas.locator('button[aria-label="Set navigation to Sidebar"]'), { pauseAfter: 550 });

  // Sub-tab 4: maps (cycle basemap style pills + TacticalToggle)
  await safeHumanClick(page, cursorState, appearanceTabs.nth(3), { pauseAfter: 450 });
  for (const label of ['CartoDB Voyager', 'OpenStreetMap Standard', 'High-Res Satellite', 'CartoDB Dark Matter']) {
    const mapPill = mainCanvas.locator('button').filter({ hasText: label }).first();
    if (await mapPill.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, mapPill, { pauseAfter: 420 });
    }
  }
  const transitToggle = mainCanvas.locator('button[role="switch"][aria-label="Toggle transit lines on map"]').first();
  if (await transitToggle.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, transitToggle, { pauseAfter: 450 });
    await safeHumanClick(page, cursorState, transitToggle, { pauseAfter: 450 });
  }

  // 4. Section 3: Solver Constraints & Pacing (`solver`)
  stepLog(cursorState, 'Section 3/10: Solver Constraints & Pacing');
  await clickSidebarSection('Solver Constraints & Pacing');

  const sliders = mainCanvas.locator('input[type="range"]');
  const sliderCount = await sliders.count();
  for (let i = 0; i < sliderCount; i++) {
    const slider = sliders.nth(i);
    if (await slider.isVisible().catch(() => false)) {
      const origVal = await slider.evaluate((el) => Number(el.value || 12));
      await humanDragSlider(page, cursorState, slider, 21, 12, { changeOnEndOnly: true });
      await humanDragSlider(page, cursorState, slider, 7, 12, { changeOnEndOnly: true });
      await humanDragSlider(page, cursorState, slider, origVal, 10, { changeOnEndOnly: true });
    }
  }

  for (const tempoName of ['Leisurely', 'Intense', 'Balanced']) {
    const tempoBtn = mainCanvas.locator('button').filter({ hasText: tempoName }).first();
    if (await tempoBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, tempoBtn, { pauseAfter: 450 });
    }
  }

  const fatigueInput = mainCanvas.locator('input[aria-label="Attraction fatigue threshold"]').first();
  if (await fatigueInput.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, fatigueInput, { pauseMs: 400 });
  }
  const mealInputs = mainCanvas.locator('input[aria-label*="window minutes" i]');
  const mealCount = await mealInputs.count();
  for (let i = 0; i < mealCount; i++) {
    await humanHover(page, cursorState, mealInputs.nth(i), { pauseMs: 280 });
  }

  // 5. Section 4: City Data (`transit`)
  stepLog(cursorState, 'Section 4/10: City Data (transit)');
  await clickSidebarSection('City Data');

  await humanScroll(page, cursorState, mainCanvas, 320, 10);
  await humanScroll(page, cursorState, mainCanvas, -320, 10);

  const syncTripsBtn = page.getByTestId('sync-gtfs-trips-btn');
  if (await syncTripsBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, syncTripsBtn, { pauseAfter: 700 });
    const syncModal = page.getByTestId('sync-gtfs-trips-modal');
    if (await syncModal.isVisible().catch(() => false)) {
      const checkboxes = syncModal.locator('input[type="checkbox"]');
      const cbCount = Math.min(2, await checkboxes.count());
      for (let i = 0; i < cbCount; i++) {
        await safeHumanClick(page, cursorState, checkboxes.nth(i), { pauseAfter: 350, scroll: false });
      }
      await safeHumanClick(page, cursorState, page.getByTestId('cancel-sync-modal-btn'), { pauseAfter: 450, scroll: false });
    }
  }

  // 6. Section 5: AI & LLM Engine (`llm`)
  stepLog(cursorState, 'Section 5/10: AI & LLM Engine (llm)');
  await clickSidebarSection('AI & LLM Engine');

  const testConnBtn = mainCanvas.getByRole('button', { name: /TEST CONNECTION/i }).first();
  await testConnBtn.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});

  // Hover providers & select Google Gemini (active engine), open model dropdown, then Test Connection
  for (const prov of ['Gemini', 'Claude', 'OpenAI', 'Groq']) {
    const provCard = mainCanvas.locator('div[role="button"]').filter({ hasText: prov }).first();
    if (await provCard.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, provCard, { pauseMs: 280 });
    }
  }
  const geminiCard = mainCanvas.locator('div[role="button"]').filter({ hasText: /Google Gemini/i }).first();
  if (await geminiCard.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, geminiCard, { pauseAfter: 450 });
    const modelsChevron = geminiCard.locator('button[data-llm-dropdown]').first();
    if (await modelsChevron.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, modelsChevron, { pauseAfter: 650 });
      await safeHumanClick(page, cursorState, modelsChevron, { pauseAfter: 350 });
    }
  }
  if (await testConnBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, testConnBtn, { pauseAfter: 1800 });
    await page.waitForFunction(
      () => !document.querySelector('main[aria-label="Settings Content"] button[disabled]')?.textContent?.match(/Testing/i),
      { timeout: 10000 }
    ).catch(() => {});
    await page.waitForTimeout(700);
  }

  // 7. Section 6: Authorized Users (`users`)
  stepLog(cursorState, 'Section 6/10: Authorized Users (users)');
  await clickSidebarSection('Authorized Users');

  const firstEditBtn = mainCanvas.locator('tbody tr button').filter({ hasText: /^Edit$/i }).first();
  if (await firstEditBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, firstEditBtn, { pauseAfter: 700 });
    const editModal = page.getByTestId('edit-user-modal');
    if (await editModal.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, editModal, { pauseMs: 450, scroll: false });
      const cancelEditBtn = editModal.getByRole('button', { name: /^Cancel$/i }).first();
      await safeHumanClick(page, cursorState, cancelEditBtn, { pauseAfter: 450, scroll: false });
    }
  }

  const provisionBtn = mainCanvas.getByRole('button', { name: /PROVISION NEW USER/i }).first();
  if (await provisionBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, provisionBtn, { pauseAfter: 650 });
    const cancelProvisionBtn = page.getByRole('button', { name: /^Cancel$/i }).last();
    if (await cancelProvisionBtn.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, cancelProvisionBtn, { pauseMs: 350, scroll: false });
      await safeHumanClick(page, cursorState, cancelProvisionBtn, { pauseAfter: 450, scroll: false });
    }
  }

  // 8. Section 7: System Updates (`updates`)
  stepLog(cursorState, 'Section 7/10: System Updates (updates)');
  await clickSidebarSection('System Updates');

  const autoUpdateBadge = page.getByTestId('auto-update-status-badge');
  if (await autoUpdateBadge.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, autoUpdateBadge, { pauseMs: 500 });
  }
  const checkUpdatesBtn = mainCanvas.getByRole('button', { name: /CHECK FOR UPDATES/i }).first();
  if (await checkUpdatesBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, checkUpdatesBtn, { pauseAfter: 1400 });
  }

  // 9. Section 8: Data Vault & Backups (`vault`) - BOTH sub-tabs
  stepLog(cursorState, 'Section 8/10: Data Vault & Backups (vault: storage + photo_sync)');
  await clickSidebarSection('Data Vault & Backups');

  const storageSubTab = mainCanvas.getByRole('button', { name: /Storage & Snapshots/i }).first();
  if (await storageSubTab.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, storageSubTab, { pauseAfter: 550 });
  }
  const photoSyncSubTab = mainCanvas.getByRole('button', { name: /Photo Sync/i }).first();
  if (await photoSyncSubTab.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, photoSyncSubTab, { pauseAfter: 700 });
    await humanScroll(page, cursorState, mainCanvas, 260, 8);
  }

  // 10. Section 9: Notifications (`notifications`) - types + pushify + pushover + webhooks
  stepLog(cursorState, 'Section 9/10: Notifications (types + 3 relay sub-tabs)');
  await clickSidebarSection('Notifications');

  const dealNotifToggle = mainCanvas.locator('button[role="switch"][aria-label="Toggle deal alert notifications"]').first();
  if (await dealNotifToggle.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, dealNotifToggle, { pauseAfter: 400 });
    await safeHumanClick(page, cursorState, dealNotifToggle, { pauseAfter: 400 });
  }
  for (const relayName of ['Pushify', 'Pushover & Ntfy', 'Custom Webhooks']) {
    const relayTab = mainCanvas.getByRole('button', { name: relayName }).first();
    if (await relayTab.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, relayTab, { pauseAfter: 650 });
    }
  }

  // 11. Section 10: API Keys & Secrets (`secrets`)
  stepLog(cursorState, 'Section 10/10: API Keys & Secrets (secrets)');
  await clickSidebarSection('API Keys & Secrets');
  await humanScroll(page, cursorState, mainCanvas, 180, 8);
  await page.waitForTimeout(700);

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '11_config_all_10_sections',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
