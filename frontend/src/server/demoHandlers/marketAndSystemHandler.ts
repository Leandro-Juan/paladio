import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { addDaysIso, addHoursIso, DemoSnapshotRaw } from '../demoSnapshotLoader';
import { resolveDemoAirportForCity, searchDemoLocations } from '../demoAirportService';
import {
  DemoSessionState,
  resetDemoSession,
  resolveDemoMediaBlob,
} from '../demoStore';
import { blockedRes, errRes, jsonRes } from './helpers';

const FX_FROM_EUR: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.85,
  JPY: 164.5,
  SGD: 1.44,
  CHF: 0.96,
  AUD: 1.65,
  CAD: 1.49,
  TRY: 37.2,
};

function convertAmount(eur: number, targetCurrency: string): number {
  const rate = FX_FROM_EUR[targetCurrency.toUpperCase()] ?? 1.0;
  return Math.round(eur * rate * 100) / 100;
}

function materializeDeal(raw: Record<string, unknown>, now: Date, currency: string): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  const departDate = addDaysIso(now, Number(copy.depart_offset_days ?? 20));
  const returnDate = addDaysIso(now, Number(copy.return_offset_days ?? 26));
  copy.depart_date = departDate;
  copy.return_date = returnDate;
  copy.detected_at = addHoursIso(now, Number(copy.detected_offset_hours ?? -3));
  copy.currency = currency;

  for (const field of [
    'total_price_eur',
    'price_per_traveler_eur',
    'baseline_median_eur',
    'median_per_traveler_eur',
    'savings_eur',
    'savings_per_traveler_eur',
  ]) {
    if (typeof copy[field] === 'number') {
      copy[field] = convertAmount(copy[field] as number, currency);
    }
  }

  const convertFlight = (fObj: unknown, legDate: string, defDep: string, defArr: string) => {
    if (!fObj || typeof fObj !== 'object') return;
    const f = fObj as Record<string, unknown>;
    const depClock = String(f.depart_clock || (typeof f.depart_time === 'string' && f.depart_time.length === 5 ? f.depart_time : defDep));
    const arrClock = String(f.arrival_clock || (typeof f.arrival_time === 'string' && f.arrival_time.length === 5 ? f.arrival_time : defArr));
    f.depart_time = `${legDate}T${depClock}:00Z`;
    f.arrival_time = `${legDate}T${arrClock}:00Z`;
    delete f.depart_clock;
    delete f.arrival_clock;
    for (const mf of ['base_price_eur', 'landed_price_eur', 'unit_price_eur']) {
      if (typeof f[mf] === 'number') {
        f[mf] = convertAmount(f[mf] as number, currency);
      }
    }
  };
  convertFlight(copy.flight, departDate, '10:15', '14:30');
  convertFlight(copy.return_flight, returnDate, '11:40', '17:15');

  if (copy.lodging && typeof copy.lodging === 'object') {
    const lodg = copy.lodging as Record<string, unknown>;
    if (typeof lodg.nightly_base_eur === 'number') {
      lodg.nightly_base_eur = convertAmount(lodg.nightly_base_eur, currency);
    }
    if (typeof lodg.landed_total_eur === 'number') {
      lodg.landed_total_eur = convertAmount(lodg.landed_total_eur, currency);
    }
  }

  delete copy.depart_offset_days;
  delete copy.return_offset_days;
  delete copy.detected_offset_hours;
  return copy;
}

function buildCalendarMonths(
  routeMeta: Record<string, unknown>,
  forwardCurve: Array<Record<string, unknown>>,
  lodgingCurve: Array<Record<string, unknown>>,
  now: Date,
  monthsCount: number,
  view: string,
  pricing: string,
  currency: string
) {
  const months: Array<Record<string, unknown>> = [];
  const baseFlight = Number(routeMeta.base_flight_eur || 250);
  const nights = Number(routeMeta.min_nights || 5);
  const travelers = Math.max(1, Number(routeMeta.travelers || 2));

  const curveByOffset = new Map<number, Record<string, unknown>>();
  const lodgingByOffset = new Map<number, Record<string, unknown>>();
  for (const pt of forwardCurve) {
    curveByOffset.set(Number(pt.day_offset ?? 0), pt);
  }
  for (const lp of lodgingCurve) {
    lodgingByOffset.set(Number(lp.day_offset ?? 0), lp);
  }

  const viewPrices: number[] = [];
  for (const pt of forwardCurve) {
    const off = Number(pt.day_offset ?? 0);
    const outP = Number(pt.price_eur ?? 0) * travelers;
    const retPt = curveByOffset.get(off + nights) ?? pt;
    const retP = Number(retPt.price_return_eur ?? pt.price_return_eur ?? (Number(pt.price_eur ?? 0) * 0.94)) * travelers;
    const vp = view === 'outbound' ? outP : view === 'inbound' ? retP : outP + retP;
    if (vp > 0) viewPrices.push(vp);
  }
  viewPrices.sort((a, b) => a - b);
  const qVal = (q: number, fallback: number) =>
    viewPrices.length > 0 ? viewPrices[Math.min(viewPrices.length - 1, Math.floor((viewPrices.length - 1) * q))] : fallback;
  const p10 = qVal(0.1, baseFlight * travelers * 0.85);
  const p50 = qVal(0.5, baseFlight * travelers);
  const p90 = qVal(0.9, baseFlight * travelers * 1.35);

  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const cheapestCandidates: Array<{ date: string; price: number }> = [];

  for (let m = 0; m < monthsCount; m++) {
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
    const year = firstDay.getUTCFullYear();
    const month = firstDay.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days: Array<Record<string, unknown>> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(year, month - 1, d));
      const iso = dt.toISOString().slice(0, 10);
      const offsetDays = Math.round((dt.getTime() - todayUtcMs) / 86_400_000);
      const pt = offsetDays >= 1 ? curveByOffset.get(offsetDays) : undefined;
      if (!pt) {
        days.push({
          date: iso,
          day: d,
          weekday: (dt.getUTCDay() + 6) % 7,
          price_eur: null,
          price_tier: 'no_data',
          carrier: null,
          flight_number: null,
          duration_mins: null,
          departure_time: null,
          booking_url: null,
          is_holiday: false,
        });
        continue;
      }

      const weekday = (dt.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
      const retPt = curveByOffset.get(offsetDays + nights) ?? pt;
      const outboundEur = Math.round(Number(pt.price_eur ?? baseFlight) * travelers * 100) / 100;
      const returnEur = Math.round(Number(retPt.price_return_eur ?? pt.price_return_eur ?? baseFlight * 0.95) * travelers * 100) / 100;
      const flightPrice =
        view === 'outbound'
          ? outboundEur
          : view === 'inbound'
          ? returnEur
          : Math.round((outboundEur + returnEur) * 100) / 100;

      const tier =
        flightPrice <= p10 * 1.02
          ? 'deal'
          : flightPrice <= p50 * 0.98
          ? 'fair'
          : flightPrice <= p90 * 0.95
          ? 'standard'
          : 'peak';

      const lodgPt = lodgingByOffset.get(offsetDays);
      const hotelNightly = Number(lodgPt?.nightly_price_eur ?? routeMeta.hotel_nightly_eur ?? 140);
      const hotelStayTotal = Math.round(hotelNightly * nights * 100) / 100;

      const totalPrice =
        pricing === 'package' && view === 'roundtrip'
          ? Math.round((flightPrice + hotelStayTotal) * 100) / 100
          : flightPrice;
      const convertedTotal = convertAmount(totalPrice, currency);
      cheapestCandidates.push({ date: iso, price: convertedTotal });

      const retDt = new Date(dt.getTime() + nights * 86_400_000);
      const activeCarrier = view === 'inbound' ? (retPt.return_carrier ?? pt.return_carrier ?? routeMeta.airline) : (pt.carrier ?? routeMeta.airline);
      const activeFlightNo = view === 'inbound' ? (retPt.return_flight_number ?? pt.return_flight_number ?? routeMeta.return_flight_no) : (pt.flight_number ?? routeMeta.flight_no);
      const activeDepClock = view === 'inbound' ? (retPt.return_depart_clock ?? pt.return_depart_clock ?? '11:40') : (pt.depart_clock ?? '10:15');
      const activeDur = Number(pt.duration_mins ?? routeMeta.duration_mins ?? 180);

      days.push({
        date: iso,
        day: d,
        weekday,
        price_eur: convertedTotal,
        price_tier: tier,
        carrier: activeCarrier,
        flight_number: activeFlightNo,
        duration_mins: activeDur,
        departure_time: activeDepClock,
        booking_url: null,
        is_holiday: weekday === 6,
        nights,
        return_date: retDt.toISOString().slice(0, 10),
        outbound_flight: {
          carrier: pt.carrier ?? routeMeta.airline,
          flight_number: pt.flight_number ?? routeMeta.flight_no,
          duration_mins: activeDur,
          departure_time: pt.depart_clock ?? '10:15',
          booking_url: null,
          price_eur: convertAmount(outboundEur, currency),
        },
        return_flight: {
          carrier: retPt.return_carrier ?? pt.return_carrier ?? routeMeta.airline,
          flight_number: retPt.return_flight_number ?? pt.return_flight_number ?? routeMeta.return_flight_no,
          duration_mins: activeDur,
          departure_time: retPt.return_depart_clock ?? pt.return_depart_clock ?? '11:40',
          booking_url: null,
          price_eur: convertAmount(returnEur, currency),
        },
        lodging:
          pricing === 'package'
            ? {
                nights,
                price_per_night_eur: convertAmount(hotelNightly, currency),
                total_lodging_eur: convertAmount(hotelStayTotal, currency),
                property_name: lodgPt?.property_name ?? routeMeta.hotel_name,
                stars: lodgPt?.stars ?? routeMeta.hotel_stars,
                review_score: lodgPt?.review_score ?? routeMeta.hotel_score,
                review_count: lodgPt?.review_count ?? routeMeta.hotel_reviews,
                photo_url: (lodgPt?.photo_url as string) || (routeMeta.hotel_photo_url as string) || null,
                booking_url: null,
                source: 'synthetic_demo_catalog',
                currency,
                value_score: lodgPt?.value_score ?? 91,
                badge: lodgPt?.badge ?? 'best_value',
                rank_reasons: (lodgPt?.rank_reasons as string[]) || [],
              }
            : null,
      });
    }

    months.push({
      year,
      month,
      month_name: monthNames[month - 1],
      days,
    });
  }

  cheapestCandidates.sort((a, b) => a.price - b.price);
  const topDates = cheapestCandidates.slice(0, 3).map((c) => c.date);

  return {
    months,
    route_label: `${String(routeMeta.origin_iata)} → ${String(routeMeta.destination_code)}`,
    p10_deal_eur: convertAmount(Math.round(p10), currency),
    p50_median_eur: convertAmount(Math.round(p50), currency),
    p90_peak_eur: convertAmount(Math.round(p90), currency),
    view,
    pricing,
    top_dates: topDates,
    currency,
  };
}

export async function handleMarketAndSystemRoutes(
  req: NextRequest,
  method: string,
  segments: string[],
  session: DemoSessionState,
  baseline: DemoSnapshotRaw
): Promise<NextResponse | null> {
  const root = segments[0];
  const sub = segments.slice(1);
  const url = req.nextUrl;
  const now = new Date();

  // --- Demo Metadata & Reset ---
  if (root === 'demo') {
    if (sub[0] === 'status' && method === 'GET') {
      return jsonRes({
        demo_mode: true,
        next_reset_at: session.nextResetAt,
        server_now: Date.now(),
      });
    }
    if (sub[0] === 'reset' && method === 'POST') {
      const fresh = await resetDemoSession(session.sid);
      session.nextResetAt = fresh.nextResetAt;
      return jsonRes({
        status: 'reset',
        next_reset_at: fresh.nextResetAt,
        server_now: Date.now(),
      });
    }
    return null;
  }

  // --- Auth ---
  if (root === 'auth') {
    if (sub[0] === 'setup-status' && method === 'GET') {
      return jsonRes({
        setup_required: false,
        user_count: 1,
        demo_mode: true,
        next_reset_at: session.nextResetAt,
      });
    }
    if ((sub[0] === 'login' || sub[0] === 'demo-login') && method === 'POST') {
      return jsonRes({
        access_token: 'paladio-demo-session-token',
        token_type: 'bearer',
        user: session.user,
      });
    }
    if (sub[0] === 'register' || sub[0] === 'setup') {
      return blockedRes('Account registration and setup');
    }
    return null;
  }

  // --- Users ---
  if (root === 'users') {
    if (sub[0] === 'me' && sub.length === 1 && method === 'GET') {
      return jsonRes(session.user);
    }
    if (sub[0] === 'me' && sub.length === 1 && (method === 'PUT' || method === 'PATCH')) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (body.password) {
        return blockedRes('Password changes');
      }
      if (body.preferences && typeof body.preferences === 'object') {
        const currentPrefs = ((session.user.preferences || {}) as Record<string, unknown>);
        session.user = {
          ...session.user,
          preferences: {
            ...currentPrefs,
            ...(body.preferences as Record<string, unknown>),
          },
        };
      }
      return jsonRes(session.user);
    }
    if (sub[0] === 'me' && sub[1] === 'preferences' && (method === 'PUT' || method === 'PATCH')) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const currentPrefs = ((session.user.preferences || {}) as Record<string, unknown>);
      session.user = {
        ...session.user,
        preferences: {
          ...currentPrefs,
          ...body,
        },
      };
      return jsonRes(session.user);
    }
    if (sub[0] === 'me' && sub[1] === 'embedding' && method === 'GET') {
      return jsonRes({
        user_id: session.user.id,
        embedding: baseline.demo_embedding,
        dimension: baseline.demo_embedding.length,
      });
    }
    if (sub[0] === 'collaborators' && sub[1] === 'options' && method === 'GET') {
      return jsonRes([
        { id: 'demo-user-001', username: 'paladio_demo', email: 'demo@paladio.app' },
        { id: 'collab-clara', username: 'clara', email: 'clara@paladio.app' },
        { id: 'collab-mateo', username: 'mateo', email: 'mateo@paladio.app' },
        { id: 'collab-sofia', username: 'sofia', email: 'sofia@paladio.app' },
      ]);
    }
    if (sub.length === 0 && method === 'GET') {
      return jsonRes([session.user]);
    }
    return blockedRes('Account and user management');
  }

  // --- Market / Monitored Routes ---
  if (root === 'market') {
    const currency = (url.searchParams.get('currency') || 'EUR').toUpperCase();
    const market = baseline.market;

    if (sub[0] === 'hotels' && sub[1] === 'photos' && sub[2] && method === 'GET') {
      const photoId = decodeURIComponent(sub[2]);
      const blob =
        resolveDemoMediaBlob(session, baseline, `hotel-${photoId}`) ||
        resolveDemoMediaBlob(session, baseline, photoId);
      if (!blob) return errRes('Hotel photo not found', 404);
      const bytes = Buffer.from(blob.b64, 'base64');
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': blob.mime_type || 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    if (sub[0] === 'summary' && method === 'GET') {
      return jsonRes(market.summary);
    }

    if (sub[0] === 'routes' && sub.length === 1) {
      if (method === 'GET') {
        const out = market.routes.map((r) => {
          const copy = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
          copy.earliest_date = addDaysIso(now, Number(copy.earliest_offset_days ?? 14));
          copy.latest_date = addDaysIso(now, Number(copy.latest_offset_days ?? 180));
          copy.last_scanned_at = addHoursIso(now, -2);
          copy.currency = currency;
          for (const mf of ['current_price_eur', 'baseline_p50_eur', 'baseline_p10_eur', 'lowest_ever_eur', 'max_budget_eur']) {
            if (typeof copy[mf] === 'number') {
              copy[mf] = convertAmount(copy[mf] as number, currency);
            }
          }
          delete copy.earliest_offset_days;
          delete copy.latest_offset_days;
          return copy;
        });
        return jsonRes(out);
      }
      if (method === 'POST') {
        return blockedRes('Monitoring new routes');
      }
    }

    if ((sub[0] === 'deals' || sub[0] === 'routes-best-deals') && sub.length === 1 && method === 'GET') {
      const visible = market.deals
        .filter((d) => !session.discardedDeals.has(String(d.id)))
        .map((d) => materializeDeal(d, now, currency));
      return jsonRes(visible);
    }

    if (sub[0] === 'deals' && sub[2] === 'discard' && method === 'POST') {
      session.discardedDeals.add(sub[1]);
      return jsonRes({ status: 'discarded', id: sub[1] });
    }
    if (sub[0] === 'deals' && sub[2] === 'feedback' && method === 'POST') {
      return jsonRes({ status: 'recorded', id: sub[1] });
    }

    if (sub[0] === 'providers' && sub[1] === 'health' && method === 'GET') {
      return jsonRes([
        { provider: 'synthetic_flight_feed', asset_type: 'flight', status: 'healthy', last_ok_at: addHoursIso(now, -1), failure_count: 0, consecutive_failures: 0, updated_at: addHoursIso(now, -1) },
        { provider: 'synthetic_lodging_catalog', asset_type: 'lodging', status: 'healthy', last_ok_at: addHoursIso(now, -1), failure_count: 0, consecutive_failures: 0, updated_at: addHoursIso(now, -1) },
      ]);
    }

    if (sub[0] === 'telemetry' && sub[1] === 'daily-report' && method === 'GET') {
      return jsonRes({
        generated_at: now.toISOString(),
        routes_checked: market.routes.length,
        ticks_ingested: Number(market.summary?.ticks_scanned_today ?? 990),
        deals_detected: Number(market.summary?.deals_detected ?? market.deals.length),
      });
    }

    if (sub[0] === 'holiday-matches' && method === 'POST') {
      return jsonRes([]);
    }

    if (sub[0] === 'routes' && sub[1]) {
      const routeId = sub[1];
      if (method === 'DELETE') return blockedRes('Deleting monitored routes');
      if (sub[2] === 'scan' || sub[2] === 'backfill') return blockedRes('Running live market scrapers');

      const rBundle = market.by_route[routeId];
      if (!rBundle) return errRes('Monitored route not found', 404);

      if (sub.length === 2 && method === 'PATCH') {
        return blockedRes('Modifying monitored route settings');
      }

      if (sub[2] === 'stats' && method === 'GET') {
        const stats = JSON.parse(JSON.stringify(rBundle.stats)) as Record<string, unknown>;
        stats.lowest_ever_date = addDaysIso(now, Number(stats.lowest_ever_offset_days ?? -17));
        stats.currency = currency;
        for (const mf of [
          'current_price_eur',
          'p10_deal_eur',
          'p25_eur',
          'p50_median_eur',
          'p75_eur',
          'p90_peak_eur',
          'lowest_ever_eur',
          'deal_savings_eur',
        ]) {
          if (typeof stats[mf] === 'number') {
            stats[mf] = convertAmount(stats[mf] as number, currency);
          }
        }
        delete stats.lowest_ever_offset_days;
        return jsonRes(stats);
      }

      if (sub[2] === 'history' && method === 'GET') {
        const hist = JSON.parse(JSON.stringify(rBundle.history)) as Record<string, unknown>;
        hist.currency = currency;
        for (const mf of [
          'p10_deal_eur',
          'p25_eur',
          'p50_median_eur',
          'p75_eur',
          'p90_peak_eur',
          'inbound_p10_deal_eur',
          'inbound_p50_median_eur',
          'inbound_p90_peak_eur',
          'lowest_ever_eur',
        ]) {
          if (typeof hist[mf] === 'number') {
            hist[mf] = convertAmount(hist[mf] as number, currency);
          }
        }
        if (hist.corpus && typeof hist.corpus === 'object') {
          const corpus = hist.corpus as Record<string, unknown>;
          for (const mf of ['min_price_eur', 'max_price_eur', 'median_price_eur']) {
            if (typeof corpus[mf] === 'number') {
              corpus[mf] = convertAmount(corpus[mf] as number, currency);
            }
          }
        }
        if (hist.verdict && typeof hist.verdict === 'object') {
          const verdict = hist.verdict as Record<string, unknown>;
          for (const mf of [
            'price_eur',
            'baseline_p10_eur',
            'baseline_p25_eur',
            'baseline_p50_eur',
            'baseline_p75_eur',
            'baseline_p90_eur',
          ]) {
            if (typeof verdict[mf] === 'number') {
              verdict[mf] = convertAmount(verdict[mf] as number, currency);
            }
          }
        }
        hist.points = ((hist.points as Array<Record<string, unknown>>) || []).map((pt) => {
          const d = addDaysIso(now, Number(pt.day_offset ?? 0));
          return {
            ...pt,
            min_price_eur: convertAmount(Number(pt.min_price_eur ?? 0), currency),
            median_price_eur: convertAmount(Number(pt.median_price_eur ?? 0), currency),
            date: d,
            timestamp: `${d}T10:00:00Z`,
          };
        });
        hist.return_points = ((hist.return_points as Array<Record<string, unknown>>) || []).map((pt) => {
          const d = addDaysIso(now, Number(pt.day_offset ?? 0));
          return {
            ...pt,
            min_price_eur: convertAmount(Number(pt.min_price_eur ?? 0), currency),
            median_price_eur: convertAmount(Number(pt.median_price_eur ?? 0), currency),
            date: d,
            timestamp: `${d}T10:00:00Z`,
          };
        });
        hist.forward_curve = ((hist.forward_curve as Array<Record<string, unknown>>) || []).map((pt) => ({
          ...pt,
          price_eur: convertAmount(Number(pt.price_eur ?? 0), currency),
          price_return_eur: convertAmount(Number(pt.price_return_eur ?? 0), currency),
          depart_date: addDaysIso(now, Number(pt.day_offset ?? 7)),
        }));
        hist.lodging_curve = ((hist.lodging_curve as Array<Record<string, unknown>>) || []).map((pt) => ({
          ...pt,
          nightly_price_eur: convertAmount(Number(pt.nightly_price_eur ?? 0), currency),
          total_stay_eur: convertAmount(Number(pt.total_stay_eur ?? 0), currency),
          min_eur: typeof pt.min_eur === 'number' ? convertAmount(pt.min_eur, currency) : pt.min_eur,
          p25_eur: typeof pt.p25_eur === 'number' ? convertAmount(pt.p25_eur, currency) : pt.p25_eur,
          median_eur: typeof pt.median_eur === 'number' ? convertAmount(pt.median_eur, currency) : pt.median_eur,
          p75_eur: typeof pt.p75_eur === 'number' ? convertAmount(pt.p75_eur, currency) : pt.p75_eur,
          date: addDaysIso(now, Number(pt.day_offset ?? 0)),
        }));
        return jsonRes(hist);
      }

      if (sub[2] === 'calendar' && method === 'GET') {
        const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || 4)));
        const view = url.searchParams.get('view') || 'roundtrip';
        const pricing = url.searchParams.get('pricing') || 'flights';
        const histObj = (rBundle.history as Record<string, unknown>) || {};
        const forwardCurve = (histObj.forward_curve as Array<Record<string, unknown>>) || [];
        const lodgingCurve = (histObj.lodging_curve as Array<Record<string, unknown>>) || [];
        return jsonRes(
          buildCalendarMonths(
            rBundle.route_meta as Record<string, unknown>,
            forwardCurve,
            lodgingCurve,
            now,
            months,
            view,
            pricing,
            currency
          )
        );
      }

      if (sub[2] === 'events' && method === 'GET') {
        const events = ((rBundle.events as Array<Record<string, unknown>>) || []).map((e) => ({
          ...e,
          timestamp: addHoursIso(now, Number(e.offset_hours ?? -3)),
        }));
        return jsonRes(events);
      }

      if (sub[2] === 'deals' && method === 'GET') {
        const rDeals = ((rBundle.deals as Array<Record<string, unknown>>) || [])
          .filter((d) => !session.discardedDeals.has(String(d.id)))
          .map((d) => materializeDeal(d, now, currency));
        return jsonRes(rDeals);
      }

      if (sub[2] === 'lodging' && method === 'GET') {
        const routeMeta = (rBundle.route_meta as Record<string, unknown>) || {};
        const requestedNights = Math.min(14, Math.max(1, Number(url.searchParams.get('nights') || routeMeta.min_nights || 3)));
        const checkIn = url.searchParams.get('check_in');
        const lodgingCurve = (((rBundle.history as Record<string, unknown>)?.lodging_curve as Array<Record<string, unknown>>) || []);
        let targetOffset = 14;
        if (checkIn && !Number.isNaN(Date.parse(`${checkIn}T00:00:00Z`))) {
          const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
          const rawOff = Math.round((Date.parse(`${checkIn}T00:00:00Z`) - todayUtcMs) / 86_400_000);
          targetOffset = Math.min(330, Math.max(1, rawOff));
        }
        const matchedLodg =
          lodgingCurve.find((pt) => Number(pt.day_offset ?? 0) === targetOffset) ||
          lodgingCurve[0] ||
          (rBundle.lodging as Record<string, unknown>);
        const nightlyEur = Number(matchedLodg?.nightly_price_eur ?? matchedLodg?.price_per_night_eur ?? routeMeta.hotel_nightly_eur ?? 140);
        const totalEur = Math.round(nightlyEur * requestedNights * 100) / 100;
        const fallbackLodg = (rBundle.lodging as Record<string, unknown>) || {};
        return jsonRes({
          nights: requestedNights,
          price_per_night_eur: convertAmount(nightlyEur, currency),
          total_lodging_eur: convertAmount(totalEur, currency),
          property_name: matchedLodg?.property_name ?? fallbackLodg.property_name ?? routeMeta.hotel_name,
          stars: matchedLodg?.stars ?? fallbackLodg.stars ?? routeMeta.hotel_stars,
          review_score: matchedLodg?.review_score ?? fallbackLodg.review_score ?? routeMeta.hotel_score,
          review_count: matchedLodg?.review_count ?? fallbackLodg.review_count ?? routeMeta.hotel_reviews,
          photo_url: matchedLodg?.photo_url ?? fallbackLodg.photo_url ?? routeMeta.hotel_photo_url ?? null,
          booking_url: null,
          source: 'synthetic_demo_catalog',
          currency,
          value_score: matchedLodg?.value_score ?? fallbackLodg.value_score ?? 91,
          badge: matchedLodg?.badge ?? fallbackLodg.badge ?? 'best_value',
          rank_reasons: (matchedLodg?.rank_reasons as string[]) || (fallbackLodg.rank_reasons as string[]) || [],
        });
      }

      if (sub[2] === 'corpus' && method === 'GET') {
        const corpus = JSON.parse(JSON.stringify((rBundle.history as Record<string, unknown>).corpus || {})) as Record<string, unknown>;
        for (const mf of ['min_price_eur', 'max_price_eur', 'median_price_eur']) {
          if (typeof corpus[mf] === 'number') {
            corpus[mf] = convertAmount(corpus[mf] as number, currency);
          }
        }
        return jsonRes(corpus);
      }
    }
    return null;
  }

  // --- Weather (100% Mocked in Demo Mode) ---
  if (root === 'weather' && sub[0] === 'forecast' && method === 'GET') {
    const city = url.searchParams.get('city') || 'Tokyo';
    const cityLower = city.toLowerCase();
    const qLat = url.searchParams.get('lat') ? Number(url.searchParams.get('lat')) : null;
    const qLon = url.searchParams.get('lon') ? Number(url.searchParams.get('lon')) : null;
    const startStr = url.searchParams.get('start_date');
    const endStr = url.searchParams.get('end_date');

    const profiles: Array<{
      match: string;
      lat: number;
      lon: number;
      tz: string;
      maxC: number;
      minC: number;
      humidity: number;
      wind: number;
      uv: number;
      aqi: number;
      sunrise: string;
      sunset: string;
      pattern: Array<{ code: number; cond: string; icon: string }>;
      advisory: string;
    }> = [
      {
        match: 'tokyo',
        lat: 35.6762,
        lon: 139.6503,
        tz: 'Asia/Tokyo',
        maxC: 16,
        minC: 8,
        humidity: 52,
        wind: 11,
        uv: 4,
        aqi: 24,
        sunrise: '06:34 AM',
        sunset: '04:29 PM',
        pattern: [
          { code: 0, cond: 'Crisp & Sunny', icon: 'clear' },
          { code: 1, cond: 'Partly Cloudy', icon: 'partly-cloudy' },
          { code: 0, cond: 'Clear Sky', icon: 'clear' },
          { code: 2, cond: 'High Clouds', icon: 'partly-cloudy' },
          { code: 61, cond: 'Evening Drizzle', icon: 'rain' },
          { code: 0, cond: 'Clear & Bright', icon: 'clear' },
          { code: 1, cond: 'Sunny Intervals', icon: 'partly-cloudy' },
        ],
        advisory: 'Crisp late-autumn sunshine across Tokyo — pack a light insulated layer for evening shrine walks and observation decks.',
      },
      {
        match: 'madrid',
        lat: 40.4168,
        lon: -3.7038,
        tz: 'Europe/Madrid',
        maxC: 18,
        minC: 7,
        humidity: 46,
        wind: 10,
        uv: 5,
        aqi: 29,
        sunrise: '08:12 AM',
        sunset: '05:51 PM',
        pattern: [
          { code: 0, cond: 'Clear Sky', icon: 'clear' },
          { code: 0, cond: 'Bright Sun', icon: 'clear' },
          { code: 2, cond: 'Partly Cloudy', icon: 'partly-cloudy' },
          { code: 1, cond: 'Mild Breeze', icon: 'partly-cloudy' },
          { code: 0, cond: 'Clear Sky', icon: 'clear' },
        ],
        advisory: 'Dry Castilian sunshine with cool mornings in Madrid — ideal conditions for Retiro Park strolls and rooftop terraces.',
      },
      {
        match: 'london',
        lat: 51.5074,
        lon: -0.1278,
        tz: 'Europe/London',
        maxC: 12,
        minC: 6,
        humidity: 74,
        wind: 18,
        uv: 2,
        aqi: 22,
        sunrise: '07:42 AM',
        sunset: '04:01 PM',
        pattern: [
          { code: 2, cond: 'Partly Cloudy', icon: 'partly-cloudy' },
          { code: 61, cond: 'Light Showers', icon: 'rain' },
          { code: 3, cond: 'Overcast', icon: 'cloudy' },
          { code: 1, cond: 'Sunny Breaks', icon: 'partly-cloudy' },
          { code: 61, cond: 'Passing Rain', icon: 'rain' },
        ],
        advisory: 'Classic brisk Thames weather in London — bring a compact waterproof shell for outdoor markets and riverside walks.',
      },
      {
        match: 'zurich',
        lat: 47.3769,
        lon: 8.5417,
        tz: 'Europe/Zurich',
        maxC: 17,
        minC: 9,
        humidity: 66,
        wind: 12,
        uv: 5,
        aqi: 18,
        sunrise: '06:58 AM',
        sunset: '07:12 PM',
        pattern: [
          { code: 0, cond: 'Crisp Alpine Sky', icon: 'clear' },
          { code: 1, cond: 'Mild & Sunny', icon: 'partly-cloudy' },
          { code: 2, cond: 'Lake Breeze Clouds', icon: 'partly-cloudy' },
          { code: 61, cond: 'Light Passing Shower', icon: 'rain' },
          { code: 0, cond: 'Clear Horizon', icon: 'clear' },
        ],
        advisory: 'Fresh lakeside air in Zurich — plan Limmatquai promenades and Uetliberg ridge viewpoints early, keeping afternoon museum stops flexible.',
      },
      {
        match: 'paris',
        lat: 48.8566,
        lon: 2.3522,
        tz: 'Europe/Paris',
        maxC: 14,
        minC: 7,
        humidity: 66,
        wind: 14,
        uv: 3,
        aqi: 27,
        sunrise: '08:16 AM',
        sunset: '04:58 PM',
        pattern: [
          { code: 2, cond: 'Partly Cloudy', icon: 'partly-cloudy' },
          { code: 0, cond: 'Crisp Sunlight', icon: 'clear' },
          { code: 61, cond: 'Light Drizzle', icon: 'rain' },
          { code: 1, cond: 'Clear Intervals', icon: 'partly-cloudy' },
          { code: 0, cond: 'Clear Sky', icon: 'clear' },
        ],
        advisory: 'Mild Seine valley weather in Paris — pack a trench coat for evening Left Bank strolls.',
      },
      {
        match: 'lisbon',
        lat: 38.7223,
        lon: -9.1393,
        tz: 'Europe/Lisbon',
        maxC: 19,
        minC: 12,
        humidity: 61,
        wind: 16,
        uv: 5,
        aqi: 19,
        sunrise: '07:31 AM',
        sunset: '05:22 PM',
        pattern: [
          { code: 0, cond: 'Atlantic Sun', icon: 'clear' },
          { code: 1, cond: 'Breezy & Clear', icon: 'partly-cloudy' },
          { code: 0, cond: 'Clear Sky', icon: 'clear' },
          { code: 2, cond: 'Coastal Clouds', icon: 'partly-cloudy' },
          { code: 0, cond: 'Golden Sunshine', icon: 'clear' },
        ],
        advisory: 'Bright Atlantic light across Lisbon — great visibility for miradouros and tramway climbs.',
      },
    ];

    const prof = profiles.find((p) => cityLower.includes(p.match)) || {
      match: 'default',
      lat: qLat ?? 35.68,
      lon: qLon ?? 139.76,
      tz: 'UTC',
      maxC: 20,
      minC: 12,
      humidity: 58,
      wind: 12,
      uv: 4,
      aqi: 25,
      sunrise: '06:58 AM',
      sunset: '06:24 PM',
      pattern: [
        { code: 0, cond: 'Clear Sky', icon: 'clear' },
        { code: 2, cond: 'Partly Cloudy', icon: 'partly-cloudy' },
        { code: 61, cond: 'Light Rain', icon: 'rain' },
      ],
      advisory: `Favorable walking conditions in ${city} with mild afternoon warmth.`,
    };

    const startDate = startStr && !Number.isNaN(Date.parse(`${startStr}T00:00:00Z`))
      ? new Date(`${startStr}T00:00:00Z`)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let numDays = 7;
    if (endStr && !Number.isNaN(Date.parse(`${endStr}T00:00:00Z`))) {
      const endDate = new Date(`${endStr}T00:00:00Z`);
      const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
      numDays = Math.min(14, Math.max(3, diff));
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const cardinals = ['WSW', 'SW', 'WNW', 'NW', 'SSE', 'SSW', 'W'];
    const degs = [245, 225, 290, 315, 160, 205, 270];

    const forecastDays = Array.from({ length: numDays }, (_, i) => {
      const dt = new Date(startDate.getTime() + i * 86_400_000);
      const slot = prof.pattern[i % prof.pattern.length];
      const tempDelta = [0, 1, -1, 2, -2, 1, 0][i % 7];
      const uvVal = Math.max(1, Math.min(11, prof.uv + (slot.icon === 'rain' ? -2 : slot.icon === 'clear' ? 1 : 0)));
      const humVal = Math.min(92, Math.max(35, prof.humidity + (slot.icon === 'rain' ? 14 : (i % 3) * 3 - 3)));
      const windVal = Math.max(5, prof.wind + ((i * 3) % 7) - 2);
      const visVal = slot.icon === 'rain' ? 9.5 : slot.icon === 'partly-cloudy' ? 14.5 : 18.0;
      const aqiVal = Math.max(12, prof.aqi + ((i * 5) % 11) - 4);

      return {
        date: dt.toISOString().slice(0, 10),
        day_name: dayNames[dt.getUTCDay()],
        weather_code: slot.code,
        condition: slot.cond,
        icon_type: slot.icon,
        temp_max_c: prof.maxC + tempDelta,
        temp_min_c: prof.minC + (i % 2 === 0 ? 0 : 1),
        highlights: {
          uv_index: uvVal,
          uv_status: uvVal >= 8 ? 'Very High' : uvVal >= 6 ? 'High' : uvVal >= 3 ? 'Moderate' : 'Low',
          wind_speed_kmh: windVal,
          wind_direction_deg: degs[i % degs.length],
          wind_direction_cardinal: cardinals[i % cardinals.length],
          sunrise: prof.sunrise,
          sunset: prof.sunset,
          humidity_pct: humVal,
          humidity_status: humVal > 72 ? 'Humid' : humVal < 45 ? 'Crisp' : 'Comfortable',
          visibility_km: visVal,
          visibility_status: visVal >= 14 ? 'Excellent' : 'Good',
          aqi: aqiVal,
          aqi_status: aqiVal <= 50 ? 'Good' : 'Moderate',
        },
      };
    });

    const firstDay = forecastDays[0];
    return jsonRes({
      city,
      latitude: Number.isFinite(qLat) && qLat !== null ? qLat : prof.lat,
      longitude: Number.isFinite(qLon) && qLon !== null ? qLon : prof.lon,
      timezone: prof.tz,
      current_temp_c: Math.round((firstDay.temp_max_c + firstDay.temp_min_c) / 2) + 2,
      current_condition: firstDay.condition,
      current_weather_code: firstDay.weather_code,
      current_icon_type: firstDay.icon_type,
      forecast_days: forecastDays,
      travel_advisory: prof.advisory,
    });
  }

  // --- Currency ---
  if (root === 'currency') {
    if (sub[0] === 'rates' && method === 'GET') {
      const base = (url.searchParams.get('base') || 'EUR').toUpperCase();
      const baseRate = FX_FROM_EUR[base] || 1.0;
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(FX_FROM_EUR)) {
        rates[k] = Math.round((v / baseRate) * 10000) / 10000;
      }
      return jsonRes({ base, rates, source: 'ECB_Frankfurter' });
    }
    if (sub[0] === 'destination-currency' && method === 'GET') {
      const dest = (url.searchParams.get('destination') || '').toLowerCase();
      if (dest.includes('tokyo') || dest.includes('japan')) return jsonRes({ destination: dest, country_code: 'JP', currency: 'JPY' });
      if (dest.includes('london') || dest.includes('uk')) return jsonRes({ destination: dest, country_code: 'GB', currency: 'GBP' });
      if (dest.includes('zurich') || dest.includes('zürich') || dest.includes('switzerland')) return jsonRes({ destination: dest, country_code: 'CH', currency: 'CHF' });
      return jsonRes({ destination: dest, country_code: 'ES', currency: 'EUR' });
    }
  }

  // --- Calendar & Locations ---
  if (root === 'calendar') {
    if (sub[0] === 'countries') {
      return jsonRes([
        { code: 'ES', name: 'Spain' },
        { code: 'GB', name: 'United Kingdom' },
        { code: 'FR', name: 'France' },
        { code: 'JP', name: 'Japan' },
        { code: 'CH', name: 'Switzerland' },
        { code: 'US', name: 'United States' },
      ]);
    }
    if (sub[0] === 'holidays') {
      const year = Number(url.searchParams.get('year') || now.getUTCFullYear());
      const country = (url.searchParams.get('country') || 'ES').toUpperCase();
      const COUNTRY_NAMES: Record<string, string> = {
        ES: 'Spain',
        GB: 'United Kingdom',
        FR: 'France',
        JP: 'Japan',
        CH: 'Switzerland',
        US: 'United States',
      };
      const FIXED_HOLIDAYS: Record<string, Array<[string, string]>> = {
        ES: [
          ['01-01', 'Año Nuevo'],
          ['01-06', 'Epifanía del Señor'],
          ['05-01', 'Fiesta del Trabajo'],
          ['08-15', 'Asunción de la Virgen'],
          ['10-12', 'Fiesta Nacional de España'],
          ['11-01', 'Todos los Santos'],
          ['12-06', 'Día de la Constitución'],
          ['12-08', 'Inmaculada Concepción'],
          ['12-25', 'Navidad'],
        ],
        GB: [
          ['01-01', "New Year's Day"],
          ['05-04', 'Early May Bank Holiday'],
          ['05-25', 'Spring Bank Holiday'],
          ['08-31', 'Summer Bank Holiday'],
          ['12-25', 'Christmas Day'],
          ['12-26', 'Boxing Day'],
        ],
        FR: [
          ['01-01', 'Jour de l’an'],
          ['05-01', 'Fête du Travail'],
          ['05-08', 'Victoire 1945'],
          ['07-14', 'Fête nationale'],
          ['08-15', 'Assomption'],
          ['11-01', 'Toussaint'],
          ['11-11', 'Armistice 1918'],
          ['12-25', 'Noël'],
        ],
        JP: [
          ['01-01', 'New Year’s Day'],
          ['02-11', 'National Foundation Day'],
          ['04-29', 'Shōwa Day'],
          ['05-03', 'Constitution Memorial Day'],
          ['05-04', 'Greenery Day'],
          ['05-05', 'Children’s Day'],
          ['11-03', 'Culture Day'],
          ['11-23', 'Labor Thanksgiving Day'],
        ],
        CH: [
          ['01-01', 'Neujahr'],
          ['08-01', 'Bundesfeier'],
          ['12-25', 'Weihnachten'],
          ['12-26', 'Stephanstag'],
        ],
        US: [
          ['01-01', "New Year's Day"],
          ['06-19', 'Juneteenth'],
          ['07-04', 'Independence Day'],
          ['11-11', 'Veterans Day'],
          ['12-25', 'Christmas Day'],
        ],
      };
      const entries = (FIXED_HOLIDAYS[country] || FIXED_HOLIDAYS.ES).map(([mmdd, name]) => ({
        date: `${year}-${mmdd}`,
        name,
      }));
      return jsonRes({
        country,
        country_name: COUNTRY_NAMES[country] || country,
        year,
        subdivision: null,
        holidays: entries,
        total: entries.length,
      });
    }
  }

  if (root === 'locations') {
    if (sub[0] === 'resolve-airport') {
      const city = (url.searchParams.get('city') || '').trim();
      const countryCode = url.searchParams.get('country_code') || null;
      if (!city) {
        return jsonRes({ iata: null, name: null, city: '' });
      }
      const ap = resolveDemoAirportForCity(city, countryCode);
      if (ap) {
        return jsonRes({
          iata: ap.iata,
          icao: ap.icao,
          name: ap.name,
          city: ap.city,
          country: ap.country,
          latitude: ap.latitude,
          longitude: ap.longitude,
          distance_km: ap.distance_km,
        });
      }
      const matches = searchDemoLocations(city, 1);
      if (matches.length > 0) {
        const first = matches[0];
        return jsonRes({
          iata: first.airport_iata,
          icao: first.airport_icao,
          name: first.airport_name,
          city: first.city,
          country: first.country,
          latitude: first.latitude,
          longitude: first.longitude,
          distance_km: first.distance_km,
        });
      }
      return jsonRes({ iata: null, name: null, city });
    }

    const q = (url.searchParams.get('q') || url.searchParams.get('city') || '').trim();
    const rawLimit = Number(url.searchParams.get('limit') || '8');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.floor(rawLimit))) : 8;
    return jsonRes(searchDemoLocations(q, limit));
  }

  // --- System Admin (Read-Only for rendering behind DemoFeatureGate, all writes 403) ---
  if (root === 'system') {
    if (method !== 'GET') {
      return blockedRes('System and admin settings');
    }
    if (sub[0] === 'llm' && sub[1] === 'config') {
      return jsonRes({
        provider: 'google_genai',
        model: 'gemini-2.5-pro',
        base_url: null,
        api_key_configured: true,
        supported_providers: {
          google_genai: { name: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
          anthropic: { name: 'Anthropic Claude', models: ['claude-sonnet-4'] },
          openai: { name: 'OpenAI', models: ['gpt-4o'] },
        },
        configured_providers: { google_genai: true },
      });
    }
    if (sub[0] === 'settings' && sub[1]) {
      const domain = sub[1];
      if (domain === 'engine') {
        return jsonRes({
          domain,
          config: {
            default_max_walking_km: 12.0,
            pacing_tempo: 'balanced',
            meal_windows: { breakfast: 45, lunch: 60, dinner: 90 },
            attraction_burnout_limit: 6,
            deal_scraper_cadence_hours: 24,
            price_alert_threshold_pct: 15.0,
          },
        });
      }
      return jsonRes({ domain, config: {} });
    }
    if (sub[0] === 'update' && sub[1] === 'status') {
      return jsonRes({
        current_version: '2.0.0-demo',
        latest_version: '2.0.0-demo',
        update_available: false,
        auto_update_enabled: false,
        channel: 'stable',
      });
    }
    if (sub[0] === 'secrets') {
      return jsonRes({
        secrets: {
          aviasales: { secret_type: 'aviasales', configured: false, masked_preview: null },
        },
      });
    }
    if (sub[0] === 'taste-profile') {
      return jsonRes({
        version: 4,
        event_count: 38,
        dimension: 768,
        category_posteriors: (session.user.preferences as Record<string, unknown>)?.tag_affinities || {},
        pace: 'balanced',
        budget_tier: 'balanced',
      });
    }
    return jsonRes({ status: 'ok' });
  }

  return null;
}
