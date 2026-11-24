import 'server-only';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {
  addDaysIso,
  addHoursIso,
  DemoSnapshotRaw,
  getDemoSnapshotBaseline,
} from './demoSnapshotLoader';

export interface DemoSessionState {
  sid: string;
  createdAt: number;
  nextResetAt: number;
  user: Record<string, unknown>;
  trips: Array<Record<string, unknown>>;
  revisionsByTrip: Record<string, Array<Record<string, unknown>>>;
  ticketsByTrip: Record<string, Array<Record<string, unknown>>>;
  participantsByTrip: Record<string, Array<Record<string, unknown>>>;
  expensesByTrip: Record<string, Array<Record<string, unknown>>>;
  collectionsByTrip: Record<string, Array<Record<string, unknown>>>;
  savedCollections: Array<Record<string, unknown>>;
  customPois: Array<Record<string, unknown>>;
  mediaBlobs: Record<string, { mime_type: string; b64: string }>;
  deletedMediaIds: Set<string>;
  discardedDeals: Set<string>;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const SESSION_REDIS_PREFIX = 'paladio:demo:v1:';

// Persist across hot reloads in dev mode via globalThis
const globalStore = globalThis as typeof globalThis & {
  __paladioDemoSessions?: Map<string, DemoSessionState>;
};
const sessionsMap: Map<string, DemoSessionState> =
  globalStore.__paladioDemoSessions ?? new Map<string, DemoSessionState>();
globalStore.__paladioDemoSessions = sessionsMap;

function getUpstashConfig(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

async function upstashCommand<T>(command: Array<string | number>): Promise<T | null> {
  const config = getUpstashConfig();
  if (!config) return null;
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      console.warn(`[demoStore] Upstash ${String(command[0])} failed (${res.status})`);
      return null;
    }
    const data = (await res.json()) as { result?: T; error?: string };
    if (data.error) {
      console.warn(`[demoStore] Upstash ${String(command[0])} error: ${data.error}`);
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    console.warn(`[demoStore] Upstash ${String(command[0])} error:`, err);
    return null;
  }
}

function serializeSession(session: DemoSessionState): string {
  const payload = {
    sid: session.sid,
    createdAt: session.createdAt,
    nextResetAt: session.nextResetAt,
    user: session.user,
    trips: session.trips,
    revisionsByTrip: session.revisionsByTrip,
    ticketsByTrip: session.ticketsByTrip,
    participantsByTrip: session.participantsByTrip,
    expensesByTrip: session.expensesByTrip,
    collectionsByTrip: session.collectionsByTrip,
    savedCollections: session.savedCollections,
    customPois: session.customPois,
    mediaBlobs: session.mediaBlobs,
    deletedMediaIds: Array.from(session.deletedMediaIds),
    discardedDeals: Array.from(session.discardedDeals),
  };
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64');
}

function deserializeSession(encoded: string): DemoSessionState | null {
  try {
    const gz = Buffer.from(encoded, 'base64');
    const parsed = JSON.parse(zlib.gunzipSync(gz).toString('utf8')) as Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed.sid !== 'string' ||
      typeof parsed.nextResetAt !== 'number' ||
      !Number.isFinite(parsed.nextResetAt)
    ) {
      return null;
    }
    return {
      sid: parsed.sid,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
      nextResetAt: parsed.nextResetAt,
      user: (parsed.user as Record<string, unknown>) || {},
      trips: Array.isArray(parsed.trips) ? (parsed.trips as Array<Record<string, unknown>>) : [],
      revisionsByTrip:
        (parsed.revisionsByTrip as Record<string, Array<Record<string, unknown>>>) || {},
      ticketsByTrip:
        (parsed.ticketsByTrip as Record<string, Array<Record<string, unknown>>>) || {},
      participantsByTrip:
        (parsed.participantsByTrip as Record<string, Array<Record<string, unknown>>>) || {},
      expensesByTrip:
        (parsed.expensesByTrip as Record<string, Array<Record<string, unknown>>>) || {},
      collectionsByTrip:
        (parsed.collectionsByTrip as Record<string, Array<Record<string, unknown>>>) || {},
      savedCollections: Array.isArray(parsed.savedCollections)
        ? (parsed.savedCollections as Array<Record<string, unknown>>)
        : [],
      customPois: Array.isArray(parsed.customPois)
        ? (parsed.customPois as Array<Record<string, unknown>>)
        : [],
      mediaBlobs:
        (parsed.mediaBlobs as Record<string, { mime_type: string; b64: string }>) || {},
      deletedMediaIds: new Set(
        Array.isArray(parsed.deletedMediaIds) ? parsed.deletedMediaIds.map(String) : []
      ),
      discardedDeals: new Set(
        Array.isArray(parsed.discardedDeals) ? parsed.discardedDeals.map(String) : []
      ),
    };
  } catch {
    return null;
  }
}

export function resolveDemoMediaBlob(
  session: DemoSessionState,
  baseline: DemoSnapshotRaw,
  photoId: string
): { mime_type: string; b64: string } | undefined {
  if (session.deletedMediaIds.has(photoId)) {
    return undefined;
  }
  return session.mediaBlobs[photoId] ?? baseline.media_blobs?.[photoId];
}

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

const CITY_COUNTRY_META: Record<string, { country: string; code: string }> = {
  Tokyo: { country: 'Japan', code: 'JP' },
  Madrid: { country: 'Spain', code: 'ES' },
  London: { country: 'United Kingdom', code: 'GB' },
  Zurich: { country: 'Switzerland', code: 'CH' },
  Paris: { country: 'France', code: 'FR' },
  Lisbon: { country: 'Portugal', code: 'PT' },
};

export function buildCollectionPoiSummary(
  poi: Record<string, unknown>,
  fallbackCity?: string
): Record<string, unknown> {
  const city = String(poi.city || fallbackCity || '');
  const meta = CITY_COUNTRY_META[city];
  const scoring = (poi.scoring || {}) as Record<string, unknown>;
  const loc = (poi.location || {}) as Record<string, unknown>;
  return {
    id: poi.id,
    name: poi.name,
    category: poi.category || 'attraction',
    cost_eur: poi.cost_eur ?? 0,
    duration_mins: poi.duration_mins ?? 60,
    lat: poi.lat ?? loc.latitude ?? loc.lat ?? null,
    lng: poi.lng ?? loc.longitude ?? loc.lng ?? null,
    photo_url: poi.photo_url || poi.thumbnail_url || null,
    thumbnail_url: poi.thumbnail_url || poi.photo_url || null,
    rating: scoring.rating ?? poi.rating ?? 4.6,
    formatted_address:
      poi.address ||
      (poi.neighborhood && city ? `${String(poi.neighborhood)}, ${city}` : city || null),
    description: poi.description || null,
    city: city || null,
    country: meta?.country || (poi.country as string) || null,
    country_code: meta?.code || (poi.country_code as string) || null,
  };
}

function buildFreshSession(sid: string, baseline: DemoSnapshotRaw, nextResetAt: number): DemoSessionState {
  const now = new Date();
  const poiByIdMap = new Map<string, Record<string, unknown>>();
  for (const [cityName, cityPois] of Object.entries(baseline.pois_by_city || {})) {
    for (const p of cityPois) {
      if (p.id) {
        poiByIdMap.set(String(p.id), { ...p, city: p.city || cityName });
      }
    }
  }
  const trips: Array<Record<string, unknown>> = [];
  const revisionsByTrip: Record<string, Array<Record<string, unknown>>> = {};
  const ticketsByTrip: Record<string, Array<Record<string, unknown>>> = {};
  const participantsByTrip: Record<string, Array<Record<string, unknown>>> = {};
  const expensesByTrip: Record<string, Array<Record<string, unknown>>> = {};
  const collectionsByTrip: Record<string, Array<Record<string, unknown>>> = {};

  for (const rawTrip of baseline.trips) {
    const trip = deepClone(rawTrip);
    const tripId = String(trip.id);
    const startOffset = Number(trip.start_offset_days ?? 14);
    const endOffset = Number(trip.end_offset_days ?? startOffset + 3);
    const startDate = addDaysIso(now, startOffset);
    const endDate = addDaysIso(now, endOffset);

    const itin = (trip.itinerary_data || {}) as Record<string, unknown>;
    const tc = (itin.travel_constraints || {}) as Record<string, unknown>;
    tc.start_date = startDate;
    tc.end_date = endDate;
    itin.travel_constraints = tc;
    if (Array.isArray(itin.days)) {
      itin.days = (itin.days as Array<Record<string, unknown>>).map((d, idx) => ({
        ...d,
        date: addDaysIso(now, startOffset + idx),
      }));
    }

    const rawRevs = (trip.revisions as Array<Record<string, unknown>>) || [];
    revisionsByTrip[tripId] = rawRevs.map((rev) => {
      const copy = deepClone(rev);
      const offsetHrs = Number(copy.created_offset_hours ?? -2);
      copy.created_at = addHoursIso(now, offsetHrs);
      delete copy.created_offset_hours;
      return copy;
    });

    const rawTickets = (trip.tickets as Array<Record<string, unknown>>) || [];
    ticketsByTrip[tripId] = rawTickets.map((tkt) => {
      const copy = deepClone(tkt);
      const dayOff = Number(copy.day_offset ?? 0);
      const endDayOff = copy.end_day_offset !== undefined ? Number(copy.end_day_offset) : dayOff;
      const startD = addDaysIso(now, startOffset + dayOff);
      const endD = addDaysIso(now, startOffset + endDayOff);
      const sTime = String(copy.start_hhmm || '09:00');
      const eTime = String(copy.end_hhmm || '11:00');
      copy.start_time = `${startD}T${sTime}:00`;
      copy.end_time = `${endD}T${eTime}:00`;
      copy.created_at = addHoursIso(now, -48);
      copy.updated_at = addHoursIso(now, -2);
      copy.departure_tz = copy.start_tz || null;
      copy.arrival_tz = copy.end_tz || null;
      delete copy.day_offset;
      delete copy.end_day_offset;
      delete copy.start_hhmm;
      delete copy.end_hhmm;
      return copy;
    });

    const rawParticipants = (trip.participants as Array<Record<string, unknown>>) || [];
    participantsByTrip[tripId] = deepClone(rawParticipants);

    const rawExpenses = (trip.expenses as Array<Record<string, unknown>>) || [];
    expensesByTrip[tripId] = rawExpenses.map((exp) => {
      const copy = deepClone(exp);
      const dayOff = Number(copy.day_offset ?? 0);
      copy.expense_date = addDaysIso(now, startOffset + dayOff);
      copy.created_at = `${copy.expense_date}T19:30:00Z`;
      delete copy.day_offset;
      return copy;
    });

    const rawCols = (trip.collections as Array<Record<string, unknown>>) || [];
    collectionsByTrip[tripId] = rawCols.map((col) => {
      const copy = deepClone(col);
      copy.trip_id = tripId;
      copy.trip_destination = trip.destination;
      copy.trip_title = itin.title || trip.destination;
      copy.created_at = addHoursIso(now, -48);
      copy.updated_at = addHoursIso(now, -12);
      copy.items = ((copy.item_ids as string[]) || []).map((pid, idx) => {
        const foundPoi = poiByIdMap.get(String(pid));
        return {
          id: `${copy.id}-item-${idx}`,
          collection_id: copy.id,
          poi_id: pid,
          notes: null,
          visit_status: 'want_to_go',
          order_index: idx,
          created_at: addHoursIso(now, -24),
          poi: foundPoi ? buildCollectionPoiSummary(foundPoi, String(trip.destination || '')) : null,
        };
      });
      copy.items_count = (copy.items as unknown[]).length;
      copy.item_count = (copy.items as unknown[]).length;
      delete copy.item_ids;
      return copy;
    });

    trips.push({
      id: tripId,
      user_id: trip.user_id,
      destination: trip.destination,
      start_date: startDate,
      end_date: endDate,
      itinerary_data: itin,
      status: trip.status || 'active',
      revision: trip.revision ?? 4,
      destination_timezone: trip.destination_timezone,
      origin_iata: trip.origin_iata,
      destination_iata: trip.destination_iata,
      corridor: trip.corridor,
      participants: participantsByTrip[tripId],
      tickets_count: ticketsByTrip[tripId].length,
      created_at: addHoursIso(now, -72),
    });
  }

  // Global saved collections curated from Tokyo & Madrid POIs with verified photos
  const savedCollections: Array<Record<string, unknown>> = [
    {
      id: 'demo-saved-col-1',
      trip_id: null,
      name: 'Architectural Landmarks',
      description: 'Brutalist concrete, shrines & modern pavilions',
      color: '#0F4C5C',
      items: [],
      items_count: 0,
      item_count: 0,
      created_at: addHoursIso(now, -120),
      updated_at: addHoursIso(now, -24),
    },
    {
      id: 'demo-saved-col-2',
      trip_id: null,
      name: 'Late-Night Kissaten & Markets',
      description: 'Listening bars, coffee counters & historic markets',
      color: '#E2B33C',
      items: [],
      items_count: 0,
      item_count: 0,
      created_at: addHoursIso(now, -96),
      updated_at: addHoursIso(now, -24),
    },
  ];

  const tokyoPois = baseline.pois_by_city['Tokyo'] || [];
  const madridPois = baseline.pois_by_city['Madrid'] || [];
  const hasRealPhoto = (p: Record<string, unknown>) => {
    const u = String(p.photo_url || '');
    return Boolean(u && !u.toLowerCase().includes('.svg'));
  };

  const archPois = tokyoPois
    .filter((p) => (p.category === 'museum' || p.category === 'monument') && hasRealPhoto(p))
    .slice(0, 3)
    .concat(
      madridPois
        .filter((p) => (p.category === 'museum' || p.category === 'monument') && hasRealPhoto(p))
        .slice(0, 2)
    );
  archPois.forEach((p, idx) => {
    (savedCollections[0].items as unknown[]).push({
      id: `sc1-${p.id}`,
      collection_id: 'demo-saved-col-1',
      poi_id: p.id,
      visit_status: 'want_to_go',
      order_index: idx,
      created_at: addHoursIso(now, -72),
      poi: buildCollectionPoiSummary(p),
      city: p.city,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      photo_url: p.photo_url,
    });
  });
  savedCollections[0].items_count = (savedCollections[0].items as unknown[]).length;
  savedCollections[0].item_count = savedCollections[0].items_count;

  const isFoodCat = (p: Record<string, unknown>) =>
    ['restaurant', 'cafe', 'bar', 'market'].includes(String(p.category || '').toLowerCase());
  const foodPois = tokyoPois
    .filter((p) => isFoodCat(p) && hasRealPhoto(p))
    .slice(0, 3)
    .concat(madridPois.filter((p) => isFoodCat(p) && hasRealPhoto(p)).slice(0, 2));
  foodPois.forEach((p, idx) => {
    (savedCollections[1].items as unknown[]).push({
      id: `sc2-${p.id}`,
      collection_id: 'demo-saved-col-2',
      poi_id: p.id,
      visit_status: 'want_to_go',
      order_index: idx,
      created_at: addHoursIso(now, -60),
      poi: buildCollectionPoiSummary(p),
      city: p.city,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      photo_url: p.photo_url,
    });
  });
  savedCollections[1].items_count = (savedCollections[1].items as unknown[]).length;
  savedCollections[1].item_count = savedCollections[1].items_count;

  const demoUser = deepClone(baseline.demo_user);
  const prefs = (demoUser.preferences || {}) as Record<string, unknown>;
  const holidayOffsets = Array.isArray(prefs.holiday_offsets)
    ? (prefs.holiday_offsets as number[])
    : [4, 5, 6, 7, 25, 26, 27, 28];
  prefs.holiday_dates = holidayOffsets.map((off) => addDaysIso(now, Number(off)));
  demoUser.preferences = prefs;

  return {
    sid,
    createdAt: Date.now(),
    nextResetAt,
    user: demoUser,
    trips,
    revisionsByTrip,
    ticketsByTrip,
    participantsByTrip,
    expensesByTrip,
    collectionsByTrip,
    savedCollections,
    customPois: [],
    mediaBlobs: {},
    deletedMediaIds: new Set<string>(),
    discardedDeals: new Set<string>(),
  };
}

export async function getOrCreateDemoSession(
  incomingSid?: string | null,
  incomingResetAt?: number | null,
  isDirtyHint = false
): Promise<{
  session: DemoSessionState;
  baseline: DemoSnapshotRaw;
  wasReset: boolean;
  isNew: boolean;
  isDirty: boolean;
}> {
  const baseline = await getDemoSnapshotBaseline();
  const nowMs = Date.now();

  // Prune expired sessions and enforce bounded server memory
  if (sessionsMap.size > 200) {
    for (const [k, s] of sessionsMap.entries()) {
      if (nowMs >= s.nextResetAt) {
        sessionsMap.delete(k);
      }
    }
    if (sessionsMap.size > 200) {
      const byAge = Array.from(sessionsMap.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      );
      for (const [k] of byAge) {
        if (sessionsMap.size <= 150) break;
        sessionsMap.delete(k);
      }
    }
  }

  let sid = incomingSid && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingSid) ? incomingSid : '';
  let isNew = false;
  if (!sid) {
    sid = crypto.randomBytes(16).toString('hex');
    isNew = true;
  }

  const cookieExpired = Boolean(incomingResetAt && nowMs >= incomingResetAt);
  if (!isNew && cookieExpired) {
    const nextReset = nowMs + ONE_HOUR_MS;
    const fresh = buildFreshSession(sid, baseline, nextReset);
    sessionsMap.set(sid, fresh);
    if (getUpstashConfig()) {
      void upstashCommand(['DEL', SESSION_REDIS_PREFIX + sid]);
    }
    return { session: fresh, baseline, wasReset: true, isNew: false, isDirty: false };
  }

  let existing = sessionsMap.get(sid);
  if (existing && nowMs >= existing.nextResetAt) {
    const nextReset = nowMs + ONE_HOUR_MS;
    existing = buildFreshSession(sid, baseline, nextReset);
    sessionsMap.set(sid, existing);
    if (getUpstashConfig()) {
      void upstashCommand(['DEL', SESSION_REDIS_PREFIX + sid]);
    }
    return { session: existing, baseline, wasReset: true, isNew: false, isDirty: false };
  }

  if (!existing && !isNew && isDirtyHint && getUpstashConfig()) {
    const raw = await upstashCommand<string>(['GET', SESSION_REDIS_PREFIX + sid]);
    if (raw) {
      const loaded = deserializeSession(raw);
      if (loaded && nowMs < loaded.nextResetAt) {
        sessionsMap.set(sid, loaded);
        return { session: loaded, baseline, wasReset: false, isNew: false, isDirty: true };
      }
    }
  }

  if (!existing) {
    const validResetAt =
      incomingResetAt && incomingResetAt > nowMs && incomingResetAt <= nowMs + ONE_HOUR_MS
        ? incomingResetAt
        : nowMs + ONE_HOUR_MS;
    existing = buildFreshSession(sid, baseline, validResetAt);
    sessionsMap.set(sid, existing);
    return { session: existing, baseline, wasReset: false, isNew, isDirty: false };
  }

  return { session: existing, baseline, wasReset: false, isNew: false, isDirty: isDirtyHint };
}

export async function persistDemoSession(session: DemoSessionState): Promise<boolean> {
  sessionsMap.set(session.sid, session);
  if (!getUpstashConfig()) {
    return false;
  }
  const ttlSeconds = Math.max(
    60,
    Math.min(3600, Math.ceil((session.nextResetAt - Date.now()) / 1000))
  );
  const res = await upstashCommand<string>([
    'SET',
    SESSION_REDIS_PREFIX + session.sid,
    serializeSession(session),
    'EX',
    ttlSeconds,
  ]);
  return res !== null;
}

export async function resetDemoSession(sid: string): Promise<DemoSessionState> {
  const baseline = await getDemoSnapshotBaseline();
  const nextReset = Date.now() + ONE_HOUR_MS;
  const fresh = buildFreshSession(sid, baseline, nextReset);
  sessionsMap.set(sid, fresh);
  if (getUpstashConfig()) {
    await upstashCommand(['DEL', SESSION_REDIS_PREFIX + sid]);
  }
  return fresh;
}
