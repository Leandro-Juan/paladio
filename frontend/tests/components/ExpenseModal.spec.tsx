import { test, expect } from '@playwright/experimental-ct-react';
import { ExpenseModal } from '../../src/components/trip-workspace/costs/ExpenseModal';

test.describe('ExpenseModal Component', () => {
  test('allows changing currency via wheel spinner and displays live converted default currency', async ({ mount, page }) => {
    let savedData: any = null;

    await mount(
      <ExpenseModal
        participants={[
          {
            id: 'p-1',
            trip_id: 'trip-1',
            name: 'Alice',
            role: 'organizer',
            created_at: new Date().toISOString(),
          },
          {
            id: 'p-2',
            trip_id: 'trip-1',
            name: 'Bob',
            role: 'traveler',
            created_at: new Date().toISOString(),
          },
        ]}
        defaultCurrency="EUR"
        destinationCurrency="JPY"
        onClose={() => {}}
        onSave={async (data) => {
          savedData = data;
          return true;
        }}
      />
    );

    // Verify modal is rendered
    await expect(page.getByText('Add Trip Expense')).toBeVisible();

    // Fill description
    const descInput = page.getByPlaceholder('e.g. 4x4 hire, ten days');
    await descInput.fill('Tokyo Sushi Feast');

    // Fill amount in JPY (default destination currency is JPY)
    const amountInput = page.getByPlaceholder('0.00');
    await amountInput.fill('15000');

    // Verify live conversion preview to default currency (EUR) is shown
    await expect(page.getByText(/in default currency \(EUR\)/i)).toBeVisible();

    // Click the currency spinner button to open wheel picker
    const currencyButton = page.getByTitle('Change payment currency');
    await currencyButton.click();

    // Verify wheel picker is open and contains European Union (1st) and Japan (2nd)
    await expect(page.getByText('Select Currency')).toBeVisible();
    await expect(page.getByText('European Union', { exact: true })).toBeVisible();

    // Select European Union
    await page.getByText('European Union', { exact: true }).click();
    const confirmButton = page.getByRole('button', { name: /Use European Union/i });
    await confirmButton.click();

    // Verify button now displays EUR
    await expect(currencyButton).toContainText('EUR');

    // Submit the form
    await page.getByRole('button', { name: 'Save Expense' }).click();

    // Verify saved data has currency EUR and amount 15000
    expect(savedData).not.toBeNull();
    expect(savedData.currency).toBe('EUR');
    expect(savedData.amount).toBe(15000);
    expect(savedData.description).toBe('Tokyo Sushi Feast');
  });
});
