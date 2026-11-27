import { test, expect } from '@playwright/test';
import { getCorsHeaders, mockAuthenticatedUser } from './test-utils';

test.describe('Engine Trip Preparation Cockpit', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('renders initial cockpit with mode switcher and sovereign generation controls', async ({ page }) => {
    await page.goto('/engine');

    // Heading check
    const heading = page.getByRole('heading', { name: /NEW TRIP/i });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Verify mode switcher buttons are present
    const personalizedModeBtn = page.getByRole('button', { name: /Personalized Trip/i });
    const blankModeBtn = page.getByRole('button', { name: /Blank Trip/i });
    const uploadDocsBtn = page.getByRole('button', { name: /Upload Documents/i });
    await expect(personalizedModeBtn).toBeVisible();
    await expect(blankModeBtn).toBeVisible();
    await expect(uploadDocsBtn).toBeVisible();

    // Default mode is personalized: CTA and prompt textarea should be visible
    const launchBtn = page.getByRole('button', { name: /Generate Sovereign Trip Plan/i });
    await expect(launchBtn).toBeVisible();
    const promptArea = page.locator('textarea');
    await expect(promptArea).toBeVisible();
  });

  test('transitions smoothly between Personalized and Blank trip configurations', async ({ page }) => {
    await page.goto('/engine');

    // Click Blank Trip mode toggle
    const blankModeBtn = page.getByRole('button', { name: /Blank Trip/i });
    await blankModeBtn.click();

    const createBlankBtn = page.getByRole('button', { name: /Create Blank Canvas Trip/i });
    await expect(createBlankBtn).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).not.toBeVisible();

    // Click Personalized Trip mode toggle to switch back
    const personalizedModeBtn = page.getByRole('button', { name: /Personalized Trip/i });
    await personalizedModeBtn.click();

    // Verify Personalized Trip CTA button and prompt textarea return
    const launchBtn = page.getByRole('button', { name: /Generate Sovereign Trip Plan/i });
    await expect(launchBtn).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('captures visual screenshots of the trip creation flow', async ({ page }) => {
    await page.goto('/engine');
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).toBeVisible();
    await page.waitForTimeout(500);
    try {
      await page.screenshot({ path: 'test-results/trip_creation_personalized.png', animations: 'disabled' });
    } catch {
      // ignore headless screenshot protocol hiccups
    }

    await page.getByRole('button', { name: /Blank Trip/i }).click();
    await expect(page.getByRole('button', { name: /Create Blank Canvas Trip/i })).toBeVisible();
    await page.waitForTimeout(500);
    try {
      await page.screenshot({ path: 'test-results/trip_creation_blank.png', animations: 'disabled' });
    } catch {
      // ignore headless screenshot protocol hiccups
    }
  });

  test('clears page and renders thinking animation dots and status message on trip creation', async ({ page }) => {
    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/generate\/?$/, async (route) => {
      const nowIso = new Date().toISOString();
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'job-thinking-1',
          thread_id: 'paladio_job-thinking-1',
          destination: 'Paris',
          title: 'Trip to Paris',
          status: 'running',
          stage: 'ANALYZING_PROMPT',
          stage_message: 'Analyzing prompt...',
          prompt: 'Art and museums route in Paris',
          acknowledged: false,
          created_at: nowIso,
          updated_at: nowIso,
        }),
      });
    });

    await page.goto('/engine');
    await expect(page.getByRole('button', { name: /Generate Sovereign Trip Plan/i })).toBeVisible();

    const textarea = page.locator('textarea');
    await textarea.fill('Art and museums route in Paris');

    await page.getByRole('button', { name: /Generate Sovereign Trip Plan/i }).click();

    // The form and "NEW TRIP" heading should clear and thinking dots should be visible
    const thinkingDots = page.locator('.paladio-thinking-dot');
    await expect(thinkingDots.first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'NEW TRIP' })).not.toBeVisible();
  });

  test('RouteIntakeBar clears stale IATAs on edit, handles Enter/Escape without form submit, and preserves flight hours on Swap', async ({ page }) => {
    await page.route(/.*\/api\/locations\/search.*/, async (route) => {
      const url = new URL(route.request().url());
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const results = q.includes('tok')
        ? [{ city: 'Tokyo', country: 'JP', airport_name: 'Tokyo Haneda Airport', airport_iata: 'HND', display_name: 'Tokyo, Japan', distance_km: 15, latitude: 35.5494, longitude: 139.7798 }]
        : q.includes('mad')
          ? [{ city: 'Madrid', country: 'ES', airport_name: 'Adolfo Suarez Madrid-Barajas', airport_iata: 'MAD', display_name: 'Madrid, Spain', distance_km: 12, latitude: 40.4719, longitude: -3.5626 }]
          : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(results) });
    });

    await page.goto('/engine');

    const cityInputs = page.locator('input[placeholder="Search city / airport..."]');
    const originInput = cityInputs.nth(0);
    const destInput = cityInputs.nth(1);
    const origIataInput = page.getByTitle('Click directly to edit origin airport IATA code');
    const destIataInput = page.getByTitle('Click directly to edit destination airport IATA code');

    // Focusing an empty origin field must NOT flash "No matching cities"
    await originInput.fill('');
    await originInput.focus();
    await expect(page.getByText(/No matching cities/i)).not.toBeVisible();

    // Selecting from autocomplete sets IATA; pressing Enter selects without submitting form
    await destInput.fill('Tok');
    await expect(page.getByText('Tokyo, Japan')).toBeVisible();
    await destInput.press('Enter');
    await expect(destInput).toHaveValue('Tokyo');
    await expect(destIataInput).toHaveValue('HND');
    await expect(page.getByRole('heading', { name: /NEW TRIP/i })).toBeVisible();

    // Manual edit clears stale IATA
    await destInput.fill('Osaka');
    await expect(destIataInput).toHaveValue('');

    // Re-set both cities + IATAs and verify Swap keeps Outbound Arr 09:00 and Return Dep 20:00
    await originInput.fill('Madrid');
    await origIataInput.fill('MAD');
    await destInput.fill('Tokyo');
    await destIataInput.fill('HND');

    const outboundBtn = page.getByTitle('Click to customize arrival time at destination');
    const returnBtn = page.getByTitle('Click to customize return / departure time');
    await expect(outboundBtn).toContainText('09:00');
    await expect(returnBtn).toContainText('20:00');

    await page.getByRole('button', { name: 'Swap origin and destination' }).click();
    await expect(originInput).toHaveValue('Tokyo');
    await expect(destInput).toHaveValue('Madrid');
    await expect(origIataInput).toHaveValue('HND');
    await expect(destIataInput).toHaveValue('MAD');
    await expect(outboundBtn).toContainText('09:00');
    await expect(returnBtn).toContainText('20:00');
  });

  test('DateRangePicker normalizes ISO timestamps, supports 1-day trips, and triggers boundary overlap warning', async ({ page }) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextMonth.getFullYear();
    const m = pad(nextMonth.getMonth() + 1);
    const isoStart = `${y}-${m}-10T00:00:00.000Z`;
    const isoEnd = `${y}-${m}-14T00:00:00.000Z`;
    const existingStartLabel = `${y}-${m}-10`;
    const existingEndLabel = `${y}-${m}-14`;

    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: getCorsHeaders(route),
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'trip-existing-1', destination: 'Rome', start_date: isoStart, end_date: isoEnd, status: 'active' },
          ]),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/engine');

    // Navigate calendar forward if the next month isn't already visible
    await page.locator('button[data-date]').first().waitFor({ state: 'visible' });
    if (!(await page.locator(`button[data-date="${existingStartLabel}"]`).isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Next month/i }).click();
    }
    const startTripBtn = page.locator(`button[title*="Rome"][title*="${existingStartLabel}"]`).filter({ hasText: /^10$/ });
    const endTripBtn = page.locator(`button[title*="Rome"][title*="${existingEndLabel}"]`).filter({ hasText: /^14$/ });
    await expect(startTripBtn).toBeVisible();
    await expect(endTripBtn).toBeVisible();

    // Selecting a same-day trip on the 3rd of next month shows "1 day" (not "0 days") with 8px border-radius
    const singleDayBtn = page.getByRole('button', { name: `${y}-${m}-03` });
    await singleDayBtn.click();
    await singleDayBtn.click();
    await expect(page.getByText('1 day', { exact: true })).toBeVisible();
    const radius = await singleDayBtn.evaluate((el) => window.getComputedStyle(el).borderRadius);
    expect(radius).toBe('8px');

    // Selecting a range that touches the existing trip's start boundary triggers overlap modal
    await page.getByRole('button', { name: `${y}-${m}-08` }).click();
    await startTripBtn.click();
    await expect(page.getByText('[CONFLICT] TRIP DATES OVERLAP')).toBeVisible();
    await page.getByRole('button', { name: 'RESELECT DATES' }).click();
  });

  test('HotelStayAnchorBar guards against partial auto-bind, clamps dates, and HotelMapModal preserves pinned coordinates on reopen', async ({ page }) => {
    await page.route(/.*\/api\/locations\/hotels.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'Hotel Le Meurice',
            address: '228 Rue de Rivoli, 1st Arrondissement',
            city: 'Paris',
            lat: 48.8651,
            lng: 2.3282,
            category: 'hotel',
          },
        ]),
      });
    });

    await page.goto('/engine');

    const hotelInput = page.locator('input[placeholder*="Search hotel"]');
    // Partial generic word "Hotel" must NOT auto-bind coordinates
    await hotelInput.fill('Hotel');
    await page.waitForTimeout(350);
    await expect(page.getByTestId('hotel-verified-tick')).not.toBeVisible();

    // Selecting from dropdown binds coordinates and shows verified tick
    await page.getByText('Hotel Le Meurice').click();
    await expect(page.getByTestId('hotel-verified-tick')).toBeVisible();

    // Reopening View Map must preserve pinned coordinates even though address omits "Paris"
    await page.getByRole('button', { name: 'View Map' }).click();
    await expect(page.getByText('PIN: 48.86510, 2.32820')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Hotel Le Marais')).toHaveValue('Hotel Le Meurice');
    await expect(page.getByPlaceholder('Click map or enter address...')).toHaveValue('228 Rue de Rivoli, 1st Arrondissement');
    await page.getByRole('button', { name: 'Set Stay Anchor' }).click();

    // Manual edit clears stale coordinates & verified tick
    await hotelInput.fill('My Custom Stay');
    await expect(page.getByTestId('hotel-verified-tick')).not.toBeVisible();
  });

  test('ParticipantsManager protects host from removal, prevents duplicate names, and allows Enter key without parent submit', async ({ page }) => {
    await page.route(/.*\/api(\/v1)?\/users\/collaborators\/options/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'mock-user-123', username: 'admin', email: 'admin@paladio.internal' }]),
      });
    });

    await page.goto('/engine');
    await page.getByRole('button', { name: 'Add Participant' }).click();

    const guestInput = page.getByPlaceholder('Enter traveler name (e.g. Sarah, Dad)...');
    await guestInput.fill('Alice');
    await guestInput.press('Enter');

    // Trip must NOT submit; Alice is added to active list
    await expect(page.getByRole('heading', { name: /NEW TRIP/i })).toBeVisible();
    await expect(page.getByText('ACTIVE TRIP TRAVELERS (2)')).toBeVisible();

    // Duplicate case-insensitive name disables Add Guest button
    await guestInput.fill('alice');
    await expect(page.getByRole('button', { name: 'Add Guest' })).toBeDisabled();

    await page.getByRole('button', { name: 'Done' }).click();

    // Organizer chip has no remove button, while Alice has one
    await expect(page.getByTitle('Remove admin')).not.toBeVisible();
    await expect(page.getByTitle('Remove Alice')).toBeVisible();
  });

  test('Budget zero & negative clamping, Cover Photo + metadata preservation, Boarding Pass return scan, and Blank error recovery', async ({ page }) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const futureDay = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const depDate = futureDay(10);
    const retDate = futureDay(16);

    const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const capturedGeneratePosts: Array<Record<string, unknown>> = [];
    let failBlankPost = true;
    let scanCallCount = 0;
    let activeSocket: { send: (data: string) => void } | null = null;
    let generatedJobReturned = false;

    await page.route(/.*\/api(\/v1)?\/trips\/scan-boarding-pass/, async (route) => {
      scanCallCount += 1;
      const body = scanCallCount === 1
        ? {
            document_type: 'flight',
            origin_city: 'Madrid',
            origin_iata: 'MAD',
            destination_city: 'Paris',
            destination_iata: 'CDG',
            departure_date: depDate,
            flight_departure_hour: '07:15',
            flight_arrival_hour: '09:17',
            departure_hour: '09:17',
            flight_number: 'IB3400',
            carrier: 'Iberia',
          }
        : {
            document_type: 'flight',
            origin_city: 'Paris',
            origin_iata: 'CDG',
            destination_city: 'Madrid',
            destination_iata: 'MAD',
            departure_date: retDate,
            flight_departure_hour: '19:45',
            flight_arrival_hour: '21:55',
            departure_hour: '19:45',
            flight_number: 'IB3401',
            carrier: 'Iberia',
          };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.route(/.*\/api\/locations\/resolve-airport.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', latitude: 49.0097, longitude: 2.5479 }),
      });
    });
    await page.route(/.*\/api\/locations\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify([{ city: 'Paris', country: 'FR', airport_name: 'Charles de Gaulle', airport_iata: 'CDG', display_name: 'Paris, France', latitude: 48.8566, longitude: 2.3522 }]),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs\/[^/]+\/acknowledge\/?$/, async (route) => {
      await route.fulfill({ status: 204, body: '' });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs\/?$/, async (route) => {
      const nowIso = new Date().toISOString();
      const jobs = generatedJobReturned
        ? [
            {
              id: 'job-e2e-1',
              thread_id: 'paladio_job-e2e-1',
              destination: 'Paris',
              title: 'Paris Custom Title',
              status: 'completed',
              stage: 'DONE',
              prompt: 'Museums and cafes in Paris',
              trip_id: 'created-trip-999',
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
      const postJson = route.request().postDataJSON() as Record<string, unknown>;
      capturedGeneratePosts.push(postJson);
      generatedJobReturned = true;
      const nowIso = new Date().toISOString();
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'job-e2e-1',
          thread_id: 'paladio_job-e2e-1',
          destination: 'Paris',
          title: String(postJson.title || 'Paris Custom Title'),
          status: 'running',
          stage: 'STARTING_INFERENCE',
          prompt: String(postJson.prompt || ''),
          acknowledged: false,
          created_at: nowIso,
          updated_at: nowIso,
        }),
      });
      setTimeout(() => {
        activeSocket?.send(
          JSON.stringify({
            event: 'TRIP_JOB_COMPLETED',
            status: 'completed',
            job_id: 'job-e2e-1',
            thread_id: 'paladio_job-e2e-1',
            trip_id: 'created-trip-999',
            destination: 'Paris',
            title: String(postJson.title || 'Paris Custom Title'),
          })
        );
      }, 150);
    });

    await page.route(/.*\/api(\/v1)?\/trips\/created-trip-999\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'created-trip-999',
          destination: 'Paris',
          start_date: depDate,
          end_date: retDate,
          itinerary_data: { days: [{ day: 1, date: depDate, itinerary: { path: [] } }] },
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/?$/, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fallback();
        return;
      }
      if (route.request().method() === 'POST') {
        const postJson = route.request().postDataJSON() as Record<string, unknown>;
        if (failBlankPost) {
          await route.fulfill({
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Database offline' }),
          });
          return;
        }
        await route.fulfill({
          status: 201,
          headers: { 'Access-Control-Allow-Origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify({ id: 'created-trip-999', ...postJson }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.routeWebSocket(/.*\/api(\/v1)?\/ws\/stream.*/, (ws) => {
      activeSocket = ws;
    });

    await page.goto('/engine');

    // 1. Budget 0 stays 0 and negative input clamps to 0
    const budgetInput = page.locator('input[type="number"]');
    await budgetInput.fill('0');
    await expect(budgetInput).toHaveValue('0');
    await budgetInput.fill('-250');
    await expect(budgetInput).toHaveValue('0');

    // 2. Scan outbound boarding pass then return boarding pass: route stays Madrid -> Paris, endDate & arrivalHour update
    await page.getByRole('button', { name: /Upload Documents/i }).click();
    await page.getByRole('button', { name: 'Or paste barcode text / airline email' }).click();
    await page.getByPlaceholder(/Paste IATA barcode/i).fill('IB3400 MAD CDG');
    await page.getByRole('button', { name: 'Process Flight Text' }).click();
    await page.getByRole('button', { name: /Apply Extracted Details to Route/i }).click();

    await page.getByRole('button', { name: /Upload Documents/i }).click();
    await page.getByRole('button', { name: 'Or paste barcode text / airline email' }).click();
    await page.getByPlaceholder(/Paste IATA barcode/i).fill('IB3401 CDG MAD');
    await page.getByRole('button', { name: 'Process Flight Text' }).click();
    await page.getByRole('button', { name: /Apply Extracted Details to Route/i }).click();

    const cityInputs = page.locator('input[placeholder="Search city / airport..."]');
    await expect(cityInputs.nth(0)).toHaveValue('Madrid');
    await expect(cityInputs.nth(1)).toHaveValue('Paris');
    await expect(page.getByTitle('Click to customize return / departure time')).toContainText('19:45');

    // 3. Off-grid minute (09:17) snaps onto 5-min grid when clicking up/down in CustomHourPickerModal
    await page.getByTitle('Click to customize arrival time at destination').click();
    await expect(page.getByRole('button', { name: '17', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '15', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Time' }).click();
    await expect(page.getByText('Arr: 09:15')).toBeVisible();

    // 4. Upload custom cover photo via PhotoUploadModal
    await page.getByRole('button', { name: /Upload Photo/i }).click();
    const photoFileInput = page.locator('input[type="file"][accept="image/*"]');
    await photoFileInput.setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from(tinyPngBase64, 'base64'),
    });
    await expect(page.locator('img[src^="data:image/"]')).toBeVisible({ timeout: 5000 });

    // 5. Blank trip error recovery: failed POST must return from ThinkingScreen with role="alert"
    await page.getByRole('button', { name: /Blank Trip/i }).click();
    await page.getByRole('button', { name: /Create Blank Canvas Trip/i }).click();
    await expect(page.getByText(/Failed to create trip in database/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: /NEW TRIP/i })).toBeVisible();

    // 6. Personalized trip validation when prompt cleared
    await page.getByRole('button', { name: /Personalized Trip/i }).click();
    const promptArea = page.locator('textarea');
    await promptArea.fill('');
    await page.getByRole('button', { name: /Generate Sovereign Trip Plan/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Describe your travel vision/i })).toBeVisible();

    // 7. Full Personalized submit preserves title, description, cover_photo, budget 0, and flight metadata on save
    failBlankPost = false;
    await page.getByPlaceholder(/Trip to /i).fill('Paris Custom Title');
    await page.getByPlaceholder(/Trip description/i).fill('Architectural walking tour');
    await promptArea.fill('Museums and cafes in Paris');
    await page.getByRole('button', { name: /Generate Sovereign Trip Plan/i }).click();

    await page.waitForURL(/\/trips\/created-trip-999/, { timeout: 10000 });
    const saved = capturedGeneratePosts[capturedGeneratePosts.length - 1];
    const savedConstraints = saved.manual_constraints as Record<string, unknown>;
    expect(saved.title).toBe('Paris Custom Title');
    expect(saved.description).toBe('Architectural walking tour');
    expect(String(saved.cover_photo || '')).toMatch(/^data:image\//);
    expect(saved.budget).toBe(0);
    expect(saved.budget_usd).toBe(0);
    expect(savedConstraints.budget).toBe(0);
    expect(savedConstraints.budget_usd).toBe(0);
    expect(saved.origin_iata).toBe('MAD');
    expect(saved.destination_iata).toBe('CDG');
    expect(saved.departure_hour).toBe('09:15');
    expect(saved.arrival_hour).toBe('19:45');
  });

  test('blank Rome trip from deal URL anchors hotel in Italy even if search returns homonymous US results', async ({ page }) => {
    let capturedTripPost: Record<string, unknown> | null = null;

    await page.route(/.*\/api(\/v1)?\/trips\/generation-jobs.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/.*\/api(\/v1)?\/locations\/resolve-airport.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          iata: 'FCO',
          icao: 'LIRF',
          name: 'Leonardo Da Vinci (Fiumicino) International Airport',
          city: 'Rome',
          country: 'IT',
          latitude: 41.8045,
          longitude: 12.2508,
        }),
      });
    });
    await page.route(/.*\/api(\/v1)?\/locations\/search.*/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify([
          {
            city: 'Rome',
            country: 'US',
            airport_iata: 'REO',
            latitude: 42.57766,
            longitude: -117.88543,
          },
          {
            city: 'Rome',
            country: 'IT',
            airport_iata: 'FCO',
            latitude: 41.89193,
            longitude: 12.51133,
          },
        ]),
      });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/rome-blank-1\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'rome-blank-1',
          destination: 'Rome',
          start_date: '2027-07-07T00:00:00.000Z',
          end_date: '2027-07-12T00:00:00.000Z',
          itinerary_data: { days: [{ day: 1, date: '2027-07-07', itinerary: { path: [] } }] },
        }),
      });
    });
    await page.route(/.*\/api(\/v1)?\/trips\/?$/, async (route) => {
      if (route.request().method() === 'POST') {
        capturedTripPost = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 201,
          headers: { 'Access-Control-Allow-Origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify({ id: 'rome-blank-1', ...capturedTripPost }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/engine?destination=Rome&origin=Alicante&origin_iata=ALC&dest_iata=FCO&start_date=2027-07-07&end_date=2027-07-12&budget=156&source=deal');
    await page.getByRole('button', { name: /Blank Trip/i }).click();
    await page.getByRole('button', { name: /Create Blank Canvas Trip/i }).click();

    await page.waitForURL(/\/trips\/rome-blank-1/, { timeout: 10000 });
    expect(capturedTripPost).not.toBeNull();
    const itin = (capturedTripPost!.itinerary_data || {}) as { hotel?: { lat: number; lng: number } };
    expect(itin.hotel?.lat).toBeGreaterThan(41);
    expect(itin.hotel?.lat).toBeLessThan(43);
    expect(itin.hotel?.lng).toBeGreaterThan(11);
    expect(itin.hotel?.lng).toBeLessThan(14);
  });
});


