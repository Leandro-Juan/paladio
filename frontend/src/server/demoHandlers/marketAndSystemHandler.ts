import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { addDaysIso, addHoursIso, DemoSnapshotRaw } from '../demoSnapshotLoader';
import { DemoSessionState, resetDemoSession } from '../demoStore';
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
  copy.depart_date = addDaysIso(now, Number(copy.depart_offset_days ?? 20));
  copy.return_date = addDaysIso(now, Number(copy.return_offset_days ?? 26));
  copy.detected_at = addHoursIso(now, Number(copy.detected_offset_hours ?? -3));
  copy.currency = currency;
  delete copy.depart_offset_days;
  delete copy.return_offset_days;
  delete copy.detected_offset_hours;
  return copy;
}

function buildCalendarMonths(
  routeMeta: Record<string, unknown>,
  now: Date,
  monthsCount: number,
  pricing: string,
  currency: string
) {
  const months: Array<Record<string, unknown>> = [];
  const baseFlight = Number(routeMeta.base_flight_eur || 250);
  const hotelNightly = Number(routeMeta.hotel_nightly_eur || 140);
  const nights = Number(routeMeta.min_nights || 5);
  const p10 = Number(routeMeta.p10_eur || baseFlight * 1.05);
  const p50 = Number(routeMeta.p50_eur || baseFlight * 1.4);
  const p90 = Number(routeMeta.p90_eur || baseFlight * 1.9);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  for (let m = 0; m < monthsCount; m++) {
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
    const year = firstDay.getUTCFullYear();
    const month = firstDay.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days: Array<Record<string, unknown>> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(year, month - 1, d));
      const iso = dt.toISOString().slice(0, 10);
      const isPast = dt.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      if (isPast) {
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

      const wave = Math.sin(d * 0.48 + m * 1.3);
      const flightPrice = Math.round(baseFlight + Math.max(0, wave * (p50 - baseFlight) * 0.9));
      const tier = flightPrice <= p10 * 1.05 ? 'deal' : flightPrice <= p50 * 0.95 ? 'fair' : flightPrice <= p50 * 1.25 ? 'standard' : 'peak';
      const totalPrice = pricing === 'package' ? flightPrice * Number(routeMeta.travelers || 2) + hotelNightly * nights : flightPrice;
      const retDt = new Date(dt.getTime() + nights * 86_400_000);
      days.push({
        date: iso,
        day: d,
        weekday: (dt.getUTCDay() + 6) % 7,
        price_eur: convertAmount(totalPrice, currency),
        price_tier: tier,
        carrier: routeMeta.airline,
        flight_number: routeMeta.flight_no,
        duration_mins: routeMeta.duration_mins,
        departure_time: '10:15',
        booking_url: null,
        is_holiday: d === 15 || d === 1,
        nights,
        return_date: retDt.toISOString().slice(0, 10),
        outbound_flight: {
          carrier: routeMeta.airline,
          flight_number: routeMeta.flight_no,
          duration_mins: routeMeta.duration_mins,
          departure_time: '10:15',
          booking_url: null,
          price_eur: convertAmount(Math.round(flightPrice * 0.52), currency),
        },
        return_flight: {
          carrier: routeMeta.airline,
          flight_number: routeMeta.return_flight_no,
          duration_mins: routeMeta.duration_mins,
          departure_time: '11:40',
          booking_url: null,
          price_eur: convertAmount(Math.round(flightPrice * 0.48), currency),
        },
        lodging: {
          nights,
          price_per_night_eur: convertAmount(hotelNightly, currency),
          total_lodging_eur: convertAmount(hotelNightly * nights, currency),
          property_name: routeMeta.hotel_name,
          stars: routeMeta.hotel_stars,
          review_score: routeMeta.hotel_score,
          review_count: routeMeta.hotel_reviews,
          source: 'booking_curated',
          currency,
        },
      });
    }

    months.push({
      year,
      month,
      month_name: monthNames[month - 1],
      days,
    });
  }

  return {
    months,
    route_label: `${String(routeMeta.origin_iata)} → ${String(routeMeta.destination_code)}`,
    p10_deal_eur: convertAmount(p10, currency),
    p50_median_eur: convertAmount(p50, currency),
    p90_peak_eur: convertAmount(p90, currency),
    view: 'roundtrip',
    pricing,
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

    if (sub[0] === 'summary' && method === 'GET') {
      return jsonRes(market.summary);
    }

    if (sub[0] === 'routes' && sub.length === 1) {
      if (method === 'GET') {
        const out = market.routes.map((r) => {
          const copy = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
          copy.earliest_date = addDaysIso(now, Number(copy.earliest_offset_days ?? 14));
          copy.latest_date = addDaysIso(now, Number(copy.latest_offset_days ?? 120));
          copy.last_scanned_at = addHoursIso(now, -2);
          copy.currency = currency;
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
        { provider: 'skyscanner_live', asset_type: 'flight', status: 'healthy', last_ok_at: addHoursIso(now, -1), failure_count: 0, consecutive_failures: 0, updated_at: addHoursIso(now, -1) },
        { provider: 'booking_curated', asset_type: 'lodging', status: 'healthy', last_ok_at: addHoursIso(now, -1), failure_count: 0, consecutive_failures: 0, updated_at: addHoursIso(now, -1) },
      ]);
    }

    if (sub[0] === 'telemetry' && sub[1] === 'daily-report' && method === 'GET') {
      return jsonRes({
        generated_at: now.toISOString(),
        routes_checked: 3,
        ticks_ingested: 186,
        deals_detected: 4,
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
        stats.lowest_ever_date = addDaysIso(now, Number(stats.lowest_ever_offset_days ?? -19));
        stats.currency = currency;
        delete stats.lowest_ever_offset_days;
        return jsonRes(stats);
      }

      if (sub[2] === 'history' && method === 'GET') {
        const hist = JSON.parse(JSON.stringify(rBundle.history)) as Record<string, unknown>;
        hist.currency = currency;
        hist.points = ((hist.points as Array<Record<string, unknown>>) || []).map((pt) => {
          const d = addDaysIso(now, Number(pt.day_offset ?? 0));
          return { ...pt, date: d, timestamp: `${d}T10:00:00Z` };
        });
        hist.return_points = ((hist.return_points as Array<Record<string, unknown>>) || []).map((pt) => {
          const d = addDaysIso(now, Number(pt.day_offset ?? 0));
          return { ...pt, date: d, timestamp: `${d}T10:00:00Z` };
        });
        hist.forward_curve = ((hist.forward_curve as Array<Record<string, unknown>>) || []).map((pt) => ({
          ...pt,
          depart_date: addDaysIso(now, Number(pt.day_offset ?? 7)),
        }));
        hist.lodging_curve = ((hist.lodging_curve as Array<Record<string, unknown>>) || []).map((pt) => ({
          ...pt,
          date: addDaysIso(now, Number(pt.day_offset ?? 0)),
        }));
        return jsonRes(hist);
      }

      if (sub[2] === 'calendar' && method === 'GET') {
        const months = Math.min(6, Math.max(1, Number(url.searchParams.get('months') || 4)));
        const pricing = url.searchParams.get('pricing') || 'package';
        return jsonRes(buildCalendarMonths(rBundle.route_meta as Record<string, unknown>, now, months, pricing, currency));
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
        return jsonRes(rBundle.lodging);
      }

      if (sub[2] === 'corpus' && method === 'GET') {
        return jsonRes((rBundle.history as Record<string, unknown>).corpus);
      }
    }
    return null;
  }

  // --- Weather ---
  if (root === 'weather' && sub[0] === 'forecast' && method === 'GET') {
    const city = url.searchParams.get('city') || 'Tokyo';
    const baseTemp = city.toLowerCase().includes('singapore') ? 30 : city.toLowerCase().includes('madrid') ? 21 : city.toLowerCase().includes('london') ? 15 : 18;
    const forecastDays = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(now.getTime() + i * 86_400_000);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        date: dt.toISOString().slice(0, 10),
        day_name: dayNames[dt.getUTCDay()],
        weather_code: i === 2 ? 2 : i === 4 ? 61 : 0,
        condition: i === 2 ? 'Partly Cloudy' : i === 4 ? 'Light Rain' : 'Clear Sky',
        icon_type: i === 2 ? 'partly-cloudy' : i === 4 ? 'rain' : 'clear',
        temp_max_c: baseTemp + 2 + (i % 3),
        temp_min_c: baseTemp - 5 + (i % 2),
        highlights: {
          uv_index: 4.5,
          uv_status: 'Moderate',
          wind_speed_kmh: 12 + (i % 5),
          wind_direction_deg: 220,
          wind_direction_cardinal: 'SW',
          sunrise: '06:58',
          sunset: '18:24',
          humidity_pct: 58,
          humidity_status: 'Comfortable',
          visibility_km: 16.0,
          visibility_status: 'Excellent',
          aqi: 26,
          aqi_status: 'Good',
        },
      };
    });
    return jsonRes({
      city,
      latitude: 35.68,
      longitude: 139.76,
      timezone: 'UTC',
      current_temp_c: baseTemp,
      current_condition: 'Clear Sky',
      current_weather_code: 0,
      current_icon_type: 'clear',
      forecast_days: forecastDays,
      travel_advisory: `Favorable walking conditions in ${city} with mild afternoon warmth.`,
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
      if (dest.includes('singapore')) return jsonRes({ destination: dest, country_code: 'SG', currency: 'SGD' });
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
        { code: 'SG', name: 'Singapore' },
        { code: 'US', name: 'United States' },
      ]);
    }
    if (sub[0] === 'holidays') {
      const year = Number(url.searchParams.get('year') || now.getUTCFullYear());
      return jsonRes({
        country: url.searchParams.get('country') || 'ES',
        country_name: 'Spain',
        year,
        subdivision: null,
        holidays: [],
        total: 0,
      });
    }
  }

  if (root === 'locations') {
    const cities = [
      { city: 'Madrid', country: 'ES', country_name: 'Spain', display_name: 'Madrid, Spain', airport_iata: 'MAD', airport_name: 'Adolfo Suárez Madrid-Barajas', latitude: 40.4168, longitude: -3.7038 },
      { city: 'Tokyo', country: 'JP', country_name: 'Japan', display_name: 'Tokyo, Japan', airport_iata: 'HND', airport_name: 'Tokyo Haneda International', latitude: 35.6762, longitude: 139.6503 },
      { city: 'London', country: 'GB', country_name: 'United Kingdom', display_name: 'London, United Kingdom', airport_iata: 'LHR', airport_name: 'London Heathrow', latitude: 51.5074, longitude: -0.1278 },
      { city: 'Singapore', country: 'SG', country_name: 'Singapore', display_name: 'Singapore', airport_iata: 'SIN', airport_name: 'Singapore Changi', latitude: 1.3521, longitude: 103.8198 },
      { city: 'Paris', country: 'FR', country_name: 'France', display_name: 'Paris, France', airport_iata: 'CDG', airport_name: 'Paris Charles de Gaulle', latitude: 48.8566, longitude: 2.3522 },
      { city: 'Lisbon', country: 'PT', country_name: 'Portugal', display_name: 'Lisbon, Portugal', airport_iata: 'LIS', airport_name: 'Lisbon Humberto Delgado', latitude: 38.7223, longitude: -9.1393 },
    ];
    if (sub[0] === 'resolve-airport') {
      const q = (url.searchParams.get('city') || '').toLowerCase();
      const match = cities.find((c) => c.city.toLowerCase().includes(q) || c.airport_iata.toLowerCase() === q) || cities[0];
      return jsonRes({ city: match.city, iata: match.airport_iata, airport_name: match.airport_name });
    }
    const q = (url.searchParams.get('q') || url.searchParams.get('city') || '').toLowerCase();
    const filtered = q ? cities.filter((c) => c.city.toLowerCase().includes(q) || c.airport_iata.toLowerCase().includes(q)) : cities;
    return jsonRes(filtered);
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
