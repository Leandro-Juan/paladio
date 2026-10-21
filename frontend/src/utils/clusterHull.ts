export interface LatLngPoint {
  lat: number;
  lng: number;
}

/**
 * Computes the 2D centroid of a set of coordinates.
 */
export function computeCentroid(points: LatLngPoint[]): LatLngPoint {
  const valid = points.filter(
    (p) => typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng)
  );
  if (valid.length === 0) return { lat: 0, lng: 0 };
  const sumLat = valid.reduce((s, p) => s + p.lat, 0);
  const sumLng = valid.reduce((s, p) => s + p.lng, 0);
  return {
    lat: sumLat / valid.length,
    lng: sumLng / valid.length,
  };
}

/**
 * Computes a comfortable, padded convex hull polygon around a cluster of POIs.
 * - For 1 point: generates a smooth 12-vertex circle.
 * - For 2 points: generates a rounded pill/capsule bounding polygon.
 * - For 3+ points: runs Andrew's Monotone Chain 2D Convex Hull and expands
 *   vertices outward from the centroid for padding.
 * 
 * Returns an array of [lat, lng] tuples suitable for Leaflet <Polygon positions={...} />.
 */
export function computeClusterPolygon(points: LatLngPoint[]): [number, number][] {
  const valid = points.filter(
    (p) => typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng)
  );
  if (valid.length === 0) return [];

  const centroid = computeCentroid(valid);

  // 1. Single Point: Regular 12-sided polygon
  if (valid.length === 1) {
    const radiusLat = 0.0035;
    const radiusLng = 0.005;
    const poly: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      poly.push([
        centroid.lat + radiusLat * Math.sin(angle),
        centroid.lng + radiusLng * Math.cos(angle),
      ]);
    }
    return poly;
  }

  // 2. Two Points: Capsule / rectangle with padding
  if (valid.length === 2) {
    const dLat = valid[1].lat - valid[0].lat;
    const dLng = valid[1].lng - valid[0].lng;
    const dist = Math.hypot(dLat, dLng) || 0.005;

    const perpLat = (-dLng / dist) * 0.0035;
    const perpLng = (dLat / dist) * 0.0045;
    const extLat = (dLat / dist) * 0.0035;
    const extLng = (dLng / dist) * 0.0045;

    return [
      [valid[0].lat - extLat + perpLat, valid[0].lng - extLng + perpLng],
      [valid[1].lat + extLat + perpLat, valid[1].lng + extLng + perpLng],
      [valid[1].lat + extLat - perpLat, valid[1].lng + extLng - perpLng],
      [valid[0].lat - extLat - perpLat, valid[0].lng - extLng - perpLng],
    ];
  }

  // 3. Deduplicate coordinates
  const uniquePoints: LatLngPoint[] = [];
  const seen = new Set<string>();
  for (const p of valid) {
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(p);
    }
  }

  if (uniquePoints.length < 3) {
    return computeClusterPolygon(uniquePoints);
  }

  // 4. Sort points lexicographically by longitude then latitude
  uniquePoints.sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));

  const crossProduct = (o: LatLngPoint, a: LatLngPoint, b: LatLngPoint) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  // Lower hull
  const lower: LatLngPoint[] = [];
  for (const p of uniquePoints) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: LatLngPoint[] = [];
  for (let i = uniquePoints.length - 1; i >= 0; i--) {
    const p = uniquePoints[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);

  // 5. Expand outward from centroid for aesthetic margin
  const paddedHull: [number, number][] = hull.map((p) => {
    const dLat = p.lat - centroid.lat;
    const dLng = p.lng - centroid.lng;
    const dist = Math.hypot(dLat, dLng);
    const expandLat = dist > 0 ? (dLat / dist) * 0.0035 : 0.0035;
    const expandLng = dist > 0 ? (dLng / dist) * 0.005 : 0.005;
    return [p.lat + expandLat, p.lng + expandLng];
  });

  return paddedHull;
}

/**
 * Generates an interpolated quadratic Bézier curved arc between two coordinates.
 * - If points are very close, returns [p1, p2].
 * - Curves smoothly with a subtle outward arc relative to the cluster centroid.
 */
export function computeCurvedSplineArc(
  p1: [number, number],
  p2: [number, number],
  options?: {
    curvature?: number;
    numSegments?: number;
    centroid?: [number, number];
  }
): [number, number][] {
  const [lat1, lng1] = p1;
  const [lat2, lng2] = p2;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const dist = Math.hypot(dLat, dLng);

  if (dist < 0.0001) {
    return [p1, p2];
  }

  const curvature = options?.curvature ?? 0.1;
  const numSegments = options?.numSegments ?? 10;

  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;

  let nx = -dLng / dist;
  let ny = dLat / dist;

  if (options?.centroid) {
    const toMidLat = midLat - options.centroid[0];
    const toMidLng = midLng - options.centroid[1];
    const dot = toMidLat * nx + toMidLng * ny;
    if (dot < 0) {
      nx = -nx;
      ny = -ny;
    }
  }

  // Cap max offset to prevent excessively wide loops over long transit distances
  const offset = Math.min(dist * curvature, 0.012);
  const ctrlLat = midLat + nx * offset;
  const ctrlLng = midLng + ny * offset;

  const result: [number, number][] = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const inv = 1 - t;
    const lat = inv * inv * lat1 + 2 * inv * t * ctrlLat + t * t * lat2;
    const lng = inv * inv * lng1 + 2 * inv * t * ctrlLng + t * t * lng2;
    result.push([lat, lng]);
  }
  return result;
}

/**
 * Converts a sequence of waypoints into a continuous, smooth curved path.
 */
export function computeCurvedRoutePath(
  points: [number, number][],
  options?: {
    curvature?: number;
    numSegments?: number;
    centroid?: [number, number];
  }
): [number, number][] {
  if (points.length < 2) return points;

  const centroid =
    options?.centroid ??
    (() => {
      const cLat = points.reduce((s, p) => s + p[0], 0) / points.length;
      const cLng = points.reduce((s, p) => s + p[1], 0) / points.length;
      return [cLat, cLng] as [number, number];
    })();

  const fullPath: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const arc = computeCurvedSplineArc(points[i], points[i + 1], {
      curvature: options?.curvature ?? 0.1,
      numSegments: options?.numSegments ?? 10,
      centroid,
    });
    if (i > 0) {
      arc.shift();
    }
    fullPath.push(...arc);
  }

  return fullPath;
}
