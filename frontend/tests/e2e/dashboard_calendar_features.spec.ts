import { test, expect } from '@playwright/test';
import { getCorsHeaders, mockAuthenticatedUser } from './test-utils';

test.describe('Dashboard Calendar Features', () => {
  test('past days styling, holiday cursor toggle, and monitored deals', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const now = new Date();
    const y = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, '0');
    const departObj = now.getMonth() === 11 && now.getDate() > 25 ? new Date(y, 11, 20) : new Date(y, now.getMonth(), now.getDate() + 2);
    const returnRaw = new Date(departObj.getFullYear(), departObj.getMonth(), departObj.getDate() + 4);
    const returnObj = returnRaw.getFullYear() === y ? returnRaw : new Date(y, 11, 31);
    const departDate = `${departObj.getFullYear()}-${pad(departObj.getMonth() + 1)}-${pad(departObj.getDate())}`;
    const returnDate = `${returnObj.getFullYear()}-${pad(returnObj.getMonth() + 1)}-${pad(returnObj.getDate())}`;

    // Mock monitored deals API
    await page.route(/.*\/api(\/v1)?\/market\/routes-best-deals.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'deal-test-1',
            alert_id: 'route-test-1',
            candidate_id: 'cand-1',
            origin_iata: 'MAD',
            destination_code: 'FCO',
            origin_name: 'Madrid',
            destination_name: 'Rome',
            depart_date: departDate,
            return_date: returnDate,
            nights: 4,
            total_price_eur: 140,
            baseline_median_eur: 200,
            savings_eur: 60,
            discount_pct: 30,
            package_ratio: 0.7,
            realism_score: 9.2,
            status: 'ACTIVE',
            detected_at: new Date().toISOString(),
            currency: 'EUR',
            flight: {
              carrier: 'Iberia',
              flight_number: 'IB3230',
              duration_mins: 150,
              departure_time: `${departDate}T09:00:00`,
              booking_url: null,
              price_eur: 70,
            },
            return_flight: {
              carrier: 'Iberia',
              flight_number: 'IB3231',
              duration_mins: 155,
              departure_time: `${returnDate}T18:00:00`,
              booking_url: null,
              price_eur: 70,
            },
          },
        ]),
      });
    });

    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // 1. Verify past days have past styling in Annual View
    const pastMiniDays = page.locator('[class*="miniDayCellPast"]');
    await expect(pastMiniDays.first()).toBeVisible();
    const pastCount = await pastMiniDays.count();
    expect(pastCount).toBeGreaterThan(0);

    // 2. Verify Holiday / PTO button toggles mode and applies white pencil cursor
    const holidayBtn = page.getByRole('button', { name: /Mark Holidays/i });
    await expect(holidayBtn).toBeVisible();

    // Click to activate Holiday mode
    await holidayBtn.click();
    const calendarActive = page.locator('[class*="holidayPaintingActive"]');
    await expect(calendarActive).toBeVisible();

    // Verify cursor style contains svg pencil
    const cursor = await calendarActive.evaluate((el) => {
      return window.getComputedStyle(el).cursor;
    });
    expect(cursor).toContain('url(');

    // Click again to toggle back to normal mode
    await holidayBtn.click();
    await expect(page.locator('[class*="holidayPaintingActive"]')).toHaveCount(0);

    // 3. Verify monitored deals are rendered
    const dealBadges = page.locator('[class*="miniMonitoredDealBadge"]');
    await expect(dealBadges.first()).toBeVisible({ timeout: 10000 });
    const dealsCount = await dealBadges.count();
    expect(dealsCount).toBeGreaterThan(0);

    // 4. Click a deal badge and verify navigation to monitored route
    await dealBadges.first().click();
    await page.waitForURL(/\/monitoring\?route=/, { timeout: 10000 });
    expect(page.url()).toContain('/monitoring?route=');

    // 5. Navigate back to dashboard and switch to Month Focus view
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const monthViewBtn = page.getByRole('button', { name: /Month Focus/i });
    await monthViewBtn.click();

    // Verify Month view has past days
    const pastMonthDays = page.locator('[class*="dayCellPast"]');
    await expect(pastMonthDays.first()).toBeVisible();
  });
});
