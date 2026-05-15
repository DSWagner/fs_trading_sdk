/**
 * Calibration scoring.
 *
 * "Calibration" answers a simple question: when you said you were 80%
 * sure, were you right 80% of the time? A perfectly calibrated bettor
 * has conviction == accuracy on every settled bet. A bettor who
 * always says "100% sure" but is right only half the time is wildly
 * over-confident. A bettor who hedges to "60% sure" on layups they
 * always get right is under-confident.
 *
 * We score this with the simplest defensible metric:
 *
 *     calibration = 1 - mean(|conviction - accuracy|)
 *
 * Each resolved bet contributes one absolute error |conviction -
 * accuracy| in [0, 1]. We average those errors across the bettor's
 * settled history and subtract from 1, so a calibration score lives
 * in [0, 1] with 1 meaning perfectly calibrated and 0 meaning every
 * call was as wrong as it could be (max confidence, zero accuracy
 * or vice versa).
 *
 * Why this metric and not Brier / log-loss:
 *   - Brier and log-loss assume binary outcomes. Conviction's bets
 *     are continuous (a prediction in [lowerBound, upperBound]), and
 *     accuracy is itself a derived continuous value in [0, 1]. Mean
 *     absolute calibration error handles continuous accuracy natively
 *     without us having to threshold.
 *   - It's intuitive to non-quants: "your calls are 73% calibrated"
 *     reads as "you mean what you say about three quarters of the
 *     time." Brier scores in [0, 1] don't have the same direct
 *     interpretation.
 *
 * We deliberately ignore unresolved bets. Calibration only makes sense
 * once outcomes are observable; counting open bets would conflate
 * "you've gone all-in on five not-yet-resolved markets" with
 * "you've actually been right 80% of the time."
 *
 * The function is pure: it takes a list of {conviction, accuracy} pairs
 * and returns a {score, hits, samples} triple. The leaderboard page
 * computes the input list from `getAllBets()` + demo galleries +
 * `useMarkets`.
 */

export interface CalibrationSample {
  /** The conviction value the bettor staked, in [0, 1]. */
  conviction: number;
  /** The accuracy the bet resolved to, in [0, 1]. Null skips this row. */
  accuracy: number | null;
}

export interface CalibrationScore {
  /** Calibration score in [0, 1]. 1 = perfectly calibrated. */
  score: number;
  /** Resolved bets where the bettor's accuracy was at least 0.6
   *  (the "called it" threshold reused from rarity). */
  hits: number;
  /** Number of resolved bets that contributed to the score. */
  samples: number;
  /** Mean absolute error |conviction - accuracy|, in [0, 1]. */
  meanError: number;
  /** Mean conviction across resolved bets. Surfaces "confidence" as
   *  a sibling to "calibration" on the leaderboard. */
  meanConviction: number;
}

const HIT_THRESHOLD = 0.6;

/**
 * Compute the calibration score for a single bettor's history.
 * Returns null when there are zero resolved samples (the page
 * filters bettors with `samples === 0` out of the leaderboard rather
 * than rendering placeholder rows).
 */
export function calibrationScore(samples: ReadonlyArray<CalibrationSample>): CalibrationScore | null {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  let totalError = 0;
  let totalConviction = 0;
  let resolved = 0;
  let hits = 0;
  for (const s of samples) {
    if (s.accuracy == null || !Number.isFinite(s.accuracy)) continue;
    const c = clamp01(s.conviction);
    const a = clamp01(s.accuracy);
    totalError += Math.abs(c - a);
    totalConviction += c;
    resolved += 1;
    if (a >= HIT_THRESHOLD) hits += 1;
  }
  if (resolved === 0) return null;
  const meanError = totalError / resolved;
  const meanConviction = totalConviction / resolved;
  return {
    score: 1 - meanError,
    hits,
    samples: resolved,
    meanError,
    meanConviction,
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Build a leaderboard given a flat list of (username, sample) tuples.
 *
 * Output is sorted by score DESC. Users with zero resolved samples
 * are excluded entirely. Ties on score are broken by sample count
 * (more samples wins), then alphabetically by username (so the
 * order is stable for tests).
 */
export interface LeaderboardRow {
  username: string;
  score: CalibrationScore;
}

export function buildLeaderboard(
  pairs: ReadonlyArray<{ username: string; sample: CalibrationSample }>,
): LeaderboardRow[] {
  const grouped = new Map<string, CalibrationSample[]>();
  for (const { username, sample } of pairs) {
    if (!username) continue;
    if (!grouped.has(username)) grouped.set(username, []);
    grouped.get(username)!.push(sample);
  }
  const rows: LeaderboardRow[] = [];
  for (const [username, samples] of grouped) {
    const score = calibrationScore(samples);
    if (!score) continue;
    rows.push({ username, score });
  }
  rows.sort((a, b) => {
    if (b.score.score !== a.score.score) return b.score.score - a.score.score;
    if (b.score.samples !== a.score.samples) return b.score.samples - a.score.samples;
    return a.username.localeCompare(b.username);
  });
  return rows;
}
