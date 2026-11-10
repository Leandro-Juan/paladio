import { test, expect } from '@playwright/test';
import { mockPaladioWebSocket } from './test-utils';

test.describe('Dashboard Renovation 4-Quadrant Operational Cockpit', () => {
  test('renders top row (Trip + Star) and bottom row (Best Offer Square + 3 Recommended POI Cards)', async ({ page }) => {
    await mockPaladioWebSocket(page);

    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/(auth|users)\/me/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-id',
          email: 'admin@paladio.internal',
          username: 'admin',
          role: 'admin',
          is_active: true,
          preferences: {
            pace: 'balanced',
            budget_tier: 'balanced',
            tag_affinities: { art_culture: 0.9, scenic_views: 0.8 },
          },
          has_embedding: true,
        }),
      });
    });

    const mockTripSwissAlps = {
      id: 'trip-swiss-alps',
      destination: 'Zermatt',
      start_date: '2026-12-10',
      end_date: '2026-12-15',
      itinerary_data: {
        photos: ['https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800'],
        days: [
          {
            day: 1,
            itinerary: {
              path: [
                {
                  poi: {
                    id: 'poi-itinerary-refuge',
                    name: 'Already Scheduled Alpine Refuge',
                    city: 'Zermatt',
                    category: 'attraction',
                    photo_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
                  },
                },
              ],
            },
          },
        ],
        candidates: [
          {
            id: 'poi-matterhorn',
            name: 'Matterhorn Viewpoint',
            city: 'Zermatt',
            category: 'scenic_views',
            description: 'Breathtaking alpine vistas overlooking the iconic pyramid peak.',
            photo_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
            scoring: { taste_match: 0.98 },
          },
          {
            id: 'poi-gornergrat',
            name: 'Gornergrat Observatory',
            city: 'Zermatt',
            category: 'nature_outdoors',
            description: 'Historic mountain ridge with panoramic glacier views.',
            photo_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800',
            scoring: { taste_match: 0.94 },
          },
          {
            id: 'poi-museum',
            name: 'Zermatlantis Matterhorn Museum',
            city: 'Zermatt',
            category: 'museum',
            description: 'Subterranean alpine museum preserving mountaineering triumphs and folklore.',
            photo_url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=800',
            scoring: { taste_match: 0.91 },
          },
          {
            id: 'poi-no-photo',
            name: 'Secret Alpine Crevasse',
            city: 'Zermatt',
            category: 'nature_outdoors',
            description: 'Hidden crevasse with no documented photography.',
            // No photo_url provided!
            scoring: { taste_match: 0.99 },
          },
          {
            id: 'poi-schwarzsee',
            name: 'Schwarzsee Alpine Lake',
            city: 'Zermatt',
            category: 'nature_outdoors',
            description: 'Tranquil alpine lake at the foot of the Matterhorn.',
            photo_url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
            scoring: { taste_match: 0.88 },
          },
        ],
      },
    };

    // Mock upcoming trip with itinerary POIs
    await page.route(/.*\/api(\/v1)?\/trips\/?(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([mockTripSwissAlps]),
        });
      } else {
        await route.continue();
      }
    });

    // Mock single trip endpoint for deep-linking
    await page.route(/.*\/api(\/v1)?\/trips\/trip-swiss-alps(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTripSwissAlps),
      });
    });

    // Mock single POI endpoint for POI detail view
    await page.route(/.*\/api(\/v1)?\/pois\/(poi-[^?]+).*/, async (route) => {
      const poiId = route.request().url().match(/\/pois\/([^?]+)/)?.[1] || 'poi-gornergrat';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: poiId,
          name: 'Gornergrat Observatory',
          city: 'Zermatt',
          category: 'nature_outdoors',
          description: 'Historic mountain ridge with panoramic glacier views.',
          rating: 4.8,
        }),
      });
    });

    // Mock POI batch photos (prevent non-photo candidates from gaining synthetic photos)
    await page.route(/.*\/api(\/v1)?\/pois\/batch-photos.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ photos: {} }),
      });
    });

    // Mock Route Monitoring Market endpoints
    await page.route(/.*\/api(\/v1)?\/market\/summary.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          monitored_routes: 2,
          deals_detected: 1,
          ticks_scanned_today: 48,
          avg_savings_pct: 35,
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/market\/routes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'route-mad-tyo',
            origin_iata: 'MAD',
            destination_code: 'TYO',
            destination_name: 'Tokyo',
            earliest_date: '2026-11-15',
            latest_date: '2026-11-20',
            is_active: true,
            status: 'DEAL',
            current_price_eur: 420,
            baseline_p50_eur: 650,
            discount_pct: 35,
            ticks_count: 24,
          },
        ]),
      });
    });

    await page.route(/.*\/api(\/v1)?\/market\/deals.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'deal-package-1',
            alert_id: 'route-mad-tyo',
            candidate_id: 'cand-1',
            origin_iata: 'MAD',
            destination_code: 'TYO',
            origin_name: 'Madrid',
            destination_name: 'Tokyo',
            depart_date: '2026-11-15',
            return_date: '2026-11-20',
            nights: 5,
            total_price_eur: 420,
            baseline_median_eur: 650,
            savings_eur: 230,
            discount_pct: 35.4,
            package_ratio: 0.65,
            realism_score: 9.2,
            status: 'VERIFIED',
            detected_at: new Date().toISOString(),
            flight: {
              airline: 'Iberia',
              flight_number: 'IB6801',
              landed_price_eur: 160,
              depart_time: '2026-11-15T10:00:00',
              arrival_time: '2026-11-16T08:00:00',
            },
            return_flight: {
              airline: 'Iberia',
              flight_number: 'IB6802',
              landed_price_eur: 120,
              depart_time: '2026-11-20T14:00:00',
              arrival_time: '2026-11-21T10:00:00',
            },
            lodging: {
              property_name: 'Shinjuku Granbell',
              stars: 4,
              price_per_night_eur: 28,
              total_lodging_eur: 140,
            },
            currency: 'EUR',
          },
        ]),
      });
    });

    // Set standard desktop viewport size (1440 x 900)
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate to dashboard
    await page.goto('/dashboard');

    // 1. Verify Top Left: Active Trip Ticket with destination and photo background
    await expect(page.getByText('OPEN COCKPIT')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Zermatt' })).toBeVisible();

    // 2. Verify Top Right: Taste Star
    await expect(page.getByText('Taste Star')).toBeVisible();

    // 3. Verify Bottom Left: The Best Offer Card for Monitored Routes (Outbound + Return + Best Hotel)
    await expect(page.getByText('35% OFF')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /MAD.*TYO/ })).toBeVisible();
    await expect(page.getByText(/420/)).toBeVisible();
    await expect(page.getByText(/Outbound:/i)).toBeVisible();
    await expect(page.getByText(/Iberia.*IB6801/)).toBeVisible();
    await expect(page.getByText(/Return:/i)).toBeVisible();
    await expect(page.getByText(/Iberia.*IB6802/)).toBeVisible();
    await expect(page.getByText(/Best Hotel:/i)).toBeVisible();
    await expect(page.getByText(/Shinjuku Granbell/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Inspect Corridor Offer/i })).toBeVisible();

    // 4. Verify Bottom Right: Recommended POIs Section (3 Cards with Verified Photos, Type Badges, No Emojis)
    await expect(page.getByRole('heading', { level: 3, name: 'Recommended POIs' })).toBeVisible();

    // Verify POI without photo is STRICTLY NOT DISPLAYED despite 99% match score
    await expect(page.getByText('Secret Alpine Crevasse')).not.toBeVisible();

    // Verify POI already scheduled in trip itinerary is STRICTLY NOT DISPLAYED in recommendations
    await expect(page.getByText('Already Scheduled Alpine Refuge')).not.toBeVisible();

    // Verify the 3 POIs with verified photos ARE displayed
    await expect(page.getByText('Matterhorn Viewpoint')).toBeVisible();
    await expect(page.getByText('Gornergrat Observatory')).toBeVisible();
    await expect(page.getByText('Zermatlantis Matterhorn Museum')).toBeVisible();

    // Verify badges row: City, Taste Match, and Type Badge on the right (icon-only with accessible label)
    const categoryBadges = page.locator('[data-testid="poi-category-pill"]');
    await expect(categoryBadges).toHaveCount(3);
    await expect(categoryBadges.nth(0)).toHaveAttribute('aria-label', /ATTRACTION|VIEWPOINT|SCENIC/i);
    await expect(categoryBadges.nth(1)).toHaveAttribute('aria-label', /PARK|NATURE/i);
    await expect(categoryBadges.nth(2)).toHaveAttribute('aria-label', /MUSEUM|ART/i);

    // Verify custom aesthetic category tooltip displays title-cased label (not all-caps)
    const categoryTooltips = page.locator('[data-testid="poi-category-pill"] [role="tooltip"]');
    await expect(categoryTooltips.nth(0)).toHaveText(/Scenic Views|Attraction/i);
    expect(await categoryTooltips.nth(2).textContent()).toBe('Museum');

    // Verify glassy action buttons (Cross and Heart) replacing obsolete Reserve now
    const heartButtons = page.locator('[data-testid="poi-heart-btn"]');
    const dismissButtons = page.locator('[data-testid="poi-dismiss-btn"]');
    await expect(heartButtons).toHaveCount(3);
    await expect(dismissButtons).toHaveCount(3);

    // Verify Heart icon is solid filled (fill="currentColor") and has custom aesthetic tooltip
    const firstHeartSvg = page.locator('[data-testid="poi-heart-btn"] svg').first();
    await expect(firstHeartSvg).toHaveAttribute('fill', 'currentColor');
    const firstHeartTooltip = page.locator('[data-testid="poi-heart-btn"] + [role="tooltip"]').first();
    await expect(firstHeartTooltip).toHaveText('View waypoint in trip details');

    // Verify Cross button has NO native title tooltip (browser black box removed) but has custom aesthetic tooltip
    expect(await dismissButtons.first().getAttribute('title')).toBeNull();
    const firstDismissTooltip = page.locator('[data-testid="poi-dismiss-btn"] + [role="tooltip"]').first();
    await expect(firstDismissTooltip).toHaveText('Dismiss waypoint');

    // Verify heart button deep links to trip workspace with POI parameter
    const firstHeartHref = await heartButtons.first().getAttribute('href');
    expect(firstHeartHref).toMatch(/\/trips\/.*poi=/);

    // Hover to capture screenshot of clean white box tooltip
    await heartButtons.first().hover();
    await page.locator('main.main-content').screenshot({ path: 'test-results/dashboard_tooltip_hover.png' });

    // 5. Verify Swapped Position: Best Offer Card is on the LEFT of Recommended POIs
    const offerBox = await page.getByText('35% OFF').boundingBox();
    const poisHeaderBox = await page.getByRole('heading', { level: 3, name: 'Recommended POIs' }).boundingBox();
    expect(offerBox).toBeTruthy();
    expect(poisHeaderBox).toBeTruthy();
    if (offerBox && poisHeaderBox) {
      expect(offerBox.x).toBeLessThan(poisHeaderBox.x);
    }

    // 6. Verify Cockpit Fits on Screen: bottom cards do not overflow the 900px viewport
    const actionBtnBox = await heartButtons.last().boundingBox();
    const kpiBox = await page.getByText('TOTAL MISSIONS').boundingBox();
    expect(actionBtnBox).toBeTruthy();
    if (actionBtnBox) {
      expect(actionBtnBox.y + actionBtnBox.height).toBeLessThanOrEqual(900);
    }

    // 7. Verify Statistics Strip (TOTAL MISSIONS, ACTIVE / QUEUED, etc.) is strictly NOT on screen
    expect(kpiBox).toBeTruthy();
    if (kpiBox) {
      expect(kpiBox.y).toBeGreaterThanOrEqual(900);
    }

    // 8. Verify Dismiss Interaction: Clicking Cross dismisses the card and finds the next best match
    await expect(page.getByText('Matterhorn Viewpoint')).toBeVisible();
    await expect(page.getByText('Schwarzsee Alpine Lake')).not.toBeVisible();

    // Click cross button on the first card (Matterhorn Viewpoint)
    await dismissButtons.first().click();

    // The dismissed POI disappears and the next best match (Schwarzsee Alpine Lake) is surfaced
    await expect(page.getByText('Matterhorn Viewpoint')).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Schwarzsee Alpine Lake')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="poi-heart-btn"]')).toHaveCount(3);

    // Verify dismissed POI persistence across page reload
    await page.reload();
    await expect(page.getByText('Matterhorn Viewpoint')).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Schwarzsee Alpine Lake')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="poi-heart-btn"]')).toHaveCount(3);

    // Take screenshot of renovated dashboard cockpit fitting completely on screen
    await page.locator('main.main-content').screenshot({ path: 'test-results/dashboard_renovated_cockpit.png' });

    // 9. Verify Heart Button: Navigates directly to trip workspace and automatically displays POI detail cards
    await heartButtons.first().click();
    await page.waitForURL(/\/trips\/trip-swiss-alps\?poi=/);
    await expect(page).toHaveURL(/poi=poi-gornergrat/);

    // Verify POI detail view with its information cards is rendered on screen
    await expect(page.getByRole('heading', { level: 2, name: 'Gornergrat Observatory' })).toBeVisible({ timeout: 5000 });
  });

  test('renders elegant project-themed standby state when user has no upcoming trips', async ({ page }) => {
    await mockPaladioWebSocket(page);

    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/(auth|users)\/me/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-id',
          email: 'admin@paladio.internal',
          username: 'admin',
          role: 'admin',
          is_active: true,
          preferences: {},
          has_embedding: true,
        }),
      });
    });

    // Mock trips endpoint returning empty list (no upcoming trips)
    await page.route(/.*\/api(\/v1)?\/trips\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock Route Monitoring Market endpoints
    await page.route(/.*\/api(\/v1)?\/market\/summary.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ monitored_routes: 0, deals_detected: 0, ticks_scanned_today: 0, avg_savings_pct: 0 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/market\/routes.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route(/.*\/api(\/v1)?\/market\/deals.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    // 1. Verify Top Left: Active Trip Ticket empty state
    await expect(page.getByText('No active missions queued')).toBeVisible();

    // 2. Verify Recommended POIs Section Header and STANDBY badge
    await expect(page.getByRole('heading', { level: 3, name: 'Recommended POIs' })).toBeVisible();
    await expect(page.getByText('STANDBY', { exact: true })).toBeVisible();

    // 3. Verify tactical Japanese Minimalist standby card content & styling
    await expect(page.getByText('// OPERATIONAL STANDBY')).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'No Upcoming Missions Queued' })).toBeVisible();
    await expect(
      page.getByText(/Initialize your next expedition protocol to generate sovereign, taste-matched waypoint recommendations/i)
    ).toBeVisible();

    // 4. Verify primary CTA button linking to mission planner
    const initBtn = page.getByRole('link', { name: /Initialize Mission/i });
    await expect(initBtn).toBeVisible();
    await expect(initBtn).toHaveAttribute('href', '/engine');

    // Screenshot of the no-trips dashboard empty state
    await page.locator('main.main-content').screenshot({ path: 'test-results/dashboard_no_trips_standby.png' });
  });

  test('renders saved collections section below upcoming trips and supports deep linking', async ({ page }) => {
    await mockPaladioWebSocket(page);

    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/(auth|users)\/me/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-id',
          email: 'admin@paladio.internal',
          username: 'admin',
          role: 'admin',
          is_active: true,
          preferences: {},
          has_embedding: true,
        }),
      });
    });

    const mockTripSwissAlps = {
      id: 'trip-swiss-alps',
      destination: 'Zermatt',
      start_date: '2026-12-10',
      end_date: '2026-12-15',
      itinerary_data: { days: [] },
    };

    const mockCollections = [
      {
        id: 'col-matterhorn-vault',
        trip_id: 'trip-swiss-alps',
        trip_destination: 'Zermatt',
        name: 'Matterhorn Alpine Spots',
        description: 'High-altitude panoramic views and mountain refuges',
        color: '#0F4C5C',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items_count: 2,
        items: [
          {
            id: 'item-1',
            collection_id: 'col-matterhorn-vault',
            poi_id: 'poi-matterhorn',
            notes: 'Bring warm coat',
            order_index: 0,
            created_at: new Date().toISOString(),
            poi: {
              id: 'poi-matterhorn',
              name: 'Matterhorn Viewpoint',
              category: 'scenic_views',
              photo_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
            },
          },
          {
            id: 'item-2',
            collection_id: 'col-matterhorn-vault',
            poi_id: 'poi-gornergrat',
            order_index: 1,
            created_at: new Date().toISOString(),
            poi: {
              id: 'poi-gornergrat',
              name: 'Gornergrat Observatory',
              category: 'nature_outdoors',
            },
          },
        ],
      },
    ];

    await page.route(/.*\/api(\/v1)?\/trips\/?(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([mockTripSwissAlps]),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(/.*\/api(\/v1)?\/trips\/saved-collections/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCollections),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/trip-swiss-alps(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTripSwissAlps),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/trip-swiss-alps\/collections/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCollections),
      });
    });

    await page.route(/.*\/api(\/v1)?\/market\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    // 1. Verify section visibility
    const upcomingSection = page.locator('[data-testid="upcoming-trips-section"]');
    const savedCollectionsSection = page.locator('[data-testid="saved-collections-section"]');

    await expect(upcomingSection).toBeVisible();
    await expect(savedCollectionsSection).toBeVisible();

    // 2. Verify Saved Collections is positioned strictly BELOW Upcoming Trips
    const upcomingBox = await upcomingSection.boundingBox();
    const collectionsBox = await savedCollectionsSection.boundingBox();
    expect(upcomingBox).toBeTruthy();
    expect(collectionsBox).toBeTruthy();
    if (upcomingBox && collectionsBox) {
      expect(collectionsBox.y).toBeGreaterThan(upcomingBox.y);
    }

    // 3. Verify Saved Collections Header & Badge
    await expect(page.getByRole('heading', { level: 2, name: 'SAVED COLLECTIONS' })).toBeVisible();
    await expect(page.locator('[data-testid="saved-collections-count"]')).toHaveText('1 CURATED');

    // 4. Verify Collection Card details
    const card = page.locator('[data-testid="saved-collection-card-col-matterhorn-vault"]');
    await expect(card).toBeVisible();
    await expect(card.getByText('Matterhorn Alpine Spots')).toBeVisible();
    await expect(card.getByText('Zermatt')).toBeVisible();
    await expect(card.getByText('High-altitude panoramic views and mountain refuges')).toBeVisible();
    await expect(card.getByText('Matterhorn Viewpoint')).toBeVisible();
    await expect(card.getByText('Gornergrat Observatory')).toBeVisible();
    await expect(card.getByText('2 places')).toBeVisible();
    await expect(card.getByText('OPEN VAULT')).toBeVisible();

    // 5. Verify Click navigates to trip workspace with ?tab=saved
    await card.click();
    await page.waitForURL(/\/trips\/trip-swiss-alps\?tab=saved/);
    expect(page.url()).toContain('/trips/trip-swiss-alps?tab=saved');
  });

  test('renders empty state for saved collections when user has no collections yet', async ({ page }) => {
    await mockPaladioWebSocket(page);

    await page.addInitScript(() => {
      localStorage.setItem('paladio_token', 'mock-valid-token');
    });

    await page.route(/.*\/api(\/v1)?\/auth\/setup-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setup_required: false, user_count: 1 }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/(auth|users)\/me/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-id',
          email: 'admin@paladio.internal',
          username: 'admin',
          role: 'admin',
          is_active: true,
          preferences: {},
          has_embedding: true,
        }),
      });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/?(\?.*)?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route(/.*\/api(\/v1)?\/trips\/saved-collections/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route(/.*\/api(\/v1)?\/market\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    // Verify empty state
    const emptyState = page.locator('[data-testid="saved-collections-empty"]');
    await expect(emptyState).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'No Saved Collections' })).toBeVisible();
    await expect(page.locator('[data-testid="saved-collections-count"]')).toHaveText('0 CURATED');
    await expect(emptyState.getByRole('link', { name: '+ Plan New Expedition' })).toBeVisible();
  });
});
