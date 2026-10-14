import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.resolve(__dirname, '../ui-baseline/after');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const widths = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const mockTrip = {
  id: 'mock-trip-1',
  destination: 'Kyoto, Japan',
  start_date: '2026-11-01',
  end_date: '2026-11-05',
  participants: [{ id: 'mock-user-123', name: 'admin', role: 'admin' }],
  itinerary_data: {
    days: [
      {
        day: 1,
        date: '2026-11-01',
        theme: 'Historical Shrines',
        places: [
          { name: 'Fushimi Inari-taisha', lat: 34.9671, lng: 135.7727, category: 'landmark' },
          { name: 'Kiyomizu-dera', lat: 34.9949, lng: 135.7850, category: 'temple' }
        ]
      }
    ]
  }
};

const pagesToCapture = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'trips', path: '/trips' },
  { name: 'trip_workspace_plan', path: '/trips/mock-trip-1?tab=plan' },
  { name: 'trip_workspace_costs', path: '/trips/mock-trip-1?tab=costs' },
  { name: 'trip_workspace_wallet', path: '/trips/mock-trip-1?tab=wallet' },
  { name: 'trip_workspace_collab', path: '/trips/mock-trip-1?tab=collab' },
  { name: 'trip_workspace_photos', path: '/trips/mock-trip-1?tab=photos' },
  { name: 'vault', path: '/vault' },
  { name: 'vault_detail', path: '/vault/mock-trip-1' },
  { name: 'engine', path: '/engine' },
  { name: 'config', path: '/config' },
  { name: 'login', path: '/login' },
  { name: 'setup', path: '/setup' },
];

async function setupMocks(page) {
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

  await page.route(/.*\/api\/v1\/trips\/mock-trip-1.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTrip),
    });
  });

  await page.route(/.*\/api\/v1\/trips$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockTrip]),
    });
  });

  await page.route(/.*\/api\/v1\/trips\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockTrip]),
    });
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-user-123',
        email: 'admin@paladio.internal',
        username: 'admin',
        role: 'admin',
        is_active: true,
        preferences: {},
        has_embedding: false,
        created_at: new Date().toISOString(),
      }),
    });
  });
}

(async () => {
  console.log('📸 Launching Chromium to capture Phase 8 (after) baseline screenshots...');
  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });

  for (const { width, height } of widths) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await setupMocks(page);

    for (const item of pagesToCapture) {
      const url = `${BASE_URL}${item.path}`;
      const outFile = path.join(outDir, `${item.name}_${width}.png`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: outFile, fullPage: false });
        console.log(`✓ Saved ${item.name}_${width}.png`);
      } catch (err) {
        console.warn(`! Failed ${item.name}_${width}: ${err.message}`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log('✅ After screenshots captured successfully in ui-baseline/after/ !');
})();
