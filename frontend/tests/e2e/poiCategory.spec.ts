import { test, expect } from '@playwright/test';
import { classifyPoiCategory } from '../../src/utils/poiCategory';

test.describe('POI Category Classification & Metadata', () => {
  test('correctly identifies museum categories', () => {
    const direct = classifyPoiCategory('museum');
    expect(direct.type).toBe('museum');
    expect(direct.label).toBe('MUSEUM');

    const gallery = classifyPoiCategory('art_gallery');
    expect(gallery.type).toBe('museum');

    const fromName = classifyPoiCategory('', 'Musée d\'Orsay');
    expect(fromName.type).toBe('museum');
  });

  test('correctly identifies restaurant categories', () => {
    const direct = classifyPoiCategory('restaurant');
    expect(direct.type).toBe('restaurant');
    expect(direct.label).toBe('RESTAURANT');

    const bistro = classifyPoiCategory('bistro');
    expect(bistro.type).toBe('restaurant');

    const fromName = classifyPoiCategory('', 'Le Gourmet Trattoria');
    expect(fromName.type).toBe('restaurant');
  });

  test('correctly identifies cafe & bakery categories', () => {
    const direct = classifyPoiCategory('cafe');
    expect(direct.type).toBe('cafe');
    expect(direct.label).toBe('CAFÉ');

    const bakery = classifyPoiCategory('cafe_bakery');
    expect(bakery.type).toBe('cafe');

    const fromName = classifyPoiCategory('', 'Café de Flore');
    expect(fromName.type).toBe('cafe');
  });

  test('correctly identifies bus stops and transit stations', () => {
    const busStop = classifyPoiCategory('bus_stop');
    expect(busStop.type).toBe('bus_stop');
    expect(busStop.label).toBe('BUS STOP');

    const transit = classifyPoiCategory('transit');
    expect(transit.type).toBe('transit');
    expect(transit.label).toBe('TRANSIT');

    const metro = classifyPoiCategory('subway_station');
    expect(metro.type).toBe('transit');

    const busFromName = classifyPoiCategory('', 'Main Plaza Bus Stop');
    expect(busFromName.type).toBe('bus_stop');

    const metroFromName = classifyPoiCategory('', 'Central Metro Station');
    expect(metroFromName.type).toBe('transit');
  });

  test('correctly identifies hotels and lodging', () => {
    const direct = classifyPoiCategory('hotel');
    expect(direct.type).toBe('hotel');
    expect(direct.label).toBe('HOTEL');

    const hostel = classifyPoiCategory('hostel');
    expect(hostel.type).toBe('hotel');

    const fromName = classifyPoiCategory('', 'The Ritz Hotel');
    expect(fromName.type).toBe('hotel');
  });

  test('correctly identifies landmarks, monuments, and parks', () => {
    const landmark = classifyPoiCategory('landmark');
    expect(landmark.type).toBe('landmark');

    const monument = classifyPoiCategory('monument');
    expect(monument.type).toBe('landmark');

    const park = classifyPoiCategory('park');
    expect(park.type).toBe('park');
    expect(park.label).toBe('PARK / NATURE');

    const parkFromName = classifyPoiCategory('', 'Retiro Park Gardens');
    expect(parkFromName.type).toBe('park');
  });

  test('correctly identifies flights and airports', () => {
    const flight = classifyPoiCategory('flight');
    expect(flight.type).toBe('flight');

    const airport = classifyPoiCategory('airport');
    expect(airport.type).toBe('airport');
  });

  test('handles unknown or custom categories gracefully', () => {
    const custom = classifyPoiCategory('custom_space_port');
    expect(custom.type).toBe('general');
    expect(custom.label).toBe('CUSTOM SPACE PORT');

    const empty = classifyPoiCategory('', '');
    expect(empty.type).toBe('general');
    expect(empty.label).toBe('WAYPOINT');
  });
});
