import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Internationalization (i18n) Engine & Multi-Language Switching', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('html tag has lang="en" and dir="ltr" by default', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');
  });

  test('user menu does NOT have language option (language is only changed in configuration)', async ({ page }) => {
    await page.goto('/dashboard');

    // Open User Menu
    const userMenuBtn = page.getByRole('button', { name: /user menu/i });
    await expect(userMenuBtn).toBeVisible();
    await userMenuBtn.click();

    // Verify Settings and Log out are present
    await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /sign out|log out/i })).toBeVisible();

    // Verify Change Language is NOT present in User Menu
    const changeLangInMenu = page.getByRole('menuitem', { name: /language/i });
    await expect(changeLangInMenu).toHaveCount(0);
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
  });

  test('stored Japanese locale applies lang="ja" and dir="ltr"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'ja');
    });
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ja');
    await expect(html).toHaveAttribute('dir', 'ltr');
  });

  test('language picker opens on /config and switches language', async ({ page }) => {
    await page.goto('/config');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');

    const changeLangBtn = page.getByRole('button', { name: /change language/i }).first();
    const spanishBtn = page.getByRole('button', { name: /español/i });

    // Open language modal with click retry for hydration resilience
    await expect(async () => {
      await changeLangBtn.click();
      await expect(spanishBtn).toBeVisible({ timeout: 1500 });
    }).toPass();

    // Select Español
    await spanishBtn.click();

    // Language should now be 'es'
    await expect(html).toHaveAttribute('lang', 'es');

    // Reload page to verify persistence in localStorage
    await page.reload();
    await expect(html).toHaveAttribute('lang', 'es');
  });

  test('selecting an RTL language applies dir="rtl"', async ({ page }) => {
    await page.goto('/config');
    const html = page.locator('html');

    const changeLangBtn = page.getByRole('button', { name: /change language/i }).first();
    const arabicBtn = page.getByRole('button', { name: /العربية/i });

    // Open language modal with click retry for hydration resilience
    await expect(async () => {
      await changeLangBtn.click();
      await expect(arabicBtn).toBeVisible({ timeout: 1500 });
    }).toPass();

    // Select Arabic
    await arabicBtn.click();

    // HTML should have lang="ar" and dir="rtl"
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('stored Spanish locale renders Spanish dashboard copy', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('paladio-locale', 'es');
    });
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'es');

    // Verify translated dashboard elements
    await expect(page.getByText('PRÓXIMOS VIAJES')).toBeVisible();
    await expect(page.getByText('COLECCIONES GUARDADAS')).toBeVisible();
  });
});

