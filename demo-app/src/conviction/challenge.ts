/**
 * Challenge plumbing — "Receipt for Receipt" mechanic.
 *
 * A user can challenge ANOTHER user's open conviction by pre-filling
 * the BetFlow page with a mirrored position. The flow:
 *
 *   1. Receipt page (someone else's call, still open) -> user clicks
 *      `Challenge this call` button.
 *   2. We encode the original call's prediction / reasoning / username
 *      into a single base64 query parameter and navigate to
 *      `/m/<marketId>?challenge=<encoded>`.
 *   3. BetFlow reads the challenge param at mount and SEEDS the
 *      sliders + textarea with the mirrored counter-bet:
 *        - prediction = consensus mirrored across the original call,
 *          clamped to the market's bounds. (If the original called
 *          high, the counter calls low at equal distance from the
 *          crowd.)
 *        - reasoning  = a Markdown blockquote of the original user's
 *          reasoning, plus a one-line lead-in inviting the challenger
 *          to argue back.
 *        - conviction = 0.5 starting point. We deliberately do NOT
 *          mirror conviction: the challenger should re-evaluate from
 *          a neutral baseline, not adopt the original's certainty.
 *        - shape      = matches the original (gaussian/range/bimodal)
 *          so the counter sits on the same axis.
 *
 * All four state derivations are PURE functions of (challenge payload,
 * market). The BetFlow page wires them in a single `useEffect` that
 * runs once when both the market AND the challenge payload are
 * available; afterwards the user's slider drags take over.
 *
 * Safety: every decoder path returns null instead of throwing if the
 * payload is malformed. The BetFlow page falls back to its default
 * "centre on the consensus" seeding when this happens, so a bad
 * challenge URL never crashes the page.
 */

import { encodePayload, decodePayload, type SharedPayload } from './hash';

const CHALLENGE_PARAM = 'challenge';

/**
 * Build the `/m/:marketId?challenge=...` URL for a one-click counter
 * bet. The Receipt page's "Challenge this call" button calls this.
 */
export function buildChallengeUrl(
  marketId: string | number,
  original: SharedPayload,
): string {
  const path = `/m/${encodeURIComponent(String(marketId))}`;
  const encoded = encodePayload(original);
  return `${path}?${CHALLENGE_PARAM}=${encoded}`;
}

/**
 * Pure: decode a challenge query string into a SharedPayload.
 * Returns null when the parameter is missing or malformed.
 */
export function decodeChallengeFromSearch(
  search: string | URLSearchParams | null | undefined,
): SharedPayload | null {
  if (!search) return null;
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const encoded = params.get(CHALLENGE_PARAM);
  if (!encoded) return null;
  return decodePayload(encoded);
}

/**
 * Compute the mirrored counter-prediction.
 *
 *   counter = consensusMean - (original - consensusMean)
 *           = 2 * consensusMean - original
 *
 * Clamped to [lowerBound, upperBound]. If the consensus is unknown we
 * fall back to (lower + upper) / 2 so the counter still lands inside
 * the range. If the original prediction is already on top of consensus
 * the mirror is consensus itself, which is a defensible "I have no
 * strong opinion either way" starting point for the challenger.
 */
export function mirrorPrediction(
  original: number,
  consensusMean: number | null | undefined,
  lowerBound: number,
  upperBound: number,
): number {
  const lo = Math.min(lowerBound, upperBound);
  const hi = Math.max(lowerBound, upperBound);
  const safeMid = (lo + hi) / 2;
  const anchor =
    consensusMean != null && Number.isFinite(consensusMean) ? consensusMean : safeMid;
  const raw = 2 * anchor - original;
  return Math.max(lo, Math.min(hi, raw));
}

/**
 * Compose the Markdown blockquote that prefills the reasoning
 * textarea. Caps at 160 chars per source line so the quote never
 * dominates the polaroid's caption strip.
 */
export function buildChallengeReasoning(original: SharedPayload): string {
  const handle = original.username ? `@${original.username}` : 'they';
  const said = (original.reasoning ?? '').trim();
  const quoted = said ? `"${truncate(said, 140)}"` : '(no reasoning posted)';
  return `Counter to ${handle}: ${quoted}\n\nMy take:`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
}

/**
 * Build the full seed object the BetFlow page applies in its
 * initialisation effect. The function is pure so tests can pin every
 * derivation in one shot.
 */
export interface ChallengeSeed {
  /** The mirrored counter-prediction. */
  prediction: number;
  /** The starting conviction (always 0.5 — see module header). */
  conviction: number;
  /** The reasoning blockquote. */
  reasoning: string;
  /** The original shape (so the counter visualises against the same axis). */
  shape: 'gaussian' | 'range' | 'bimodal';
  /** The handle being challenged. Surfaced as an eyebrow on the page. */
  challengedHandle: string | null;
}

export function buildChallengeSeed(
  original: SharedPayload,
  marketConfig: { consensusMean: number | null; lowerBound: number; upperBound: number },
): ChallengeSeed {
  const prediction = mirrorPrediction(
    Number(original.prediction ?? marketConfig.consensusMean ?? (marketConfig.lowerBound + marketConfig.upperBound) / 2),
    marketConfig.consensusMean,
    marketConfig.lowerBound,
    marketConfig.upperBound,
  );
  const shapeIn = original.shape;
  const shape: 'gaussian' | 'range' | 'bimodal' =
    shapeIn === 'range' || shapeIn === 'bimodal' ? shapeIn : 'gaussian';
  return {
    prediction,
    conviction: 0.5,
    reasoning: buildChallengeReasoning(original),
    shape,
    challengedHandle: original.username ?? null,
  };
}
