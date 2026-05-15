/**
 * Conviction streak — derived purely from the local rarity ledger.
 *
 * "Streak" here is the LONGEST consecutive run of resolved-and-accurate
 * bets ending at the user's most recent resolution. The metric reads
 * the same way fitness apps read step streaks: the user is currently
 * on a hot streak if their most recent resolved bet was accurate; the
 * streak resets to zero on the first miss they encounter walking
 * backwards through their resolution history.
 *
 * A bet counts toward the streak when:
 *   - Its `resolutionState` is 'resolved'
 *   - Its accuracy (computed against `consensusAtBet` + `resolvedOutcome`)
 *     is at least `MIN_STREAK_ACCURACY` (default 0.6, matches the rarity
 *     "called it" threshold used elsewhere in the app)
 *
 * Open bets and voided bets are SKIPPED entirely — they don't break a
 * streak and they don't contribute to one. This mirrors how most
 * streak systems handle "not played today" days.
 *
 * The function is intentionally pure: it takes a denormalised list of
 * resolved-with-accuracy records and returns a `{ current, longest }`
 * pair. Production callers (Profile, NavBar) compute the input list
 * from the local rarity ledger using `calculateRarity`. Tests can pass
 * synthetic records directly.
 *
 * Why we don't cap the streak: the halo treatment in the NavBar caps
 * the visual at 6 concentric rings + a comet at 10, but the underlying
 * number is uncapped so future treatments (year-in-review, achievements)
 * can use the full magnitude.
 */

export interface StreakInput {
  /** ISO timestamp of when the bet resolved. We sort descending by this
   *  so the "current streak" is the run ending at the most recent
   *  resolution. */
  resolvedAt: string;
  /** Accuracy in [0, 1]. Null records are treated as "not yet resolved"
   *  and skipped. */
  accuracy: number | null;
  /** Resolution state — only 'resolved' contributes to the streak. */
  resolutionState: 'open' | 'resolved' | 'voided' | string | null;
}

export interface StreakSummary {
  /** Length of the streak ending at the most recent resolved bet. */
  current: number;
  /** Length of the longest streak ever, anywhere in the user's history. */
  longest: number;
  /** Total number of resolved-and-accurate bets across all history. */
  hits: number;
  /** Total number of resolved bets (hits + misses). */
  resolved: number;
}

export const MIN_STREAK_ACCURACY = 0.6;

/**
 * Compute the streak summary from a list of resolution records.
 *
 * The function performs three passes:
 *   1. Filter to RESOLVED records only (open + voided are dropped).
 *   2. Sort DESCENDING by `resolvedAt` so the most recent comes first.
 *   3. Walk the list; the "current" streak is the prefix of accurate
 *      bets at the head, and the "longest" streak is the maximum run
 *      anywhere.
 *
 * All three counts are clamped to non-negative integers — even if the
 * caller passes garbage timestamps the function never returns NaN.
 */
export function computeStreak(input: StreakInput[]): StreakSummary {
  if (!Array.isArray(input) || input.length === 0) {
    return { current: 0, longest: 0, hits: 0, resolved: 0 };
  }

  const resolved = input.filter((r) => r.resolutionState === 'resolved');
  resolved.sort((a, b) => {
    const ta = Date.parse(a.resolvedAt);
    const tb = Date.parse(b.resolvedAt);
    // Records with un-parseable timestamps sink to the back so they
    // don't pollute the "current" prefix walk.
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return tb - ta;
  });

  let current = 0;
  let longest = 0;
  let run = 0;
  let hits = 0;
  let walkingPrefix = true;

  for (const r of resolved) {
    const isHit =
      r.accuracy != null &&
      Number.isFinite(r.accuracy) &&
      r.accuracy >= MIN_STREAK_ACCURACY;
    if (isHit) {
      run += 1;
      hits += 1;
      if (walkingPrefix) current = run;
      if (run > longest) longest = run;
    } else {
      run = 0;
      walkingPrefix = false;
    }
  }

  return {
    current,
    longest,
    hits,
    resolved: resolved.length,
  };
}

/**
 * Map a current streak length to the NavBar halo "tier."
 *
 * The visual treatment escalates in 4 steps so the halo always reads
 * as a discrete badge, never an analog slider:
 *
 *   - 0:        no halo
 *   - 1..2:     a single thin ember ring (warm-up)
 *   - 3..5:     thicker ring with a soft outer glow
 *   - 6..9:     two concentric rings
 *   - 10+:      two rings + an orbiting comet glyph
 *
 * The function returns a numeric tier 0..4 plus an `aria` label for
 * accessibility. The NavBar component reads the tier and renders the
 * matching SVG ornament.
 */
export type HaloTier = 0 | 1 | 2 | 3 | 4;

export interface HaloTreatment {
  tier: HaloTier;
  /** Human-readable label e.g. "3-bet streak". Used as the avatar's
   *  aria-label and as a hover tooltip. */
  label: string;
}

export function haloTreatmentForStreak(current: number): HaloTreatment {
  if (!Number.isFinite(current) || current <= 0) {
    return { tier: 0, label: 'No active streak' };
  }
  const tier: HaloTier = current >= 10 ? 4 : current >= 6 ? 3 : current >= 3 ? 2 : 1;
  return {
    tier,
    label: `${current}-bet hot streak`,
  };
}
