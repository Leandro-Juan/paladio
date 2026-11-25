import fs from 'node:fs';
import {
  BASE_URL,
  API_URL,
  AUTH_STATE_PATH,
  createRecorderContext,
  stepLog,
  humanHover,
  safeHumanClick,
  humanScroll,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

function readJwtFromAuthState() {
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    throw new Error(`Missing auth state file: ${AUTH_STATE_PATH}`);
  }
  const state = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8'));
  for (const origin of state.origins || []) {
    const entry = (origin.localStorage || []).find((item) => item.name === 'paladio_token');
    if (entry?.value) return entry.value;
  }
  throw new Error('paladio_token not found in auth_state.json');
}

async function prepareTasteAndFetchPoiId(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Reset both user preferences taste vector (via DELETE) and UserTasteProfile row (via POST)
  const delRes = await fetch(`${API_URL}/api/users/me/taste`, {
    method: 'DELETE',
    headers,
  });
  if (!delRes.ok) {
    throw new Error(`Failed DELETE /api/users/me/taste: ${delRes.status} ${await delRes.text()}`);
  }

  const resetRes = await fetch(`${API_URL}/api/users/me/taste/reset`, {
    method: 'POST',
    headers,
  });
  if (!resetRes.ok) {
    throw new Error(`Failed POST /api/users/me/taste/reset: ${resetRes.status} ${await resetRes.text()}`);
  }

  // Search Tokyo POIs (note backend query param is `query`, also check `q` fallback)
  const searchUrl = `${API_URL}/api/pois/search?city=Tokyo&query=Senso&limit=10`;
  const searchRes = await fetch(searchUrl, { headers });
  if (!searchRes.ok) {
    throw new Error(`Failed GET ${searchUrl}: ${searchRes.status}`);
  }
  const data = await searchRes.json();
  const candidates = [
    ...(data.exact_match ? [data.exact_match] : []),
    ...(Array.isArray(data.results) ? data.results : []),
  ];

  // Prefer a candidate with photo + opening hours / multiple photos
  let chosenId = null;
  for (const cand of candidates) {
    if (!cand?.id) continue;
    const hasThumb = Boolean(cand.photo_url || cand.thumbnail_url);
    if (!hasThumb && candidates.some((c) => c?.photo_url || c?.thumbnail_url)) {
      continue;
    }
    try {
      const detailRes = await fetch(`${API_URL}/api/pois/${encodeURIComponent(cand.id)}`, { headers });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        if (Array.isArray(detail.photos) && detail.photos.length > 0) {
          chosenId = cand.id;
          if (detail.photos.length > 1 && Array.isArray(detail.daily_windows) && detail.daily_windows.length > 0) {
            break;
          }
        }
      }
    } catch {
      // ignore and fall back to candidate id
    }
    if (!chosenId) chosenId = cand.id;
  }

  if (!chosenId) {
    chosenId = candidates[0]?.id;
  }
  if (!chosenId) {
    throw new Error('Could not find a Tokyo POI id for Senso-ji');
  }
  return chosenId;
}

async function main() {
  const token = readJwtFromAuthState();
  const poiId = await prepareTasteAndFetchPoiId(token);

  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '10_taste_calibration_and_pois',
    useAuthState: true,
    extraInitScript: () => {
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith('paladio_taste_seed_dismissed_')) {
            window.localStorage.removeItem(key);
          }
        }
      } catch {
        // ignore storage errors
      }
    },
  });

  stepLog(cursorState, `prepared taste reset and Tokyo POI id=${poiId}`);

  // 1. Dashboard -> Showcase SeedTasteCard -> /taste-calibration
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);

  const seedCard = page.locator('aside[role="region"]').filter({ hasText: /Calibrate Taste|Seed your taste/i }).first();
  await seedCard.waitFor({ state: 'visible', timeout: 12000 });
  markContentStart();

  stepLog(cursorState, 'hovering SeedTasteCard and clicking Calibrate Taste CTA');
  await humanHover(page, cursorState, seedCard, { pauseMs: 850 });
  const calibrateCta = seedCard.getByRole('button', { name: /Calibrate Taste/i }).first();
  await safeHumanClick(page, cursorState, calibrateCta, { pauseAfter: 800 });

  await page.waitForURL(/\/taste-calibration/, { timeout: 12000 });
  await waitForAppReady(page);

  const radioGroup = page.locator('[role="radiogroup"]').first();
  await radioGroup.waitFor({ state: 'visible', timeout: 12000 });

  // 2. Hover progress bar & left track sidebar
  stepLog(cursorState, 'hovering left track sidebar and progress bar');
  const trackSidebar = page.locator('aside[aria-label="Calibration Track"], main aside').first();
  await humanHover(page, cursorState, trackSidebar, { pauseMs: 550 });
  const progressBar = page.locator('main section > div').last();
  if (await progressBar.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, progressBar, { pauseMs: 450, scroll: false });
  }

  const pickOption = async (choiceIndex) => {
    const optLabel = page.locator('[role="radiogroup"] label').nth(choiceIndex);
    await safeHumanClick(page, cursorState, optLabel, { pauseAfter: 380 });
  };
  const clickSubmit = async () => {
    const submitBtn = page.locator('button').filter({ hasText: /^Submit$|^Finish & Save$/i }).first();
    await safeHumanClick(page, cursorState, submitBtn, { pauseAfter: 520 });
  };
  const clickSkip = async () => {
    const skipBtn = page.locator('button').filter({ hasText: /^Skip$|^Skip All$/i }).first();
    await safeHumanClick(page, cursorState, skipBtn, { pauseAfter: 520 });
  };

  // Answer Q1 (A), Q2 (B), skip Q3, answer Q4 (B), Q5 (A), Q6 (C), Q7 (B)
  stepLog(cursorState, 'completing taste calibration questions with 1 skip + sidebar revisit');
  await pickOption(0); // Q1 -> A
  await clickSubmit();

  await pickOption(1); // Q2 -> B
  await clickSubmit();

  await clickSkip();   // Q3 -> Skip

  await pickOption(1); // Q4 -> B
  await clickSubmit();

  await pickOption(0); // Q5 -> A
  await clickSubmit();

  await pickOption(2); // Q6 -> C
  await clickSubmit();

  await pickOption(1); // Q7 -> B
  await clickSubmit();

  // Currently on Q8: click back to skipped Q3 via left track sidebar, answer it, then jump to Q8 and Finish & Save
  const trackItems = trackSidebar.locator('button');
  await safeHumanClick(page, cursorState, trackItems.nth(2), { pauseAfter: 650 });
  await pickOption(3); // Q3 -> D
  await clickSubmit();

  // Jump back to Q8 via left track sidebar to complete all 8/8 questions
  await safeHumanClick(page, cursorState, trackItems.nth(7), { pauseAfter: 650 });
  await pickOption(1); // Q8 -> B

  const finishBtn = page.getByRole('button', { name: /Finish & Save/i }).first();
  await safeHumanClick(page, cursorState, finishBtn, { pauseAfter: 900 });

  // Wait for redirect back to /dashboard showing calibrated HarmonicRadarWidget
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await waitForAppReady(page);

  stepLog(cursorState, 'showcasing calibrated HarmonicRadarWidget on dashboard');
  const radarCard = page.locator('text=Taste Star').first();
  if (await radarCard.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, radarCard, { pauseMs: 1200 });
  } else {
    await page.waitForTimeout(1000);
  }

  // 3. Standalone PoiDetailView (/pois/<poi_id>)
  stepLog(cursorState, `navigating to standalone PoiDetailView /pois/${poiId}`);
  await page.goto(`${BASE_URL}/pois/${encodeURIComponent(poiId)}`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);

  const poiScroller = page.locator('div.no-scrollbar').first();
  await poiScroller.waitFor({ state: 'visible', timeout: 12000 });

  // Photo carousel next/prev
  const nextPhotoBtn = page.locator('button[aria-label="Next photo"]').first();
  if (await nextPhotoBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, nextPhotoBtn, { pauseAfter: 650 });
    await safeHumanClick(page, cursorState, nextPhotoBtn, { pauseAfter: 650 });
  }
  const prevPhotoBtn = page.locator('button[aria-label="Previous photo"]').first();
  if (await prevPhotoBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, prevPhotoBtn, { pauseAfter: 650 });
  }

  // Scroll down inside PoiDetailView to show description, hours, export
  await humanScroll(page, cursorState, poiScroller, 340, 10);

  // Opening hours expand ("All Days")
  const allDaysBtn = page.getByRole('button', { name: /All Days/i }).first();
  if (await allDaysBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, allDaysBtn, { pauseAfter: 900 });
  }

  await humanScroll(page, cursorState, poiScroller, 220, 8);

  // Export menu open/close
  const exportMenuBtn = page.getByTestId('poi-export-menu-btn');
  if (await exportMenuBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, exportMenuBtn, { pauseAfter: 900 });
    const closeExportBtn = page.locator('button[aria-label="Close export menu"]').first();
    if (await closeExportBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, closeExportBtn, { pauseAfter: 550 });
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  // Back button at top of standalone POI page
  stepLog(cursorState, 'clicking standalone POI back button');
  const backBtn = page.getByRole('button', { name: /Return to Search/i }).first();
  await safeHumanClick(page, cursorState, backBtn, { pauseAfter: 900 });
  await waitForAppReady(page);

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '10_taste_calibration_and_pois',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
