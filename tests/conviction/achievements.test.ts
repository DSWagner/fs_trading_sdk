/**
 * Achievements: pure-function tests.
 *
 * The achievements module is a deterministic O(n) reducer over the
 * user's enriched bet ledger. These tests pin every defined badge so
 * a future refactor that silently breaks an unlock condition will be
 * caught here, not in production where a user opens their profile and
 * sees a missing trophy. They also pin the editorial guarantees:
 *
 *   - Achievements are MONOTONIC: more bets can never unlock fewer
 *     badges. The "any subset of bets unlocks <= total" invariant is
 *     enforced via a property-style test that adds bets one at a time
 *     and asserts the unlocked count never decreases.
 *   - The first-signed badge unlocks on the very first signed
 *     conviction so a new user always sees one filled tile.
 *   - The calibrator badge requires both volume (5 resolved) AND
 *     accuracy (>= 70%). Hitting one alone is not enough.
 *
 * The tests deliberately avoid mocking — the module is pure, so we
 * just build small `AchievementBet[]` ledgers inline.
 */
import { describe, it, expect } from 'vitest';
import {
  buildContext,
  evaluateAchievements,
  countUnlocked,
  ACHIEVEMENT_DEFINITIONS,
  type AchievementBet,
} from '../../demo-app/src/conviction/achievements';

function bet(overrides: Partial<AchievementBet> = {}): AchievementBet {
  return {
    rarity: 'common',
    accuracy: null,
    createdAt: '2026-05-10T12:00:00Z',
    conviction: 0.5,
    resolutionState: 'open',
    disagreement: 0,
    ...overrides,
  };
}

describe('buildContext', () => {
  it('returns zero-counts and empty resolved for an empty ledger', () => {
    const ctx = buildContext([]);
    expect(ctx.bets).toEqual([]);
    expect(ctx.resolved).toEqual([]);
    expect(ctx.tierCounts).toEqual({
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 0,
    });
  });

  it('counts each rarity tier exactly once per bet', () => {
    const ctx = buildContext([
      bet({ rarity: 'common' }),
      bet({ rarity: 'epic' }),
      bet({ rarity: 'epic' }),
      bet({ rarity: 'mythic' }),
      bet({ rarity: null }),
    ]);
    expect(ctx.tierCounts.common).toBe(1);
    expect(ctx.tierCounts.epic).toBe(2);
    expect(ctx.tierCounts.mythic).toBe(1);
  });

  it('filters resolved bets correctly (only "resolved" state counts)', () => {
    const ctx = buildContext([
      bet({ resolutionState: 'open' }),
      bet({ resolutionState: 'resolved' }),
      bet({ resolutionState: 'voided' }),
      bet({ resolutionState: 'resolved' }),
    ]);
    expect(ctx.resolved.length).toBe(2);
  });
});

describe('evaluateAchievements: empty ledger', () => {
  it('returns one record per definition, all locked', () => {
    const results = evaluateAchievements([]);
    expect(results.length).toBe(ACHIEVEMENT_DEFINITIONS.length);
    expect(results.every((a) => !a.unlocked)).toBe(true);
  });

  it('countUnlocked is 0 on empty ledger', () => {
    expect(countUnlocked([])).toBe(0);
  });
});

describe('evaluateAchievements: bronze tier unlocks', () => {
  it('unlocks "on the record" on a single bet', () => {
    const results = evaluateAchievements([bet()]);
    const first = results.find((a) => a.id === 'first-signed');
    expect(first?.unlocked).toBe(true);
  });

  it('unlocks the five-call streak at exactly five bets', () => {
    const ledger = Array.from({ length: 5 }, () => bet());
    const results = evaluateAchievements(ledger);
    const streak = results.find((a) => a.id === 'five-call-streak');
    expect(streak?.unlocked).toBe(true);
  });

  it('does NOT unlock the five-call streak at four bets', () => {
    const ledger = Array.from({ length: 4 }, () => bet());
    const results = evaluateAchievements(ledger);
    const streak = results.find((a) => a.id === 'five-call-streak');
    expect(streak?.unlocked).toBe(false);
  });

  it('unlocks first-verdict on one resolved bet', () => {
    const results = evaluateAchievements([bet({ resolutionState: 'resolved', accuracy: 0.4 })]);
    const verdict = results.find((a) => a.id === 'first-resolved');
    expect(verdict?.unlocked).toBe(true);
  });
});

describe('evaluateAchievements: silver tier unlocks', () => {
  it('unlocks contrarian-five with five disagreement >= 0.25 bets', () => {
    const ledger = Array.from({ length: 5 }, () => bet({ disagreement: 0.3 }));
    const results = evaluateAchievements(ledger);
    const con = results.find((a) => a.id === 'contrarian-five');
    expect(con?.unlocked).toBe(true);
  });

  it('does NOT unlock contrarian-five when only four bets disagree enough', () => {
    const ledger = [
      bet({ disagreement: 0.3 }),
      bet({ disagreement: 0.3 }),
      bet({ disagreement: 0.3 }),
      bet({ disagreement: 0.3 }),
      bet({ disagreement: 0.1 }),
    ];
    const results = evaluateAchievements(ledger);
    const con = results.find((a) => a.id === 'contrarian-five');
    expect(con?.unlocked).toBe(false);
  });

  it('unlocks sharp-call when any resolved bet hits accuracy >= 0.95', () => {
    const results = evaluateAchievements([
      bet({ resolutionState: 'resolved', accuracy: 0.4 }),
      bet({ resolutionState: 'resolved', accuracy: 0.96 }),
    ]);
    const sharp = results.find((a) => a.id === 'sharp-call');
    expect(sharp?.unlocked).toBe(true);
  });

  it('unlocks first-epic ONLY on an actual Epic receipt (strict-tier; a single Mythic does not satisfy First Epic)', () => {
    // Strict-tier predicate: First Epic needs an Epic-rarity bet,
    // not just "any rarity >= Epic". A Mythic-only ledger leaves
    // First Epic LOCKED, matching the rarity ledger directly above
    // the achievements wall in the UI ('Epic: 0').
    const epicOnly = evaluateAchievements([bet({ rarity: 'epic' })]).find((a) => a.id === 'first-epic');
    expect(epicOnly?.unlocked).toBe(true);
    const legOnly = evaluateAchievements([bet({ rarity: 'legendary' })]).find((a) => a.id === 'first-epic');
    expect(legOnly?.unlocked).toBe(false);
    const mythicOnly = evaluateAchievements([bet({ rarity: 'mythic' })]).find((a) => a.id === 'first-epic');
    expect(mythicOnly?.unlocked).toBe(false);
    const rareOnly = evaluateAchievements([bet({ rarity: 'rare' })]).find((a) => a.id === 'first-epic');
    expect(rareOnly?.unlocked).toBe(false);
  });
});

describe('evaluateAchievements: gold tier unlocks', () => {
  it('unlocks first-legendary ONLY on an actual Legendary receipt (strict-tier)', () => {
    const legOnly = evaluateAchievements([bet({ rarity: 'legendary' })]).find((a) => a.id === 'first-legendary');
    expect(legOnly?.unlocked).toBe(true);
    const mythicOnly = evaluateAchievements([bet({ rarity: 'mythic' })]).find((a) => a.id === 'first-legendary');
    expect(mythicOnly?.unlocked).toBe(false);
    const epicOnly = evaluateAchievements([bet({ rarity: 'epic' })]).find((a) => a.id === 'first-legendary');
    expect(epicOnly?.unlocked).toBe(false);
  });

  it('unlocks first-mythic only on a mythic receipt', () => {
    const m = evaluateAchievements([bet({ rarity: 'mythic' })]).find((a) => a.id === 'first-mythic');
    expect(m?.unlocked).toBe(true);
    const leg = evaluateAchievements([bet({ rarity: 'legendary' })]).find((a) => a.id === 'first-mythic');
    expect(leg?.unlocked).toBe(false);
  });

  it('regression: a single Mythic-only ledger unlocks First Mythic but NOT First Epic / First Legendary', () => {
    // The @critic_at_large demo gallery has exactly one Mythic bet.
    // The rarity ledger renders Epic: 0, Legendary: 0, Mythic: 1.
    // The achievements wall must agree: First Mythic unlocked, but
    // First Epic and First Legendary stay locked.
    const results = evaluateAchievements([
      bet({ rarity: 'mythic', resolutionState: 'resolved', accuracy: 1, conviction: 0.9 }),
    ]);
    const epic = results.find((a) => a.id === 'first-epic');
    const legendary = results.find((a) => a.id === 'first-legendary');
    const mythic = results.find((a) => a.id === 'first-mythic');
    expect(epic?.unlocked).toBe(false);
    expect(legendary?.unlocked).toBe(false);
    expect(mythic?.unlocked).toBe(true);
  });

  it('unlocks calibrator only with >=5 resolved AND mean accuracy >= 0.7', () => {
    // 4 resolved, all high accuracy — should still be locked (volume gate).
    const fewHigh = Array.from({ length: 4 }, () =>
      bet({ resolutionState: 'resolved', accuracy: 0.95 }),
    );
    expect(evaluateAchievements(fewHigh).find((a) => a.id === 'calibrated')?.unlocked).toBe(false);
    // 5 resolved but mean too low — locked.
    const lowAccuracy = Array.from({ length: 5 }, () =>
      bet({ resolutionState: 'resolved', accuracy: 0.5 }),
    );
    expect(evaluateAchievements(lowAccuracy).find((a) => a.id === 'calibrated')?.unlocked).toBe(false);
    // 5 resolved with high accuracy — unlocked.
    const highAccuracy = Array.from({ length: 5 }, () =>
      bet({ resolutionState: 'resolved', accuracy: 0.75 }),
    );
    expect(evaluateAchievements(highAccuracy).find((a) => a.id === 'calibrated')?.unlocked).toBe(true);
  });
});

describe('evaluateAchievements: monotonicity', () => {
  // Once an achievement unlocks, adding additional bets must never
  // make it lock again. This is core to the editorial promise that
  // a receipt is forever.
  it('unlocked count is monotonically non-decreasing as bets are added', () => {
    const stream: AchievementBet[] = [
      bet({ rarity: 'common' }),
      bet({ rarity: 'uncommon' }),
      bet({ rarity: 'rare', disagreement: 0.3 }),
      bet({ rarity: 'epic', disagreement: 0.4, resolutionState: 'resolved', accuracy: 0.92 }),
      bet({ rarity: 'legendary', disagreement: 0.3, resolutionState: 'resolved', accuracy: 0.86 }),
      bet({ rarity: 'mythic', resolutionState: 'resolved', accuracy: 0.99 }),
      bet({ rarity: 'mythic', resolutionState: 'resolved', accuracy: 0.75 }),
      bet({ rarity: 'mythic', resolutionState: 'resolved', accuracy: 0.8 }),
    ];
    const accumulating: AchievementBet[] = [];
    let lastUnlocked = -1;
    for (const b of stream) {
      accumulating.push(b);
      const n = countUnlocked(accumulating);
      expect(n).toBeGreaterThanOrEqual(lastUnlocked);
      lastUnlocked = n;
    }
    // Final ledger should unlock several badges.
    expect(lastUnlocked).toBeGreaterThanOrEqual(5);
  });
});

describe('evaluateAchievements: progress markers', () => {
  it('returns progress info for badges that define a target', () => {
    const results = evaluateAchievements([bet(), bet()]);
    const streak = results.find((a) => a.id === 'five-call-streak');
    expect(streak?.progress).toEqual({ current: 2, target: 5 });
  });

  it('caps progress current at target', () => {
    const ledger = Array.from({ length: 10 }, () => bet());
    const results = evaluateAchievements(ledger);
    const streak = results.find((a) => a.id === 'five-call-streak');
    expect(streak?.progress).toEqual({ current: 5, target: 5 });
  });
});
