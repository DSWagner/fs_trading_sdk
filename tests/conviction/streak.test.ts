/**
 * @vitest-environment node
 *
 * Streak math — pure functional tests. Covers:
 *   - empty input returns the zero-summary
 *   - resolved-only filter (open + voided bets are skipped, not
 *     stream-breaking)
 *   - sorted-descending walk: "current" streak is the prefix of
 *     accurate bets at the head, not the absolute longest run
 *   - misses break the current streak but leave `longest` intact
 *   - the haloTreatmentForStreak step function with each tier's
 *     boundaries (0 / 1-2 / 3-5 / 6-9 / 10+)
 */
import { describe, expect, it } from 'vitest';
import {
  computeStreak,
  haloTreatmentForStreak,
  MIN_STREAK_ACCURACY,
} from '../../demo-app/src/conviction/streak';

const HIT = MIN_STREAK_ACCURACY + 0.01; // safely over the threshold
const MISS = MIN_STREAK_ACCURACY - 0.05;

describe('computeStreak', () => {
  it('returns the zero summary for an empty list', () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0, hits: 0, resolved: 0 });
  });

  it('ignores non-resolved records entirely', () => {
    const r = computeStreak([
      { resolvedAt: '2026-05-10T00:00:00Z', accuracy: HIT, resolutionState: 'open' },
      { resolvedAt: '2026-05-11T00:00:00Z', accuracy: HIT, resolutionState: 'voided' },
    ]);
    expect(r).toEqual({ current: 0, longest: 0, hits: 0, resolved: 0 });
  });

  it('walks descending by resolvedAt so "current" is the most recent prefix', () => {
    const r = computeStreak([
      { resolvedAt: '2026-05-10T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-11T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-12T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
    ]);
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.hits).toBe(3);
    expect(r.resolved).toBe(3);
  });

  it('breaks the current streak on a miss but preserves the longest', () => {
    const r = computeStreak([
      { resolvedAt: '2026-05-01T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-02T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-03T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-04T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-05T00:00:00Z', accuracy: MISS, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-06T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-07T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
    ]);
    // Descending order: HIT, HIT, MISS, HIT, HIT, HIT, HIT
    expect(r.current).toBe(2);
    expect(r.longest).toBe(4);
    expect(r.hits).toBe(6);
    expect(r.resolved).toBe(7);
  });

  it('a leading miss yields current=0 even when older bets were hits', () => {
    const r = computeStreak([
      { resolvedAt: '2026-05-01T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-02T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-03T00:00:00Z', accuracy: MISS, resolutionState: 'resolved' },
    ]);
    expect(r.current).toBe(0);
    expect(r.longest).toBe(2);
  });

  it('null accuracy is treated as a miss for streak purposes', () => {
    const r = computeStreak([
      { resolvedAt: '2026-05-01T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-02T00:00:00Z', accuracy: null, resolutionState: 'resolved' },
    ]);
    expect(r.current).toBe(0);
    expect(r.longest).toBe(1);
  });

  it('un-parseable resolvedAt sinks to the back without breaking the prefix', () => {
    const r = computeStreak([
      { resolvedAt: 'not-a-date', accuracy: MISS, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-12T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
      { resolvedAt: '2026-05-13T00:00:00Z', accuracy: HIT, resolutionState: 'resolved' },
    ]);
    // After sort: 13, 12, NaN -> HIT, HIT, MISS
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
  });
});

describe('haloTreatmentForStreak — step function tiers', () => {
  it('tier 0 for zero / negative / non-finite streak', () => {
    expect(haloTreatmentForStreak(0).tier).toBe(0);
    expect(haloTreatmentForStreak(-1).tier).toBe(0);
    expect(haloTreatmentForStreak(Number.NaN).tier).toBe(0);
  });

  it('tier 1 for 1..2 streak (warm-up)', () => {
    expect(haloTreatmentForStreak(1).tier).toBe(1);
    expect(haloTreatmentForStreak(2).tier).toBe(1);
  });

  it('tier 2 for 3..5 streak (single ring + glow)', () => {
    expect(haloTreatmentForStreak(3).tier).toBe(2);
    expect(haloTreatmentForStreak(5).tier).toBe(2);
  });

  it('tier 3 for 6..9 streak (concentric rings)', () => {
    expect(haloTreatmentForStreak(6).tier).toBe(3);
    expect(haloTreatmentForStreak(9).tier).toBe(3);
  });

  it('tier 4 for 10+ streak (comet)', () => {
    expect(haloTreatmentForStreak(10).tier).toBe(4);
    expect(haloTreatmentForStreak(50).tier).toBe(4);
  });

  it('emits a labelled aria string for every nonzero tier', () => {
    for (const n of [1, 3, 6, 10, 25]) {
      expect(haloTreatmentForStreak(n).label).toMatch(/streak/i);
    }
  });
});
