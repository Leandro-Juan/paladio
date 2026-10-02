import { test, expect } from '@playwright/experimental-ct-react';
import { CurrencyConverterWidget } from '../../src/components/CurrencyConverterWidget';

test.describe('CurrencyConverterWidget Component', () => {
  test('renders with default 1 EUR to USD and allows swapping and amount updates', async ({ mount }) => {
    const component = await mount(<CurrencyConverterWidget />);

    // Verify labels and structure
    await expect(component.getByText('CURRENCY CONVERSION')).toBeVisible();
    await expect(component.getByText('// SOVEREIGN FX & RATE CONVERTER')).toBeVisible();
    await expect(component.getByText('ORIGIN [FROM]')).toBeVisible();
    await expect(component.getByText('TARGET [TO]')).toBeVisible();

    // Verify default amount is 1
    const originInput = component.getByLabel('Origin Amount');
    await expect(originInput).toHaveValue('1');

    // Verify default selected currencies
    const fromSelect = component.getByLabel('Origin Currency');
    const toSelect = component.getByLabel('Target Currency');
    await expect(fromSelect).toHaveValue('EUR');
    await expect(toSelect).toHaveValue('USD');

    // Test swap button
    const swapButton = component.getByLabel('Swap currencies');
    await swapButton.click();

    // After swap, from should be USD and to should be EUR
    await expect(fromSelect).toHaveValue('USD');
    await expect(toSelect).toHaveValue('EUR');

    // Test updating amount
    await originInput.fill('100');
    await expect(originInput).toHaveValue('100');
  });
});
