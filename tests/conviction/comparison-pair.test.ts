/**
 * Comparison pair: pure math tests for `summariseConsensus`.
 *
 * `summariseConsensus` reduces a density curve (the `useConsensus`
 * payload) into the three scalars the Polaroid renderer needs:
 *
 *   - mean       — the centre of mass on the x axis
 *   - spread     — stdDev * 2 / range, clamped to [0.05, 1]
 *   - conviction — 1 - spread, also clamped to [0.05, 1]
 *
 * The helper is the single source of truth for "what does the crowd
 * believe?" on the receipt — if it returns garbage, the synthesised
 * crowd polaroid becomes misleading. These tests pin every degenerate
 * input as well as the canonical happy paths.
 *
 * NOTE: this test file is .ts (no JSX), and the helper is exported
 * as a plain function from ComparisonPair.tsx. We import it directly
 * to avoid coupling to React. The file lives next to ComparisonPair
 * in the source so the import path resolves cleanly.
 */
import { describe, it, expect } from 'vitest';
import { summariseConsensus } from '../../demo-app/src/conviction/components/ComparisonPair';

// Build a discretised gaussian density on [0, 100].
function gaussianDensity(mean: number, sigma: number, n = 41): Array<{ x: number; y: number }> {
  const lo = 0;
  const hi = 100;
  const step = (hi - lo) / (n - 1);
  const result: Array<{ x: number; y: number }> = [];
  const norm = 1 / (sigma * Math.sqrt(2 * Math.PI));
  for (let i = 0; i < n; i++) {
    const x = lo + i * step;
    const y = norm * Math.exp(-0.5 * ((x - mean) / sigma) ** 2);
    result.push({ x, y });
  }
  return result;
}

describe('summariseConsensus: degenerate inputs', () => {
  it('returns null on undefined input', () => {
    expect(summariseConsensus(undefined, 0, 100)).toBeNull();
  });
  it('returns null on null input', () => {
    expect(summariseConsensus(null, 0, 100)).toBeNull();
  });
  it('returns null on empty points array', () => {
    expect(summariseConsensus([], 0, 100)).toBeNull();
  });
  it('returns null on fewer than 3 points', () => {
    expect(summariseConsensus([
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ], 0, 100)).toBeNull();
  });
  it('returns null when total mass integrates to 0 (all y=0)', () => {
    const points = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }));
    expect(summariseConsensus(points, 0, 100)).toBeNull();
  });
  it('returns null when the curve carries NaN values (after filtering loses all mass)', () => {
    const points = [
      { x: NaN, y: 1 },
      { x: NaN, y: 1 },
      { x: NaN, y: 1 },
    ];
    expect(summariseConsensus(points, 0, 100)).toBeNull();
  });
});

describe('summariseConsensus: happy paths', () => {
  it('accepts a raw points array directly', () => {
    const result = summariseConsensus(gaussianDensity(50, 10), 0, 100);
    expect(result).not.toBeNull();
    expect(result!.mean).toBeGreaterThan(48);
    expect(result!.mean).toBeLessThan(52);
  });

  it('accepts a {points: ...} curve wrapper', () => {
    const result = summariseConsensus(
      { points: gaussianDensity(70, 12) },
      0,
      100,
    );
    expect(result).not.toBeNull();
    expect(result!.mean).toBeGreaterThan(67);
    expect(result!.mean).toBeLessThan(73);
  });

  it('recovers the mean of a unimodal gaussian to within 1 unit', () => {
    for (const mean of [25, 50, 75]) {
      const result = summariseConsensus(gaussianDensity(mean, 8), 0, 100);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.mean - mean)).toBeLessThan(1);
    }
  });

  it('produces a TIGHTER spread for a narrow distribution than a wide one', () => {
    const tight = summariseConsensus(gaussianDensity(50, 4), 0, 100);
    const loose = summariseConsensus(gaussianDensity(50, 25), 0, 100);
    expect(tight).not.toBeNull();
    expect(loose).not.toBeNull();
    expect(tight!.spread).toBeLessThan(loose!.spread);
    expect(tight!.conviction).toBeGreaterThan(loose!.conviction);
  });

  it('clamps spread to [0.05, 1] for extreme cases', () => {
    // Extremely tight (sigma=0.5) -> spread should clamp to 0.05.
    const veryTight = summariseConsensus(gaussianDensity(50, 0.5, 101), 0, 100);
    expect(veryTight).not.toBeNull();
    expect(veryTight!.spread).toBeGreaterThanOrEqual(0.05);
    expect(veryTight!.spread).toBeLessThanOrEqual(1);
    // Extremely wide (sigma=80) -> spread clamps at 1.
    const veryWide = summariseConsensus(gaussianDensity(50, 80, 101), 0, 100);
    expect(veryWide).not.toBeNull();
    expect(veryWide!.spread).toBeLessThanOrEqual(1);
    expect(veryWide!.spread).toBeGreaterThanOrEqual(0.05);
  });

  it('clamps conviction to [0.05, 1] for extreme cases', () => {
    const tight = summariseConsensus(gaussianDensity(50, 0.5, 101), 0, 100);
    const wide = summariseConsensus(gaussianDensity(50, 80, 101), 0, 100);
    expect(tight!.conviction).toBeLessThanOrEqual(1);
    expect(tight!.conviction).toBeGreaterThanOrEqual(0.05);
    expect(wide!.conviction).toBeLessThanOrEqual(1);
    expect(wide!.conviction).toBeGreaterThanOrEqual(0.05);
  });

  it('handles range bounds with zero width gracefully (no division-by-zero)', () => {
    // When lowerBound == upperBound, range collapses but the helper
    // protects against it via Math.max(0.0001, ...).
    const result = summariseConsensus(gaussianDensity(50, 10), 50, 50);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.spread)).toBe(true);
    expect(Number.isFinite(result!.conviction)).toBe(true);
  });
});

describe('summariseConsensus: monotonicity', () => {
  it('mean shifts monotonically as the input mean shifts', () => {
    let previousMean = -Infinity;
    for (const target of [10, 30, 50, 70, 90]) {
      const result = summariseConsensus(gaussianDensity(target, 8), 0, 100);
      expect(result).not.toBeNull();
      expect(result!.mean).toBeGreaterThan(previousMean);
      previousMean = result!.mean;
    }
  });
});
