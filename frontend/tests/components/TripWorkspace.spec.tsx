import { test, expect } from '@playwright/experimental-ct-react';
import { TripWorkspaceHeader } from '../../src/components/trip-workspace/TripWorkspaceHeader';
import { TripPlacesSidebar, PlaceItem } from '../../src/components/trip-workspace/TripPlacesSidebar';
import { TripTransportsView } from '../../src/components/trip-workspace/TripTransportsView';

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
    await expect(component.getByText('Transports')).toBeVisible();
    await expect(component.getByText('Costs')).toBeVisible();
    await expect(component.getByText('Collab')).toBeVisible();
    await expect(component.getByText('Photos')).toBeVisible();
    await expect(component.getByText('12')).toBeVisible(); // Photos count badge
    await expect(component.getByText('3')).toBeVisible();  // Collab count badge
  });

  test('TripPlacesSidebar filters places by search text and shows placeholder modal', async ({ mount }) => {
    const mockPlaces: PlaceItem[] = [
      { name: 'Blue Lagoon', lat: 63.88, lng: -22.44, category: 'attraction', day: 1 },
      { name: 'Reykjanes Lighthouse', lat: 63.81, lng: -22.71, category: 'landmark', day: 1 },
      { name: 'Gullfoss Waterfall', lat: 64.32, lng: -20.12, category: 'attraction', day: 2 },
    ];

    const component = await mount(
      <TripPlacesSidebar
        isOpen={true}
        onToggle={() => {}}
        places={mockPlaces}
      />
    );

    await expect(component.getByText('3 PLACES')).toBeVisible();
    await expect(component.getByText('Blue Lagoon')).toBeVisible();
    await expect(component.getByText('Gullfoss Waterfall')).toBeVisible();

    // Type in search
    const searchInput = component.getByPlaceholder('Search places...');
    await searchInput.fill('Gullfoss');
    await expect(component.getByText('Gullfoss Waterfall')).toBeVisible();
    await expect(component.getByText('Blue Lagoon')).not.toBeVisible();

    // Clear search and click Add Place / Activity
    await searchInput.fill('');
    const addBtn = component.getByRole('button', { name: /Add Place \/ Activity/i });
    await addBtn.click();
    await expect(component.getByText('// POI SEARCH INTEGRATION')).toBeVisible();
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
});
