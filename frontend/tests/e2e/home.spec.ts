import { test, expect } from '@playwright/test';

test('has title and welcome message', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Paladio/i);

  // Expect a heading with specific text
  const heading = page.getByRole('heading', { name: /Welcome to Paladio/i });
  await expect(heading).toBeVisible();
});
