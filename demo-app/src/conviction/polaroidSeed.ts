/**
 * Polaroid seed system.
 *
 * Every visual decision a Polaroid makes — palette family, star pattern,
 * frame ornaments, signature glyph, watermark angle, grain orientation —
 * derives from a deterministic seed that itself derives from EVERY input
 * the user has any control over: market id, position id, username, the
 * reasoning text, prediction, spread, conviction, collateral (stake),
 * shape, and the precise createdAt timestamp.
 *
 * Why this matters: it guarantees that no two receipts can ever be
 * visually identical. Two users on the same market with the same
 * prediction will still produce different polaroids because their
 * usernames, reasoning text, and timestamps differ. The same user re-
 * predicting on the same market produces a new polaroid because the
 * timestamp differs. Even moving the stake slider by $1 perturbs the
 * seed and shifts the visual.
 *
 * The functions in this module are pure (no DOM access) and deterministic
 * (the same input always produces the same output). The Polaroid component
 * threads `seed` through every procedural decision.
 */

import type { Rarity } from './rarity';

/**
 * The inputs that contribute to a polaroid's identity. The order of fields
 * matters — changing the order changes the seed for existing receipts.
 * Add new fields at the bottom and treat the current ordering as a binary
 * compatibility contract for stored receipts.
 */
export interface SeedInputs {
  marketId: string | number;
  positionId: string | number;
  username: string;
  reasoning: string;
  prediction: number;
  spread: number;
  conviction: number;
  /** Stake in dollars. Used to perturb visual ornaments. */
  collateral: number;
  shape: 'gaussian' | 'range' | 'bimodal';
  createdAt: string;
}

/**
 * Compose the canonical seed string. We round numeric inputs lightly so
 * imperceptible floating-point jitter doesn't change the seed (the user
 * dragging a slider one pixel shouldn't completely re-roll the visual),
 * but every meaningful change does perturb it.
 */
export function seedFromInputs(input: SeedInputs): number {
  const parts = [
    String(input.marketId),
    String(input.positionId),
    input.username,
    input.reasoning,
    // 3 sig figs is enough granularity to distinguish meaningfully
    // different slider values without re-rolling on every pixel of drag.
    roundSig(input.prediction, 3),
    roundSig(input.spread, 3),
    roundSig(input.conviction, 3),
    // 3 sig figs on collateral so every $1 step in [1, 999] produces a
    // distinct seed (the user explicitly asked that every slider change
    // shift the visual, including stake).
    roundSig(input.collateral, 3),
    input.shape,
    input.createdAt,
  ];
  return fnv1a(parts.join('\u241f'));
}

/**
 * Fast non-cryptographic 32-bit hash. We use FNV-1a because it's tiny,
 * has good avalanche properties for short ASCII inputs, and produces
 * uniformly-distributed outputs sufficient for visual variety.
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

/**
 * Mulberry32 PRNG. Returns a generator that produces uniform [0, 1) numbers
 * from a 32-bit integer seed. The same seed produces the same sequence on
 * every call to mulberry32(seed)().
 */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pull `n` evenly-distributed numbers in [0, 1) from a seed. Convenience
 * wrapper so callers don't need to instantiate the PRNG themselves.
 */
export function rngSeries(seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng());
  return out;
}

/**
 * One of the visual decisions the seed drives: which "palette family"
 * the photo uses. This was previously the user-selected Step 3 preset;
 * Step 3 has been removed and the choice is now derived from rarity
 * (when known) plus a per-receipt seed offset. The result is that
 * Common receipts cluster in earthy/muted families, while higher tiers
 * shift toward aurora/gold/ember without two receipts in the same tier
 * looking identical.
 *
 * `tier` may be null for unresolved bets (preview phase) — in that case
 * we use the bet's potential rarity (passed via `potentialTier`) so the
 * preview hints at what the user is gunning for.
 */
export type PaletteFamily =
  | 'sunset'
  | 'twilight'
  | 'aurora'
  | 'botanical'
  | 'rosegold'
  | 'noir'
  | 'goldleaf'
  | 'oracle';

/** Per-tier set of acceptable palette families, in priority order. */
const TIER_PALETTE_POOL: Record<Rarity, PaletteFamily[]> = {
  // Common: muted, earthy. Botanical or twilight; never the showy ones.
  common: ['twilight', 'botanical'],
  // Uncommon: still mostly earth, but a hint of warmth.
  uncommon: ['botanical', 'sunset', 'twilight'],
  // Rare: cooler-but-vivid. Aurora and rose start showing up.
  rare: ['aurora', 'rosegold', 'sunset'],
  // Epic: vivid. Mythical-looking palettes start appearing.
  epic: ['aurora', 'rosegold', 'oracle'],
  // Legendary: gold-leaf or aurora.
  legendary: ['goldleaf', 'aurora', 'oracle'],
  // Mythic: the rarest, most elaborate palettes. Gold leaf or oracle
  // (deep violet w/ gold).
  mythic: ['goldleaf', 'oracle'],
};

/**
 * Pick a deterministic palette family from the seed + (optional) tier.
 * The lookup goes: tier's allowed pool, deterministically rotated by
 * seed. When tier is null, the full pool is allowed.
 */
export function pickPaletteFamily(seed: number, tier: Rarity | null): PaletteFamily {
  const pool = tier ? TIER_PALETTE_POOL[tier] : ALL_FAMILIES;
  return pool[seed % pool.length];
}

const ALL_FAMILIES: PaletteFamily[] = [
  'sunset', 'twilight', 'aurora', 'botanical', 'rosegold', 'noir', 'goldleaf', 'oracle',
];

/**
 * Round a finite number to `sig` significant figures. NaN/Infinity collapse
 * to 0 to keep seed strings stable across degenerate inputs.
 */
function roundSig(n: number, sig: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const mag = Math.pow(10, sig - Math.floor(Math.log10(Math.abs(n))) - 1);
  return String(Math.round(n * mag) / mag);
}

/**
 * Time-based develop progress.
 *
 * Pre-resolution: develop progress eases from 0 (just placed) toward 1 as
 * the market approaches its resolution date. A receipt placed near the
 * resolution date develops faster than one placed at issuance, because
 * the user effectively gets less time to sit with the developing image.
 *
 * Resolved + accurate: returns 1 — fully developed.
 * Resolved + inaccurate: returns the "ruined" cap (default 0.45). The
 * photo never reaches full color or sharpness, evoking a real polaroid
 * that was light-leaked or never agitated.
 *
 * Returns a number in [0, 1].
 */
export interface DevelopProgressInputs {
  /** ISO string of when the bet was placed. */
  createdAt: string;
  /** ISO string of when the market resolves. May be null. */
  expiresAt: string | null;
  /** 'open' or 'resolved' (others treated as open). */
  resolutionState: 'open' | 'resolved' | 'voided' | string | undefined;
  /** Accuracy in [0, 1] when known, null otherwise. */
  accuracy: number | null;
  /** Optional `now` injection for testing. Defaults to Date.now(). */
  now?: number;
}

export function developProgress(input: DevelopProgressInputs): number {
  const { resolutionState, accuracy } = input;
  if (resolutionState === 'resolved') {
    if (accuracy == null) return 0.55;
    // Accuracy > 0.6 means "called it" → fully developed
    // 0.4-0.6 means "close" → reaches ~0.85 (still readable, slightly soft)
    // < 0.4 means "missed" → capped at 0.4-0.45 (ruined polaroid)
    if (accuracy >= 0.6) return 1;
    if (accuracy >= 0.4) return 0.55 + (accuracy - 0.4) * 1.5; // .55 → .85
    return Math.max(0.2, Math.min(0.45, 0.2 + accuracy * 0.625));
  }
  // Open: develop continuously between bet time and resolution time.
  const placed = Date.parse(input.createdAt);
  if (!Number.isFinite(placed)) return 0.25;
  const now = input.now ?? Date.now();
  const expires = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
  if (!Number.isFinite(expires) || expires <= placed) {
    // No resolution window known; show a faded "still curing" image at
    // ~25% so it's visible but obviously incomplete.
    return 0.25;
  }
  const span = expires - placed;
  const elapsed = Math.max(0, Math.min(span, now - placed));
  // Quadratic easing on develop so it stays visibly "in progress" most
  // of the way and only crisps up near the deadline — the resolution
  // moment is the payoff.
  const t = elapsed / span;
  return 0.18 + Math.pow(t, 1.6) * 0.62; // ramps from .18 to .80 pre-resolution
}
