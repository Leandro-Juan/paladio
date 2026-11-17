import React from 'react';
import { test, expect } from '@playwright/experimental-ct-react';
import { TripTransitTab } from '../../src/components/trip-workspace/TripTransitTab';

test.describe('TripTransitTab', () => {
  test('displays spinner when transit download is building/queued', async ({ mount, page }) => {
    await page.route('**/api/trips/test-trip/transit/availability*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Tokyo',
          status: 'BUILDING',
          gtfs_status: 'BUILDING',
          derived_status: 'BUILDING',
        }),
      });
    });

    const component = await mount(
      <TripTransitTab
        tripId="test-trip"
        destinationCity="Tokyo"
        tripStartDate="2026-11-20"
        selectedDay={1}
        tripDays={[{ day_number: 1, pois: [] }]}
        savedPoiIds={new Set()}
        onToggleSavePoi={() => {}}
      />
    );

    // Switch to lines tab
    await component.getByText('Lines', { exact: true }).click();
    await expect(component.getByText('Downloading Transit Data')).toBeVisible();
    await expect(component.getByText('Retrieving lines, routes, and station stops for Tokyo...')).toBeVisible();
  });

  test('displays unavailable state and prevents download when GTFS does not exist', async ({ mount, page }) => {
    let compileCalled = false;
    await page.route('**/api/trips/test-trip/transit/availability*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Atlantis',
          status: 'UNAVAILABLE',
          gtfs_status: 'UNAVAILABLE',
          derived_status: 'UNAVAILABLE',
          reason: 'No open public transit GTFS schedule exists for this city.',
        }),
      });
    });

    await page.route('**/api/trips/transit/compile', async (route) => {
      compileCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'unavailable',
          city: 'atlantis',
          message: 'No open public transit GTFS schedule exists for Atlantis. It cannot be downloaded.',
        }),
      });
    });

    const component = await mount(
      <TripTransitTab
        tripId="test-trip"
        destinationCity="Atlantis"
        tripStartDate="2026-11-20"
        selectedDay={1}
        tripDays={[{ day_number: 1, pois: [] }]}
        savedPoiIds={new Set()}
        onToggleSavePoi={() => {}}
      />
    );

    await component.getByText('Lines', { exact: true }).click();
    await expect(component.getByTestId('transit-unavailable-card')).toBeVisible();
    await expect(component.getByText('Transit Feed Unavailable')).toBeVisible();
    await expect(
      component.getByText(/A public transit GTFS schedule does not exist or could not be fetched for Atlantis/i)
    ).toBeVisible();

    const disabledBtn = component.getByTestId('transit-unavailable-button');
    await expect(disabledBtn).toBeVisible();
    await expect(disabledBtn).toBeDisabled();
    expect(compileCalled).toBe(false);
  });

  test('displays failed state with retry button when download or derivation failed', async ({ mount, page }) => {
    await page.route('**/api/trips/test-trip/transit/availability*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Bangkok',
          status: 'READY',
          gtfs_status: 'READY',
          derived_status: 'FAILED',
        }),
      });
    });

    const component = await mount(
      <TripTransitTab
        tripId="test-trip"
        destinationCity="Bangkok"
        tripStartDate="2026-11-20"
        selectedDay={1}
        tripDays={[{ day_number: 1, pois: [] }]}
        savedPoiIds={new Set()}
        onToggleSavePoi={() => {}}
      />
    );

    await component.getByText('Lines', { exact: true }).click();
    await expect(component.getByTestId('transit-failed-card')).toBeVisible();
    await expect(component.getByText('Download or Derivation Failed')).toBeVisible();
    await expect(component.getByTestId('transit-retry-button')).toBeVisible();
  });
});
