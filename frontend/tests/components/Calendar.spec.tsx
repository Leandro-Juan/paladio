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

  test('renders calendar header, telemetry stats, and days grid', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // Header and Telemetry checks
    await expect(component.getByText('MISSION OPERATIONS CALENDAR')).toBeVisible();
    await expect(component.getByText('TEMPORAL RADAR')).toBeVisible();
    await expect(component.getByText('TOTAL MISSIONS')).toBeVisible();
    await expect(component.getByText('ACTIVE / QUEUED')).toBeVisible();
    await expect(component.getByText('ARCHIVED (PAST)')).toBeVisible();

    // Weekdays
    await expect(component.getByText('MON')).toBeVisible();
    await expect(component.getByText('SUN')).toBeVisible();

    // Today indicator
    await expect(component.getByText('TODAY', { exact: true })).toBeVisible();
  });

  test('displays trips with correct mission indicators and opens inspector modal on click', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // Berlin is scheduled for this month, should appear in the grid
    const berlinChip = component.getByText('Berlin').first();
    await expect(berlinChip).toBeVisible();

    // Click Berlin to inspect
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

  test('month navigation switches cycles', async ({ mount }) => {
    const component = await mount(<Calendar trips={mockTrips} />);

    // Click NEXT >
    await component.getByRole('button', { name: /NEXT >/i }).click();

    // Click CYCLE TODAY to return
    await component.getByRole('button', { name: /CYCLE TODAY/i }).click();
    await expect(component.getByText('TODAY', { exact: true })).toBeVisible();
  });
});
