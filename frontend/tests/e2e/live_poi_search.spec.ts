import { test, expect } from '@playwright/test';

test.describe('POI Search Engine End-to-End Tests', () => {
  test('Exact match, semantic RAG, and not found resolution', async ({ page }) => {
    test.skip(!process.env.RUN_LIVE_TESTS, 'Skipping live check: requires running full stack on port 3000');

    // 0. Setup authentication for AuthGuard
    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

    await page.route(/.*\/api(\/v1)?\/auth\/me/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '8822b5bd-6a95-4ea0-b7b9-a2dd3f40958e',
          email: 'admin@paladio.internal',
          username: 'admin',
          role: 'admin',
          is_active: true,
          preferences: {},
          has_embedding: false,
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    // 1. Navigate to active trip workspace
    await page.goto('http://localhost:3000/trips/33f85437-f115-4cc2-b0ad-170475fdaaf4');
    await page.waitForLoadState('networkidle');

    // 2. Locate POI Search Sidebar
    const searchHeader = page.locator('text=POI SEARCH ENGINE');
    await expect(searchHeader).toBeVisible({ timeout: 15000 });

    const searchInput = page.locator('input[placeholder*="Try \\"El Prado\\""]');
    await expect(searchInput).toBeVisible();

    // 3. Test Exact Match Search: "El Prado"
    await searchInput.fill('El Prado');
    await page.keyboard.press('Enter');

    // Expect Exact match card
    const exactBadge = page.locator('text=EXACT MATCH IN DATABASE');
    await expect(exactBadge).toBeVisible({ timeout: 15000 });
    const pradoTitle = page.locator('h4.font-display:has-text("Museo del Prado")');
    await expect(pradoTitle).toBeVisible();

    // Expect Similar places section
    const similarHeader = page.locator('text=SIMILAR PLACES IN MADRID');
    await expect(similarHeader).toBeVisible();

    // Take screenshot of Exact Match
    await page.screenshot({
      path: '/home/leandro/.gemini/antigravity/brain/9178dcf9-d939-4657-922a-bc1a92afaa92/exact_match_search.png',
    });

    // 4. Test Natural Language Query: "good and cozy cafes with charm"
    await searchInput.fill('good and cozy cafes with charm');
    await page.keyboard.press('Enter');

    // Expect Semantic discoveries header
    const semanticHeader = page.locator('text=SEMANTIC DISCOVERIES IN MADRID');
    await expect(semanticHeader).toBeVisible({ timeout: 15000 });

    // Expect cafe results with similarity badges
    const cafeCentral = page.locator('span[title="Café Central"]');
    await expect(cafeCentral).toBeVisible({ timeout: 15000 });
    const similarityBadge = page.locator('text=similarity').first();
    await expect(similarityBadge).toBeVisible();

    // Take screenshot of Natural Language RAG
    await page.screenshot({
      path: '/home/leandro/.gemini/antigravity/brain/9178dcf9-d939-4657-922a-bc1a92afaa92/semantic_rag_search.png',
    });

    // 5. Test Not Found Query: "Statue of Liberty"
    await searchInput.fill('Statue of Liberty');
    await page.keyboard.press('Enter');

    const notFoundNotice = page.locator('text=DATABASE NOTICE');
    await expect(notFoundNotice).toBeVisible({ timeout: 15000 });
    const noticeText = page.locator('text=not found in Madrid database');
    await expect(noticeText).toBeVisible();

    const obeliscoResult = page.locator('span[title="Obelisco Laus Deo I"]');
    await expect(obeliscoResult).toBeVisible({ timeout: 15000 });

    // Take screenshot of Not Found State
    await page.screenshot({
      path: '/home/leandro/.gemini/antigravity/brain/9178dcf9-d939-4657-922a-bc1a92afaa92/not_found_search.png',
    });
  });
});
