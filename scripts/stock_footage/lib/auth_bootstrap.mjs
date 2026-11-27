import fs from 'node:fs';
import path from 'node:path';
import {
  chromium,
  BASE_URL,
  RECORD_USER,
  RECORD_PASSWORD,
  AUTH_STATE_PATH,
  waitForAppReady,
} from './recorder_lib.mjs';

async function main() {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    console.log(`[auth_bootstrap] Logging into ${BASE_URL}/login as '${RECORD_USER}'...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

    const identifierInput = page.locator('#identifier-input');
    await identifierInput.waitFor({ state: 'visible', timeout: 15000 });
    await identifierInput.fill(RECORD_USER);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(RECORD_PASSWORD);

    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 25000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);

    await waitForAppReady(page);
    await context.storageState({ path: AUTH_STATE_PATH });

    const stat = fs.statSync(AUTH_STATE_PATH);
    if (!stat.size) {
      throw new Error(`Auth state written to ${AUTH_STATE_PATH} is empty`);
    }
    console.log(`[auth_bootstrap] Saved storageState (${stat.size} bytes) -> ${AUTH_STATE_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[auth_bootstrap] Failed:', err?.message || err);
  process.exit(1);
});
