import { Page } from '@playwright/test';

export async function mockPaladioWebSocket(page: Page) {
  await page.routeWebSocket(/.*\/api\/v1\/ws\/stream.*/, (ws) => {
    ws.onMessage((message) => {
      try {
        const parsed = JSON.parse(typeof message === 'string' ? message : message.toString());
        if (parsed.action === 'attach') {
          // Acknowledge attach if needed
        }
      } catch {
        // ignore
      }
    });
  });
}

export async function mockAuthenticatedUser(page: Page, role: 'admin' | 'user' = 'admin') {
  await page.addInitScript(() => {
    localStorage.setItem('paladio_token', 'mock-valid-token');
  });

  await mockPaladioWebSocket(page);

  await page.route('**/api/v1/auth/setup-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setup_required: false, user_count: 1 }),
    });
  });

  await page.route(/.*\/api\/v1\/trips.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-user-123',
        email: `${role}@paladio.internal`,
        username: role === 'admin' ? 'admin' : 'traveler',
        role: role,
        is_active: true,
        preferences: {},
        has_embedding: false,
        created_at: new Date().toISOString(),
      }),
    });
  });
}
