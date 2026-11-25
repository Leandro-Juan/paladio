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

async function selectTheme(page, cursorState, themeIndex) {
  const main = page.locator('main').first();
  const tabs = main.locator('[role="tablist"] [role="tab"]');
  await safeHumanClick(page, cursorState, tabs.nth(0), { pauseAfter: 400 });
  const themeBtn = main.locator('button[aria-pressed]').nth(themeIndex);
  await safeHumanClick(page, cursorState, themeBtn, { pauseAfter: 700 });
}

async function selectNavigation(page, cursorState, navIndex) {
  const main = page.locator('main').first();
  const tabs = main.locator('[role="tablist"] [role="tab"]');
  await safeHumanClick(page, cursorState, tabs.nth(2), { pauseAfter: 400 });
  const navBtn = main.locator('button[aria-pressed]').nth(navIndex);
  await safeHumanClick(page, cursorState, navBtn, { pauseAfter: 700 });
}

async function switchLanguageInProfile(page, cursorState, searchTerm, expectedCodeUpper) {
  if (!page.url().includes('/config') || !page.url().includes('tab=profile')) {
    await page.goto(`${BASE_URL}/config?tab=profile`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
  }
  const changeLangBtn = page.getByTestId('change-language-button');
  await changeLangBtn.waitFor({ state: 'visible', timeout: 12000 });
  await safeHumanClick(page, cursorState, changeLangBtn, { pauseAfter: 450 });

  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  const searchInput = dialog.locator('input[type="text"]').first();
  await humanType(page, cursorState, searchInput, searchTerm, { clear: true, delay: 45, pauseAfter: 1000 });

  const confirmBtn = dialog.locator('button').last();
  const btnText = await confirmBtn.innerText().catch(() => '');
  if (!btnText.toUpperCase().includes(expectedCodeUpper)) {
    const codeBadge = dialog.locator('span').filter({ hasText: new RegExp(`^${expectedCodeUpper}$`) }).first();
    if (await codeBadge.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, codeBadge, { pauseAfter: 800, scroll: false });
    }
  }

  await safeHumanClick(page, cursorState, confirmBtn, { pauseAfter: 750, scroll: false });
  await dialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '12_themes_dock_and_i18n_rtl',
    useAuthState: true,
  });

  // 1. Open /config?tab=appearance -> switch Theme to Dark AND Navigation to Floating Dock
  await page.goto(`${BASE_URL}/config?tab=appearance`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  markContentStart();

  stepLog(cursorState, 'switching Theme -> Dark & Navigation -> Floating Dock');
  await selectTheme(page, cursorState, 1); // 0=light, 1=dark, 2=silent-waters
  await selectNavigation(page, cursorState, 0); // 0=dock, 1=sidebar

  // 2. Tour Dark Mode + Floating Dock
  stepLog(cursorState, 'touring /dashboard in Dark Mode with FloatingDock');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);

  // Move mouse to bottom center to raise FloatingDock
  await humanMove(page, cursorState, 960, 1068, 14);
  await page.waitForTimeout(550);

  const dock = page.locator('nav').filter({ has: page.locator('a[href="/dashboard"]') }).first();
  for (const href of ['/dashboard', '/engine', '/vault', '/config']) {
    const dockLink = dock.locator(`a[href="${href}"]`).first();
    if (await dockLink.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, dockLink, { pauseMs: 280, scroll: false });
    }
  }

  // Click NotificationBell inside dock -> close
  const dockBellBtn = dock.locator('button').nth(0);
  if (await dockBellBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, dockBellBtn, { pauseAfter: 850, scroll: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }

  // Re-hover dock & open UserMenu inside dock -> close
  await humanMove(page, cursorState, 960, 1068, 10);
  await page.waitForTimeout(400);
  const dockUserBtn = dock.locator('button').nth(1);
  if (await dockUserBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, dockUserBtn, { pauseAfter: 850, scroll: false });
    const userPopup = page.locator('[role="menu"]').first();
    if (await userPopup.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, userPopup, { pauseMs: 450, scroll: false });
    }
    await safeHumanClick(page, cursorState, dockUserBtn, { pauseAfter: 450, scroll: false });
  }

  // Dark Mode Tokyo map + Detailed Transit View
  stepLog(cursorState, 'touring /trips/demo-trip-tokyo-active in Dark Mode + Detailed Transit View');
  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });

  const speedDial = page.getByTestId('speed-dial-trigger');
  if (await speedDial.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, speedDial, { pauseAfter: 450 });
    const viewToggle = page.getByTestId('speed-dial-view-toggle');
    if (await viewToggle.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, viewToggle, { pauseAfter: 1300 });
    }
  }

  // Dark Mode /monitoring fleet telemetry & calendar
  stepLog(cursorState, 'touring /monitoring in Dark Mode');
  await page.goto(`${BASE_URL}/monitoring`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await humanScroll(page, cursorState, null, 280, 10);
  await page.waitForTimeout(550);
  await humanScroll(page, cursorState, null, -280, 10);

  // 3. Switch Theme -> Silent Waters & Navigation -> Sidebar
  stepLog(cursorState, 'switching Theme -> Silent Waters & Navigation -> Sidebar');
  await page.goto(`${BASE_URL}/config?tab=appearance`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await selectTheme(page, cursorState, 2); // 2=silent-waters
  await selectNavigation(page, cursorState, 1); // 1=sidebar

  // Tour /dashboard & /trips/demo-trip-tokyo-active in Silent Waters
  stepLog(cursorState, 'touring /dashboard & /trips/demo-trip-tokyo-active in Silent Waters');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.waitForTimeout(950);

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  await page.waitForTimeout(950);

  // 4. Multi-language tour: Japanese (ja) -> Spanish (es) -> Arabic (ar, RTL)
  stepLog(cursorState, 'switching language -> Japanese (ja)');
  await switchLanguageInProfile(page, cursorState, 'Japanese', 'JA');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.waitForTimeout(900);

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  await page.waitForTimeout(900);

  stepLog(cursorState, 'switching language -> Spanish (es)');
  await switchLanguageInProfile(page, cursorState, 'Spanish', 'ES');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.waitForTimeout(900);

  stepLog(cursorState, 'switching language -> Arabic (ar, RTL mirrored layout)');
  await switchLanguageInProfile(page, cursorState, 'Arabic', 'AR');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);

  await page.waitForFunction(() => document.documentElement.dir === 'rtl', { timeout: 6000 }).catch(() => {});
  const rtlSidebar = page.locator('nav.sidebar').first();
  if (await rtlSidebar.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, rtlSidebar, { pauseMs: 1100, scroll: false });
  } else {
    await page.waitForTimeout(1000);
  }

  // 5. Restore Light theme + Sidebar + English (en) cleanly in /config
  stepLog(cursorState, 'restoring Light theme + Sidebar + English (en)');
  await page.goto(`${BASE_URL}/config?tab=appearance`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await selectTheme(page, cursorState, 0); // 0=light
  await selectNavigation(page, cursorState, 1); // 1=sidebar

  await switchLanguageInProfile(page, cursorState, 'English', 'EN');
  await page.waitForFunction(
    () =>
      document.documentElement.dir === 'ltr' &&
      document.documentElement.getAttribute('data-theme') === 'light' &&
      document.documentElement.getAttribute('data-nav-style') === 'sidebar',
    { timeout: 6000 }
  ).catch(() => {});

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '12_themes_dock_and_i18n_rtl',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
