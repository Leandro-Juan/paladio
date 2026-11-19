import 'server-only';
import { NextResponse } from 'next/server';

export function jsonRes(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errRes(detail: string, status = 400): NextResponse {
  return NextResponse.json({ detail }, { status });
}

export function blockedRes(feature = 'This action'): NextResponse {
  return NextResponse.json(
    { detail: `${feature} is disabled in Demo Mode.` },
    { status: 403 }
  );
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function minsToHhmm(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const base = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return dateStr;
  base.setUTCDate(base.getUTCDate() + deltaDays);
  const shifted = base.toISOString().slice(0, 10);
  if (dateStr.length > 10) {
    return `${shifted}${dateStr.slice(10)}`;
  }
  return shifted;
}

export function diffDaysIso(oldStart: string, newStart: string): number {
  const d1 = new Date(`${oldStart.slice(0, 10)}T00:00:00Z`).getTime();
  const d2 = new Date(`${newStart.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
  return Math.round((d2 - d1) / 86_400_000);
}

export function computeSettlement(
  tripId: string,
  participants: Array<Record<string, unknown>>,
  expenses: Array<Record<string, unknown>>,
  simplify = true
) {
  const paidMap = new Map<string, number>();
  const shareMap = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const p of participants) {
    const pid = String(p.id);
    paidMap.set(pid, 0);
    shareMap.set(pid, 0);
    nameMap.set(pid, String(p.name || 'Traveler'));
  }

  let totalExpenses = 0;
  for (const exp of expenses) {
    const amt = Number(exp.amount || 0);
    totalExpenses += amt;
    const payerId = String(exp.payer_id || '');
    if (payerId) {
      paidMap.set(payerId, (paidMap.get(payerId) || 0) + amt);
    }
    const splits = Array.isArray(exp.splits) ? (exp.splits as Array<Record<string, unknown>>) : [];
    if (splits.length > 0) {
      for (const s of splits) {
        const spId = String(s.participant_id || '');
        if (spId) {
          shareMap.set(spId, (shareMap.get(spId) || 0) + Number(s.amount || 0));
        }
      }
    } else if (participants.length > 0) {
      const each = amt / participants.length;
      for (const p of participants) {
        const pid = String(p.id);
        shareMap.set(pid, (shareMap.get(pid) || 0) + each);
      }
    }
  }

  const balances = participants.map((p) => {
    const pid = String(p.id);
    const paid = Math.round((paidMap.get(pid) || 0) * 100) / 100;
    const share = Math.round((shareMap.get(pid) || 0) * 100) / 100;
    const net = Math.round((paid - share) * 100) / 100;
    return {
      participant_id: pid,
      name: String(p.name || 'Traveler'),
      total_paid: paid,
      total_share: share,
      net_balance: net,
    };
  });

  const debtors = balances
    .filter((b) => b.net_balance < -0.01)
    .map((b) => ({ id: b.participant_id, name: b.name, amt: -b.net_balance }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = balances
    .filter((b) => b.net_balance > 0.01)
    .map((b) => ({ id: b.participant_id, name: b.name, amt: b.net_balance }))
    .sort((a, b) => b.amt - a.amt);

  const transfers: Array<{
    sender_id: string;
    sender_name: string;
    receiver_id: string;
    receiver_name: string;
    amount: number;
  }> = [];

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.round(Math.min(d.amt, c.amt) * 100) / 100;
    if (pay > 0.01) {
      transfers.push({
        sender_id: d.id,
        sender_name: d.name,
        receiver_id: c.id,
        receiver_name: c.name,
        amount: pay,
      });
    }
    d.amt = Math.round((d.amt - pay) * 100) / 100;
    c.amt = Math.round((c.amt - pay) * 100) / 100;
    if (d.amt <= 0.01) i++;
    if (c.amt <= 0.01) j++;
  }

  return {
    trip_id: tripId,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    currency: 'EUR',
    balances,
    transfers,
    simplified: simplify,
  };
}

export function extractStopLatLng(stop: Record<string, unknown>): { lat: number; lng: number } {
  const poi = (stop.poi || {}) as Record<string, unknown>;
  const loc = (poi.location || {}) as Record<string, unknown>;
  const lat = Number(loc.latitude ?? loc.lat ?? poi.lat ?? poi.latitude ?? 0);
  const lng = Number(loc.longitude ?? loc.lng ?? poi.lon ?? poi.longitude ?? 0);
  return { lat, lng };
}

export function reoptimizeDayPath(
  path: Array<Record<string, unknown>>,
  stations: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (!Array.isArray(path) || path.length <= 2) return path;

  const isHotel = (s: Record<string, unknown>) => {
    const poi = (s.poi || {}) as Record<string, unknown>;
    return String(poi.id || '').startsWith('hotel') || String(poi.category || '').toUpperCase() === 'HOTEL';
  };

  const depot = isHotel(path[0]) ? path[0] : null;
  const stops = depot ? path.slice(1) : [...path];

  // Nearest-neighbor TSP heuristic starting from depot (or first stop)
  const ordered: Array<Record<string, unknown>> = [];
  const remaining = [...stops];
  let curCoord = depot ? extractStopLatLng(depot) : extractStopLatLng(remaining.shift()!);
  if (!depot && stops.length > 0) {
    ordered.push(stops[0]);
  }

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let k = 0; k < remaining.length; k++) {
      const cand = extractStopLatLng(remaining[k]);
      const d = haversineKm(curCoord.lat, curCoord.lng, cand.lat, cand.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = k;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    ordered.push(chosen);
    curCoord = extractStopLatLng(chosen);
  }

  const finalPath = depot ? [depot, ...ordered] : ordered;
  let clockMins = 9 * 60;
  for (let idx = 0; idx < finalPath.length; idx++) {
    const stop = { ...finalPath[idx] };
    const poi = { ...((stop.poi || {}) as Record<string, unknown>) };
    if (idx === 0 && isHotel(stop)) {
      stop.arrival_time_mins = clockMins;
      stop.departure_time_mins = clockMins + 5;
      stop.scheduled_start = minsToHhmm(clockMins);
      stop.scheduled_end = minsToHhmm(clockMins + 5);
      stop.transit_from_previous = null;
      clockMins += 5;
      finalPath[idx] = stop;
      continue;
    }
    if (idx > 0) {
      const prevC = extractStopLatLng(finalPath[idx - 1]);
      const curC = extractStopLatLng(stop);
      const distKm = haversineKm(prevC.lat, prevC.lng, curC.lat, curC.lng);
      const useTransit = distKm > 0.85 && stations.length > 0;
      const travelMins = useTransit ? Math.max(8, Math.round(distKm / 0.32) + 4) : Math.max(4, Math.round(distKm / 0.075));
      clockMins += travelMins;
      stop.travel_time_mins_from_prev = travelMins;
      stop.cost_from_prev = useTransit ? 1.9 : 0;
      stop.transit_from_previous = buildQuickLeg(prevC, curC, String(poi.name || 'Stop'), stations, distKm, travelMins);
    }
    const dur = Math.max(30, Number(poi.duration_mins || 60));
    stop.arrival_time_mins = clockMins;
    stop.departure_time_mins = clockMins + dur;
    stop.arrival_time = minsToHhmm(clockMins);
    stop.departure_time = minsToHhmm(clockMins + dur);
    stop.scheduled_start = minsToHhmm(clockMins);
    stop.scheduled_end = minsToHhmm(clockMins + dur);
    clockMins += dur + 10;
    finalPath[idx] = stop;
  }

  return finalPath;
}

export function buildQuickLeg(
  origin: { lat: number; lng: number; name?: string },
  dest: { lat: number; lng: number; name?: string },
  destName: string,
  stations: Array<Record<string, unknown>>,
  distKm?: number,
  totalMins?: number
): Record<string, unknown> {
  const d = distKm ?? haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
  if (d <= 0.85 || stations.length === 0) {
    const mins = totalMins ?? Math.max(3, Math.round(d / 0.075));
    return {
      duration_mins: mins,
      cost_eur: 0,
      cost_is_estimated: false,
      price_source: 'pedestrian',
      mode: 'pedestrian',
      steps: [
        {
          type: 'walk',
          instruction: `Walk toward ${destName}`,
          duration_mins: mins,
          distance_km: Math.round(d * 100) / 100,
          geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
          intermediate_stops: [],
          intermediate_stop_details: [],
        },
      ],
      geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
    };
  }

  const nearest = (lat: number, lng: number) => {
    let best: Record<string, unknown> | null = null;
    let bestD = Infinity;
    for (const s of stations) {
      const lines = (s.lines as Array<Record<string, unknown>>) || [];
      if (lines.length === 0) continue;
      const sd = haversineKm(lat, lng, Number(s.lat), Number(s.lon));
      if (sd < bestD) {
        bestD = sd;
        best = s;
      }
    }
    return best;
  };

  const stA = nearest(origin.lat, origin.lng);
  const stB = nearest(dest.lat, dest.lng);
  if (!stA || !stB || stA.id === stB.id) {
    const mins = totalMins ?? Math.max(5, Math.round(d / 0.075));
    return {
      duration_mins: mins,
      cost_eur: 0,
      cost_is_estimated: false,
      price_source: 'pedestrian',
      mode: 'pedestrian',
      steps: [
        {
          type: 'walk',
          instruction: `Walk to ${destName}`,
          duration_mins: mins,
          distance_km: Math.round(d * 100) / 100,
          geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
          intermediate_stops: [],
          intermediate_stop_details: [],
        },
      ],
      geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
    };
  }

  const linesA = (stA.lines as Array<Record<string, unknown>>) || [];
  const linesB = (stB.lines as Array<Record<string, unknown>>) || [];
  const shared = linesA.find((la) => linesB.some((lb) => lb.line_id === la.line_id)) || linesA[0];
  const w1Km = haversineKm(origin.lat, origin.lng, Number(stA.lat), Number(stA.lon));
  const trKm = haversineKm(Number(stA.lat), Number(stA.lon), Number(stB.lat), Number(stB.lon));
  const w2Km = haversineKm(Number(stB.lat), Number(stB.lon), dest.lat, dest.lng);
  const w1m = Math.max(2, Math.round(w1Km / 0.075));
  const trm = Math.max(4, Math.round(trKm / 0.45) + 2);
  const w2m = Math.max(2, Math.round(w2Km / 0.075));

  return {
    duration_mins: w1m + trm + w2m,
    cost_eur: 1.9,
    cost_is_estimated: false,
    price_source: 'gtfs_fare',
    mode: 'transit',
    steps: [
      {
        type: 'walk',
        instruction: `Walk to ${String(stA.name)}`,
        duration_mins: w1m,
        distance_km: Math.round(w1Km * 100) / 100,
        geometry: [[origin.lat, origin.lng], [Number(stA.lat), Number(stA.lon)]],
        intermediate_stops: [],
        intermediate_stop_details: [],
      },
      {
        type: 'transit',
        instruction: `Take ${String(shared?.short_name || 'Metro')} toward ${String(stB.name)}`,
        duration_mins: trm,
        distance_km: Math.round(trKm * 100) / 100,
        transit_line: String(shared?.short_name || 'Metro'),
        headsign: String(stB.name),
        station_name: String(stA.name),
        route_color: String(shared?.color || '#0F4C5C'),
        route_text_color: String(shared?.text_color || '#FFFFFF'),
        geometry: [[Number(stA.lat), Number(stA.lon)], [Number(stB.lat), Number(stB.lon)]],
        intermediate_stops: [String(stA.name), String(stB.name)],
        intermediate_stop_details: [
          { name: String(stA.name), lat: Number(stA.lat), lon: Number(stA.lon) },
          { name: String(stB.name), lat: Number(stB.lat), lon: Number(stB.lon) },
        ],
      },
      {
        type: 'walk',
        instruction: `Walk from ${String(stB.name)} to ${destName}`,
        duration_mins: w2m,
        distance_km: Math.round(w2Km * 100) / 100,
        geometry: [[Number(stB.lat), Number(stB.lon)], [dest.lat, dest.lng]],
        intermediate_stops: [],
        intermediate_stop_details: [],
      },
    ],
    geometry: [
      [origin.lat, origin.lng],
      [Number(stA.lat), Number(stA.lon)],
      [Number(stB.lat), Number(stB.lon)],
      [dest.lat, dest.lng],
    ],
  };
}
