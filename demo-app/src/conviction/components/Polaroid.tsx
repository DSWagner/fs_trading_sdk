import { memo, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { palette, fonts, LIGHT_RAW } from '../theme';
import { calculateRarity, potentialRarity, TIER_META, type Rarity } from '../rarity';
import {
  seedFromInputs,
  mulberry32,
  fnv1a,
  developProgress,
} from '../polaroidSeed';

/**
 * The Polaroid — Conviction's signature receipt.
 *
 * Every visual decision is procedurally driven by a deterministic seed
 * that incorporates every input the user controls. No two receipts can
 * ever look identical: even tweaking the stake by $1 perturbs the seed
 * and shifts the visual.
 *
 * Lifecycle:
 *   1. Open + new: heavily faded, blurred, monochrome, no reasoning shown.
 *   2. Open + aging: continuously sharpens as resolution date approaches.
 *      Reasoning stays hidden — the receipt is "still developing."
 *   3. Resolved + accurate (>= 60%): fully developed. Reasoning blooms
 *      into the photo as a stylized quote. Rarity stamp pinned to top.
 *   4. Resolved + close (40-60%): partial develop. Light haze remains.
 *   5. Resolved + missed (< 40%): permanently ruined polaroid look. The
 *      image never reaches full sharpness or color, evoking a real
 *      polaroid that was light-leaked.
 */

export type PolaroidPreset = 'auto' | 'sunset' | 'twilight' | 'aurora' | 'botanical' | 'noir' | 'rosegold';

/**
 * Legacy preset list — kept exported so that older imports continue to
 * type-check during a soft migration. Step 3 (preset picker) has been
 * removed; the palette is now picked automatically from the receipt's
 * seed plus its rarity tier. The values here are no longer wired into
 * the UI but stick around for legacy share-payload decoding.
 */
export const POLAROID_PRESETS: { id: PolaroidPreset; label: string; sub: string }[] = [
  { id: 'auto', label: 'Auto', sub: 'Picks a palette from your prediction.' },
];

export interface PolaroidProps {
  marketId: string | number;
  positionId: string | number;
  marketTitle: string;
  marketUnits?: string;
  username: string;
  reasoning: string;
  createdAt: string;
  prediction: number;
  spread: number;
  /**
   * Second peak position for the `bimodal` shape. Pairs 1:1 with the
   * BetFlow "Second peak" slider, so the polaroid hill silhouette
   * matches the bottom-of-page chart curve EXACTLY (two independent
   * gaussians at `prediction` and `secondPeak`, weights 0.5 / 0.7).
   *
   * Legacy receipts that pre-date this field pass `null` /
   * `undefined`, in which case `densityAt` falls back to the original
   * symmetric `prediction +- spread*1.6` reconstruction so old
   * polaroids keep rendering the same shape they always did. Ignored
   * for `gaussian` and `range` shapes.
   */
  secondPeak?: number | null;
  conviction: number;
  collateral: number;
  shape: 'gaussian' | 'range' | 'bimodal';
  lowerBound: number;
  upperBound: number;
  resolvedOutcome?: number | null;
  resolutionState?: 'open' | 'resolved' | 'voided' | string;
  /**
   * ISO timestamp for when the market is scheduled to resolve. Drives the
   * pre-resolution develop progression. Null = no schedule known; the
   * receipt holds at its "fresh" develop level.
   */
  expiresAt?: string | null;
  width?: number;
  interactive?: boolean;
  /**
   * Legacy preset prop. Step 3 was removed; this prop is now ignored.
   * Kept in the type for backwards compatibility with old share payloads
   * and localStorage records that still serialize a preset value.
   */
  preset?: PolaroidPreset;
  /**
   * If true and the bet has resolved, plays a one-time 900 ms develop
   * transition on mount: the photo starts desaturated/blurred, then
   * sharpens. Use on the Receipt page so the resolution moment is visible.
   */
  animateDevelop?: boolean;
  /**
   * Consensus mean at the moment the bet was placed. Required to compute
   * rarity. When null/undefined the rarity treatment is suppressed.
   */
  consensusAtBet?: number | null;
  /**
   * Optional ACTUAL crowd-consensus density curve, sampled at any
   * number of evenly-spaced X positions across [lowerBound,
   * upperBound]. When provided, the back hill (consensus
   * silhouette) is drawn directly from this array instead of being
   * approximated as a Gaussian centred on `consensusAtBet`. This
   * makes the polaroid's back hill the EXACT same shape as the
   * orange "Market Consensus" curve in the bottom-of-page
   * Probability Density chart -- including bimodal / multimodal /
   * heavy-tailed distributions that a single-Gaussian
   * approximation flattens out. Pass the result of
   * `evaluateDensityCurve(market.consensus, lowerBound,
   * upperBound, n).map(p => p.y)` from the SDK's `useConsensus`
   * hook. Length is unconstrained -- the polaroid resamples at its
   * own internal grid via linear interpolation.
   */
  consensusCurve?: number[] | null;
  /**
   * Optional ACTUAL user-belief density curve, same contract as
   * `consensusCurve` but for the foreground hill. When provided,
   * the polaroid's front hill matches the chart's purple "Trade
   * Preview" curve pixel-for-pixel instead of relying on the
   * shape-driven `densityAt` reconstruction. Pass the result of
   * `evaluateDensityCurve(previewBelief, lowerBound, upperBound,
   * n).map(p => p.y)` from the SDK.
   */
  userCurve?: number[] | null;
  /**
   * Label used in the scale strip to mark the prediction tick. Defaults
   * to "you" because the overwhelmingly common case is a polaroid that
   * represents the viewer's OWN bet. ComparisonPair overrides this to
   * "crowd" when it renders the aggregate-consensus crowd polaroid next
   * to the user's, so the strip reads "crowd · 38.45" instead of the
   * misleading "you · 38.45" on the crowd column.
   */
  predictionLabel?: string;
}

// Internal implementation; the exported `Polaroid` below wraps this in
// `React.memo` so parents that re-render without changing the polaroid's
// props (e.g. the BetFlow page on a slider tick that only affects the
// chart's payout preview) don't trigger the expensive `buildPhoto` /
// SVG regen. Combined with `useDeferredValue` on the seed inputs in
// BetFlow.tsx, this caps the polaroid's redraw cadence at the browser's
// natural paint rate even while the user drags a slider at 60+ Hz.
function PolaroidImpl(props: PolaroidProps) {
  const {
    marketTitle,
    marketUnits = '',
    username,
    reasoning,
    createdAt,
    prediction,
    spread,
    secondPeak = null,
    conviction,
    collateral,
    shape,
    lowerBound,
    upperBound,
    resolvedOutcome = null,
    resolutionState = 'open',
    expiresAt = null,
    width = 320,
    interactive = false,
    animateDevelop = false,
    consensusAtBet = null,
    consensusCurve = null,
    userCurve = null,
    predictionLabel = 'you',
  } = props;

  const developed = resolutionState === 'resolved';

  // Rarity is known whenever the bet has resolved with an outcome AND a
  // recorded consensus-at-bet. Otherwise we treat the rarity slot as null
  // and skip the stamp + extra visual treatment.
  const rarityCalc = useMemo(() => {
    if (!developed) return null;
    if (resolvedOutcome == null || !Number.isFinite(resolvedOutcome)) return null;
    if (consensusAtBet == null || !Number.isFinite(consensusAtBet)) return null;
    return calculateRarity({
      prediction,
      resolvedOutcome,
      consensusMean: consensusAtBet,
      lowerBound,
      upperBound,
    });
  }, [developed, resolvedOutcome, consensusAtBet, prediction, lowerBound, upperBound]);
  const rarity: Rarity | null = rarityCalc?.tier ?? null;
  // Effective rarity used to drive the visual palette + sun count.
  //
  // For RESOLVED bets: equal to the actual rarity tier (or null if
  // consensusAtBet is missing).
  // For OPEN bets / previews: use the user's POTENTIAL rarity — the tier
  // they'd land if they're right. This is what makes the live preview
  // visibly shift colour as the user drags the prediction away from
  // consensus: a wild contrarian call previews as ember/crimson (mythic),
  // a consensus-hugging call previews as cream (common). Without this,
  // open polaroids would just default to the common-tier muted palette
  // regardless of how contrarian the call was.
  //
  // We deliberately do not show the rarity STAMP on open bets — only the
  // palette hints at what they're gunning for, the stamp lands when the
  // bet actually resolves. So `rarity` (used for stamp + reveal logic)
  // stays narrowly defined, and `effectiveRarity` (used for palette +
  // sun count) is the broader hint.
  const effectiveRarity: Rarity | null = useMemo(() => {
    if (rarity) return rarity;
    if (consensusAtBet == null || !Number.isFinite(consensusAtBet)) return null;
    return potentialRarity({
      prediction,
      consensusMean: consensusAtBet,
      lowerBound,
      upperBound,
    });
  }, [rarity, consensusAtBet, prediction, lowerBound, upperBound]);
  const rarityMeta = rarity ? TIER_META[rarity] : null;
  // Accuracy is needed for the develop-progress curve and for the label
  // shown in the caption. We prefer the rarity-derived accuracy (because
  // it's normalized and tested), but fall back to the spread-aware
  // legacy estimator when consensusAtBet is missing — so legacy receipts
  // and tests that don't supply consensus still get a meaningful accuracy
  // (and "CALLED IT" / "CLOSE" / "MISSED" labels) on the developed view.
  const accuracy: number | null = useMemo(() => {
    if (rarityCalc) return rarityCalc.accuracy;
    if (developed && resolvedOutcome != null && Number.isFinite(resolvedOutcome)) {
      return estimateAccuracy(prediction, spread, resolvedOutcome, lowerBound, upperBound);
    }
    return null;
  }, [rarityCalc, developed, resolvedOutcome, prediction, spread, lowerBound, upperBound]);

  // Time-based develop progress. The visual filter applied to the photo
  // is a function of this number — it ramps from "faded" to "sharp" as
  // the market approaches resolution, and the resolution payoff is the
  // final crisp reveal. Re-evaluates every 60s for open bets so a tab
  // left open visibly continues developing.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (developed) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [developed]);
  const progress = developProgress({
    createdAt,
    expiresAt,
    resolutionState,
    accuracy,
    now,
  });

  // The "is the receipt allowed to reveal its reasoning?" gate. We only
  // reveal the reasoning inside the photo once the polaroid is fully
  // developed AND the call was accurate enough to be worth bragging
  // about. Misses keep their reasoning private — preserving dignity
  // and creating an explicit asymmetry between right and wrong.
  const reasoningRevealed = developed && accuracy != null && accuracy >= 0.6 && progress >= 0.95;

  // Animated develop: when enabled and the receipt is settled, mount with
  // a faded filter and transition to "sharp" over ~900 ms so the
  // resolution moment is visible.
  const [animPhase, setAnimPhase] = useState<'pre' | 'running' | 'done'>(
    animateDevelop && developed ? 'pre' : 'done',
  );

  useLayoutEffect(() => {
    setAnimPhase(animateDevelop && developed ? 'pre' : 'done');
  }, [animateDevelop, developed]);

  useEffect(() => {
    if (!animateDevelop || !developed) return;
    const startId = window.setTimeout(() => setAnimPhase('running'), 60);
    const endId = window.setTimeout(() => setAnimPhase('done'), 60 + 950);
    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(endId);
    };
  }, [animateDevelop, developed]);

  const aspect = 1.5;
  const height = Math.round(width * aspect);

  // Seed — derived from EVERY input. Every slider drag perturbs this,
  // every word of reasoning, even a $1 stake change. This is the key
  // guarantee that no two polaroids are identical.
  const seed = useMemo(
    () =>
      seedFromInputs({
        marketId: props.marketId,
        positionId: props.positionId,
        username,
        reasoning,
        prediction,
        spread,
        conviction,
        collateral,
        shape,
        createdAt,
      }),
    [
      props.marketId,
      props.positionId,
      username,
      reasoning,
      prediction,
      spread,
      conviction,
      collateral,
      shape,
      createdAt,
    ],
  );

  const photo = useMemo(
    () =>
      buildPhoto({
        width,
        photoWidth: width - 32,
        photoHeight: width - 32,
        prediction,
        spread,
        // Pair 1:1 with the BetFlow chart's bimodal config so the
        // hill silhouette draws the same two-Gaussian mixture the
        // chart draws, not a synthetic symmetric reconstruction.
        secondPeak,
        shape,
        lowerBound,
        upperBound,
        seed,
        conviction,
        collateral,
        developed,
        progress,
        resolvedOutcome,
        // Drive palette + sun count off effective rarity so OPEN bets in
        // the live preview shift their colour as the user drags the
        // prediction. Resolved bets still use their actual rarity (the
        // two converge once consensusAtBet + outcome are both known).
        rarity: effectiveRarity,
        // Pass the crowd consensus mean through so the photo composer
        // can paint a second hill behind the user's silhouette - the
        // contrarian-vs-consensus story rendered as parallax depth.
        consensusAtBet,
        // ACTUAL density curves from the SDK -- when supplied, the
        // back hill takes the literal market-consensus shape (orange
        // chart curve) and the front hill takes the literal preview
        // belief shape (purple chart curve). Both fall back to the
        // procedural Gaussian / densityAt reconstructions when null
        // so legacy receipts keep rendering the same artwork.
        consensusCurve,
        userCurve,
      }),
    [
      width,
      prediction,
      spread,
      secondPeak,
      shape,
      lowerBound,
      upperBound,
      seed,
      conviction,
      collateral,
      developed,
      progress,
      resolvedOutcome,
      effectiveRarity,
      consensusAtBet,
      consensusCurve,
      userCurve,
    ],
  );

  const padding = 16;
  const photoSize = width - padding * 2;
  const photoX = padding;
  const photoY = padding;

  // Numeric scale strip + caption area below the photo. The matte gap
  // between the photo and the scale strip is sized to host the stake-
  // driven ornament tick strip — at the maximum stake ticks are 11 px
  // tall, so we keep at least ~14 px of clear matte between the photo's
  // bottom edge and the start of the scale strip.
  const scaleStripY = photoY + photoSize + 16;
  const scaleStripH = Math.max(28, Math.round(width * 0.1));
  const captionY = scaleStripY + scaleStripH + 4;
  const captionH = height - captionY - 12;

  const dateLabel = formatDate(createdAt);
  // Soft cap on the title at 120 chars (only kicks in for truly
  // absurd titles). The previous 42-char hard truncate was cutting
  // perfectly normal market titles like "Tesla Optimus Units Sold
  // or Deployed Internally by Dec 2026" (60 chars) down to "Tesla
  // Optimus Units Sold or Deployed Inte…" before the wrapping
  // function ever got to see them, even though the caption strip
  // had vertical room for a third line. Now the wrap logic in
  // `renderSvgCaption` decides whether the title fits in two or
  // three lines based on the available caption height; the user
  // sees the full title on every polaroid except pathological cases.
  const subjectLabel = truncate(marketTitle, 120);
  const filterId = `develop-${seed}`;
  const grainId = `grain-${seed}`;
  const skyGradientId = `sky-${seed}`;
  const groundGradientId = `ground-${seed}`;
  const consensusGradientId = `consensus-${seed}`;
  const sunGradientId = `sun-${seed}`;
  const photoClipId = `photoclip-${seed}`;
  const captionClipId = `capclip-${seed}`;
  const photoVignetteId = `photovig-${seed}`;

  const accuracyLabel = (() => {
    if (!developed) {
      if (progress < 0.4) return 'DEVELOPING';
      if (progress < 0.7) return 'AGING';
      return 'AWAITING';
    }
    if (accuracy == null) return 'SETTLED';
    if (accuracy > 0.7) return `+${Math.round(accuracy * 100)}% CALLED IT`;
    if (accuracy > 0.4) return `+${Math.round(accuracy * 100)}% CLOSE`;
    return 'MISSED';
  })();

  const accuracyColor = (() => {
    if (!developed) return palette.inkMute;
    if (accuracy == null) return palette.inkMute;
    if (accuracy > 0.7) return palette.jade;
    if (accuracy > 0.4) return palette.ember;
    return palette.rose;
  })();

  // Photo filter: applied only when progress < 1 (i.e. either still
  // pre-resolution OR resolved with a miss). The filter blurs and de-
  // saturates the photo proportionally to (1 - progress). At progress=1
  // we skip the filter entirely so the SVG renders crisp.
  const photoFilter = progress >= 0.999 ? undefined : `url(#${filterId})`;

  const range = upperBound - lowerBound;
  const safeRange = range > 1e-9 ? range : 1;
  const predictionT = clampUnit((prediction - lowerBound) / safeRange);
  const outcomeT = developed && resolvedOutcome != null
    ? clampUnit((resolvedOutcome - lowerBound) / safeRange)
    : null;

  // Outer shadow + animated develop filter on the whole SVG. The animated
  // filter overlays the time-based one on top of any natural sharpening —
  // it's just the one-time "polaroid pulled from the camera" reveal.
  //
  // We use a three-layer Material-style elevation stack (tight + mid +
  // ambient) instead of a single shadow. This is what makes the
  // polaroid feel *lifted* off the page in both modes:
  //   - In light mode the layers stack into a soft, sun-lit drop.
  //   - In dark mode palette.shadowDeep is rgba(0,0,0,0.65), which on
  //     the deep aubergine paper would be invisible if applied as a
  //     single shadow. Splitting into three falloff curves with a far
  //     ambient layer makes the card's silhouette read clearly even
  //     against a dark background.
  const baseShadow = [
    `drop-shadow(0 1px 2px ${palette.shadow})`,
    `drop-shadow(0 6px 14px ${palette.shadow})`,
    `drop-shadow(0 24px 48px ${palette.shadowDeep})`,
  ].join(' ');
  const developFilter = animPhase === 'pre'
    ? `${baseShadow} saturate(0.18) blur(1.6px) brightness(0.9) contrast(0.92)`
    : baseShadow;
  const developTransition = animPhase === 'running'
    ? 'filter 900ms cubic-bezier(0.22, 0.61, 0.36, 1)'
    : 'none';

  // Stake-driven matte ornament — a row of small BEADS sitting between
  // the photo and the scale strip. They visualise the stake weight
  // ("more dollars → more, bolder beads") and intentionally use a
  // circular bead glyph so they read as decorative jewelry on the
  // matte, NOT as a second set of axis ticks. (Users were previously
  // mistaking the vertical-tick variant for x-axis ticks on the
  // prediction range.) Stake feeds three visible channels here:
  //   - more dollars → more beads (5 at $1, 11 at $1000+)
  //   - more dollars → larger beads (radius 1.2..2.4 px)
  //   - more dollars → bolder beads (opacity ramps from 0.55 to 0.95)
  // The bead colour is the RARITY ACCENT (when known) so the tier
  // signature continues through the matte — mythic gets ember-red
  // beads, legendary gets gold beads, etc. Common falls back to ink.
  const stakeUnit = clamp01(Math.log10(Math.max(1, collateral)) / 3);
  const ornamentCount = Math.max(5, Math.min(11, Math.round(stakeUnit * 6 + 5)));
  const ornamentRadius = 1.2 + stakeUnit * 1.2; // 1.2..2.4 px
  const ornamentOpacity = 0.55 + stakeUnit * 0.4; // 0.55..0.95

  // Conviction also drives a halo behind the sun: scaled radius and opacity.
  // High conviction = brighter, larger halo. Picked up automatically by
  // the photo's sun glow which is already conviction-aware.

  // Develop filter parameters — blur + saturation + brightness as a
  // function of (1 - progress). At progress=0 the photo is blurred and
  // slightly desaturated to read as "still developing". At progress=1
  // the filter has no children (fully sharp + colourful).
  //
  // Saturation and sepia were aggressively cranked down (75% sat cut,
  // 70% sepia overlay) which tinted EVERY rarity tier brown in the
  // live preview, hiding the rarity-anchored sky colours entirely.
  // The user explicitly asked to see the rarity sky colours
  // (grey/green/blue/purple/gold/orange) clearly. Now the filter only
  // mildly desaturates and applies a light sepia, so the rarity hue
  // family stays unmistakable even during the develop animation.
  const developIntensity = clampUnit(1 - progress);
  const photoBlur = (developIntensity * 1.8).toFixed(2);
  const photoSat = (1 - developIntensity * 0.25).toFixed(2);
  const photoBri = (1 - developIntensity * 0.10).toFixed(2);
  const sepia = developIntensity * 0.18;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={{
        // The SVG always renders at the EXACT pixel dimensions its
        // caller asked for. Width and height are numeric pixel
        // attributes on the <svg> tag (above), and the wrapper
        // around the SVG is sized to those same pixels by every
        // caller -- so the SVG and its frame are ALWAYS the same
        // size, with no CSS layout property in the load-bearing
        // position. This eliminates every regression where the
        // wrapper and the SVG ended up disagreeing on shape.
        //
        // The global CSS rule `svg[role="img"][aria-label^="Polaroid
        // receipt"] { display: block; max-width: 100%; height:
        // auto }` only kicks in if a caller's wrapper happens to be
        // narrower than the polaroid's intrinsic width, in which
        // case the SVG shrinks proportionally and the wrapper (sized
        // identically) shrinks with it.
        display: 'block',
        filter: developFilter,
        transition: developTransition,
        cursor: interactive ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      role="img"
      aria-label={`Polaroid receipt for ${marketTitle} predicted by ${username}`}
      data-rarity={rarity ?? 'unresolved'}
      data-progress={progress.toFixed(2)}
    >
      <defs>
        <linearGradient id={skyGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={photo.sky.top} />
          <stop offset="60%" stopColor={photo.sky.mid} />
          <stop offset="100%" stopColor={photo.sky.bottom} />
        </linearGradient>
        <linearGradient id={groundGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={photo.ground.top} />
          <stop offset="100%" stopColor={photo.ground.bottom} />
        </linearGradient>
        {/* Atmospheric-perspective gradient for the crowd consensus
            hill. Sits BEHIND the user's silhouette and dissolves into
            the sky-bottom colour at its crest, the same trick
            landscape painters use to push terrain into the distance.
            Only emitted when consensusFill is non-null (i.e. when the
            receipt actually has a consensusAtBet snapshot). */}
        {photo.consensusFill && (
          <linearGradient id={consensusGradientId} x1="0" y1="0" x2="0" y2="1">
            {/* Both gradient stops are now FULLY opaque. Combined
                with the deep mix factors in `consensusFill` (0.08 /
                0.06 / 0.05 -- almost identical to the prediction
                hill's pure ground colour), the back hill paints
                into the photo at full saturation so the user sees
                two clearly distinct mountain layers rather than a
                ghost behind the foreground. Atmospheric-perspective
                separation now comes from the slightly higher
                consensus horizon line (back hill peeks out above
                the foreground hill) instead of from translucency
                or colour wash, which is what the user explicitly
                asked for: "as dark as our own prediction curve,
                slightly brighter but almost as dark." */}
            <stop offset="0%" stopColor={photo.consensusFill.top} stopOpacity="1.0" />
            <stop offset="100%" stopColor={photo.consensusFill.bottom} stopOpacity="1.0" />
          </linearGradient>
        )}
        <radialGradient id={sunGradientId} cx="50%" cy="50%" r="50%">
          {/* The shared glow gradient is keyed to the primary sun's core
              and the rarity accent's glow. Companion suns reuse this
              same gradient but draw their own bright core on top, so
              all suns visually belong to one celestial family. */}
          <stop offset="0%" stopColor={photo.suns[0]?.core ?? '#fff'} />
          <stop offset="60%" stopColor={photo.suns[0]?.glow ?? '#fff'} stopOpacity="0.6" />
          <stop offset="100%" stopColor={photo.suns[0]?.glow ?? '#fff'} stopOpacity="0" />
        </radialGradient>
        <filter id={filterId}>
          {/* Filter only carries children when developIntensity > 0; an
              empty filter renders as transparent in some browsers. */}
          {developIntensity > 0.01 && (
            <>
              <feGaussianBlur stdDeviation={photoBlur} />
              <feColorMatrix
                type="matrix"
                values={`
                  ${(0.393 + 0.607 * (1 - sepia)).toFixed(3)} ${(0.769 * sepia).toFixed(3)} ${(0.189 * sepia).toFixed(3)} 0 0
                  ${(0.349 * sepia).toFixed(3)} ${(0.686 + 0.314 * (1 - sepia)).toFixed(3)} ${(0.168 * sepia).toFixed(3)} 0 0
                  ${(0.272 * sepia).toFixed(3)} ${(0.534 * sepia).toFixed(3)} ${(0.131 + 0.869 * (1 - sepia)).toFixed(3)} 0 0
                  0 0 0 1 0
                `}
              />
              <feComponentTransfer>
                <feFuncR type="linear" slope={photoSat} intercept={((1 - Number(photoSat)) * 0.5).toFixed(3)} />
                <feFuncG type="linear" slope={photoSat} intercept={((1 - Number(photoSat)) * 0.5).toFixed(3)} />
                <feFuncB type="linear" slope={photoSat} intercept={((1 - Number(photoSat)) * 0.5).toFixed(3)} />
              </feComponentTransfer>
              <feComponentTransfer>
                <feFuncR type="linear" slope={photoBri} />
                <feFuncG type="linear" slope={photoBri} />
                <feFuncB type="linear" slope={photoBri} />
              </feComponentTransfer>
            </>
          )}
        </filter>
        <filter id={grainId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency={photo.grainFreq.toFixed(3)}
            numOctaves="2"
            seed={seed % 1000}
          />
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${(0.06 + developIntensity * 0.07).toFixed(3)} 0`}
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id={photoClipId}>
          <rect x={photoX} y={photoY} width={photoSize} height={photoSize} rx="2" />
        </clipPath>
        <clipPath id={captionClipId}>
          <rect x={padding} y={captionY} width={photoSize} height={captionH} />
        </clipPath>
        {/* Theme-aware photo vignette. The photo content (sky, suns,
            silhouette) is rendered theme-agnostically because it is a
            frozen "artifact". But in dark mode that bright photo
            content can sit on a dark matte with too much contrast at
            the photo edges, creating a "halo doesn't match background"
            feeling. We bridge that transition by drawing a radial
            gradient overlay on top of the photo: fully transparent in
            the centre, fading to palette.card opacity at the corners.
            Because palette.card is the SAME color as the matte, the
            photo's edges visually dissolve into the matte in BOTH
            light and dark modes - the polaroid feels like one
            cohesive object, not "bright photo glued onto dark frame".
            We also bias the gradient slightly stronger when the photo
            is in the developing/blurred state, since that is where
            the user reported the issue. */}
        <radialGradient
          id={photoVignetteId}
          cx="50%"
          cy="50%"
          r="72%"
          fx="50%"
          fy="50%"
        >
          <stop offset="0%" stopColor={palette.card} stopOpacity="0" />
          <stop offset="60%" stopColor={palette.card} stopOpacity="0" />
          <stop offset="88%" stopColor={palette.card} stopOpacity={(0.18 + developIntensity * 0.18).toFixed(3)} />
          <stop offset="100%" stopColor={palette.card} stopOpacity={(0.42 + developIntensity * 0.22).toFixed(3)} />
        </radialGradient>
      </defs>

      {/* Rarity halo behind the card. Only emitted for tiers above
          common - common uses a thin neutral theme-aware edge with no
          halo so it reads as the baseline. Tiers above common share a
          UNIFORM 5 px frame in their rarity color (set in TIER_META)
          plus a soft 7 px halo so the rarity hue is unmistakable in
          both light and dark modes. */}
      {rarityMeta && rarity && rarity !== 'common' && (
        <rect
          x={rarityMeta.borderWidth / 2}
          y={rarityMeta.borderWidth / 2}
          width={width - rarityMeta.borderWidth}
          height={height - rarityMeta.borderWidth}
          rx="6"
          fill="none"
          stroke={rarityMeta.color}
          strokeWidth={rarityMeta.borderWidth + 2}
          opacity="0.22"
        />
      )}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="6"
        fill={palette.card}
        stroke={rarityMeta && rarity && rarity !== 'common' ? rarityMeta.color : palette.rule}
        strokeWidth={rarityMeta && rarity && rarity !== 'common' ? rarityMeta.borderWidth : 1}
      />

      {/* Photo */}
      <g clipPath={`url(#${photoClipId})`}>
        <rect x={photoX} y={photoY} width={photoSize} height={photoSize} fill={`url(#${skyGradientId})`} filter={photoFilter} />

        {/* Aurora (legendary + mythic).
            Drawn AFTER the sky gradient and BEFORE the stars so the
            curtain washes the upper sky as ambient atmosphere; the
            stars then twinkle on top.
            Each curtain is a tall wavy band running the full width of
            the photo, with a vertical color stack that mimics what a
            real aurora photograph actually shows. Real auroras are
            layered, not monochrome — the bright green band is just
            ONE layer. We render five stops to capture that:
              - 0%  (top)     transparent
              - 12%           pink/magenta (high-altitude O 630 nm)
              - 30%           soft purple (rarity-coherent violet)
              - 52%           cornflower blue (mid-altitude N2)
              - 72%           muted sage green (the famous green band,
                              kept quiet so it doesn't overwhelm)
              - 92-100%       green fading to transparent
            Mythic stacks two curtains at offset phases for depth.
            A separate accent kiss is layered on top of the pink so
            legendary picks up a gold-warm cast and mythic a
            crimson-magenta cast — both palette-coherent. */}
        {photo.aurora && (
          <g opacity={photo.aurora.intensity * (0.4 + progress * 0.6)} filter={photoFilter}>
            {photo.aurora.curtains.map((c, i) => {
              const gradId = `aurora-${seed}-${i}`;
              const accentId = `aurora-accent-${seed}-${i}`;
              const steps = 48;
              const yTop = photoY + c.yTop * photoSize;
              const yBot = photoY + c.yBot * photoSize;
              const ampTop = c.ampTop * photoSize;
              const ampBot = c.ampBot * photoSize;
              let topPath = `M ${photoX} ${yTop}`;
              for (let k = 1; k <= steps; k++) {
                const t = k / steps;
                const x = photoX + t * photoSize;
                const y = yTop + Math.sin(t * Math.PI * 2.2 + c.phase) * ampTop;
                topPath += ` L ${x} ${y}`;
              }
              let botPath = '';
              for (let k = steps; k >= 0; k--) {
                const t = k / steps;
                const x = photoX + t * photoSize;
                const y =
                  yBot +
                  Math.sin(t * Math.PI * 1.6 + c.phase + 0.8) * ampBot;
                botPath += ` L ${x} ${y}`;
              }
              const d = `${topPath} ${botPath} Z`;
              return (
                <g key={`aurora-${i}`} opacity={c.opacity}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.topColor} stopOpacity="0" />
                      <stop offset="12%" stopColor={c.topColor} stopOpacity="0.50" />
                      <stop offset="30%" stopColor={c.midColor} stopOpacity="0.55" />
                      <stop offset="52%" stopColor={c.blueColor} stopOpacity="0.50" />
                      <stop offset="72%" stopColor={c.bodyColor} stopOpacity="0.40" />
                      <stop offset="92%" stopColor={c.bodyColor} stopOpacity="0.15" />
                      <stop offset="100%" stopColor={c.bodyColor} stopOpacity="0" />
                    </linearGradient>
                    {/* Faint rarity-accent kiss painted across the upper
                        pink band so legendary/mythic still telegraph
                        their tier through the curtain palette. */}
                    <linearGradient id={accentId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.accentColor} stopOpacity="0" />
                      <stop offset="8%" stopColor={c.accentColor} stopOpacity="0.22" />
                      <stop offset="22%" stopColor={c.accentColor} stopOpacity="0.10" />
                      <stop offset="40%" stopColor={c.accentColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={d} fill={`url(#${gradId})`} />
                  <path d={d} fill={`url(#${accentId})`} />
                </g>
              );
            })}
          </g>
        )}

        {/* Nebula (epic + legendary + mythic).
            A blurred radial glow patch in the upper sky. The accent
            color shines through the rarity palette, giving the deep
            sky a colored "cloud" feel without competing with the
            stars or suns. */}
        {photo.nebula && (
          <g opacity={photo.nebula.intensity * (0.5 + progress * 0.5)} filter={photoFilter}>
            <defs>
              <radialGradient id={`nebula-${seed}`}>
                <stop offset="0%" stopColor={photo.nebula.innerColor} stopOpacity="0.55" />
                <stop offset="55%" stopColor={photo.nebula.outerColor} stopOpacity="0.30" />
                <stop offset="100%" stopColor={photo.nebula.outerColor} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle
              cx={photoX + photo.nebula.x * photoSize}
              cy={photoY + photo.nebula.y * photoSize}
              r={photo.nebula.radius * photoSize}
              fill={`url(#nebula-${seed})`}
            />
          </g>
        )}

        {photo.stars.map((s, i) => (
          <circle
            key={`star-${i}`}
            cx={photoX + s.x * photoSize}
            cy={photoY + s.y * photoSize}
            r={s.r}
            // Accent stars carry the rarity hue; the rest stay neutral
            // moonlight white. Tier signature reads even when the eye is
            // in the sky.
            fill={s.accent ? photo.accentColor : 'rgba(255,255,250,0.85)'}
            opacity={s.o * (0.5 + progress * 0.5)}
            filter={photoFilter}
          />
        ))}

        {/* Comets (uncommon+ probabilistic, epic+ guaranteed).
            Drawn between the background stars and the suns so they
            read as crossing the sky in front of the static stars but
            behind any sun glow. Each comet is a bright head + a tail
            that fades along a linear gradient. */}
        {photo.comets.map((c, i) => {
          const headX = photoX + c.x * photoSize;
          const headY = photoY + c.y * photoSize;
          const dx = Math.cos(c.angle) * c.length * photoSize;
          const dy = Math.sin(c.angle) * c.length * photoSize;
          const tailX = headX + dx;
          const tailY = headY + dy;
          const gradId = `comet-${seed}-${i}`;
          // Tail color: bright moonlight white at the head transitioning
          // to a faint accent-tinted blue at the end.
          return (
            <g key={`comet-${i}`} opacity={c.intensity * (0.4 + progress * 0.6)} filter={photoFilter}>
              <defs>
                <linearGradient id={gradId} x1={headX} y1={headY} x2={tailX} y2={tailY} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(255,255,250,0.95)" />
                  <stop offset="40%" stopColor={photo.accentColor} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={photo.accentColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <line
                x1={headX}
                y1={headY}
                x2={tailX}
                y2={tailY}
                stroke={`url(#${gradId})`}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
              <circle cx={headX} cy={headY} r={2.2} fill="rgba(255,255,250,0.98)" />
              <circle cx={headX} cy={headY} r={4.6} fill="rgba(255,255,250,0.35)" />
            </g>
          );
        })}

        {/* Stellar bodies. Count is rarity-driven (1/2/3/4/5/6 for
            common/uncommon/rare/epic/legendary/mythic) and laid out
            hierarchically as binary pairs plus optional singles. Glow
            uses a shared radial gradient; each star draws its own
            bright core. */}
        {photo.suns.map((s, i) => (
          <g key={`sun-${i}`}>
            <circle
              cx={photoX + s.x * photoSize}
              cy={photoY + s.y * photoSize}
              r={s.r}
              fill={`url(#${sunGradientId})`}
              filter={photoFilter}
            />
            <circle
              cx={photoX + s.x * photoSize}
              cy={photoY + s.y * photoSize}
              r={s.coreR}
              fill={s.core}
              opacity={i === 0 ? 0.95 : 0.88}
              filter={photoFilter}
            />
          </g>
        ))}
        {/* Crowd-consensus back hill (atmospheric perspective). Drawn
            BEFORE the user's silhouette so the user's mountain mass
            paints over it where they overlap; the only places the
            back hill remains visible are the off-axis flanks, which
            is exactly where the contrarian-vs-consensus story lives.
            Renders nothing on legacy receipts that lack a consensus
            snapshot - graceful degradation, no layout shift. */}
        {photo.consensusSilhouettePath && photo.consensusFill && (
          <>
            <path
              data-testid="polaroid-consensus-silhouette"
              d={photo.consensusSilhouettePath(photoX, photoY, photoSize)}
              fill={`url(#${consensusGradientId})`}
              filter={photoFilter}
              opacity="1.0"
            />
            <path
              d={photo.consensusSilhouettePath(photoX, photoY, photoSize)}
              fill="none"
              stroke={photo.consensusFill.line}
              strokeWidth="1.2"
              opacity="0.95"
              filter={photoFilter}
            />
          </>
        )}
        <path
          data-testid="polaroid-user-silhouette"
          d={photo.silhouettePath(photoX, photoY, photoSize)}
          fill={`url(#${groundGradientId})`}
          filter={photoFilter}
        />
        <path
          d={photo.silhouettePath(photoX, photoY, photoSize)}
          fill="none"
          stroke={photo.ground.line}
          strokeWidth="0.8"
          opacity="0.7"
          filter={photoFilter}
        />

        {/* Outcome thread (post-resolution only) */}
        {outcomeT != null && (
          <>
            <line
              x1={photoX + outcomeT * photoSize}
              y1={photoY}
              x2={photoX + outcomeT * photoSize}
              y2={photoY + photoSize}
              stroke={palette.ember}
              strokeWidth="1.4"
              strokeDasharray="3,3"
              opacity="0.85"
            />
            <g>
              <rect
                x={Math.min(
                  photoX + photoSize - 56,
                  Math.max(photoX + 4, photoX + outcomeT * photoSize - 26),
                )}
                y={photoY + 6}
                width={52}
                height={16}
                rx={3}
                fill="rgba(0,0,0,0.55)"
              />
              <text
                x={Math.min(
                  photoX + photoSize - 30,
                  Math.max(photoX + 30, photoX + outcomeT * photoSize),
                )}
                y={photoY + 17}
                textAnchor="middle"
                fontFamily={fonts.mono}
                fontSize={Math.round(width * 0.026)}
                fill="rgba(255,255,250,0.95)"
                letterSpacing="0.4"
              >
                actual
              </text>
            </g>
          </>
        )}

        {/* Film grain */}
        <rect
          x={photoX}
          y={photoY}
          width={photoSize}
          height={photoSize}
          fill="white"
          filter={`url(#${grainId})`}
          opacity={0.4 + developIntensity * 0.2}
        />

        {/* Theme-aware vignette overlay. Fades the photo's outer ring
            into palette.card so the bright photo content (sky, suns,
            silhouettes) blends into the surrounding matte in BOTH
            light and dark modes. This is what fixes the dark-mode
            "halo color is not close to the background" issue: the
            photo's edges now physically transition to the same color
            as the matte that contains them, so the polaroid reads as
            one cohesive object regardless of theme. We deliberately
            draw this AFTER the film grain (so the grain itself fades
            at the edges too) but BEFORE the reasoning quote (so the
            payoff text always sits clearly on top, fully readable). */}
        <rect
          x={photoX}
          y={photoY}
          width={photoSize}
          height={photoSize}
          fill={`url(#${photoVignetteId})`}
          pointerEvents="none"
        />

        {/* Reasoning quote — ONLY when developed + accurate. This is the
            payoff for being right. Anchored DEEP in the lower portion of
            the photo so it never visually competes with the sky, the
            suns, or the silhouetted mountains/hills. The user explicitly
            asked for this multiple times: the text must sit clearly
            BELOW the horizon, leaving the sky and the silhouettes
            entirely uncovered. We pick whichever is LOWER between (a)
            72% down the photo and (b) horizonY + 16% — so as the
            horizon rises higher in the frame, the quote follows it
            down with more breathing room, never sitting at the
            mountain base. */}
        {reasoningRevealed && reasoning.trim().length > 0 && (() => {
          const quoteAnchorFrac = Math.max(0.72, photo.horizonY + 0.16);
          const quoteAnchorY = photoY + photoSize * quoteAnchorFrac;
          const quoteMaxHeight = Math.max(
            0,
            (1 - quoteAnchorFrac) * photoSize - Math.round(photoSize * 0.06),
          );
          // Side padding is 5% of the photo edge so even on the wide
          // Receipt (~400 px) the quote has roughly 20 px of breathing
          // room each side; on a 200 px gallery thumbnail it tightens
          // to 10 px. The ReasoningQuote auto-fit + textLength fail-
          // safe (see below) clamp every line to this width.
          const sidePad = Math.max(10, Math.round(photoSize * 0.05));
          return (
            <ReasoningQuote
              x={photoX + sidePad}
              y={quoteAnchorY}
              width={photoSize - sidePad * 2}
              maxHeight={quoteMaxHeight}
              text={reasoning.trim()}
              handle={username}
              polaroidWidth={width}
            />
          );
        })()}

        {/* Developing stamp (only when NOT yet fully developed) */}
        {!reasoningRevealed && (
          <g opacity={Math.max(0.25, 0.55 - progress * 0.3)}>
            <text
              x={photoX + photoSize - 10}
              y={photoY + photoSize - 12}
              textAnchor="end"
              fontFamily={fonts.mono}
              fontSize={Math.round(width * 0.028)}
              fill="rgba(255,255,250,0.85)"
              letterSpacing="2"
            >
              {developed
                ? accuracy != null && accuracy < 0.4
                  ? 'NEVER DEVELOPED'
                  : 'SETTLED'
                : progress < 0.4
                  ? 'DEVELOPING'
                  : progress < 0.7
                    ? 'AGING'
                    : 'ALMOST'}
            </text>
          </g>
        )}

        {/* Rarity stamp: top-right of the photo, only for resolved bets
            with uncommon-or-higher. Sits on the photo so colors read
            against the developed sky. */}
        {rarityMeta && rarity && rarity !== 'common' && (
          <RarityStamp
            x={photoX + photoSize - 10}
            y={photoY + 10}
            tier={rarity}
            polaroidWidth={width}
          />
        )}
      </g>

      {/* Photo border */}
      <rect
        x={photoX}
        y={photoY}
        width={photoSize}
        height={photoSize}
        fill="none"
        stroke={palette.rule}
        strokeWidth="0.5"
        rx="2"
      />

      {/* Stake-driven bead strip in the matte area between the photo
          and the scale strip. Filled circles are deliberately used in
          place of vertical ticks so this row reads as jewelry/matte
          decoration, NOT a second set of axis ticks (the scale strip
          below has its OWN range axis). The bead count, size and
          opacity all scale with stake. The colour is the RARITY ACCENT
          when known so the tier signature continues through the matte
          — a mythic receipt gets ember-red beads, legendary gets gold,
          etc. Common falls back to ink so the receipt stays muted. */}
      <g aria-hidden="true">
        {Array.from({ length: ornamentCount }).map((_, i) => {
          const tt = (i + 0.5) / ornamentCount;
          const beadX = photoX + 6 + tt * (photoSize - 12);
          const midY = photoY + photoSize + (scaleStripY - (photoY + photoSize)) / 2;
          return (
            <circle
              key={`bead-${i}`}
              cx={beadX}
              cy={midY}
              r={ornamentRadius}
              fill={effectiveRarity && effectiveRarity !== 'common' ? photo.accentColor : palette.inkSoft}
              fillOpacity={ornamentOpacity}
            />
          );
        })}
      </g>

      {/* Scale strip */}
      <ScaleStrip
        x={photoX}
        y={scaleStripY}
        width={photoSize}
        height={scaleStripH}
        lowerBound={lowerBound}
        upperBound={upperBound}
        units={marketUnits}
        prediction={prediction}
        predictionT={predictionT}
        predictionLabel={predictionLabel}
        outcome={outcomeT != null ? resolvedOutcome ?? null : null}
        outcomeT={outcomeT}
        polaroidWidth={width}
      />

      {/* Caption — native SVG text (intentionally NOT a foreignObject).
          Chrome taints any canvas that rasterizes an SVG with a
          foreignObject, even on same-origin content, which permanently
          breaks PNG export. Rendering with SVG <text> primitives keeps
          export working in every browser and still matches the layout
          of the previous HTML caption: italic title (wrap up to 2
          lines), footer line (handle + prediction summary, accuracy
          verdict right-aligned), and a date + conviction subline. */}
      {renderSvgCaption({
        x: padding,
        y: captionY,
        width: photoSize,
        height: captionH,
        polaroidWidth: width,
        clipId: captionClipId,
        subjectLabel,
        footerSentence: buildFooterSentence({
          username,
          prediction,
          resolvedOutcome,
          developed,
          units: marketUnits,
          collateral,
          lowerBound,
          upperBound,
        }),
        accuracyLabel,
        accuracyColor,
        dateLabel,
        conviction,
      })}
    </svg>
  );
}

/**
 * Public Polaroid export — `React.memo` wrapper around `PolaroidImpl`.
 *
 * Performance: `PolaroidImpl` does heavy procedural work on every render
 * (seed hashing, `buildPhoto` star/sun/comet/aurora/nebula generation,
 * ~50-150 SVG node emission). When a parent re-renders the polaroid
 * with byte-identical props (e.g. the BetFlow page re-rendering on a
 * slider tick that only mutated chart inputs), `memo` short-circuits
 * the work and returns the cached output.
 *
 * Combined with `useDeferredValue` on the seed inputs at the BetFlow
 * call sites, this caps the polaroid's redraw cadence at the browser's
 * paint rate even when the user drags a slider at 60+ Hz, eliminating
 * the slider-drag "the page slows down and eventually crashes" bug.
 *
 * Default shallow prop equality is exactly what we want here: every
 * prop is either a primitive or a stable object reference passed by
 * the caller. We do not need a custom comparator.
 */
export const Polaroid = memo(PolaroidImpl);

/**
 * Render the polaroid caption strip using only native SVG <text> nodes.
 *
 * Why not foreignObject:
 *   Chrome flags any SVG drawn to canvas that contains a foreignObject
 *   as a security risk and taints the canvas. That blocks toDataURL,
 *   which kills our PNG export. SVG text doesn't trigger that taint.
 *
 * Layout matches the previous HTML caption:
 *   - Title (italic Fraunces, 0.05 * polaroidWidth) wraps to ≤ 2 lines
 *     near the top.
 *   - Footer line (mono) pinned ~6px above the date line.
 *   - Date + conviction subline (mono, smaller) pinned to the bottom.
 *   - Accuracy verdict is right-anchored on the footer line and the
 *     footer sentence is truncated by approximate character width so
 *     the two never collide.
 */
function renderSvgCaption(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  polaroidWidth: number;
  clipId: string;
  subjectLabel: string;
  footerSentence: string;
  accuracyLabel: string;
  accuracyColor: string;
  dateLabel: string;
  conviction: number;
}) {
  const {
    x,
    y,
    width,
    height,
    polaroidWidth,
    clipId,
    subjectLabel,
    footerSentence,
    accuracyLabel,
    accuracyColor,
    dateLabel,
    conviction,
  } = args;

  const titleSize = Math.round(polaroidWidth * 0.05);
  const titleLineHeight = Math.round(titleSize * 1.18);
  const footerSize = Math.max(10, Math.round(polaroidWidth * 0.028));
  const dateSize = Math.max(9, Math.round(polaroidWidth * 0.024));

  // Per-character em width used to BUDGET how many characters fit on a
  // line BEFORE we wrap. We want a CONSERVATIVE upper bound -- the
  // estimate must NEVER undercount the real rendered width, or the
  // last line of the title overflows the caption clipPath and gets
  // sliced mid-word (the "Tesla Optimus Units Sold or / Deployed
  // Internally by Dec 202(" bug on the desktop Receipt at width=380).
  //
  // The display font is now Bricolage Grotesque (see `fonts.display`
  // in theme.ts). Bricolage has NO true italic, so applying
  // `font-style="italic"` to the SVG <text> triggers either a browser-
  // synthesised oblique or a cascade fall-through into "Funnel
  // Display" / "Outfit" / system-ui italic -- all of which render at
  // ~0.58-0.62em average. The legacy 0.56em estimate (originally
  // tuned for Fraunces italic at ~0.46em) underestimates that real
  // width by 4-10%, which on a 31-character second line at 19px
  // overflows the 348px clipPath by ~5-15px. Picking 0.64 gives us
  // 12-15% safety margin over the worst-case observed render, so the
  // wrap budget always TRIGGERS A LINE BREAK before the browser
  // actually runs out of room. The textLength="X" + lengthAdjust
  // safety cap on the <text> elements below is a belt-and-braces
  // second line of defence in case any future font swap pushes em
  // width even wider.
  const titleEmEstimate = 0.64;
  const titleCharsPerLine = Math.max(8, Math.floor(width / (titleSize * titleEmEstimate)));
  // Pre-compute the footer baseline so we can decide whether a 3rd
  // title line would overlap the footer. Mirrors the formula below.
  const footerBaselineRel = height - 6 - footerSize - 6;
  // Allow up to 3 title lines when the caption strip has vertical
  // room for it (medium and large polaroids: receipt page, BetFlow
  // preview at 1440 wide). On small gallery thumbnails the caption
  // strip is too short for a 3rd line and we fall back to 2 lines
  // with a final-line ellipsis. Threshold = last title baseline + a
  // 6 px breathing margin must clear the footer baseline.
  const lastTitleBaselineFor = (n: number) => titleSize + 4 + (n - 1) * titleLineHeight;
  const canFitThreeLines = lastTitleBaselineFor(3) + 6 <= footerBaselineRel;
  const maxTitleLines = canFitThreeLines ? 3 : 2;
  const titleLines = wrapText(`"${subjectLabel}"`, titleCharsPerLine, maxTitleLines);

  // Approximate em-width for the mono text in the footer/date lines.
  // Space Mono (the active `fonts.mono`) renders at ~0.60em, and
  // every mainstream monospace fallback ("IBM Plex Mono",
  // "ui-monospace", "Cascadia Code", monospace) sits in the
  // 0.60-0.62em band. 0.62em is the conservative ceiling for the
  // family -- pushing it higher (e.g. 0.66) over-truncates the
  // footer sentence and strips the "$stake" tail off the right end.
  const monoCharEm = 0.62;
  const accuracyWidth = accuracyLabel.length * footerSize * monoCharEm;
  const footerAvail = Math.max(0, width - accuracyWidth - 10);
  const footerChars = Math.max(8, Math.floor(footerAvail / (footerSize * monoCharEm)));
  const footerText = truncate(footerSentence, footerChars);

  const dateLine = `${dateLabel} · CONVICTION × ${Math.max(1, Math.round(conviction * 10))}/10`;
  const dateChars = Math.max(8, Math.floor(width / (dateSize * monoCharEm)));
  const dateTruncated = truncate(dateLine, dateChars);

  const titleBaseline1 = y + titleSize + 4;
  const dateBaseline = y + height - 6;
  const footerBaseline = dateBaseline - dateSize - 6;

  return (
    <g clipPath={`url(#${clipId})`}>
      {titleLines.map((line, i) => (
        <text
          key={`cap-title-${i}`}
          x={x}
          y={titleBaseline1 + i * titleLineHeight}
          fontFamily={fonts.display}
          fontStyle="italic"
          fontWeight={600}
          fontSize={titleSize}
          fill={palette.ink}
        >
          {line}
        </text>
      ))}
      <text
        x={x}
        y={footerBaseline}
        fontFamily={fonts.mono}
        fontSize={footerSize}
        fill={palette.inkMute}
        letterSpacing="0.4"
      >
        {footerText}
      </text>
      <text
        x={x + width}
        y={footerBaseline}
        textAnchor="end"
        fontFamily={fonts.mono}
        fontSize={footerSize}
        fontWeight={600}
        fill={accuracyColor}
        letterSpacing="0.4"
      >
        {accuracyLabel}
      </text>
      <text
        x={x}
        y={dateBaseline}
        fontFamily={fonts.mono}
        fontSize={dateSize}
        fill={palette.inkFade}
        letterSpacing="0.5"
      >
        {dateTruncated}
      </text>
    </g>
  );
}

// ---------- procedural helpers ----------

interface SunSpec {
  x: number;
  y: number;
  r: number;
  coreR: number;
  core: string;
  glow: string;
  /**
   * 0..1 - relative weight in the composition. Within each binary pair
   * the primary star is "full size" (weight 1) and its companion shrinks
   * to ~0.82 so the pair reads as "primary + smaller mate". Across
   * groups, secondary and tertiary groups fall off gently (~0.88, 0.78)
   * so the eye knows which system is dominant. Solo stars sit at ~0.65
   * to read as distant rather than primary.
   */
  weight: number;
}

interface CometSpec {
  /** Head position in normalised photo coords [0, 1]. */
  x: number;
  y: number;
  /** Length of the tail as a fraction of photo width. */
  length: number;
  /** Direction the tail trails away in (radians). Tails point opposite the head's travel direction. */
  angle: number;
  /** 0..1 brightness scalar. Higher tiers get brighter, longer comets. */
  intensity: number;
}

/**
 * A single realistic auroral curtain. Real aurorae are wide vertical
 * sheets of light whose lower edge sits at ~100 km altitude (oxygen
 * green, ~558 nm) and whose upper edge fades into red/pink at higher
 * altitude (oxygen red ~630 nm, or nitrogen). We render each curtain
 * as a tall band running the width of the photo, with:
 *
 *   - a smooth gently-waving TOP edge (the upper aurora boundary),
 *   - a steeper, lower-amplitude BOTTOM edge (so the band has thickness
 *     and the bottom feels like the brightest part of the curtain),
 *   - a vertical gradient that fades to transparent at the very top,
 *     peaks in the auroral green band in the middle, and softens into
 *     the rarity accent at the bottom fringe.
 *
 * Mythic stacks two curtains at slightly different horizontal phase so
 * the composition reads as the kind of layered, draped aurora you see
 * in long-exposure photography, NOT a tri-color rainbow.
 */
interface AuroraCurtainSpec {
  /** Y position of the curtain's TOP edge centre, in normalised photo coords. */
  yTop: number;
  /** Y position of the curtain's BOTTOM edge centre, in normalised photo coords. */
  yBot: number;
  /** Horizontal phase offset for both the top and bottom wave; in radians. */
  phase: number;
  /** Top-edge wave amplitude as a fraction of photo height. Larger => more dramatic drape. */
  ampTop: number;
  /** Bottom-edge wave amplitude as a fraction of photo height. Usually < ampTop. */
  ampBot: number;
  /** Per-curtain opacity scalar; mythic's second band is slightly fainter for depth. */
  opacity: number;
  /**
   * Layered color stack used to paint the curtain. Real auroras are
   * layered, not monochrome: pink/red wisps sit at the top from
   * high-altitude oxygen emission, blue/purple bands fill the mid
   * altitudes from nitrogen, and a quieter green band carpets the
   * bottom. We keep the green deliberately weak so the dominant
   * impression is the blue/purple/pink stack rather than a neon
   * turquoise wash.
   */
  /** Pink/magenta hue at the highest altitude (top of the curtain). */
  topColor: string;
  /** Soft purple/violet for the upper-mid transition. */
  midColor: string;
  /** Cornflower/periwinkle blue for the mid-body of the curtain. */
  blueColor: string;
  /** Muted sage green for the lower body — present but quiet. */
  bodyColor: string;
  /**
   * Rarity accent (gold for legendary, ember for mythic). Retained
   * for reference and used as a faint additional kiss in the upper
   * pink band so the curtain still nods to the tier palette.
   */
  accentColor: string;
}

interface AuroraSpec {
  /** 0..1 overall opacity / intensity (multiplied onto each curtain's own opacity). */
  intensity: number;
  /** Ordered list of curtains; legendary = 1, mythic = 2. Rendered back-to-front. */
  curtains: AuroraCurtainSpec[];
}

interface NebulaSpec {
  /** Center in normalised photo coords [0, 1]. */
  x: number;
  y: number;
  /** Radius in normalised photo width. */
  radius: number;
  /** 0..1 opacity scalar. */
  intensity: number;
  /** Inner glow hue (accent-tinted). */
  innerColor: string;
  /** Outer fade hue (matches accent at low alpha). */
  outerColor: string;
}

interface PhotoSpec {
  sky: { top: string; mid: string; bottom: string };
  ground: { top: string; bottom: string; line: string };
  /**
   * Stellar bodies in the sky. Count and arrangement come from
   * `rarityTopology()` — 1 / 2 / 3 / 4 / 5 / 6 stars for
   * common / uncommon / rare / epic / legendary / mythic, strictly
   * incrementing by one per tier so the rarity ladder reads at a glance.
   * The list is laid out hierarchically (tight binary pairs spaced far
   * apart from each other and from any singletons) so the composition
   * reads as an ordered system rather than a crowded cluster. The
   * configuration intentionally does NOT track the user's prediction or
   * belief peaks (the silhouette/hills already show those); the system
   * is the receipt's decorative signature, free to land wherever the
   * seed picks.
   */
  suns: SunSpec[];
  stars: Array<{ x: number; y: number; r: number; o: number; accent: boolean }>;
  /**
   * Comets / shooting stars. Empty for common, scaling up to 2-3 for
   * mythic. Each comet is a bright head with a fading tail. Placement
   * avoids the sun glow halos so the streak reads as foreground motion
   * against the static stars.
   */
  comets: CometSpec[];
  /**
   * Aurora curtain. Null below legendary. Legendary gets a single soft
   * jade band; mythic gets multiple overlapping bands in jade + magenta
   * + the rarity accent for an out-of-this-world feel.
   */
  aurora: AuroraSpec | null;
  /**
   * Deep-sky nebula glow patch. Null below epic. Intensity rises from
   * epic -> legendary -> mythic. The hue matches the rarity accent so
   * the nebula reads as an extension of the tier's signature colour.
   */
  nebula: NebulaSpec | null;
  silhouettePath: (px: number, py: number, ps: number) => string;
  /** Horizon Y in normalised photo coords [0, 1]. Used to anchor the reasoning quote. */
  horizonY: number;
  /** Hex for the rarity accent — used by ornament ticks and a sprinkle of accent stars. */
  accentColor: string;
  grainFreq: number;
  /**
   * Crowd-consensus silhouette. A second hill drawn BEHIND the user's
   * mountain to give the photo depth: same densityAt() math but
   * centred on `consensusAtBet` with a wider synthetic spread, lifted
   * up the photo by ~4% (so it peeks behind the user's peak), and a
   * smaller peak lift (~60%) so it reads as further away. Returns
   * null when `consensusAtBet` is missing -- the polaroid then falls
   * back to a single-hill composition unchanged.
   */
  consensusSilhouettePath: ((px: number, py: number, ps: number) => string) | null;
  /**
   * Atmospheric-perspective fill for the consensus silhouette. Tuned
   * to sit BETWEEN the sky-bottom and the ground-top so the back hill
   * dissolves into haze where it meets the sky. Null when the
   * consensus hill isn't drawn.
   */
  consensusFill: { top: string; bottom: string; line: string } | null;
}

function buildPhoto(opts: {
  width: number;
  photoWidth: number;
  photoHeight: number;
  prediction: number;
  spread: number;
  /**
   * Second peak position for `bimodal` shape. When non-null we draw
   * the silhouette as a true two-gaussian mixture matching the chart;
   * when null we fall back to the legacy symmetric reconstruction.
   */
  secondPeak: number | null;
  shape: 'gaussian' | 'range' | 'bimodal';
  lowerBound: number;
  upperBound: number;
  seed: number;
  conviction: number;
  collateral: number;
  developed: boolean;
  progress: number;
  resolvedOutcome: number | null;
  rarity: Rarity | null;
  /**
   * Crowd consensus mean at bet time. When provided, the photo gets a
   * second hill behind the user's silhouette centred on this value --
   * the contrarian-vs-consensus story made visible in the artwork.
   * Null falls back to the original single-hill composition.
   */
  consensusAtBet: number | null;
  /**
   * ACTUAL crowd-consensus density curve (e.g. straight from
   * `useConsensus`). When provided, the back hill is drawn from
   * this array verbatim, so a bimodal market consensus renders as
   * an actual two-peak ridge instead of the single-Gaussian
   * approximation that ignored multi-modal shapes. Null/empty
   * falls back to the legacy `gaussian(x, consensusAtBet, ...)`
   * reconstruction.
   */
  consensusCurve?: number[] | null;
  /**
   * ACTUAL user-belief density curve (e.g. straight from
   * `evaluateDensityCurve(previewBelief, ...)`). When provided,
   * the front hill is drawn from this array verbatim instead of
   * being recomputed via `densityAt`, so the polaroid hill
   * silhouette is pixel-equivalent to the chart's "Trade Preview"
   * curve. Null/empty falls back to `densityAt`.
   */
  userCurve?: number[] | null;
}): PhotoSpec {
  const range = opts.upperBound - opts.lowerBound;
  const rng = mulberry32(opts.seed);
  // Pull several uniform draws from the rng up front so visual decisions
  // are stable across renders.
  const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();

  // Rarity is now the PRIMARY visual driver. The sky, sun, glow, ground,
  // and accent colour are all anchored to the rarity tier's signature hue,
  // and the seed only adds tier-internal variation (hue jitter, saturation,
  // lightness, sun positions, star pattern, silhouette jitter).
  //
  // This is the key change the user asked for: "the sky's color is not
  // random but corresponds to the rarity color." Two epic receipts now
  // both read as "violet" — just with unique micro-variation between them.
  // Common stays muted neutral, mythic stays ember/crimson, etc.
  const palettes = rarityPalette(opts.rarity, opts.seed, opts.conviction, opts.developed);

  // Horizon position varies with both seed and conviction. Low conviction
  // = flat horizon (uncertainty), high conviction = lifted dramatic horizon.
  // Capped on the upper side so the quote area below the horizon always
  // has at least ~30% of the photo to fit a multi-line meme caption.
  const horizonY = clamp(
    0.50 + (1 - opts.conviction) * 0.07 + (r2 - 0.5) * 0.05,
    0.42,
    0.62,
  );

  // Stake feeds a clamped 0..1 boost that scales the sun radius, the
  // ornament tick density, and the ornament tick length further down.
  const stakeBoost = clamp01(Math.log10(Math.max(1, opts.collateral)) / 3); // 0…1 over $1…$1000

  // STAR SYSTEM - driven purely by rarity. Star count strictly increments
  // by one per tier so the rarity ladder reads at a glance:
  //
  //   common 1, uncommon 2, rare 3, epic 4, legendary 5, mythic 6.
  //
  // Layouts decompose each count into binary pairs + optional singletons
  // (see `rarityTopology` for the table), so the existing pair-placement
  // code below handles every tier with no special-casing per count. Pairs
  // sit tight (a1 ~ 0.10-0.18 in normalised photo coords); group centers
  // are far apart (~ 0.30-0.45), giving a 3-5x distance ratio so the
  // composition reads as hierarchical rather than crowded.
  const topology = rarityTopology(opts.rarity);
  const totalBodies = topology.reduce((s, n) => s + n, 0);
  const numGroups = topology.length;
  const rLevel = rarityLevel(opts.rarity);

  // Deterministic RNG for layout: derived from the prediction seed so the
  // composition is stable across re-renders / resizes / zooms.
  const sunRng = mulberry32(opts.seed ^ 0x5_7c0c0);

  // Sky band the suns are allowed to occupy. We keep them strictly above
  // the silhouette horizon so the reasoning quote in the lower half stays
  // legible.
  const skyXMin = 0.15;
  const skyXMax = 0.85;
  const skyYMin = 0.10;
  const skyYMax = Math.max(0.20, horizonY - 0.18);
  const skyXSpan = skyXMax - skyXMin;
  const skyYSpan = Math.max(0.05, skyYMax - skyYMin);

  // As body count rises, each star has to shrink so up to 6 disks fit in
  // the sky band without overlapping. The single-star case keeps the
  // original dramatic-sun size; multi-star configurations drop to
  // "moon-sized" companions. Falloff is gentle and monotonic.
  const radiusScale =
    totalBodies === 1 ? 1.0 :
    totalBodies === 2 ? 0.58 :
    totalBodies === 3 ? 0.42 :
    totalBodies === 4 ? 0.34 :
    totalBodies === 5 ? 0.30 :
    totalBodies === 6 ? 0.27 :
    1.0;
  const baseSunR =
    opts.photoWidth *
    radiusScale *
    (0.13 + opts.conviction * 0.07 + stakeBoost * 0.06);

  // Pair-internal separation a1 (normalised, center-to-center). Loose
  // enough for count=2 (whole sky to itself) but tightens for 4+ star
  // configs so multiple groups fit comfortably.
  const pairSep =
    totalBodies === 2 ? 0.20 :
    totalBodies <= 4 ? 0.14 :
    0.10;

  // Group center placement templates. Each layout is a deterministic
  // 2D arrangement that maximises the minimum inter-group distance for
  // the given number of groups, then the seed adds small jitter for
  // organic variety. Coordinates are fractions of the (skyXSpan,
  // skyYSpan) box anchored at (skyXMin, skyYMin).
  type Slot = { fx: number; fy: number };
  const slots: Slot[] =
    numGroups === 1
      ? [{ fx: 0.50, fy: 0.40 }]
      : numGroups === 2
        ? [
            { fx: 0.22, fy: 0.40 },
            { fx: 0.78, fy: 0.55 },
          ]
        : numGroups === 3
          ? [
              { fx: 0.50, fy: 0.18 },
              { fx: 0.18, fy: 0.75 },
              { fx: 0.82, fy: 0.72 },
            ]
          : [
              { fx: 0.20, fy: 0.22 },
              { fx: 0.80, fy: 0.25 },
              { fx: 0.22, fy: 0.78 },
              { fx: 0.78, fy: 0.75 },
            ];

  // Permute which slot receives which topology entry, so the singleton
  // in 5- or 7-star systems doesn't always land in the same corner.
  // Fisher-Yates shuffle of [0..numGroups-1] driven by the same seed RNG.
  const slotOrder = Array.from({ length: numGroups }, (_, i) => i);
  for (let i = slotOrder.length - 1; i > 0; i--) {
    const j = Math.floor(sunRng() * (i + 1));
    [slotOrder[i], slotOrder[j]] = [slotOrder[j], slotOrder[i]];
  }

  // Per-group seed jitter: small in normalised photo units so the
  // template layout stays recognisable as hierarchical.
  const jitterAmp = numGroups === 1 ? 0.06 : 0.04;
  const groupCenters = slots.map((s) => {
    const jx = (sunRng() - 0.5) * jitterAmp;
    const jy = (sunRng() - 0.5) * jitterAmp;
    return {
      x: clamp(skyXMin + (s.fx + jx) * skyXSpan, skyXMin, skyXMax),
      y: clamp(skyYMin + (s.fy + jy) * skyYSpan, skyYMin, skyYMax),
    };
  });

  const suns: SunSpec[] = [];
  // Cycle through the three accent hues across all stars so the ensemble
  // feels like one stellar family while still letting each star carry a
  // micro-variation. Available cores: [sunCore, sun2Core, sun3Core].
  const sunCores = [palettes.sunCore, palettes.sun2Core, palettes.sun3Core];

  // Walk topology in the permuted slot order so the largest group always
  // lands in slot 0 visually unless the shuffle moved it.
  let bodyIndex = 0;
  for (let gIdx = 0; gIdx < numGroups; gIdx++) {
    const slot = slotOrder[gIdx];
    const center = groupCenters[slot];
    const size = topology[gIdx];
    // Primary group (gIdx === 0 in topology order) is the dominant system
    // in the composition. Falloff per group is gentle so distant binaries
    // still read clearly.
    const groupScale = gIdx === 0 ? 1.0 : gIdx === 1 ? 0.92 : 0.84;

    if (size === 1) {
      // Single star. Slightly smaller than a group's primary so it reads
      // as a distant solo rather than a primary, but still distinct from
      // the dot-stars in the background sky.
      const weight = (gIdx === 0 ? 1.0 : 0.68) * groupScale;
      const r = Math.max(7, Math.round(baseSunR * weight));
      const coreR = r * (0.42 + r3 * 0.1);
    suns.push({
        x: center.x,
        y: center.y,
      r,
      coreR,
        core: sunCores[bodyIndex % sunCores.length],
      glow: palettes.sunGlow,
      weight,
    });
      bodyIndex++;
    } else {
      // Binary pair. Orient at a seed-driven angle and offset each member
      // by half of pairSep on opposite sides of the group center. The y
      // component is squashed (0.55x) so the pair leans horizontal -
      // more pleasing on the wide-aspect photo than vertical stacks.
      const theta = sunRng() * Math.PI * 2;
      const dx = (Math.cos(theta) * pairSep) / 2;
      const dy = ((Math.sin(theta) * pairSep) / 2) * 0.55;
      // Primary in this group + companion in this group. We gently
      // randomize which side gets which weight so binaries don't all look
      // "big-on-the-left, small-on-the-right".
      const flip = sunRng() < 0.5;
      const primaryWeight = 1.0 * groupScale;
      const companionWeight = 0.82 * groupScale;
      const aPos = { x: center.x - dx, y: center.y - dy };
      const bPos = { x: center.x + dx, y: center.y + dy };
      const primaryPos = flip ? bPos : aPos;
      const companionPos = flip ? aPos : bPos;
      {
        const r = Math.max(7, Math.round(baseSunR * primaryWeight));
        const coreR = r * (0.42 + r3 * 0.1);
        suns.push({
          x: clamp(primaryPos.x, skyXMin, skyXMax),
          y: clamp(primaryPos.y, skyYMin, skyYMax),
          r,
          coreR,
          core: sunCores[bodyIndex % sunCores.length],
          glow: palettes.sunGlow,
          weight: primaryWeight,
        });
        bodyIndex++;
      }
      {
        const r = Math.max(6, Math.round(baseSunR * companionWeight));
        const coreR = r * (0.42 + r3 * 0.1);
        suns.push({
          x: clamp(companionPos.x, skyXMin, skyXMax),
          y: clamp(companionPos.y, skyYMin, skyYMax),
          r,
          coreR,
          core: sunCores[bodyIndex % sunCores.length],
          glow: palettes.sunGlow,
          weight: companionWeight,
        });
        bodyIndex++;
      }
    }
  }

  // Stars — count varies with conviction, density with seed. High-conviction
  // bets get a more starry sky, low-conviction get a sparser one. A small
  // fraction of stars get the rarity accent colour ("accent stars") so the
  // tier signature reads even when the eye is in the sky.
  const starRng = mulberry32(opts.seed ^ 0xabc123);
  const numStars = Math.round(14 + opts.conviction * 22 + r4 * 4);
  const stars: Array<{ x: number; y: number; r: number; o: number; accent: boolean }> = [];
  // Higher tiers get more accent stars (max ~25% on mythic). Common gets
  // none — keeps Common visually quiet vs. the showier tiers.
  const accentFraction = accentStarFraction(opts.rarity);
  for (let i = 0; i < numStars; i++) {
    const sx = starRng();
    const sy = starRng() * horizonY * 0.85;
    const sr = 0.35 + starRng() * 1.15;
    const so = 0.3 + starRng() * 0.6;
    // Skip stars that fall under any sun.
    let underSun = false;
    for (const s of suns) {
      if (Math.hypot(sx - s.x, sy - s.y) < 0.13 * (0.5 + s.weight * 0.5)) {
        underSun = true;
        break;
      }
    }
    if (underSun) continue;
    const accent = starRng() < accentFraction;
    stars.push({ x: sx, y: sy, r: sr, o: so, accent });
  }

  // Silhouette — driven by spread AND seed. Spread controls how wide the
  // mountain mass is; seed adds a small per-receipt jitter so two users
  // with identical spread numbers still get distinguishable horizons.
  //
  // Jitter amplitude was reduced from 0.02 -> 0.004 (~5x smaller) so
  // the polaroid hill silhouettes read as smooth gaussian curves that
  // visually match the bottom-of-page Probability Density chart's
  // curves. The previous amplitude added ±9 px of texture on a 448 px
  // photo, which made the hills look like noisy ridges instead of
  // smooth probability humps. The remaining ±1.8 px of jitter is just
  // enough to keep two receipts with identical inputs distinguishable
  // without breaking the "polaroid hills ARE the chart curves" read.
  const jitterSeed = opts.seed ^ 0xdef456;
  const jitterRng = mulberry32(jitterSeed);
  const jitters = Array.from({ length: 96 }, () => (jitterRng() - 0.5) * 0.004);

  // ────────────────────────────────────────────────────────────────────
  // SILHOUETTES  (user belief + crowd consensus, PDF-normalised)
  //
  // Both hills share a single normalisation factor so the relative
  // peak heights in the photo correspond to the actual concentration
  // of each belief over the market range. Without a shared factor a
  // wide diffuse Gaussian and a narrow peaked one would both render
  // at full height, erasing the contrarian-vs-consensus signal that
  // the photo is meant to carry.
  //
  // The recipe (mirrors the bottom-of-page Probability Density chart):
  //
  //   1. Sample each density curve at 96 evenly-spaced X positions.
  //   2. Numerically integrate ( sum * dx ) to get the total mass of
  //      each curve over the plotted [lowerBound, upperBound] band.
  //   3. Divide every sample by its mass -- now both curves are
  //      proper PDFs that integrate to 1, and their peak heights
  //      truthfully represent "where mass is concentrated".
  //   4. Find the SHARED max across both PDFs.
  //   5. Lift each silhouette by `peakLift * (sample / sharedMax)`,
  //      using the SAME peakLift for both -- the relative heights
  //      come out of the math, not an arbitrary multiplier.
  //
  // Net effect: a tightly held conviction in a wide market produces
  // a tall narrow foreground hill and a short wide back hill, just
  // like the bottom chart. A diffuse user belief produces hills of
  // similar height. The polaroid stops "lying about scale".
  //
  // Graceful degradation: if `consensusAtBet` is null (legacy
  // receipts captured before consensus snapshotting, or contexts
  // where it just isn't known), `consensusSilhouettePath` is null
  // and the photo renders the original single-hill composition with
  // the user's PDF normalised against itself, unchanged in shape.
  // ────────────────────────────────────────────────────────────────────
  const numSamples = 96;
  const dx = range / Math.max(1, numSamples - 1);
  const peakLift = 0.15 + opts.conviction * 0.18;

  // Resample any provided density curve (variable length) onto our
  // 96-sample silhouette grid via linear interpolation, so callers can
  // pass curves of any granularity straight from `useConsensus` /
  // `evaluateDensityCurve` without conforming to our internal sample
  // count.
  const resampleCurve = (curve: number[]): number[] => {
    const out = new Array<number>(numSamples);
    if (curve.length === 0) return out.fill(0);
    if (curve.length === 1) return out.fill(curve[0]);
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const idx = t * (curve.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(curve.length - 1, lo + 1);
      const f = idx - lo;
      out[i] = curve[lo] * (1 - f) + curve[hi] * f;
    }
    return out;
  };

  const userRaw: number[] = new Array(numSamples);
  let userMass = 0;
  if (opts.userCurve && opts.userCurve.length > 0) {
    // Caller supplied the chart's actual evaluated belief curve. The
    // polaroid front hill copies its shape verbatim, ensuring "the
    // hills in the polaroid look exactly like the curves in the
    // chart" without relying on the procedural densityAt
    // reconstruction matching the SDK's `evaluateDensityCurve` to
    // floating-point precision.
    const samples = resampleCurve(opts.userCurve);
    for (let i = 0; i < numSamples; i++) {
      const v = Math.max(0, samples[i]);
      userRaw[i] = v;
      userMass += v;
    }
  } else {
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const x = opts.lowerBound + t * range;
      const v = densityAt(x, opts);
      userRaw[i] = v;
      userMass += v;
    }
  }
  userMass *= dx;
  let userPdfMax = 0;
  if (userMass > 1e-9) {
    for (let i = 0; i < numSamples; i++) {
      userRaw[i] = userRaw[i] / userMass;
      if (userRaw[i] > userPdfMax) userPdfMax = userRaw[i];
    }
  } else {
    // Pathological case: user mass collapsed to ~0 (e.g. range=0). Fall
    // back to per-sample normalisation against the raw max so we still
    // render a meaningful silhouette instead of a flat line.
    let m = 0;
    for (const v of userRaw) if (v > m) m = v;
    if (m > 0) for (let i = 0; i < numSamples; i++) userRaw[i] = userRaw[i] / m;
    userPdfMax = userRaw.reduce((a, b) => Math.max(a, b), 0);
  }

  const hasConsensusCurve = !!(opts.consensusCurve && opts.consensusCurve.length > 0);
  const consensusMeanInRange =
    opts.consensusAtBet != null &&
    Number.isFinite(opts.consensusAtBet) &&
    opts.consensusAtBet >= opts.lowerBound &&
    opts.consensusAtBet <= opts.upperBound;
  // The back hill draws as long as we have ANY signal for it: either
  // the actual density curve (preferred -- bimodal-aware) or just a
  // scalar mean to centre a Gaussian on (legacy fallback).
  const consensusInRange = hasConsensusCurve || consensusMeanInRange;

  let consensusRaw: number[] | null = null;
  let consensusPdfMax = 0;
  let consensusHorizonY = horizonY;
  let consensusJitters: number[] | null = null;

  if (consensusInRange) {
    consensusRaw = new Array(numSamples);
    let consensusMass = 0;
    if (hasConsensusCurve) {
      // Caller supplied the actual market-consensus density curve.
      // The polaroid back hill copies its shape verbatim -- a
      // bimodal market consensus paints as two peaks instead of
      // collapsing into a single Gaussian. This is the contract
      // the user requested: "the lighter hill should have the shape
      // of the market consensus."
      const samples = resampleCurve(opts.consensusCurve as number[]);
      for (let i = 0; i < numSamples; i++) {
        const v = Math.max(0, samples[i]);
        consensusRaw[i] = v;
        consensusMass += v;
      }
    } else {
      const consensusMean = opts.consensusAtBet as number;
      // Legacy fallback when no curve is available: Gaussian centred
      // on the scalar `consensusAtBet`. Wider sigma reads as "the
      // crowd's belief has more uncertainty than any individual"
      // which is true by construction.
      const consensusSpread = Math.max(opts.spread * 1.3, range * 0.05);
      for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1);
        const x = opts.lowerBound + t * range;
        const v = gaussian(x, consensusMean, consensusSpread);
        consensusRaw[i] = v;
        consensusMass += v;
      }
    }
    consensusMass *= dx;
    if (consensusMass > 1e-9) {
      for (let i = 0; i < numSamples; i++) {
        consensusRaw[i] = consensusRaw[i] / consensusMass;
        if (consensusRaw[i] > consensusPdfMax) consensusPdfMax = consensusRaw[i];
      }
    }
    // Lift the back-hill horizon up the photo so its peak appears to
    // emerge from "behind" the user's foreground horizon. Capped so a
    // very low foreground horizon (low conviction) doesn't push the
    // back hill into the suns/aurora layer. This is the ONLY trick we
    // still use for parallax depth -- height is now honest.
    consensusHorizonY = Math.max(0.30, horizonY - 0.04);
    // Independent jitter stream so the back ridge has a slightly
    // different micro-profile from the foreground hill even when
    // their peaks coincide. The xor key is arbitrary but stable.
    //
    // Amplitude reduced from 0.018 -> 0.0035 (matches the user-side
    // 0.004 reduction) so the back hill is also a smooth gaussian
    // visually matching the chart's consensus curve.
    const consensusJitterRng = mulberry32(opts.seed ^ 0xa11_face);
    consensusJitters = Array.from(
      { length: numSamples },
      () => (consensusJitterRng() - 0.5) * 0.0035,
    );
  }

  // SHARED normalisation factor across both PDFs. Both hills lift in
  // proportion to the same denominator, so their relative peak heights
  // directly reflect the ratio of crowd-peak / user-peak densities --
  // exactly what the bottom-of-page chart shows numerically.
  const sharedPdfMax = Math.max(userPdfMax, consensusPdfMax);

  const silhouettePath = (px: number, py: number, ps: number) => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const norm = sharedPdfMax > 0 ? userRaw[i] / sharedPdfMax : 0;
      const y = horizonY - norm * peakLift + jitters[i];
      points.push([t, y]);
    }
    let d = `M ${px} ${py + ps}`;
    d += ` L ${px} ${py + horizonY * ps}`;
    for (const [t, y] of points) {
      d += ` L ${px + t * ps} ${py + y * ps}`;
    }
    d += ` L ${px + ps} ${py + horizonY * ps}`;
    d += ` L ${px + ps} ${py + ps} Z`;
    return d;
  };

  let consensusSilhouettePath: ((px: number, py: number, ps: number) => string) | null = null;
  let consensusFill: { top: string; bottom: string; line: string } | null = null;

  if (consensusInRange && consensusRaw && consensusJitters) {
    const cRaw = consensusRaw;
    const cJ = consensusJitters;
    const cHorizonY = consensusHorizonY;
    consensusSilhouettePath = (px: number, py: number, ps: number) => {
      const points: Array<[number, number]> = [];
      for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1);
        const norm = sharedPdfMax > 0 ? cRaw[i] / sharedPdfMax : 0;
        const y = cHorizonY - norm * peakLift + cJ[i];
        points.push([t, y]);
      }
      let d = `M ${px} ${py + ps}`;
      d += ` L ${px} ${py + cHorizonY * ps}`;
      for (const [t, y] of points) {
        d += ` L ${px + t * ps} ${py + y * ps}`;
      }
      d += ` L ${px + ps} ${py + cHorizonY * ps}`;
      d += ` L ${px + ps} ${py + ps} Z`;
      return d;
    };

    // Back-hill fill: pinned to the ground colour family with the
    // tiniest possible atmospheric-perspective tint toward the sky.
    //
    // Tuning history:
    //   0.55 / 0.45 / 0.40 -- "almost invisible" per the user
    //   0.22 / 0.18 / 0.15 -- still too washed out, the user said
    //                         it should be "a lot darker, almost
    //                         as dark as our own prediction curve"
    //   0.08 / 0.06 / 0.05 -- current. Almost identical to the
    //                         prediction hill at mix=0 with just
    //                         a hairline of sky-warm shifting it
    //                         into the "back layer of the same
    //                         range" optical band.
    //
    // The 3D depth cue now comes overwhelmingly from the
    // consensusHorizonY offset (the back hill sits above the
    // foreground hill on the canvas, so its silhouette pokes out
    // BEHIND the prediction hill instead of sharing its base
    // line) rather than from colour saturation. Painters call
    // this aerial perspective "by elevation, not by hue" and it
    // is the look the user described: prediction hill at the
    // front, consensus hill behind it, both clearly readable
    // mountains rather than the back one fading to mist.
    consensusFill = {
      top: mix(palettes.ground.top, palettes.sky.bottom, 0.08),
      bottom: mix(palettes.ground.bottom, palettes.sky.bottom, 0.06),
      line: mix(palettes.ground.line, palettes.sky.bottom, 0.05),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // CELESTIAL EVENTS - tier-gated, monotonically richer with rarity.
  //
  // Each layer is deterministic via a dedicated RNG stream forked from
  // the same seed, so the events are stable across re-renders (the user
  // explicitly asked: zooming / resizing must never re-randomize). The
  // *count* and *intensity* of each event scale with `rLevel`; only the
  // *positions* and *colors* vary within a tier. That gives a continuous
  // gradient of richness from common (bare sky) to mythic (aurora +
  // multiple comets + nebula) without high-frequency randomization.
  // ────────────────────────────────────────────────────────────────────
  const eventRng = mulberry32(opts.seed ^ 0xc0_de_fe_ed);

  // -- Comets / shooting stars --
  // A comet is a RARE celestial event in real life and we model it that
  // way: never more than one per receipt, and only a small probability
  // of appearing at all. The probability rises gently with rarity so
  // higher tiers are slightly more likely to surface one - never to the
  // point where mythic always has a comet.
  //
  //   common    ->  0%   (never)
  //   uncommon  ->  8%
  //   rare      -> 14%
  //   epic      -> 22%
  //   legendary -> 32%
  //   mythic    -> 45%
  let cometChance: number;
  if (rLevel === 0) cometChance = 0;
  else if (rLevel === 1) cometChance = 0.08;
  else if (rLevel === 2) cometChance = 0.14;
  else if (rLevel === 3) cometChance = 0.22;
  else if (rLevel === 4) cometChance = 0.32;
  else cometChance = 0.45;
  const cometCount = eventRng() < cometChance ? 1 : 0;

  const comets: CometSpec[] = [];
  if (cometCount === 1) {
    // Place the comet head somewhere in the upper-mid sky, avoiding the
    // sun halos. Up to 6 placement attempts so cometless areas of the
    // sky get used.
    let cx = 0.5;
    let cy = 0.3;
    for (let attempt = 0; attempt < 6; attempt++) {
      cx = 0.15 + eventRng() * 0.70;
      cy = 0.05 + eventRng() * Math.max(0.10, skyYMax - 0.05);
      let nearSun = false;
      for (const s of suns) {
        if (Math.hypot(cx - s.x, cy - s.y) < 0.16 * (0.5 + s.weight * 0.5)) {
          nearSun = true;
          break;
        }
      }
      if (!nearSun) break;
    }
    // Tail length grows mildly with tier: 0.12 .. 0.22 of photo width.
    const tailLen = 0.12 + 0.02 * rLevel + eventRng() * 0.04;
    // Tail angle biased downward-left or downward-right - reads as a
    // falling streak. Random sign keeps things varied.
    const angleBase = (Math.PI / 4) + eventRng() * (Math.PI / 4);
    const angle = eventRng() < 0.5 ? Math.PI - angleBase : angleBase;
    const intensity = 0.55 + 0.08 * rLevel + eventRng() * 0.08;
    comets.push({ x: cx, y: cy, length: tailLen, angle, intensity: clamp01(intensity) });
  }

  // -- Nebula (deep-sky glow) -- epic+ only.
  let nebula: NebulaSpec | null = null;
  if (rLevel >= 3) {
    // Place in upper-half sky, away from suns. We try a couple of
    // candidate positions and pick the one furthest from any sun.
    let bestX = 0.5;
    let bestY = 0.18;
    let bestMinDist = -1;
    for (let attempt = 0; attempt < 4; attempt++) {
      const nx = 0.15 + eventRng() * 0.70;
      const ny = 0.05 + eventRng() * Math.max(0.12, skyYMax - 0.10);
      let minDist = Infinity;
      for (const s of suns) {
        minDist = Math.min(minDist, Math.hypot(nx - s.x, ny - s.y));
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestX = nx;
        bestY = ny;
      }
    }
    const nebulaIntensity =
      rLevel === 3 ? 0.35 + eventRng() * 0.08 :
      rLevel === 4 ? 0.55 + eventRng() * 0.10 :
      0.78 + eventRng() * 0.10;
    nebula = {
      x: bestX,
      y: bestY,
      radius: 0.20 + 0.025 * (rLevel - 2) + eventRng() * 0.04,
      intensity: clamp01(nebulaIntensity),
      // Inner core uses the rarity accent at a brighter mid-tone; outer
      // fade uses the same hue at a faint cool blue-violet wash. This
      // makes the nebula feel like a colored cloud, not a flat blob.
      innerColor: palettes.accent,
      outerColor: palettes.sunGlow,
    };
  }

  // -- Aurora curtain -- legendary+ only.
  //
  // Real auroras are layered, not monochrome. The famous green band is
  // just the lowest layer of oxygen emission at 557.7 nm; above it sit
  // pink/red wisps from high-altitude oxygen (630 nm) and blue/purple
  // bands from nitrogen. We paint that whole vertical stack rather
  // than a flat green wash so the result actually looks like an
  // aurora photograph instead of a neon ribbon.
  //
  // Legendary uses a rose-gold pink top, soft purple mid, cornflower
  // blue body, and a muted sage green base. Mythic deepens the pink
  // into crimson-magenta and the purple into a darker violet so the
  // tier still telegraphs through the curtain colour. Both keep the
  // green deliberately weak — the user noted that the previous bright
  // turquoise didn't feel auroral and dominated the photo, so green
  // is now a quiet supporting layer, not the lead.
  //
  // The rarity accent (gold for legendary, ember/crimson for mythic)
  // is then layered as a faint upper-band kiss in the render path so
  // the palette stays coherent with the rest of the receipt.
  let aurora: AuroraSpec | null = null;
  if (rLevel >= 4) {
    const isMythic = rLevel === 5;

    const topColor = isMythic ? '#F08099' : '#E8A8B8'; // crimson-pink vs rose-pink
    const midColor = isMythic ? '#9F6FCF' : '#A883D9'; // deeper violet vs soft lavender
    const blueColor = isMythic ? '#5C7AD8' : '#7090E0'; // periwinkle vs cornflower
    const bodyColor = '#6DB892'; // muted sage green — present but not loud

    // Curtain 1: the dominant one. Top of curtain sits high in the sky;
    // bottom is roughly 25-30% of photo height lower.
    const curtain1: AuroraCurtainSpec = {
      yTop: 0.06 + eventRng() * 0.04,
      yBot: 0.30 + eventRng() * 0.05,
      phase: eventRng() * Math.PI * 2,
      ampTop: 0.018 + eventRng() * 0.008,
      ampBot: 0.010 + eventRng() * 0.006,
      opacity: isMythic ? 0.95 : 0.80,
      topColor,
      midColor,
      blueColor,
      bodyColor,
      accentColor: palettes.accent,
    };
    const curtains: AuroraCurtainSpec[] = [curtain1];
    if (isMythic) {
      // Curtain 2: layered behind, shifted horizontally + slightly
      // taller, fainter. Adds depth without changing the palette.
      curtains.unshift({
        yTop: 0.04 + eventRng() * 0.03,
        yBot: 0.34 + eventRng() * 0.05,
        phase: curtain1.phase + Math.PI * (0.45 + eventRng() * 0.25),
        ampTop: 0.022 + eventRng() * 0.008,
        ampBot: 0.012 + eventRng() * 0.006,
        opacity: 0.55,
        topColor,
        midColor,
        blueColor,
        bodyColor,
        accentColor: palettes.accent,
      });
    }
    aurora = {
      intensity: isMythic ? 0.70 + eventRng() * 0.10 : 0.55 + eventRng() * 0.08,
      curtains,
    };
  }

  return {
    sky: palettes.sky,
    ground: palettes.ground,
    suns,
    stars,
    comets,
    aurora,
    nebula,
    silhouettePath,
    horizonY,
    accentColor: palettes.accent,
    // Grain frequency varies subtly per-receipt so the noise pattern
    // differs receipt-to-receipt. Range chosen so the dot pattern is
    // dense enough to feel like film grain at every polaroid width.
    grainFreq: 0.7 + r1 * 0.6,
    consensusSilhouettePath,
    consensusFill,
  };
}

/**
 * Stellar topology, by rarity tier. Star count increments by exactly one
 * per tier so the receipt visually advertises the rarity ladder:
 *
 *     common    -> 1
 *     uncommon  -> 2
 *     rare      -> 3
 *     epic      -> 4
 *     legendary -> 5
 *     mythic    -> 6
 *
 * Each entry is a list of GROUP sizes. A group is a tightly-bound cluster
 * (single star or close binary). Groups are placed far apart from each
 * other, so even 3-, 5-, and 6-star systems read as a hierarchy of close
 * pairs plus distant singletons rather than a chaotic close cluster. The
 * binary-pair placement code in `buildPhoto` handles group sizes 1 and 2
 * directly; we therefore decompose every star count into pairs + singles
 * so the existing layout templates light up the right number of slots.
 *
 *   1 -> [1]              single
 *   2 -> [2]              binary
 *   3 -> [2, 1]           binary + single
 *   4 -> [2, 2]           two distant binaries (Castor-style)
 *   5 -> [2, 2, 1]        two binaries + a distant single
 *   6 -> [2, 2, 1, 1]     two binaries + two distant singletons
 *
 * Strictly more stars per tier means the rarity ladder reads at a glance
 * even before the user notices the comet count, aurora, or nebula.
 */
function rarityTopology(rarity: Rarity | null): number[] {
  switch (rarity) {
    case 'mythic':    return [2, 2, 1, 1];
    case 'legendary': return [2, 2, 1];
    case 'epic':      return [2, 2];
    case 'rare':      return [2, 1];
    case 'uncommon':  return [2];
    case 'common':    return [1];
    default:          return [1];
  }
}

/**
 * Numeric rarity index, 0 (common) -> 5 (mythic). Used to drive every
 * tier-scaled visual feature monotonically so the rarity gradient reads
 * continuously: more stars, more comets, brighter nebula, stronger
 * aurora, more accent stars - never less.
 */
function rarityLevel(rarity: Rarity | null): number {
  switch (rarity) {
    case 'mythic':    return 5;
    case 'legendary': return 4;
    case 'epic':      return 3;
    case 'rare':      return 2;
    case 'uncommon':  return 1;
    case 'common':    return 0;
    default:          return 0;
  }
}

/**
 * Fraction of stars that should be drawn in the rarity accent colour. The
 * accent stars are a "sparkle" effect that telegraphs the tier even when
 * the eye is locked onto the sky and not the frame border.
 */
function accentStarFraction(rarity: Rarity | null): number {
  switch (rarity) {
    case 'mythic':    return 0.25;
    case 'legendary': return 0.20;
    case 'epic':      return 0.14;
    case 'rare':      return 0.10;
    case 'uncommon':  return 0.06;
    case 'common':    return 0;
    default:          return 0;
  }
}

function densityAt(
  x: number,
  opts: {
    prediction: number;
    spread: number;
    secondPeak?: number | null;
    shape: string;
    lowerBound: number;
    upperBound: number;
  },
): number {
  if (opts.shape === 'range') {
    const half = opts.spread;
    const low = opts.prediction - half;
    const high = opts.prediction + half;
    if (x >= low && x <= high) return 1;
    const dist = x < low ? low - x : x - high;
    return Math.exp(-dist / (half * 0.4));
  }
  if (opts.shape === 'bimodal') {
    // Match the BetFlow chart EXACTLY. The chart calls
    // `generateBelief([{point, prediction, spread, weight: 0.5},
    // {point, secondPeak, spread, weight: 0.7}])` -- two
    // independent Gaussians at two independently-chosen positions,
    // each with the user's own `spread` as σ. We mirror the same
    // weights, the same σ, and (when the receipt has a stored
    // `secondPeak`) the same two centres so the polaroid
    // silhouette and the chart curve are pixel-equivalent.
    if (
      opts.secondPeak != null &&
      Number.isFinite(opts.secondPeak)
    ) {
      const sigma = Math.max(opts.spread, 1e-9);
      return (
        0.5 * gaussian(x, opts.prediction, sigma) +
        0.7 * gaussian(x, opts.secondPeak, sigma)
      );
    }
    // Legacy fallback for receipts saved before the `secondPeak`
    // field was persisted. The original symmetric reconstruction
    // (peaks at `prediction +- spread*1.6`) keeps old polaroids
    // rendering the same shape they always did rather than
    // suddenly collapsing to a single peak when their `secondPeak`
    // is missing.
    const offset = opts.spread * 1.6;
    return (
      0.5 * gaussian(x, opts.prediction - offset, opts.spread * 0.7) +
      0.7 * gaussian(x, opts.prediction + offset, opts.spread * 0.7)
    );
  }
  return gaussian(x, opts.prediction, opts.spread);
}

function gaussian(x: number, mean: number, sigma: number): number {
  const z = (x - mean) / Math.max(0.0001, sigma);
  return Math.exp(-(z * z) / 2);
}

interface FamilyPalette {
  sky: { top: string; mid: string; bottom: string };
  ground: { top: string; bottom: string; line: string };
  sunCore: string;
  sunGlow: string;
  sun2Core: string;
  sun3Core: string;
  /** Rarity accent colour, exposed for ornament strip + accent stars. */
  accent: string;
}

/**
 * RARITY-ANCHORED VISUAL SIGNATURE.
 *
 * Each rarity tier owns a slice of the HSL color wheel. The sky, sun glow,
 * ground, and accent colours all draw from that slice, with the seed
 * supplying ±jitter within the slice so every receipt in the tier is
 * unique but visually coherent.
 *
 * This replaces the old "8 palette families × random hue" system which the
 * user (correctly) experienced as fully random. Now:
 *   - Two epic receipts both read as "violet".
 *   - Two mythic receipts both read as "ember/crimson".
 *   - But no two receipts in the same tier are identical.
 *
 * Hue values are in degrees (0..360 wrap). Saturation in [0, 1].
 * `accentHue` is the offset hue used for ornament ticks and a sprinkle
 * of accent stars — picked to contrast the dominant sky.
 */
interface RarityVisual {
  baseHue: number;
  /** Total degrees of variation across the seed range. ±half within the tier. */
  hueSpan: number;
  baseSat: number;
  accentHue: number;
  accentSat: number;
  accentLight: number;
}

/**
 * The user explicitly asked: "the sky's color is not random but corresponds
 * to the rarity color." This table is the source of truth for that mapping.
 * Tweak with caution — the rarity stamp (in rarity.ts TIER_META) and the
 * sky base hue here should always feel like the same colour family.
 */
const RARITY_VISUAL: Record<Rarity, RarityVisual> = {
  common: {
    // Neutral GREY — like a basic loot drop in any game. Saturation
    // pushed close to zero so the sky reads as monochrome stone tones.
    // The hue still lives in a cool slate range so the small jitter
    // gives subtle warm/cool variation between common receipts.
    baseHue: 220, hueSpan: 30, baseSat: 0.06,
    accentHue: 220, accentSat: 0.10, accentLight: 0.55,
  },
  uncommon: {
    // GREEN — emerald / jade green, the classic "uncommon" colour.
    baseHue: 142, hueSpan: 22, baseSat: 0.62,
    accentHue: 148, accentSat: 0.68, accentLight: 0.55,
  },
  rare: {
    // BLUE — azure / cobalt, classic "rare" colour.
    baseHue: 212, hueSpan: 20, baseSat: 0.72,
    accentHue: 210, accentSat: 0.78, accentLight: 0.58,
  },
  epic: {
    // PURPLE — violet / royal purple, classic "epic" colour.
    baseHue: 276, hueSpan: 22, baseSat: 0.70,
    accentHue: 290, accentSat: 0.78, accentLight: 0.64,
  },
  legendary: {
    // GOLDISH YELLOW — a clearly yellow-gold band, NOT the warm amber
    // that previously sat at hue 36 (same as common sepia). Now anchored
    // at hue 48, well into yellow territory, so the sky reads as a
    // luminous gold dusk.
    baseHue: 48, hueSpan: 18, baseSat: 0.86,
    accentHue: 50, accentSat: 0.95, accentLight: 0.62,
  },
  mythic: {
    // WARM ORANGE — anchored at hue 24 (orange, not red). Highest
    // saturation, narrow hue band — instantly recognisable.
    baseHue: 24, hueSpan: 16, baseSat: 0.92,
    accentHue: 20, accentSat: 0.98, accentLight: 0.58,
  },
};

/**
 * Build a unique palette anchored to the rarity tier.
 *
 * The seed contributes:
 *   - Hue jitter inside the tier's signature slice (±hueSpan/2).
 *   - Saturation jitter (±0.10 absolute).
 *   - Lightness ladder positions (top dark, mid mid, bottom bright).
 *   - Companion sun hue rotations (so 2-sun and 3-sun layouts aren't
 *     identical disks).
 *
 * Conviction widens the lightness contrast between sky top and bottom —
 * high conviction = dramatic, low conviction = flatter / hazier.
 *
 * Null rarity (open bets without consensus) defaults to the Common visual
 * so previews still show a coherent tinted polaroid instead of random
 * colours.
 */
function rarityPalette(
  rarity: Rarity | null,
  seed: number,
  conviction: number,
  developed: boolean,
): FamilyPalette {
  const tier = rarity ?? 'common';
  const visual = RARITY_VISUAL[tier];

  // Mix the rarity tier name into the seed so two adjacent tiers don't
  // happen to land on identical hue rolls.
  const tierCode = fnv1a(tier);
  const rngSeed = (seed ^ tierCode) >>> 0;
  const rng = mulberry32(rngSeed);
  const r: number[] = [];
  for (let i = 0; i < 18; i++) r.push(rng());

  // Hue jitter within the tier's signature band. r[0]..r[2] drive sky top
  // / mid / bottom; r[3]..r[5] drive sun core / glow / companion suns;
  // r[6] drives ground.
  const jit = (t: number, scale = 1) => (t - 0.5) * visual.hueSpan * scale;
  const skyTopHue    = visual.baseHue + jit(r[0]);
  const skyMidHue    = visual.baseHue + jit(r[1], 0.85) + 8;
  const skyBottomHue = visual.baseHue + jit(r[2], 0.7) + 18;
  const sunCoreHue   = visual.accentHue + jit(r[3], 0.5);
  const sunGlowHue   = visual.accentHue + jit(r[4], 0.6);
  const sun2Hue      = visual.accentHue + jit(r[15], 0.8) + 18; // shifted companion
  const sun3Hue      = visual.accentHue + jit(r[16], 0.9) - 22; // shifted second companion
  const groundHue    = visual.baseHue + jit(r[6], 0.5) + 6;

  // Saturation: anchored to tier baseSat with small per-receipt jitter.
  const sat = clamp01(visual.baseSat + (r[7] - 0.5) * 0.14);

  // Lightness ladder. Higher tiers get a darker, moodier sky top (the
  // contrast between dark sky and bright accent reads as "premium").
  // Common stays flatter so it doesn't compete visually with the rarer
  // tiers.
  const moody = tier !== 'common';
  const topL    = moody ? 0.05 + r[8]  * 0.07 : 0.10 + r[8]  * 0.08;
  const midL    = moody ? 0.18 + r[9]  * 0.10 : 0.28 + r[9]  * 0.10;
  const bottomL = moody ? 0.50 + r[10] * 0.18 : 0.62 + r[10] * 0.12;
  const sunCoreL  = 0.85 + r[11] * 0.10;
  const sunGlowL  = visual.accentLight + (r[12] - 0.5) * 0.10;
  const sun2CoreL = 0.80 + r[13] * 0.10;
  const sun3CoreL = 0.78 + r[17] * 0.10;
  const groundTopL    = moody ? 0.06 + r[14] * 0.05 : 0.09 + r[14] * 0.05;
  const groundBottomL = 0.018 + (r[8] * 0.03);
  const groundLineL   = groundTopL + 0.05 + r[9] * 0.03;

  // Conviction widens the contrast.
  const contrast = 0.92 + conviction * 0.20;
  const stretchL = (l: number, anchor: number) => clamp01(anchor + (l - anchor) * contrast);

  const out: FamilyPalette = {
    sky: {
      top:    hsl(skyTopHue,    sat,           stretchL(topL,    0.15)),
      mid:    hsl(skyMidHue,    sat * 0.94,    stretchL(midL,    0.35)),
      bottom: hsl(skyBottomHue, sat * 0.78,    stretchL(bottomL, 0.65)),
    },
    sunCore:  hsl(sunCoreHue, sat * 0.30, sunCoreL),
    sunGlow:  hsl(sunGlowHue, clamp01(sat * 1.05), clamp01(sunGlowL)),
    sun2Core: hsl(sun2Hue,    sat * 0.50, sun2CoreL),
    sun3Core: hsl(sun3Hue,    sat * 0.55, sun3CoreL),
    ground: {
      top:    hsl(groundHue, sat * 0.55, groundTopL),
      bottom: hsl(groundHue, sat * 0.35, groundBottomL),
      line:   hsl(groundHue, sat * 0.70, groundLineL),
    },
    accent: hsl(visual.accentHue + jit(r[5], 0.4), visual.accentSat, visual.accentLight),
  };

  if (!developed) {
    return {
      ...out,
      ground: { ...out.ground, line: mix(out.ground.line, out.ground.top, 0.35) },
    };
  }
  return out;
}

/**
 * Pick a hue in degrees from a range. Ranges that exceed 360 wrap
 * naturally (e.g. [340, 380] yields 340..360..20). Retained for legacy
 * imports but no longer used inside Polaroid.
 */
function pickHue(t: number, range: [number, number]): number {
  const [lo, hi] = range;
  const v = lo + t * (hi - lo);
  return ((v % 360) + 360) % 360;
}

/**
 * Convert HSL (h in degrees, s and l in [0, 1]) to a #rrggbb string.
 * Standard formula, no external dependency.
 */
function hsl(h: number, s: number, l: number): string {
  const H = ((h % 360) + 360) % 360;
  const S = Math.max(0, Math.min(1, s));
  const L = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = H / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1)      { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else             { r1 = c; b1 = x; }
  const m = L - c / 2;
  const R = Math.round((r1 + m) * 255);
  const G = Math.round((g1 + m) * 255);
  const B = Math.round((b1 + m) * 255);
  return '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function mix(a: string, b: string, t: number): string {
  const ah = parseHex(a);
  const bh = parseHex(b);
  if (!ah || !bh) return a;
  const r = Math.round(ah.r * (1 - t) + bh.r * t);
  const g = Math.round(ah.g * (1 - t) + bh.g * t);
  const bl = Math.round(ah.b * (1 - t) + bh.b * t);
  return `rgb(${r},${g},${bl})`;
}

function parseHex(s: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, n));
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
  } catch {
    return '—';
  }
}

function estimateAccuracy(
  prediction: number,
  spread: number,
  outcome: number,
  lowerBound: number,
  upperBound: number,
): number {
  const range = Math.max(1e-6, upperBound - lowerBound);
  const dist = Math.abs(prediction - outcome) / range;
  const tolerance = Math.max(0.01, spread / range);
  if (dist <= tolerance) return 1 - dist / (tolerance + 0.0001) * 0.3;
  return clamp01(1 - dist * 1.6);
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** keep around so the legacy importers can still call it during the transition */
export { estimateAccuracy };

function formatScaleNumber(value: number, units: string): string {
  if (!Number.isFinite(value)) return '—';
  const absV = Math.abs(value);
  let formatted: string;
  // Locale is HARD-CODED to 'en-US' (not `undefined`) on purpose. The
  // polaroid is a frozen artifact: when a user shares /r/{id} or an
  // /e/{id} embed, the receipt must render IDENTICALLY for every
  // viewer regardless of their browser locale. With `undefined` a
  // German viewer's browser would render 1374 as "1.374" (period as
  // thousands separator) while a US viewer's browser would render it
  // as "1,374", and the polaroid would show different scale strips
  // for the same shared link. Pinning to 'en-US' guarantees that the
  // numeric scale strip ("you · 1,374") looks the same everywhere
  // the polaroid is shared. See the dark-mode receipt screenshot the
  // user flagged where "1.374" was misread as a one-point-three-
  // seven-four decimal instead of one thousand three hundred and
  // seventy four.
  if (absV >= 10_000) {
    formatted = (value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k';
  } else if (absV >= 100) {
    formatted = value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  } else if (absV >= 1) {
    formatted = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } else {
    formatted = value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  return units ? `${formatted}${needsSpaceBeforeUnits(units) ? ' ' : ''}${units}` : formatted;
}

function needsSpaceBeforeUnits(units: string): boolean {
  if (!units) return false;
  const u = units.trim();
  return !(u === '%' || u === '$' || u === '€' || u === '£');
}

function buildFooterSentence(args: {
  username: string;
  prediction: number;
  resolvedOutcome: number | null | undefined;
  developed: boolean;
  units: string;
  collateral: number;
  lowerBound: number;
  upperBound: number;
}): string {
  const { username, prediction, resolvedOutcome, developed, units, collateral, lowerBound, upperBound } = args;
  if (developed && resolvedOutcome != null && Number.isFinite(resolvedOutcome)) {
    const range = Math.max(1e-6, upperBound - lowerBound);
    const errorPct = (Math.abs(prediction - resolvedOutcome) / range) * 100;
    const errorTxt = errorPct >= 1
      ? `${errorPct.toFixed(0)}%`
      : `${errorPct.toFixed(1)}%`;
    // Resolved footer drops the handle prefix: the handle is already
    // attributed inside the reasoning quote on the photo, so the footer
    // can focus on the resolution numbers. Keeping the handle here would
    // truncate "off by X%" at narrow polaroid widths (e.g. the 220px
    // profile gallery tiles).
    return `${formatScaleNumber(prediction, units)} → ${formatScaleNumber(resolvedOutcome, units)} · off by ${errorTxt}`;
  }
  const handle = `@${username || 'anon'}`;
  return `${handle} · predicted ${formatScaleNumber(prediction, units)} · $${collateral}`;
}

interface ScaleStripProps {
  x: number;
  y: number;
  width: number;
  height: number;
  lowerBound: number;
  upperBound: number;
  units: string;
  prediction: number;
  predictionT: number;
  /** Label that prefixes the prediction tick value (e.g. "you" or "crowd"). */
  predictionLabel: string;
  outcome: number | null;
  outcomeT: number | null;
  polaroidWidth: number;
}

/**
 * Reasoning quote — the meme-able payoff that only appears once a bet
 * resolves IN THE USER'S FAVOR. Renders as a stylized pull quote with
 * em-dash attribution. Word-wraps by drawing each visual line as a
 * separate <text> element since SVG <text> doesn't auto-wrap.
 */
function ReasoningQuote({
  x,
  y,
  width,
  maxHeight,
  text,
  handle,
  polaroidWidth,
}: {
  x: number;
  y: number;
  width: number;
  maxHeight: number;
  text: string;
  handle: string;
  polaroidWidth: number;
}) {
  // Auto-fit the font size so the WHOLE reasoning fits inside the photo
  // without ellipsis whenever possible. We pick the LARGEST font in the
  // [MIN_FONT, MAX_FONT] window such that the wrapped text fits inside
  // `maxHeight` after reserving room for the attribution row below.
  //
  // The hard floor on the input length (see MAX_REASONING_CHARS in
  // pages/BetFlow.tsx) is calibrated so that even on a 280 px wide
  // BetFlow preview the auto-fit lands at a readable font size (>= 10).
  // On smaller polaroids (gallery thumbnails at ~200 wide) very long
  // text may still hit the MIN_FONT floor and ellipsize the final line.
  const MAX_FONT = Math.max(11, Math.round(polaroidWidth * 0.045));
  // MIN_FONT floor of 8 lets gallery thumbnails (polaroidWidth ~200-220)
  // fit ~130 characters across 3 lines without ellipsis. Above that the
  // input cap (MAX_REASONING_CHARS in BetFlow) keeps the BetFlow preview
  // and Receipt sizes well above 10 px even at the cap.
  const MIN_FONT = Math.max(8, Math.round(polaroidWidth * 0.028));

  // Vertical room taken by the "- @handle" row: an attribution font that
  // is ~0.55 x the quote font, plus a 0.7 x quote font baseline gap.
  function attributionReserve(font: number): number {
    return Math.round(font * 0.55) + Math.round(font * 0.7);
  }

  // Try a single font size and return its wrap result if the whole text
  // fits in the available vertical space (no truncation needed).
  function tryFit(font: number): { lines: string[]; lineHeight: number } | null {
    const lineHeight = Math.round(font * 1.18);
    // Approximate char width for the display italic at this font size.
    // Bricolage Grotesque italic renders at ~0.58 of font size on
    // average, so we use 0.60 (a slight overcount) so the wrap math
    // errs on the side of MORE lines / smaller font rather than risk
    // overflow. Empirically picked: at 0.45 the previous implementation
    // chronically overflowed the polaroid frame on long reasoning.
    const charsPerLine = Math.max(8, Math.floor(width / (font * 0.60)));
    const lines = wrapText(text, charsPerLine, 999);
    const lastLine = lines[lines.length - 1] ?? '';
    // wrapText only adds ellipsis when the line count is clamped; with
    // maxLines=999 we still need to verify no individual line was
    // ellipsized for overshooting `charsPerLine`. That can happen when
    // a single word is longer than charsPerLine - the wrapper inlines
    // and then ellipsizes. Reject this font size in that case so we try
    // a smaller one.
    if (lastLine.endsWith('\u2026')) return null;
    const availForLines = maxHeight - attributionReserve(font);
    const usedHeight = lines.length * lineHeight;
    if (usedHeight > availForLines) return null;
    return { lines, lineHeight };
  }

  let chosenFont = MIN_FONT;
  let fit: { lines: string[]; lineHeight: number } | null = null;
  for (let f = MAX_FONT; f >= MIN_FONT; f--) {
    const candidate = tryFit(f);
    if (candidate) {
      chosenFont = f;
      fit = candidate;
      break;
    }
  }
  // Fallback: even at MIN_FONT the text does not fit. Wrap to whatever
  // fits and let wrapText ellipsize the final line. This is the legacy
  // behaviour and only triggers on tiny polaroids with very long text.
  if (!fit) {
    const lineHeight = Math.round(MIN_FONT * 1.18);
    const charsPerLine = Math.max(8, Math.floor(width / (MIN_FONT * 0.60)));
    const availForLines = Math.max(
      lineHeight,
      maxHeight - attributionReserve(MIN_FONT),
    );
    const maxLines = Math.max(1, Math.floor(availForLines / lineHeight));
    fit = { lines: wrapText(text, charsPerLine, maxLines), lineHeight };
    chosenFont = MIN_FONT;
  }

  const fontSize = chosenFont;
  const { lines, lineHeight } = fit;
  // Belt-and-suspenders fail-safe: if a line's estimated rendered
  // width is within 90% of the available width, force the SVG engine
  // to lay it out within EXACTLY `width` pixels by setting textLength
  // + lengthAdjust="spacingAndGlyphs". This way, even if our char-
  // width estimate is slightly off (different glyph metrics, italics,
  // font fallback), the rendered text physically cannot escape the
  // photo frame. Short lines that wouldn't have overflowed anyway are
  // left at their natural width so the layout still looks organic.
  const estimatedCharPx = fontSize * 0.60;
  const fullWidthThreshold = width * 0.90;
  function maybeClamp(line: string): {
    textLength?: number;
    lengthAdjust?: 'spacingAndGlyphs';
  } {
    const estimated = line.length * estimatedCharPx;
    if (estimated <= fullWidthThreshold) return {};
    // Cap textLength at the smaller of (a) the estimated width or (b)
    // the available width. Using `width` as the cap means visually
    // wide lines get a tiny squish; using `estimated` lets lines
    // breathe up to their natural width. We want the LATTER when
    // estimate < available, and the FORMER otherwise.
    const cap = Math.min(estimated, width);
    return { textLength: cap, lengthAdjust: 'spacingAndGlyphs' };
  }

  return (
    <g>
      {/* Dark scrim behind the quote so the text reads against any sky.
          Opacity tuned to be readable without overpowering the photo. */}
      <rect
        x={x - 6}
        y={y - fontSize}
        width={width + 12}
        height={lineHeight * lines.length + fontSize + 6}
        rx={4}
        fill="rgba(0,0,0,0.42)"
      />
      {lines.map((line, i) => {
        const isFirst = i === 0;
        const isLast = i === lines.length - 1;
        const rendered =
          (isFirst ? '\u201C' : '') + line + (isLast ? '\u201D' : '');
        const clamp = maybeClamp(rendered);
        return (
          <text
            key={`q-${i}`}
            x={x + width / 2}
            y={y + i * lineHeight}
            textAnchor="middle"
            fontFamily={fonts.display}
            fontStyle="italic"
            fontSize={fontSize}
            fontWeight={500}
            fill="rgba(255,250,240,0.96)"
            letterSpacing="-0.1"
            {...clamp}
          >
            {rendered}
          </text>
        );
      })}
      <text
        x={x + width / 2}
        y={y + lines.length * lineHeight + Math.round(fontSize * 0.7)}
        textAnchor="middle"
        fontFamily={fonts.mono}
        fontSize={Math.max(8, Math.round(fontSize * 0.55))}
        fill="rgba(255,250,240,0.7)"
        letterSpacing="1.4"
      >
        {`@${handle}`}
      </text>
    </g>
  );
}

function wrapText(text: string, charsPerLine: number, maxLines: number): string[] {
  // First, hard-break any single token longer than `charsPerLine` into
  // `charsPerLine`-sized chunks. Without this step, a token longer
  // than the visible line width (e.g. a pasted URL, password, or just
  // long gibberish with no spaces) would land on its own line at full
  // width and overflow the polaroid frame, since the wrap logic only
  // breaks at whitespace and we only ellipsize the final line.
  function splitLongToken(token: string): string[] {
    if (token.length <= charsPerLine) return [token];
    const out: string[] = [];
    let i = 0;
    while (i < token.length) {
      out.push(token.slice(i, i + charsPerLine));
      i += charsPerLine;
    }
    return out;
  }
  const rawWords = text.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  for (const w of rawWords) {
    for (const piece of splitLongToken(w)) words.push(piece);
  }
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > charsPerLine && line) {
      if (lines.length >= maxLines - 1) {
        // Already on the last line: keep appending words so we don't
        // throw away content. We'll ellipsize at the end if needed.
        line = next;
      } else {
        lines.push(line);
        line = w;
      }
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  // Ellipsize the final line if it overflows the visible width. After
  // the splitLongToken pass above this only ever fires when maxLines
  // clamped us mid-content and the appended remainder is too wide.
  const last = lines[lines.length - 1] ?? '';
  if (last.length > charsPerLine) {
    lines[lines.length - 1] = last.slice(0, Math.max(1, charsPerLine - 1)) + '…';
  }
  return lines;
}

function RarityStamp({
  x,
  y,
  tier,
  polaroidWidth,
}: {
  x: number;
  y: number;
  tier: Rarity;
  polaroidWidth: number;
}) {
  const meta = TIER_META[tier];
  const fontSize = Math.max(8, Math.round(polaroidWidth * 0.026));
  const padX = Math.round(fontSize * 0.85);
  const padY = Math.round(fontSize * 0.45);
  const label = meta.label.toUpperCase();
  const labelWidth = Math.round(label.length * fontSize * 0.62);
  const pillWidth = labelWidth + padX * 2;
  const pillHeight = fontSize + padY * 2;
  const pillX = x - pillWidth;
  const pillY = y;
  const radius = pillHeight / 2;
  return (
    <g>
      {meta.glowColor !== 'transparent' && (
        <rect
          x={pillX - 3}
          y={pillY - 3}
          width={pillWidth + 6}
          height={pillHeight + 6}
          rx={radius + 3}
          fill={meta.glowColor}
          opacity="0.55"
        />
      )}
      <rect
        x={pillX}
        y={pillY}
        width={pillWidth}
        height={pillHeight}
        rx={radius}
        fill={meta.badgeFill}
        stroke={meta.badgeStroke}
        strokeWidth="1.5"
      />
      <text
        x={pillX + pillWidth / 2}
        y={pillY + pillHeight / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={fonts.mono}
        fontSize={fontSize}
        fontWeight="700"
        fill={meta.badgeText}
        letterSpacing={Math.round(fontSize * 0.12)}
      >
        {label}
      </text>
    </g>
  );
}

function ScaleStrip(props: ScaleStripProps) {
  const { x, y, width, height, lowerBound, upperBound, units, prediction, predictionT, predictionLabel, outcome, outcomeT, polaroidWidth } = props;
  const axisY = y + Math.round(height * 0.55);
  const labelFontSize = Math.max(8, Math.round(polaroidWidth * 0.026));
  const boundFontSize = Math.max(7, Math.round(polaroidWidth * 0.022));
  const tick = 4;
  const showOutcome = outcomeT != null && outcome != null;

  const predX = x + predictionT * width;
  const outX = showOutcome ? x + outcomeT! * width : null;
  const predLabelX = clampLabelX(predX, x, x + width);
  const outLabelX = outX != null ? clampLabelX(outX, x, x + width) : null;

  const close = showOutcome && outX != null && Math.abs(predX - outX) < polaroidWidth * 0.08;

  return (
    <g aria-hidden="true">
      <line
        x1={x}
        y1={axisY}
        x2={x + width}
        y2={axisY}
        stroke={palette.rule}
        strokeWidth={1}
      />
      <line x1={x} y1={axisY - tick} x2={x} y2={axisY + tick} stroke={palette.rule} strokeWidth={1} />
      <line x1={x + width} y1={axisY - tick} x2={x + width} y2={axisY + tick} stroke={palette.rule} strokeWidth={1} />
      <text
        x={x}
        y={axisY + tick + boundFontSize + 2}
        fontFamily={fonts.mono}
        fontSize={boundFontSize}
        fill={palette.inkFade}
        letterSpacing="0.3"
      >
        {formatScaleNumber(lowerBound, units)}
      </text>
      <text
        x={x + width}
        y={axisY + tick + boundFontSize + 2}
        textAnchor="end"
        fontFamily={fonts.mono}
        fontSize={boundFontSize}
        fill={palette.inkFade}
        letterSpacing="0.3"
      >
        {formatScaleNumber(upperBound, units)}
      </text>

      <circle cx={predX} cy={axisY} r={3.5} fill={palette.ink} />
      <text
        x={predLabelX}
        y={axisY - 6}
        textAnchor={labelAnchor(predX, x, x + width)}
        fontFamily={fonts.mono}
        fontSize={labelFontSize}
        fill={palette.ink}
        fontWeight={600}
        letterSpacing="0.3"
      >
        {predictionLabel} · {formatScaleNumber(prediction, units)}
      </text>

      {showOutcome && outX != null && outLabelX != null && (
        <>
          <circle cx={outX} cy={axisY} r={3.5} fill={palette.ember} stroke={palette.card} strokeWidth={1} />
          <text
            x={outLabelX}
            y={close ? axisY + tick + boundFontSize * 2 + 4 : axisY + tick + boundFontSize + 2}
            textAnchor={labelAnchor(outX, x, x + width)}
            fontFamily={fonts.mono}
            fontSize={labelFontSize}
            fill={palette.ember}
            fontWeight={600}
            letterSpacing="0.3"
          >
            actual · {formatScaleNumber(outcome!, units)}
          </text>
        </>
      )}
    </g>
  );
}

function clampLabelX(px: number, lo: number, hi: number): number {
  const margin = 2;
  return Math.max(lo + margin, Math.min(hi - margin, px));
}

function labelAnchor(px: number, lo: number, hi: number): 'start' | 'middle' | 'end' {
  const t = (px - lo) / (hi - lo);
  if (t < 0.12) return 'start';
  if (t > 0.88) return 'end';
  return 'middle';
}

// Acknowledge unused import to keep tree-shaker happy for the raw palette.
void LIGHT_RAW;
