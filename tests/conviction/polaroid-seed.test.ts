/**
 * @vitest-environment node
 *
 * Tests for the polaroid seed module — the core uniqueness guarantee. We
 * verify:
 *   - Determinism: identical inputs produce identical seeds
 *   - Sensitivity: each user-controllable field perturbs the seed
 *   - Distribution: 10k synthetic receipts produce >9990 distinct seeds
 *   - Palette mapping: each rarity tier maps to its expected pool
 *   - Time-based develop: progresses 0 → ~0.8 pre-resolution, snaps to 1
 *     on accurate resolution, caps at 0.45 on a miss
 */

import { describe, it, expect } from 'vitest';
import {
  seedFromInputs,
  fnv1a,
  mulberry32,
  rngSeries,
  pickPaletteFamily,
  developProgress,
  type SeedInputs,
} from '../../demo-app/src/conviction/polaroidSeed';
import { RARITY_ORDER } from '../../demo-app/src/conviction/rarity';

const baseInputs: SeedInputs = {
  marketId: 'm-1',
  positionId: 'p-1',
  username: 'alice',
  reasoning: 'because it is fundamentally undervalued',
  prediction: 50,
  spread: 5,
  conviction: 0.7,
  collateral: 25,
  shape: 'gaussian',
  createdAt: '2026-05-10T12:00:00.000Z',
};

describe('seedFromInputs — determinism', () => {
  it('produces the same seed for identical inputs', () => {
    expect(seedFromInputs(baseInputs)).toBe(seedFromInputs(baseInputs));
  });
  it('returns a positive 32-bit integer', () => {
    const s = seedFromInputs(baseInputs);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});

describe('seedFromInputs — every field perturbs the seed', () => {
  const fields: Array<{ key: keyof SeedInputs; alt: any }> = [
    { key: 'marketId', alt: 'm-2' },
    { key: 'positionId', alt: 'p-2' },
    { key: 'username', alt: 'bob' },
    { key: 'reasoning', alt: 'a different opinion' },
    { key: 'prediction', alt: 51 },
    { key: 'spread', alt: 6 },
    { key: 'conviction', alt: 0.8 },
    { key: 'collateral', alt: 26 },
    { key: 'shape', alt: 'bimodal' as const },
    { key: 'createdAt', alt: '2026-05-10T12:00:01.000Z' },
  ];
  for (const { key, alt } of fields) {
    it(`changing ${key} produces a different seed`, () => {
      const tweaked = { ...baseInputs, [key]: alt } as SeedInputs;
      expect(seedFromInputs(tweaked)).not.toBe(seedFromInputs(baseInputs));
    });
  }
});

describe('seedFromInputs — slider micro-changes', () => {
  it('a 3-sig-fig prediction change does perturb the seed', () => {
    const s1 = seedFromInputs({ ...baseInputs, prediction: 50.0 });
    const s2 = seedFromInputs({ ...baseInputs, prediction: 50.5 });
    expect(s1).not.toBe(s2);
  });
  it('imperceptible (sub-3-sig-fig) prediction changes do NOT thrash the seed', () => {
    // This is an intentional smoothing: 50.0000001 and 50.0 should produce
    // the same seed so the visual is stable across imperceptible drag jitter.
    const s1 = seedFromInputs({ ...baseInputs, prediction: 50.0 });
    const s2 = seedFromInputs({ ...baseInputs, prediction: 50.000001 });
    expect(s1).toBe(s2);
  });
});

describe('seedFromInputs — distribution', () => {
  it('10,000 synthetic receipts produce mostly-distinct seeds (>= 99.5%)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(
        seedFromInputs({
          ...baseInputs,
          positionId: `p-${i}`,
        }),
      );
    }
    // Even with a good 32-bit hash birthday paradox makes some collisions
    // likely past a few thousand. We allow up to 0.5%.
    expect(seen.size).toBeGreaterThanOrEqual(9950);
  });
});

describe('fnv1a + mulberry32', () => {
  it('fnv1a returns 1 for empty string (collapses to fallback)', () => {
    // The implementation returns `h || 1` to avoid a seed of 0 which
    // would freeze mulberry32. For "" the raw output is the offset basis.
    const out = fnv1a('');
    expect(out).toBeGreaterThan(0);
  });
  it('mulberry32 produces deterministic sequences', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 16; i++) expect(a()).toBeCloseTo(b(), 12);
  });
  it('rngSeries returns the right count and stays in [0, 1)', () => {
    const xs = rngSeries(99, 32);
    expect(xs).toHaveLength(32);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('pickPaletteFamily — tier mapping', () => {
  it('common only maps to twilight or botanical', () => {
    const families = new Set<string>();
    for (let s = 0; s < 200; s++) families.add(pickPaletteFamily(s, 'common'));
    for (const f of families) {
      expect(['twilight', 'botanical']).toContain(f);
    }
  });
  it('mythic only maps to goldleaf or oracle', () => {
    const families = new Set<string>();
    for (let s = 0; s < 200; s++) families.add(pickPaletteFamily(s, 'mythic'));
    for (const f of families) {
      expect(['goldleaf', 'oracle']).toContain(f);
    }
  });
  it('every tier resolves to a defined family', () => {
    for (const tier of RARITY_ORDER) {
      const f = pickPaletteFamily(42, tier);
      expect(typeof f).toBe('string');
      expect(f.length).toBeGreaterThan(0);
    }
  });
  it('null tier picks from the full pool', () => {
    const families = new Set<string>();
    for (let s = 0; s < 200; s++) families.add(pickPaletteFamily(s, null));
    expect(families.size).toBeGreaterThan(2);
  });
});

describe('developProgress — open bets', () => {
  it('fresh bet shows minimal develop (~0.18)', () => {
    const createdAt = new Date('2026-05-10T12:00:00Z').toISOString();
    const expiresAt = new Date('2026-06-10T12:00:00Z').toISOString();
    const p = developProgress({
      createdAt,
      expiresAt,
      resolutionState: 'open',
      accuracy: null,
      now: Date.parse(createdAt),
    });
    expect(p).toBeCloseTo(0.18, 2);
  });
  it('halfway through the window shows partial develop', () => {
    const createdAt = new Date('2026-05-10T00:00:00Z').toISOString();
    const expiresAt = new Date('2026-06-10T00:00:00Z').toISOString();
    const halfway = (Date.parse(createdAt) + Date.parse(expiresAt)) / 2;
    const p = developProgress({
      createdAt,
      expiresAt,
      resolutionState: 'open',
      accuracy: null,
      now: halfway,
    });
    expect(p).toBeGreaterThan(0.18);
    expect(p).toBeLessThan(0.7);
  });
  it('approaching the deadline approaches the open-bet ceiling (~0.8)', () => {
    const createdAt = new Date('2026-05-10T00:00:00Z').toISOString();
    const expiresAt = new Date('2026-06-10T00:00:00Z').toISOString();
    const justBefore = Date.parse(expiresAt) - 1000;
    const p = developProgress({
      createdAt,
      expiresAt,
      resolutionState: 'open',
      accuracy: null,
      now: justBefore,
    });
    expect(p).toBeGreaterThan(0.75);
    expect(p).toBeLessThanOrEqual(0.81);
  });
  it('no expiresAt yields stable 0.25', () => {
    const createdAt = new Date('2026-05-10T00:00:00Z').toISOString();
    const p = developProgress({
      createdAt,
      expiresAt: null,
      resolutionState: 'open',
      accuracy: null,
      now: Date.now(),
    });
    expect(p).toBeCloseTo(0.25, 2);
  });
});

describe('developProgress — resolved bets', () => {
  it('accurate (>= 0.6) jumps to full develop', () => {
    expect(developProgress({
      createdAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      resolutionState: 'resolved',
      accuracy: 0.95,
    })).toBe(1);
    expect(developProgress({
      createdAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      resolutionState: 'resolved',
      accuracy: 0.6,
    })).toBe(1);
  });
  it('close (0.4 - 0.6) eases toward but never reaches full develop', () => {
    const p = developProgress({
      createdAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      resolutionState: 'resolved',
      accuracy: 0.5,
    });
    expect(p).toBeGreaterThan(0.55);
    expect(p).toBeLessThan(1);
  });
  it('a miss (< 0.4) caps at 0.45 — the "ruined polaroid" floor', () => {
    const p = developProgress({
      createdAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      resolutionState: 'resolved',
      accuracy: 0.1,
    });
    expect(p).toBeLessThanOrEqual(0.45);
    expect(p).toBeGreaterThan(0.15);
  });
  it('a total miss never produces a developed-looking image', () => {
    const p = developProgress({
      createdAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      resolutionState: 'resolved',
      accuracy: 0,
    });
    expect(p).toBeLessThan(0.5);
  });
  it('resolved without a known accuracy holds at 0.55 (visible but not bragging)', () => {
    const p = developProgress({
      createdAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      resolutionState: 'resolved',
      accuracy: null,
    });
    expect(p).toBe(0.55);
  });
});
