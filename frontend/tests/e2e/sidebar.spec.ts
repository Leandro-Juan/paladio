import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Sidebar Toggle', () => {
  test('toggles between expanded and collapsed modes via button and shortcut', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).not.toHaveClass(/collapsed/);

    // Verify nav links with text are visible
    await expect(sidebar.getByText('Control Center')).toBeVisible();

    // Click collapse button
    const collapseBtn = page.getByRole('button', { name: /Collapse sidebar/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    // Verify sidebar is collapsed
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect(sidebar.getByText('Control Center')).not.toBeVisible();

    // Verify expand button is visible and click it
    const expandBtn = page.getByRole('button', { name: /Expand sidebar/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // Verify sidebar is expanded again
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await expect(sidebar.getByText('Control Center')).toBeVisible();

    // Test keyboard shortcut Ctrl+B
    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveClass(/collapsed/);

    // Verify localStorage persistence
    const savedState = await page.evaluate(() => localStorage.getItem('paladio_sidebar_collapsed'));
    expect(savedState).toBe('true');
  });

  test('removes Configuration from sidebar and opens UserMenu with admin badge and items', async ({ page }) => {
    await mockAuthenticatedUser(page, 'admin');
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar).toBeVisible();

    // Verify Configuration is NOT in the sidebar links
    await expect(sidebar.getByRole('link', { name: /Configuration/i })).not.toBeVisible();

    // Verify UserMenu trigger shows username and ADMIN badge
    const userMenuBtn = sidebar.getByRole('button', { name: /User menu/i });
    await expect(userMenuBtn).toBeVisible();
    await expect(userMenuBtn.getByText('admin', { exact: true })).toBeVisible();
    await expect(userMenuBtn.getByText('ADMIN', { exact: true })).toBeVisible();

    // Open UserMenu dropdown
    await userMenuBtn.click();

    const menu = page.getByRole('menu', { name: /User navigation/i });
    await expect(menu).toBeVisible();

    // Verify dropdown header info
    await expect(menu.getByText('admin', { exact: true })).toBeVisible();
    await expect(menu.getByText('admin@paladio.internal')).toBeVisible();
    await expect(menu.getByText('ADMIN', { exact: true })).toBeVisible();

    // Verify menu items
    const settingsBtn = menu.getByRole('menuitem', { name: /Settings/i });
    const helpBtn = menu.getByRole('menuitem', { name: /Help/i });
    const logoutBtn = menu.getByRole('menuitem', { name: /Log out/i });

    await expect(settingsBtn).toBeVisible();
    await expect(helpBtn).toBeVisible();
    await expect(logoutBtn).toBeVisible();

    // Verify footer pill
    await expect(menu.getByText('paladio', { exact: true })).toBeVisible();
    await expect(menu.getByText('v1.1.0', { exact: true })).toBeVisible();

    // Test Help modal
    await helpBtn.click();
    await expect(page.getByText('Paladio Sovereign Engine Help')).toBeVisible();
    await page.getByRole('button', { name: /CLOSE/i }).click();
    await expect(page.getByText('Paladio Sovereign Engine Help')).not.toBeVisible();

    // Test Settings navigation to /config
    await userMenuBtn.click();
    await settingsBtn.click();
    await expect(page).toHaveURL(/.*\/config/);
  });

  test('does not display ADMIN badge for regular user role', async ({ page }) => {
    await mockAuthenticatedUser(page, 'user');
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    const userMenuBtn = sidebar.getByRole('button', { name: /User menu/i });
    await expect(userMenuBtn).toBeVisible();
    await expect(userMenuBtn.getByText('traveler')).toBeVisible();
    await expect(userMenuBtn.getByText('ADMIN')).not.toBeVisible();
  });
});
