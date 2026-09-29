import { test, expect } from '@playwright/experimental-ct-react';
import { computeClusterPolygon, computeCentroid } from '../../src/utils/clusterHull';

test.describe('Cluster Hull & Geometry Utility', () => {
  test('handles empty points gracefully', () => {
    expect(computeClusterPolygon([])).toEqual([]);
    expect(computeCentroid([])).toEqual({ lat: 0, lng: 0 });
  });

  test('computes regular polygon for single point', () => {
    const singlePoint = [{ lat: 41.15, lng: -8.62 }];
    const centroid = computeCentroid(singlePoint);
    expect(centroid.lat).toBeCloseTo(41.15);
    expect(centroid.lng).toBeCloseTo(-8.62);

    const poly = computeClusterPolygon(singlePoint);
    expect(poly.length).toBe(12);
  });

  test('computes capsule polygon for two points', () => {
    const twoPoints = [
      { lat: 41.15, lng: -8.62 },
      { lat: 41.16, lng: -8.63 },
    ];
    const poly = computeClusterPolygon(twoPoints);
    expect(poly.length).toBe(4);
  });

  test('computes convex hull with padding for multi-point cluster', () => {
    const points = [
      { lat: 41.15, lng: -8.62 },
      { lat: 41.16, lng: -8.63 },
      { lat: 41.14, lng: -8.61 },
      { lat: 41.155, lng: -8.625 },
      { lat: 41.145, lng: -8.615 },
    ];
    const poly = computeClusterPolygon(points);
    expect(poly.length).toBeGreaterThanOrEqual(3);

    for (const [lat, lng] of poly) {
      expect(typeof lat).toBe('number');
      expect(typeof lng).toBe('number');
      expect(isNaN(lat)).toBe(false);
      expect(isNaN(lng)).toBe(false);
    }
  });
});
