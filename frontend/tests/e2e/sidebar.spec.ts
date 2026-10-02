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
});
