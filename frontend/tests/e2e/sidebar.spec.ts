import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Modern Sidebar Navigation (Default)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('renders sidebar by default with all primary tabs except config', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar).toBeVisible();

    // Verify all 4 primary workspace tabs are present
    const controlCenterLink = sidebar.getByRole('link', { name: /Control Center/i });
    const engineLink = sidebar.getByRole('link', { name: /Active Engine/i });
    const tripsLink = sidebar.getByRole('link', { name: /Upcoming Trips/i });
    const vaultLink = sidebar.getByRole('link', { name: /Itinerary Vault/i });

    await expect(controlCenterLink).toBeVisible();
    await expect(engineLink).toBeVisible();
    await expect(tripsLink).toBeVisible();
    await expect(vaultLink).toBeVisible();

    // Verify System Config is NOT in the sidebar links
    const configLink = sidebar.getByRole('link', { name: /System Config/i });
    await expect(configLink).not.toBeVisible();

    // Verify floating dock is NOT rendered in default sidebar mode
    const dockContainer = page.locator('[class*="dockContainer"]');
    await expect(dockContainer).not.toBeVisible();
  });

  test('collapses and expands via collapse button and floating toggle button', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar).toBeVisible();

    // Click collapse button (x)
    const collapseBtn = sidebar.getByRole('button', { name: /Collapse sidebar/i });
    await collapseBtn.click();

    // Sidebar should have collapsed class and floating expand button should appear
    await expect(sidebar).toHaveClass(/collapsed/);
    const expandBtn = page.getByRole('button', { name: /Expand sidebar/i });
    await expect(expandBtn).toBeVisible();

    // Click expand button to restore sidebar
    await expandBtn.click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });

  test('toggles collapsed state with keyboard shortcut Ctrl+B', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar).not.toHaveClass(/collapsed/);

    // Press Control+B to collapse
    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveClass(/collapsed/);

    // Press Control+B to expand
    await page.keyboard.press('Control+b');
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });

  test('opens UserMenu from sidebar footer and navigates to config', async ({ page }) => {
    await mockAuthenticatedUser(page, 'admin');
    await page.goto('/dashboard');

    const sidebar = page.locator('nav.sidebar');
    const userMenuBtn = sidebar.getByRole('button', { name: /User menu/i });
    await expect(userMenuBtn).toBeVisible();

    await userMenuBtn.click();
    const menu = page.getByRole('menu', { name: /User navigation/i });
    await expect(menu).toBeVisible();

    const settingsBtn = menu.getByRole('menuitem', { name: /Settings/i });
    await expect(settingsBtn).toBeVisible();

    await settingsBtn.click();
    await expect(page).toHaveURL(/.*\/config/);
  });
});

test.describe('Navigation Style Configuration Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('can switch between sidebar and bottom dock in config page and persist', async ({ page }) => {
    await mockAuthenticatedUser(page, 'admin');
    await page.goto('/config');

    // Both option buttons exist in the Navigation Layout Engine section
    const sidebarOption = page.getByRole('button', { name: /Set navigation to Sidebar/i });
    const dockOption = page.getByRole('button', { name: /Set navigation to Floating Bottom Dock/i });

    await expect(sidebarOption).toBeVisible();
    await expect(dockOption).toBeVisible();
    await expect(sidebarOption).toHaveAttribute('aria-pressed', 'true');

    // Switch to Floating Bottom Dock
    await dockOption.click();
    await expect(dockOption).toHaveAttribute('aria-pressed', 'true');
    await expect(sidebarOption).toHaveAttribute('aria-pressed', 'false');

    // Verify dock trigger zone is now present
    const triggerZone = page.locator('[class*="triggerZone"]');
    await expect(triggerZone).toBeVisible();

    // Reload page to verify persistence
    await page.reload();
    await expect(dockOption).toHaveAttribute('aria-pressed', 'true');
    await expect(triggerZone).toBeVisible();

    // Switch back to Sidebar
    await sidebarOption.click();
    await expect(sidebarOption).toHaveAttribute('aria-pressed', 'true');
    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar).toBeVisible();
  });
});
