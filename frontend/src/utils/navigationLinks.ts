export interface StopNavTarget {
  lat: number;
  lon: number;
  name?: string;
}

export interface NavAppLink {
  id: string;
  label: string;
  url: string;
}

export function extractStopCoordinates(stopLike: unknown): StopNavTarget | null {
  if (!stopLike || typeof stopLike !== 'object') return null;
  const s = stopLike as Record<string, unknown>;
  const poi = (s.poi && typeof s.poi === 'object' ? s.poi : s) as Record<string, unknown>;
  const loc = (poi.location && typeof poi.location === 'object' ? poi.location : poi) as Record<string, unknown>;

  const rawLat = loc.latitude ?? loc.lat ?? poi.latitude ?? poi.lat;
  const rawLon = loc.longitude ?? loc.lon ?? loc.lng ?? poi.longitude ?? poi.lon ?? poi.lng;
  const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
  const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return null;
  }

  const name =
    typeof poi.name === 'string'
      ? poi.name
      : typeof poi.title === 'string'
      ? poi.title
      : undefined;

  return { lat, lon, name };
}

export function extractDayStopNavTargets(dayObj: unknown): StopNavTarget[] {
  if (!dayObj || typeof dayObj !== 'object') return [];
  const d = dayObj as Record<string, unknown>;
  const itin = d.itinerary && typeof d.itinerary === 'object' ? (d.itinerary as Record<string, unknown>) : null;
  const rawList = Array.isArray(itin?.path)
    ? itin.path
    : Array.isArray(d.pois)
    ? d.pois
    : Array.isArray(d.activities)
    ? d.activities
    : [];

  const targets: StopNavTarget[] = [];
  for (const item of rawList) {
    const coord = extractStopCoordinates(item);
    if (coord) targets.push(coord);
  }
  return targets;
}

export function buildStopNavLinks(lat: number, lon: number, name?: string): NavAppLink[] {
  const coordStr = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const encodedLabel = encodeURIComponent(name || coordStr);
  return [
    {
      id: 'google',
      label: 'Google Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    },
    {
      id: 'apple',
      label: 'Apple Maps',
      url: `https://maps.apple.com/?ll=${lat},${lon}&q=${encodedLabel}`,
    },
    {
      id: 'comaps',
      label: 'CoMaps / Organic Maps',
      url: `geo:${lat},${lon}?q=${lat},${lon}(${encodedLabel})`,
    },
    {
      id: 'osmand',
      label: 'OsmAnd',
      url: `https://osmand.net/map?pin=${lat},${lon}#16/${lat}/${lon}`,
    },
    {
      id: 'waze',
      label: 'Waze',
      url: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`,
    },
    {
      id: 'citymapper',
      label: 'Citymapper',
      url: `https://citymapper.com/directions?endcoord=${lat}%2C${lon}&endname=${encodedLabel}`,
    },
  ];
}

export function buildDayRouteNavUrl(
  stops: StopNavTarget[],
  mode: 'walking' | 'transit' | 'driving' = 'walking'
): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${stops[0].lat},${stops[0].lon}`;
  }
  const origin = `${stops[0].lat},${stops[0].lon}`;
  const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lon}`;
  const middle = stops.slice(1, -1).slice(0, 9);
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: mode,
  });
  if (middle.length > 0) {
    params.set(
      'waypoints',
      middle.map((s) => `${s.lat},${s.lon}`).join('|')
    );
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
