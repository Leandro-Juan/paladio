import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Engine Cockpit - Guardrails Abort Red Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('displays red popup window with violation details when GUARDRAILS_ABORTED is received', async ({ page }) => {
    // Intercept websocket and send GUARDRAILS_ABORTED event on message
    await page.routeWebSocket(/.*\/api\/v1\/ws\/stream.*/, (ws) => {
      ws.onMessage((msg) => {
        try {
          const parsed = JSON.parse(typeof msg === 'string' ? msg : msg.toString());
          if (parsed.action === 'chat') {
            ws.send(
              JSON.stringify({
                event: 'GUARDRAILS_ABORTED',
                status: 'aborted',
                data: [
                  'Departure date 2020-01-01 is in the past. Real-world trips cannot begin in the past.',
                  'Trip duration of 45 days exceeds maximum limit of 30 days.',
                ],
              })
            );
          }
        } catch {
          // ignore
        }
      });
    });

    await page.goto('/engine');

    // Click launch button to initiate
    const launchBtn = page.getByRole('button', { name: /INITIALIZE SOLVER/i });
    await expect(launchBtn).toBeVisible();
    await launchBtn.click();

    // Verify modal pops up
    const modalTitle = page.getByText('[GUARDRAILS ABORTED] TRIP REJECTED');
    await expect(modalTitle).toBeVisible();

    // Verify error messages appear inside the modal
    await expect(
      page.getByText('Departure date 2020-01-01 is in the past. Real-world trips cannot begin in the past.')
    ).toBeVisible();
    await expect(
      page.getByText('Trip duration of 45 days exceeds maximum limit of 30 days.')
    ).toBeVisible();

    // Verify the confirm button has red danger color (#DC2626 -> rgb(220, 38, 38))
    const dismissBtn = page.getByRole('button', { name: 'DISMISS & EDIT' });
    await expect(dismissBtn).toBeVisible();
    const btnBg = await dismissBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(btnBg).toBe('rgb(220, 38, 38)');

    // Click DISMISS & EDIT to close the modal
    await dismissBtn.click();

    // Verify modal is dismissed
    await expect(modalTitle).not.toBeVisible();

    // Verify active tab is switched back to Mission Preparation
    await expect(page.getByRole('button', { name: /INITIALIZE SOLVER/i })).toBeVisible();
  });
});
