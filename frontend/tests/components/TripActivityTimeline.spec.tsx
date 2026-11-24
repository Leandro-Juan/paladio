import { test, expect } from '@playwright/experimental-ct-react';
import { TripActivityTimeline } from '../../src/components/trip-workspace/TripActivityTimeline';
import type { TripRevisionItem } from '../../src/hooks/useTrips';
import esDict from '../../public/locales/es.json';

const mockRevisions: TripRevisionItem[] = [
  {
    id: 'rev-4',
    trip_id: 'trip-tokyo',
    revision: 4,
    actor: 'admin',
    actor_name: 'admin',
    kind: 'route',
    summary: 'Updated transit corridor to Madrid (MAD) -> Tokyo (HND) (10:00 / 18:00)',
    changes: [
      {
        kind: 'route',
        verb: 'updated transit corridor to',
        after_label: 'Madrid (MAD) -> Tokyo (HND) (10:00 / 18:00)',
        field: 'route',
      },
      {
        kind: 'dates',
        verb: 'moved expedition dates to',
        before_label: '2027-10-21T00:00:00.000Z – 2027-10-25T00:00:00.000Z',
        after_label: '2027-10-21T00:00:00.000Z – 2027-10-25T00:00:00.000Z',
        field: 'dates',
      },
      {
        kind: 'photo',
        verb: 'updated cover media for',
        after_label: 'Winter in Tokyo',
        field: 'photo',
      },
    ],
    created_at: '2027-11-07T12:11:00Z',
    can_revert: true,
    is_current: true,
  },
  {
    id: 'rev-3',
    trip_id: 'trip-tokyo',
    revision: 3,
    actor: 'admin',
    actor_name: 'admin',
    kind: 'move',
    summary: 'Reordered stops in Day 1',
    changes: [
      {
        kind: 'move',
        verb: 'reordered stops in',
        after_label: 'Day 1',
        field: 'itinerary',
      },
    ],
    created_at: '2027-11-07T10:45:00Z',
    can_revert: true,
    is_current: false,
  },
  {
    id: 'rev-2',
    trip_id: 'trip-tokyo',
    revision: 2,
    actor: 'system',
    actor_name: 'System',
    kind: 'edit',
    summary: 'Edited the Winter in Tokyo',
    changes: [
      {
        kind: 'edit',
        verb: 'edited the',
        after_label: 'Winter in Tokyo',
        field: 'itinerary_data',
      },
    ],
    created_at: '2027-11-07T10:12:00Z',
    can_revert: true,
    is_current: false,
  },
  {
    id: 'rev-1',
    trip_id: 'trip-tokyo',
    revision: 1,
    actor: 'agent',
    actor_name: 'Paladio Agent',
    kind: 'itinerary',
    summary: 'Added Tokyo Tower in Day 2',
    changes: [
      {
        kind: 'itinerary',
        verb: 'added',
        after_label: 'Tokyo Tower',
        connector: 'in',
        target_label: 'Day 2',
        field: 'itinerary',
      },
    ],
    created_at: '2027-11-07T09:00:00Z',
    can_revert: true,
    is_current: false,
  },
  {
    id: 'rev-0',
    trip_id: 'trip-tokyo',
    revision: 0,
    actor: 'user',
    actor_name: 'Traveler',
    kind: 'created',
    summary: 'Created Winter in Tokyo',
    changes: [
      {
        kind: 'created',
        verb: 'created the',
        after_label: 'Winter in Tokyo',
        field: 'created',
      },
    ],
    created_at: '2027-11-06T15:00:00Z',
    can_revert: false,
    is_current: false,
  },
];

test.describe('TripActivityTimeline Translation', () => {
  test('renders timeline in English by default with formatted dates and verbs', async ({ mount }) => {
    const component = await mount(
      <TripActivityTimeline
        items={mockRevisions}
        currentRevision={4}
        onRevertRevision={() => {}}
        onRestoreVersion={() => {}}
      />
    );

    await expect(component.getByText('Activity')).toBeVisible();
    await expect(component.getByText('REV v4')).toBeVisible();
    await expect(component.getByText('updated transit corridor to')).toBeVisible();
    await expect(component.getByText('reordered stops in')).toBeVisible();
    await expect(component.getByText('Day 1')).toBeVisible();
    await expect(component.getByText('Day 2')).toBeVisible();
    await expect(component.getByText('Paladio Agent')).toBeVisible();
    await expect(component.getByText('System')).toBeVisible();
    await expect(component.getByText('Traveler')).toBeVisible();
    await expect(component.getByText('v4 • CURRENT')).toBeVisible();
    await expect(component.getByRole('button', { name: 'Revert change' }).first()).toBeVisible();
  });

  test('translates verbs, connectors, day numbers, dates, actors and controls when locale is Spanish', async ({
    mount,
    page,
  }) => {
    await page.route('**/locales/es.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(esDict),
      });
    });

    const component = await mount(
      <TripActivityTimeline
        items={mockRevisions}
        currentRevision={4}
        onRevertRevision={() => {}}
        onRestoreVersion={() => {}}
      />
    );

    await page.evaluate(async () => {
      const store = (window as any).__PALADIO_LOCALE_STORE__;
      if (store) {
        await store.getState().setLocale('es');
      }
    });

    // Header & Version Badges
    await expect(component.getByText('Actividad')).toBeVisible();
    await expect(component.getByText('REVISIÓN v4')).toBeVisible();
    await expect(component.getByText('v4 • ACTUAL')).toBeVisible();

    // Verbs translated into Spanish
    await expect(component.getByText('actualizó el corredor de tránsito a')).toBeVisible();
    await expect(component.getByText('trasladó las fechas de la expedición a')).toBeVisible();
    await expect(component.getByText('actualizó la foto de portada de')).toBeVisible();
    await expect(component.getByText('reordenó las paradas en')).toBeVisible();
    await expect(component.getByText('editó')).toBeVisible();
    await expect(component.getByText('añadió')).toBeVisible();
    await expect(component.getByText('creó')).toBeVisible();

    // Actors translated
    await expect(component.getByText('Sistema')).toBeVisible();
    await expect(component.getByText('Agente Paladio')).toBeVisible();
    await expect(component.getByText('Viajero')).toBeVisible();

    // Day numbers translated
    await expect(component.getByText('Día 1')).toBeVisible();
    await expect(component.getByText('Día 2')).toBeVisible();

    // Connector translated
    await expect(component.getByText('en', { exact: true })).toBeVisible();

    // Revert and restore buttons translated
    await expect(component.getByRole('button', { name: 'Revertir cambio' }).first()).toBeVisible();
    await expect(component.getByRole('button', { name: 'Restaurar v3' })).toBeVisible();
  });
});
