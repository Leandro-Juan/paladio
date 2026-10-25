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
 * Subdivides a closed polygon using Chaikin's corner-cutting algorithm.
 * Produces a smooth C1 continuous curve with rounded, organic corners.
 */
export function chaikinSmooth(pts: [number, number][], iterations = 2): [number, number][] {
  let curr = pts;
  for (let it = 0; it < iterations; it++) {
    const next: [number, number][] = [];
    const n = curr.length;
    for (let i = 0; i < n; i++) {
      const p0 = curr[i];
      const p1 = curr[(i + 1) % n];
      next.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
      next.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
    }
    curr = next;
  }
  return curr;
}

/**
 * Computes a comfortable, smooth, circular, and organic blobby bounding polygon around a cluster of POIs.
 * - For 1 point: generates a smooth 32-vertex circle.
 * - For 2 points: generates a rounded pill/capsule blob with circular end-caps.
 * - For 3+ points: runs Andrew's Monotone Chain 2D Convex Hull in local conformal coordinates,
 *   expands exterior vertices with circular arcs, puffs edge midpoints organically toward a circular
 *   envelope, and applies Chaikin subdivision smoothing.
 * 
 * Returns an array of [lat, lng] tuples suitable for Leaflet <Polygon positions={...} />.
 */
export function computeClusterPolygon(points: LatLngPoint[]): [number, number][] {
  const valid = points.filter(
    (p) => typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng)
  );
  if (valid.length === 0) return [];

  const centroid = computeCentroid(valid);
  const cosLat = Math.cos((centroid.lat * Math.PI) / 180) || 1;

  // Local conformal Euclidean plane (y: north, x: east)
  const toXY = (p: LatLngPoint): [number, number] => [(p.lng - centroid.lng) * cosLat, p.lat - centroid.lat];
  const toLatLng = ([x, y]: [number, number]): [number, number] => [centroid.lat + y, centroid.lng + x / cosLat];

  const xyPoints = valid.map(toXY);

  let maxDist = 0;
  for (const [x, y] of xyPoints) {
    const d = Math.hypot(x, y);
    if (d > maxDist) maxDist = d;
  }

  // Base padding ~450m in degrees latitude
  const basePad = 0.0045;
  const pad = Math.max(basePad, maxDist * 0.22);

  // 1. Single Point: Smooth 32-gon circle
  if (valid.length === 1) {
    const circle: [number, number][] = [];
    const numVerts = 32;
    for (let i = 0; i < numVerts; i++) {
      const angle = (i / numVerts) * 2 * Math.PI;
      circle.push(toLatLng([basePad * Math.cos(angle), basePad * Math.sin(angle)]));
    }
    return circle;
  }

  // 2. Two Points: Smooth rounded capsule / pill blob
  if (valid.length === 2) {
    const [p0, p1] = xyPoints;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const dist = Math.hypot(dx, dy);

    if (dist < 1e-6) {
      return computeClusterPolygon([valid[0]]);
    }

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const capRadius = Math.max(basePad, dist * 0.3);
    const outline: [number, number][] = [];

    const angleP1 = Math.atan2(uy, ux);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const a = angleP1 + Math.PI / 2 - (i / steps) * Math.PI;
      outline.push([p1[0] + capRadius * Math.cos(a), p1[1] + capRadius * Math.sin(a)]);
    }

    const mid1: [number, number] = [
      (p0[0] + p1[0]) / 2 - nx * (capRadius * 1.08),
      (p0[1] + p1[1]) / 2 - ny * (capRadius * 1.08),
    ];
    outline.push(mid1);

    const angleP0 = angleP1 + Math.PI;
    for (let i = 0; i <= steps; i++) {
      const a = angleP0 + Math.PI / 2 - (i / steps) * Math.PI;
      outline.push([p0[0] + capRadius * Math.cos(a), p0[1] + capRadius * Math.sin(a)]);
    }

    const mid2: [number, number] = [
      (p0[0] + p1[0]) / 2 + nx * (capRadius * 1.08),
      (p0[1] + p1[1]) / 2 + ny * (capRadius * 1.08),
    ];
    outline.push(mid2);

    const smoothed = chaikinSmooth(outline, 2);
    return smoothed.map(toLatLng);
  }

  // 3. Deduplicate coordinates
  const uniqueXY: [number, number][] = [];
  const seen = new Set<string>();
  for (const pt of xyPoints) {
    const k = `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniqueXY.push(pt);
    }
  }

  if (uniqueXY.length < 3) {
    const latLngs = uniqueXY.map(toLatLng).map(([lat, lng]) => ({ lat, lng }));
    return computeClusterPolygon(latLngs);
  }

  // 4. Sort points lexicographically and compute convex hull
  uniqueXY.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of uniqueXY) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = uniqueXY.length - 1; i >= 0; i--) {
    const p = uniqueXY[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);

  // If hull has < 3 vertices (e.g. collinear points), fallback to extreme points capsule
  if (hull.length < 3) {
    const pMin = uniqueXY[0];
    const pMax = uniqueXY[uniqueXY.length - 1];
    const latLngs = [pMin, pMax].map(toLatLng).map(([lat, lng]) => ({ lat, lng }));
    return computeClusterPolygon(latLngs);
  }

  // Verify non-zero area; if degenerate/collinear, treat as capsule
  let area2 = 0;
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length;
    area2 += hull[i][0] * hull[j][1] - hull[j][0] * hull[i][1];
  }
  if (Math.abs(area2) < 1e-10) {
    const pMin = uniqueXY[0];
    const pMax = uniqueXY[uniqueXY.length - 1];
    const latLngs = [pMin, pMax].map(toLatLng).map(([lat, lng]) => ({ lat, lng }));
    return computeClusterPolygon(latLngs);
  }

  // Ensure counter-clockwise vertex winding
  if (area2 < 0) {
    hull.reverse();
  }

  // 5. Expand hull with rounded circular corner arcs + organic blobby outward edge puffing
  const m = hull.length;
  const rawBlob: [number, number][] = [];

  for (let i = 0; i < m; i++) {
    const prev = hull[(i - 1 + m) % m];
    const curr = hull[i];
    const next = hull[(i + 1) % m];

    const dInX = curr[0] - prev[0];
    const dInY = curr[1] - prev[1];
    const lenIn = Math.hypot(dInX, dInY) || 1;
    // Edge normal (turned 90 deg right/outward: (dy, -dx))
    const nInX = dInY / lenIn;
    const nInY = -dInX / lenIn;

    const dOutX = next[0] - curr[0];
    const dOutY = next[1] - curr[1];
    const lenOut = Math.hypot(dOutX, dOutY) || 1;
    const nOutX = dOutY / lenOut;
    const nOutY = -dOutX / lenOut;

    const angleStart = Math.atan2(nInY, nInX);
    const angleEnd = Math.atan2(nOutY, nOutX);

    let sweep = angleEnd - angleStart;
    while (sweep < 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;

    // Corner circular arc
    const arcSteps = Math.max(3, Math.ceil((sweep / (Math.PI / 4)) * 3));
    for (let s = 0; s <= arcSteps; s++) {
      const a = angleStart + (s / arcSteps) * sweep;
      rawBlob.push([curr[0] + pad * Math.cos(a), curr[1] + pad * Math.sin(a)]);
    }

    // Midpoint between curr and next: puff outward toward circular envelope
    const midX = (curr[0] + next[0]) / 2;
    const midY = (curr[1] + next[1]) / 2;
    const edgeDistFromCentroid = Math.hypot(midX, midY);
    const circRadius = maxDist + pad;
    const targetDist = edgeDistFromCentroid + (circRadius - edgeDistFromCentroid) * 0.35;
    const outwardDist = Math.max(edgeDistFromCentroid + pad * 0.5, targetDist);
    const midAngle = Math.atan2(midY + nOutY * pad, midX + nOutX * pad);

    const puffX = outwardDist * Math.cos(midAngle);
    const puffY = outwardDist * Math.sin(midAngle);
    rawBlob.push([puffX, puffY]);
  }

  // 6. Smooth the blob with 2 iterations of Chaikin subdivision
  const smoothed = chaikinSmooth(rawBlob, 2);
  return smoothed.map(toLatLng);
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

/**
 * Tests whether a point [lat, lng] is strictly inside a 2D polygon defined by [[lat, lng], ...].
 * Uses standard Ray Casting algorithm.
 */
export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  const x = point[0];
  const y = point[1];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
