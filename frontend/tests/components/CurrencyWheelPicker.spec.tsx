import { test, expect } from '@playwright/experimental-ct-react';
import { CurrencyWheelPicker } from '../../src/components/trip-workspace/costs/CurrencyWheelPicker';

test.describe('CurrencyWheelPicker Component', () => {
  test('prioritizes default currency first and targeted country currency second', async ({ mount, page }) => {
    let selected = '';
    await mount(
      <CurrencyWheelPicker
        isOpen={true}
        onClose={() => {}}
        selectedCurrency="EUR"
        defaultCurrency="EUR"
        destinationCurrency="JPY"
        onSelectCurrency={(cur) => {
          selected = cur.code;
        }}
      />
    );

    // Verify modal title and instructions are displayed in portal
    await expect(page.getByText('Select Currency')).toBeVisible();
    await expect(page.getByText('Drag, scroll, or search to spin wheel')).toBeVisible();

    // Verify default currency (EUR) and destination currency (JPY) are present
    await expect(page.getByText('European Union', { exact: true })).toBeVisible();
    await expect(page.getByText('EUR (€)', { exact: true })).toBeVisible();
    await expect(page.getByText('Japan', { exact: true })).toBeVisible();
    await expect(page.getByText('JPY (¥)', { exact: true })).toBeVisible();

    // Verify click on item selects it
    await page.getByText('Japan', { exact: true }).click();
    const confirmButton = page.getByRole('button', { name: /Use Japan/i });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
    expect(selected).toBe('JPY');
  });
});
