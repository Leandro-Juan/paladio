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
    await expect(page.getByText('masteradmin', { exact: true })).toBeVisible();
    await expect(page.getByText('ADMIN').first()).toBeVisible();

    // Verify Configuration link is removed from sidebar navigation
    await expect(page.locator('nav.sidebar').getByRole('link', { name: /Configuration/i })).not.toBeVisible();

    // 3. Navigate to Configuration tab via User Menu Settings
    const userMenuBtn = page.getByRole('button', { name: /User menu/i });
    await expect(userMenuBtn).toBeVisible();
    await userMenuBtn.click();

    const settingsBtn = page.getByRole('menuitem', { name: /Settings/i });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
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

    // 8. Sign Out via User Menu
    await userMenuBtn.click();
    const signoutBtn = page.getByRole('menuitem', { name: /Log out/i });
    await expect(signoutBtn).toBeVisible();
    await signoutBtn.click();

    // Should return to /login
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('displays PFP on config page, allows profile editing, and removes version label from sidebar header', async ({ page }) => {
    let currentUser = {
      id: 'admin-id-01',
      username: 'masteradmin',
      email: 'admin@paladio.internal',
      role: 'admin',
      is_active: true,
      preferences: { avatar_url: 'https://example.com/avatar.png' },
      created_at: new Date().toISOString(),
    };

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
        body: JSON.stringify(currentUser),
      });
    });

    await page.route('**/api/v1/users/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([currentUser]),
      });
    });

    await page.route('**/api/v1/users/me', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      currentUser = {
        ...currentUser,
        username: body.username || currentUser.username,
        email: body.email !== undefined ? body.email : currentUser.email,
        preferences: {
          ...currentUser.preferences,
          avatar_url: body.avatar_url || currentUser.preferences?.avatar_url,
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentUser),
      });
    });

    await page.route('**/api/v1/trips/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/config');

    // 1. Verify sidebar header does NOT show "// v1.1.0 ENGINE"
    const sidebar = page.locator('nav.sidebar');
    await expect(sidebar.getByText(/ENGINE/i)).not.toBeVisible();
    await expect(sidebar.getByText(/v1\.1\.0/i)).not.toBeVisible();

    // 2. Verify Authorized Users table has the PFP image on the left of username
    const userRow = page.locator('table tbody tr').first();
    const avatarImg = userRow.locator('img[alt="masteradmin"]');
    await expect(avatarImg).toBeVisible();
    await expect(avatarImg).toHaveAttribute('src', 'https://example.com/avatar.png');

    // 3. Open Edit Modal via Edit button
    const editBtn = userRow.getByRole('button', { name: 'Edit' });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // 4. Verify edit modal is open
    const modal = page.locator('[data-testid="edit-user-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: /Edit Your Profile/i })).toBeVisible();

    // 5. Change username and clear email (making it optional)
    await page.fill('input[placeholder="e.g. navigator"]', 'updatedadmin');
    await page.fill('input[placeholder="navigator@paladio.internal (optional)"]', '');
    await page.click('button:has-text("SAVE CHANGES")');

    // 6. Modal closes and update is reflected
    await expect(modal).not.toBeVisible();
    await expect(page.getByText('User updatedadmin profile updated successfully.')).toBeVisible();
    await expect(userRow.getByText('updatedadmin', { exact: true })).toBeVisible();
    await expect(userRow.getByText('None')).toBeVisible();
  });
});
