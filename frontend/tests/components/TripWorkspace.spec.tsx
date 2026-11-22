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

  test('TripUnifiedSidebar allows editing day name in edit mode and fires onRenameDay', async ({ mount }) => {
    let renamedDay: number | null = null;
    let renamedTitle: string | null = null;

    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Fashion & Boutiques',
        itinerary: { path: [] },
      },
      {
        day: 2,
        theme: 'Temples & Riverside',
        itinerary: { path: [] },
      },
    ];

    // 1. Outside edit mode, input is not rendered
    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Bangkok"
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        isEditMode={false}
      />
    );

    await expect(component.getByTestId('edit-day-name-input-1')).toHaveCount(0);
    await expect(component.getByText(/Día 1 — Fashion & Boutiques|Day 1 — Fashion & Boutiques/i)).toBeVisible();

    // 2. In edit mode, input is rendered with current theme
    await component.update(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Bangkok"
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        isEditMode={true}
        onRenameDay={(day, newTheme) => {
          renamedDay = day;
          renamedTitle = newTheme;
        }}
      />
    );

    const input = component.getByTestId('edit-day-name-input-1');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Fashion & Boutiques');

    // 3. Edit the day name and press Enter
    await input.fill('Shopping & Night Markets');
    await input.press('Enter');

    expect(renamedDay).toBe(1);
    expect(renamedTitle).toBe('Shopping & Night Markets');
  });

  test('TripUnifiedSidebar switches day on hover during POI drag', async ({ mount, page }) => {
    let selectedDay: number | 'all' = 1;
    const mockDays: any[] = [
      {
        day: 1,
        theme: 'Historical Shrines',
        itinerary: {
          path: [
            {
              poi: {
                id: 'poi-1',
                name: 'Senso-ji Temple',
                category: 'attraction',
                lat: 35.7147,
                lng: 139.7966,
                duration_mins: 60,
                cost_eur: 0,
              },
              arrival_time: '09:00',
              departure_time: '10:00',
              visit_duration_minutes: 60,
            },
          ],
        },
      },
      {
        day: 2,
        theme: 'Modern Architecture',
        itinerary: {
          path: [
            {
              poi: {
                id: 'poi-2',
                name: 'Tokyo Skytree',
                category: 'attraction',
                lat: 35.71,
                lng: 139.8107,
                duration_mins: 75,
                cost_eur: 18,
              },
              arrival_time: '11:00',
              departure_time: '12:15',
              visit_duration_minutes: 75,
            },
          ],
        },
      },
    ];

    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Tokyo"
        days={mockDays as DayOutput[]}
        selectedDay={selectedDay}
        onSelectDay={(d) => {
          selectedDay = d;
        }}
        isEditMode={false}
      />
    );

    // Set simulated active POI on window
    await page.evaluate(() => {
      (window as any).__paladioActivePoi = {
        source: 'map',
        poi: { id: 'poi-3', name: 'Ueno Park', category: 'park' },
      };
    });

    const day2Tab = component.getByTestId('day-tab-2');
    await expect(day2Tab).toBeVisible();

    // Trigger dragover on Day 2 tab with real DataTransfer object
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="day-tab-2"]');
      const dt = new DataTransfer();
      dt.setData('application/paladio-poi', 'test');
      const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
      el?.dispatchEvent(ev);
    });

    // Wait for the hover dwell time (180ms)
    await page.waitForTimeout(250);

    expect(selectedDay).toBe(2);
  });

  test('cleanupCustomDragPreview applies fade-out animation and transition styles on drag end', async ({ mount, page }) => {
    const mockDays: DayOutput[] = [
      {
        day: 1,
        theme: 'Historical Shrines',
        itinerary: { path: [] },
      },
    ];

    await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Tokyo"
        days={mockDays}
        selectedDay={1}
        onSelectDay={() => {}}
        isEditMode={false}
      />
    );

    // Wait for useEffect listeners to register
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const el = document.createElement('div');
      el.setAttribute('data-paladio-custom-drag-preview', 'true');
      el.style.opacity = '1';
      document.body.appendChild(el);
      window.dispatchEvent(new CustomEvent('paladio:drag-ended'));
    });

    const isFading = await page.evaluate(() => {
      const el = document.querySelector('[data-paladio-custom-drag-preview]');
      return {
        fadingAttr: el?.getAttribute('data-paladio-fading-out'),
        opacity: (el as HTMLElement)?.style.opacity,
        transition: (el as HTMLElement)?.style.transition,
      };
    });

    expect(isFading.fadingAttr).toBe('true');
    expect(isFading.opacity).toBe('0');
    expect(isFading.transition).toContain('opacity 220ms');
  });

  test('TripUnifiedSidebar auto-scrolls route content when dragging near top/bottom edges', async ({ mount, page }) => {
    // Generate 15 stops so the container is tall and scrollable
    const pathStops = Array.from({ length: 15 }, (_, i) => ({
      poi: {
        id: `stop-${i + 1}`,
        name: `Stop Venue #${i + 1}`,
        category: 'attraction',
        lat: 35.6 + i * 0.005,
        lng: 139.7 + i * 0.005,
        duration_mins: 45,
        cost_eur: 5,
      },
      arrival_time: `${9 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}`,
      departure_time: `${10 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}`,
      visit_duration_minutes: 45,
    }));

    const mockDays: any[] = [
      {
        day: 1,
        theme: 'Long Day of Exploration',
        itinerary: { path: pathStops },
      },
    ];

    const component = await mount(
      <TripUnifiedSidebar
        isOpen={true}
        onToggle={() => {}}
        destinationCity="Tokyo"
        days={mockDays as DayOutput[]}
        selectedDay={1}
        onSelectDay={() => {}}
        isEditMode={false}
      />
    );

    // Set simulated active POI on window
    await page.evaluate(() => {
      (window as any).__paladioActivePoi = {
        source: 'map',
        poi: { id: 'poi-dragged', name: 'Floating Place', category: 'attraction' },
      };
    });

    // Make sure scroll container has overflow and measurable height in test runner
    const scrollContainer = component.locator('.no-scrollbar').first();
    await expect(scrollContainer).toBeVisible();

    await page.evaluate(() => {
      const el = document.querySelector('.no-scrollbar') as HTMLElement | null;
      if (el) {
        el.style.height = '300px';
        el.style.maxHeight = '300px';
        el.style.overflowY = 'auto';
      }
    });

    // Initial scrollTop is 0
    const initialScrollTop = await page.evaluate(() => {
      const el = document.querySelector('.no-scrollbar') as HTMLElement | null;
      return el?.scrollTop ?? 0;
    });
    expect(initialScrollTop).toBe(0);

    // Hover near the bottom edge of the scroll container
    await page.evaluate(() => {
      const el = document.querySelector('.no-scrollbar') as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const dt = new DataTransfer();
        dt.setData('application/paladio-poi', 'test');
        // Dispatch dragover 15px from bottom
        const ev = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: rect.left + rect.width / 2,
          clientY: rect.bottom - 15,
        });
        window.dispatchEvent(ev);
      }
    });

    // Let the rAF loop run for a few frames
    await page.waitForTimeout(200);

    const scrolledDownTop = await page.evaluate(() => {
      const el = document.querySelector('.no-scrollbar') as HTMLElement | null;
      return el?.scrollTop ?? 0;
    });

    // Must have scrolled down
    expect(scrolledDownTop).toBeGreaterThan(0);

    // Now hover near the top edge to scroll back up
    await page.evaluate(() => {
      const el = document.querySelector('.no-scrollbar') as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const dt = new DataTransfer();
        dt.setData('application/paladio-poi', 'test');
        // Dispatch dragover 15px from top
        const ev = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + 15,
        });
        window.dispatchEvent(ev);
      }
    });

    // Let rAF scroll up
    await page.waitForTimeout(200);

    const scrolledUpTop = await page.evaluate(() => {
      const el = document.querySelector('.no-scrollbar') as HTMLElement | null;
      return el?.scrollTop ?? 0;
    });

    // Must have scrolled back towards 0
    expect(scrolledUpTop).toBeLessThan(scrolledDownTop);

    // Dispatch dragend to ensure animation loop terminates cleanly
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('paladio:drag-ended'));
    });
  });
});




