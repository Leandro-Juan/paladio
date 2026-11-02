import { defineConfig, devices } from '@playwright/experimental-ct-react';

export default defineConfig({
  testDir: './tests/components',
  timeout: 10000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
    ctPort: 3100,
    launchOptions: {
      args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
