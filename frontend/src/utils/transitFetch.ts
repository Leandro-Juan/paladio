import { apiFetch } from '@/utils/api';
import { OptimizationResult, RouteItineraryData, ScheduledPoi, TransitLeg } from '@/types/domain';

interface DirectionsApiResponse {
  primary_leg?: TransitLeg | null;
}

export interface TransitPoiLike {
  name?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  } | null;
}

function getPoiCoords(poi?: TransitPoiLike | null): { lat: number; lng: number; name: string } | null {
  if (!poi) return null;
  const lat =
    poi.location?.latitude ??
    (poi as unknown as { lat?: number })?.lat ??
    (poi as unknown as { latitude?: number })?.latitude;
  const lng =
    poi.location?.longitude ??
    (poi as unknown as { lng?: number })?.lng ??
    (poi as unknown as { longitude?: number })?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }
  return { lat, lng, name: poi.name || 'Waypoint' };
}

/**
 * Fetches point-to-point transit leg for a specific stop index from its predecessor
 * in `path` via `/trips/:id/transit/directions` (or `/transit/directions`).
 */
export async function fetchTransitLegForPair(
  originPoi: TransitPoiLike | null | undefined,
  destPoi: TransitPoiLike | null | undefined,
  city: string,
  tripId?: string
): Promise<TransitLeg | null> {
  const orig = getPoiCoords(originPoi);
  const dest = getPoiCoords(destPoi);
  if (!orig || !dest) return null;
  if (Math.abs(orig.lat - dest.lat) < 1e-6 && Math.abs(orig.lng - dest.lng) < 1e-6) {
    return null;
  }

  const endpoint = tripId ? `/trips/${tripId}/transit/directions` : '/transit/directions';
  const res = await apiFetch<DirectionsApiResponse>(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      origin: { name: orig.name, lat: orig.lat, lon: orig.lng },
      destination: { name: dest.name, lat: dest.lat, lon: dest.lng },
      city,
      date_time_type: 1,
    }),
  });
  return res?.primary_leg ?? null;
}

/**
 * Hydrates `transit_from_previous` for specific target stop indices in a day's path,
 * returning a cloned itinerary with updated transit legs (or null if nothing changed).
 */
export async function hydrateDayTransitIndices<T extends RouteItineraryData | OptimizationResult>(
  baseItinerary: T,
  dayNum: number,
  indices: number[],
  city: string,
  tripId?: string
): Promise<T | null> {
  const uniqueIndices = Array.from(new Set(indices)).filter((idx) => idx > 0);
  if (uniqueIndices.length === 0) return null;

  const targetDay = baseItinerary.days?.find((d) => (d.day ?? 1) === dayNum);
  const path = targetDay?.itinerary?.path;
  if (!Array.isArray(path) || path.length < 2) return null;

  const updates = await Promise.all(
    uniqueIndices.map(async (idx) => {
      if (idx <= 0 || idx >= path.length) return { idx, leg: null };
      try {
        const leg = await fetchTransitLegForPair(path[idx - 1]?.poi, path[idx]?.poi, city, tripId);
        return { idx, leg };
      } catch {
        return { idx, leg: null };
      }
    })
  );

  const validUpdates = updates.filter((u) => u.leg !== null);
  if (validUpdates.length === 0) return null;

  const updatedItin: T = JSON.parse(JSON.stringify(baseItinerary));
  const updatedDay = updatedItin.days?.find((d) => (d.day ?? 1) === dayNum);
  if (!updatedDay?.itinerary?.path) return null;

  for (const { idx, leg } of validUpdates) {
    const stop = updatedDay.itinerary.path[idx] as ScheduledPoi | undefined;
    if (stop && leg) {
      stop.transit_from_previous = leg;
      stop.travel_time_mins_from_prev = leg.duration_mins;
      stop.cost_from_prev = leg.cost_eur;
    }
  }
  return updatedItin;
}
