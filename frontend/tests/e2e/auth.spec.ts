import { test, expect } from '@playwright/test';

test.describe('Authentication & User Management Flow', () => {
  test('unauthenticated visit to root redirects to /login', async ({ page }) => {
    await page.route('**/api/v1/auth/setup-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.goto('/');
    await expect(page).toHaveURL(/.*\/login/);

    const loginHeader = page.getByRole('heading', { name: /PALADIO/i });
    await expect(loginHeader).toBeVisible();

    const usernameLabel = page.getByText(/USERNAME OR EMAIL/i);
    await expect(usernameLabel).toBeVisible();

    const authBtn = page.getByRole('button', { name: /AUTHENTICATE/i });
    await expect(authBtn).toBeVisible();
  });

  test('first-run instance redirects unauthenticated user to /setup', async ({ page }) => {
    await page.route('**/api/v1/auth/setup-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: true, user_count: 0 }),
      });
    });

    await page.goto('/');
    await expect(page).toHaveURL(/.*\/setup/);

    const setupHeader = page.getByRole('heading', { name: /PALADIO SETUP/i });
    await expect(setupHeader).toBeVisible();

    const setupBtn = page.getByRole('button', { name: /INITIALIZE MASTER ADMINISTRATOR/i });
    await expect(setupBtn).toBeVisible();
  });

  test('logs in successfully and allows Master Admin to access /config and provision user', async ({ page }) => {
    let mockUsers = [
      {
        id: 'admin-id-01',
        username: 'masteradmin',
        email: 'admin@paladio.internal',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ];

    await page.route('**/api/v1/auth/setup-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'valid-admin-jwt',
          token_type: 'bearer',
          user: mockUsers[0],
        }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUsers[0]),
      });
    });

    await page.route('**/api/v1/users/', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const newUser = {
          id: 'user-id-02',
          username: body.username,
          email: body.email,
          role: body.role || 'user',
          is_active: true,
          created_at: new Date().toISOString(),
        };
        mockUsers.push(newUser);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newUser),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUsers),
        });
      }
    });

    await page.route('**/api/v1/trips/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // 1. Visit /login and authenticate
    await page.goto('/login');
    await page.fill('#identifier-input', 'masteradmin');
    await page.fill('#password-input', 'AdminPassword123!');
    await page.click('button[type="submit"]');

    // 2. Redirected to /dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Sidebar should display user info and role
    await expect(page.getByText('masteradmin')).toBeVisible();
    await expect(page.getByText('ADMIN').first()).toBeVisible();

    // 3. Navigate to Configuration tab
    const configLink = page.getByRole('link', { name: /Configuration/i });
    await expect(configLink).toBeVisible();
    await configLink.click();
    await expect(page).toHaveURL(/.*\/config/);

    // 4. Verify Configuration components
    await expect(page.getByRole('heading', { name: /Instance Configuration/i })).toBeVisible();
    await expect(page.getByText('Sovereign Docker Telemetry')).toBeVisible();

    // 5. Open "PROVISION NEW USER" modal
    const provisionBtn = page.getByRole('button', { name: /PROVISION NEW USER/i });
    await expect(provisionBtn).toBeVisible();
    await provisionBtn.click();

    // 6. Fill and submit modal
    await page.fill('input[placeholder*="navigator"]', 'traveler2');
    await page.fill('input[placeholder*="navigator@paladio.internal"]', 'traveler2@paladio.internal');
    await page.fill('input[placeholder="Minimum 6 characters"]', 'TravelerSecret123!');
    await page.click('button:has-text("CREATE ACCOUNT")');

    // 7. Verify new user appears in table
    await expect(page.getByText('traveler2', { exact: true })).toBeVisible();
    await expect(page.getByText('traveler2@paladio.internal')).toBeVisible();

    // 8. Sign Out
    const signoutBtn = page.getByRole('button', { name: /DISCONNECT \/ SIGN OUT/i });
    await expect(signoutBtn).toBeVisible();
    await signoutBtn.click();

    // Should return to /login
    await expect(page).toHaveURL(/.*\/login/);
  });
});
