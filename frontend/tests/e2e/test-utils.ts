import { Page } from '@playwright/test';

export async function mockAuthenticatedUser(page: Page, role: 'admin' | 'user' = 'admin') {
  await page.addInitScript(() => {
    localStorage.setItem('paladio_token', 'mock-valid-token');
  });

  await page.route('**/api/v1/auth/setup-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setup_required: false, user_count: 1 }),
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
