import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { palette, fonts, LIGHT_RAW } from '../theme';
import { calculateRarity, TIER_META, type Rarity } from '../rarity';
import {
  seedFromInputs,
  mulberry32,
  fnv1a,
  pickPaletteFamily,
  developProgress,
  type PaletteFamily,
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
}

export function Polaroid(props: PolaroidProps) {
  const {
    marketTitle,
    marketUnits = '',
    username,
    reasoning,
    createdAt,
    prediction,
    spread,
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
        shape,
        lowerBound,
        upperBound,
        seed,
        conviction,
        collateral,
        developed,
        progress,
        resolvedOutcome,
        rarity,
      }),
    [
      width,
      prediction,
      spread,
      shape,
      lowerBound,
      upperBound,
      seed,
      conviction,
      collateral,
      developed,
      progress,
      resolvedOutcome,
      rarity,
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
  const subjectLabel = truncate(marketTitle, 42);
  const filterId = `develop-${seed}`;
  const grainId = `grain-${seed}`;
  const skyGradientId = `sky-${seed}`;
  const groundGradientId = `ground-${seed}`;
  const sunGradientId = `sun-${seed}`;
  const photoClipId = `photoclip-${seed}`;
  const captionClipId = `capclip-${seed}`;

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
  const baseShadow = `drop-shadow(0 12px 24px ${palette.shadow}) drop-shadow(0 2px 6px ${palette.shadow})`;
  const developFilter = animPhase === 'pre'
    ? `${baseShadow} saturate(0.18) blur(1.6px) brightness(0.9) contrast(0.92)`
    : baseShadow;
  const developTransition = animPhase === 'running'
    ? 'filter 900ms cubic-bezier(0.22, 0.61, 0.36, 1)'
    : 'none';

  // Stake-driven frame ornament — small marks along the bottom of the
  // photo border that read as a "weight gauge." Stake feeds three
  // visible channels here:
  //   - more dollars → more ticks (3 at $1, 18 at $1000+)
  //   - more dollars → longer ticks (4px at $1, ~11px at $1000+)
  //   - more dollars → bolder ticks (opacity ramps from 0.55 to 0.95)
  // The previous tuning made the ticks effectively invisible, so the
  // stake slider felt like it only randomized the colour. With these
  // multipliers the ornament strip is the obvious "more skin in the
  // game" indicator at every stake level.
  const stakeUnit = clamp01(Math.log10(Math.max(1, collateral)) / 3);
  const ornamentCount = Math.max(3, Math.min(18, Math.round(stakeUnit * 15 + 3)));
  const ornamentLen = 4 + Math.round(stakeUnit * 7); // 4..11 px
  const ornamentOpacity = 0.55 + stakeUnit * 0.4; // 0.55..0.95
  const ornamentStroke = 0.9 + stakeUnit * 0.6; // 0.9..1.5

  // Conviction also drives a halo behind the sun: scaled radius and opacity.
  // High conviction = brighter, larger halo. Picked up automatically by
  // the photo's sun glow which is already conviction-aware.

  // Develop filter parameters — blur + saturation + brightness as a
  // function of (1 - progress). At progress=0 the photo is heavily
  // blurred and desaturated. At progress=1 the filter has no children.
  const developIntensity = clampUnit(1 - progress);
  const photoBlur = (developIntensity * 2.4).toFixed(2);
  const photoSat = (1 - developIntensity * 0.75).toFixed(2);
  const photoBri = (1 - developIntensity * 0.14).toFixed(2);
  // Sepia mix amount (0–0.7). Higher when undeveloped, none when fully developed.
  const sepia = developIntensity * 0.7;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
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
        <radialGradient id={sunGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={photo.sun.core} />
          <stop offset="60%" stopColor={photo.sun.glow} stopOpacity="0.6" />
          <stop offset="100%" stopColor={photo.sun.glow} stopOpacity="0" />
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
      </defs>

      {/* Rarity halo behind the card */}
      {rarityMeta && rarityMeta.borderWidth > 0 && (
        <rect
          x={rarityMeta.borderWidth / 2}
          y={rarityMeta.borderWidth / 2}
          width={width - rarityMeta.borderWidth}
          height={height - rarityMeta.borderWidth}
          rx="6"
          fill="none"
          stroke={rarityMeta.color}
          strokeWidth={rarityMeta.borderWidth + 2}
          opacity="0.18"
        />
      )}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="6"
        fill={palette.card}
        stroke={rarityMeta && rarityMeta.borderWidth > 0 ? rarityMeta.color : palette.rule}
        strokeWidth={rarityMeta && rarityMeta.borderWidth > 0 ? rarityMeta.borderWidth : 1}
      />

      {/* Photo */}
      <g clipPath={`url(#${photoClipId})`}>
        <rect x={photoX} y={photoY} width={photoSize} height={photoSize} fill={`url(#${skyGradientId})`} filter={photoFilter} />
        {photo.stars.map((s, i) => (
          <circle
            key={`star-${i}`}
            cx={photoX + s.x * photoSize}
            cy={photoY + s.y * photoSize}
            r={s.r}
            fill="rgba(255,255,250,0.85)"
            opacity={s.o * (0.5 + progress * 0.5)}
            filter={photoFilter}
          />
        ))}
        <circle
          cx={photoX + photo.sun.x * photoSize}
          cy={photoY + photo.sun.y * photoSize}
          r={photo.sun.r}
          fill={`url(#${sunGradientId})`}
          filter={photoFilter}
        />
        <circle
          cx={photoX + photo.sun.x * photoSize}
          cy={photoY + photo.sun.y * photoSize}
          r={photo.sun.coreR}
          fill={photo.sun.core}
          opacity="0.95"
          filter={photoFilter}
        />
        {photo.sun2 && (
          <>
            <circle
              cx={photoX + photo.sun2.x * photoSize}
              cy={photoY + photo.sun2.y * photoSize}
              r={photo.sun2.r}
              fill={`url(#${sunGradientId})`}
              filter={photoFilter}
            />
            <circle
              cx={photoX + photo.sun2.x * photoSize}
              cy={photoY + photo.sun2.y * photoSize}
              r={photo.sun2.coreR}
              fill={photo.sun2.core}
              opacity="0.9"
              filter={photoFilter}
            />
          </>
        )}
        <path
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

        {/* Reasoning quote — ONLY when developed + accurate. This is the
            payoff for being right. Centered over the bottom half of the
            photo as a meme-able pull quote, with attribution underneath. */}
        {reasoningRevealed && reasoning.trim().length > 0 && (
          <ReasoningQuote
            x={photoX + 12}
            y={photoY + Math.round(photoSize * 0.55)}
            width={photoSize - 24}
            maxHeight={Math.round(photoSize * 0.4)}
            text={reasoning.trim()}
            handle={username}
            polaroidWidth={width}
          />
        )}

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

      {/* Stake-driven ornament strip in the matte area between the photo
          and the scale strip. Inside the photo the strip was hidden
          behind the dark ground silhouette of most palettes; out here on
          the cream/paper matte it reads as a clear "weight gauge":
            - more dollars → more ticks (3 at $1, 18 at $1000+)
            - more dollars → longer ticks (4..11 px)
            - more dollars → bolder ticks (opacity 0.55..0.95)
          The stroke colour follows the polaroid's ink tone so it works
          in both light and dark themes. */}
      <g aria-hidden="true">
        {Array.from({ length: ornamentCount }).map((_, i) => {
          const tt = (i + 0.5) / ornamentCount;
          const tickX = photoX + 4 + tt * (photoSize - 8);
          const midY = photoY + photoSize + (scaleStripY - (photoY + photoSize)) / 2;
          return (
            <line
              key={`tick-${i}`}
              x1={tickX}
              y1={midY - ornamentLen / 2}
              x2={tickX}
              y2={midY + ornamentLen / 2}
              stroke={palette.inkSoft}
              strokeOpacity={ornamentOpacity}
              strokeWidth={ornamentStroke}
              strokeLinecap="round"
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

  // Tuned for italic serif: real Fraunces is ~0.46em wide, but the export
  // rasterizer falls back to a generic system serif that's ~0.55-0.6em.
  // We pick a conservative value so wrapping matches in both contexts.
  const titleCharsPerLine = Math.max(8, Math.floor(width / (titleSize * 0.56)));
  const titleLines = wrapText(`"${subjectLabel}"`, titleCharsPerLine, 2);

  // Approximate em-width for the mono text in the footer/date lines. The
  // fallback monospace is also a bit wider than JetBrains Mono, so the
  // 0.62em estimate keeps both renderings inside the box.
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

interface PhotoSpec {
  sky: { top: string; mid: string; bottom: string };
  ground: { top: string; bottom: string; line: string };
  sun: { x: number; y: number; r: number; coreR: number; core: string; glow: string };
  sun2: { x: number; y: number; r: number; coreR: number; core: string; glow: string } | null;
  stars: Array<{ x: number; y: number; r: number; o: number }>;
  silhouettePath: (px: number, py: number, ps: number) => string;
  grainFreq: number;
}

function buildPhoto(opts: {
  width: number;
  photoWidth: number;
  photoHeight: number;
  prediction: number;
  spread: number;
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
}): PhotoSpec {
  const range = opts.upperBound - opts.lowerBound;
  const meanT = clamp01((opts.prediction - opts.lowerBound) / range);
  const rng = mulberry32(opts.seed);
  // Pull several uniform draws from the rng up front so visual decisions
  // are stable across renders.
  const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();

  // Palette family driven by RARITY (when known) + seed offset for variety
  // within tier. The family determines a region of color space (warm
  // sunset, cool twilight, gold-leaf jewel tone, etc.); the actual colors
  // inside that region are generated procedurally from the seed so every
  // single receipt gets a unique palette pulled from the full spectrum.
  const family = pickPaletteFamily(opts.seed, opts.rarity);
  const palettes = paletteFor(family, {
    seed: opts.seed,
    rarity: opts.rarity,
    conviction: opts.conviction,
    developed: opts.developed,
    variantRoll: r1,
  });

  // Horizon position varies with both seed and conviction. Low conviction
  // = flat horizon (uncertainty), high conviction = lifted dramatic horizon.
  const horizonY = 0.55 + (1 - opts.conviction) * 0.07 + (r2 - 0.5) * 0.05;

  // Sun (or moon) — the principal visual readout. Its horizontal position
  // tracks the DENSITY peak of the user's belief curve, not just the
  // prediction value. That distinction matters for bimodal beliefs: the
  // prediction value is the center BETWEEN the two peaks, so a sun
  // pinned to `meanT` would float over the valley with the hills on
  // either side. Instead we compute each peak's X-position from the
  // same maths `densityAt` uses, so the suns sit directly above the
  // hills they correspond to.
  //
  // For single-peak and range shapes the peak coincides with the
  // prediction value, so this collapses to the previous behaviour and
  // the single sun stays centred over the curve.
  const toUnit = (x: number) => clamp01((x - opts.lowerBound) / range);
  const isBimodal = opts.shape === 'bimodal';
  // densityAt() for bimodal weights the right peak (0.7) heavier than
  // the left peak (0.5), so we treat the right peak as the dominant
  // sun and the left peak as the secondary moon.
  const peakOffset = opts.spread * 1.6;
  const primaryX = isBimodal ? toUnit(opts.prediction + peakOffset) : meanT;
  const secondaryX = isBimodal ? toUnit(opts.prediction - peakOffset) : meanT;

  // Stake feeds a clamped 0..1 boost that scales the sun radius, the
  // ornament tick density, and the ornament tick length further down.
  const stakeBoost = clamp01(Math.log10(Math.max(1, opts.collateral)) / 3); // 0…1 over $1…$1000
  const sunY = horizonY - 0.18 - opts.conviction * 0.05;
  // Bigger stake gets a more pronounced sun (up to +8% photo width on top
  // of the conviction-driven sizing, was +4%). This makes the stake
  // slider produce a visible "more skin in the game" signal rather than
  // a barely-noticeable size delta.
  const sunR = (opts.photoWidth * (0.14 + opts.conviction * 0.08 + stakeBoost * 0.08)) | 0;
  const sunCoreR = sunR * (0.4 + r3 * 0.1);

  const sun = {
    x: primaryX,
    y: sunY,
    r: sunR,
    coreR: sunCoreR,
    core: palettes.sunCore,
    glow: palettes.sunGlow,
  };

  const sun2 = isBimodal
    ? {
      x: secondaryX,
      // Secondary peak hangs a hair lower so the two suns don't read
      // as one flat horizon of light — adds a touch of depth.
      y: sunY + 0.03,
      // Density weight on the secondary peak is 0.5/0.7 ≈ 0.71 of the
      // primary's, so we scale the radius accordingly. Reads as "the
      // less-likely peak is the smaller moon."
      r: Math.round(sunR * 0.72),
      coreR: sunCoreR * 0.72,
      core: palettes.sun2Core,
      glow: palettes.sunGlow,
    }
    : null;

  // Stars — count varies with conviction, density with seed. High-conviction
  // bets get a more starry sky, low-conviction get a sparser one. Both
  // varieties carry a per-receipt-unique constellation thanks to the seed.
  const starRng = mulberry32(opts.seed ^ 0xabc123);
  const numStars = Math.round(14 + opts.conviction * 22 + r4 * 4);
  const stars: Array<{ x: number; y: number; r: number; o: number }> = [];
  for (let i = 0; i < numStars; i++) {
    const sx = starRng();
    const sy = starRng() * horizonY * 0.85;
    const sr = 0.35 + starRng() * 1.15;
    const so = 0.3 + starRng() * 0.6;
    // Skip stars that fall under any sun (primary or, in bimodal, the
    // secondary). Without the second check, bimodal layouts get a
    // distracting starfield directly under the smaller moon.
    const distToPrimary = Math.hypot(sx - sun.x, sy - sun.y);
    const distToSecondary = sun2 ? Math.hypot(sx - sun2.x, sy - sun2.y) : Infinity;
    if (distToPrimary > 0.15 && distToSecondary > 0.12) {
      stars.push({ x: sx, y: sy, r: sr, o: so });
    }
  }

  // Silhouette — driven by spread AND seed. Spread controls how wide the
  // mountain mass is; seed adds a small per-receipt jitter so two users
  // with identical spread numbers still get distinguishable horizons.
  const jitterSeed = opts.seed ^ 0xdef456;
  const jitterRng = mulberry32(jitterSeed);
  const jitters = Array.from({ length: 96 }, () => (jitterRng() - 0.5) * 0.02);

  const numSamples = 96;
  const silhouettePath = (px: number, py: number, ps: number) => {
    const points: Array<[number, number]> = [];
    let maxRaw = 0;
    const raw: number[] = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const x = opts.lowerBound + t * range;
      const v = densityAt(x, opts);
      raw[i] = v;
      if (v > maxRaw) maxRaw = v;
    }
    const peakLift = 0.15 + opts.conviction * 0.18;
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const norm = maxRaw > 0 ? raw[i] / maxRaw : 0;
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

  return {
    sky: palettes.sky,
    ground: palettes.ground,
    sun,
    sun2,
    stars,
    silhouettePath,
    // Grain frequency varies subtly per-receipt so the noise pattern
    // differs receipt-to-receipt. Range chosen so the dot pattern is
    // dense enough to feel like film grain at every polaroid width.
    grainFreq: 0.7 + r1 * 0.6,
  };
}

function densityAt(
  x: number,
  opts: { prediction: number; spread: number; shape: string; lowerBound: number; upperBound: number },
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
}

/**
 * Color region per family. Defines the HSL hue range each palette stop
 * draws from, plus the family's "mood" (moody = dark, dramatic sky; not
 * moody = lifted, friendlier). Hue ranges may exceed 360 to express a
 * wrap (e.g. 340..380 means 340 → 360 → 20 in degrees mod 360).
 *
 * Within a region, the seed picks an exact hue + lightness + a subtle
 * saturation jitter, so the palette is effectively unique per receipt
 * yet still recognizably "twilight" or "aurora" or whatever family the
 * rarity tier mapped to.
 */
interface FamilyRegion {
  skyTopHue: [number, number];
  skyMidHue: [number, number];
  skyBottomHue: [number, number];
  sunHue: [number, number];
  sun2Hue: [number, number];
  groundHue: [number, number];
  /** Base saturation in [0, 1]. 0 = grayscale (noir). */
  baseSat: number;
  /** True = darker, more dramatic sky stops. False = pastel-friendly. */
  moody: boolean;
}

const FAMILY_REGIONS: Record<PaletteFamily, FamilyRegion> = {
  sunset: {
    skyTopHue: [275, 335], skyMidHue: [330, 380], skyBottomHue: [15, 50],
    sunHue: [25, 50], sun2Hue: [40, 65], groundHue: [340, 380],
    baseSat: 0.72, moody: true,
  },
  twilight: {
    skyTopHue: [210, 260], skyMidHue: [200, 245], skyBottomHue: [180, 235],
    sunHue: [185, 220], sun2Hue: [195, 230], groundHue: [205, 250],
    baseSat: 0.55, moody: true,
  },
  aurora: {
    skyTopHue: [235, 285], skyMidHue: [275, 325], skyBottomHue: [195, 245],
    sunHue: [135, 175], sun2Hue: [295, 335], groundHue: [245, 295],
    baseSat: 0.72, moody: true,
  },
  botanical: {
    skyTopHue: [95, 155], skyMidHue: [80, 145], skyBottomHue: [55, 115],
    sunHue: [38, 72], sun2Hue: [42, 78], groundHue: [75, 135],
    baseSat: 0.58, moody: false,
  },
  rosegold: {
    skyTopHue: [320, 360], skyMidHue: [340, 380], skyBottomHue: [5, 38],
    sunHue: [18, 46], sun2Hue: [22, 50], groundHue: [340, 380],
    baseSat: 0.62, moody: false,
  },
  noir: {
    skyTopHue: [0, 360], skyMidHue: [0, 360], skyBottomHue: [0, 360],
    sunHue: [0, 360], sun2Hue: [0, 360], groundHue: [0, 360],
    baseSat: 0, moody: true,
  },
  goldleaf: {
    skyTopHue: [225, 262], skyMidHue: [230, 270], skyBottomHue: [28, 58],
    sunHue: [36, 56], sun2Hue: [42, 62], groundHue: [28, 58],
    baseSat: 0.78, moody: true,
  },
  oracle: {
    skyTopHue: [265, 305], skyMidHue: [285, 330], skyBottomHue: [305, 350],
    sunHue: [325, 360], sun2Hue: [145, 185], groundHue: [280, 325],
    baseSat: 0.8, moody: true,
  },
};

/**
 * Procedurally generate a unique palette for a receipt.
 *
 * The family chooses a region of color space. The seed (xor-mixed with
 * the family name so a different family rerolls all hues) drives 16
 * uniform draws; those draws pick concrete hue / saturation / lightness
 * values within the region. Rarity and conviction modulate saturation
 * intensity and lightness contrast on top.
 *
 * Net effect: every receipt — at every slider position, every username,
 * every reasoning text — gets its own palette pulled from the full HSL
 * spectrum, while the family name keeps the visual identity legible
 * (twilight always reads cool, sunset always reads warm, etc.).
 */
function paletteFor(
  family: PaletteFamily,
  args: {
    seed: number;
    rarity: Rarity | null;
    conviction: number;
    developed: boolean;
    variantRoll: number;
  },
): FamilyPalette {
  const region = FAMILY_REGIONS[family];
  const familyCode = fnv1a(family);
  // Mixing variantRoll in too means any seed-driven RNG draws already
  // taken upstream still propagate variation here, without re-deriving
  // them from scratch.
  const rngSeed = (args.seed ^ familyCode ^ Math.floor(args.variantRoll * 0x7fffffff)) >>> 0;
  const rng = mulberry32(rngSeed);
  const r: number[] = [];
  for (let i = 0; i < 16; i++) r.push(rng());

  const raritySat = rarityToSaturationScale(args.rarity);
  const rarityContrast = rarityToContrastScale(args.rarity);
  const sat = clamp01(region.baseSat * raritySat);

  const skyTopHue    = pickHue(r[0], region.skyTopHue);
  const skyMidHue    = pickHue(r[1], region.skyMidHue);
  const skyBottomHue = pickHue(r[2], region.skyBottomHue);
  const sunHue       = pickHue(r[3], region.sunHue);
  const sun2Hue      = pickHue(r[4], region.sun2Hue);
  const groundHue    = pickHue(r[5], region.groundHue);

  // Lightness ladder for the sky. Moody families pull the top darker.
  const topL    = region.moody ? 0.06 + r[6] * 0.07  : 0.10 + r[6] * 0.09;
  const midL    = region.moody ? 0.18 + r[7] * 0.12  : 0.30 + r[7] * 0.12;
  const bottomL = region.moody ? 0.55 + r[8] * 0.18  : 0.66 + r[8] * 0.12;
  const sunCoreL   = 0.85 + r[9]  * 0.10;
  const sunGlowL   = 0.55 + r[10] * 0.14;
  const sun2CoreL  = 0.80 + r[14] * 0.12;
  const groundTopL    = region.moody ? 0.07 + r[11] * 0.05 : 0.10 + r[11] * 0.05;
  const groundBottomL = 0.018 + r[12] * 0.032;
  const groundLineL   = groundTopL + 0.05 + r[13] * 0.04;

  // Conviction widens the lightness gap between sky top and bottom — high
  // conviction = dramatic, low conviction = flatter / hazier.
  const contrast = 0.92 + args.conviction * 0.18 * rarityContrast;
  const stretchL = (l: number, anchor: number) => clamp01(anchor + (l - anchor) * contrast);

  // Sun core and sun glow share a hue but the core is bright and pale
  // (low saturation, high lightness) while the glow is hot (high sat).
  const palette: FamilyPalette = {
    sky: {
      top:    hsl(skyTopHue,    sat,           stretchL(topL,    0.15)),
      mid:    hsl(skyMidHue,    sat * 0.95,    stretchL(midL,    0.35)),
      bottom: hsl(skyBottomHue, sat * 0.78,    stretchL(bottomL, 0.65)),
    },
    sunCore:  hsl(sunHue,  sat * 0.35, sunCoreL),
    sunGlow:  hsl(sunHue,  sat * 0.95, sunGlowL),
    sun2Core: hsl(sun2Hue, sat * 0.55, sun2CoreL),
    ground: {
      top:    hsl(groundHue, sat * 0.60, groundTopL),
      bottom: hsl(groundHue, sat * 0.40, groundBottomL),
      line:   hsl(groundHue, sat * 0.70, groundLineL),
    },
  };

  if (!args.developed) {
    // Slight mute on the horizon line so the photo "feels" like it
    // hasn't finished developing yet. Everything else stays vivid so
    // the receipt is still readable.
    return {
      ...palette,
      ground: { ...palette.ground, line: mix(palette.ground.line, palette.ground.top, 0.35) },
    };
  }
  return palette;
}

/**
 * Rarer receipts get more saturated palettes — the visual signal that
 * tells you "this is a hard-to-earn receipt" at a glance.
 */
function rarityToSaturationScale(r: Rarity | null): number {
  switch (r) {
    case 'mythic':    return 1.45;
    case 'legendary': return 1.28;
    case 'epic':      return 1.14;
    case 'rare':      return 1.0;
    case 'uncommon':  return 0.85;
    case 'common':    return 0.72;
    default:          return 0.9; // unknown/preview = neutral-but-readable
  }
}

/**
 * Rarer receipts also get a steeper lightness contrast (sky top very
 * dark, sky bottom very bright). Common receipts stay flatter.
 */
function rarityToContrastScale(r: Rarity | null): number {
  switch (r) {
    case 'mythic':    return 1.16;
    case 'legendary': return 1.10;
    case 'epic':      return 1.05;
    case 'rare':      return 1.00;
    case 'uncommon':  return 0.95;
    case 'common':    return 0.90;
    default:          return 1.0;
  }
}

/**
 * Pick a hue in degrees from a range. Ranges that exceed 360 wrap
 * naturally (e.g. [340, 380] yields 340..360..20).
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
  if (absV >= 10_000) {
    formatted = (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k';
  } else if (absV >= 100) {
    formatted = value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (absV >= 1) {
    formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else {
    formatted = value.toLocaleString(undefined, { maximumFractionDigits: 3 });
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
  const fontSize = Math.max(10, Math.round(polaroidWidth * 0.04));
  const lineHeight = Math.round(fontSize * 1.18);
  // Approximate char width for a serif italic at fontSize. ~0.45 of fontSize
  // is a safe undercount that works for Fraunces italic.
  const charsPerLine = Math.max(8, Math.floor(width / (fontSize * 0.45)));
  const maxLines = Math.max(2, Math.floor((maxHeight - lineHeight) / lineHeight));
  const lines = wrapText(text, charsPerLine, maxLines);

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
      {lines.map((line, i) => (
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
        >
          {i === 0 ? `“${line}` : line}
          {i === lines.length - 1 && '”'}
        </text>
      ))}
      <text
        x={x + width / 2}
        y={y + lines.length * lineHeight + Math.round(fontSize * 0.7)}
        textAnchor="middle"
        fontFamily={fonts.mono}
        fontSize={Math.max(8, Math.round(fontSize * 0.55))}
        fill="rgba(255,250,240,0.7)"
        letterSpacing="1.4"
      >
        — @{handle}
      </text>
    </g>
  );
}

function wrapText(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
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
  // Ellipsize the final line if it overflows the visible width.
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
  const { x, y, width, height, lowerBound, upperBound, units, prediction, predictionT, outcome, outcomeT, polaroidWidth } = props;
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
        you · {formatScaleNumber(prediction, units)}
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
