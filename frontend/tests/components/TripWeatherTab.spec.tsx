import React from 'react';
import { test, expect } from '@playwright/experimental-ct-react';
import { TripWeatherTab } from '../../src/components/trip-workspace/TripWeatherTab';

test.describe('TripWeatherTab', () => {
  test('renders weather tab, day forecast strip, and 6 tactical highlight widgets', async ({ mount, page }) => {
    let interceptedUrl = '';
    await page.route('**/api/weather/forecast*', async (route) => {
      interceptedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Tokyo',
          latitude: 35.6895,
          longitude: 139.6917,
          timezone: 'Asia/Tokyo',
          current_temp_c: 18,
          current_condition: 'Partly Cloudy',
          current_weather_code: 1,
          current_icon_type: 'partly-cloudy',
          travel_advisory: 'Optimal meteorological conditions for pedestrian urban exploration.',
          forecast_days: [
            {
              date: '2026-11-04',
              day_name: 'Sun',
              weather_code: 0,
              condition: 'Clear Sky',
              icon_type: 'clear',
              temp_max_c: 15,
              temp_min_c: -3,
              highlights: {
                uv_index: 5,
                uv_status: 'Moderate',
                wind_speed_kmh: 7.7,
                wind_direction_deg: 240,
                wind_direction_cardinal: 'WSW',
                sunrise: '6:35 AM',
                sunset: '5:42 PM',
                humidity_pct: 12,
                humidity_status: 'Normal',
                visibility_km: 5.2,
                visibility_status: 'Average',
                aqi: 105,
                aqi_status: 'Unhealthy',
              },
            },
            {
              date: '2026-11-05',
              day_name: 'Mon',
              weather_code: 1,
              condition: 'Partly Cloudy',
              icon_type: 'partly-cloudy',
              temp_max_c: 12,
              temp_min_c: 7,
              highlights: {
                uv_index: 4,
                uv_status: 'Moderate',
                wind_speed_kmh: 11.2,
                wind_direction_deg: 180,
                wind_direction_cardinal: 'S',
                sunrise: '6:36 AM',
                sunset: '5:41 PM',
                humidity_pct: 45,
                humidity_status: 'Normal',
                visibility_km: 8.5,
                visibility_status: 'Clear',
                aqi: 45,
                aqi_status: 'Good',
              },
            },
          ],
        }),
      });
    });

    const component = await mount(
      <TripWeatherTab
        destinationCity="Tokyo"
        tripStartDate="2026-11-04"
        coordinates={{ lat: 35.6895, lng: 139.6917 }}
        tripDaysCount={7}
      />
    );

    // Verify Destination and Coordinates badge
    await expect(component.getByText('Tokyo', { exact: true })).toBeVisible();
    await expect(component.getByText('35.69°N, 139.69°E')).toBeVisible();

    // Verify API was called with start_date and end_date matching the trip days
    expect(interceptedUrl).toContain('start_date=2026-11-04');
    expect(interceptedUrl).toContain('end_date=2026-11-10');

    // Verify Day forecast strip has cards
    const day0 = component.getByTestId('weather-day-card-0');
    const day1 = component.getByTestId('weather-day-card-1');
    await expect(day0).toBeVisible();
    await expect(day1).toBeVisible();

    // Verify all 6 highlight cards are present
    await expect(component.getByTestId('weather-card-uv')).toBeVisible();
    await expect(component.getByTestId('weather-card-wind')).toBeVisible();
    await expect(component.getByTestId('weather-card-sun')).toBeVisible();
    await expect(component.getByTestId('weather-card-humidity')).toBeVisible();
    await expect(component.getByTestId('weather-card-visibility')).toBeVisible();
    await expect(component.getByTestId('weather-card-aqi')).toBeVisible();

    // Verify Travel Advisory banner
    await expect(component.getByTestId('weather-travel-advisory')).toBeVisible();

    // Verify unit toggle (°C / °F)
    const fToggle = component.getByRole('button', { name: '°F' });
    await expect(fToggle).toBeVisible();
    await fToggle.click();

    // After clicking °F, 15°C becomes 59°F
    await expect(component.getByText('59°')).toBeVisible();

    // Verify day selection interaction
    await day1.click();
    await expect(component.getByText("Mon's Highlights")).toBeVisible();
  });

  test('fetches weather strictly for explicit trip date range', async ({ mount, page }) => {
    let requestedParams: URLSearchParams | null = null;
    await page.route('**/api/weather/forecast*', async (route) => {
      const url = new URL(route.request().url());
      requestedParams = url.searchParams;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Paris',
          latitude: 48.8566,
          longitude: 2.3522,
          timezone: 'Europe/Paris',
          current_temp_c: 21,
          current_condition: 'Clear Sky',
          current_weather_code: 0,
          current_icon_type: 'clear',
          travel_advisory: 'Optimal meteorological conditions for pedestrian urban exploration.',
          forecast_days: [
            {
              date: '2026-09-10',
              day_name: 'Thu',
              weather_code: 0,
              condition: 'Clear Sky',
              icon_type: 'clear',
              temp_max_c: 24,
              temp_min_c: 14,
              highlights: {
                uv_index: 6,
                uv_status: 'Moderate',
                wind_speed_kmh: 9.0,
                wind_direction_deg: 200,
                wind_direction_cardinal: 'SSW',
                sunrise: '7:15 AM',
                sunset: '8:05 PM',
                humidity_pct: 50,
                humidity_status: 'Normal',
                visibility_km: 10.0,
                visibility_status: 'Clear',
                aqi: 30,
                aqi_status: 'Good',
              },
            },
            {
              date: '2026-09-11',
              day_name: 'Fri',
              weather_code: 1,
              condition: 'Partly Cloudy',
              icon_type: 'partly-cloudy',
              temp_max_c: 22,
              temp_min_c: 13,
              highlights: {
                uv_index: 5,
                uv_status: 'Moderate',
                wind_speed_kmh: 12.0,
                wind_direction_deg: 220,
                wind_direction_cardinal: 'SW',
                sunrise: '7:17 AM',
                sunset: '8:03 PM',
                humidity_pct: 55,
                humidity_status: 'Normal',
                visibility_km: 10.0,
                visibility_status: 'Clear',
                aqi: 35,
                aqi_status: 'Good',
              },
            },
          ],
        }),
      });
    });

    const component = await mount(
      <TripWeatherTab
        destinationCity="Paris"
        tripStartDate="2026-09-10"
        tripEndDate="2026-09-11"
        coordinates={{ lat: 48.8566, lng: 2.3522 }}
      />
    );

    await expect(component.getByText('Paris', { exact: true })).toBeVisible();
    expect(requestedParams).not.toBeNull();
    const finalParams = requestedParams as URLSearchParams | null;
    expect(finalParams?.get('start_date')).toBe('2026-09-10');
    expect(finalParams?.get('end_date')).toBe('2026-09-11');
    await expect(component.getByText('2026-09-10 – 2026-09-11', { exact: false })).toBeVisible();
    await expect(component.getByText("Thu's Highlights")).toBeVisible();
  });
});
