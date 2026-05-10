/**
 * Rarity tiers for resolved Conviction receipts.
 *
 * A bet is "rare" when two things are simultaneously true:
 *   1. The user disagreed meaningfully with the crowd's consensus
 *   2. The user turned out to be right
 *
 * A confident-but-conventional call (agree with consensus, end up right) is
 * common. A confident-and-contrarian call that lands is mythic. The same
 * contrarian call that misses is just a miss, not a rarity. This is the
 * canonical "alpha" definition in prediction markets, applied to receipts.
 *
 * Rarity is undefined for open bets and intentionally returned as null in
 * that case. Callers should branch on `rarity != null` before rendering.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITY_ORDER: Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
];

export interface RarityInputs {
  prediction: number;
  resolvedOutcome: number;
  /** Crowd's consensus at the time the bet was placed. Null when unavailable. */
  consensusMean: number | null;
  lowerBound: number;
  upperBound: number;
}

export interface RarityResult {
  tier: Rarity;
  /** Final rarity score in [0, 1]. */
  score: number;
  /** How far from consensus the prediction was, normalised by range. [0, 1] */
  disagreement: number;
  /** How close the prediction was to the truth, normalised by range. 1 = perfect. */
  accuracy: number;
  /** Human-readable tier label, e.g. "Mythic". */
  label: string;
  /** One-sentence flavor caption. */
  caption: string;
}

export interface PotentialRarityInputs {
  prediction: number;
  consensusMean: number | null;
  lowerBound: number;
  upperBound: number;
}

/**
 * What rarity could this bet earn if the user is RIGHT (within ~3% of the
 * actual outcome)? Used during the bet flow to gamify slider movement.
 * Returns null if there is no consensus mean to disagree with.
 */
export function potentialRarity(inputs: PotentialRarityInputs): Rarity | null {
  const { prediction, consensusMean, lowerBound, upperBound } = inputs;
  if (consensusMean == null || !Number.isFinite(consensusMean)) return null;
  const range = upperBound - lowerBound;
  if (!Number.isFinite(range) || range <= 0) return null;
  if (!Number.isFinite(prediction)) return null;
  const disagreement = clamp01(Math.abs(prediction - consensusMean) / range);
  // Assume the user will be right (~3% off): accuracy ≈ 0.88
  const score = disagreement * 0.88;
  return scoreToTier(score);
}

/**
 * Calculate the actual rarity of a resolved bet. Falls back to a
 * disagreement-blind calculation if no consensus mean was recorded.
 */
export function calculateRarity(inputs: RarityInputs): RarityResult {
  const { prediction, resolvedOutcome, consensusMean, lowerBound, upperBound } = inputs;
  const rawRange = upperBound - lowerBound;
  const range = rawRange > 0 ? rawRange : 1;

  if (!Number.isFinite(prediction) || !Number.isFinite(resolvedOutcome)) {
    return baseResult('common', 0, 0, 0);
  }

  const error = Math.abs(prediction - resolvedOutcome) / range;
  // 0 error -> accuracy 1; 25% error -> accuracy 0; clamped.
  // The 4x multiplier makes accuracy fall off aggressively so that being
  // close-but-not-precise doesn't push you into legendary territory.
  const accuracy = clamp01(1 - error * 4);

  const disagreement =
    consensusMean != null && Number.isFinite(consensusMean)
      ? clamp01(Math.abs(prediction - consensusMean) / range)
      : 0;

  // Final score: contrarian AND correct. Multiplicative because each is a
  // necessary condition. A perfectly accurate consensus-following bet has
  // disagreement = 0 -> score 0 -> common.
  const score = disagreement * accuracy;
  const tier = scoreToTier(score);
  return baseResult(tier, score, disagreement, accuracy);
}

function scoreToTier(score: number): Rarity {
  if (score >= 0.45) return 'mythic';
  if (score >= 0.3) return 'legendary';
  if (score >= 0.18) return 'epic';
  if (score >= 0.1) return 'rare';
  if (score >= 0.04) return 'uncommon';
  return 'common';
}

function baseResult(
  tier: Rarity,
  score: number,
  disagreement: number,
  accuracy: number,
): RarityResult {
  return {
    tier,
    score,
    disagreement,
    accuracy,
    label: TIER_META[tier].label,
    caption: captionFor(tier, disagreement, accuracy),
  };
}

interface TierMeta {
  label: string;
  color: string;
  glowColor: string;
  borderWidth: number;
  badgeFill: string;
  badgeStroke: string;
  badgeText: string;
}

/**
 * Visual treatment per tier. Tuned to read clearly on the dark/sepia photo
 * portion of the Polaroid SVG. Colors stay in the editorial palette family
 * to keep the rarity stamp consistent with the rest of the receipt.
 */
/**
 * Per-tier visual treatment. Border widths and glow intensities were
 * bumped 2-3x from their original values because the user fed back that
 * the rarity tinge "as a thin frame around the polaroid is very poor
 * and almost not even visible." Now the rarer tiers wear a bold,
 * unmistakable frame in the tier signature colour, and the rarity
 * tinge also propagates through the polaroid's sky / sun glow /
 * ornament strip (see Polaroid.tsx rarityPalette).
 */
export const TIER_META: Record<Rarity, TierMeta> = {
  common: {
    // GREY — like any basic loot drop in any game. Neutral slate.
    label: 'Common',
    color: '#8E8E93',
    glowColor: 'transparent',
    borderWidth: 1,
    badgeFill: '#EAEAEC',
    badgeStroke: '#8E8E93',
    badgeText: '#4A4A50',
  },
  uncommon: {
    // GREEN — emerald / jade.
    label: 'Uncommon',
    color: '#33B26B',
    glowColor: 'rgba(51,178,107,0.40)',
    borderWidth: 3,
    badgeFill: '#DCF1E5',
    badgeStroke: '#33B26B',
    badgeText: '#1F6A40',
  },
  rare: {
    // BLUE — azure / cobalt.
    label: 'Rare',
    color: '#2E7DDC',
    glowColor: 'rgba(46,125,220,0.50)',
    borderWidth: 4,
    badgeFill: '#D6E6FA',
    badgeStroke: '#2E7DDC',
    badgeText: '#1A4A82',
  },
  epic: {
    // PURPLE — violet / royal purple.
    label: 'Epic',
    color: '#9B4DD8',
    glowColor: 'rgba(155,77,216,0.60)',
    borderWidth: 5,
    badgeFill: '#EEDFFA',
    badgeStroke: '#9B4DD8',
    badgeText: '#542080',
  },
  legendary: {
    // GOLDISH YELLOW — clearly yellow, not amber/brown.
    label: 'Legendary',
    color: '#F2C13B',
    glowColor: 'rgba(242,193,59,0.70)',
    borderWidth: 6,
    badgeFill: '#FDF3D4',
    badgeStroke: '#F2C13B',
    badgeText: '#6E5410',
  },
  mythic: {
    // WARM ORANGE — clearly orange, not red.
    label: 'Mythic',
    color: '#EE6B1F',
    glowColor: 'rgba(238,107,31,0.80)',
    borderWidth: 7,
    badgeFill: '#FFE5D2',
    badgeStroke: '#EE6B1F',
    badgeText: '#6B2A07',
  },
};

function captionFor(tier: Rarity, disagreement: number, accuracy: number): string {
  if (tier === 'mythic') return 'You saw the future. The crowd did not.';
  if (tier === 'legendary') return 'A rare contrarian call that landed.';
  if (tier === 'epic') return 'You bet against the crowd and won.';
  if (tier === 'rare') return 'A non-consensus call that paid off.';
  if (tier === 'uncommon') {
    return accuracy > 0.7 ? 'Slightly off-consensus and slightly right.' : 'Close to the truth.';
  }
  if (disagreement < 0.04) return 'In step with the crowd.';
  return 'A common outcome.';
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
