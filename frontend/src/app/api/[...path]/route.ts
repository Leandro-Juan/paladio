import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDemoSession, persistDemoSession } from '@/server/demoStore';
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
const DIRTY_COOKIE = 'paladio_demo_dirty';

function isReadOnlyPost(root: string, segments: string[]): boolean {
  if (root === 'auth' && (segments[1] === 'login' || segments[1] === 'demo-login')) {
    return true;
  }
  if (root === 'market' && segments[1] === 'holiday-matches') {
    return true;
  }
  if (root === 'pois' && (segments[1] === 'batch-photos' || segments[2] === 'translate')) {
    return true;
  }
  if (root === 'transit' && segments[1] === 'directions') {
    return true;
  }
  if (root === 'trips' && segments[2] === 'transit' && segments[3] === 'directions') {
    return true;
  }
  if (root === 'demo' && segments[1] === 'reset') {
    return true;
  }
  return false;
}

async function dispatch(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const { path: rawSegments } = await context.params;
    const segments = (rawSegments || []).filter(Boolean);
    const rawMethod = req.method.toUpperCase();
    const method = rawMethod === 'HEAD' ? 'GET' : rawMethod;

    const sidCookie = req.cookies.get(SID_COOKIE)?.value || null;
    const resetCookieRaw = req.cookies.get(RESET_COOKIE)?.value;
    const resetCookieTs = resetCookieRaw ? Number(resetCookieRaw) : null;
    const dirtyCookie = req.cookies.get(DIRTY_COOKIE)?.value === '1';

    const { session, baseline, wasReset, isDirty } = await getOrCreateDemoSession(
      sidCookie,
      Number.isFinite(resetCookieTs) ? resetCookieTs : null,
      dirtyCookie
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

    const isResetRequest = root === 'demo' && segments[1] === 'reset' && method === 'POST';
    const didMutate =
      !isResetRequest &&
      method !== 'GET' &&
      !(method === 'POST' && isReadOnlyPost(root, segments)) &&
      response.status >= 200 &&
      response.status < 300;

    if (didMutate) {
      await persistDemoSession(session);
    }

    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };

    // Persist session identifier & reset deadline in HttpOnly cookies
    response.cookies.set(SID_COOKIE, session.sid, {
      ...cookieOpts,
      maxAge: 60 * 60 * 24,
    });
    response.cookies.set(RESET_COOKIE, String(session.nextResetAt), {
      ...cookieOpts,
      maxAge: 60 * 60 * 24,
    });

    if (isResetRequest || (!didMutate && (wasReset || (!isDirty && dirtyCookie)))) {
      response.cookies.set(DIRTY_COOKIE, '', {
        ...cookieOpts,
        maxAge: 0,
      });
    } else if (didMutate) {
      response.cookies.set(DIRTY_COOKIE, '1', {
        ...cookieOpts,
        maxAge: Math.max(60, Math.ceil((session.nextResetAt - Date.now()) / 1000)),
      });
    }

    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Demo API internal error';
    return errRes(msg, 500);
  }
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
