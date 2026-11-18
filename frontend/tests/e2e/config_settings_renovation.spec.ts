import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Settings Renovation & Consolidation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('Personal Account tab has inline credentials editing, grouped localization, closed city menu by default, and single password SAVE button', async ({ page }) => {
    await page.goto('/config?tab=profile');

    // 1. Verify Active Account Identity card exists and modal buttons are removed
    await expect(page.getByText('Personal Account Profile')).toBeVisible();
    await expect(page.getByText('Active Account Identity')).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ Edit Credentials/i })).toHaveCount(0);

    // 2. Verify inline credentials inputs are directly accessible
    await expect(page.getByText('Traveler Credentials & Security')).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload Photo/i })).toBeVisible();
    await expect(page.getByPlaceholder('Traveler username')).toBeVisible();
    await expect(page.getByPlaceholder('name@domain.com')).toBeVisible();
    const newPassInput = page.getByPlaceholder('Leave blank to keep unchanged');
    const confirmPassInput = page.getByPlaceholder('Confirm passphrase');
    await expect(newPassInput).toBeVisible();
    await expect(confirmPassInput).toBeVisible();

    // 3. Verify the SAVE button is the only confirmation button, disabled in gray initially
    const saveBtn = page.getByRole('button', { name: 'SAVE', exact: true });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    // Test entering mismatched password stays disabled and displays mismatch error
    await newPassInput.fill('secret123');
    await confirmPassInput.fill('mismatch456');
    await expect(saveBtn).toBeDisabled();
    await expect(page.getByText("The passwords don't match")).toBeVisible();

    // Test eye icon toggles password visibility
    const showPassBtn = page.getByRole('button', { name: 'Show passphrase' });
    await expect(showPassBtn).toBeVisible();
    await showPassBtn.click();
    await expect(newPassInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide passphrase' }).click();
    await expect(newPassInput).toHaveAttribute('type', 'password');

    // Test entering matching valid password turns enabled and hides mismatch error
    await confirmPassInput.fill('secret123');
    await expect(saveBtn).toBeEnabled();
    await expect(page.getByText("The passwords don't match")).toHaveCount(0);

    // Clear password inputs
    await newPassInput.fill('');
    await confirmPassInput.fill('');
    await expect(saveBtn).toBeDisabled();

    // 4. Verify Localization & Formatting settings are grouped in the Personal Account view
    await expect(page.getByText('Display Language & Locales')).toBeVisible();
    await expect(page.getByText('Home Jurisdiction & Statutory Holidays')).toBeVisible();
    await expect(page.getByText('Currency & Monetary Conventions')).toBeVisible();
    await expect(page.getByText('Units & Time Standards')).toBeVisible();
    await expect(page.getByText('Distance Standard')).toBeVisible();

    // 5. Verify city dropdown is closed by default
    const cityInput = page.getByPlaceholder('e.g. Madrid, Paris, Tokyo...');
    await expect(cityInput).toBeVisible();
    // Dropdown list buttons should not be visible when input has not been focused/interacted with
    await page.waitForTimeout(400); // Wait past debounce time
    await expect(page.getByTestId('city-suggestions-dropdown')).toHaveCount(0);

    // 6. Verify badges on the right of names like "Credentials" are removed
    await expect(page.getByText('Credentials', { exact: true })).toHaveCount(0);
  });

  test('Appearance & Interface tab isolates themes, typography, navigation, and cartography via sub-tabs', async ({ page }) => {
    await page.goto('/config?tab=appearance');

    // 1. Default sub-tab shows Color Themes only
    await expect(page.getByRole('heading', { name: 'Pacific Jazz Visual Themes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Interface Typography Pairings' })).toHaveCount(0);

    // 2. Switch across horizontal sub-tabs cleanly
    await page.getByRole('tab', { name: 'Typography' }).click();
    await expect(page.getByRole('heading', { name: 'Interface Typography Pairings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pacific Jazz Visual Themes' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Navigation' }).click();
    await expect(page.getByText('Navigation Presentation')).toBeVisible();

    await page.getByRole('tab', { name: 'Cartography' }).click();
    await expect(page.getByText('Cartography & Map Layers')).toBeVisible();
  });

  test('Other settings tabs are accessible and render isolated sections cleanly', async ({ page }) => {
    // Engine Solver tab (includes Meal Allocation Windows, excludes Transit & Deals)
    await page.goto('/config?tab=solver');
    await expect(page.getByText('Deterministic Solver Constraints & Pacing')).toBeVisible();
    await expect(page.getByText('Meal Allocation Windows (Minutes)')).toBeVisible();
    await expect(page.getByText('Deal Engine & Background Scrapers')).toHaveCount(0);

    // AI & LLM Engine tab (Agent Swarms & Critic and ML Taste Learning & RAG removed)
    await page.goto('/config?tab=llm');
    await expect(page.getByText('AI & Multi-Provider LLM Engine')).toBeVisible();
    await expect(page.getByText('Agent Swarms & Critic')).toHaveCount(0);
    await expect(page.getByText('ML Taste Learning & RAG')).toHaveCount(0);

    // Infrastructure Vault tab
    await page.goto('/config?tab=vault');
    await expect(page.getByText('Sovereign Data Vault & Media Sync')).toBeVisible();
  });

  test('Sidebar does not show separate Localization & Formatting category', async ({ page }) => {
    await page.goto('/config?tab=profile');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Localization & Formatting')).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: 'Personal Account' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Appearance & Interface' })).toBeVisible();
  });

  test('Notifications tab uses plural Notifications title and features Notification Types card before relays', async ({ page }) => {
    await page.goto('/config?tab=notifications');

    // 1. Verify tab title in sidebar is "Notifications"
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Notification Relays' })).toHaveCount(0);

    // 2. Verify Notification Types card is visible
    await expect(page.getByRole('heading', { name: 'Notification Types' })).toBeVisible();
    await expect(page.getByText('Flight & Hotel Price Drop Alerts')).toBeVisible();
    await expect(page.getByText('Itinerary & Route Schedule Updates')).toBeVisible();
    await expect(page.getByText('Ticket Ingestion & Extraction Complete')).toBeVisible();
    await expect(page.getByText('Vault Photo Sync Completion')).toBeVisible();

    // 3. Verify All and None quick selection pills are visible
    const allPill = page.getByRole('button', { name: 'All', exact: true });
    const nonePill = page.getByRole('button', { name: 'None', exact: true });
    await expect(allPill).toBeVisible();
    await expect(nonePill).toBeVisible();

    // 4. Verify Notification Relays card follows after
    await expect(page.getByRole('heading', { name: 'Notification Relays & External Alerts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pushify', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pushover & Ntfy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Custom Webhooks' })).toBeVisible();
    // Events sub-tab was extracted into the dedicated card above
    await expect(page.getByRole('button', { name: 'Event Triggers' })).toHaveCount(0);
  });
});

