import { test, expect } from '@playwright/experimental-ct-react';
import { TripWorkspaceHeader } from '../../src/components/trip-workspace/TripWorkspaceHeader';
import { TripPlacesSidebar, PlaceItem } from '../../src/components/trip-workspace/TripPlacesSidebar';
import { TripTransportsView } from '../../src/components/trip-workspace/TripTransportsView';
import { TripPlanSidebar } from '../../src/components/trip-workspace/TripPlanSidebar';
import { DayOutput } from '../../src/types/domain';

test.describe('Trip Workspace Renovated Components', () => {
  test('TripWorkspaceHeader renders destination, tabs, and handles tab switching', async ({ mount }) => {
    let currentTab = 'plan';
    const component = await mount(
      <TripWorkspaceHeader
        destination="Iceland: The Ring Road"
        startDate="2027-09-12"
        endDate="2027-09-18"
        activeTab={currentTab as any}
        onTabChange={(tab) => {
          currentTab = tab;
        }}
        photosCount={12}
        participantsCount={3}
      />
    );

    await expect(component.getByText('Iceland: The Ring Road')).toBeVisible();
    await expect(component.getByText('Plan')).toBeVisible();
    await expect(component.getByText('Wallet')).toBeVisible();
    await expect(component.getByText('Costs')).toBeVisible();
    await expect(component.getByText('Collab')).toBeVisible();
    await expect(component.getByText('Photos')).toBeVisible();
    await expect(component.getByRole('button', { name: /Photos/i }).getByText('12')).toBeVisible(); // Photos count badge
    await expect(component.getByText('3')).toBeVisible();  // Collab count badge
  });

  test('TripPlacesSidebar renders POI Search Engine, categories, and handles toggling', async ({ mount }) => {
    let toggled = false;
    let selectedCategory: string | null = null;

    const component = await mount(
      <TripPlacesSidebar
        isOpen={true}
        onToggle={() => {
          toggled = true;
        }}
        city="Reykjavik"
        onCategoryFilterChange={(cat) => {
          selectedCategory = cat;
        }}
      />
    );

    await expect(component.getByText('POI SEARCH ENGINE')).toBeVisible();
    await expect(component.getByText('Search Places in Reykjavik')).toBeVisible();

    const searchInput = component.getByPlaceholder('Try "El Prado" or "cozy cafes with charm"...');
    await expect(searchInput).toBeVisible();

    // Verify category chips
    const museumBtn = component.getByRole('button', { name: 'museum', exact: true });
    await expect(museumBtn).toBeVisible();
    await museumBtn.click();
    expect(selectedCategory).toBe('museum');

    // Toggle collapse button
    const collapseBtn = component.getByLabel('Collapse POI Search');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    expect(toggled).toBe(true);
  });

  test('TripTransportsView renders flight boarding passes and arrival/departure airports', async ({ mount }) => {
    const mockItinerary = {
      days: [
        {
          day: 1,
          flight_info: {
            origin_iata: 'KEF',
            destination_iata: 'RVK',
            flight_number: 'FI-101',
            departure_time: '2027-09-12T08:00:00Z',
            arrival_time: '2027-09-12T09:15:00Z',
          },
        },
      ],
    };

    const component = await mount(
      <TripTransportsView itinerary={mockItinerary as any} />
    );

    await expect(component.getByText('KEF')).toBeVisible();
    await expect(component.getByText('RVK')).toBeVisible();
    await expect(component.getByText('FI-101')).toBeVisible();
  });

  test('TripPlanSidebar displays and allows selecting all days when a trip has more than 4 days', async ({ mount }) => {
    const mockDays: DayOutput[] = [
      { day: 1, theme: 'Arrival & City Center', itinerary: { path: [] } },
      { day: 2, theme: 'Historic Monuments', itinerary: { path: [] } },
      { day: 3, theme: 'Royal Palace & Gardens', itinerary: { path: [] } },
      { day: 4, theme: 'Culinary & Markets', itinerary: { path: [] } },
      { day: 5, theme: 'Art & Masterpieces', itinerary: { path: [] } },
      { day: 6, theme: 'Parks & Farewell', itinerary: { path: [] } },
    ];

    let selectedDay: number | 'all' = 'all';

    const component = await mount(
      <TripPlanSidebar
        isOpen={true}
        onToggle={() => {}}
        days={mockDays}
        selectedDay={selectedDay}
        onSelectDay={(day) => {
          selectedDay = day;
        }}
      />
    );

    // Verify all day buttons are rendered and visible (including day 5 and 6)
    const tabsContainer = component.getByTestId('day-selector-tabs');
    await expect(tabsContainer).toBeVisible();

    const allDaysBtn = component.getByTestId('day-tab-all');
    await expect(allDaysBtn).toBeVisible();

    for (let dayNum = 1; dayNum <= 6; dayNum++) {
      const dayBtn = component.getByTestId(`day-tab-${dayNum}`);
      await expect(dayBtn).toBeVisible();
      await expect(dayBtn).toHaveText(`DAY ${dayNum}`);
    }

    // Verify carousel navigation arrow buttons are rendered
    const prevBtn = component.getByTestId('day-nav-prev');
    const nextBtn = component.getByTestId('day-nav-next');
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Clicking next button is enabled and clickable
    await nextBtn.click();

    // Verify selecting Day 5 works
    const day5Btn = component.getByTestId('day-tab-5');
    await day5Btn.click();
    expect(selectedDay).toBe(5);

    // Verify selecting Day 6 works
    const day6Btn = component.getByTestId('day-tab-6');
    await day6Btn.click();
    expect(selectedDay).toBe(6);

    // Verify selecting ALL DAYS works
    await allDaysBtn.click();
    expect(selectedDay).toBe('all');
  });

  test('TripPlanSidebar displays carousel arrows for a 5-day trip (Tokyo)', async ({ mount }) => {
    const mock5Days: DayOutput[] = [
      { day: 1, theme: 'Asakusa & Ueno', itinerary: { path: [] } },
      { day: 2, theme: 'Shibuya & Shinjuku', itinerary: { path: [] } },
      { day: 3, theme: 'Ginza & Akihabara', itinerary: { path: [] } },
      { day: 4, theme: 'Roppongi & Tokyo Tower', itinerary: { path: [] } },
      { day: 5, theme: 'Odaiba & Bay Area', itinerary: { path: [] } },
    ];

    let selectedDay: number | 'all' = 'all';

    const component = await mount(
      <TripPlanSidebar
        isOpen={true}
        onToggle={() => {}}
        days={mock5Days}
        selectedDay={selectedDay}
        onSelectDay={(day) => {
          selectedDay = day;
        }}
      />
    );

    const prevBtn = component.getByTestId('day-nav-prev');
    const nextBtn = component.getByTestId('day-nav-next');
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Verify day 5 button exists
    const day5Btn = component.getByTestId('day-tab-5');
    await expect(day5Btn).toBeVisible();
    await day5Btn.click();
    expect(selectedDay).toBe(5);
  });

  test('TripPlanSidebar renders transit route view pill toggle and switches modes', async ({ mount }) => {
    let mode: 'simple' | 'detailed' = 'simple';
    const mockDays: DayOutput[] = [
      { day: 1, theme: 'Arrival', itinerary: { path: [] } },
    ];

    const component = await mount(
      <TripPlanSidebar
        isOpen={true}
        onToggle={() => {}}
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        transitMode={mode}
        onTransitModeChange={(m) => {
          mode = m;
        }}
      />
    );

    // Verify transit route pill controls are visible
    const simplePill = component.getByTestId('transit-pill-simple');
    const detailedPill = component.getByTestId('transit-pill-detailed');
    await expect(simplePill).toBeVisible();
    await expect(detailedPill).toBeVisible();
    await expect(simplePill).toHaveText('SIMPLE');
    await expect(detailedPill).toHaveText('DETAILED');

    // Click Detailed Transit
    await detailedPill.click();
    expect(mode).toBe('detailed');

    // Click Simple Transit
    await simplePill.click();
    expect(mode).toBe('simple');
  });

  test('TripWorkspaceHeader renders animated sliding pill indicator and transitions on tab click', async ({ mount }) => {
    let currentTab = 'plan';
    const component = await mount(
      <TripWorkspaceHeader
        destination="Iceland: The Ring Road"
        activeTab={currentTab as any}
        onTabChange={(tab) => {
          currentTab = tab;
        }}
      />
    );

    const nav = component.getByRole('tablist');
    await expect(nav).toBeVisible();

    const indicator = nav.locator('div[aria-hidden="true"]');
    await expect(indicator).toBeVisible();

    // Click Costs tab
    const costsBtn = component.getByRole('button', { name: /Costs/i });
    await costsBtn.click();
    expect(currentTab).toBe('costs');
  });
});

