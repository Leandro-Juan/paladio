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

    // Test entering mismatched password stays disabled
    await newPassInput.fill('secret123');
    await confirmPassInput.fill('mismatch456');
    await expect(saveBtn).toBeDisabled();

    // Test entering matching valid password turns enabled
    await confirmPassInput.fill('secret123');
    await expect(saveBtn).toBeEnabled();

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
    await expect(page.getByRole('button', { name: /Spain/i })).toHaveCount(0);

    // 6. Verify badges on the right of names like "Credentials" are removed
    await expect(page.getByText('Credentials', { exact: true })).toHaveCount(0);
  });

  test('Appearance & Interface tab consolidates themes, typography, navigation, and cartography in 1 tab', async ({ page }) => {
    await page.goto('/config?tab=appearance');

    // 1. Verify all 4 visual & interface sections are present in this single tab
    await expect(page.getByText('Pacific Jazz Visual Themes')).toBeVisible();
    await expect(page.getByText('Interface Typography Pairings')).toBeVisible();
    await expect(page.getByText('Navigation Presentation')).toBeVisible();
    await expect(page.getByText('Cartography & Map Layers')).toBeVisible();
  });

  test('Other settings tabs are accessible and render correctly', async ({ page }) => {
    // Engine Solver tab
    await page.goto('/config?tab=solver');
    await expect(page.getByText('Deterministic Solver Constraints & Pacing')).toBeVisible();

    // AI & Swarm tab
    await page.goto('/config?tab=swarm');
    await expect(page.getByText('LangGraph Multi-Agent Swarm & Critic')).toBeVisible();

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

  test('Notification tab is renamed to Notification and features Notification Types card with All/None pill before relays', async ({ page }) => {
    await page.goto('/config?tab=notifications');

    // 1. Verify tab title in sidebar is "Notification" and not "Notification Relays"
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('button', { name: 'Notification', exact: true })).toBeVisible();
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

