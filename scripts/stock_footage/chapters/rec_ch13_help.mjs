import {
  BASE_URL,
  createRecorderContext,
  stepLog,
  humanHover,
  safeHumanClick,
  humanType,
  humanScroll,
  waitForAppReady,
  finalizeChapter,
} from '../lib/recorder_lib.mjs';

const ALL_CATEGORIES = [
  { title: 'Getting Started', richArticle: null },
  { title: 'Trip Workspace', richArticle: 'Speed Dial Controls, Locking Stops & Re-Solving' },
  { title: 'Routes & Public Transit', richArticle: null },
  { title: 'Bookings Wallet & Passes', richArticle: null },
  { title: 'Route Price Monitoring', richArticle: 'Route Price & Tariff Telemetry Explained' },
  { title: 'Costs & Group Splitting', richArticle: null },
  { title: 'Trip Archive, Vault & Photos', richArticle: null },
  { title: 'AI Travel Assistant', richArticle: 'Conversing with the Paladio Agent' },
  { title: 'Settings & Infrastructure', richArticle: null },
  { title: 'Glossary & Concepts', richArticle: null },
];

async function scrollArticleView(page, cursorState, contentArea) {
  await page.waitForTimeout(650);
  await humanScroll(page, cursorState, contentArea, 420, 10);
  await page.waitForTimeout(750);
  await humanScroll(page, cursorState, contentArea, 420, 10);
  await page.waitForTimeout(750);
  await humanScroll(page, cursorState, contentArea, 360, 10);
  await page.waitForTimeout(550);
}

async function navigateBackToCategory(page, cursorState, contentArea) {
  const catBreadcrumb = page.locator('nav[aria-label*="Breadcrumbs" i] button').nth(1);
  if (await catBreadcrumb.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, catBreadcrumb, { pauseAfter: 650 });
  } else {
    const homeBreadcrumb = page.locator('nav[aria-label*="Breadcrumbs" i] button').first();
    if (await homeBreadcrumb.isVisible().catch(() => false)) {
      await safeHumanClick(page, cursorState, homeBreadcrumb, { pauseAfter: 650 });
    }
  }
  await contentArea.evaluate((el) => { el.scrollTop = 0; }).catch(() => {});
}

async function main() {
  const { browser, context, page, logs, cursorState, markContentStart } = await createRecorderContext({
    name: '13_help_center_all_categories',
    useAuthState: true,
  });

  await page.goto(`${BASE_URL}/help`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  markContentStart();

  const contentArea = page.getByTestId('help-content-area');
  const sidebar = page.locator('aside').first();
  const sidebarNav = sidebar.locator('nav').first();

  // 1. Search flow (HelpSearchModal if mounted, otherwise live HelpSidebar search)
  stepLog(cursorState, 'searching Help guides for "transit"');
  const searchModalTrigger = page.getByRole('button', { name: /Search Guide/i }).first();
  let openedModal = false;

  if (await searchModalTrigger.isVisible().catch(() => false)) {
    await safeHumanClick(page, cursorState, searchModalTrigger, { pauseAfter: 500 });
    const searchDialog = page.locator('div[role="dialog"][aria-label*="Search Documentation" i]').first();
    if (await searchDialog.isVisible().catch(() => false)) {
      openedModal = true;
      const modalInput = searchDialog.getByPlaceholder(/Search guides/i).first();
      await humanType(page, cursorState, modalInput, 'transit', { pauseAfter: 550 });
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(250);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(250);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(750);
    }
  }

  if (!openedModal) {
    const sidebarSearch = sidebar.getByPlaceholder(/Search guides and tips/i).first();
    if (await sidebarSearch.isVisible().catch(() => false)) {
      await humanType(page, cursorState, sidebarSearch, 'transit', { clear: true, pauseAfter: 700 });
      const filteredArticle = sidebarNav.locator('ul li button').first();
      if (await filteredArticle.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, filteredArticle, { pauseAfter: 800 });
      }
      const clearSearchBtn = sidebar.getByRole('button', { name: /Clear/i }).first();
      if (await clearSearchBtn.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, clearSearchBtn, { pauseAfter: 450 });
      }
    }
  }

  // 2. Scroll HelpArticleView (help-content-area) to show HelpUiMockups & tables, navigate back to category
  stepLog(cursorState, 'scrolling transit HelpArticleView mockups & navigating back');
  if (await page.locator('article').first().isVisible().catch(() => false)) {
    await scrollArticleView(page, cursorState, contentArea);
    await navigateBackToCategory(page, cursorState, contentArea);
  }

  // 3. Click through ALL 10 categories in HelpSidebar one by one
  stepLog(cursorState, 'touring all 10 Help categories & rich articles');
  for (const cat of ALL_CATEGORIES) {
    const catHeader = sidebarNav
      .locator('> div > div:first-child')
      .filter({ hasText: cat.title })
      .first();

    if (await catHeader.isVisible().catch(() => false)) {
      const catLabel = catHeader.getByText(cat.title, { exact: true }).first();
      await safeHumanClick(page, cursorState, catLabel, { pauseAfter: 700 });
    }

    // Pause briefly on HelpCategoryHero & hover first HelpTopicCard in grid
    await contentArea.evaluate((el) => { el.scrollTop = 0; }).catch(() => {});
    const firstTopicCard = contentArea.locator('button').filter({ hasText: /Read/i }).first();
    if (await firstTopicCard.isVisible().catch(() => false)) {
      await humanHover(page, cursorState, firstTopicCard, { pauseMs: 450, scroll: false });
    } else {
      await page.waitForTimeout(550);
    }

    // Open rich mockup articles for selected categories and scroll through their diagrams/tables
    if (cat.richArticle) {
      stepLog(cursorState, `opening rich article: ${cat.richArticle}`);
      const topicCard = contentArea.locator('button').filter({ hasText: cat.richArticle }).first();
      if (await topicCard.isVisible().catch(() => false)) {
        await safeHumanClick(page, cursorState, topicCard, { pauseAfter: 800 });
      } else {
        const sideArticle = sidebarNav.locator('ul li button').filter({ hasText: cat.richArticle }).first();
        if (await sideArticle.isVisible().catch(() => false)) {
          await safeHumanClick(page, cursorState, sideArticle, { pauseAfter: 800 });
        }
      }

      if (await page.locator('article').first().isVisible().catch(() => false)) {
        await scrollArticleView(page, cursorState, contentArea);
        await navigateBackToCategory(page, cursorState, contentArea);
      }
    }
  }

  await finalizeChapter({
    page,
    context,
    browser,
    logs,
    chapterSlug: '13_help_center_all_categories',
    cursorState,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
