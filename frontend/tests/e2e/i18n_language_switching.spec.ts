import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { mockAuthenticatedUser, getCorsHeaders } from './test-utils';

function loadLocale(lang: string): Record<string, any> {
  const filePath = path.join(__dirname, `../../public/locales/${lang}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function assertNoRawDotKeys(page: Page) {
  const text = await page.locator('body').innerText();
  const dotKeyRegex = /\b(nav|dashboard|common|config|workspace|costs|wallet|help|auth|monitoring|vault|engine|poi_categories|languages|countries|currencies)\.[a-z0-9_]+\b/g;
  const matches = text.match(dotKeyRegex) || [];
  expect(matches, `Found raw i18n dot-keys in visible text: ${matches.join(', ')}`).toEqual([]);
}

const SHIPPED_LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh-CN', 'ko', 'ar'] as const;

test.describe('Internationalization (i18n) Engine & Multi-Language Switching', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('html tag has lang="en" and dir="ltr" by default', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await assertNoRawDotKeys(page);
  });

  test('user menu does NOT have language option (language is only changed in configuration)', async ({ page }) => {
    await page.goto('/dashboard');

    const userMenuBtn = page.getByRole('button', { name: /user menu/i });
    await expect(userMenuBtn).toBeVisible();
    await userMenuBtn.click();

    await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /sign out|log out/i })).toBeVisible();

    const changeLangInMenu = page.getByRole('menuitem', { name: /language/i });
    await expect(changeLangInMenu).toHaveCount(0);
  });

  test('language picker opens on /config?tab=profile and switches language with WheelDialPicker', async ({ page }) => {
    await page.goto('/config?tab=profile');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');

    const changeLangBtn = page.getByTestId('change-language-button');
    await expect(changeLangBtn).toBeVisible();
    await changeLangBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Verify search input is present in English
    const searchInput = dialog.getByPlaceholder('Search language or code...');
    await expect(searchInput).toBeVisible();

    // Search and select Spanish
    await searchInput.fill('Spanish');
    const actionBtn = dialog.getByRole('button', { name: /Use Spanish/i });
    await expect(actionBtn).toBeVisible({ timeout: 5000 });
    await actionBtn.click();
    await expect(dialog).toHaveCount(0);

    // HTML lang should now be 'es'
    await expect(html).toHaveAttribute('lang', 'es');
    await expect(html).toHaveAttribute('dir', 'ltr');

    // Reload page to verify persistence in localStorage
    await page.reload();
    await expect(html).toHaveAttribute('lang', 'es');

    // Reopen modal - search input is now localized into Spanish
    await changeLangBtn.click();
    await expect(dialog).toBeVisible();
    const esSearchInput = dialog.getByPlaceholder('Buscar idioma o código...');
    await expect(esSearchInput).toBeVisible();

    // Search and select Arabic (RTL)
    await esSearchInput.fill('Arabic');
    const arBtn = dialog.getByRole('button', { name: /Usar .*العربية/i });
    await expect(arBtn).toBeVisible({ timeout: 5000 });
    await arBtn.click();
    await expect(dialog).toHaveCount(0);

    // HTML should now have lang="ar" and dir="rtl"
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('stored locale choice is applied on reload with proper direction', async ({ page }) => {
    // Test Arabic (RTL)
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'ar');
    });
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await assertNoRawDotKeys(page);
  });

  test('stored Japanese locale applies lang="ja" and dir="ltr"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'ja');
    });
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ja');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await assertNoRawDotKeys(page);
  });

  // Precision sweep across ALL 10 Shipped Locales on Dashboard
  for (const locale of SHIPPED_LOCALES) {
    test(`dashboard renders 100% translated with zero raw dot-keys in locale: [${locale}]`, async ({ page }) => {
      const dict = loadLocale(locale);
      const isRtl = locale === 'ar';

      await page.addInitScript((loc) => {
        localStorage.setItem('paladio-locale', loc);
      }, locale);

      await page.goto('/dashboard');
      const html = page.locator('html');
      await expect(html).toHaveAttribute('lang', locale);
      await expect(html).toHaveAttribute('dir', isRtl ? 'rtl' : 'ltr');

      // Verify localized navigation labels from dictionary inside sidebar navigation
      const nav = page.locator('nav');
      await expect(nav.getByText(dict.nav.dashboard, { exact: true })).toBeVisible();
      await expect(nav.getByText(dict.nav.new_trip, { exact: true })).toBeVisible();
      await expect(nav.getByText(dict.nav.monitoring, { exact: true })).toBeVisible();
      await expect(nav.getByText(dict.nav.vault, { exact: true })).toBeVisible();

      // Verify dashboard headings match target locale dictionary
      await expect(page.getByRole('heading', { level: 2, name: dict.dashboard.upcoming_trips })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: dict.dashboard.saved_collections })).toBeVisible();

      // Verify zero raw translation dot-keys anywhere in visible text
      await assertNoRawDotKeys(page);
    });
  }

  // Cross-route translation precision test
  test('all major pages (/login, /setup, /taste-calibration, /engine, /vault, /monitoring, /help) render translated with zero raw dot-keys', async ({ page }) => {
    test.slow();
    // 1. /login in Spanish (unauthenticated)
    await page.addInitScript(() => {
      localStorage.removeItem('paladio_token');
      localStorage.setItem('paladio-locale', 'es');
    });
    await page.goto('/login');
    const esDict = loadLocale('es');
    await expect(page.getByRole('button', { name: esDict.auth.authenticate })).toBeVisible();
    await assertNoRawDotKeys(page);

    // 2. /setup in French
    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: true, user_count: 0 }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'fr');
    });
    await page.goto('/setup');
    const frDict = loadLocale('fr');
    await expect(page.getByRole('button', { name: frDict.auth.initialize_master_administrator })).toBeVisible();
    await assertNoRawDotKeys(page);

    // Reset setup status for remaining authenticated tests
    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

    // 3. /taste-calibration in German
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'de');
    });
    await page.goto('/taste-calibration');
    const deDict = loadLocale('de');
    await expect(page.getByText(deDict.taste_calibration.page_title)).toBeVisible();
    await expect(page.getByRole('button', { name: deDict.taste_calibration.skip })).toBeVisible();
    await assertNoRawDotKeys(page);

    // 4. /engine in Japanese
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'ja');
    });
    await page.goto('/engine');
    const jaDict = loadLocale('ja');
    await expect(page.getByRole('heading', { level: 2, name: jaDict.engine.new_trip_heading })).toBeVisible();
    await assertNoRawDotKeys(page);

    // 5. /vault in Italian
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'it');
    });
    await page.goto('/vault');
    const itDict = loadLocale('it');
    await expect(page.locator('nav').getByText(itDict.nav.vault, { exact: true })).toBeVisible();
    await assertNoRawDotKeys(page);

    // 6. /monitoring in Arabic (RTL)
    await page.route(/.*\/api(\/v1)?\/market\/summary.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ monitored_routes: 0, deals_detected: 0, ticks_scanned_today: 0, avg_savings_pct: 0 }),
      });
    });
    await page.route(/.*\/api(\/v1)?\/market\/routes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route(/.*\/api(\/v1)?\/market\/deals.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'ar');
    });
    await page.goto('/monitoring');
    const arDict = loadLocale('ar');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1, name: arDict.monitoring.page_title })).toBeVisible();
    await assertNoRawDotKeys(page);

    // 7. /help in Portuguese
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'pt');
    });
    await page.goto('/help');
    const ptDict = loadLocale('pt');
    await expect(page.getByText(ptDict.help.center_badge, { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(ptDict.help.search_sidebar_placeholder)).toBeVisible();
    await assertNoRawDotKeys(page);
  });

  // Trip workspace 5-tab translation verification in Korean
  test('trip workspace (/trips/[id]) renders all 5 tabs translated in Korean with zero raw dot-keys', async ({ page }) => {
    const mockTrip = {
      id: 'trip-seoul-1',
      destination: 'Seoul',
      start_date: '2027-01-10',
      end_date: '2027-01-15',
      itinerary_data: {
        destination: 'Seoul',
        days: [
          {
            day: 1,
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-gyeongbokgung',
                    name: 'Gyeongbokgung Palace',
                    city: 'Seoul',
                    category: 'landmark',
                  },
                },
              ],
            },
          },
        ],
      },
      participants: [{ id: 'user-1', name: 'Traveler', role: 'admin' }],
    };

    await page.route(/.*\/api(\/v1)?\/trips\/trip-seoul-1(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/trip-seoul-1\/photos/, async (route) => {
      await route.fulfill({ status: 200, headers: getCorsHeaders(route), contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/trip-seoul-1\/tickets/, async (route) => {
      await route.fulfill({ status: 200, headers: getCorsHeaders(route), contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/trip-seoul-1\/expenses/, async (route) => {
      await route.fulfill({ status: 200, headers: getCorsHeaders(route), contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/trip-seoul-1\/settlement.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ total_spent_eur: 0, by_category: {}, currency_breakdown: {}, debts: [] }),
      });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/trip-seoul-1\/collections/, async (route) => {
      await route.fulfill({ status: 200, headers: getCorsHeaders(route), contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/.*\/api(\/v1)?\/pois\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ id: 'poi-gyeongbokgung', name: 'Gyeongbokgung Palace', city: 'Seoul', category: 'landmark' }),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'ko');
    });

    await page.goto('/trips/trip-seoul-1');
    const koDict = loadLocale('ko');

    // 1. Plan Tab (일정)
    const planTab = page.getByRole('button', { name: koDict.workspace.tabs.plan, exact: true });
    await expect(planTab).toBeVisible();
    await assertNoRawDotKeys(page);

    // 2. Wallet Tab (지갑)
    const walletTab = page.getByRole('button', { name: koDict.workspace.tabs.wallet, exact: true });
    await expect(walletTab).toBeVisible();
    await walletTab.click();
    await assertNoRawDotKeys(page);

    // 3. Costs Tab (비용)
    const costsTab = page.getByRole('button', { name: koDict.workspace.tabs.costs, exact: true });
    await expect(costsTab).toBeVisible();
    await costsTab.click();
    await assertNoRawDotKeys(page);

    // 4. Photos & Vault Tab (사진)
    const photosTab = page.getByRole('button', { name: koDict.workspace.tabs.photos, exact: true });
    await expect(photosTab).toBeVisible();
    await photosTab.click();
    await assertNoRawDotKeys(page);

    // 5. Config Tab (구성)
    const configTab = page.getByRole('button', { name: koDict.workspace.tabs.config, exact: true });
    await expect(configTab).toBeVisible();
    await configTab.click();
    await assertNoRawDotKeys(page);
  });

  // Settings /config items verification in Spanish
  test('settings /config items render localized names with zero raw dot-keys', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'es');
    });

    await page.goto('/config?tab=profile');
    const esDict = loadLocale('es');

    // Verify settings navigation items in Spanish sidebar
    const items = [
      esDict.config_data.item_profile_title,
      esDict.config_data.item_appearance_title,
      esDict.config_data.item_solver_title,
      esDict.config_data.item_transit_title,
      esDict.config_data.item_llm_title,
      esDict.config_data.item_users_title,
      esDict.config_data.item_updates_title,
      esDict.config_data.item_vault_title,
      esDict.config_data.item_notifications_title,
      esDict.config_data.item_secrets_title,
    ];

    for (const itemTitle of items) {
      await expect(page.getByRole('button', { name: itemTitle })).toBeVisible();
    }
    await assertNoRawDotKeys(page);

    // Click Appearance and verify sub-sections
    await page.getByRole('button', { name: esDict.config_data.item_appearance_title }).click();
    await assertNoRawDotKeys(page);

    // Click Notifications and verify
    await page.getByRole('button', { name: esDict.config_data.item_notifications_title }).click();
    await assertNoRawDotKeys(page);
  });

  // English verbatim regression guard: asserts key English UI copy matches original 0878097 baseline
  test('English strings remain 100% identical to original baseline', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'en');
    });

    await page.goto('/dashboard');
    const enDict = loadLocale('en');

    // Navigation items
    expect(enDict.nav.dashboard).toBe('Control Center');
    expect(enDict.nav.new_trip).toBe('New Trip');
    expect(enDict.nav.monitoring).toBe('Route Monitoring');
    expect(enDict.nav.vault).toBe('Trip Archive');

    await expect(page.getByText('Control Center')).toBeVisible();
    await expect(page.getByText('New Trip')).toBeVisible();
    await expect(page.getByText('Route Monitoring')).toBeVisible();
    await expect(page.getByText('Trip Archive')).toBeVisible();

    // Dashboard headings
    expect(enDict.dashboard.upcoming_trips).toBe('UPCOMING TRIPS');
    expect(enDict.dashboard.saved_collections).toBe('SAVED COLLECTIONS');
    expect(enDict.dashboard.open_cockpit).toBe('OPEN COCKPIT');
    expect(enDict.dashboard.seed_taste_title).toBe('Seed your taste profile');

    await expect(page.getByRole('heading', { level: 2, name: 'UPCOMING TRIPS' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'SAVED COLLECTIONS' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Seed your taste profile' })).toBeVisible();

    // Workspace tabs in English
    expect(enDict.workspace.tabs.plan).toBe('Plan');
    expect(enDict.workspace.tabs.wallet).toBe('Wallet');
    expect(enDict.workspace.tabs.costs).toBe('Costs');
    expect(enDict.workspace.tabs.photos).toBe('Photos');
    expect(enDict.workspace.tabs.config).toBe('Configuration');

    // Verify settings navigation in English
    await page.goto('/config?tab=profile');
    expect(enDict.config_data.item_profile_title).toBe('Personal Account');
    expect(enDict.config_data.item_appearance_title).toBe('Appearance & Interface');
    expect(enDict.config_data.item_solver_title).toBe('Solver Constraints & Pacing');
    expect(enDict.config_data.item_transit_title).toBe('City Data');
    expect(enDict.config_data.item_llm_title).toBe('AI & LLM Engine');
    expect(enDict.config_data.item_users_title).toBe('Authorized Users');
    expect(enDict.config_data.item_updates_title).toBe('System Updates');
    expect(enDict.config_data.item_vault_title).toBe('Data Vault & Backups');
    expect(enDict.config_data.item_notifications_title).toBe('Notifications');
    expect(enDict.config_data.item_secrets_title).toBe('API Keys & Secrets');

    await expect(page.getByRole('button', { name: 'Personal Account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Appearance & Interface' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solver Constraints & Pacing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'City Data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI & LLM Engine' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Authorized Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'System Updates' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data Vault & Backups' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'API Keys & Secrets' })).toBeVisible();

    await assertNoRawDotKeys(page);
  });
});
