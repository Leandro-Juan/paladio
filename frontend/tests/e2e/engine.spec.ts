import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Engine Trip Preparation Cockpit', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test('renders mission preparation form with default constraints and anchor mode switcher', async ({ page }) => {
    await page.goto('/engine');

    // Heading check
    const heading = page.getByRole('heading', { name: /ACTIVE ENGINE/i });
    await expect(heading).toBeVisible();

    // Tab switcher check
    const prepTab = page.getByRole('button', { name: /01 \/\/ MISSION PREPARATION/i });
    const consoleTab = page.getByRole('button', { name: /02 \/\/ TELEMETRY CONSOLE/i });
    await expect(prepTab).toBeVisible();
    await expect(consoleTab).toBeVisible();

    // Form inputs: Budget Ceiling
    const budgetInput = page.locator('input[type="number"]');
    await expect(budgetInput).toHaveValue('1500');

    // Meal constraints check: Breakfast, Lunch, and Dinner
    const mealSelects = page.locator('select.font-mono');
    await expect(mealSelects).toHaveCount(3);
    await expect(mealSelects.nth(0)).toHaveValue('BREAKFAST');
    await expect(mealSelects.nth(1)).toHaveValue('LUNCH');
    await expect(mealSelects.nth(2)).toHaveValue('DINNER');

    // Ingestion mode buttons
    const simulatedBtn = page.getByRole('button', { name: /SIMULATED ANCHORS \(TEST MODE\)/i });
    const directBtn = page.getByRole('button', { name: /DIRECT TICKET INGESTION \(PROD\)/i });
    await expect(simulatedBtn).toBeVisible();
    await expect(directBtn).toBeVisible();

    // In simulated mode, origin and destination inputs exist
    const originInput = page.locator('input[placeholder="e.g. Madrid"]');
    const destInput = page.locator('input[placeholder="e.g. Paris"]');
    await expect(originInput).toHaveValue('Madrid');
    await expect(destInput).toHaveValue('Paris');

    // Switch to Direct Ticket Ingestion mode
    await directBtn.click();
    const rawTextarea = page.locator('textarea[placeholder*="Flight outbound"]');
    await expect(rawTextarea).toBeVisible();

    // Switch back to Simulated mode
    await simulatedBtn.click();
    await expect(originInput).toBeVisible();

    // Switch to Telemetry Console tab
    await consoleTab.click();
    const quickInput = page.locator('input[placeholder*="Quick prompt"]');
    await expect(quickInput).toBeVisible();
  });

  test('launches simulated mission from preparation cockpit and switches to telemetry console', async ({ page }) => {
    await page.goto('/engine');

    // Verify initial preparation tab is active
    const launchBtn = page.getByRole('button', { name: /INITIALIZE SOLVER/i });
    await expect(launchBtn).toBeVisible();

    // Click initiate swarm mission
    await launchBtn.click();

    // Should automatically switch to Telemetry Console tab
    const quickInput = page.locator('input[placeholder*="Quick prompt"]');
    await expect(quickInput).toBeVisible();

    // The launch button from the prep tab should no longer be rendered
    await expect(launchBtn).not.toBeVisible();
  });

  test('supports adding and removing meal windows including breakfast', async ({ page }) => {
    await page.goto('/engine');

    // Default meal windows
    const mealSelects = page.locator('select.font-mono');
    await expect(mealSelects).toHaveCount(3);
    await expect(mealSelects.nth(0)).toHaveValue('BREAKFAST');
    await expect(mealSelects.nth(1)).toHaveValue('LUNCH');
    await expect(mealSelects.nth(2)).toHaveValue('DINNER');

    // Remove breakfast
    const removeBtn = page.locator('button[title="Remove meal window"]').first();
    await removeBtn.click();
    await expect(mealSelects).toHaveCount(2);
    await expect(mealSelects.nth(0)).toHaveValue('LUNCH');
    await expect(mealSelects.nth(1)).toHaveValue('DINNER');

    // Add meal window back (should intelligently add BREAKFAST)
    const addMealBtn = page.getByRole('button', { name: /\+ ADD MEAL WINDOW/i });
    await addMealBtn.click();
    await expect(mealSelects).toHaveCount(3);
    await expect(mealSelects.nth(0)).toHaveValue('BREAKFAST');
  });

  test('renders all days and waypoints in TripTimeline for a 5-day itinerary', async ({ page }) => {
    const mock5DayItinerary = {
      days: [1, 2, 3, 4, 5].map((dayNum) => ({
        day: dayNum,
        flight_info: dayNum === 1 ? { destination_iata: 'CDG', departure_time: '10:00' } : null,
        itinerary: {
          total_score: 150.0,
          total_cost_eur: 50.0,
          total_time_mins: 720,
          path: [
            {
              poi: { name: `Day ${dayNum} Morning Spot`, category: 'attraction', duration_mins: 60 },
              scheduled_start: '09:00',
              scheduled_end: '10:00',
            },
            {
              poi: { name: `Day ${dayNum} Lunch Bistro`, category: 'restaurant', duration_mins: 60 },
              scheduled_start: '12:30',
              scheduled_end: '13:30',
            },
            {
              poi: { name: `Day ${dayNum} Evening Museum`, category: 'museum', duration_mins: 90 },
              scheduled_start: '15:00',
              scheduled_end: '16:30',
            },
          ],
        },
      })),
    };

    await page.addInitScript((data) => {
      sessionStorage.setItem('paladio_itinerary', JSON.stringify(data));
    }, mock5DayItinerary);

    await page.goto('/engine');

    // Verify all 5 days are visible in the TripTimeline
    for (let d = 1; d <= 5; d++) {
      await expect(page.getByRole('heading', { name: `DAY ${d}` })).toBeVisible();
      await expect(page.getByText(`Day ${d} Morning Spot`)).toBeVisible();
      await expect(page.getByText(`Day ${d} Lunch Bistro`)).toBeVisible();
      await expect(page.getByText(`Day ${d} Evening Museum`)).toBeVisible();
    }

    // Verify POI category badges are rendered
    await expect(page.getByText('ATTRACTION').first()).toBeVisible();
    await expect(page.getByText('RESTAURANT').first()).toBeVisible();
    await expect(page.getByText('MUSEUM').first()).toBeVisible();
  });
});

