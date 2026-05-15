/**
 * Convex hull math.
 *
 * Implements Andrew's monotone chain algorithm (a.k.a. the "upper +
 * lower hull" variant of Graham scan). O(n log n) sort followed by an
 * O(n) walk. Returns the hull vertices in counter-clockwise order,
 * INCLUDING the closing vertex repeated at the end so callers can
 * draw a closed SVG path without extra bookkeeping.
 *
 * Degenerate inputs:
 *   - 0 or 1 unique points -> returns the input as-is.
 *   - All points collinear -> returns the two extreme endpoints.
 *   - Duplicate points -> stripped before the walk.
 *
 * The function is exported because the Discover-page widget needs the
 * raw hull vertices to attach receipt-link click targets to each one;
 * a plain SVG `<polygon>` would render the hull but lose the
 * point-to-receipt mapping. Tests pin both the canonical happy paths
 * and every degenerate case below.
 */

export interface HullPoint {
  /** X coordinate (e.g. normalised prediction in [0, 1]). */
  x: number;
  /** Y coordinate (e.g. normalised conviction in [0, 1]). */
  y: number;
  /** Opaque identifier the caller uses to look up the original record. */
  id: string;
}

/**
 * Cross product of vectors OA and OB. Positive when OAB makes a
 * counter-clockwise turn, negative when clockwise, zero when collinear.
 */
function cross(o: HullPoint, a: HullPoint, b: HullPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Compute the convex hull of `points` in counter-clockwise order. The
 * returned array does NOT include a closing duplicate vertex; callers
 * that need one can append `hull[0]`.
 */
export function convexHull(points: ReadonlyArray<HullPoint>): HullPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  // Strip duplicates: two points at the exact same (x, y) would
  // confuse the monotone chain. We key on a stringified tuple so we
  // tolerate floating-point inputs without epsilon arithmetic.
  const seen = new Map<string, HullPoint>();
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${p.x}:${p.y}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  const unique = Array.from(seen.values());
  if (unique.length <= 1) return unique;

  // Sort by x, then y. Ties on x become ties on y.
  unique.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  // Build the lower hull walking left-to-right; reject every middle
  // point whose turn at the new endpoint is NOT a left turn.
  const lower: HullPoint[] = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build the upper hull walking right-to-left; same logic mirrored.
  const upper: HullPoint[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // Drop the duplicate connecting endpoints; concat into a single
  // counter-clockwise loop.
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Returns true when the point set lies entirely on one line (all
 * collinear). Useful for the Discover-page widget's "not enough
 * spread to draw a frontier" fallback.
 */
export function isCollinear(points: ReadonlyArray<HullPoint>): boolean {
  if (points.length < 3) return true;
  const a = points[0];
  const b = points[1];
  for (let i = 2; i < points.length; i++) {
    if (Math.abs(cross(a, b, points[i])) > 1e-12) return false;
  }
  return true;
}
