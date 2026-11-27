import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Engine Cockpit - Guardrails Abort Red Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('displays red popup window with violation details when GUARDRAILS_ABORTED is received', async ({ page }) => {
    let activeSocket: { send: (data: string) => void } | null = null;
    let isAborted = false;
    const violations = [
      'Departure date 2020-01-01 is in the past. Real-world trips cannot begin in the past.',
      'Trip duration of 45 days exceeds maximum limit of 30 days.',
    ];

    await page.routeWebSocket(/.*\/api(\/v1)?\/ws\/stream.*/, (ws) => {
      activeSocket = ws;
    });

    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs\/[^/]+\/acknowledge\/?$/, async (route) => {
      isAborted = false;
      await route.fulfill({ status: 204, body: '' });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs\/?$/, async (route) => {
      const nowIso = new Date().toISOString();
      const jobs = isAborted
        ? [
            {
              id: 'job-abort-1',
              thread_id: 'paladio_job-abort-1',
              destination: 'Paris',
              title: 'Trip to Paris',
              status: 'aborted',
              stage: 'GUARDRAILS_ABORTED',
              prompt: 'Test trip',
              guardrail_errors: violations,
              acknowledged: false,
              created_at: nowIso,
              updated_at: nowIso,
              completed_at: nowIso,
            },
          ]
        : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jobs) });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/generate\/?$/, async (route) => {
      isAborted = true;
      const nowIso = new Date().toISOString();
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'job-abort-1',
          thread_id: 'paladio_job-abort-1',
          destination: 'Paris',
          title: 'Trip to Paris',
          status: 'running',
          stage: 'STARTING_INFERENCE',
          prompt: 'Test trip',
          acknowledged: false,
          created_at: nowIso,
          updated_at: nowIso,
        }),
      });
      setTimeout(() => {
        activeSocket?.send(
          JSON.stringify({
            event: 'TRIP_JOB_ABORTED',
            status: 'aborted',
            job_id: 'job-abort-1',
            destination: 'Paris',
            guardrail_errors: violations,
          })
        );
      }, 100);
    });

    await page.goto('/engine');

    // Click launch button to initiate
    const launchBtn = page.getByRole('button', { name: /Generate Sovereign Trip Plan/i });
    await expect(launchBtn).toBeVisible();
    await launchBtn.click();

    // Verify modal pops up
    const modalTitle = page.getByText('[GUARDRAILS ABORTED] TRIP REJECTED');
    await expect(modalTitle).toBeVisible();

    // Verify error messages appear inside the modal
    await expect(
      page.getByRole('listitem').filter({
        hasText: 'Departure date 2020-01-01 is in the past. Real-world trips cannot begin in the past.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({
        hasText: 'Trip duration of 45 days exceeds maximum limit of 30 days.',
      })
    ).toBeVisible();

    // Verify the confirm button has red danger color (--color-danger: #B3261E -> rgb(179, 38, 30))
    const dismissBtn = page.getByRole('button', { name: 'DISMISS & EDIT' });
    await expect(dismissBtn).toBeVisible();
    const btnBg = await dismissBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgb(179, 38, 30)', 'rgb(220, 38, 38)']).toContain(btnBg);

    // Click DISMISS & EDIT to close the modal
    await dismissBtn.click();

    // Verify modal is dismissed
    await expect(modalTitle).not.toBeVisible();

    // Verify trip submission button is visible again
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).toBeVisible();
  });
});
