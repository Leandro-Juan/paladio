import {
  BASE_URL,
  createRecorderContext,
  stepLog,
  humanMove,
  humanHover,
  safeHumanClick,
  humanScroll,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

async function openVaultTripByIdOrMarker(page, cursorState, targetTripId, countryHint) {
  // Optionally fly map to country using stats panel before collapsing it
  const expandBtn = page.getByTestId('stats-expand-btn');
  if (await expandBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, expandBtn, { pauseAfter: 550 });
  }
  const countryBtn = page.locator(`button[title*="Focus map on ${countryHint}" i], button[title*="${countryHint}" i]`).first();
  if (await countryBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, countryBtn, { pauseAfter: 1400 });
  }

  // Collapse stats drawer so map markers & deployed-trip-card are unobstructed
  const collapseBtn = page.getByTestId('stats-collapse-btn');
  if (await collapseBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, collapseBtn, { pauseAfter: 550 });
  }

  const markers = page.locator('.paladio-map-marker');
  const markerCount = await markers.count();
  let navigated = false;

  for (let i = 0; i < markerCount; i++) {
    const marker = markers.nth(i);
    if (!(await marker.isVisible().catch(() => false))) continue;
    await safeHumanClick(page, cursorState, marker, { pauseAfter: 750, force: true });

    const card = page.getByTestId('deployed-trip-card');
    if (await card.isVisible().catch(() => false)) {
      const seeBtn = page.getByTestId('deployed-trip-see-btn');
      const href = (await seeBtn.getAttribute('href').catch(() => '')) || '';
      if (href.includes(targetTripId)) {
        await humanHover(page, cursorState, card, { pauseMs: 450, scroll: false });
        await safeHumanClick(page, cursorState, seeBtn, { pauseAfter: 1000 });
        await page.waitForURL(new RegExp(targetTripId), { timeout: 8000 }).catch(() => {});
        navigated = true;
        break;
      }
      const closeBtn = page.getByTestId('deployed-trip-close-btn');
      if (await closeBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closeBtn, { pauseAfter: 350 });
      }
    }
  }

  if (!navigated) {
    await page.goto(`${BASE_URL}/vault/${targetTripId}`, { waitUntil: 'domcontentloaded' });
  }
  await waitForAppReady(page, { waitForMap: true });
}

async function sweepDayDotsAndTabs(page, cursorState, { includePhotosLightbox = true } = {}) {
  const mainArea = page.locator('main').first();

  // Sweep all PastTripDayDots (All + Day 1..N)
  stepLog(cursorState, 'sweeping PastTripDayDots');
  const dayTablist = page.getByRole('tablist', { name: /Filter itinerary by day/i }).first();
  if (await dayTablist.isVisible().catch(() => false)) {
    const dots = dayTablist.getByRole('tab');
    const dotCount = await dots.count();
    for (let i = 0; i < dotCount; i++) {
      await safeHumanClick(page, cursorState, dots.nth(i), { pauseAfter: 750 });
    }
    if (dotCount > 0) {
      await safeHumanClick(page, cursorState, dots.nth(0), { pauseAfter: 550 });
    }
  }

  // Sweep all 4 PastTripTabs: About, Itinerary, Costs, Photos
  stepLog(cursorState, 'sweeping all 4 PastTripTabs');
  const aboutTab = page.getByRole('tab', { name: /^About$/i }).first();
  if (await aboutTab.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, aboutTab, { pauseAfter: 750 });
    const summaryPanel = page.locator('main aside').first();
    if (await summaryPanel.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, summaryPanel, { pauseMs: 450, scroll: false });
    }
  }

  const itineraryTab = page.getByRole('tab', { name: /^Itinerary$/i }).first();
  if (await itineraryTab.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, itineraryTab, { pauseAfter: 850 });
    await humanScroll(page, cursorState, mainArea, 260);
    await page.waitForTimeout(350);
    await humanScroll(page, cursorState, mainArea, -260);
  }

  const costsTab = page.getByRole('tab', { name: /^Costs$/i }).first();
  if (await costsTab.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, costsTab, { pauseAfter: 900 });
    await humanScroll(page, cursorState, mainArea, 260);
    await page.waitForTimeout(400);
    await humanScroll(page, cursorState, mainArea, -260);
  }

  const photosTab = page.getByRole('tab', { name: /^Photos$/i }).first();
  if (await photosTab.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, photosTab, { pauseAfter: 900 });
    if (includePhotosLightbox) {
      const firstPhoto = page.locator('.photo-mosaic-card').first();
      if (await firstPhoto.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, firstPhoto, { pauseAfter: 850 });
        const nextBtn = page.locator('button[title*="Next" i]').first();
        if (await nextBtn.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, nextBtn, { pauseAfter: 800 });
        }
        const closeBtn = page.locator('button[title*="Close" i]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, closeBtn, { pauseAfter: 500 });
        } else {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(350);
        }
      }
    }
  }
}

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '09_vault_world_map_stats_recaps',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/vault`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  markContentStart();

  // 1. Showcase full-viewport VaultMap with highlighted visited countries
  stepLog(cursorState, 'showcasing full-viewport VaultMap');
  const collapseInit = page.getByTestId('stats-collapse-btn');
  if (await collapseInit.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, collapseInit, { pauseAfter: 950 });
  }
  const mapEl = page.locator('.leaflet-container').first();
  const mapBox = await mapEl.boundingBox();
  if (mapBox) {
    const cx = mapBox.x + mapBox.width * 0.55;
    const cy = mapBox.y + mapBox.height * 0.45;
    await humanMove(page, cursorState, cx, cy);
    await page.waitForTimeout(600);
  }

  // 2. Expand/inspect VaultStatsTab, hover stats-earth-gauge, fly across Europe, test collapse/expand
  stepLog(cursorState, 'inspecting VaultStatsTab & flying across visited countries');
  const expandBtn = page.getByTestId('stats-expand-btn');
  if (await expandBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, expandBtn, { pauseAfter: 700 });
  }

  const earthGauge = page.getByTestId('stats-earth-gauge');
  if (await earthGauge.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, earthGauge, { pauseMs: 650 });
  }

  const countryButtons = page.locator('button[title*="Focus map on" i]');
  const cBtnCount = await countryButtons.count();
  for (let i = 0; i < Math.min(cBtnCount, 3); i++) {
    await safeHumanClick(page, cursorState, countryButtons.nth(i), { pauseAfter: 1350 });
  }

  // Test collapse & expand buttons
  const collapseBtn = page.getByTestId('stats-collapse-btn');
  if (await collapseBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, collapseBtn, { pauseAfter: 650 });
    if (await expandBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, expandBtn, { pauseAfter: 650 });
    }
  }

  // 3. Select Paris marker -> deployed-trip-card -> deployed-trip-see-btn -> /vault/demo-trip-paris-vault
  stepLog(cursorState, 'opening Paris recap (/vault/demo-trip-paris-vault)');
  await openVaultTripByIdOrMarker(page, cursorState, 'demo-trip-paris-vault', 'France');

  // 4. Inside Paris Recap
  stepLog(cursorState, 'inspecting Paris left column (Profile, Ticket+Barcode, Participants)');
  const leftAside = page.locator('.vault-recap-grid > aside').first();
  if (await leftAside.isVisible().catch(() => false)) {
    const cards = leftAside.locator('> div');
    const cardCount = await cards.count();
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      await humanHover(page, cursorState, cards.nth(i), { pauseMs: 500 });
    }
  }

  // Open Share button (TripShareModal), toggle a day pill, close cleanly
  stepLog(cursorState, 'opening TripShareModal & toggling day pill');
  const shareBtn = page.getByRole('button', { name: /Share Expedition/i }).first();
  if (await shareBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, shareBtn, { pauseAfter: 750 });
    const shareDialog = page.locator('div[role="dialog"][aria-labelledby="share-modal-title"]').first();
    if (await shareDialog.isVisible().catch(() => false)) {
      const dayPill = shareDialog.getByRole('button', { name: /^Day 1$/i }).first();
      if (await dayPill.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, dayPill, { pauseAfter: 650 });
      }
      const closeShareBtn = shareDialog.getByRole('button', { name: /Close share dialog/i }).first();
      if (await closeShareBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, closeShareBtn, { pauseAfter: 500 });
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
      }
    }
  }

  await sweepDayDotsAndTabs(page, cursorState, { includePhotosLightbox: true });

  // 5. Navigate back to /vault, select Zurich (demo-trip-zurich-vault), sweep DayDots & Tabs
  stepLog(cursorState, 'returning to /vault & opening Zurich recap');
  const backToVaultLink = page.locator('a[href="/vault"]').first();
  if (await backToVaultLink.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, backToVaultLink, { pauseAfter: 900 });
  } else {
    const backMapBtn = page.getByRole('button', { name: /Back to Vault/i }).first();
    if (await backMapBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, backMapBtn, { pauseAfter: 900 });
    } else {
      await page.goto(`${BASE_URL}/vault`, { waitUntil: 'domcontentloaded' });
    }
  }
  await waitForAppReady(page, { waitForMap: true });

  await openVaultTripByIdOrMarker(page, cursorState, 'demo-trip-zurich-vault', 'Switzerland');
  await sweepDayDotsAndTabs(page, cursorState, { includePhotosLightbox: true });

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '09_vault_world_map_stats_recaps',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
