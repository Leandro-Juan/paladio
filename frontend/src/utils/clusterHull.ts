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
