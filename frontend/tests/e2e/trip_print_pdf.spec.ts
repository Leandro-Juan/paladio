import { test, expect } from '@playwright/test';
import { getCorsHeaders, mockAuthenticatedUser } from './test-utils';

test.describe('Trip Print Dossier & PDF Export', () => {
  test('renders multi-page PDF without clipping to 1 page in print media', async ({ page }) => {
    await mockAuthenticatedUser(page);

    const tripId = 'eef20580-2275-4198-87ba-a5240002b36c';
    const dayThemes = [
      'Arrival & Old Quarter',
      'Prado & Retiro Axis',
      'Royal Palace & Austrias',
      'Chamberí & Sorolla',
      'Toledo Day Excursion',
      'Final Markets & Departure',
    ];

    const days = dayThemes.map((theme, dayIdx) => ({
      day: dayIdx + 1,
      theme,
      itinerary: {
        path: [
          {
            poi: {
              id: `poi-d${dayIdx + 1}-1`,
              name: `Morning Landmark Day ${dayIdx + 1}`,
              category: 'attraction',
              duration_mins: 90,
              cost_eur: 18,
              address: `Calle Mayor ${dayIdx + 10}, Madrid`,
              description: `Curated architectural exploration and morning coffee stop for day ${dayIdx + 1}.`,
              location: { latitude: 40.4168 + dayIdx * 0.005, longitude: -3.7038 },
            },
            scheduled_start: '09:30',
            scheduled_end: '11:00',
            arrival_time_mins: 570,
            departure_time_mins: 660,
          },
          {
            poi: {
              id: `poi-d${dayIdx + 1}-2`,
              name: `Evening Dining Day ${dayIdx + 1}`,
              category: 'restaurant',
              duration_mins: 90,
              cost_eur: 42,
              address: `Plaza Santa Ana ${dayIdx + 2}, Madrid`,
              description: `Seasonal tasting menu and neighborhood walk for day ${dayIdx + 1}.`,
              location: { latitude: 40.4148 + dayIdx * 0.005, longitude: -3.7008 },
            },
            scheduled_start: '19:30',
            scheduled_end: '21:00',
            arrival_time_mins: 1170,
            departure_time_mins: 1260,
            transit_from_previous: {
              mode: 'walk',
              duration_mins: 14,
              steps: [{ instruction: 'Walk south along Paseo del Prado' }],
            },
          },
        ],
      },
    }));

    const mockTrip = {
      id: tripId,
      destination: 'Madrid',
      origin_iata: 'BCN',
      destination_iata: 'MAD',
      destination_timezone: 'Europe/Madrid',
      start_date: '2027-11-29',
      end_date: '2027-12-04',
      budget_eur: 1800,
      participants: [
        { id: 'p-1', trip_id: tripId, name: 'admin', email: 'admin@paladio.internal', role: 'organizer', created_at: '2027-01-01T00:00:00Z' },
        { id: 'p-2', trip_id: tripId, name: 'traveler_two', email: 'two@paladio.internal', role: 'traveler', created_at: '2027-01-01T00:00:00Z' },
      ],
      itinerary_data: {
        title: 'Trip to Madrid',
        destination: 'Madrid',
        currency: 'EUR',
        budget: 1800,
        travel_constraints: {
          budget_usd: 1800,
          currency: 'EUR',
        },
        description:
          'Comprehensive travel dossier and operational schedule for Madrid across six days including transit corridors and museum tickets.',
        days,
      },
    };

    const mockExpenses = [
      {
        id: 'exp-1',
        trip_id: tripId,
        payer_id: 'p-1',
        payer_name: 'admin',
        description: 'Boutique Hotel Gran Via',
        amount: 640,
        currency: 'EUR',
        category: 'lodging',
        split_type: 'equal',
        splits: [],
        expense_date: '2027-11-29',
        created_at: '2027-11-29T10:00:00Z',
      },
      {
        id: 'exp-2',
        trip_id: tripId,
        payer_id: 'p-2',
        payer_name: 'traveler_two',
        description: 'AVE High-Speed Rail Tickets',
        amount: 145,
        currency: 'EUR',
        category: 'transport',
        split_type: 'equal',
        splits: [],
        expense_date: '2027-11-29',
        created_at: '2027-11-29T11:00:00Z',
      },
    ];

    const mockSettlement = {
      trip_id: tripId,
      total_expenses: 785,
      currency: 'EUR',
      balances: [],
      transfers: [
        {
          sender_id: 'p-2',
          sender_name: 'traveler_two',
          receiver_id: 'p-1',
          receiver_name: 'admin',
          amount: 247.5,
        },
      ],
    };

    const mockTickets = [
      {
        id: 'tkt-1',
        trip_id: tripId,
        ticket_type: 'flight',
        title: 'Iberia Express IB3120',
        provider: 'Iberia',
        booking_reference: 'MAD789X',
        holder_name: 'admin',
        start_time: '2027-11-29T08:15:00Z',
        end_time: '2027-11-29T09:30:00Z',
        seat_or_room: '14A',
        location_or_venue: 'Madrid Barajas T4',
        status: 'confirmed',
        barcode_value: 'PLD-FLIGHT-MAD789X',
        barcode_format: 'qr',
        metadata: {
          departure_iata: 'BCN',
          arrival_iata: 'MAD',
          flight_number: 'IB3120',
        },
        source: 'manual',
        user_modified: false,
        visibility: 'trip',
        pinned: true,
        drift: false,
        created_at: '2027-11-01T00:00:00Z',
        updated_at: '2027-11-01T00:00:00Z',
      },
      {
        id: 'tkt-2',
        trip_id: tripId,
        ticket_type: 'hotel',
        title: 'Hotel Gran Via Stay',
        provider: 'Paladio Stays',
        booking_reference: 'HTL5541',
        holder_name: 'admin',
        start_time: '2027-11-29T15:00:00Z',
        end_time: '2027-12-04T11:00:00Z',
        seat_or_room: 'Suite 402',
        location_or_venue: 'Gran Via 32, Madrid',
        status: 'confirmed',
        barcode_value: 'PLD-HOTEL-HTL5541',
        barcode_format: 'qr',
        metadata: {},
        source: 'manual',
        user_modified: false,
        visibility: 'trip',
        pinned: false,
        drift: false,
        created_at: '2027-11-01T00:00:00Z',
        updated_at: '2027-11-01T00:00:00Z',
      },
    ];

    await page.route(new RegExp(`.*/api(/v1)?/trips/${tripId}(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTrip),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${tripId}/expenses.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockExpenses),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${tripId}/settlement.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockSettlement),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${tripId}/tickets.*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify(mockTickets),
      });
    });

    await page.route(new RegExp(`.*/api(/v1)?/trips/${tripId}/(photos|collections|revisions).*`), async (route) => {
      await route.fulfill({
        status: 200,
        headers: getCorsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/trips/${tripId}`);
    await expect(page.locator('.trip-workspace-screen')).toBeVisible({ timeout: 15000 });

    const dossier = page.locator('#trip-print-dossier');
    await expect(dossier).toContainText('Boutique Hotel Gran Via');
    await expect(dossier).toContainText('MAD789X');
    await expect(dossier).toContainText('Hotel Gran Via Stay');

    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.trip-workspace-screen')).toHaveCSS('display', 'none');
    await expect(dossier).toHaveCSS('display', 'block');

    const layoutMetrics = await page.evaluate(() => {
      const main = document.querySelector('main.trip-details-layout') as HTMLElement | null;
      const dossierEl = document.getElementById('trip-print-dossier') as HTMLElement | null;
      const mainStyle = main ? window.getComputedStyle(main) : null;
      const tableWrapperOverflows = dossierEl
        ? Array.from(dossierEl.querySelectorAll('table')).map((tbl) => {
            const parent = tbl.parentElement;
            return parent ? window.getComputedStyle(parent).overflow : null;
          })
        : [];
      const dayContainerOverflows = dossierEl
        ? Array.from(dossierEl.querySelectorAll('.print-keep-with-next'))
            .filter((el) => el.textContent?.includes('DAY'))
            .map((el) => {
              const card = el.parentElement;
              return card ? window.getComputedStyle(card).overflow : null;
            })
        : [];

      return {
        mainOverflow: mainStyle?.overflow,
        mainScrollHeight: main?.scrollHeight ?? 0,
        viewportHeight: window.innerHeight,
        tableWrapperOverflows,
        dayContainerOverflows,
      };
    });

    expect(layoutMetrics.mainOverflow).toBe('visible');
    expect(layoutMetrics.mainScrollHeight).toBeGreaterThan(1200);
    expect(layoutMetrics.tableWrapperOverflows.length).toBeGreaterThan(0);
    for (const ov of layoutMetrics.tableWrapperOverflows) {
      expect(ov).not.toBe('hidden');
    }
    expect(layoutMetrics.dayContainerOverflows.length).toBe(6);
    for (const ov of layoutMetrics.dayContainerOverflows) {
      expect(ov).not.toBe('hidden');
    }

    await expect(dossier).toContainText('Trip to Madrid');
    await expect(dossier).toContainText('Boutique Hotel Gran Via');
    await expect(dossier).toContainText('Morning Landmark Day 1');
    await expect(dossier).toContainText('Evening Dining Day 6');
    await expect(dossier).toContainText('MAD789X');
    await expect(dossier).toContainText('Hotel Gran Via Stay');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    const pdfText = pdfBuffer.toString('latin1');
    const pageMatches = pdfText.match(/\/Type\s*\/Page\b(?!s)/g) ?? [];
    expect(pageMatches.length).toBeGreaterThanOrEqual(4);
  });
});
