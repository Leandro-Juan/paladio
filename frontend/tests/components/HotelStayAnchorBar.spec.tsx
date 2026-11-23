import { test, expect } from '@playwright/experimental-ct-react';
import { HotelStayAnchorBar } from '../../src/components/trip-creation/HotelStayAnchorBar';

test.describe('HotelStayAnchorBar Check-In & Check-Out Controls', () => {
  test('renders static trip start/end dates (no date inputs) and supports dial + manual time entry', async ({ mount }) => {
    test.setTimeout(30000);
    let latestCheckInHour = '';
    let latestCheckOutHour = '';

    const component = await mount(
      <HotelStayAnchorBar
        hotelArea="Hotel Le Marais"
        destination="Paris"
        checkInDate="2026-12-01"
        checkOutDate="2026-12-05"
        checkInHour="15:00"
        checkOutHour="11:00"
        tripStartDate="2026-12-01"
        tripEndDate="2026-12-05"
        onCheckInHourChange={(val) => { latestCheckInHour = val; }}
        onCheckOutHourChange={(val) => { latestCheckOutHour = val; }}
        onChange={() => {}}
      />
    );

    await expect(component.locator('input[type="date"]')).toHaveCount(0);
    await expect(component.getByTestId('hotel-checkin-date-text')).toHaveText('2026-12-01');
    await expect(component.getByTestId('hotel-checkout-date-text')).toHaveText('2026-12-05');

    const cinTimeBtn = component.getByTestId('hotel-checkin-time-btn');
    const coutTimeBtn = component.getByTestId('hotel-checkout-time-btn');
    await expect(cinTimeBtn).toContainText('15:00');
    await expect(coutTimeBtn).toContainText('11:00');

    // Dial selection
    await cinTimeBtn.click();
    await expect(component.getByText('Hotel Check-In Time')).toBeVisible();
    await component.getByRole('button', { name: '16', exact: true }).first().click();
    expect(latestCheckInHour).toBe('16:00');
    await component.getByRole('button', { name: 'Confirm Time' }).click();

    // Manual time entry
    await coutTimeBtn.click();
    await expect(component.getByText('Hotel Check-Out Time')).toBeVisible();
    const manualInput = component.getByTestId('manual-time-input');
    await manualInput.fill('09:37');
    await manualInput.press('Enter');
    expect(latestCheckOutHour).toBe('09:37');
  });

  test('displays tripStartDate/tripEndDate and clears coordinates on manual edit', async ({ mount }) => {
    test.setTimeout(30000);
    const changeCalls: Array<{ name: string; extra?: { address?: string; lat?: number; lng?: number } }> = [];

    const component = await mount(
      <HotelStayAnchorBar
        hotelArea="Hotel Ritz"
        hotelAddress="15 Place Vendome"
        hotelLat={48.868}
        hotelLng={2.328}
        destination="Paris"
        checkInDate="2026-12-02"
        checkOutDate="2026-12-04"
        tripStartDate="2026-12-01"
        tripEndDate="2026-12-10"
        onChange={(name, extra) => { changeCalls.push({ name, extra }); }}
      />
    );

    await expect(component.getByTestId('hotel-verified-tick')).toBeVisible();
    await expect(component.getByTestId('hotel-checkin-date-text')).toHaveText('2026-12-01');
    await expect(component.getByTestId('hotel-checkout-date-text')).toHaveText('2026-12-10');

    // Editing hotel name manually invokes onChange without stale coordinates
    const input = component.locator('input[type="text"]');
    await input.fill('My Unlisted Stay');
    const lastCall = changeCalls[changeCalls.length - 1];
    expect(lastCall.name).toBe('My Unlisted Stay');
    expect(lastCall.extra).toBeUndefined();
  });
});
