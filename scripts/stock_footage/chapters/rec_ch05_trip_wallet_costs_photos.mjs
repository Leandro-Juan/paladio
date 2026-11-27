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
  humanDragSlider,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

const LUFTHANSA_PKPASS_PATH = path.join(
  REPO_ROOT,
  'backend',
  'tests',
  'fixtures',
  'travel_documents',
  'boarding_passes',
  'boarding_pass_lufthansa.pkpass',
);

async function openTicketDetailByText(page, cursorState, textRegex) {
  const card = page.locator('article').filter({ hasText: textRegex }).first();
  if (!(await card.isVisible().catch(() => false))) return false;
  await humanHover(page, cursorState, card, { pauseMs: 250 });
  const optionsBtn = card.locator('button[aria-label="Ticket options"]').first();
  if (!(await safeHumanClick(page, cursorState, optionsBtn, { pauseAfter: 350 }))) return false;
  const viewPassBtn = card.getByRole('button', { name: /View Pass/i }).first();
  if (!(await safeHumanClick(page, cursorState, viewPassBtn, { pauseAfter: 900 }))) return false;
  return true;
}

async function closeTicketDetailModal(page, cursorState) {
  const closeBtn = page.locator('[role="dialog"] button[aria-label*="Close fullscreen" i]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, closeBtn, { pauseAfter: 450 });
  } else {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

async function selectCurrencyFromWheel(page, cursorState, queryText) {
  const wheelDialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[placeholder*="currency" i]') }).last();
  await wheelDialog.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  if (!(await wheelDialog.isVisible().catch(() => false))) return false;

  const searchInput = wheelDialog.locator('input[type="text"]').first();
  await humanType(page, cursorState, searchInput, queryText, { delay: 45, pauseAfter: 550 });

  const confirmBtn = wheelDialog.locator('button').filter({ hasText: /^Use /i }).first();
  if (await confirmBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, confirmBtn, { pauseAfter: 550 });
    return true;
  }

  const closeBtn = wheelDialog.locator('button[aria-label="Close"]').first();
  await safeHumanClick(page, cursorState, closeBtn, { pauseAfter: 350 });
  return false;
}

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '05_trip_wallet_costs_photos',
    useAuthState: true,
  });

  // Preserve unused shared import reference cleanly if linting checks
  void humanDragSlider;

  await page.goto(`${BASE_URL}/trips/demo-trip-tokyo-active`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { waitForMap: true });
  markContentStart();

  const tabPane = page.locator('.animate-tab-pane').first();

  // === 1. WALLET TAB ===
  stepLog(cursorState, 'opening Wallet tab');
  await safeHumanClick(page, cursorState, page.locator('button[aria-label="Wallet"]').first(), { pauseAfter: 1000 });

  // Hover WalletSummaryBar counters & WalletUpNext card
  stepLog(cursorState, 'hovering WalletSummaryBar counters & WalletUpNext');
  for (const titleAttr of ['Flights', 'Stays & Access Codes', 'Attraction Passes', 'Transit Passes']) {
    const counter = page.locator(`span[data-tooltip="${titleAttr}"], span[title="${titleAttr}"]`).first();
    if (await counter.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, counter, { pauseMs: 240 });
    }
  }
  const upNextCard = page.locator('aside[aria-label="Next upcoming credential"]').first();
  if (await upNextCard.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, upNextCard, { pauseMs: 450 });
  }

  // Click TransitAdvisorySection Add Day Pass button if visible
  const advisoryCard = page.getByTestId('transit-advisory-card').first();
  if (await advisoryCard.isVisible().catch(() => false)) {
    stepLog(cursorState, 'clicking TransitAdvisorySection Add Day Pass');
    await humanHover(page, cursorState, advisoryCard, { pauseMs: 350 });
    const addDayPassBtn = advisoryCard.getByRole('button', { name: /Add Day Pass/i }).first();
    if (await addDayPassBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, addDayPassBtn, { pauseAfter: 850 });
    }
    await humanScroll(page, cursorState, tabPane, -600, 10);
  }

  // Click ALL 6 WalletFilterBar category tabs then back to All
  stepLog(cursorState, 'cycling all 6 WalletFilterBar category tabs + search');
  const filterTablist = page.locator('[role="tablist"][aria-label="Filter tickets by category"]').first();
  const filterTabs = filterTablist.locator('[role="tab"]');
  const tabCount = await filterTabs.count();
  for (let i = 0; i < tabCount; i++) {
    await safeHumanClick(page, cursorState, filterTabs.nth(i), { pauseAfter: 450 });
  }
  if (tabCount > 0) {
    await safeHumanClick(page, cursorState, filterTabs.nth(0), { pauseAfter: 500 });
  }

  // Type search query "ANA" and clear search
  const walletSearch = page.locator('input[aria-label="Search tickets"]').first();
  if (await walletSearch.isVisible().catch(() => false)) {
    await humanType(page, cursorState, walletSearch, 'ANA', { pauseAfter: 700 });
    const clearSearchBtn = page.locator('button[aria-label="Clear search"]').first();
    if (await clearSearchBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, clearSearchBtn, { pauseAfter: 500 });
    } else {
      await humanType(page, cursorState, walletSearch, '', { pauseAfter: 400 });
    }
  }

  // Open TicketDetailModal on Flight ANA NH 206 (Aztec barcode), step Next, then Hotel TRUNK(HOTEL), Transit, Attraction
  stepLog(cursorState, 'inspecting TicketDetailModal barcodes & hotel secrets');
  if (await openTicketDetailByText(page, cursorState, /ANA\s*NH\s*206|ANA/i)) {
    await page.waitForTimeout(1100);
    const nextTicketBtn = page.locator('[role="dialog"] button').filter({ hasText: /^NEXT/i }).first();
    if (await nextTicketBtn.isVisible().catch(() => false) && await nextTicketBtn.isEnabled().catch(() => false)) {
      await safeHumanClick(page, cursorState, nextTicketBtn, { pauseAfter: 850 });
    }
    await closeTicketDetailModal(page, cursorState);
  }

  // Hotel TRUNK(HOTEL): reveal secret + copy on card and inside detail modal
  const trunkCard = page.locator('article').filter({ hasText: /TRUNK\(HOTEL\)|TRUNK/i }).first();
  if (await trunkCard.isVisible().catch(() => false)) {
    const revealBtn = trunkCard.locator('button[aria-label*="Reveal" i]').first();
    if (await revealBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, revealBtn, { pauseAfter: 550 });
    }
    const copyBtn = trunkCard.locator('button[aria-label*="Copy" i]').first();
    if (await copyBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, copyBtn, { pauseAfter: 450 });
    }
  }
  if (await openTicketDetailByText(page, cursorState, /TRUNK\(HOTEL\)|TRUNK/i)) {
    const modalReveal = page.locator('[role="dialog"] button[aria-label*="Reveal" i]').first();
    if (await modalReveal.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, modalReveal, { pauseAfter: 500 });
    }
    const modalCopy = page.locator('[role="dialog"] button[aria-label*="Copy" i]').first();
    if (await modalCopy.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, modalCopy, { pauseAfter: 400 });
    }
    await page.waitForTimeout(500);
    await closeTicketDetailModal(page, cursorState);
  }

  // Transit (Tokyo Subway)
  if (await openTicketDetailByText(page, cursorState, /Tokyo Subway/i)) {
    await page.waitForTimeout(850);
    await closeTicketDetailModal(page, cursorState);
  }

  // Attraction (Sensō-ji)
  if (await openTicketDetailByText(page, cursorState, /Sens[oō]-ji/i)) {
    await page.waitForTimeout(850);
    await closeTicketDetailModal(page, cursorState);
  }

  // Upload real pkpass fixture into WalletDropzone -> ScanReviewModal
  stepLog(cursorState, 'uploading boarding_pass_lufthansa.pkpass into WalletDropzone');
  const dropzone = page.locator('[role="button"][aria-label*="Upload ticket documents" i]').first();
  if (await dropzone.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, dropzone, { pauseMs: 350 });
    const fileInput = dropzone.locator('input[type="file"]').first();
    await fileInput.setInputFiles(LUFTHANSA_PKPASS_PATH);

    const scanDialog = page.locator('[role="dialog"]').filter({ has: page.locator('button[aria-label="Discard scan"]') }).first();
    await scanDialog.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await scanDialog.isVisible().catch(() => false)) {
      await page.waitForTimeout(1100);
      const discardBtn = scanDialog.locator('button[aria-label="Discard scan"]').first();
      await safeHumanClick(page, cursorState, discardBtn, { pauseAfter: 500 });
    }
  }

  // Click + ADD PASS -> TicketFormModal -> switch ticket type pills -> scroll fields -> close -> SYNC ITINERARY
  stepLog(cursorState, 'opening + ADD PASS TicketFormModal & clicking SYNC ITINERARY');
  const addPassBtn = page.locator('button[aria-label="Manually add new ticket"]').first();
  if (await safeHumanClick(page, cursorState, addPassBtn, { pauseAfter: 650 })) {
    const formDialog = page.locator('[role="dialog"]').filter({ has: page.locator('button[aria-label="Close modal"]') }).first();
    if (await formDialog.isVisible().catch(() => false)) {
      for (const pillName of [/Stays & Keys/i, /Attractions/i, /Transit/i, /Other/i, /Flights/i]) {
        const pill = formDialog.getByRole('button', { name: pillName }).first();
        if (await pill.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, pill, { pauseAfter: 350 });
        }
      }
      const formBody = formDialog.locator('form').first();
      if (await formBody.isVisible().catch(() => false)) {
        await humanScroll(page, cursorState, formBody, 240, 10);
        await humanScroll(page, cursorState, formBody, -240, 8);
      }
      await safeHumanClick(page, cursorState, formDialog.locator('button[aria-label="Close modal"]').first(), { pauseAfter: 450 });
    }
  }

  const syncBtn = page.locator('button[aria-label="Sync tickets from itinerary"]').first();
  if (await syncBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, syncBtn, { pauseAfter: 1100 });
    await page.waitForTimeout(400);
  }

  // === 2. COSTS TAB ===
  stepLog(cursorState, 'opening Costs tab');
  await safeHumanClick(page, cursorState, page.locator('button[aria-label="Costs"]').first(), { pauseAfter: 1000 });

  // Hover Spend Pace card, switch right card to FX Converter, spin CurrencyWheelPicker
  const paceCardTitle = page.getByText(/Daily Spending Pace/i).first();
  if (await paceCardTitle.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, paceCardTitle, { pauseMs: 450 });
  }

  stepLog(cursorState, 'switching CostsSummaryCards to Live FX Converter & CurrencyWheelPicker');
  const fxToggleBtn = page.getByTestId('costs-fx-toggle-btn').first();
  if (await safeHumanClick(page, cursorState, fxToggleBtn, { pauseAfter: 700 })) {
    const dialBtn = page.getByTestId('costs-currency-dial-btn').first();
    if (await safeHumanClick(page, cursorState, dialBtn, { pauseAfter: 600 })) {
      await selectCurrencyFromWheel(page, cursorState, 'JPY');
    }
    if (await safeHumanClick(page, cursorState, dialBtn, { pauseAfter: 600 })) {
      await selectCurrencyFromWheel(page, cursorState, 'EUR');
    }
    const fxAmountInput = page.locator('input[aria-label="Currency amount to convert"]').first();
    if (await fxAmountInput.isVisible().catch(() => false)) {
      await humanType(page, cursorState, fxAmountInput, '250', { pauseAfter: 600 });
    }
  }

  // CostsFilterToolbar: search, Category CustomSelect, Day CustomSelect, scope pills
  stepLog(cursorState, 'interacting with CostsFilterToolbar');
  const costsSearch = page.locator('input[placeholder="Search expenses..."]').first();
  if (await costsSearch.isVisible().catch(() => false)) {
    await humanType(page, cursorState, costsSearch, 'Tokyo', { pauseAfter: 600 });
    await humanType(page, cursorState, costsSearch, '', { pauseAfter: 450 });
  }

  const catSelectBtn = page.locator('button[aria-label="Filter by category"]').first();
  if (await safeHumanClick(page, cursorState, catSelectBtn, { pauseAfter: 450 })) {
    const catFoodOpt = page.locator('[role="listbox"] [role="option"]').filter({ hasText: /Food/i }).first();
    if (await catFoodOpt.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, catFoodOpt, { pauseAfter: 500 });
    }
    if (await safeHumanClick(page, cursorState, catSelectBtn, { pauseAfter: 400 })) {
      const catAllOpt = page.locator('[role="listbox"] [role="option"]').first();
      await safeHumanClick(page, cursorState, catAllOpt, { pauseAfter: 450 });
    }
  }

  const daySelectBtn = page.locator('button[aria-label="Filter by day"]').first();
  if (await daySelectBtn.isVisible().catch(() => false)) {
    if (await safeHumanClick(page, cursorState, daySelectBtn, { pauseAfter: 450 })) {
      const day1Opt = page.locator('[role="listbox"] [role="option"]').nth(1);
      if (await day1Opt.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, day1Opt, { pauseAfter: 500 });
      }
      if (await safeHumanClick(page, cursorState, daySelectBtn, { pauseAfter: 400 })) {
        const dayAllOpt = page.locator('[role="listbox"] [role="option"]').first();
        await safeHumanClick(page, cursorState, dayAllOpt, { pauseAfter: 450 });
      }
    }
  }

  for (const pillLabel of [/^Paid by me$/i, /^I'm owed$/i, /^All$/i]) {
    const pill = page.getByRole('button', { name: pillLabel }).first();
    if (await pill.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, pill, { pauseAfter: 450 });
    }
  }

  // Hover CategoryBreakdownWidget donut slices, inspect BalancesWidget & SettleUpWidget toggle
  stepLog(cursorState, 'hovering CategoryBreakdownWidget slices & toggling SettleUpWidget');
  await humanScroll(page, cursorState, tabPane, 340, 12);
  const slices = page.locator('[role="graphics-symbol"]');
  const sliceCount = Math.min(3, await slices.count());
  for (let i = 0; i < sliceCount; i++) {
    await humanHover(page, cursorState, slices.nth(i), { pauseMs: 320 });
  }

  const balancesHeading = page.getByText(/^BALANCES$/i).first();
  if (await balancesHeading.isVisible().catch(() => false)) {
    await humanHover(page, cursorState, balancesHeading, { pauseMs: 350 });
  }

  const simplifyToggle = page.locator('button[title*="debts" i]').first();
  if (await simplifyToggle.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, simplifyToggle, { pauseAfter: 600 });
    await safeHumanClick(page, cursorState, simplifyToggle, { pauseAfter: 500 });
  }

  // Scroll back up to header action buttons for Add Expense & Settle Up
  await humanScroll(page, cursorState, tabPane, -340, 10);

  // Add Expense -> ExpenseModal
  stepLog(cursorState, 'adding expense "Omakase Sushi Counter" via ExpenseModal');
  const addExpenseBtn = page.getByRole('button', { name: /Add expense/i }).first();
  if (await safeHumanClick(page, cursorState, addExpenseBtn, { pauseAfter: 650 })) {
    const expenseDialog = page.locator('[role="dialog"]').filter({ hasText: /Add Trip Expense/i }).first();
    if (await expenseDialog.isVisible().catch(() => false)) {
      const descInput = expenseDialog.locator('input[type="text"]').first();
      await humanType(page, cursorState, descInput, 'Omakase Sushi Counter', { pauseAfter: 400 });

      const amtInput = expenseDialog.locator('input[type="number"]').first();
      await humanType(page, cursorState, amtInput, '185', { pauseAfter: 450 });

      const payCurrencyBtn = expenseDialog.locator('button[title*="currency" i]').first();
      if (await safeHumanClick(page, cursorState, payCurrencyBtn, { pauseAfter: 550 })) {
        await selectCurrencyFromWheel(page, cursorState, 'EUR');
      }

      const customSplitBtn = expenseDialog.getByRole('button', { name: /Custom Amounts|Custom/i }).first();
      const equalSplitBtn = expenseDialog.getByRole('button', { name: /Split Equally|Equal/i }).first();
      if (await customSplitBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, customSplitBtn, { pauseAfter: 450 });
      }
      if (await equalSplitBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, equalSplitBtn, { pauseAfter: 450 });
      }

      const saveExpenseBtn = expenseDialog.locator('button[type="submit"]').first();
      await safeHumanClick(page, cursorState, saveExpenseBtn, { pauseAfter: 1100 });
    }
  }

  // Settle up -> SettlementModal -> inspect & cancel
  stepLog(cursorState, 'opening SettlementModal & closing cleanly');
  const settleUpBtn = page.getByRole('button', { name: /Settle up/i }).first();
  if (await safeHumanClick(page, cursorState, settleUpBtn, { pauseAfter: 750 })) {
    const settleDialog = page.locator('[role="dialog"]').filter({ hasText: /Record Payment/i }).first();
    if (await settleDialog.isVisible().catch(() => false)) {
      const amtInput = settleDialog.locator('input[type="number"]').first();
      if (await amtInput.isVisible().catch(() => false)) {
        await humanHover(page, cursorState, amtInput, { pauseMs: 400 });
      }
      const cancelBtn = settleDialog.getByRole('button', { name: /^Cancel$/i }).first();
      await safeHumanClick(page, cursorState, cancelBtn, { pauseAfter: 500 });
    }
  }

  // === 3. PHOTOS TAB ===
  stepLog(cursorState, 'opening Photos tab');
  await safeHumanClick(page, cursorState, page.locator('button[aria-label="Photos"]').first(), { pauseAfter: 1000 });

  // Scroll down & up the 20 Tokyo photo tiles
  stepLog(cursorState, 'scrolling Tokyo photo mosaic & inspecting Fullscreen Lightbox');
  await humanScroll(page, cursorState, tabPane, 580, 14);
  await page.waitForTimeout(450);
  await humanScroll(page, cursorState, tabPane, 580, 14);
  await page.waitForTimeout(450);
  await humanScroll(page, cursorState, tabPane, -580, 12);
  await humanScroll(page, cursorState, tabPane, -580, 12);

  // Click a photo tile to open Fullscreen Lightbox -> Next twice -> Prev once -> close
  const photoTile = page.locator('.photo-mosaic-card').first();
  if (await safeHumanClick(page, cursorState, photoTile, { pauseAfter: 900 })) {
    const nextBtn = page.locator('button[data-tooltip*="Next" i], button[title*="Next" i], button[aria-label*="Next" i]').first();
    const prevBtn = page.locator('button[data-tooltip*="Previous" i], button[title*="Previous" i], button[aria-label*="Previous" i]').first();
    const closeLightboxBtn = page.locator('button[data-tooltip*="Close" i], button[title*="Close" i], button[aria-label*="Close" i]').last();

    if (await nextBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, nextBtn, { pauseAfter: 700 });
      await safeHumanClick(page, cursorState, nextBtn, { pauseAfter: 700 });
    }
    if (await prevBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, prevBtn, { pauseAfter: 700 });
    }
    if (await closeLightboxBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, closeLightboxBtn, { pauseAfter: 450 });
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  // Click UPLOAD PHOTOS -> PhotoUploadModal -> pause 900ms -> close cleanly
  stepLog(cursorState, 'opening PhotoUploadModal & closing cleanly');
  const uploadPhotosBtn = page.getByRole('button', { name: /UPLOAD PHOTOS/i }).first();
  if (await safeHumanClick(page, cursorState, uploadPhotosBtn, { pauseAfter: 900 })) {
    const uploadDialog = page.locator('[role="dialog"]').filter({ has: page.locator('button[aria-label="Close"]') }).first();
    if (await uploadDialog.isVisible().catch(() => false)) {
      const closeUploadBtn = uploadDialog.locator('button[aria-label="Close"]').first();
      await safeHumanClick(page, cursorState, closeUploadBtn, { pauseAfter: 450 });
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '05_trip_wallet_costs_photos',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
