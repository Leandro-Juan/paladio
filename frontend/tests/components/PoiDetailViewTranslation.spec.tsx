import { test, expect } from '@playwright/experimental-ct-react';
import { PoiDetailView } from '../../src/components/trip-workspace/PoiDetailView';

test.describe('PoiDetailView Overview Translation Button', () => {
  test('hides translate button when description is already in user locale (en)', async ({ mount, page }) => {
    await page.route('**/api/pois/OSM-way-257875*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'OSM-way-257875',
          name: 'Gaysorn Amarin',
          category: 'shopping',
          city: 'Bangkok',
          lat: 13.7435,
          lng: 100.5413,
          duration_mins: 30,
          cost_eur: 0,
          cost_is_estimated: false,
          scoring: {},
          description:
            'Gaysorn Amarin, previously known as Amarin Plaza (อัมรินทร์พลาซ่า), is a shopping mall and office building complex located in Bangkok.',
          description_lang: 'en',
          photos: [],
        }),
      });
    });

    const component = await mount(
      <PoiDetailView
        poiId="OSM-way-257875"
        city="Bangkok"
        onClose={() => {}}
      />
    );

    await expect(component.getByTestId('poi-overview-description')).toContainText('Gaysorn Amarin');
    await expect(component.getByTestId('translate-poi-description-btn')).toHaveCount(0);
  });

  test('shows translate button on the right of OVERVIEW when language differs, translates and toggles original', async ({
    mount,
    page,
  }) => {
    const spanishDesc =
      'El Museo del Prado es uno de los museos de arte más importantes del mundo, ubicado en Madrid.';
    const englishDesc =
      'The Prado Museum is one of the most important art museums in the world, located in Madrid.';

    await page.route('**/api/pois/OSM-node-prado-es/translate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          translated_text: englishDesc,
          source_lang: 'es',
          target_lang: 'en',
          provider: 'google_translate',
          cached: false,
        }),
      });
    });

    await page.route('**/api/pois/OSM-node-prado-es*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'OSM-node-prado-es',
          name: 'Museo del Prado',
          category: 'museum',
          city: 'Madrid',
          lat: 40.4138,
          lng: -3.6922,
          duration_mins: 120,
          cost_eur: 15,
          cost_is_estimated: false,
          scoring: {},
          description: spanishDesc,
          description_lang: 'es',
          photos: [],
        }),
      });
    });

    const component = await mount(
      <PoiDetailView
        poiId="OSM-node-prado-es"
        city="Madrid"
        onClose={() => {}}
      />
    );

    const btn = component.getByTestId('translate-poi-description-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Translate');

    // Verify button is positioned to the right of the OVERVIEW label on the same header row
    const overviewLabel = component.getByText('Overview', { exact: true });
    const labelBox = await overviewLabel.boundingBox();
    const btnBox = await btn.boundingBox();
    expect(labelBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width);

    await btn.click();

    await expect(component.getByTestId('poi-overview-description')).toContainText(englishDesc);
    await expect(btn).toContainText('Show original');

    await btn.click();
    await expect(component.getByTestId('poi-overview-description')).toContainText(spanishDesc);
    await expect(btn).toContainText('Translate');
  });
});
