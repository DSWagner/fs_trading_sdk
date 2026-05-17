/**
 * Achievements.
 *
 * Pure-function module that turns a user's enriched bet ledger into a
 * set of unlocked badges. Achievements are computed client-side from
 * the rarity ledger we already have — no extra engine calls, no
 * extra storage, no race conditions with the live engine.
 *
 * The achievement model is deliberately thin: every badge is a
 * deterministic predicate over the ledger plus a "tier" (bronze /
 * silver / gold) and a short, editorial caption. The badges show
 * up on the user's profile as a horizontal trophy strip; locked
 * badges are still rendered (greyed out) with their unlock condition
 * so the user can see what they're aiming for.
 *
 * Design constraints:
 *   - Pure. Same input -> same output. Easy to test.
 *   - Cheap. O(n) over the user's bets.
 *   - Cumulative. Achievements can never disappear after they unlock.
 *   - On-brand. Captions read as editorial prose, not arcade
 *     achievement-pop text.
 */

import type { Rarity } from './rarity';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementDefinition {
  id: string;
  label: string;
  tier: AchievementTier;
  /** Short locked-state hint. */
  hint: string;
  /** Short editorial flavor caption (shown when unlocked). */
  caption: string;
  /** Returns true when the user has unlocked this achievement. */
  predicate: (ctx: AchievementContext) => boolean;
  /** Numerator and denominator for progress display, when applicable. */
  progress?: (ctx: AchievementContext) => { current: number; target: number };
}

export interface AchievementUnlock {
  id: string;
  label: string;
  tier: AchievementTier;
  caption: string;
  hint: string;
  unlocked: boolean;
  progress?: { current: number; target: number };
}

export interface AchievementBet {
  rarity: Rarity | null;
  /** Accuracy in [0, 1] for resolved bets; null otherwise. */
  accuracy: number | null;
  /** ISO timestamp the bet was signed. */
  createdAt: string;
  /** Conviction in [0, 1]. */
  conviction: number;
  /** Resolution state — only "resolved" counts toward calibration. */
  resolutionState: 'open' | 'resolved' | 'voided' | null;
  /** How far the prediction was from consensus at bet time, normalised [0, 1]. */
  disagreement: number | null;
}

export interface AchievementContext {
  bets: AchievementBet[];
  resolved: AchievementBet[];
  tierCounts: Record<Rarity, number>;
}

/**
 * Build the achievement context from a list of bets. Public so
 * components can reuse it for filtering / counting elsewhere.
 */
export function buildContext(bets: AchievementBet[]): AchievementContext {
  const resolved = bets.filter((b) => b.resolutionState === 'resolved');
  const tierCounts: Record<Rarity, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  };
  for (const b of bets) {
    if (b.rarity) tierCounts[b.rarity] = (tierCounts[b.rarity] ?? 0) + 1;
  }
  return { bets, resolved, tierCounts };
}

/**
 * Definitions. Order matters for display.
 */
export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first-signed',
    label: 'On the record',
    tier: 'bronze',
    hint: 'Sign your first conviction.',
    caption: 'You signed your first conviction. The receipt is forever.',
    predicate: (ctx) => ctx.bets.length >= 1,
    progress: (ctx) => ({ current: Math.min(ctx.bets.length, 1), target: 1 }),
  },
  {
    id: 'five-call-streak',
    label: 'Five-call streak',
    tier: 'bronze',
    hint: 'Sign five convictions in total.',
    caption: 'Five convictions on the wall. You are building a record.',
    predicate: (ctx) => ctx.bets.length >= 5,
    progress: (ctx) => ({ current: Math.min(ctx.bets.length, 5), target: 5 }),
  },
  {
    id: 'first-resolved',
    label: 'First verdict',
    tier: 'bronze',
    hint: 'Hold a conviction until the market resolves.',
    caption: 'Your first verdict landed. Time to start grading yourself.',
    predicate: (ctx) => ctx.resolved.length >= 1,
    progress: (ctx) => ({ current: Math.min(ctx.resolved.length, 1), target: 1 }),
  },
  {
    id: 'contrarian-five',
    label: 'Contrarian five',
    tier: 'silver',
    hint: 'Sign five convictions at least 25% of the range from consensus.',
    caption:
      'Five bold calls that disagreed with the crowd by a quarter of the range or more.',
    predicate: (ctx) =>
      ctx.bets.filter((b) => (b.disagreement ?? 0) >= 0.25).length >= 5,
    progress: (ctx) => ({
      current: Math.min(ctx.bets.filter((b) => (b.disagreement ?? 0) >= 0.25).length, 5),
      target: 5,
    }),
  },
  {
    id: 'sharp-call',
    label: 'Sharp call',
    tier: 'silver',
    hint: 'Resolve a conviction within 5% of the truth.',
    caption: 'You landed within 5% of the truth on at least one call.',
    predicate: (ctx) => ctx.resolved.some((b) => (b.accuracy ?? 0) >= 0.95),
  },
  // The three "First <tier>" badges use STRICT-TIER predicates: each
  // unlocks only when an actual receipt of that exact tier exists in
  // the user's ledger. Earlier the predicates were cumulative (Mythic
  // also satisfied "First Epic" because Mythic >= Epic on the rarity
  // ladder), but Conviction's rarity isn't a level progression -- each
  // bet rolls its tier independently from disagreement x accuracy, so
  // a single Mythic does NOT imply you ever earned an Epic. The
  // cumulative version contradicted the rarity ledger directly above
  // the achievements wall: a user with one Mythic and zero Epics saw
  // "Epic: 0" in the ledger but "First Epic UNLOCKED" in the wall,
  // which read as a bug. Strict-tier matches the captions ("a sky-
  // purple sun", "the gold sky") and the on-screen ledger numbers.
  // Monotonicity is preserved: tierCounts can only grow as bets are
  // added, so once a tier is hit it stays unlocked forever.
  {
    id: 'first-epic',
    label: 'First Epic',
    tier: 'silver',
    hint: 'Earn an Epic-tier receipt.',
    caption: 'Your first Epic receipt — a sky-purple sun, hard-earned.',
    predicate: (ctx) => ctx.tierCounts.epic >= 1,
  },
  {
    id: 'first-legendary',
    label: 'First Legendary',
    tier: 'gold',
    hint: 'Earn a Legendary-tier receipt.',
    caption: 'The gold sky landed for you. A Legendary receipt is on the wall.',
    predicate: (ctx) => ctx.tierCounts.legendary >= 1,
  },
  {
    id: 'first-mythic',
    label: 'First Mythic',
    tier: 'gold',
    hint: 'Earn a Mythic-tier receipt — the rarest sky.',
    caption: 'You earned a Mythic. The crowd was wrong; you were right.',
    predicate: (ctx) => ctx.tierCounts.mythic >= 1,
  },
  {
    id: 'calibrated',
    label: 'Calibrator',
    tier: 'gold',
    hint: 'Hold a 70%+ accuracy rate across at least five resolved calls.',
    caption:
      'You are calibrated. Five or more verdicts in, and you keep landing the call.',
    predicate: (ctx) => {
      if (ctx.resolved.length < 5) return false;
      const meanAcc =
        ctx.resolved.reduce((s, b) => s + (b.accuracy ?? 0), 0) / ctx.resolved.length;
      return meanAcc >= 0.7;
    },
    progress: (ctx) => ({
      current: Math.min(ctx.resolved.length, 5),
      target: 5,
    }),
  },
];

/**
 * Evaluate all definitions against the user's ledger and return one
 * record per definition with `unlocked: boolean`.
 */
export function evaluateAchievements(bets: AchievementBet[]): AchievementUnlock[] {
  const ctx = buildContext(bets);
  return ACHIEVEMENT_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    tier: def.tier,
    caption: def.caption,
    hint: def.hint,
    unlocked: def.predicate(ctx),
    progress: def.progress?.(ctx),
  }));
}

/** Convenience: count how many achievements a user has unlocked. */
export function countUnlocked(bets: AchievementBet[]): number {
  return evaluateAchievements(bets).filter((a) => a.unlocked).length;
}
