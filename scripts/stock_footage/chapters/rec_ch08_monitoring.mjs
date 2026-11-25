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
    name: '08_monitoring_deals_telemetry_calendar',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/monitoring`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.waitForTimeout(1400);
  markContentStart();
  cursorState.trimSec = Number((cursorState.trimSec + 0.6).toFixed(2));

  // 1. Open Experimental Info modal & close it
  stepLog(cursorState, 'opening Experimental Info modal');
  const expBadge = page.getByRole('button', { name: /EXPERIMENTAL/i }).first();
  if (await expBadge.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, expBadge, { pauseAfter: 950 });
    const ackBtn = page.getByRole('button', { name: /Understood/i }).first();
    if (await ackBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, ackBtn, { pauseAfter: 550 });
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  // 2. Hover Fleet Summary KPI strip
  stepLog(cursorState, 'hovering Fleet Summary KPI strip');
  const summaryStrip = page.locator('section[aria-label*="Monitoring summary" i]').first();
  if (await summaryStrip.isVisible().catch(() => false)) {
    const kpiCells = summaryStrip.locator('> div');
    const kpiCount = await kpiCells.count();
    for (let i = 0; i < Math.min(kpiCount, 4); i++) {
      await humanHover(page, cursorState, kpiCells.nth(i), { pauseMs: 400, scroll: false });
    }
  }

  // 3. Active Deal Spotlight (and DealPackageNavigator if present on overview)
  stepLog(cursorState, 'inspecting Active Deal Spotlight');
  const spotlight = page.locator('section[aria-label*="Active verified deal packages" i], section[aria-label*="Top verified deal packages" i]').first();
  if (await spotlight.isVisible().catch(() => false)) {
    const nextDealBtn = spotlight.getByRole('button', { name: /Next deal package/i }).first();
    const prevDealBtn = spotlight.getByRole('button', { name: /Previous deal package/i }).first();
    if (await nextDealBtn.isVisible().catch(() => false)) {
      if (await nextDealBtn.isEnabled().catch(() => false)) {
        await safeHumanClick(page, cursorState, nextDealBtn, { pauseAfter: 800 });
      }
      if (await prevDealBtn.isEnabled().catch(() => false)) {
        await safeHumanClick(page, cursorState, prevDealBtn, { pauseAfter: 800 });
      }
    }

    // Hover HotelTicketCard (Accommodation block) and Make it a Trip CTA (do NOT click!)
    const hotelLabel = spotlight.getByText(/^Accommodation$/i).first();
    if (await hotelLabel.isVisible().catch(() => false)) {
      const hotelCard = hotelLabel.locator('xpath=ancestor::div[2]');
      await humanHover(page, cursorState, hotelCard, { pauseMs: 550 });
    }
    const makeTripBtn = spotlight.getByRole('button', { name: /Make it a Trip/i }).first();
    if (await makeTripBtn.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, makeTripBtn, { pauseMs: 550 });
    }
  }

  // 4. Route Table filters & search
  stepLog(cursorState, 'testing Route Table filters and search');
  const filterPatterns = [
    /^All Routes/i,
    /^Deals Active/i,
    /^Monitoring/i,
    /^Paused/i,
    /^All Routes/i,
  ];
  for (const pat of filterPatterns) {
    const pill = page.getByRole('button', { name: pat }).first();
    if (await pill.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, pill, { pauseAfter: 650 });
    }
  }

  const routeSearchInput = page.getByPlaceholder(/Search by city, airport IATA/i).first();
  if (await routeSearchInput.isVisible().catch(() => false)) {
    await humanType(page, cursorState, routeSearchInput, 'TYO', { clear: true, pauseAfter: 850 });
    await humanType(page, cursorState, routeSearchInput, 'LIS', { clear: true, pauseAfter: 850 });
    await safeHumanClick(page, cursorState, routeSearchInput, { pauseAfter: 150 });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(600);
  }

  // 5. Open NewRouteModal (STRICTLY READ-ONLY — DO NOT SUBMIT!)
  stepLog(cursorState, 'opening NewRouteModal (read-only preview)');
  const monitorBtn = page.getByRole('button', { name: /\+\s*Monitor Route/i }).first();
  if (await monitorBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, monitorBtn, { pauseAfter: 750 });

    const modal = page.locator('div[role="dialog"]').first();
    await modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (await modal.isVisible().catch(() => false)) {
      // Type origin "MAD" and destination "ROM" into RouteIntakeBar search inputs
      const corridorInputs = modal.getByPlaceholder(/Search city \/ airport/i);
      if ((await corridorInputs.count()) >= 2) {
        await humanType(page, cursorState, corridorInputs.nth(0), 'MAD', { clear: true, pauseAfter: 500 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await humanType(page, cursorState, corridorInputs.nth(1), 'ROM', { clear: true, pauseAfter: 500 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      }

      // Open earliest date picker briefly, then click modal title (h3) to close its popover cleanly
      const earliestDateBtn = modal.getByRole('button', { name: /Select earliest departure date/i }).first();
      if (await earliestDateBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, earliestDateBtn, { pauseAfter: 700 });
        await safeHumanClick(page, cursorState, modal.locator('h3').first(), { pauseAfter: 450, scroll: false, force: true });
      }

      // Smoothly drag BOTH Stay Duration sliders (drag max up first, then min up so clamps don't collide)
      const rangeSliders = modal.locator('input[type="range"]');
      if ((await rangeSliders.count()) >= 2) {
        await humanDragSlider(page, cursorState, rangeSliders.nth(1), 14, 10);
        await humanDragSlider(page, cursorState, rangeSliders.nth(0), 6, 10);
      }

      // Open CurrencyWheelPicker briefly & close cleanly
      const currencyBtn = modal.locator('button[title*="Change currency" i]').first();
      if (await currencyBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, currencyBtn, { pauseAfter: 850 });
        const wheelDialog = page.locator('div[role="dialog"][aria-label*="Select Currency" i]').last();
        if (await wheelDialog.isVisible().catch(() => false)) {
          const closeWheelBtn = wheelDialog.getByRole('button', { name: /^Close$/i }).first();
          if (await closeWheelBtn.isVisible().catch(() => false)) {
            await safeHumanClick(page, cursorState, closeWheelBtn, { pauseAfter: 450 });
          } else {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(350);
          }
        }
      }

      // Inspect ParticipantsManager section without adding/modifying
      const participantsLabel = modal.getByText(/Travelers & Participants/i).first();
      if (await participantsLabel.isVisible().catch(() => false)) {
        await humanHover(page, cursorState, participantsLabel, { pauseMs: 450 });
      }
      const addParticipantBtn = modal.getByRole('button', { name: /Add Participant/i }).first();
      if (await addParticipantBtn.isVisible().catch(() => false)) {
        await humanHover(page, cursorState, addParticipantBtn, { pauseMs: 450 });
      }

      // Click Close (x) or Cancel cleanly and wait until modal is gone
      const closeModalBtn = modal.getByRole('button', { name: /Close/i }).first();
      if (await closeModalBtn.isVisible().catch(() => false)) {
        await closeModalBtn.click({ force: true });
        await page.waitForTimeout(450);
      }
      if (await modal.isVisible().catch(() => false)) {
        const cancelBtn = modal.getByRole('button', { name: /^Cancel$/i }).first();
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click({ force: true });
          await page.waitForTimeout(450);
        }
      }
      if (await modal.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(450);
      }
    }
  }

  // 6. Click MAD -> TYO (demo-route-mad-hnd) to open RouteFullScreenView
  stepLog(cursorState, 'opening MAD -> TYO RouteFullScreenView');
  const madTyoRow = page.locator('tbody tr').filter({ hasText: /MAD/ }).filter({ hasText: /TYO|HND/ }).first();
  if (await madTyoRow.isVisible().catch(() => false)) {
    const inspectBtn = madTyoRow.getByRole('button', { name: /Inspect/i }).first();
    if (await inspectBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, inspectBtn, { pauseAfter: 1200 });
    } else {
      await safeHumanClick(page, cursorState, madTyoRow, { pauseAfter: 1200 });
    }
  } else {
    await page.goto(`${BASE_URL}/monitoring?route=demo-route-mad-hnd`, { waitUntil: 'domcontentloaded' });
  }
  await waitForAppReady(page);

  const routeRegion = page.locator('div[role="region"][aria-label*="Route detail" i]').first();
  await routeRegion.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

  // Cycle DealPackageNavigator deals inside RouteFullScreenView
  stepLog(cursorState, 'cycling DealPackageNavigator & hovering HotelTicketCard');
  const dealNav = page.locator('section[aria-label*="Top verified deal packages" i]').first();
  if (await dealNav.isVisible().catch(() => false)) {
    const nextBtn = dealNav.getByRole('button', { name: /Next deal package/i }).first();
    const prevBtn = dealNav.getByRole('button', { name: /Previous deal package/i }).first();
    if ((await nextBtn.isVisible().catch(() => false)) && (await nextBtn.isEnabled().catch(() => false))) {
      await safeHumanClick(page, cursorState, nextBtn, { pauseAfter: 850 });
      if (await nextBtn.isEnabled().catch(() => false)) {
        await safeHumanClick(page, cursorState, nextBtn, { pauseAfter: 750 });
      }
      if (await prevBtn.isEnabled().catch(() => false)) {
        await safeHumanClick(page, cursorState, prevBtn, { pauseAfter: 750 });
      }
    }
    const navHotelLabel = dealNav.getByText(/^Accommodation$/i).first();
    if (await navHotelLabel.isVisible().catch(() => false)) {
      const navHotel = navHotelLabel.locator('xpath=ancestor::div[2]');
      await humanHover(page, cursorState, navHotel, { pauseMs: 500 });
    }
    const navMakeTrip = dealNav.getByRole('button', { name: /Make it a Trip/i }).first();
    if (await navMakeTrip.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, navMakeTrip, { pauseMs: 500 });
    }
  }

  // Inspect PriceTrendGraph
  stepLog(cursorState, 'inspecting PriceTrendGraph (timeframes, directions, SVG tooltip)');
  const trendGraph = page.locator('div[role="region"][aria-label*="Route price trend graph" i]').first();
  if (await trendGraph.isVisible().catch(() => false)) {
    await trendGraph.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);

    // Click timeframe buttons if rendered
    for (const tf of ['24h', '7d', '30d', '90d']) {
      const tfBtn = trendGraph.getByRole('button', { name: new RegExp(`^${tf}$`, 'i') }).first();
      if (await tfBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, tfBtn, { pauseAfter: 600 });
      }
    }

    // Click direction toggles: OUTBOUND, RETURN, BOTH
    for (const dirName of [/^OUTBOUND$/i, /^RETURN$/i, /^BOTH$/i]) {
      const dirBtn = trendGraph.getByRole('button', { name: dirName }).first();
      if (await dirBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, dirBtn, { pauseAfter: 700 });
      }
    }

    // Hover across Recharts SVG to trigger interactive tooltip
    const chartSvg = trendGraph.locator('.recharts-surface').first();
    if (await chartSvg.isVisible().catch(() => false)) {
      const box = await chartSvg.boundingBox();
      if (box && box.width > 40 && box.height > 40) {
        const yMid = box.y + box.height * 0.48;
        for (const frac of [0.24, 0.5, 0.74]) {
          await humanMove(page, cursorState, box.x + box.width * frac, yMid, 12);
          await page.waitForTimeout(650);
        }
      }
    }
  }

  // Inspect RouteTelemetryCards
  stepLog(cursorState, 'inspecting RouteTelemetryCards');
  const telemetrySection = page.locator('section[aria-label*="Route telemetry metrics" i]').first();
  if (await telemetrySection.isVisible().catch(() => false)) {
    await telemetrySection.scrollIntoViewIfNeeded().catch(() => {});
    const cards = telemetrySection.locator('> div');
    const cCount = await cards.count();
    for (let i = 0; i < Math.min(cCount, 3); i++) {
      await humanHover(page, cursorState, cards.nth(i), { pauseMs: 450 });
    }
  }

  // Inspect MonitoringCalendar
  stepLog(cursorState, 'inspecting MonitoringCalendar & Day Detail Drawer');
  const calRegion = page.locator('div[role="region"][aria-label*="Route price calendar matrix" i]').first();
  if (await calRegion.isVisible().catch(() => false)) {
    await calRegion.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);

    // Horizon toggle (4M / FULL HORIZON)
    const fullHorizonBtn = calRegion.getByRole('button', { name: /FULL HORIZON|11M/i }).first();
    const fourMonthBtn = calRegion.getByRole('button', { name: /^4M$/i }).first();
    if (await fullHorizonBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, fullHorizonBtn, { pauseAfter: 900 });
    }
    if (await fourMonthBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, fourMonthBtn, { pauseAfter: 700 });
    }

    // Direction views: OUTBOUND, INBOUND, BEST ROUND-TRIP
    for (const calDir of [/^OUTBOUND$/i, /^INBOUND$/i, /BEST ROUND-TRIP/i]) {
      const btn = calRegion.getByRole('button', { name: calDir }).first();
      if (await btn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, btn, { pauseAfter: 800 });
      }
    }

    // Click a fare date cell that has price data to open the Day Detail Drawer
    const pricedDayBtn = calRegion.locator('button[aria-label*="price "]').first();
    if (await pricedDayBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, pricedDayBtn, { pauseAfter: 1200 });
      const closeDayDetailBtn = calRegion.getByRole('button', { name: /Close day detail/i }).first();
      if (await closeDayDetailBtn.isVisible().catch(() => false)) {
        await closeDayDetailBtn.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(900);
        await humanScroll(page, cursorState, null, 240);
        await page.waitForTimeout(700);
        await safeHumanClick(page, cursorState, closeDayDetailBtn, { pauseAfter: 550 });
      }
    }
  }

  // 7. Return to Fleet Overview, click LHR -> LIS (demo-route-lhr-lis) briefly, then return to Fleet Overview
  stepLog(cursorState, 'returning to Fleet Overview & inspecting LHR -> LIS');
  const backToFleetBtn = page.getByRole('button', { name: /Back to Fleet Overview/i }).first();
  if (await backToFleetBtn.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, backToFleetBtn, { pauseAfter: 900 });
  } else {
    await page.goto(`${BASE_URL}/monitoring`, { waitUntil: 'domcontentloaded' });
  }
  await waitForAppReady(page);

  const lhrLisRow = page.locator('tbody tr').filter({ hasText: /LHR/ }).filter({ hasText: /LIS/ }).first();
  if (await lhrLisRow.isVisible().catch(() => false)) {
    const inspectBtn = lhrLisRow.getByRole('button', { name: /Inspect/i }).first();
    if (await inspectBtn.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, inspectBtn, { pauseAfter: 1300 });
    } else {
      await safeHumanClick(page, cursorState, lhrLisRow, { pauseAfter: 1300 });
    }
  } else {
    await page.goto(`${BASE_URL}/monitoring?route=demo-route-lhr-lis`, { waitUntil: 'domcontentloaded' });
  }
  await waitForAppReady(page);

  const lhrTrend = page.locator('div[role="region"][aria-label*="Route price trend graph" i]').first();
  if (await lhrTrend.isVisible().catch(() => false)) {
    await humanScroll(page, cursorState, null, 260);
    await page.waitForTimeout(700);
  }

  const backBtn2 = page.getByRole('button', { name: /Back to Fleet Overview/i }).first();
  if (await backBtn2.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, backBtn2, { pauseAfter: 900 });
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '08_monitoring_deals_telemetry_calendar',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
