import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Floating Sovereign Dock Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('auto-hides when idle/scrolling and reveals with expanded labels on hover', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/dashboard');

    const dock = page.locator('nav.sidebar');
    const triggerZone = page.locator('[class*="triggerZone"]');

    // Initially hidden until mouse hovers bottom area
    await expect(dock).toHaveClass(/hidden/);

    // Move mouse to bottom trigger zone to reveal dock
    await triggerZone.hover();
    await expect(dock).not.toHaveClass(/hidden/);

    // Verify all primary spaces are present in the dock
    const controlCenterLink = dock.getByRole('link', { name: /Control Center/i });
    const engineLink = dock.getByRole('link', { name: /Active Engine/i });
    const tripsLink = dock.getByRole('link', { name: /Upcoming Trips/i });
    const vaultLink = dock.getByRole('link', { name: /Itinerary Vault/i });
    const configLink = dock.getByRole('link', { name: /System Config/i });

    await expect(controlCenterLink).toBeVisible();
    await expect(engineLink).toBeVisible();
    await expect(tripsLink).toBeVisible();
    await expect(vaultLink).toBeVisible();
    await expect(configLink).toBeVisible();

    // Verify LIVE badge is NOT present
    await expect(dock.getByText('LIVE')).not.toBeVisible();

    // Hover over Engine to verify label expands
    await engineLink.hover();
    await expect(dock.getByText('Active Engine')).toBeVisible();

    // Hover over Trips to verify label expands
    await tripsLink.hover();
    await expect(dock.getByText('Upcoming Trips')).toBeVisible();
  });

  test('opens UserMenu from photo avatar trigger with admin badge and items', async ({ page }) => {
    await mockAuthenticatedUser(page, 'admin');
    await page.goto('/dashboard');

    const dock = page.locator('nav.sidebar');
    const triggerZone = page.locator('[class*="triggerZone"]');

    // Reveal dock by hovering bottom trigger zone
    await triggerZone.hover();
    await expect(dock).not.toHaveClass(/hidden/);

    // Verify UserMenu trigger button (photo avatar) is visible
    const userMenuBtn = dock.getByRole('button', { name: /User menu/i });
    await expect(userMenuBtn).toBeVisible();

    // Open UserMenu dropdown popover
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
    await expect(menu.getByText(/v\d+\.\d+\.\d+/)).toBeVisible();

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

    const dock = page.locator('nav.sidebar');
    const triggerZone = page.locator('[class*="triggerZone"]');

    await triggerZone.hover();
    await expect(dock).not.toHaveClass(/hidden/);

    const userMenuBtn = dock.getByRole('button', { name: /User menu/i });
    await expect(userMenuBtn).toBeVisible();

    await userMenuBtn.click();
    const menu = page.getByRole('menu', { name: /User navigation/i });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('traveler')).toBeVisible();
    await expect(menu.getByText('ADMIN')).not.toBeVisible();
  });
});
