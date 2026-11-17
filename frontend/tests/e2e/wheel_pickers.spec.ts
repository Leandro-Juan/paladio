import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Wheel Dial Pickers (Language, Country, Currency)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/config?tab=profile');
  });

  test('Language wheel picker opens, allows searching, spins, and selects language', async ({ page }) => {
    const changeLangBtn = page.getByTestId('change-language-button');
    await expect(changeLangBtn).toBeVisible();
    await changeLangBtn.click();

    // Verify modal dialog with Wheel Dial Picker opens
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('Search language or code...')).toBeVisible();

    // Search for Spanish
    await dialog.getByPlaceholder('Search language or code...').fill('Spanish');
    const actionBtn = dialog.getByRole('button', { name: /Use Spanish/i });
    await expect(actionBtn).toBeVisible({ timeout: 5000 });
    await actionBtn.click();

    // Verify modal closed
    await expect(dialog).toHaveCount(0);

    // Reopen and test Chinese (Simplified)
    await changeLangBtn.click();
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('Search language or code...').fill('Chinese');
    const zhBtn = dialog.getByRole('button', { name: /Use Chinese \(Simplified\)/i });
    await expect(zhBtn).toBeVisible({ timeout: 5000 });
    await expect(zhBtn).toContainText('ZH-CN');
    await zhBtn.click();
    await expect(dialog).toHaveCount(0);
  });

  test('Statutory Country wheel picker opens, allows searching, spins, and selects country', async ({ page }) => {
    const countryTriggerBtn = page.getByTestId('statutory-country-button');
    await expect(countryTriggerBtn).toBeVisible();
    await countryTriggerBtn.click();

    // Verify modal dialog with Wheel Dial Picker opens
    const dialog = page.getByRole('dialog', { name: /Select Statutory Country/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('Search country or code...')).toBeVisible();

    // Search for Japan
    await dialog.getByPlaceholder('Search country or code...').fill('Japan');
    const actionBtn = dialog.getByRole('button', { name: /Use Japan \(JP\)/i });
    await expect(actionBtn).toBeVisible({ timeout: 5000 });
    await actionBtn.click();

    // Verify modal closed and button shows Japan
    await expect(dialog).toHaveCount(0);
    await expect(countryTriggerBtn).toContainText('Japan (JP)');

    // Reopen modal to verify strange 3-letter codes like AFG / ABW do not exist
    await countryTriggerBtn.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('AFG (AFG)')).toHaveCount(0);
    await expect(dialog.getByText('ABW (ABW)')).toHaveCount(0);
    await dialog.getByLabel('Close').click();
    await expect(dialog).toHaveCount(0);
  });

  test('Currency wheel picker opens, allows searching, spins, and selects currency', async ({ page }) => {
    const changeCurrencyBtn = page.getByRole('button', { name: 'Change Base Currency', exact: true });
    await expect(changeCurrencyBtn).toBeVisible();
    await changeCurrencyBtn.click();

    // Verify modal dialog with Wheel Dial Picker opens
    const dialog = page.getByRole('dialog', { name: /Select Currency/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('Search country or currency...')).toBeVisible();

    // Search for USD
    await dialog.getByPlaceholder('Search country or currency...').fill('USD');
    const actionBtn = dialog.getByRole('button', { name: /Use United States — USD/i });
    await expect(actionBtn).toBeVisible({ timeout: 5000 });
    await actionBtn.click();

    // Verify modal closed
    await expect(dialog).toHaveCount(0);
  });
});
