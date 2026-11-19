import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDemoSession } from '@/server/demoStore';
import { handleTripsRoutes } from '@/server/demoHandlers/tripsHandler';
import {
  handlePoisRoutes,
  handleTransitRoutes,
  handleTripScopedTransit,
} from '@/server/demoHandlers/poisAndTransitHandler';
import { handleMarketAndSystemRoutes } from '@/server/demoHandlers/marketAndSystemHandler';
import { errRes } from '@/server/demoHandlers/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SID_COOKIE = 'paladio_demo_sid';
const RESET_COOKIE = 'paladio_demo_reset';

async function dispatch(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path: rawSegments } = await context.params;
  const segments = (rawSegments || []).filter(Boolean);
  const rawMethod = req.method.toUpperCase();
  const method = rawMethod === 'HEAD' ? 'GET' : rawMethod;

  const sidCookie = req.cookies.get(SID_COOKIE)?.value || null;
  const resetCookieRaw = req.cookies.get(RESET_COOKIE)?.value;
  const resetCookieTs = resetCookieRaw ? Number(resetCookieRaw) : null;

  const { session, baseline } = await getOrCreateDemoSession(
    sidCookie,
    Number.isFinite(resetCookieTs) ? resetCookieTs : null
  );

  let response: NextResponse | null = null;
  const root = segments[0] || '';

  if (root === 'trips') {
    // Check /api/trips/{tripId}/transit/...
    if (
      segments.length >= 3 &&
      segments[1] !== 'transit' &&
      segments[1] !== 'saved-collections' &&
      segments[2] === 'transit'
    ) {
      response = await handleTripScopedTransit(
        req,
        method,
        segments[1],
        segments.slice(3),
        session,
        baseline
      );
    } else {
      response = await handleTripsRoutes(
        req,
        method,
        segments.slice(1),
        session,
        baseline
      );
    }
  } else if (root === 'pois') {
    response = await handlePoisRoutes(req, method, segments.slice(1), session, baseline);
  } else if (root === 'transit') {
    response = await handleTransitRoutes(req, method, segments.slice(1), session, baseline);
  } else {
    response = await handleMarketAndSystemRoutes(req, method, segments, session, baseline);
  }

  if (!response) {
    response = errRes(`Endpoint not found: /api/${segments.join('/')}`, 404);
  }

  // Persist session identifier & reset deadline in HttpOnly cookies
  response.cookies.set(SID_COOKIE, session.sid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  response.cookies.set(RESET_COOKIE, String(session.nextResetAt), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });

  return response;
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, context);
}

export async function HEAD(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, context);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, context);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, context);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, context);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, context);
}
