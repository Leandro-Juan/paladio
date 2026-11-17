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
      />
    );

    await expect(component.getByText('Iceland: The Ring Road')).toBeVisible();
    await expect(component.getByText('Plan')).toBeVisible();
    await expect(component.getByText('Wallet')).toBeVisible();
    await expect(component.getByText('Costs')).toBeVisible();
    await expect(component.getByText('Photos')).toBeVisible();
    await expect(component.getByRole('button', { name: 'Plan' })).toBeVisible();
    await expect(component.getByRole('button', { name: 'Wallet' })).toBeVisible();
    await expect(component.getByRole('button', { name: 'Costs' })).toBeVisible();
    await expect(component.getByRole('button', { name: 'Photos' })).toBeVisible();
    await expect(component.getByRole('button', { name: 'Configuration' })).toBeVisible();

    // Ensure tabs contain no number badges
    const allTabSpans = await component.getByRole('tablist').locator('span').allInnerTexts();
    expect(allTabSpans.some((text) => /^\d+$/.test(text.trim()))).toBe(false);
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
        onToggleDropWaypoint={() => {
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

    const waypointBtn = component.getByTestId('speed-dial-waypoint');
    await expect(waypointBtn).toBeVisible();
    await expect(component.getByText('DROP WAYPOINT')).toBeVisible();

    const viewBtn = component.getByTestId('speed-dial-view-toggle');
    await expect(viewBtn).toBeVisible();
    await expect(component.getByText('VIEW: SIMPLE')).toBeVisible();

    // Trigger edit mode click
    await editBtn.click();
    expect(editMode).toBe(true);

    // Reopen dial for waypoint action
    await triggerBtn.click();
    await waypointBtn.click();
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

    // Verify top navigation tabs: Route, Search, Transit, Weather, Saved, Agent
    const routeTab = component.getByTestId('tab-route');
    const searchTab = component.getByTestId('tab-search');
    const transitTab = component.getByTestId('tab-transit');
    const weatherTab = component.getByTestId('tab-weather');
    const savedTab = component.getByTestId('tab-saved');
    const agentTab = component.getByTestId('tab-agent');
    await expect(routeTab).toBeVisible();
    await expect(searchTab).toBeVisible();
    await expect(transitTab).toBeVisible();
    await expect(weatherTab).toBeVisible();
    await expect(savedTab).toBeVisible();
    await expect(agentTab).toBeVisible();

    // Verify only the active tab displays its name, others display only icons
    await expect(routeTab).toHaveText('Route');
    await expect(searchTab).not.toHaveText('Search');
    await expect(transitTab).not.toHaveText('Transit');
    await expect(weatherTab).not.toHaveText('Weather');
    await expect(savedTab).not.toHaveText('Saved');
    await expect(agentTab).not.toHaveText('Agent');

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

    // Switch to Agent tab
    await agentTab.click();
    await expect(agentTab).toHaveText('Agent');
    await expect(unifiedCard).toHaveCSS('width', '520px');
  });

  test('TripUnifiedSidebar handles POI drag-and-drop into itinerary slots', async ({ mount }) => {
    let updatedItinerary: any = null;
    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Discovery',
        itinerary: {
          path: [
            {
              poi: { id: 'p1', name: 'Existing Stop 1', category: 'attraction', duration_mins: 60, cost_eur: 15 },
              arrival_time: 600,
              departure_time: 660,
            } as any,
            {
              poi: { id: 'p2', name: 'Existing Stop 2', category: 'museum', duration_mins: 75, cost_eur: 20 },
              arrival_time: 680,
              departure_time: 755,
            } as any,
          ],
        },
      },
    ];

    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Tokyo"
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        itinerary={{ days: mockDays } as any}
        onItineraryUpdate={(newItin) => {
          updatedItinerary = newItin;
        }}
      />
    );

    // Initial stop is present
    await expect(component.getByText('Existing Stop 1')).toBeVisible();

    // Route tab button has onDragOver and onDragEnter
    const routeTab = component.getByTestId('tab-route');
    await routeTab.dispatchEvent('dragover');
    await expect(routeTab).toHaveText('Route');

    // Simulate drop of a new POI onto the connector drop zone
    const dropTarget = component.getByTestId('route-poi-connector').first();
    await dropTarget.evaluate((el) => {
      const dt = new DataTransfer();
      const payload = JSON.stringify({
        source: 'search',
        poi: {
          id: 'new-p2',
          name: 'Tokyo Tower',
          category: 'monument',
          duration_mins: 90,
          cost_eur: 20,
          lat: 35.6586,
          lng: 139.7454,
        },
      });
      dt.setData('application/paladio-poi', payload);
      dt.setData('text/plain', payload);
      const ev = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
    });

    // onItineraryUpdate was called and new stop is in itinerary
    expect(updatedItinerary).not.toBeNull();
    const day1Path = updatedItinerary.days[0].itinerary.path;
    expect(day1Path.some((s: any) => s.poi?.name === 'Tokyo Tower')).toBe(true);
  });

  test('TripUnifiedSidebar hides day add/remove buttons and POI blue outlines outside edit mode', async ({ mount }) => {
    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Arrival & Old Town',
        itinerary: {
          path: [
            {
              poi: { id: 'hotel-1', name: 'Hotel Grand Central', category: 'hotel' },
              arrival_time: 540,
              departure_time: 600,
            } as any,
            {
              poi: { id: 'p1', name: 'Sagrada Familia', category: 'monument' },
              arrival_time: 620,
              departure_time: 700,
            } as any,
          ],
        },
      },
      { day: 2, theme: 'Museums & Art', itinerary: { path: [] } },
    ];

    // 1. Mount outside edit mode (isEditMode = false)
    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Barcelona"
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        onAddDay={() => {}}
        onRemoveDay={() => {}}
        hotelAnchor={{ name: 'Hotel Grand Central', lat: 41.3851, lng: 2.1734 }}
        isEditMode={false}
      />
    );

    // Verify + and - buttons are NOT rendered outside edit mode
    await expect(component.getByTestId('add-day-tab-btn')).toHaveCount(0);
    await expect(component.getByTestId('remove-day-tab-1')).toHaveCount(0);
    await expect(component.getByTestId('remove-day-tab-2')).toHaveCount(0);

    // Verify hotel stop card does not have blue outline (2px #2563EB) outside edit mode
    const hotelCard = component.getByTestId('poi-stop-card-hotel-1');
    await expect(hotelCard).toBeVisible();
    await expect(hotelCard).not.toHaveCSS('border-color', 'rgb(37, 99, 235)');

    // 2. Re-mount with isEditMode = true
    await component.update(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Barcelona"
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        onAddDay={() => {}}
        onRemoveDay={() => {}}
        hotelAnchor={{ name: 'Hotel Grand Central', lat: 41.3851, lng: 2.1734 }}
        isEditMode={true}
      />
    );

    // Verify + and - buttons are now visible in edit mode
    await expect(component.getByTestId('add-day-tab-btn')).toBeVisible();
    await expect(component.getByTestId('remove-day-tab-1')).toBeVisible();
    await expect(component.getByTestId('remove-day-tab-2')).toBeVisible();

    // Verify hotel stop card (anchor/fixed) now has blue outline (#2563EB) in edit mode
    await expect(hotelCard).toHaveCSS('border-color', 'rgb(37, 99, 235)');
  });

  test('TripUnifiedSidebar displays Download POIs Database button when city POI database is erased and shows spinner on click', async ({ mount, page }) => {
    test.setTimeout(30000);

    // Mock /pois/search to return city_total_pois: 0
    await page.route('**/api/pois/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Bangkok',
          query: '',
          search_type: 'recommendations',
          exact_match_found: false,
          results: [],
          total: 0,
          city_total_pois: 0,
          is_hydrating: false,
        }),
      });
    });

    // Mock /pois/city/Bangkok/download
    await page.route('**/api/pois/city/*/download', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'initiated',
          city: 'Bangkok',
          task_id: 'test-download-task',
          message: 'POI database download initiated for Bangkok.',
        }),
      });
    });

    // Mock status endpoint
    await page.route('**/api/pois/city/*/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Bangkok',
          poi_count: 0,
          is_hydrating: false,
        }),
      });
    });

    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Arrival',
        itinerary: { path: [] },
      },
    ];

    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Bangkok"
        days={mockDays}
        selectedDay="all"
        onSelectDay={() => {}}
      />
    );

    // Switch to Search tab
    await component.getByRole('button', { name: 'Search', exact: true }).click();

    // Verify Download POI Database card and button appear
    const downloadCard = component.getByTestId('poi-database-download-card');
    await expect(downloadCard).toBeVisible();
    await expect(component.getByText('POI Database Required')).toBeVisible();

    const downloadBtn = component.getByTestId('download-pois-database-btn');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toHaveText(/Download POIs Database/i);

    // Click download button
    await downloadBtn.click();

    // Verify spinner and downloading state appear
    const spinnerState = component.getByTestId('download-pois-spinner');
    await expect(spinnerState).toBeVisible();
    await expect(spinnerState).toHaveText(/Downloading POIs? database for Bangkok/i);
  });
});



