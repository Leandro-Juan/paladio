import { test, expect } from '@playwright/experimental-ct-react';
import { HotelStayAnchorBar } from '../../src/components/trip-creation/HotelStayAnchorBar';

test.describe('HotelStayAnchorBar Check-In & Check-Out Controls', () => {
  test('renders hotel check-in and check-out date & time controls and fires callbacks', async ({ mount }) => {
    test.setTimeout(30000);
    let latestCheckInDate = '';
    let latestCheckOutDate = '';
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
        onCheckInDateChange={(val) => { latestCheckInDate = val; }}
        onCheckOutDateChange={(val) => { latestCheckOutDate = val; }}
        onCheckInHourChange={(val) => { latestCheckInHour = val; }}
        onCheckOutHourChange={(val) => { latestCheckOutHour = val; }}
        onChange={() => {}}
      />
    );

    const cinDateInput = component.getByLabel('Hotel check-in date');
    const coutDateInput = component.getByLabel('Hotel check-out date');
    await expect(cinDateInput).toHaveValue('2026-12-01');
    await expect(coutDateInput).toHaveValue('2026-12-05');

    await cinDateInput.fill('2026-12-02', { timeout: 3000 });
    await coutDateInput.fill('2026-12-04', { timeout: 3000 });
    expect(latestCheckInDate).toBe('2026-12-02');
    expect(latestCheckOutDate).toBe('2026-12-04');

    const cinTimeBtn = component.getByTestId('hotel-checkin-time-btn');
    const coutTimeBtn = component.getByTestId('hotel-checkout-time-btn');
    await expect(cinTimeBtn).toContainText('15:00');
    await expect(coutTimeBtn).toContainText('11:00');

    await cinTimeBtn.click();
    await expect(component.getByText('Hotel Check-In Time')).toBeVisible();
    await component.getByRole('button', { name: '16', exact: true }).first().click();
    expect(latestCheckInHour).toBe('16:00');
    await component.getByRole('button', { name: 'Confirm Time' }).click();

    await coutTimeBtn.click();
    await expect(component.getByText('Hotel Check-Out Time')).toBeVisible();
    await component.getByRole('button', { name: '10', exact: true }).first().click();
    expect(latestCheckOutHour).toBe('10:00');
    await component.getByRole('button', { name: 'Confirm Time' }).click();
  });

  test('clamps check-out date when check-in exceeds it and clears coordinates on manual edit', async ({ mount }) => {
    test.setTimeout(30000);
    let latestCheckInDate = '2026-12-01';
    let latestCheckOutDate = '2026-12-03';
    const changeCalls: Array<{ name: string; extra?: { address?: string; lat?: number; lng?: number } }> = [];

    const component = await mount(
      <HotelStayAnchorBar
        hotelArea="Hotel Ritz"
        hotelAddress="15 Place Vendome"
        hotelLat={48.868}
        hotelLng={2.328}
        destination="Paris"
        checkInDate="2026-12-01"
        checkOutDate="2026-12-03"
        tripStartDate="2026-12-01"
        tripEndDate="2026-12-10"
        onCheckInDateChange={(val) => { latestCheckInDate = val; }}
        onCheckOutDateChange={(val) => { latestCheckOutDate = val; }}
        onChange={(name, extra) => { changeCalls.push({ name, extra }); }}
      />
    );

    await expect(component.getByTestId('hotel-verified-tick')).toBeVisible();

    // Moving check-in past check-out must advance check-out to prevent inverted range
    await component.getByLabel('Hotel check-in date').fill('2026-12-06');
    expect(latestCheckInDate).toBe('2026-12-06');
    expect(latestCheckOutDate).toBe('2026-12-06');

    // Editing hotel name manually invokes onChange without stale coordinates
    const input = component.locator('input[type="text"]');
    await input.fill('My Unlisted Stay');
    const lastCall = changeCalls[changeCalls.length - 1];
    expect(lastCall.name).toBe('My Unlisted Stay');
    expect(lastCall.extra).toBeUndefined();
  });
});
