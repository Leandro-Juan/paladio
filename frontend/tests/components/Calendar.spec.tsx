import { test, expect } from '@playwright/experimental-ct-react';
import { Calendar } from '../../src/components/Calendar';
import { Trip } from '../../src/hooks/useTrips';

test.describe('Calendar Component', () => {
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  const mockTrips: Trip[] = [
    {
      id: 'trip-past-1',
      destination: 'Rome',
      start_date: '2020-05-10',
      end_date: '2020-05-15',
      itinerary_data: { days: [{}, {}] },
    },
    {
      id: 'trip-future-1',
      destination: 'Tokyo',
      start_date: `${currentYear}-12-10`,
      end_date: `${currentYear}-12-16`,
      itinerary_data: { days: [{}, {}, {}] },
    },
    {
      id: 'trip-active-1',
      destination: 'Berlin',
      // Span including today
      start_date: `${currentYear}-${currentMonth}-01`,
      end_date: `${currentYear}-${currentMonth}-28`,
      itinerary_data: { days: [{}] },
    },
  ];

  test('renders 12-month annual dispatch grid and telemetry stats by default', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // Header and Telemetry checks
    await expect(component.getByText('TOTAL MISSIONS')).toBeVisible();
    await expect(component.getByText('ACTIVE / QUEUED')).toBeVisible();
    await expect(component.getByText('ARCHIVED MISSIONS')).toBeVisible();
    await expect(component.getByText(`${currentYear} ANNUAL DISPATCH`)).toBeVisible();

    // Verify all 12 months are rendered in annual view
    await expect(component.getByText('January')).toBeVisible();
    await expect(component.getByText('February')).toBeVisible();
    await expect(component.getByText('March')).toBeVisible();
    await expect(component.getByText('December')).toBeVisible();

    // Legend items and Palette Chips
    await expect(component.getByText('Active', { exact: true })).toBeVisible();
    await expect(component.getByText('Queued', { exact: true })).toBeVisible();
    await expect(component.getByText('Archived', { exact: true })).toBeVisible();
    await expect(component.getByText('Current day', { exact: true })).toBeVisible();
    await expect(component.getByText('PALETTE:')).toBeVisible();
    await expect(component.getByText('Tokyo')).toBeVisible();
    await expect(component.getByText('Berlin')).toBeVisible();
  });

  test('switches between Annual (12M) and Month Focus views', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // Click Month Focus view button
    await component.getByRole('button', { name: 'Month focus view' }).click();

    // Weekdays in Month focus
    await expect(component.getByText('MON', { exact: true })).toBeVisible();
    await expect(component.getByText('SUN', { exact: true })).toBeVisible();

    // Month title visible
    await expect(component.getByText(new RegExp(`${currentYear}`)).first()).toBeVisible();

    // Navigation buttons in month focus
    await component.getByRole('button', { name: /Next month/i }).click();
    await component.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(component.getByText('Current day', { exact: true })).toBeVisible();

    // Switch back to Annual
    await component.getByRole('button', { name: 'Annual view' }).click();
    await expect(component.getByText(`${currentYear} ANNUAL DISPATCH`)).toBeVisible();
  });

  test('displays trips with palette colors and opens inspector modal on click', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // In Annual view, click the Berlin legend chip or trip bar
    const berlinChip = component.getByText('Berlin').first();
    await expect(berlinChip).toBeVisible();
    await berlinChip.click();

    // Mission Inspector Modal should appear
    await expect(component.getByRole('heading', { name: 'Berlin' })).toBeVisible();
    await expect(component.getByText('TIMEFRAME')).toBeVisible();
    await expect(component.getByText('DURATION')).toBeVisible();
    await expect(component.getByText('EXPORT .ICS (CALENDAR)')).toBeVisible();

    // Close modal
    await component.getByRole('button', { name: 'CLOSE', exact: true }).click();
    await expect(component.getByText('EXPORT .ICS (CALENDAR)')).not.toBeVisible();
  });

  test('pops up day planning box on clicking an empty date in plan mode', async ({ mount }) => {
    let selectedDateString = '';
    const component = await mount(
      <Calendar
        trips={mockTrips}
        onSelectDate={(_, dateStr) => {
          selectedDateString = dateStr;
        }}
      />
    );

    // Switch to Month Focus to test day popover
    await component.getByRole('button', { name: 'Month focus view' }).click();

    // Find a day cell without trip
    const dayCells = component.locator('div[title^="Click to plan mission"]');
    const firstEmptyCell = dayCells.first();
    await firstEmptyCell.click();

    // Anchored popover appears
    await expect(component.getByText('// PLAN_MISSION')).toBeVisible();
    await expect(
      component.getByText('Would you like to plan an autonomous travel mission starting on this date?')
    ).toBeVisible();

    // Click "Plan Trip" in the popover
    await component.getByRole('button', { name: /Plan Trip/ }).last().click();
    expect(selectedDateString).not.toBe('');
  });

  test('toggles Holiday Mode to paint holiday days without overlapping trips', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // Switch to Mark Holidays mode
    const holidayToggleBtn = component.getByRole('button', { name: 'Mark holidays mode' });
    await holidayToggleBtn.click();

    // Holiday banner should be visible
    await expect(component.getByText(/Holiday Mode Active/i)).toBeVisible();

    // Switch to Month Focus for clear day interaction
    await component.getByRole('button', { name: 'Month focus view' }).click();

    // Click on an empty day cell to mark holiday
    const dayCells = component.locator('div[title^="Click to plan mission"]');
    const firstEmptyCell = dayCells.first();
    await firstEmptyCell.click();

    // The cell should now be marked as holiday with badge
    await expect(component.getByText('HOLIDAY').first()).toBeVisible();

    // Clicking Berlin trip should NOT turn Berlin into a holiday
    const berlinChip = component.getByText('Berlin').first();
    await berlinChip.click();
    // Berlin remains a trip, not holiday
    await expect(component.getByText('Berlin').first()).toBeVisible();
  });
});

