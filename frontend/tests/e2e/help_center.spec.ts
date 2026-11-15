import { test, expect, Page } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const CATEGORY_TITLES = [
  'Getting Started',
  'Trip Workspace',
  'Routes & Public Transit',
  'Bookings Wallet & Passes',
  'Route Price Monitoring',
  'Costs & Group Splitting',
  'Trip Archive, Vault & Photos',
  'AI Travel Assistant',
  'Settings & Infrastructure',
  'Glossary & Concepts',
];

const BANNED_HALLUCINATIONS = [
  'Click Create Itinerary',
  'Relaxed (2 to 3 stops',
  'Comfort Score in the top corner',
  "Adjust Today's Schedule",
  'Auto-Fix',
  'min read read',
];

async function scrollContainerBy(page: Page, deltaY: number): Promise<number> {
  const container = page.getByTestId('help-content-area');
  await expect(container).toBeVisible();
  const box = await container.boundingBox();
  if (!box) throw new Error('help-content-area bounding box missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await expect
    .poll(async () => container.evaluate((el) => Math.round(el.scrollTop)))
    .toBeGreaterThan(50);
  return container.evaluate((el) => Math.round(el.scrollTop));
}

test.describe('Paladio Help Center Accuracy & Scroll Restoration', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAuthenticatedUser(page, 'admin');
  });

  test('renders all updated categories, live screenshots, and verified feature docs with zero hallucinations', async ({ page }) => {
    await page.goto(`${BASE_URL}/help`, { waitUntil: 'domcontentloaded' });

    const sidebar = page.locator('aside');
    const content = page.getByTestId('help-content-area');
    await expect(content).toBeVisible();

    for (const categoryTitle of CATEGORY_TITLES) {
      const catHeader = sidebar.getByText(categoryTitle, { exact: true }).first();
      await expect(catHeader).toBeVisible();
      await catHeader.click();

      await expect(content.locator('h1')).toContainText(categoryTitle);

      const cardCount = await content.locator('h3').count();
      expect(cardCount).toBeGreaterThan(0);

      for (let cardIdx = 0; cardIdx < cardCount; cardIdx++) {
        // Ensure we are on the category hub before clicking the next card
        if (cardIdx > 0) {
          await catHeader.click();
          await expect(content.locator('h1')).toContainText(categoryTitle);
        }

        await content.locator('h3').nth(cardIdx).click();
        await expect(content.locator('h1')).toBeVisible();

        const bodyText = await content.innerText();
        for (const banned of BANNED_HALLUCINATIONS) {
          expect(bodyText, `Found hallucinated text "${banned}" in ${categoryTitle}`).not.toContain(banned);
        }
        expect(bodyText, `Unexpected GPX claim in ${categoryTitle}`).not.toMatch(/\bGPX\b/);
        expect(bodyText, `Unexpected KML claim in ${categoryTitle}`).not.toMatch(/\bKML\b/);

        const images = content.locator('img');
        const imgCount = await images.count();
        for (let i = 0; i < imgCount; i++) {
          const img = images.nth(i);
          await img.scrollIntoViewIfNeeded();
          await expect(img).toBeVisible();
          const src = await img.getAttribute('src');
          await expect
            .poll(
              () =>
                img.evaluate(
                  (node: HTMLImageElement) => node.complete && node.naturalWidth > 0
                ),
              { message: `Screenshot failed to load: ${src}` }
            )
            .toBe(true);
        }
      }
    }

    // Verify search finds key implemented features
    const searchInput = sidebar.getByLabel('Search guides');
    await searchInput.fill('P10');
    await expect(sidebar.getByRole('button', { name: /Route Price & Tariff Telemetry Explained/i })).toBeVisible();

    await searchInput.fill('WalletDropzone');
    await expect(sidebar.getByRole('button', { name: /Bookings Wallet, Dropzone & Passbook Sync/i })).toBeVisible();

    await searchInput.fill('GTFS');
    await expect(sidebar.getByRole('button', { name: /Public Transit Integration/i })).toBeVisible();
  });

  test('restores per-tab article and scroll position within an instance and resets on close/reopen', async ({ page }) => {
    await page.goto(`${BASE_URL}/help`, { waitUntil: 'domcontentloaded' });

    const sidebar = page.locator('aside');
    const content = page.getByTestId('help-content-area');
    await expect(content).toBeVisible();

    // First entry starts at top
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);

    // Open Trip Workspace -> open detailed article -> verify starts at 0 -> scroll down
    await sidebar.getByText('Trip Workspace', { exact: true }).first().click();
    await expect(content.locator('h1')).toHaveText('Trip Workspace');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);

    await content.getByText('Navigating the Trip Workspace (/trips/[id])').first().click();
    await expect(content.locator('h1')).toContainText('Navigating the Trip Workspace');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);

    const tripScrollY = await scrollContainerBy(page, 420);
    expect(tripScrollY).toBeGreaterThan(200);

    // Switch to Route Price Monitoring -> first visit starts on category hub at top (0)
    await sidebar.getByText('Route Price Monitoring', { exact: true }).first().click();
    await expect(content.locator('h1')).toHaveText('Route Price Monitoring');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);

    const monitoringScrollY = await scrollContainerBy(page, 280);
    expect(monitoringScrollY).toBeGreaterThan(50);

    // Switch back to Trip Workspace -> returns directly to the article & exact scroll position
    await sidebar.getByText('Trip Workspace', { exact: true }).first().click();
    await expect(content.locator('h1')).toContainText('Navigating the Trip Workspace');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBeGreaterThan(tripScrollY - 30);
    const restoredTripScrollY = await content.evaluate((el) => Math.round(el.scrollTop));
    expect(Math.abs(restoredTripScrollY - tripScrollY)).toBeLessThanOrEqual(25);

    // Switch back to Route Price Monitoring -> restores scrolled hub position
    await sidebar.getByText('Route Price Monitoring', { exact: true }).first().click();
    await expect(content.locator('h1')).toHaveText('Route Price Monitoring');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBeGreaterThan(monitoringScrollY - 30);

    // Leave Help Center ("close" it by navigating back to app) and reopen it -> new instance starts at top
    await page.getByLabel('Back to App').click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    await page.goto(`${BASE_URL}/help`, { waitUntil: 'domcontentloaded' });
    await expect(content).toBeVisible();
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);

    // Visiting previously scrolled tabs in the new instance starts fresh on category hub at scrollTop 0
    await sidebar.getByText('Trip Workspace', { exact: true }).first().click();
    await expect(content.locator('h1')).toHaveText('Trip Workspace');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);

    await sidebar.getByText('Route Price Monitoring', { exact: true }).first().click();
    await expect(content.locator('h1')).toHaveText('Route Price Monitoring');
    await expect
      .poll(async () => content.evaluate((el) => Math.round(el.scrollTop)))
      .toBe(0);
  });
});
