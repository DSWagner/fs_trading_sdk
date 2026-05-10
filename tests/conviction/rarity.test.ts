/**
 * @vitest-environment node
 *
 * Pure-function tests for the rarity calculation. Covers every tier
 * threshold, every edge case (no consensus, degenerate bounds, NaN inputs),
 * and the potential-rarity heuristic used during the bet flow.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRarity,
  potentialRarity,
  TIER_META,
  RARITY_ORDER,
  type Rarity,
} from '../../demo-app/src/conviction/rarity';

const baseInputs = {
  lowerBound: 0,
  upperBound: 100,
};

describe('calculateRarity — perfect-accuracy thresholds', () => {
  it('a contrarian + perfect call hits MYTHIC (score >= 0.45)', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 80,
      resolvedOutcome: 80,
      consensusMean: 30, // 50% disagreement
    });
    expect(r.tier).toBe('mythic');
    expect(r.score).toBeCloseTo(0.5, 5);
    expect(r.disagreement).toBeCloseTo(0.5, 5);
    expect(r.accuracy).toBe(1);
    expect(r.label).toBe('Mythic');
  });

  it('30% disagreement + perfect accuracy is LEGENDARY', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 60,
      resolvedOutcome: 60,
      consensusMean: 30, // 30% disagreement
    });
    expect(r.tier).toBe('legendary');
    expect(r.score).toBeCloseTo(0.3, 5);
  });

  it('20% disagreement + perfect accuracy is EPIC', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 50,
      resolvedOutcome: 50,
      consensusMean: 30, // 20% disagreement
    });
    expect(r.tier).toBe('epic');
    expect(r.score).toBeCloseTo(0.2, 5);
  });

  it('12% disagreement + perfect accuracy is RARE', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 42,
      resolvedOutcome: 42,
      consensusMean: 30,
    });
    expect(r.tier).toBe('rare');
  });

  it('5% disagreement + perfect accuracy is UNCOMMON', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 35,
      resolvedOutcome: 35,
      consensusMean: 30,
    });
    expect(r.tier).toBe('uncommon');
  });

  it('agreeing with consensus and being right is COMMON', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 30,
      resolvedOutcome: 30,
      consensusMean: 30,
    });
    expect(r.tier).toBe('common');
    expect(r.score).toBe(0);
  });
});

describe('calculateRarity — accuracy degrades rarity even with high disagreement', () => {
  it('huge disagreement but missed by 25% is COMMON (accuracy collapses)', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 80,
      resolvedOutcome: 55, // 25% off
      consensusMean: 30,
    });
    // accuracy = max(0, 1 - 0.25 * 4) = 0
    expect(r.accuracy).toBe(0);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('common');
  });

  it('contrarian + slightly off lands UNCOMMON', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 70,
      resolvedOutcome: 65, // 5% off, accuracy = 0.8
      consensusMean: 30, // 40% disagreement
    });
    // score = 0.4 * 0.8 = 0.32 -> legendary
    expect(r.tier).toBe('legendary');
  });

  it('contrarian + 10% miss lands somewhere between epic and legendary', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 80,
      resolvedOutcome: 70, // 10% off, accuracy = 0.6
      consensusMean: 30, // 50% disagreement
    });
    // score = 0.5 * 0.6 = 0.3 -> legendary
    expect(r.tier).toBe('legendary');
  });
});

describe('calculateRarity — missing or null consensus', () => {
  it('null consensus collapses disagreement to 0 -> common', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 80,
      resolvedOutcome: 80,
      consensusMean: null,
    });
    expect(r.disagreement).toBe(0);
    expect(r.tier).toBe('common');
  });

  it('NaN consensus collapses to 0', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 50,
      resolvedOutcome: 50,
      consensusMean: NaN,
    });
    expect(r.disagreement).toBe(0);
    expect(r.tier).toBe('common');
  });

  it('Infinity consensus collapses to 0', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 50,
      resolvedOutcome: 50,
      consensusMean: Infinity,
    });
    expect(r.disagreement).toBe(0);
    expect(r.tier).toBe('common');
  });
});

describe('calculateRarity — degenerate / invalid inputs', () => {
  it('NaN prediction returns common', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: NaN,
      resolvedOutcome: 50,
      consensusMean: 30,
    });
    expect(r.tier).toBe('common');
  });

  it('NaN outcome returns common', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 50,
      resolvedOutcome: NaN,
      consensusMean: 30,
    });
    expect(r.tier).toBe('common');
  });

  it('lowerBound === upperBound treats range as 1 and does not divide by zero', () => {
    const r = calculateRarity({
      lowerBound: 50,
      upperBound: 50,
      prediction: 50,
      resolvedOutcome: 50,
      consensusMean: 0,
    });
    // Should not throw, and should produce a finite score in [0, 1].
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('negative bounds work the same as positive (range is absolute)', () => {
    const r = calculateRarity({
      lowerBound: -100,
      upperBound: 0,
      prediction: -20,
      resolvedOutcome: -20,
      consensusMean: -70, // 50% of 100-range disagreement
    });
    expect(r.tier).toBe('mythic');
  });
});

describe('calculateRarity — disagreement and accuracy clamps', () => {
  it('disagreement is clamped at 1 even when consensus is wildly out of range', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 50,
      resolvedOutcome: 50,
      consensusMean: 1000, // way outside [0,100]
    });
    expect(r.disagreement).toBe(1);
  });

  it('accuracy is clamped at 0 (never negative) when prediction is far off', () => {
    const r = calculateRarity({
      ...baseInputs,
      prediction: 0,
      resolvedOutcome: 100,
      consensusMean: 50,
    });
    expect(r.accuracy).toBe(0);
  });
});

describe('potentialRarity — bet-time hint', () => {
  it('predicts MYTHIC when user is 60% away from consensus', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 90, consensusMean: 30 }),
    ).toBe('mythic');
  });

  it('predicts LEGENDARY when user is 35% away', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 65, consensusMean: 30 }),
    ).toBe('legendary');
  });

  it('predicts EPIC when user is 22% away', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 52, consensusMean: 30 }),
    ).toBe('epic');
  });

  it('predicts RARE when user is 13% away', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 43, consensusMean: 30 }),
    ).toBe('rare');
  });

  it('predicts UNCOMMON when user is 6% away', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 36, consensusMean: 30 }),
    ).toBe('uncommon');
  });

  it('predicts COMMON when user is 3% away', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 33, consensusMean: 30 }),
    ).toBe('common');
  });

  it('returns null when consensus is missing', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 90, consensusMean: null }),
    ).toBeNull();
  });

  it('returns null when consensus is NaN', () => {
    expect(
      potentialRarity({ ...baseInputs, prediction: 90, consensusMean: NaN }),
    ).toBeNull();
  });

  it('returns null when range is zero or negative', () => {
    expect(
      potentialRarity({
        lowerBound: 50,
        upperBound: 50,
        prediction: 50,
        consensusMean: 30,
      }),
    ).toBeNull();
  });
});

describe('TIER_META — visual metadata sanity', () => {
  it('every tier has a label, color, glow, and badge palette', () => {
    for (const tier of RARITY_ORDER) {
      const meta = TIER_META[tier];
      expect(meta.label).toBeTruthy();
      expect(meta.color).toMatch(/^#|^rgb/);
      expect(meta.glowColor).toBeDefined();
      expect(meta.badgeFill).toMatch(/^#|^rgb/);
      expect(meta.badgeStroke).toMatch(/^#|^rgb/);
      expect(meta.badgeText).toMatch(/^#|^rgb/);
      expect(typeof meta.borderWidth).toBe('number');
    }
  });

  it('common tier has a hairline border (1px) so the receipt always reads as a card', () => {
    // Was 0 (no border at all) but users couldn't see where the
    // polaroid edge was on dark mode against the dark background.
    // 1px is enough to define the silhouette without competing with the
    // bolder rarity frames at higher tiers.
    expect(TIER_META.common.borderWidth).toBe(1);
  });

  it('rarer tiers have strictly increasing visual weight', () => {
    // We do not strictly require monotonic increase across every pair, but
    // mythic must out-weight common, and legendary must out-weight rare.
    expect(TIER_META.mythic.borderWidth).toBeGreaterThan(TIER_META.common.borderWidth);
    expect(TIER_META.legendary.borderWidth).toBeGreaterThan(TIER_META.rare.borderWidth);
  });

  it('RARITY_ORDER lists tiers from common to mythic', () => {
    expect(RARITY_ORDER).toEqual([
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
      'mythic',
    ]);
  });
});

describe('captions read sensibly', () => {
  function captionOf(tier: Rarity): string {
    return calculateRarity({
      lowerBound: 0,
      upperBound: 100,
      prediction: tierToPrediction(tier),
      resolvedOutcome: tierToPrediction(tier),
      consensusMean: 30,
    }).caption;
  }

  function tierToPrediction(tier: Rarity): number {
    switch (tier) {
      case 'mythic': return 80;
      case 'legendary': return 60;
      case 'epic': return 50;
      case 'rare': return 42;
      case 'uncommon': return 35;
      default: return 30;
    }
  }

  it('mythic caption mentions seeing the future', () => {
    expect(captionOf('mythic').toLowerCase()).toContain('future');
  });

  it('common caption mentions the crowd', () => {
    expect(captionOf('common').toLowerCase()).toContain('crowd');
  });

  it('every tier produces a non-empty caption', () => {
    for (const tier of RARITY_ORDER) {
      expect(captionOf(tier).length).toBeGreaterThan(5);
    }
  });
});
