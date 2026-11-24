import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { DemoSnapshotRaw } from '../demoSnapshotLoader';
import type { DemoSessionState } from '../demoStore';
import {
  blockedRes,
  buildQuickLeg,
  errRes,
  haversineKm,
  jsonRes,
} from './helpers';

function findCityKey(obj: Record<string, unknown>, rawCity: string): string | null {
  const target = rawCity.trim().toLowerCase();
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === target) return key;
  }
  for (const key of Object.keys(obj)) {
    if (target.includes(key.toLowerCase()) || key.toLowerCase().includes(target)) return key;
  }
  return null;
}

function getAllCityPois(city: string, session: DemoSessionState, baseline: DemoSnapshotRaw): Array<Record<string, unknown>> {
  const key = findCityKey(baseline.pois_by_city, city);
  const baseList = key ? baseline.pois_by_city[key] || [] : [];
  const custom = session.customPois.filter((p) => String(p.city || '').toLowerCase() === city.toLowerCase());
  return [...custom, ...baseList];
}

function getCityGtfs(city: string, baseline: DemoSnapshotRaw): Record<string, unknown> | null {
  const key = findCityKey(baseline.gtfs_by_city, city);
  return key ? baseline.gtfs_by_city[key] : null;
}

export async function handlePoisRoutes(
  req: NextRequest,
  method: string,
  segments: string[],
  session: DemoSessionState,
  baseline: DemoSnapshotRaw
): Promise<NextResponse | null> {
  const url = req.nextUrl;

  if (segments[0] === 'city' && segments[2] === 'status' && method === 'GET') {
    const city = decodeURIComponent(segments[1]);
    const list = getAllCityPois(city, session, baseline);
    return jsonRes({ city, poi_count: list.length, is_hydrating: false });
  }

  if (segments[0] === 'city' && segments[2] === 'download' && method === 'POST') {
    return blockedRes('Downloading city POI databases');
  }

  if (segments[0] === 'check-duplicate' && method === 'GET') {
    return jsonRes({ has_duplicates: false, candidates: [] });
  }

  if (segments[0] === 'photos' && segments[1] && method === 'GET') {
    const photoId = decodeURIComponent(segments[1]);
    const blob = session.mediaBlobs[photoId] || baseline.media_blobs?.[photoId];
    if (!blob) return errRes('POI photo not found', 404);
    const bytes = Buffer.from(blob.b64, 'base64');
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': blob.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  if (segments[0] === 'batch-photos' && method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { pois?: Array<{ id?: string; name: string; city?: string }> };
    const reqPois = Array.isArray(body.pois) ? body.pois : [];
    const photos: Record<string, { url: string; thumbnail_url: string; caption?: string } | null> = {};
    const recMap = baseline.dashboard_recommended_pois || {};

    for (const item of reqPois) {
      const cacheKey = item.id || item.name;
      if (!cacheKey) continue;

      const recKey = item.city ? findCityKey(recMap, item.city) : null;
      const recPool = recKey ? recMap[recKey] || [] : Object.values(recMap).flat();
      const foundRec = recPool.find(
        (p) => (item.id && String(p.id) === item.id) || String(p.name || '').toLowerCase() === String(item.name || '').toLowerCase()
      );
      if (foundRec && (foundRec.photo_url || foundRec.thumbnail_url)) {
        const u = String(foundRec.photo_url || foundRec.thumbnail_url);
        photos[cacheKey] = { url: u, thumbnail_url: u, caption: String(foundRec.name || item.name) };
        continue;
      }

      const cityPois = item.city ? getAllCityPois(item.city, session, baseline) : Object.values(baseline.pois_by_city).flat();
      const found = cityPois.find(
        (p) => (item.id && String(p.id) === item.id) || String(p.name || '').toLowerCase() === String(item.name || '').toLowerCase()
      );
      if (found && (found.photo_url || found.thumbnail_url)) {
        const u = String(found.photo_url || found.thumbnail_url);
        photos[cacheKey] = { url: u, thumbnail_url: u, caption: String(found.name || item.name) };
        continue;
      }
      // Match trip cover photo ONLY when explicitly requesting a city cover (never for individual POIs)
      const isCityCoverQuery = !item.id || String(item.id).startsWith('city-');
      if (isCityCoverQuery) {
        const matchingTrip = session.trips.find((t) =>
          String(t.destination || '').toLowerCase() === String(item.name || '').toLowerCase()
        );
        const itin = (matchingTrip?.itinerary_data || {}) as Record<string, unknown>;
        const tPhotos = Array.isArray(itin.photos) ? (itin.photos as Array<Record<string, unknown>>) : [];
        if (tPhotos.length > 0 && tPhotos[0].url) {
          const u = String(tPhotos[0].url);
          photos[cacheKey] = { url: u, thumbnail_url: u, caption: String(item.name) };
          continue;
        }
      }
      photos[cacheKey] = null;
    }
    return jsonRes({ photos });
  }

  if (segments[0] === 'search' && method === 'GET') {
    const city = url.searchParams.get('city') || '';
    const query = (url.searchParams.get('query') || '').trim().toLowerCase();
    const category = (url.searchParams.get('category') || '').trim().toLowerCase();
    const customOnly = url.searchParams.get('custom_only') === 'true';
    const circleLat = url.searchParams.get('circle_lat') ? Number(url.searchParams.get('circle_lat')) : null;
    const circleLng = url.searchParams.get('circle_lng') ? Number(url.searchParams.get('circle_lng')) : null;
    const circleRadiusM = url.searchParams.get('circle_radius') ? Number(url.searchParams.get('circle_radius')) : null;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));

    // Dashboard RecommendedPoisSection query: return ONLY curated hardcoded recommendations with local photos
    const isDashboardRecommendationQuery =
      !url.searchParams.has('query') &&
      !url.searchParams.has('category') &&
      !url.searchParams.has('offset') &&
      !customOnly &&
      url.searchParams.has('trip_id') &&
      circleLat === null;
    if (isDashboardRecommendationQuery && baseline.dashboard_recommended_pois) {
      const recKey = findCityKey(baseline.dashboard_recommended_pois, city);
      if (recKey) {
        const curated = (baseline.dashboard_recommended_pois[recKey] || []).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          duration_mins: p.duration_mins ?? 60,
          cost_eur: p.cost_eur ?? 0,
          similarity: p.similarity ?? 0.95,
          taste_match: p.taste_match ?? p.similarity ?? 0.95,
          match_type: 'curated_demo',
          description: p.description || null,
          neighborhood: p.neighborhood || null,
          facets: p.facets || {},
          doc_quality: p.doc_quality || 'A',
          hours_known: Boolean(p.hours_known),
          rating: (p.scoring as Record<string, unknown>)?.rating ?? 4.8,
          iconicity_score: 0.95,
          scoring: p.scoring || { rating: 4.8, reviews: 12000 },
          photo_url: p.photo_url || null,
          thumbnail_url: p.thumbnail_url || p.photo_url || null,
        }));
        return jsonRes({
          city,
          query: '',
          search_type: 'curated_demo',
          exact_match_found: false,
          exact_match: null,
          results: curated,
          total: curated.length,
          city_total_pois: getAllCityPois(city, session, baseline).length,
          is_hydrating: false,
        });
      }
    }

    let pool = customOnly
      ? session.customPois.filter((p) => !city || String(p.city || '').toLowerCase() === city.toLowerCase())
      : getAllCityPois(city, session, baseline);

    if (category && category !== 'all') {
      pool = pool.filter((p) => String(p.category || '').toLowerCase() === category || String(p.taxonomy_category || '').toLowerCase() === category);
    }
    if (query) {
      pool = pool.filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        const neigh = String(p.neighborhood || '').toLowerCase();
        const desc = String(p.description || '').toLowerCase();
        return name.includes(query) || cat.includes(query) || neigh.includes(query) || desc.includes(query);
      });
    }
    if (circleLat !== null && circleLng !== null && circleRadiusM !== null) {
      pool = pool.filter((p) => haversineKm(circleLat, circleLng, Number(p.lat), Number(p.lng)) * 1000 <= circleRadiusM);
    }

    const total = pool.length;
    const slice = pool.slice(offset, offset + limit).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      duration_mins: p.duration_mins ?? 60,
      cost_eur: p.cost_eur ?? 0,
      similarity: p.similarity ?? 0.88,
      match_type: query ? 'fuzzy_match' : 'semantic_rag',
      description: p.description || null,
      neighborhood: p.neighborhood || null,
      facets: p.facets || {},
      doc_quality: p.doc_quality || 'B',
      hours_known: Boolean(p.hours_known),
      rating: (p.scoring as Record<string, unknown>)?.rating ?? 4.6,
      iconicity_score: p.iconicity_score ?? 0.7,
      scoring: p.scoring || { rating: 4.6, reviews: 520 },
      photo_url: p.photo_url || null,
      thumbnail_url: p.thumbnail_url || p.photo_url || null,
    }));

    return jsonRes({
      city,
      query,
      search_type: query ? 'fuzzy_match' : 'semantic_rag',
      exact_match_found: Boolean(query && slice.some((s) => String(s.name).toLowerCase() === query)),
      exact_match: query ? slice.find((s) => String(s.name).toLowerCase() === query) || null : null,
      results: slice,
      total,
      city_total_pois: getAllCityPois(city, session, baseline).length,
      is_hydrating: false,
    });
  }

  // Create custom POI (allowed in sandbox)
  if (segments.length === 0 && method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const newPoi: Record<string, unknown> = {
      id: `custom-poi-${crypto.randomBytes(4).toString('hex')}`,
      name: String(body.name || 'Custom Place'),
      city: String(body.city || 'Destination'),
      category: String(body.category || 'attraction'),
      lat: Number(body.lat || 0),
      lng: Number(body.lng || 0),
      duration_mins: Number(body.duration_mins || 60),
      cost_eur: Number(body.cost_eur || 0),
      cost_is_estimated: false,
      description: body.description || null,
      website: body.website || null,
      phone: body.phone || null,
      address: body.address || null,
      neighborhood: body.neighborhood || null,
      wheelchair_accessible: body.wheelchair_accessible ?? null,
      reservation_required: body.reservation_required ?? null,
      scoring: { rating: body.rating ?? 4.7, reviews: 1 },
      photos: Array.isArray(body.photos) ? body.photos : [],
      photo_url: Array.isArray(body.photos) && body.photos[0] ? (body.photos[0] as Record<string, unknown>).url : null,
      doc_quality: 'A',
      hours_known: Boolean(body.opening_time || body.weekly_hours),
      daily_windows: [],
    };
    session.customPois.unshift(newPoi);
    return jsonRes(newPoi, 201);
  }

  // /api/pois/{poiId}
  if (segments.length >= 1) {
    const poiId = decodeURIComponent(segments[0]);
    if (segments[1] === 'translate' && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return jsonRes({ translated_text: String(body.text || ''), target_lang: body.target_lang || 'en' });
    }

    if (method === 'DELETE') {
      const idx = session.customPois.findIndex((p) => String(p.id) === poiId);
      if (idx >= 0) {
        session.customPois.splice(idx, 1);
        return jsonRes({ status: 'success' });
      }
      return blockedRes('Deleting core city POIs');
    }

    const qCity = url.searchParams.get('city') || '';
    const qName = url.searchParams.get('name') || '';

    // Handle GTFS station inspection (gtfs:city:stationId)
    if (poiId.startsWith('gtfs:')) {
      const parts = poiId.split(':');
      const gCity = parts[1] || qCity;
      const gStId = parts.slice(2).join(':');
      const gtfs = getCityGtfs(gCity, baseline);
      const stList = (gtfs?.stations as Array<Record<string, unknown>>) || [];
      const station = stList.find((s) => String(s.id) === gStId || String(s.name).toLowerCase() === qName.toLowerCase());
      if (station) {
        const lines = (station.lines as Array<Record<string, unknown>>) || [];
        const lineColors: Record<string, { color: string; text_color?: string | null }> = {};
        for (const l of lines) {
          lineColors[String(l.short_name || l.line_id)] = {
            color: String(l.color || '#0F4C5C'),
            text_color: String(l.text_color || '#FFFFFF'),
          };
        }
        return jsonRes({
          id: poiId,
          name: station.name,
          category: 'transit',
          city: gCity,
          lat: station.lat,
          lng: station.lon,
          duration_mins: 10,
          cost_eur: 1.9,
          cost_is_estimated: false,
          scoring: { rating: 4.5, reviews: 420 },
          description: `${String(station.name)} transit station serving ${lines.map((l) => l.short_name).join(', ') || 'urban lines'}.`,
          doc_quality: 'A',
          hours_known: true,
          daily_windows: [],
          photos: [],
          transit_info: {
            type: lines[0]?.mode || 'Metro',
            lines: lines.map((l) => String(l.short_name || l.line_id)),
            line_colors: lineColors,
            wheelchair: station.wheelchair_boarding === 1 ? 'Accessible' : 'Partial',
            frequency: 'Every 3–6 mins',
          },
        });
      }
    }

    const pool = qCity
      ? getAllCityPois(qCity, session, baseline)
      : [...session.customPois, ...Object.values(baseline.pois_by_city).flat()];
    const found =
      pool.find((p) => String(p.id) === poiId) ||
      (qName ? pool.find((p) => String(p.name || '').toLowerCase() === qName.toLowerCase()) : undefined);

    if (!found) {
      return jsonRes({
        id: poiId,
        name: qName || 'Point of Interest',
        category: 'attraction',
        city: qCity || 'Destination',
        lat: 0,
        lng: 0,
        duration_mins: 60,
        cost_eur: 0,
        cost_is_estimated: true,
        scoring: { rating: 4.5, reviews: 120 },
        description: null,
        doc_quality: 'C',
        hours_known: false,
        daily_windows: [],
        photos: [],
      });
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      Object.assign(found, body);
    }

    const photos = Array.isArray(found.photos) && (found.photos as unknown[]).length > 0
      ? found.photos
      : found.photo_url
      ? [{ url: found.photo_url, thumbnail_url: found.thumbnail_url || found.photo_url, caption: found.name }]
      : [];

    return jsonRes({
      id: found.id,
      name: found.name,
      category: found.category,
      city: found.city,
      lat: found.lat,
      lng: found.lng,
      duration_mins: found.duration_mins ?? 60,
      cost_eur: found.cost_eur ?? 0,
      cost_is_estimated: Boolean(found.cost_is_estimated ?? true),
      cost_source: found.cost_source || null,
      scoring: found.scoring || { rating: 4.6, reviews: 640 },
      description: found.description || `${String(found.name)} is a notable ${String(found.category)} in ${String(found.city)}.`,
      description_lang: 'en',
      description_source: found.description_source || 'curated',
      wikipedia_title: found.wikipedia_title || null,
      wikidata_id: found.wikidata_id || null,
      website: found.website || null,
      phone: found.phone || null,
      address: found.address || found.neighborhood || null,
      neighborhood: found.neighborhood || null,
      doc_quality: found.doc_quality || 'B',
      hours_known: Boolean(found.hours_known),
      osm_opening_hours: found.osm_opening_hours || null,
      daily_windows: found.daily_windows || [],
      photos,
    });
  }

  return null;
}

export async function handleTransitRoutes(
  req: NextRequest,
  method: string,
  segments: string[],
  session: DemoSessionState,
  baseline: DemoSnapshotRaw
): Promise<NextResponse | null> {
  const url = req.nextUrl;

  // Handle POST /api/transit/directions or POST /api/trips/{id}/transit/directions
  const computeDirections = async (fallbackCity?: string) => {
    const body = (await req.json().catch(() => ({}))) as {
      origin?: { name?: string; lat: number; lon: number };
      destination?: { name?: string; lat: number; lon: number };
      city?: string;
    };
    const orig = body.origin || { name: 'Origin', lat: 0, lon: 0 };
    const dest = body.destination || { name: 'Destination', lat: 0, lon: 0 };
    const city = body.city || fallbackCity || '';
    const gtfs = getCityGtfs(city, baseline);
    const stations = ((gtfs?.stations as Array<Record<string, unknown>>) || []);
    const distKm = haversineKm(orig.lat, orig.lon, dest.lat, dest.lon);
    const primaryLeg = buildQuickLeg(
      { lat: orig.lat, lng: orig.lon, name: orig.name },
      { lat: dest.lat, lng: dest.lon, name: dest.name },
      dest.name || 'Destination',
      stations,
      distKm
    );
    const walkMins = Math.max(4, Math.round(distKm / 0.075));
    const walkLeg = {
      duration_mins: walkMins,
      cost_eur: 0,
      cost_is_estimated: false,
      price_source: 'pedestrian',
      mode: 'pedestrian',
      steps: [
        {
          type: 'walk',
          instruction: `Walk directly to ${dest.name || 'Destination'}`,
          duration_mins: walkMins,
          distance_km: Math.round(distKm * 100) / 100,
          geometry: [[orig.lat, orig.lon], [dest.lat, dest.lon]],
          intermediate_stops: [],
          intermediate_stop_details: [],
        },
      ],
      geometry: [[orig.lat, orig.lon], [dest.lat, dest.lon]],
    };
    return jsonRes({
      primary_mode: primaryLeg.mode === 'transit' ? 'transit' : 'pedestrian',
      primary_leg: primaryLeg,
      alternative_leg: primaryLeg.mode === 'transit' ? walkLeg : null,
      recommendation_reason:
        primaryLeg.mode === 'transit'
          ? 'Fastest multimodal transit corridor with short station walks.'
          : 'Short pedestrian distance — faster on foot than waiting for transit.',
    });
  };

  // Routes starting with /api/transit/...
  if (segments[0] === 'directions' && method === 'POST') {
    return computeDirections();
  }

  const city = decodeURIComponent(segments[0] || '').toLowerCase();
  const gtfs = getCityGtfs(city, baseline);
  if (!gtfs) return errRes('Transit data unavailable for city', 404);
  const stations = (gtfs.stations as Array<Record<string, unknown>>) || [];
  const lines = (gtfs.lines as Array<Record<string, unknown>>) || [];
  const patternsByLine = (gtfs.patterns_by_line as Record<string, Array<Record<string, unknown>>>) || {};

  if (segments[1] === 'map-stations' && method === 'GET') {
    const bbox = (url.searchParams.get('bbox') || '').split(',').map(Number);
    const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') || 150)));
    if (bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
      const [minLat, minLon, maxLat, maxLon] = bbox;
      const filtered = stations.filter(
        (s) => Number(s.lat) >= minLat && Number(s.lat) <= maxLat && Number(s.lon) >= minLon && Number(s.lon) <= maxLon
      );
      return jsonRes(filtered.slice(0, limit));
    }
    return jsonRes(stations.slice(0, limit));
  }

  if (segments[1] === 'lines' && segments[2] && method === 'GET') {
    const lineId = decodeURIComponent(segments[2]);
    const clean = lineId.replace(/^line\s+/i, '').trim().toLowerCase();
    const line = lines.find(
      (l) =>
        String(l.id).toLowerCase() === clean ||
        String(l.short_name || '').toLowerCase() === clean ||
        String(l.long_name || '').toLowerCase().includes(clean)
    );
    if (!line) return errRes('Line not found', 404);
    return jsonRes({
      ...line,
      patterns: patternsByLine[String(line.id)] || [],
    });
  }

  if (segments[1] === 'stations' && segments[2]) {
    const stId = decodeURIComponent(segments[2]);
    const station = stations.find((s) => String(s.id) === stId || String(s.name).toLowerCase() === stId.toLowerCase());
    if (!station) return errRes('Station not found', 404);

    if (segments[3] === 'departures' && method === 'GET') {
      const targetSec = Math.max(0, Number(url.searchParams.get('seconds') || 32400));
      const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') || 8)));
      const stLines = (station.lines as Array<Record<string, unknown>>) || [];
      const out: Array<Record<string, unknown>> = [];
      for (let i = 0; i < limit; i++) {
        const line = stLines[i % Math.max(1, stLines.length)] || {
          line_id: 'M1',
          short_name: 'M1',
          mode: 'Metro',
          color: '#0F4C5C',
          text_color: '#FFFFFF',
        };
        out.push({
          line_id: line.line_id,
          line_short_name: line.short_name || line.line_id,
          mode: line.mode || 'Metro',
          color: line.color || '#0F4C5C',
          text_color: line.text_color || '#FFFFFF',
          headsign: i % 2 === 0 ? 'City Center' : 'Terminus',
          departure_seconds: targetSec + 180 + i * 300,
        });
      }
      return jsonRes(out);
    }

    const stLines = (station.lines as Array<Record<string, unknown>>) || [];
    return jsonRes({
      id: station.id,
      name: station.name,
      original_name: station.original_name || station.name,
      lat: station.lat,
      lon: station.lon,
      wheelchair_boarding: station.wheelchair_boarding ?? 1,
      stop_count: station.stop_count ?? stLines.length,
      serving_lines: stLines.map((l, idx) => ({
        line_id: l.line_id,
        direction_id: idx % 2,
        headsign: 'Central Loop',
        short_name: l.short_name,
        long_name: l.short_name,
        mode: l.mode,
        color: l.color,
        text_color: l.text_color,
      })),
      service_summary: [],
      transfers: null,
      photos: [],
    });
  }

  return null;
}

export async function handleTripScopedTransit(
  req: NextRequest,
  method: string,
  tripId: string,
  sub: string[], // starts after /api/trips/{tripId}/transit
  session: DemoSessionState,
  baseline: DemoSnapshotRaw
): Promise<NextResponse | null> {
  const trip = session.trips.find((t) => String(t.id) === tripId);
  if (!trip) return errRes('Trip not found', 404);
  const city = String(trip.destination || '').trim().toLowerCase();
  const gtfs = getCityGtfs(city, baseline);
  const url = req.nextUrl;

  if (sub[0] === 'availability' && method === 'GET') {
    return jsonRes({
      city,
      status: gtfs ? 'READY' : 'UNAVAILABLE',
      gtfs_status: gtfs ? 'READY' : 'UNAVAILABLE',
      derived_status: gtfs ? 'READY' : 'UNAVAILABLE',
      reason: gtfs ? null : 'Unavailable',
      capabilities: { covered_date_range: { start: '2026-01-01', end: '2028-12-31' } },
      agencies: gtfs?.agencies || [],
      feed_valid_from: '2026-01-01',
      feed_valid_to: '2028-12-31',
    });
  }

  if (!gtfs) return errRes('Transit not found for city', 404);
  const stations = (gtfs.stations as Array<Record<string, unknown>>) || [];
  const lines = (gtfs.lines as Array<Record<string, unknown>>) || [];

  if (sub[0] === 'nearby' && method === 'GET') {
    const day = Number(url.searchParams.get('day') || 0);
    const radius = Number(url.searchParams.get('radius') || 800);
    const centerLat = url.searchParams.get('center_lat') ? Number(url.searchParams.get('center_lat')) : null;
    const centerLng = url.searchParams.get('center_lng') ? Number(url.searchParams.get('center_lng')) : null;
    const modesParam = url.searchParams.get('modes');
    const modeFilter = modesParam ? new Set(modesParam.split(',').map((m) => m.trim().toLowerCase())) : null;

    const anchors: Array<{ id: string; name: string; type: string; lat: number; lon: number }> = [];
    if (centerLat !== null && centerLng !== null) {
      anchors.push({ id: 'waypoint', name: 'Waypoint Area', type: 'waypoint', lat: centerLat, lon: centerLng });
    } else {
      const itin = (trip.itinerary_data || {}) as Record<string, unknown>;
      const hotel = (itin.hotel || {}) as Record<string, unknown>;
      if (hotel.lat !== undefined && hotel.lng !== undefined) {
        anchors.push({ id: 'lodging', name: String(hotel.name || 'Hotel'), type: 'lodging', lat: Number(hotel.lat), lon: Number(hotel.lng) });
      }
      const days = Array.isArray(itin.days) ? (itin.days as Array<Record<string, unknown>>) : [];
      const targetDay = days[day];
      const path = ((targetDay?.itinerary as Record<string, unknown>)?.path as Array<Record<string, unknown>>) || [];
      for (const item of path) {
        const poi = (item.poi || {}) as Record<string, unknown>;
        const loc = (poi.location || {}) as Record<string, unknown>;
        const lat = Number(loc.latitude ?? loc.lat ?? poi.lat ?? 0);
        const lon = Number(loc.longitude ?? loc.lng ?? poi.lon ?? 0);
        if (lat && lon && !String(poi.id || '').startsWith('hotel')) {
          anchors.push({ id: String(poi.id || anchors.length), name: String(poi.name || 'Stop'), type: 'stop', lat, lon });
        }
      }
    }

    const grouped_stations = anchors
      .map((anchor) => {
        const nearby = stations
          .filter((s) => {
            if (modeFilter) {
              const sModes = ((s.lines as Array<Record<string, unknown>>) || []).map((l) => String(l.mode || '').toLowerCase());
              if (!sModes.some((m) => modeFilter.has(m))) return false;
            }
            return haversineKm(anchor.lat, anchor.lon, Number(s.lat), Number(s.lon)) * 1000 <= radius;
          })
          .map((s) => {
            const distM = Math.round(haversineKm(anchor.lat, anchor.lon, Number(s.lat), Number(s.lon)) * 1000);
            return { ...s, distance_meters: distM, walk_mins: Math.max(1, Math.round(distM / 80)) };
          })
          .sort((a, b) => a.distance_meters - b.distance_meters)
          .slice(0, 6);
        return {
          anchor_id: anchor.id,
          anchor_name: anchor.name,
          anchor_type: anchor.type,
          stations: nearby,
        };
      })
      .filter((g) => g.stations.length > 0);

    return jsonRes({ city, day, grouped_stations });
  }

  if (sub[0] === 'lines' && sub.length === 1 && method === 'GET') {
    const centerLat = url.searchParams.get('center_lat') ? Number(url.searchParams.get('center_lat')) : null;
    const centerLng = url.searchParams.get('center_lng') ? Number(url.searchParams.get('center_lng')) : null;
    const radius = Number(url.searchParams.get('radius') || 800);
    let filteredLines = lines;
    if (centerLat !== null && centerLng !== null) {
      const activeIds = new Set<string>();
      for (const s of stations) {
        if (haversineKm(centerLat, centerLng, Number(s.lat), Number(s.lon)) * 1000 <= radius) {
          for (const chip of (s.lines as Array<Record<string, unknown>>) || []) {
            activeIds.add(String(chip.line_id).toLowerCase());
          }
        }
      }
      filteredLines = lines.filter((l) => activeIds.has(String(l.id).toLowerCase()));
    }
    return jsonRes({ city, lines: filteredLines });
  }

  if (sub[0] === 'directions' && method === 'POST') {
    return handleTransitRoutes(req, method, ['directions'], session, baseline);
  }

  // Forward /lines/{id}, /stations/{id}, /stations/{id}/departures to city handler
  return handleTransitRoutes(req, method, [city, ...sub], session, baseline);
}
