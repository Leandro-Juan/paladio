import { test, expect } from '@playwright/experimental-ct-react';
import {
  computeClusterPolygon,
  computeCentroid,
  computeCurvedSplineArc,
  computeCurvedRoutePath,
} from '../../src/utils/clusterHull';

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

  test('computes smooth curved spline arc between two coordinates', () => {
    const p1: [number, number] = [40.4168, -3.7038]; // Puerta del Sol
    const p2: [number, number] = [40.4138, -3.6921]; // Museo del Prado

    const arc = computeCurvedSplineArc(p1, p2, { numSegments: 8, curvature: 0.1 });
    expect(arc.length).toBe(9); // 8 segments -> 9 points

    // Starts at p1 and ends at p2
    expect(arc[0][0]).toBeCloseTo(p1[0]);
    expect(arc[0][1]).toBeCloseTo(p1[1]);
    expect(arc[8][0]).toBeCloseTo(p2[0]);
    expect(arc[8][1]).toBeCloseTo(p2[1]);

    // Check all intermediate points are valid numbers
    arc.forEach(([lat, lng]) => {
      expect(typeof lat).toBe('number');
      expect(typeof lng).toBe('number');
      expect(isNaN(lat)).toBe(false);
      expect(isNaN(lng)).toBe(false);
    });
  });

  test('computes continuous curved route path for multiple coordinates', () => {
    const points: [number, number][] = [
      [40.4168, -3.7038], // Sol
      [40.4138, -3.6921], // Prado
      [40.4080, -3.6944], // Reina Sofia
    ];

    const route = computeCurvedRoutePath(points, { numSegments: 6 });
    // 2 legs of 6 segments: 1 + 6 + 6 = 13 points
    expect(route.length).toBe(13);
    expect(route[0]).toEqual(points[0]);
    expect(route[route.length - 1]).toEqual(points[points.length - 1]);
  });
});

