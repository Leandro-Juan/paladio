import { test, expect } from '@playwright/test';
import { mockAuthenticatedUser } from './test-utils';

test.describe('Demo Mode Global Airport & City Search', () => {
  test('resolves worldwide cities, IATA codes, and airport names via /api/locations/*', async ({ request }) => {
    const alicanteRes = await request.get('/api/locations/search?q=alicante&limit=8');
    expect(alicanteRes.ok()).toBeTruthy();
    const alicanteData = await alicanteRes.json();
    expect(Array.isArray(alicanteData)).toBeTruthy();
    expect(alicanteData.length).toBeGreaterThanOrEqual(2);
    expect(alicanteData[0]).toMatchObject({
      city: 'Alicante',
      country: 'ES',
      airport_iata: 'ALC',
    });
    expect(alicanteData.some((item: { airport_iata: string }) => item.airport_iata === 'BCD')).toBeTruthy();

    const barcelonaRes = await request.get('/api/locations/search?q=barcelona&limit=8');
    expect(barcelonaRes.ok()).toBeTruthy();
    const barcelonaData = await barcelonaRes.json();
    expect(barcelonaData[0]).toMatchObject({
      city: 'Barcelona',
      country: 'ES',
      airport_iata: 'BCN',
    });

    const iataRes = await request.get('/api/locations/search?q=ALC&limit=8');
    expect(iataRes.ok()).toBeTruthy();
    const iataData = await iataRes.json();
    expect(iataData[0].airport_iata).toBe('ALC');

    const parisRes = await request.get('/api/locations/search?q=Paris&limit=8');
    expect(parisRes.ok()).toBeTruthy();
    const parisData = await parisRes.json();
    const parisIatas = parisData.map((item: { airport_iata: string }) => item.airport_iata);
    expect(parisIatas).toContain('CDG');
    expect(parisIatas).toContain('ORY');

    const heathrowRes = await request.get('/api/locations/search?q=Heathrow&limit=8');
    expect(heathrowRes.ok()).toBeTruthy();
    const heathrowData = await heathrowRes.json();
    expect(heathrowData[0].airport_iata).toBe('LHR');

    const resolveRes = await request.get('/api/locations/resolve-airport?city=Alicante');
    expect(resolveRes.ok()).toBeTruthy();
    const resolveData = await resolveRes.json();
    expect(resolveData.iata).toBe('ALC');

    const unknownRes = await request.get('/api/locations/resolve-airport?city=zzzznotacity999');
    expect(unknownRes.ok()).toBeTruthy();
    const unknownData = await unknownRes.json();
    expect(unknownData.iata).toBeNull();
  });

  test('displays matching worldwide airports in /engine origin autocomplete', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/engine');

    const originInput = page.getByTestId('origin-location-input');
    await expect(originInput).toBeVisible({ timeout: 15000 });
    await originInput.fill('alicante');

    const firstOption = page.getByTestId('origin-location-option').first();
    await expect(firstOption).toBeVisible({ timeout: 10000 });
    await expect(firstOption).toContainText('Alicante, Spain');
    await expect(firstOption).toContainText('ALC');

    await firstOption.click();
    await expect(page.getByTestId('origin-iata-input')).toHaveValue('ALC');
  });
});
