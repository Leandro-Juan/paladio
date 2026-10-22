import { test, expect } from '@playwright/experimental-ct-react';
import { TripWorkspaceHeader } from '../../src/components/trip-workspace/TripWorkspaceHeader';
import { TripPlacesSidebar, PlaceItem } from '../../src/components/trip-workspace/TripPlacesSidebar';
import { TripPlanSidebar } from '../../src/components/trip-workspace/TripPlanSidebar';
import { TripSpeedDial } from '../../src/components/trip-workspace/TripSpeedDial';
import { TripUnifiedSidebar } from '../../src/components/trip-workspace/TripUnifiedSidebar';
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

  test('TripPlanSidebar renders clean timeline without editing clutter, and shows stop locks only when isEditMode is active', async ({ mount }) => {
    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Arrival',
        itinerary: {
          path: [
            {
              poi: {
                id: 'wp-1',
                name: 'Tokyo Tower',
                category: 'attraction',
                duration_mins: 60,
                cost_eur: 15,
                city: 'Tokyo',
                location: { latitude: 35.6586, longitude: 139.7454 },
              },
            },
          ],
        },
      },
    ];

    // 1. In read-only mode (isEditMode = false):
    // // ITINERARY TIMELINE, EST. cost banner, transit pills, and lock icons must NOT be present
    const readOnlyComponent = await mount(
      <TripPlanSidebar
        isOpen={true}
        onToggle={() => {}}
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        isEditMode={false}
      />
    );

    await expect(readOnlyComponent.getByText('// ITINERARY TIMELINE')).not.toBeVisible();
    await expect(readOnlyComponent.getByText(/EST\./i)).not.toBeVisible();
    await expect(readOnlyComponent.getByTestId('transit-pill-simple')).not.toBeVisible();
    await expect(readOnlyComponent.getByText('Tokyo Tower')).toBeVisible();

    // 2. In edit mode (isEditMode = true):
    // Stop lock button becomes accessible
    await readOnlyComponent.unmount();
    const editComponent = await mount(
      <TripPlanSidebar
        isOpen={true}
        onToggle={() => {}}
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        isEditMode={true}
      />
    );

    const lockBtn = editComponent.getByRole('button', { name: /lock waypoint in place/i });
    await expect(lockBtn).toBeVisible();
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

  test('TripPlacesSidebar seamlessly transitions to PoiDetailView when inspectedPoiId is provided', async ({ mount }) => {
    let closed = false;

    const component = await mount(
      <TripPlacesSidebar
        isOpen={true}
        onToggle={() => {}}
        city="Tokyo"
        inspectedPoiId="osm-way-94124811"
        onCloseInspect={() => {
          closed = true;
        }}
      />
    );

    // Inspector header should be rendered occupying the exact sidebar space
    await expect(component.getByText('// POI INSPECTOR')).toBeVisible();
    const backBtn = component.getByLabel('Back to Search');
    await expect(backBtn).toBeVisible();

    await backBtn.click();
    expect(closed).toBe(true);
  });

  test('TripSpeedDial renders circular FAB and pops up Edit Mode, Day Resolver, and View switch', async ({ mount }) => {
    let editMode = false;
    let resolved = false;
    let viewMode = 'simple';

    const component = await mount(
      <TripSpeedDial
        isEditMode={editMode}
        onToggleEditMode={() => {
          editMode = !editMode;
        }}
        onReoptimizeDay={async () => {
          resolved = true;
        }}
        isReoptimizing={false}
        transitMode={viewMode as 'simple' | 'detailed'}
        onToggleTransitMode={() => {
          viewMode = viewMode === 'simple' ? 'detailed' : 'simple';
        }}
        selectedDay={1}
      />
    );

    // Initial state: trigger button visible with three-line menu icon
    const triggerBtn = component.getByTestId('speed-dial-trigger');
    await expect(triggerBtn).toBeVisible();

    // Click trigger to pop up action buttons
    await triggerBtn.click();

    // Check three action buttons are visible
    const editBtn = component.getByTestId('speed-dial-edit-mode');
    await expect(editBtn).toBeVisible();
    await expect(component.getByText('EDIT ROUTE')).toBeVisible();

    const solveBtn = component.getByTestId('speed-dial-resolver');
    await expect(solveBtn).toBeVisible();
    await expect(component.getByText('SOLVE DAY 1')).toBeVisible();

    const viewBtn = component.getByTestId('speed-dial-view-toggle');
    await expect(viewBtn).toBeVisible();
    await expect(component.getByText('VIEW: SIMPLE')).toBeVisible();

    // Trigger edit mode click
    await editBtn.click();
    expect(editMode).toBe(true);

    // Trigger solve day click
    await solveBtn.click();
    expect(resolved).toBe(true);

    // Trigger view mode click
    await viewBtn.click();
    expect(viewMode).toBe('detailed');
  });

  test('TripUnifiedSidebar renders unified floating card panel with Route, Search, and Saved tabs', async ({ mount }) => {
    const mockDays: DayOutput[] = [
      { day: 1, theme: 'Arrival & Old Town', itinerary: { path: [] } },
      { day: 2, theme: 'Museums & Art', itinerary: { path: [] } },
      { day: 3, theme: 'Parks & Panorama', itinerary: { path: [] } },
    ];
    let selectedDay: number | 'all' = 1;
    let selectedCategory: string | null = null;

    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Barcelona"
        days={mockDays}
        selectedDay={selectedDay}
        onSelectDay={(day) => {
          selectedDay = day;
        }}
        categoryFilter={selectedCategory as any}
        onCategoryFilterChange={(cat) => {
          selectedCategory = cat;
        }}
      />
    );

    // Verify main unified card is visible
    const unifiedCard = component.getByTestId('trip-unified-sidebar');
    await expect(unifiedCard).toBeVisible();

    // Verify top navigation tabs: Route, Search, Saved
    const routeTab = component.getByTestId('tab-route');
    const searchTab = component.getByTestId('tab-search');
    const savedTab = component.getByTestId('tab-saved');
    await expect(routeTab).toBeVisible();
    await expect(searchTab).toBeVisible();
    await expect(savedTab).toBeVisible();

    // Route tab is active by default -> Days bar should be visible
    const daysBar = component.getByTestId('day-selector-tabs');
    await expect(daysBar).toBeVisible();
    await expect(component.getByTestId('day-tab-all')).toBeVisible();
    await expect(component.getByTestId('day-tab-1')).toBeVisible();
    await expect(component.getByTestId('day-tab-2')).toBeVisible();
    await expect(component.getByTestId('day-tab-3')).toBeVisible();

    // Switch to Search tab
    await searchTab.click();

    // Now categories bar should be visible
    const categoriesBar = component.getByTestId('category-selector-tabs');
    await expect(categoriesBar).toBeVisible();
    await expect(component.getByTestId('category-tab-all')).toBeVisible();
    await expect(component.getByTestId('category-tab-museum')).toBeVisible();
    await expect(component.getByTestId('category-tab-restaurant')).toBeVisible();

    // Verify Search input and button are visible
    const searchInput = component.getByTestId('unified-search-input');
    await expect(searchInput).toBeVisible();
    await expect(component.getByTestId('unified-search-btn')).toBeVisible();

    // Verify Custom Dropdowns in Search Tab (Target Day, Sort Order, Price, Duration)
    await expect(component.getByTestId('target-day-dropdown')).toBeVisible();
    await expect(component.getByTestId('sort-order-dropdown')).toBeVisible();
    await expect(component.getByTestId('price-filter-dropdown')).toBeVisible();
    await expect(component.getByTestId('duration-filter-dropdown')).toBeVisible();

    // Selecting a category
    await component.getByTestId('category-tab-museum').click();
    expect(selectedCategory).toBe('museum');

    // Switch to Saved tab
    await savedTab.click();
    await expect(component.getByText(/Saved Places/i)).toBeVisible();
  });
});


