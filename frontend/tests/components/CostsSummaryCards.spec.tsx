import { test, expect } from '@playwright/experimental-ct-react';
import { CostsSummaryCards } from '../../src/components/trip-workspace/costs/CostsSummaryCards';
import { DisplayExpenseItem } from '../../src/components/trip-workspace/costs/ExpenseRow';

test.describe('CostsSummaryCards Component - Expenses By Day Graph', () => {
  test('renders daily spending pace and expenses by day graph below total spend', async ({ mount, page }) => {
    const mockExpenses: DisplayExpenseItem[] = [
      {
        id: 'exp-1',
        source: 'logged',
        title: 'Sushi Dinner',
        category: 'food',
        amount: 80,
        convertedAmount: 80,
        currency: 'EUR',
        date: '2026-10-21',
        payerId: 'user-1',
        payerName: 'Alex',
      },
      {
        id: 'exp-2',
        source: 'logged',
        title: 'Metro Tickets',
        category: 'transit',
        amount: 25.82,
        convertedAmount: 25.82,
        currency: 'EUR',
        date: '2026-10-22',
        payerId: 'user-1',
        payerName: 'Alex',
      },
      {
        id: 'exp-3',
        source: 'logged',
        title: 'Museum Entry',
        category: 'activities',
        amount: 100,
        convertedAmount: 100,
        currency: 'EUR',
        date: '2026-10-23',
        payerId: 'user-1',
        payerName: 'Alex',
      },
    ];

    const mockTotals = {
      owe: 0,
      owed: 0,
      totalSpend: 205.82,
      myShare: 205.82,
      myPaid: 205.82,
      currency: 'EUR',
    };

    await mount(
      <CostsSummaryCards
        totals={mockTotals}
        activeCurrency="EUR"
        destinationCurrency="EUR"
        destinationCity="Tokyo"
        startDate="2026-10-21"
        endDate="2026-10-25"
        todaySpend={0}
        totalBudget={1339.9}
        expenses={mockExpenses}
      />
    );

    // Verify main card header
    await expect(page.getByText('Daily Spending Pace & Runway')).toBeVisible();

    // Verify old 2-column widgets have been removed
    await expect(page.getByText("TODAY'S SPENDING PACE")).not.toBeVisible();
    await expect(page.getByText("REMAINING TRIP RUNWAY")).not.toBeVisible();

    // Verify Expenses By Day graph header
    await expect(page.getByText('EXPENSES BY DAY')).toBeVisible();

    // Verify Day labels for the 5-day horizon
    await expect(page.getByText('Day 1')).toBeVisible();
    await expect(page.getByText('Day 2')).toBeVisible();
    await expect(page.getByText('Day 3')).toBeVisible();
    await expect(page.getByText('Day 4')).toBeVisible();
    await expect(page.getByText('Day 5')).toBeVisible();

    // Hover Day 1 and verify tooltip / inspector updates
    await page.getByText('Day 1').hover();
    await expect(page.getByText(/item/i).first()).toBeVisible();

    // Verify blue Total Trip Spend card displays / total budget
    await expect(page.getByText('Total trip spend')).toBeVisible();
    await expect(page.getByText(/\/.*1[.,]?339/i)).toBeVisible();
  });
});
