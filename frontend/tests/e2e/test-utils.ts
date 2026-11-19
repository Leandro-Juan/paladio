import { Page, Route } from '@playwright/test';

export function getCorsHeaders(route: Route) {
  const origin = route.request().headers()['origin'] || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept, origin',
  };
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:3000',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, origin',
};

export async function mockPaladioWebSocket(page: Page) {
  await page.routeWebSocket(/.*\/api(\/v1)?\/ws\/stream.*/, (ws) => {
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

  await page.route(/.*\/api\/.*/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: getCorsHeaders(route),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: getCorsHeaders(route),
      contentType: 'application/json',
      body: JSON.stringify({ setup_required: false, user_count: 1 }),
    });
  });

  await page.route(/.*\/api(\/v1)?\/trips.*/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: getCorsHeaders(route),
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(/.*\/api(\/v1)?\/(auth|users)\/me/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: getCorsHeaders(route),
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
