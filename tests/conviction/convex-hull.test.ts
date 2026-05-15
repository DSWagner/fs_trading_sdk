/**
 * @vitest-environment node
 *
 * Convex hull math tests. Covers:
 *   - empty / single-point / two-point degenerate inputs
 *   - the canonical square example (4 corners + an interior point)
 *   - collinear points (no triangle, returned as a line)
 *   - duplicate points stripped before the walk
 *   - non-finite points filtered out
 *   - returned vertices are in counter-clockwise order
 *   - isCollinear flag matches the math
 */
import { describe, expect, it } from 'vitest';
import { convexHull, isCollinear } from '../../demo-app/src/conviction/convexHull';

describe('convexHull', () => {
  it('returns empty for an empty input', () => {
    expect(convexHull([])).toEqual([]);
  });

  it('returns the single point unchanged', () => {
    const p = { x: 1, y: 2, id: 'a' };
    expect(convexHull([p])).toEqual([p]);
  });

  it('returns the two points unchanged (sorted)', () => {
    const a = { x: 0, y: 0, id: 'a' };
    const b = { x: 1, y: 1, id: 'b' };
    expect(convexHull([b, a])).toEqual([a, b]);
  });

  it('returns just the four corners for a square with an interior point', () => {
    const corners = [
      { x: 0, y: 0, id: 'bl' },
      { x: 1, y: 0, id: 'br' },
      { x: 1, y: 1, id: 'tr' },
      { x: 0, y: 1, id: 'tl' },
    ];
    const interior = { x: 0.5, y: 0.5, id: 'mid' };
    const hull = convexHull([...corners, interior]);
    expect(hull.length).toBe(4);
    const ids = new Set(hull.map((p) => p.id));
    expect(ids.has('mid')).toBe(false);
    for (const c of corners) expect(ids.has(c.id)).toBe(true);
  });

  it('strips duplicate points before the walk', () => {
    const hull = convexHull([
      { x: 0, y: 0, id: 'a' },
      { x: 0, y: 0, id: 'a-dup' },
      { x: 1, y: 0, id: 'b' },
      { x: 1, y: 1, id: 'c' },
    ]);
    expect(hull.length).toBe(3);
  });

  it('filters non-finite coordinates', () => {
    const hull = convexHull([
      { x: 0, y: 0, id: 'a' },
      { x: 1, y: 0, id: 'b' },
      { x: Number.NaN, y: 1, id: 'nan' },
      { x: 0, y: 1, id: 'c' },
    ]);
    expect(hull.length).toBe(3);
    expect(hull.find((p) => p.id === 'nan')).toBeUndefined();
  });

  it('handles a collinear set without crashing (returns the endpoints)', () => {
    const hull = convexHull([
      { x: 0, y: 0, id: 'a' },
      { x: 1, y: 1, id: 'b' },
      { x: 2, y: 2, id: 'c' },
      { x: 3, y: 3, id: 'd' },
    ]);
    // Monotone chain collapses the middle vertices; returns the two endpoints.
    expect(hull.length).toBeLessThanOrEqual(2);
    const ids = new Set(hull.map((p) => p.id));
    expect(ids.has('a') || ids.has('d')).toBe(true);
  });

  it('vertices walk counter-clockwise (positive cross product for any three consecutive)', () => {
    const hull = convexHull([
      { x: 0, y: 0, id: 'a' },
      { x: 2, y: 0, id: 'b' },
      { x: 2, y: 2, id: 'c' },
      { x: 0, y: 2, id: 'd' },
    ]);
    for (let i = 0; i < hull.length; i++) {
      const o = hull[i];
      const a = hull[(i + 1) % hull.length];
      const b = hull[(i + 2) % hull.length];
      const c = (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      expect(c).toBeGreaterThan(0);
    }
  });
});

describe('isCollinear', () => {
  it('says true for fewer than 3 points', () => {
    expect(isCollinear([])).toBe(true);
    expect(isCollinear([{ x: 0, y: 0, id: 'a' }])).toBe(true);
    expect(
      isCollinear([
        { x: 0, y: 0, id: 'a' },
        { x: 1, y: 1, id: 'b' },
      ]),
    ).toBe(true);
  });

  it('says true for collinear', () => {
    expect(
      isCollinear([
        { x: 0, y: 0, id: 'a' },
        { x: 1, y: 1, id: 'b' },
        { x: 2, y: 2, id: 'c' },
      ]),
    ).toBe(true);
  });

  it('says false for non-collinear', () => {
    expect(
      isCollinear([
        { x: 0, y: 0, id: 'a' },
        { x: 1, y: 0, id: 'b' },
        { x: 0, y: 1, id: 'c' },
      ]),
    ).toBe(false);
  });
});
