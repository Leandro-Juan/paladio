import path from 'node:path';
import {
  BASE_URL,
  REPO_ROOT,
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

const BOARDING_PASS_FIXTURE = path.join(
  REPO_ROOT,
  'backend',
  'tests',
  'fixtures',
  'travel_documents',
  'boarding_passes',
  'boarding_pass_iberia_mad_svq.pdf',
);

async function adjustAndConfirmHourModal(page, cursorState, targetHourText, retryBtn = null) {
  const confirmBtn = page.getByRole('button', { name: /Confirm Time/i }).first();
  let visible = await confirmBtn.waitFor({ state: 'visible', timeout: 4500 }).then(() => true).catch(() => false);
  if (!visible && retryBtn) {
    await retryBtn.click({ force: true }).catch(() => {});
    visible = await confirmBtn.waitFor({ state: 'visible', timeout: 4500 }).then(() => true).catch(() => false);
  }
  if (!visible) return;
  const manualInput = page.getByTestId('manual-time-input');
  if (await manualInput.isVisible().catch(() => false)) {
    await humanType(page, cursorState, manualInput, targetHourText, { clear: true, pauseAfter: 350 });
  } else {
    const downBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    if (await downBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, downBtn, { pauseAfter: 300 });
    }
  }
  await safeHumanClick(page, cursorState, confirmBtn, { pauseAfter: 500 });
}

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '07_engine_trip_creation',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/engine`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  markContentStart();

  // 1. Toggle TripCreationBoxes mode cards: Blank Trip -> back to Personalized Trip
  stepLog(cursorState, 'toggling Blank Trip and Personalized Trip modes');
  const blankModeBtn = page.getByRole('button', { name: /Blank Trip/i }).first();
  const personalizedModeBtn = page.getByRole('button', { name: /Personalized Trip/i }).first();
  await safeHumanClick(page, cursorState, blankModeBtn, { pauseAfter: 850 });
  await safeHumanClick(page, cursorState, personalizedModeBtn, { pauseAfter: 700 });

  // 2. Click Upload Documents -> open DocumentUploadModal -> upload boarding pass PDF -> apply/close cleanly
  stepLog(cursorState, 'opening DocumentUploadModal and scanning boarding pass PDF');
  const uploadDocsBtn = page.getByRole('button', { name: /Upload Documents/i }).first();
  await safeHumanClick(page, cursorState, uploadDocsBtn, { pauseAfter: 700 });

  const closeDocModalBtn = page.locator('button[aria-label*="Close document upload" i]').first();
  await closeDocModalBtn.waitFor({ state: 'visible', timeout: 8000 });

  const flightFileInput = page.locator('input[type="file"]').first();
  await flightFileInput.setInputFiles(BOARDING_PASS_FIXTURE);

  const applyDocBtn = page.getByRole('button', { name: /Apply Extracted Details to Route/i }).first();
  await applyDocBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  if (await applyDocBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, applyDocBtn, { pauseAfter: 600 });
  }
  // If past-date validation kept DocumentUploadModal open, close it cleanly so form editing proceeds
  if (await closeDocModalBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, closeDocModalBtn, { pauseAfter: 550 });
  }

  // 3. Cover photo header: briefly open PhotoUploadModal & close; enter Title & Description
  stepLog(cursorState, 'opening PhotoUploadModal and entering trip title + description');
  const photoUploadBtn = page.locator('button[title="Upload your own trip photo"]').first();
  if (await photoUploadBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, photoUploadBtn, { pauseAfter: 750 });
    const closePhotoBtn = page.locator('button[title="Close"]').last();
    if (await closePhotoBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, closePhotoBtn, { pauseAfter: 500 });
    }
  }

  const titleInput = page.locator('input[placeholder*="Trip to" i]').first();
  await humanType(page, cursorState, titleInput, 'Barcelona Modernisme Weekend', { pauseAfter: 350 });

  const descInput = page.locator('input[placeholder*="Trip description" i]').first();
  await humanType(
    page,
    cursorState,
    descInput,
    'Architectural trail across Eixample, specialty coffee, and seaside tapas.',
    { pauseAfter: 400 }
  );

  // 4. RouteIntakeBar: Origin "Madrid", Destination "Barcelona", departure & arrival CustomHourPickerModal dials
  stepLog(cursorState, 'configuring Origin, Destination, and flight time dials');
  const locationInputs = page.locator('input[placeholder="Search city / airport..."]');
  const originInput = locationInputs.nth(0);
  await humanType(page, cursorState, originInput, 'Madrid', { pauseAfter: 900 });
  const originOption = page.locator('div[style*="z-index: 60"] div[style*="cursor: pointer"]').first();
  if (await originOption.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, originOption, { pauseAfter: 500 });
  } else {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
  }

  const destInput = locationInputs.nth(1);
  await humanType(page, cursorState, destInput, 'Barcelona', { pauseAfter: 950 });
  const destOption = page.locator('div[style*="z-index: 60"] div[style*="cursor: pointer"]').first();
  if (await destOption.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, destOption, { pauseAfter: 550 });
  } else {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  const depHourBtn = page.locator('button[title="Click to customize arrival time at destination"]').first();
  if (await depHourBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, depHourBtn, { pauseAfter: 550 });
    await adjustAndConfirmHourModal(page, cursorState, '09:30', depHourBtn);
  }

  const retHourBtn = page.locator('button[title="Click to customize return / departure time"]').first();
  if (await retHourBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, retHourBtn, { pauseAfter: 550 });
    await adjustAndConfirmHourModal(page, cursorState, '20:15', retHourBtn);
  }

  // 5. PaladioDateRangePicker: navigate forward to April 2027 and click 2027-04-16 to 2027-04-18
  stepLog(cursorState, 'selecting April 2027 dates in PaladioDateRangePicker');
  const nextMonthBtn = page.locator('button[aria-label="Next month"]').first();
  await nextMonthBtn.scrollIntoViewIfNeeded().catch(() => {});
  for (let i = 0; i < 12; i++) {
    const aprilVisible = await page.getByText('April 2027', { exact: false }).first().isVisible().catch(() => false);
    if (aprilVisible) break;
    await safeHumanClick(page, cursorState, nextMonthBtn, { pauseAfter: 250 });
  }

  const startDayBtn = page.locator('button[aria-label*="2027-04-16"]').first();
  const endDayBtn = page.locator('button[aria-label*="2027-04-18"]').first();
  if ((await startDayBtn.isVisible().catch(() => false)) && (await endDayBtn.isVisible().catch(() => false))) {
    await safeHumanClick(page, cursorState, startDayBtn, { pauseAfter: 450 });
    await safeHumanClick(page, cursorState, endDayBtn, { pauseAfter: 600 });
  } else {
    const openAprilBtns = page.locator('button[aria-label^="2027-04-"]');
    const count = await openAprilBtns.count();
    if (count >= 3) {
      await safeHumanClick(page, cursorState, openAprilBtns.nth(Math.min(14, count - 3)), { pauseAfter: 450 });
      await safeHumanClick(page, cursorState, openAprilBtns.nth(Math.min(16, count - 1)), { pauseAfter: 600 });
    }
  }

  const pickerOverlapProceed = page.getByRole('button', { name: /PROCEED ANYWAY/i }).first();
  if (await pickerOverlapProceed.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, pickerOverlapProceed, { pauseAfter: 450 });
  }

  // 6. HotelStayAnchorBar: search "Cotton House", open HotelMapModal, drop pin, confirm + check-in/out time dials
  stepLog(cursorState, 'configuring HotelStayAnchorBar, HotelMapModal pin, and check-in/out times');
  const hotelSearchInput = page.locator('input[placeholder*="Search hotel by name" i]').first();
  await hotelSearchInput.scrollIntoViewIfNeeded().catch(() => {});
  await humanType(page, cursorState, hotelSearchInput, 'Cotton House', { pauseAfter: 900 });
  const hotelDropdownRow = page.locator('div[style*="cursor: pointer"]').filter({ hasText: /Cotton House/i }).first();
  if (await hotelDropdownRow.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, hotelDropdownRow, { pauseAfter: 500 });
  }

  const locateMapBtn = page.locator('button[title="Locate hotel or stay on map"]').first();
  if (await locateMapBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, locateMapBtn, { pauseAfter: 700 });
    const modalMap = page.locator('.leaflet-container').first();
    await modalMap.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-tile-loaded').length > 0,
      { timeout: 8000 }
    ).catch(() => {});
    await page.waitForTimeout(800);

    const mapBox = await modalMap.boundingBox().catch(() => null);
    if (mapBox) {
      const targetX = mapBox.x + mapBox.width * 0.52;
      const targetY = mapBox.y + mapBox.height * 0.48;
      await humanMove(page, cursorState, targetX, targetY);
      await page.waitForTimeout(150);
      await page.mouse.click(targetX, targetY);
      await page.waitForTimeout(700);
    }

    const setAnchorBtn = page.getByRole('button', { name: /Set Stay Anchor/i }).first();
    if (await setAnchorBtn.isEnabled().catch(() => false)) {
      await safeHumanClick(page, cursorState, setAnchorBtn, { pauseAfter: 600 });
    } else {
      const cancelMapBtn = page.getByRole('button', { name: /^Cancel$/i }).last();
      if (await cancelMapBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, cancelMapBtn, { pauseAfter: 450 });
      }
    }
  }

  const checkInTimeBtn = page.getByTestId('hotel-checkin-time-btn');
  if (await checkInTimeBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, checkInTimeBtn, { pauseAfter: 500 });
    await adjustAndConfirmHourModal(page, cursorState, '15:00');
  }
  const checkOutTimeBtn = page.getByTestId('hotel-checkout-time-btn');
  if (await checkOutTimeBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, checkOutTimeBtn, { pauseAfter: 500 });
    await adjustAndConfirmHourModal(page, cursorState, '11:00');
  }

  // 7. Budget Envelope: type 1400, open CurrencyWheelPicker, spin & confirm EUR
  stepLog(cursorState, 'setting budget envelope 1400 and spinning CurrencyWheelPicker for EUR');
  const budgetInput = page.locator('input[type="number"][placeholder="1500"]').first();
  await humanType(page, cursorState, budgetInput, '1400', { pauseAfter: 400 });

  const currencyDialBtn = page.locator('button[title="Change currency with dynamic spin dial"]').first();
  if (await currencyDialBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, currencyDialBtn, { pauseAfter: 600 });
    const wheelDialog = page.getByRole('dialog', { name: /Select Currency/i }).first();
    if (await wheelDialog.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, wheelDialog, { pauseMs: 250 });
      await page.mouse.wheel(0, 140);
      await page.waitForTimeout(220);
      await page.mouse.wheel(0, -140);
      await page.waitForTimeout(250);

      const curSearch = wheelDialog.locator('input[placeholder*="Search" i]').first();
      if (await curSearch.isVisible().catch(() => false)) {
        await humanType(page, cursorState, curSearch, 'EUR', { pauseAfter: 400 });
      }
      const confirmCurBtn = wheelDialog.getByRole('button', { name: /Use .*EUR/i }).first();
      await safeHumanClick(page, cursorState, confirmCurBtn, { pauseAfter: 500 });
    }
  }

  // 8. ParticipantsManager: filter/add irene + type & add guest "Elena"
  stepLog(cursorState, 'adding participant irene and guest Elena');
  const addParticipantBtn = page.getByRole('button', { name: /Add Participant/i }).first();
  if (await addParticipantBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, addParticipantBtn, { pauseAfter: 650 });

    const filterUsersInput = page.locator('input[placeholder="Filter users by name or email..."]').first();
    if (await filterUsersInput.isVisible().catch(() => false)) {
      await humanType(page, cursorState, filterUsersInput, 'irene', { pauseAfter: 450 });
    }
    const ireneRow = page.locator('div[style*="cursor: pointer"]').filter({ hasText: /irene/i }).first();
    if (await ireneRow.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, ireneRow, { pauseAfter: 450 });
    }

    const guestInput = page.locator('input[placeholder*="Enter traveler name" i]').first();
    if (await guestInput.isVisible().catch(() => false)) {
      await humanType(page, cursorState, guestInput, 'Elena', { pauseAfter: 350 });
      const addGuestBtn = page.getByRole('button', { name: /Add Guest/i }).first();
      await safeHumanClick(page, cursorState, addGuestBtn, { pauseAfter: 500 });
    }

    const doneParticipantsBtn = page.getByRole('button', { name: /^Done$/i }).first();
    if (await doneParticipantsBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, doneParticipantsBtn, { pauseAfter: 500 });
    }
  }

  // 9. Personalized Prompt Box: click 1-2 Preset Prompt chips, type prompt
  stepLog(cursorState, 'selecting preset chips and typing personalized travel prompt');
  const archChip = page.getByRole('button', { name: /Architecture & Art/i }).first();
  if (await archChip.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, archChip, { pauseAfter: 500 });
  }
  const hiddenChip = page.getByRole('button', { name: /Hidden Gems/i }).first();
  if (await hiddenChip.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, hiddenChip, { pauseAfter: 500 });
  }

  const promptArea = page.locator('textarea[placeholder*="Describe your travel vision" i]').first();
  await humanScroll(page, cursorState, promptArea, 180, 6);
  await humanType(
    page,
    cursorState,
    promptArea,
    'Gaudí architecture, hidden Gothic Quarter bars, and relaxed specialty cafes.',
    { clear: true, pauseAfter: 550 }
  );

  // 10. Click Generate Trip -> capture live ThinkingScreen + handle Overlap/Verification modals -> wait up to 75s
  stepLog(cursorState, 'clicking Generate Sovereign Trip Plan and monitoring ThinkingScreen');
  const generateBtn = page.getByRole('button', { name: /Generate Sovereign Trip Plan/i }).first();
  await safeHumanClick(page, cursorState, generateBtn, { pauseAfter: 900 });

  const deadline = Date.now() + 75000;
  while (Date.now() < deadline) {
    if (/\/trips\/[^/]+/.test(page.url())) {
      stepLog(cursorState, `navigated to generated trip workspace: ${page.url()}`);
      await waitForAppReady(page, { waitForMap: true }).catch(() => {});
      await page.waitForTimeout(2000);
      break;
    }

    const proceedBtn = page.getByRole('button', { name: /PROCEED ANYWAY/i }).first();
    if (await proceedBtn.isVisible().catch(() => false)) {
      stepLog(cursorState, 'confirming overlap warning modal');
      await safeHumanClick(page, cursorState, proceedBtn, { pauseAfter: 500 });
      continue;
    }

    const confirmVerifyBtn = page.getByRole('button', { name: /CONFIRM & OPTIMIZE/i }).first();
    if (await confirmVerifyBtn.isVisible().catch(() => false)) {
      stepLog(cursorState, 'confirming constraints verification modal');
      await safeHumanClick(page, cursorState, confirmVerifyBtn, { pauseAfter: 500 });
      continue;
    }

    const errorBackBtn = page.getByRole('button', { name: /Back to Trip Editor|Dismiss & Edit/i }).first();
    if (await errorBackBtn.isVisible().catch(() => false)) {
      stepLog(cursorState, 'ThinkingScreen reported an error state; stopping wait cleanly');
      await page.waitForTimeout(1000);
      break;
    }

    await page.waitForTimeout(500);
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '07_engine_trip_creation',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
