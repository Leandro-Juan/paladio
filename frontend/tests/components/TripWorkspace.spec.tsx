import { test, expect } from '@playwright/experimental-ct-react';
import { TripWorkspaceHeader } from '../../src/components/trip-workspace/TripWorkspaceHeader';
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
    await expect(component.getByText('Photos')).toBeVisible();
    await expect(component.getByText('Configuration')).toBeVisible();
    await expect(component.getByRole('button', { name: /Photos/i }).getByText('12')).toBeVisible(); // Photos count badge
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

    // Click Configuration tab
    const configBtn = component.getByRole('button', { name: /Configuration/i });
    await configBtn.click();
    expect(currentTab).toBe('config');
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

    // Reopen dial for resolver action
    await triggerBtn.click();
    await solveBtn.click();
    expect(resolved).toBe(true);

    // Reopen dial for view mode switch
    await triggerBtn.click();
    await viewBtn.click();
    expect(viewMode).toBe('detailed');
  });

  test('TripUnifiedSidebar renders unified floating card panel with Route, Search, and Saved tabs', async ({ mount }) => {
    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Arrival & Old Town',
        itinerary: {
          path: [
            {
              poi: { id: 'p1', name: 'Sagrada Familia', category: 'monument', duration_mins: 90, cost_eur: 26 },
              arrival_time: 540,
              departure_time: 630,
            } as any,
            {
              poi: { id: 'p2', name: 'Park Guell', category: 'park', duration_mins: 75, cost_eur: 10 },
              arrival_time: 660,
              departure_time: 735,
            } as any,
          ],
        },
      },
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

    // Verify narrower width in route tab (380px)
    await expect(unifiedCard).toHaveCSS('width', '380px');

    // Verify dashed connector between route POIs
    const connector = component.getByTestId('route-poi-connector');
    await expect(connector.first()).toBeVisible();

    // Verify top navigation tabs: Route, Search, Transit, Weather, Saved
    const routeTab = component.getByTestId('tab-route');
    const searchTab = component.getByTestId('tab-search');
    const transitTab = component.getByTestId('tab-transit');
    const weatherTab = component.getByTestId('tab-weather');
    const savedTab = component.getByTestId('tab-saved');
    await expect(routeTab).toBeVisible();
    await expect(searchTab).toBeVisible();
    await expect(transitTab).toBeVisible();
    await expect(weatherTab).toBeVisible();
    await expect(savedTab).toBeVisible();

    // Verify only the active tab displays its name, others display only icons
    await expect(routeTab).toHaveText('Route');
    await expect(searchTab).not.toHaveText('Search');
    await expect(transitTab).not.toHaveText('Transit');
    await expect(weatherTab).not.toHaveText('Weather');
    await expect(savedTab).not.toHaveText('Saved');

    // Route tab is active by default -> Days bar should be visible
    const daysBar = component.getByTestId('day-selector-tabs');
    await expect(daysBar).toBeVisible();
    await expect(component.getByTestId('day-tab-all')).toBeVisible();
    await expect(component.getByTestId('day-tab-1')).toBeVisible();
    await expect(component.getByTestId('day-tab-2')).toBeVisible();
    await expect(component.getByTestId('day-tab-3')).toBeVisible();

    // Switch to Search tab
    await searchTab.click();

    // Verify Search tab now displays its name while Route tab only displays its icon
    await expect(searchTab).toHaveText('Search');
    await expect(routeTab).not.toHaveText('Route');
    await expect(transitTab).not.toHaveText('Transit');
    await expect(weatherTab).not.toHaveText('Weather');
    await expect(savedTab).not.toHaveText('Saved');

    // Verify width animates/resizes to wider format (520px) in Search tab
    await expect(unifiedCard).toHaveCSS('width', '520px');

    // Verify header in "All" tab says "Recommended for you"
    await expect(component.getByText('Recommended for you')).toBeVisible();

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

    // Verify Custom Dropdowns in Search Tab (Sort Order)
    await expect(component.getByTestId('sort-order-dropdown')).toBeVisible();

    // Selecting a category
    await component.getByTestId('category-tab-museum').click();
    expect(selectedCategory).toBe('museum');

    // Switch back to Route tab -> width returns to 380px
    await routeTab.click();
    await expect(unifiedCard).toHaveCSS('width', '380px');

    // Switch to Saved/Collections tab
    await savedTab.click();
    await expect(component.getByText(/Collections|Saved/i).first()).toBeVisible();
  });
});


