import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { DemoSnapshotRaw } from '../demoSnapshotLoader';
import { buildCollectionPoiSummary, DemoSessionState } from '../demoStore';
import {
  blockedRes,
  computeSettlement,
  diffDaysIso,
  errRes,
  jsonRes,
  reoptimizeDayPath,
  shiftIsoDate,
} from './helpers';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function findPoiSummary(
  poiId: string,
  session: DemoSessionState,
  baseline: DemoSnapshotRaw,
  fallbackCity?: string
): Record<string, unknown> | null {
  const custom = session.customPois.find((p) => String(p.id) === poiId);
  if (custom) return buildCollectionPoiSummary(custom, fallbackCity);

  for (const [cityName, list] of Object.entries(baseline.pois_by_city || {})) {
    const match = list.find((p) => String(p.id) === poiId);
    if (match) return buildCollectionPoiSummary({ ...match, city: match.city || cityName }, fallbackCity);
  }

  for (const t of session.trips) {
    const itin = (t.itinerary_data || {}) as Record<string, unknown>;
    const days = Array.isArray(itin.days) ? (itin.days as Array<Record<string, unknown>>) : [];
    for (const d of days) {
      const dItin = (d.itinerary || {}) as Record<string, unknown>;
      const path = Array.isArray(dItin.path) ? (dItin.path as Array<Record<string, unknown>>) : [];
      for (const s of path) {
        const poi = (s.poi || {}) as Record<string, unknown>;
        if (String(poi.id || '') === poiId) {
          return buildCollectionPoiSummary(poi, String(t.destination || fallbackCity || ''));
        }
      }
    }
  }
  return null;
}

function appendTripRevision(
  session: DemoSessionState,
  trip: Record<string, unknown>,
  beforeItin: Record<string, unknown>,
  afterItin: Record<string, unknown>,
  opts: { actor?: string; actorName?: string; kind: string; summary: string; afterLabel: string; field?: string }
) {
  const tripId = String(trip.id);
  const nextRev = Number(trip.revision || 0) + 1;
  trip.revision = nextRev;
  const list = session.revisionsByTrip[tripId] || [];
  for (const r of list) {
    r.is_current = false;
  }
  const revItem: Record<string, unknown> = {
    id: `${tripId}-rev-${nextRev}-${crypto.randomBytes(3).toString('hex')}`,
    trip_id: tripId,
    revision: nextRev,
    actor: opts.actor || 'user',
    actor_name: opts.actorName || 'Leandro',
    kind: opts.kind,
    summary: opts.summary,
    changes: [
      {
        kind: opts.kind,
        verb: opts.kind === 'revert' ? 'reverted' : opts.kind === 'restore' ? 'restored' : opts.kind === 'reoptimize' ? 'optimized' : 'updated',
        after_label: opts.afterLabel,
        field: opts.field || 'itinerary_data',
      },
    ],
    before: beforeItin,
    after: afterItin,
    created_at: new Date().toISOString(),
    can_revert: true,
    is_current: true,
  };
  session.revisionsByTrip[tripId] = [revItem, ...list];
}

function syncTripSummaryCounts(session: DemoSessionState, trip: Record<string, unknown>) {
  const tripId = String(trip.id);
  trip.participants = session.participantsByTrip[tripId] || [];
  trip.tickets_count = (session.ticketsByTrip[tripId] || []).length;
}

export async function handleTripsRoutes(
  req: NextRequest,
  method: string,
  segments: string[],
  session: DemoSessionState,
  baseline: DemoSnapshotRaw
): Promise<NextResponse | null> {
  // segments starts after 'trips'
  const url = req.nextUrl;

  // --- Global Saved Collections (/api/trips/saved-collections...) ---
  if (segments[0] === 'saved-collections') {
    if (segments.length === 1) {
      if (method === 'GET') return jsonRes(session.savedCollections);
      if (method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const col = {
          id: `demo-saved-col-${crypto.randomBytes(4).toString('hex')}`,
          trip_id: null,
          name: String(body.name || 'New Collection'),
          description: body.description || '',
          color: body.color || '#0F4C5C',
          items: [],
          items_count: 0,
          item_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        session.savedCollections.push(col);
        return jsonRes(col, 201);
      }
    }
    const colId = segments[1];
    const colIdx = session.savedCollections.findIndex((c) => c.id === colId);
    if (colIdx < 0) return errRes('Collection not found', 404);
    const col = session.savedCollections[colIdx];

    if (segments.length === 2) {
      if (method === 'PUT' || method === 'PATCH') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        if (body.name !== undefined) col.name = body.name;
        if (body.description !== undefined) col.description = body.description;
        if (body.color !== undefined) col.color = body.color;
        return jsonRes(col);
      }
      if (method === 'DELETE') {
        session.savedCollections.splice(colIdx, 1);
        return jsonRes({ status: 'success', id: colId });
      }
    }

    if (segments[2] === 'items') {
      const items = (col.items as Array<Record<string, unknown>>) || [];
      if (segments.length === 3 && method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const poiId = String(body.poi_id || crypto.randomBytes(4).toString('hex'));
        const poiSummary =
          (body.poi && typeof body.poi === 'object' ? (body.poi as Record<string, unknown>) : null) ||
          findPoiSummary(poiId, session, baseline);
        const item = {
          id: `sc-${crypto.randomBytes(4).toString('hex')}`,
          collection_id: colId,
          poi_id: poiId,
          visit_status: 'want_to_go',
          order_index: items.length,
          created_at: new Date().toISOString(),
          ...body,
          ...(poiSummary ? { poi: poiSummary } : {}),
        };
        items.push(item);
        col.items = items;
        col.items_count = items.length;
        col.item_count = items.length;
        return jsonRes(item, 201);
      }
      if (segments.length === 4) {
        const poiId = decodeURIComponent(segments[3]);
        if (method === 'POST') {
          const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
          const exists = items.find((i) => String(i.poi_id) === poiId);
          if (exists) return jsonRes(exists);
          const poiSummary =
            (body.poi && typeof body.poi === 'object' ? (body.poi as Record<string, unknown>) : null) ||
            findPoiSummary(poiId, session, baseline);
          const item = {
            id: `sc-${crypto.randomBytes(4).toString('hex')}`,
            collection_id: colId,
            poi_id: poiId,
            visit_status: 'want_to_go',
            order_index: items.length,
            created_at: new Date().toISOString(),
            ...body,
            ...(poiSummary ? { poi: poiSummary } : {}),
          };
          items.push(item);
          col.items = items;
          col.items_count = items.length;
          col.item_count = items.length;
          return jsonRes(item, 201);
        }
        if (method === 'PATCH') {
          const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
          const item = items.find((i) => String(i.poi_id) === poiId || String(i.id) === poiId);
          if (!item) return errRes('Item not found', 404);
          if (body.visit_status !== undefined) item.visit_status = body.visit_status;
          if (body.notes !== undefined) item.notes = body.notes;
          return jsonRes(item);
        }
        if (method === 'DELETE') {
          const next = items.filter((i) => String(i.poi_id) !== poiId && String(i.id) !== poiId);
          col.items = next;
          col.items_count = next.length;
          col.item_count = next.length;
          return jsonRes({ status: 'success' });
        }
      }
    }
    return null;
  }

  // --- Blocked Import / Boarding Pass Scan ---
  if (segments[0] === 'import' || segments[0] === 'scan-boarding-pass') {
    return blockedRes('Importing trips and scanning external documents');
  }

  // --- Transit Status Helper Endpoints (/api/trips/transit...) ---
  if (segments[0] === 'transit' || segments[0] === 'transit-status') {
    if (segments[0] === 'transit-status') {
      const city = (url.searchParams.get('city') || '').trim().toLowerCase();
      const gtfs = baseline.gtfs_by_city[city];
      return jsonRes({
        city,
        status: gtfs ? 'READY' : 'UNAVAILABLE',
        gtfs_status: gtfs ? 'READY' : 'UNAVAILABLE',
        derived_status: gtfs ? 'READY' : 'UNAVAILABLE',
        capabilities: { covered_date_range: { start: '2026-01-01', end: '2028-12-31' } },
        agencies: gtfs?.agencies || [],
      });
    }
    if (segments[1] === 'registry') {
      const cities = Object.entries(baseline.gtfs_by_city).map(([cityKey, g]) => ({
        city: cityKey,
        status: 'READY',
        gtfs_status: 'READY',
        derived_status: 'READY',
        line_count: Array.isArray(g.lines) ? g.lines.length : 0,
        station_count: Array.isArray(g.stations) ? g.stations.length : 0,
        agency_names: Array.isArray(g.agencies) ? (g.agencies as Array<Record<string, unknown>>).map((a) => a.name) : [],
      }));
      return jsonRes({ cities, total: cities.length });
    }
    if (segments[1] === 'planned-status') {
      return jsonRes(
        session.trips.map((t) => ({
          trip_id: t.id,
          destination: t.destination,
          status: 'READY',
          derived_status: 'READY',
        }))
      );
    }
    if (method === 'POST' || method === 'DELETE') {
      return blockedRes('Modifying GTFS transit databases');
    }
    return null;
  }

  if (segments[0] === 'pois' && method === 'DELETE') {
    return blockedRes('Deleting city POI databases');
  }

  // --- /api/trips/ (list & blocked create) ---
  if (segments.length === 0) {
    if (method === 'GET') {
      return jsonRes(session.trips);
    }
    if (method === 'POST') {
      return blockedRes('Creating new trips');
    }
    return null;
  }

  // --- Trip-Scoped Endpoints (/api/trips/{tripId}/...) ---
  const tripId = segments[0];
  const tripIdx = session.trips.findIndex((t) => String(t.id) === tripId);
  if (tripIdx < 0) return errRes('Trip not found', 404);
  const trip = session.trips[tripIdx];
  const sub = segments.slice(1);

  if (sub.length === 0) {
    if (method === 'GET') {
      syncTripSummaryCounts(session, trip);
      return jsonRes(trip);
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const prevItin = deepClone((trip.itinerary_data || {}) as Record<string, unknown>);
      if (body.destination !== undefined) trip.destination = body.destination;
      if (body.start_date !== undefined) trip.start_date = body.start_date;
      if (body.end_date !== undefined) trip.end_date = body.end_date;
      if (body.status !== undefined) trip.status = body.status;
      if (body.itinerary_data !== undefined && typeof body.itinerary_data === 'object' && body.itinerary_data !== null) {
        trip.itinerary_data = body.itinerary_data;
      }
      const nextItin = deepClone((trip.itinerary_data || {}) as Record<string, unknown>);
      appendTripRevision(session, trip, prevItin, nextItin, {
        kind: 'edit',
        summary: 'Updated itinerary & trip details',
        afterLabel: String((nextItin.title || trip.destination || 'Trip') + ' itinerary'),
      });
      syncTripSummaryCounts(session, trip);
      return jsonRes(trip);
    }
    if (method === 'DELETE') {
      session.trips.splice(tripIdx, 1);
      return jsonRes({ status: 'success', message: 'Trip deleted' });
    }
    return null;
  }

  // --- Blocked Export & Duplicate ---
  if (sub[0] === 'export') {
    return blockedRes('Exporting trip packages');
  }
  if (sub[0] === 'duplicate') {
    return blockedRes('Duplicating trips');
  }

  // --- Shift Dates ---
  if (sub[0] === 'shift-dates' && method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const newStart = String(body.new_start_date || '');
    if (!newStart) return errRes('new_start_date is required', 400);
    const delta = diffDaysIso(String(trip.start_date), newStart);
    const prevItin = deepClone((trip.itinerary_data || {}) as Record<string, unknown>);
    const oldStart = String(trip.start_date);
    trip.start_date = shiftIsoDate(String(trip.start_date), delta);
    trip.end_date = shiftIsoDate(String(trip.end_date), delta);
    const itin = (trip.itinerary_data || {}) as Record<string, unknown>;
    if (itin.travel_constraints && typeof itin.travel_constraints === 'object') {
      const tc = itin.travel_constraints as Record<string, unknown>;
      tc.start_date = trip.start_date;
      tc.end_date = trip.end_date;
    }
    if (body.reanchor_bookings !== false) {
      for (const tkt of session.ticketsByTrip[tripId] || []) {
        if (typeof tkt.start_time === 'string') tkt.start_time = shiftIsoDate(tkt.start_time, delta);
        if (typeof tkt.end_time === 'string') tkt.end_time = shiftIsoDate(tkt.end_time, delta);
      }
      for (const exp of session.expensesByTrip[tripId] || []) {
        if (typeof exp.expense_date === 'string') exp.expense_date = shiftIsoDate(exp.expense_date, delta);
      }
    }
    appendTripRevision(session, trip, prevItin, deepClone(itin), {
      kind: 'shift_dates',
      summary: `Shifted trip dates from ${oldStart} to ${String(trip.start_date)}`,
      afterLabel: `${String(trip.start_date)} – ${String(trip.end_date)}`,
      field: 'dates',
    });
    return jsonRes(trip);
  }

  // --- Reoptimize ---
  if (sub[0] === 'reoptimize' && method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dayParam = url.searchParams.get('day');
    const targetDay = dayParam ? Number(dayParam) : null;
    const prevItin = deepClone((trip.itinerary_data || {}) as Record<string, unknown>);
    const nextItin = deepClone(
      (body.itinerary_data && typeof body.itinerary_data === 'object' ? body.itinerary_data : prevItin) as Record<string, unknown>
    );
    const cityLower = String(trip.destination || '').toLowerCase();
    const stations = ((baseline.gtfs_by_city[cityLower]?.stations as Array<Record<string, unknown>>) || []);
    const days = Array.isArray(nextItin.days) ? (nextItin.days as Array<Record<string, unknown>>) : [];
    for (const d of days) {
      const dNum = Number(d.day ?? 0);
      if (targetDay && dNum !== targetDay) continue;
      const dItin = (d.itinerary || {}) as Record<string, unknown>;
      if (Array.isArray(dItin.path)) {
        dItin.path = reoptimizeDayPath(dItin.path as Array<Record<string, unknown>>, stations);
        d.itinerary = dItin;
      }
    }
    trip.itinerary_data = nextItin;
    appendTripRevision(session, trip, prevItin, deepClone(nextItin), {
      kind: 'reoptimize',
      summary: targetDay ? `Optimized route for Day ${targetDay}` : 'Optimized expedition routes',
      afterLabel: targetDay ? `Day ${targetDay}` : String(trip.destination),
      field: 'reoptimize',
    });
    return jsonRes(trip);
  }

  // --- Revisions ---
  if (sub[0] === 'revisions') {
    const revs = session.revisionsByTrip[tripId] || [];
    if (sub.length === 1 && method === 'GET') {
      return jsonRes({
        trip_id: tripId,
        current_revision: Number(trip.revision || 0),
        items: revs.map((r) => ({
          id: r.id,
          trip_id: r.trip_id,
          revision: r.revision,
          actor: r.actor,
          actor_name: r.actor_name,
          kind: r.kind,
          summary: r.summary,
          changes: r.changes,
          created_at: r.created_at,
          can_revert: Boolean(r.can_revert),
          is_current: Boolean(r.is_current),
        })),
      });
    }
    if (sub[2] === 'revert' && method === 'POST') {
      const revId = decodeURIComponent(sub[1]);
      const target = revs.find((r) => String(r.id) === revId);
      if (!target) return errRes('Revision not found', 404);
      const beforeTarget = deepClone((target.before || {}) as Record<string, unknown>);
      if (Object.keys(beforeTarget).length === 0) return errRes('Cannot revert initial creation', 400);
      const prevItin = deepClone((trip.itinerary_data || {}) as Record<string, unknown>);
      trip.itinerary_data = beforeTarget;
      appendTripRevision(session, trip, prevItin, deepClone(beforeTarget), {
        kind: 'revert',
        summary: `Reverted revision #${String(target.revision)}`,
        afterLabel: `Reverted to before Rev #${String(target.revision)}`,
        field: 'revert',
      });
      syncTripSummaryCounts(session, trip);
      return jsonRes(trip);
    }
    if (sub[2] === 'restore' && method === 'POST') {
      const targetRev = Number(sub[1]);
      const target = revs.find((r) => Number(r.revision) === targetRev);
      if (!target) return errRes('Revision not found', 404);
      const restored = deepClone((target.after || {}) as Record<string, unknown>);
      const prevItin = deepClone((trip.itinerary_data || {}) as Record<string, unknown>);
      trip.itinerary_data = restored;
      appendTripRevision(session, trip, prevItin, deepClone(restored), {
        kind: 'restore',
        summary: `Restored state from revision #${targetRev}`,
        afterLabel: `Restored Rev #${targetRev}`,
        field: 'restore',
      });
      syncTripSummaryCounts(session, trip);
      return jsonRes(trip);
    }
    return null;
  }

  // --- Participants ---
  if (sub[0] === 'participants') {
    const parts = session.participantsByTrip[tripId] || [];
    if (sub.length === 1 && method === 'GET') return jsonRes(parts);
    if (sub.length === 1 && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const newP = {
        id: `${tripId}-p-${crypto.randomBytes(3).toString('hex')}`,
        trip_id: tripId,
        user_id: body.user_id || null,
        name: String(body.name || 'Guest'),
        email: body.email || null,
        role: String(body.role || 'traveler'),
        created_at: new Date().toISOString(),
      };
      parts.push(newP);
      session.participantsByTrip[tripId] = parts;
      syncTripSummaryCounts(session, trip);
      return jsonRes(newP, 201);
    }
    if (sub.length === 2 && method === 'DELETE') {
      session.participantsByTrip[tripId] = parts.filter((p) => String(p.id) !== sub[1]);
      syncTripSummaryCounts(session, trip);
      return jsonRes({ status: 'success' });
    }
    return null;
  }

  // --- Expenses & Settlement ---
  if (sub[0] === 'expenses') {
    if (sub[1] === 'scan-receipt') {
      return blockedRes('Receipt OCR scanning');
    }
    const exps = session.expensesByTrip[tripId] || [];
    const parts = session.participantsByTrip[tripId] || [];
    if (sub.length === 1 && method === 'GET') return jsonRes(exps);
    if (sub.length === 1 && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const payerId = String(body.payer_id || (parts[0]?.id ?? ''));
      const payerName = String(parts.find((p) => p.id === payerId)?.name || 'Traveler');
      const amt = Number(body.amount || 0);
      const splits = Array.isArray(body.splits) && body.splits.length > 0
        ? body.splits
        : parts.map((p) => ({
            participant_id: p.id,
            amount: Math.round((amt / Math.max(1, parts.length)) * 100) / 100,
          }));
      const newExp = {
        id: `${tripId}-exp-${crypto.randomBytes(3).toString('hex')}`,
        trip_id: tripId,
        payer_id: payerId,
        payer_name: payerName,
        description: String(body.description || 'Expense'),
        amount: amt,
        currency: String(body.currency || 'EUR'),
        category: String(body.category || 'other'),
        split_type: String(body.split_type || 'equal'),
        splits,
        expense_date: body.expense_date || trip.start_date,
        created_at: new Date().toISOString(),
      };
      exps.unshift(newExp);
      session.expensesByTrip[tripId] = exps;
      return jsonRes(newExp, 201);
    }
    if (sub.length === 2) {
      const expIdx = exps.findIndex((e) => String(e.id) === sub[1]);
      if (expIdx < 0) return errRes('Expense not found', 404);
      if (method === 'PUT' || method === 'PATCH') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const updated = { ...exps[expIdx], ...body };
        if (body.payer_id) {
          updated.payer_name = String(parts.find((p) => p.id === body.payer_id)?.name || updated.payer_name || 'Traveler');
        }
        exps[expIdx] = updated;
        return jsonRes(updated);
      }
      if (method === 'DELETE') {
        exps.splice(expIdx, 1);
        return jsonRes({ status: 'success' });
      }
    }
    return null;
  }

  if (sub[0] === 'settlement' && method === 'GET') {
    const simplify = url.searchParams.get('simplify') !== 'false';
    return jsonRes(
      computeSettlement(
        tripId,
        session.participantsByTrip[tripId] || [],
        session.expensesByTrip[tripId] || [],
        simplify
      )
    );
  }

  // --- Tickets (Wallet) ---
  if (sub[0] === 'tickets') {
    const tickets = session.ticketsByTrip[tripId] || [];
    if (sub.length === 1 && method === 'GET') {
      const typeFilter = url.searchParams.get('type');
      const statusFilter = url.searchParams.get('status');
      const include = url.searchParams.get('include');
      let filtered = tickets;
      if (typeFilter) filtered = filtered.filter((t) => t.ticket_type === typeFilter);
      if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
      if (include === 'suggestions') {
        return jsonRes({ tickets: filtered, suggestions: [], has_drift: false });
      }
      return jsonRes(filtered);
    }
    if (sub.length === 1 && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const created = {
        id: `${tripId}-tkt-${crypto.randomBytes(3).toString('hex')}`,
        trip_id: tripId,
        ticket_type: String(body.ticket_type || 'other'),
        title: String(body.title || 'Ticket'),
        provider: body.provider || null,
        reference_code: body.reference_code || body.booking_reference || null,
        booking_reference: body.booking_reference || body.reference_code || null,
        holder_name: body.holder_name || 'Leandro',
        start_time: body.start_time || `${String(trip.start_date)}T09:00:00`,
        end_time: body.end_time || null,
        start_tz: body.start_tz || body.departure_tz || null,
        end_tz: body.end_tz || body.arrival_tz || null,
        seat_or_room: body.seat_or_room || null,
        location_or_venue: body.location_or_venue || trip.destination,
        price: body.price ?? null,
        currency: body.currency || 'EUR',
        status: String(body.status || 'confirmed'),
        access_code: body.access_code || null,
        barcode_value: body.barcode_value || null,
        barcode_format: body.barcode_format || null,
        metadata: body.metadata || {},
        notes: body.notes || null,
        source: 'manual',
        user_modified: true,
        visibility: body.visibility || 'trip',
        pinned: Boolean(body.pinned),
        drift: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [],
      };
      tickets.push(created);
      session.ticketsByTrip[tripId] = tickets;
      syncTripSummaryCounts(session, trip);
      return jsonRes(created, 201);
    }
    if (sub[1] === 'suggestions' && method === 'GET') {
      return jsonRes([]);
    }
    if (sub[1] === 'sync' && method === 'POST') {
      return jsonRes({ status: 'success', created_count: 0, updated_count: 0, has_drift: false, tickets });
    }
    if (sub[1] === 'scan' && method === 'POST') {
      return blockedRes('Scanning external ticket files');
    }
    if (sub.length === 2) {
      const idx = tickets.findIndex((t) => String(t.id) === sub[1]);
      if (idx < 0) return errRes('Ticket not found', 404);
      if (method === 'GET') return jsonRes(tickets[idx]);
      if (method === 'PUT' || method === 'PATCH') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        tickets[idx] = { ...tickets[idx], ...body, user_modified: true, updated_at: new Date().toISOString() };
        return jsonRes(tickets[idx]);
      }
      if (method === 'DELETE') {
        tickets.splice(idx, 1);
        syncTripSummaryCounts(session, trip);
        return jsonRes({ status: 'success', message: 'Ticket deleted' });
      }
    }
    return null;
  }

  // --- Photos ---
  if (sub[0] === 'photos') {
    if (sub.length === 2 && method === 'GET') {
      const photoId = decodeURIComponent(sub[1]);
      const blob = session.mediaBlobs[photoId] || baseline.media_blobs?.[photoId];
      if (!blob) return errRes('Photo not found', 404);
      const bytes = Buffer.from(blob.b64, 'base64');
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': blob.mime_type || 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
    if (sub.length === 1 && method === 'POST') {
      const formData = await req.formData().catch(() => null);
      if (!formData) return errRes('No files provided', 400);
      const itin = (trip.itinerary_data || {}) as Record<string, unknown>;
      const existingPhotos = Array.isArray(itin.photos) ? (itin.photos as Array<Record<string, unknown>>) : [];
      const added: Array<Record<string, unknown>> = [];
      for (const [, val] of formData.entries()) {
        if (val instanceof File) {
          const buf = Buffer.from(await val.arrayBuffer());
          const pid = `${tripId}-photo-${crypto.randomBytes(4).toString('hex')}`;
          session.mediaBlobs[pid] = {
            mime_type: val.type || 'image/jpeg',
            b64: buf.toString('base64'),
          };
          const item = {
            id: pid,
            url: `/api/trips/${tripId}/photos/${pid}`,
            filename: val.name,
            size_bytes: buf.length,
            mime_type: val.type || 'image/jpeg',
            media_type: 'image',
            created_at: new Date().toISOString(),
          };
          added.push(item);
          existingPhotos.push(item);
        }
      }
      itin.photos = existingPhotos;
      trip.itinerary_data = itin;
      return jsonRes(added);
    }
    if (sub.length === 2 && method === 'DELETE') {
      const photoId = decodeURIComponent(sub[1]);
      const itin = (trip.itinerary_data || {}) as Record<string, unknown>;
      if (Array.isArray(itin.photos)) {
        itin.photos = (itin.photos as Array<unknown>).filter((p) =>
          typeof p === 'string' ? !p.includes(photoId) : (p as Record<string, unknown>)?.id !== photoId
        );
      }
      delete session.mediaBlobs[photoId];
      return jsonRes({ status: 'ok', deleted: photoId });
    }
    return null;
  }

  // --- Trip Collections & Saved POIs Toggle ---
  if (sub[0] === 'collections') {
    const cols = session.collectionsByTrip[tripId] || [];
    const tripItin = (trip.itinerary_data || {}) as Record<string, unknown>;
    if (sub.length === 1 && method === 'GET') return jsonRes(cols);
    if (sub.length === 1 && method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const col = {
        id: `${tripId}-col-${crypto.randomBytes(3).toString('hex')}`,
        trip_id: tripId,
        trip_destination: trip.destination,
        trip_title: tripItin.title || trip.destination,
        name: String(body.name || 'Collection'),
        description: body.description || '',
        color: body.color || '#0F4C5C',
        items: [],
        items_count: 0,
        item_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      cols.push(col);
      session.collectionsByTrip[tripId] = cols;
      return jsonRes(col, 201);
    }
    if (sub.length >= 2) {
      const colIdx = cols.findIndex((c) => String(c.id) === sub[1]);
      if (colIdx < 0) return errRes('Collection not found', 404);
      const col = cols[colIdx];
      if (sub.length === 2) {
        if (method === 'PUT' || method === 'PATCH') {
          const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
          Object.assign(col, body);
          col.updated_at = new Date().toISOString();
          return jsonRes(col);
        }
        if (method === 'DELETE') {
          cols.splice(colIdx, 1);
          return jsonRes({ status: 'success' });
        }
      }
      if (sub[2] === 'items') {
        const items = (col.items as Array<Record<string, unknown>>) || [];
        if (sub.length === 3 && method === 'POST') {
          const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
          const poiId = decodeURIComponent(String(body.poi_id || ''));
          if (!poiId) return errRes('poi_id is required', 400);
          const exists = items.find((i) => String(i.poi_id) === poiId);
          if (exists) return jsonRes(exists);
          const poiSummary =
            (body.poi && typeof body.poi === 'object' ? (body.poi as Record<string, unknown>) : null) ||
            findPoiSummary(poiId, session, baseline, String(trip.destination || ''));
          const item = {
            id: `${col.id}-i-${crypto.randomBytes(3).toString('hex')}`,
            collection_id: col.id,
            poi_id: poiId,
            notes: body.notes ?? null,
            visit_status: body.visit_status || 'want_to_go',
            order_index: items.length,
            created_at: new Date().toISOString(),
            poi: poiSummary,
          };
          items.push(item);
          col.items = items;
          col.items_count = items.length;
          col.item_count = items.length;
          return jsonRes(item, 201);
        }
        if (sub[3]) {
          const poiId = decodeURIComponent(sub[3]);
          if (method === 'POST') {
            const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
            const exists = items.find((i) => String(i.poi_id) === poiId);
            if (exists) return jsonRes(exists);
            const poiSummary =
              (body.poi && typeof body.poi === 'object' ? (body.poi as Record<string, unknown>) : null) ||
              findPoiSummary(poiId, session, baseline, String(trip.destination || ''));
            const item = {
              id: `${col.id}-i-${crypto.randomBytes(3).toString('hex')}`,
              collection_id: col.id,
              poi_id: poiId,
              notes: body.notes ?? null,
              visit_status: body.visit_status || 'want_to_go',
              order_index: items.length,
              created_at: new Date().toISOString(),
              poi: poiSummary,
            };
            items.push(item);
            col.items = items;
            col.items_count = items.length;
            col.item_count = items.length;
            return jsonRes(item, 201);
          }
          if (method === 'PATCH') {
            const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
            const item = items.find((i) => String(i.poi_id) === poiId || String(i.id) === poiId);
            if (!item) return errRes('Item not found', 404);
            if (body.visit_status !== undefined) item.visit_status = body.visit_status;
            if (body.notes !== undefined) item.notes = body.notes;
            return jsonRes(item);
          }
          if (method === 'DELETE') {
            const next = items.filter((i) => String(i.poi_id) !== poiId && String(i.id) !== poiId);
            col.items = next;
            col.items_count = next.length;
            col.item_count = next.length;
            return jsonRes({ status: 'success' });
          }
        }
      }
    }
    return null;
  }

  if (sub[0] === 'pois' && sub[2] === 'toggle' && method === 'POST') {
    const poiId = decodeURIComponent(sub[1]);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedColId = body.collection_id ? String(body.collection_id) : null;
    const cols = session.collectionsByTrip[tripId] || [];
    if (cols.length === 0) {
      cols.push({
        id: `${tripId}-col-fav`,
        trip_id: tripId,
        trip_destination: trip.destination,
        name: 'Saved Places',
        items: [],
        items_count: 0,
        item_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      session.collectionsByTrip[tripId] = cols;
    }
    const primary = (requestedColId && cols.find((c) => String(c.id) === requestedColId)) || cols[0];
    const items = (primary.items as Array<Record<string, unknown>>) || [];
    const existsIdx = items.findIndex((i) => String(i.poi_id) === poiId);
    let saved = false;
    if (existsIdx >= 0) {
      items.splice(existsIdx, 1);
    } else {
      const poiSummary = findPoiSummary(poiId, session, baseline, String(trip.destination || ''));
      items.push({
        id: `${primary.id}-i-${crypto.randomBytes(3).toString('hex')}`,
        collection_id: primary.id,
        poi_id: poiId,
        notes: null,
        visit_status: 'want_to_go',
        order_index: items.length,
        created_at: new Date().toISOString(),
        poi: poiSummary,
      });
      saved = true;
    }
    primary.items = items;
    primary.items_count = items.length;
    primary.item_count = items.length;
    const collectionIds = cols
      .filter((c) => ((c.items as Array<Record<string, unknown>>) || []).some((i) => String(i.poi_id) === poiId))
      .map((c) => String(c.id));
    return jsonRes({ saved, poi_id: poiId, collection_id: primary.id, collection_ids: collectionIds });
  }

  return null;
}
