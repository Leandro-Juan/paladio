import path from 'node:path';
import {
  BASE_URL,
  REPO_ROOT,
  createRecorderContext,
  stepLog,
  humanMove,
  humanHover,
  humanClick,
  safeHumanClick,
  humanType,
  humanScroll,
  humanDragSlider,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '03_trip_search_sliders_waypoints_custom_poi',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  markContentStart();

  const sidebar = page.getByTestId('trip-unified-sidebar');

  // 1. Open Search Tab
  stepLog(cursorState, 'opening search tab + category/sort filters');
  await safeHumanClick(page, cursorState, page.getByTestId('tab-search'), { pauseAfter: 900 });

  // Click through Category Filter Pills
  for (const cat of ['museum', 'restaurant', 'cafe', 'park', 'all']) {
    const catPill = page.getByTestId(`category-tab-${cat}`);
    if (await catPill.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, catPill, { pauseAfter: 650 });
    }
  }

  // Test Sort Dropdown
  const sortDrop = page.getByTestId('sort-order-dropdown');
  if (await sortDrop.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, sortDrop, { pauseAfter: 450 });
    const topRatedOpt = page.locator('[role="option"]').nth(1);
    if (await topRatedOpt.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, topRatedOpt, { pauseAfter: 650 });
    }
    await safeHumanClick(page, cursorState, sortDrop, { pauseAfter: 350 });
    const bestOpt = page.locator('[role="option"]').first();
    if (await bestOpt.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, bestOpt, { pauseAfter: 500 });
    }
  }

  // 2. Run multiple diverse searches
  stepLog(cursorState, 'running exact + semantic + pagination searches');
  const searchInput = page.getByTestId('unified-search-input');
  const searchBtn = page.getByTestId('unified-search-btn');

  // Search 1: Exact / landmark "Meiji"
  await humanType(page, cursorState, searchInput, 'Meiji', { pressEnter: true, pauseAfter: 1200 });
  const firstCard = sidebar.locator('[data-testid^="poi-card-"]').first();
  if (await firstCard.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, firstCard, { pauseAfter: 1000 });
    const closeArrow = page.getByTestId('poi-inspector-close-arrow');
    if (await closeArrow.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, closeArrow, { scroll: false, pauseAfter: 400 });
    }
  }

  // Search 2: Semantic natural-language RAG query
  await humanType(page, cursorState, searchInput, 'cozy kissaten coffee and jazz', { pressEnter: false, pauseAfter: 250 });
  await safeHumanClick(page, cursorState, searchBtn, { pauseAfter: 1500 });
  await humanScroll(page, cursorState, sidebar, 260, 12);

  // Search 3: "ramen" + Load More
  await humanType(page, cursorState, searchInput, 'ramen', { pressEnter: true, pauseAfter: 1200 });
  const loadMoreBtn = page.getByTestId('load-more-pois-btn');
  if (await loadMoreBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, loadMoreBtn, { pauseAfter: 1000 });
  }
  await humanScroll(page, cursorState, sidebar, -400, 12);

  // Clear search back to general Tokyo POIs
  const clearSearchBtn = sidebar.locator('button[aria-label*="Clear" i], button[aria-label*="Limpiar" i]').first();
  if (await clearSearchBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, clearSearchBtn, { pauseAfter: 400 });
    await safeHumanClick(page, cursorState, searchBtn, { pauseAfter: 1000 });
  } else {
    await humanType(page, cursorState, searchInput, '', { pressEnter: true, pauseAfter: 1000 });
  }

  // 3. Test EVERY filter & dual-range slider in Search
  stepLog(cursorState, 'testing price, duration, and star rating sliders/filters');
  // Price Range Dual Slider
  const priceBtn = sidebar.locator('button[aria-label*="Price" i]').first();
  if (await priceBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, priceBtn, { pauseAfter: 500 });
    const priceInputs = sidebar.locator('.paladio-dual-slider-container input[type="range"]');
    if ((await priceInputs.count()) >= 2) {
      await humanDragSlider(page, cursorState, priceInputs.nth(0), 15, 14);
      await humanDragSlider(page, cursorState, priceInputs.nth(1), 50, 14);
    }
    // Click presets: Free, €€, Any
    for (const label of ['Free', '€€', 'Any']) {
      const preset = sidebar.locator('.paladio-dual-slider-container').locator('..').getByRole('button', { name: label, exact: true }).first();
      if (await preset.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, preset, { pauseAfter: 450 });
      }
    }
    await safeHumanClick(page, cursorState, priceBtn, { pauseAfter: 450 });
  }

  // Duration Range Dual Slider
  const durationBtn = sidebar.locator('button[aria-label*="Duration" i]').first();
  if (await durationBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, durationBtn, { pauseAfter: 500 });
    const durInputs = sidebar.locator('.paladio-dual-slider-container input[type="range"]');
    if ((await durInputs.count()) >= 2) {
      await humanDragSlider(page, cursorState, durInputs.nth(0), 45, 14);
      await humanDragSlider(page, cursorState, durInputs.nth(1), 150, 14);
    }
    const durAny = sidebar.locator('.paladio-dual-slider-container').locator('..').getByRole('button', { name: 'Any', exact: true }).first();
    if (await durAny.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, durAny, { pauseAfter: 450 });
    }
    await safeHumanClick(page, cursorState, durationBtn, { pauseAfter: 450 });
  }

  // Star Rating Filter
  const ratingBtn = sidebar.locator('button[aria-label*="Rating" i]').first();
  if (await ratingBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, ratingBtn, { pauseAfter: 500 });
    // Click a star option and then Reset
    const resetRatingBtn = sidebar.getByRole('button', { name: /Reset/i }).first();
    const starBox = sidebar.locator('svg').locator('..').filter({ hasText: '' });
    await page.waitForTimeout(350);
    if (await resetRatingBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, resetRatingBtn, { pauseAfter: 350 });
    }
    await safeHumanClick(page, cursorState, ratingBtn, { pauseAfter: 450 });
  }

  // 4. Waypoints & Spatial Circle Filter!
  stepLog(cursorState, 'dropping spatial waypoint circle + dragging perimeter/center + radius slider');
  const speedDial = page.getByTestId('speed-dial-trigger');
  await safeHumanClick(page, cursorState, speedDial, { pauseAfter: 450 });
  await safeHumanClick(page, cursorState, page.getByTestId('speed-dial-waypoint'), { pauseAfter: 650 });

  const mapEl = page.locator('.leaflet-container').first();
  const mapBox = await mapEl.boundingBox();
  if (mapBox) {
    const dropX = mapBox.x + mapBox.width * 0.62;
    const dropY = mapBox.y + mapBox.height * 0.48;
    await humanMove(page, cursorState, dropX, dropY, 18);
    await page.mouse.click(dropX, dropY);
    await page.waitForTimeout(1000);
  }

  // Drag perimeter handle on map to resize spatial circle dynamically!
  const radiusHandle = page.locator('.paladio-radius-handle').first();
  if (await radiusHandle.isVisible().catch(() => false)) {
    const hBox = await radiusHandle.boundingBox();
    if (hBox) {
      const hx = hBox.x + hBox.width / 2;
      const hy = hBox.y + hBox.height / 2;
      await humanMove(page, cursorState, hx, hy, 16);
      await page.mouse.down();
      await humanMove(page, cursorState, hx + 110, hy, 18);
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
  }

  // Drag center waypoint pin to another district on the map!
  const centerPin = page.locator('.paladio-waypoint-center').first();
  if (await centerPin.isVisible().catch(() => false)) {
    const cBox = await centerPin.boundingBox();
    if (cBox) {
      const cx = cBox.x + cBox.width / 2;
      const cy = cBox.y + cBox.height / 2;
      await humanMove(page, cursorState, cx, cy, 16);
      await page.mouse.down();
      await humanMove(page, cursorState, cx - 90, cy + 45, 18);
      await page.mouse.up();
      await page.waitForTimeout(800);
    }
  }

  // Switch to Transit tab momentarily to showcase SpatialFilterCard slider & preset chips!
  await safeHumanClick(page, cursorState, page.getByTestId('tab-transit'), { pauseAfter: 700 });
  const spatialSlider = page.getByTestId('spatial-radius-slider');
  if (await spatialSlider.isVisible().catch(() => false)) {
    await humanDragSlider(page, cursorState, spatialSlider, 2200, 16);
    for (const preset of ['spatial-preset-300', 'spatial-preset-1500', 'spatial-preset-800']) {
      await safeHumanClick(page, cursorState, page.getByTestId(preset), { pauseAfter: 550 });
    }
    await safeHumanClick(page, cursorState, page.getByTestId('clear-spatial-circle-btn'), { pauseAfter: 650 });
  }

  // Return to Search tab & Bookmark a POI to Collection
  await safeHumanClick(page, cursorState, page.getByTestId('tab-search'), { pauseAfter: 700 });
  const bookmarkBtn = sidebar.locator('[data-testid^="search-poi-bookmark-"]').first();
  if (await bookmarkBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, bookmarkBtn, { pauseAfter: 600 });
    const colRow = page.locator('[data-testid^="menu-collection-row-"]').first();
    if (await colRow.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, colRow, { pauseAfter: 650 });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 5. Drag a POI card from Search onto Day 2 tab in Route itinerary!
  stepLog(cursorState, 'dragging search POI card onto Day 2 itinerary');
  const searchCard = sidebar.locator('[data-testid^="poi-card-"]').nth(1);
  if (await searchCard.isVisible().catch(() => false)) {
    const cBox = await searchCard.boundingBox();
    if (cBox) {
      await humanMove(page, cursorState, cBox.x + cBox.width / 2, cBox.y + cBox.height / 2, 16);
    }
    await searchCard.evaluate((el) => {
      const dt = new DataTransfer();
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await page.waitForTimeout(450);
    const day2Tab = page.getByTestId('day-tab-2');
    if (await day2Tab.isVisible().catch(() => false)) {
      const dBox = await day2Tab.boundingBox();
      if (dBox) await humanMove(page, cursorState, dBox.x + dBox.width / 2, dBox.y + dBox.height / 2, 18);
      await day2Tab.evaluate((el) => {
        const payload = window.__paladioActiveSearchPoi || window.__paladioActivePoi;
        const dt = new DataTransfer();
        if (payload) {
          const s = JSON.stringify(payload);
          dt.setData('application/paladio-poi', s);
          dt.setData('text/plain', s);
        }
        el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      });
      await page.waitForTimeout(900);
    }
    await searchCard.evaluate((el) => {
      el.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
    }).catch(() => {});
  }

  // 6. Open Search again -> Add New Custom POI!
  stepLog(cursorState, 'adding custom POI + picking location on map + toggling custom filter');
  await safeHumanClick(page, cursorState, page.getByTestId('tab-search'), { pauseAfter: 700 });
  await safeHumanClick(page, cursorState, page.getByTestId('add-new-poi-btn'), { pauseAfter: 700 });

  const addModal = page.getByTestId('add-poi-modal');
  if (await addModal.isVisible().catch(() => false)) {
    await humanType(page, cursorState, page.getByTestId('add-poi-name-input'), 'Bar Trench Ebisu', { pauseAfter: 300 });
    await humanType(page, cursorState, page.getByTestId('add-poi-description-input'), 'Craft cocktail salon in Ebisu known for vintage Japanese bitters and intimate counter seating.', { delay: 20, pauseAfter: 300 });

    // Category select -> Bar & Cocktail Lounge
    await safeHumanClick(page, cursorState, page.getByTestId('add-poi-category-select'), { pauseAfter: 400 });
    const catOpt = page.getByTestId('add-poi-category-option-bar');
    if (await catOpt.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, catOpt, { pauseAfter: 400 });
    }

    // Half-star rating 4.5
    const star45 = page.getByTestId('add-poi-star-5-half');
    if (await star45.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, star45, { pauseAfter: 400 });
    }

    // Pick Location on Map modal
    const mapPickerBtn = page.getByTestId('open-poi-map-picker-btn');
    if (await mapPickerBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, mapPickerBtn, { pauseAfter: 1000 });
      const pickerModal = page.getByTestId('poi-location-picker-modal');
      if (await pickerModal.isVisible().catch(() => false)) {
        const innerMap = pickerModal.locator('.leaflet-container').first();
        const pmBox = await innerMap.boundingBox();
        if (pmBox) {
          const px = pmBox.x + pmBox.width * 0.45;
          const py = pmBox.y + pmBox.height * 0.55;
          await humanMove(page, cursorState, px, py, 16);
          await page.mouse.click(px, py);
          await page.waitForTimeout(700);
        }
        await safeHumanClick(page, cursorState, page.getByTestId('confirm-poi-map-location-btn'), { pauseAfter: 600 });
      }
    }

    // Attach authentic cocktail bar photo via hidden input inside AddPoiModal
    const fileInput = addModal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(
      path.join(REPO_ROOT, 'scripts', 'stock_footage', 'fixtures', 'bar_trench.jpg'),
    ).catch(() => {});
    await page.waitForTimeout(600);

    await safeHumanClick(page, cursorState, page.getByTestId('submit-add-poi-btn'), { pauseAfter: 1200 });
    const dupProceed = page.getByTestId('duplicate-warning-proceed-btn');
    if (await dupProceed.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, dupProceed, { pauseAfter: 1000 });
    }
  }

  // Toggle Custom POIs Only pill
  const customToggle = page.getByTestId('toggle-custom-pois-btn');
  if (await customToggle.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, customToggle, { pauseAfter: 1000 });
    const customCard = sidebar.locator('[data-testid^="poi-card-"]').first();
    if (await customCard.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, customCard, { pauseAfter: 900 });
      const editBtn = page.getByTestId('edit-poi-btn');
      if (await editBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, editBtn, { pauseAfter: 700 });
        await safeHumanClick(page, cursorState, page.getByTestId('cancel-edit-poi-btn'), { pauseAfter: 450 });
      }
    }
    await safeHumanClick(page, cursorState, customToggle, { pauseAfter: 500 });
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '03_trip_search_sliders_waypoints_custom_poi',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
