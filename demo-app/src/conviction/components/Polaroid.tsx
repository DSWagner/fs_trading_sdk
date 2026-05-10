import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { palette, fonts } from '../theme';
import { calculateRarity, TIER_META, type Rarity } from '../rarity';

/**
 * The Polaroid — Conviction's signature receipt.
 *
 * Takes a bet's parameters and generates a procedural landscape SVG where the
 * belief curve becomes the horizon silhouette. Pre-resolution it's "developing"
 * (faint, soft, monochrome). Post-resolution it sharpens, color blooms in, and
 * the actual outcome appears as a thin vertical thread.
 *
 * Design intent: every bet should feel like a cultural artifact, not a chart.
 */

export type PolaroidPreset = 'auto' | 'sunset' | 'twilight' | 'aurora' | 'botanical' | 'noir' | 'rosegold';

export const POLAROID_PRESETS: { id: PolaroidPreset; label: string; sub: string }[] = [
  { id: 'auto', label: 'Auto', sub: 'Picks a palette from your prediction.' },
  { id: 'sunset', label: 'Sunset', sub: 'Warm dusk, embers, gold core.' },
  { id: 'twilight', label: 'Twilight', sub: 'Cool pre-dawn, ice blue.' },
  { id: 'aurora', label: 'Aurora', sub: 'Northern lights. Mint and orchid.' },
  { id: 'botanical', label: 'Botanical', sub: 'Verdant. Field at dawn.' },
  { id: 'rosegold', label: 'Rose gold', sub: 'Petal sky, copper sun.' },
  { id: 'noir', label: 'Noir', sub: 'High-contrast monochrome.' },
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
  width?: number;
  interactive?: boolean;
  preset?: PolaroidPreset;
  /**
   * If true and the bet has resolved, plays a one-time 900 ms develop
   * transition on mount: the photo starts desaturated/blurred (like a Polaroid
   * pulled from the camera), then sharpens. Use on the Receipt page so the
   * resolution moment is visible. Has no effect on still-open bets.
   */
  animateDevelop?: boolean;
  /**
   * Consensus mean at the moment the bet was placed. Required to compute
   * rarity. When null/undefined the rarity badge is suppressed (the bet
   * was placed before consensus tracking existed, or the engine had none).
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
    width = 320,
    interactive = false,
    preset = 'auto',
    animateDevelop = false,
    consensusAtBet = null,
  } = props;

  const developed = resolutionState === 'resolved';

  // Rarity only exists for resolved bets that include both a final outcome and
  // a recorded consensus-at-bet. For everything else we render the polaroid
  // without any rarity treatment so the visual stays clean.
  const rarity: Rarity | null = useMemo(() => {
    if (!developed) return null;
    if (resolvedOutcome == null || !Number.isFinite(resolvedOutcome)) return null;
    if (consensusAtBet == null || !Number.isFinite(consensusAtBet)) return null;
    const result = calculateRarity({
      prediction,
      resolvedOutcome,
      consensusMean: consensusAtBet,
      lowerBound,
      upperBound,
    });
    return result.tier;
  }, [developed, resolvedOutcome, consensusAtBet, prediction, lowerBound, upperBound]);
  const rarityMeta = rarity ? TIER_META[rarity] : null;

  // Animated develop: when enabled and the receipt is settled, mount with a
  // desaturated/blurred filter and transition to "sharp" over ~900 ms so the
  // resolution moment is visible. We track three phases: 'pre' (initial
  // render with faded filter, no transition yet), 'running' (filter cleared
  // with CSS transition), 'done' (animation finished, transition removed for
  // future renders so re-renders don't re-trigger).
  const [animPhase, setAnimPhase] = useState<'pre' | 'running' | 'done'>(
    animateDevelop && developed ? 'pre' : 'done',
  );

  // Reset the animation phase synchronously (before the browser paints) when
  // `developed` flips while the component is mounted. Using useLayoutEffect
  // (rather than useEffect) is critical: a parent toggling `developed` from
  // false to true would otherwise show one frame of the un-dimmed Polaroid
  // before the effect ran. The DevelopDemo on the landing page is the
  // canonical case where this matters.
  useLayoutEffect(() => {
    setAnimPhase(animateDevelop && developed ? 'pre' : 'done');
  }, [animateDevelop, developed]);

  // Drive the transition timers. CRITICAL: this effect must NOT depend on
  // `animPhase`, only on `animateDevelop` and `developed`. If `animPhase`
  // were a dep, the cleanup would fire when phase advances 'pre' -> 'running'
  // and would cancel the still-pending 'done' timer, leaving the SVG stuck
  // with `transition: filter 900ms` attached forever.
  useEffect(() => {
    if (!animateDevelop || !developed) return;
    // 60 ms pause lets the browser commit the 'pre' filter before we change
    // to 'running'. Without this, the transition starts from the cleared
    // filter and is invisible.
    const startId = window.setTimeout(() => setAnimPhase('running'), 60);
    const endId = window.setTimeout(() => setAnimPhase('done'), 60 + 950);
    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(endId);
    };
  }, [animateDevelop, developed]);
  // Aspect 1.5 leaves the caption area ~50% of the width tall, which fits a
  // 2-line reasoning (line-clamped) plus footer plus date row even at 220px.
  const aspect = 1.5;
  const height = Math.round(width * aspect);

  const seed = useMemo(
    () => stringSeed(`${props.marketId}:${props.positionId}`),
    [props.marketId, props.positionId],
  );

  const photo = useMemo(
    () => buildPhoto({
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
      developed,
      resolvedOutcome,
      preset,
    }),
    [width, prediction, spread, shape, lowerBound, upperBound, seed, conviction, developed, resolvedOutcome, preset],
  );

  const padding = 16;
  const photoSize = width - padding * 2;
  const photoX = padding;
  const photoY = padding;

  // Scale strip lives between the photo and the caption. It carries the
  // numeric story (lower bound, prediction value, outcome value, upper bound)
  // so the viewer can actually read the bet without already knowing the convention.
  const scaleStripY = photoY + photoSize + 6;
  const scaleStripH = Math.max(28, Math.round(width * 0.1));
  const captionY = scaleStripY + scaleStripH + 4;
  const captionH = height - captionY - 12;

  const reasoningCharCap = Math.max(60, Math.min(140, Math.round(width * 0.4)));
  const truncatedReasoning = reasoning.length > reasoningCharCap
    ? reasoning.slice(0, reasoningCharCap - 1) + '…'
    : reasoning;
  const dateLabel = formatDate(createdAt);
  const subjectLabel = truncate(marketTitle, 42);
  const filterId = `develop-${seed}`;
  const grainId = `grain-${seed}`;
  const skyGradientId = `sky-${seed}`;
  const groundGradientId = `ground-${seed}`;
  const sunGradientId = `sun-${seed}`;
  const photoClipId = `photoclip-${seed}`;

  const accuracy = developed && resolvedOutcome != null
    ? estimateAccuracy(prediction, spread, resolvedOutcome, lowerBound, upperBound)
    : null;

  const accuracyLabel = (() => {
    if (!developed) return 'DEVELOPING';
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

  // The develop filter only has children when !developed. An empty SVG filter
  // renders as transparent in every browser, which is why the photo used to
  // disappear in the developed state. We just don't apply the filter once the
  // bet has resolved.
  const photoFilter = developed ? undefined : `url(#${filterId})`;
  const range = upperBound - lowerBound;
  const safeRange = range > 1e-9 ? range : 1;
  const predictionT = clampUnit((prediction - lowerBound) / safeRange);
  const outcomeT = developed && resolvedOutcome != null
    ? clampUnit((resolvedOutcome - lowerBound) / safeRange)
    : null;

  const baseShadow = `drop-shadow(0 12px 24px ${palette.shadow}) drop-shadow(0 2px 6px ${palette.shadow})`;
  const developFilter = animPhase === 'pre'
    ? `${baseShadow} saturate(0.18) blur(1.6px) brightness(0.9) contrast(0.92)`
    : baseShadow;
  // Transition only attaches during the 'running' phase. 'pre' has no
  // transition (so the browser commits the dim filter immediately) and
  // 'done' clears it (so nothing animates on future re-renders, e.g. PNG
  // export or theme tweaks).
  const developTransition = animPhase === 'running'
    ? 'filter 900ms cubic-bezier(0.22, 0.61, 0.36, 1)'
    : 'none';

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
          {!developed && (
            <>
              <feGaussianBlur stdDeviation="0.9" />
              <feColorMatrix
                type="matrix"
                values={`
                  0.5 0.4 0.1 0 0.05
                  0.4 0.4 0.2 0 0.04
                  0.3 0.3 0.4 0 0.02
                  0   0   0   1 0
                `}
              />
            </>
          )}
        </filter>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed % 1000} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.07 0"
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id={photoClipId}>
          <rect x={photoX} y={photoY} width={photoSize} height={photoSize} rx="2" />
        </clipPath>
      </defs>

      {/* Polaroid card body. When the receipt has earned a rarity tier we
          replace the hairline rule with a thicker, tier-colored stroke and
          drop a soft outer glow inside the card padding. */}
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

      {/* Photo area */}
      <g clipPath={`url(#${photoClipId})`}>
        <rect x={photoX} y={photoY} width={photoSize} height={photoSize} fill={`url(#${skyGradientId})`} filter={photoFilter} />
        {/* stars */}
        {photo.stars.map((s, i) => (
          <circle
            key={`star-${i}`}
            cx={photoX + s.x * photoSize}
            cy={photoY + s.y * photoSize}
            r={s.r}
            fill="rgba(255,255,250,0.85)"
            opacity={s.o}
            filter={photoFilter}
          />
        ))}
        {/* sun glow */}
        <circle
          cx={photoX + photo.sun.x * photoSize}
          cy={photoY + photo.sun.y * photoSize}
          r={photo.sun.r}
          fill={`url(#${sunGradientId})`}
          filter={photoFilter}
        />
        {/* sun core */}
        <circle
          cx={photoX + photo.sun.x * photoSize}
          cy={photoY + photo.sun.y * photoSize}
          r={photo.sun.coreR}
          fill={photo.sun.core}
          opacity="0.95"
          filter={photoFilter}
        />
        {/* secondary sun for bimodal */}
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
        {/* horizon silhouette (the bet shape) */}
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
        {/* outcome thread (post-resolution only) */}
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
            {/* small "actual" tag at the top of the outcome thread */}
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
        {/* film grain */}
        <rect
          x={photoX}
          y={photoY}
          width={photoSize}
          height={photoSize}
          fill="white"
          filter={`url(#${grainId})`}
          opacity="0.5"
        />
        {/* developing stamp */}
        {!developed && (
          <g opacity="0.5">
            <text
              x={photoX + photoSize - 10}
              y={photoY + photoSize - 12}
              textAnchor="end"
              fontFamily={fonts.mono}
              fontSize={Math.round(width * 0.028)}
              fill="rgba(255,255,250,0.85)"
              letterSpacing="2"
            >
              DEVELOPING
            </text>
          </g>
        )}
        {/* rarity stamp: top-right of the photo, only for resolved bets that
            earned uncommon-or-higher. The badge sits on the photo (not the
            polaroid card) so its colors read against the developed sky. */}
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

      {/* Numeric scale strip — turns the picture into something you can read */}
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

      {/* Caption: market title + reasoning + footer */}
      <foreignObject x={padding} y={captionY} width={photoSize} height={captionH}>
        <div
          style={{
            fontFamily: fonts.body,
            color: palette.ink,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
            paddingTop: '2px',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontFamily: fonts.display,
                fontWeight: 600,
                fontSize: Math.round(width * 0.05),
                lineHeight: 1.15,
                color: palette.ink,
                marginBottom: '4px',
                fontStyle: 'italic',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              "{subjectLabel}"
            </div>
            <div
              style={{
                fontSize: Math.round(width * 0.032),
                color: palette.inkSoft,
                lineHeight: 1.4,
                fontStyle: 'italic',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {truncatedReasoning || <span style={{ color: palette.inkFade }}>no reasoning yet</span>}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '6px',
                fontSize: Math.round(width * 0.028),
                color: palette.inkMute,
                fontFamily: fonts.mono,
                letterSpacing: '0.4px',
                gap: '8px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {buildFooterSentence({
                  username,
                  prediction,
                  resolvedOutcome,
                  developed,
                  units: marketUnits,
                  collateral,
                  lowerBound,
                  upperBound,
                })}
              </span>
              <span style={{ color: accuracyColor, fontWeight: 600, flexShrink: 0 }}>{accuracyLabel}</span>
            </div>
            <div
              style={{
                fontSize: Math.round(width * 0.024),
                color: palette.inkFade,
                fontFamily: fonts.mono,
                marginTop: '2px',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {dateLabel} · CONVICTION × {Math.max(1, Math.round(conviction * 10))}/10
            </div>
          </div>
        </div>
      </foreignObject>
    </svg>
  );
}

// ---------- procedural helpers ----------

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
  developed: boolean;
  resolvedOutcome: number | null;
  preset: PolaroidPreset;
}) {
  const range = opts.upperBound - opts.lowerBound;
  const meanT = clamp01((opts.prediction - opts.lowerBound) / range);
  const rng = mulberry32(opts.seed);

  const palettes = pickPalette(meanT, opts.shape, opts.conviction, opts.developed, opts.preset);

  const horizonY = 0.6 + (1 - opts.conviction) * 0.05;

  const sunY = horizonY - 0.18 - opts.conviction * 0.05;
  const sunR = (opts.photoWidth * (0.18 + opts.conviction * 0.08)) | 0;
  const sunCoreR = sunR * 0.42;

  const sun = {
    x: meanT,
    y: sunY,
    r: sunR,
    coreR: sunCoreR,
    core: palettes.sunCore,
    glow: palettes.sunGlow,
  };

  const sun2 = opts.shape === 'bimodal'
    ? {
      x: clamp01(meanT > 0.5 ? meanT - 0.35 : meanT + 0.35),
      y: sunY + 0.04,
      r: sunR * 0.68,
      coreR: sunCoreR * 0.68,
      core: palettes.sun2Core,
      glow: palettes.sunGlow,
    }
    : null;

  // Stars
  const numStars = opts.developed ? 22 : 14;
  const stars: Array<{ x: number; y: number; r: number; o: number }> = [];
  for (let i = 0; i < numStars; i++) {
    const sx = rng();
    const sy = rng() * horizonY * 0.85;
    const sr = 0.4 + rng() * 1.2;
    const so = 0.35 + rng() * 0.55;
    if (Math.hypot(sx - sun.x, sy - sun.y) > 0.18) {
      stars.push({ x: sx, y: sy, r: sr, o: so });
    }
  }

  // Silhouette (the belief shape becomes the horizon mountain line)
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
      const y = horizonY - norm * peakLift;
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

function pickPalette(
  meanT: number,
  shape: string,
  conviction: number,
  developed: boolean,
  preset: PolaroidPreset,
) {
  const warmPalettes = [
    { sky: { top: '#1F1234', mid: '#5A2A3F', bottom: '#E2865A' }, sunCore: '#FFD494', sunGlow: '#FF8A3D', sun2Core: '#FFE8B0', ground: { top: '#2C1517', bottom: '#0E0708', line: '#5A1F18' } },
    { sky: { top: '#231634', mid: '#7A2F4A', bottom: '#F5A86C' }, sunCore: '#FFE4B0', sunGlow: '#FF9E3F', sun2Core: '#FFF1C8', ground: { top: '#2A1219', bottom: '#0C0506', line: '#651E20' } },
  ];
  const coolPalettes = [
    { sky: { top: '#0C1530', mid: '#1F3A5F', bottom: '#79A4C8' }, sunCore: '#E0F0FF', sunGlow: '#7AB1E5', sun2Core: '#C8E0F8', ground: { top: '#101F30', bottom: '#040912', line: '#1F3654' } },
    { sky: { top: '#10182E', mid: '#2A4570', bottom: '#9CCAE3' }, sunCore: '#F0FAFF', sunGlow: '#86C0E5', sun2Core: '#D0E8F8', ground: { top: '#0F1A2A', bottom: '#04080F', line: '#1A3050' } },
  ];
  const auroraPalettes = [
    { sky: { top: '#0B1830', mid: '#2D1F58', bottom: '#5C2860' }, sunCore: '#A8F0D8', sunGlow: '#5DD3B5', sun2Core: '#F0A8D8', ground: { top: '#150A28', bottom: '#06030E', line: '#3A1A4A' } },
    { sky: { top: '#0E1432', mid: '#1E3A5C', bottom: '#3F6E8A' }, sunCore: '#D5F5E0', sunGlow: '#6FD8B0', sun2Core: '#F5C0E8', ground: { top: '#101A2C', bottom: '#04080E', line: '#22405E' } },
  ];
  const botanicalPalettes = [
    { sky: { top: '#0F2418', mid: '#2C5240', bottom: '#A8C896' }, sunCore: '#FFF6CE', sunGlow: '#E8DA8A', sun2Core: '#FFEDA8', ground: { top: '#1A2C1F', bottom: '#08120B', line: '#2E4A30' } },
    { sky: { top: '#142A1E', mid: '#3D6B4F', bottom: '#B8D3A2' }, sunCore: '#FFF1C0', sunGlow: '#D8C870', sun2Core: '#FFE89A', ground: { top: '#1F3424', bottom: '#0A140C', line: '#3A5238' } },
  ];
  const rosegoldPalettes = [
    { sky: { top: '#2B1424', mid: '#7A3450', bottom: '#F2B8C0' }, sunCore: '#FFE0B8', sunGlow: '#E08A6A', sun2Core: '#FFD0A8', ground: { top: '#321820', bottom: '#100509', line: '#5C2530' } },
    { sky: { top: '#321A2E', mid: '#8A3D5C', bottom: '#F5C8CA' }, sunCore: '#FFE4C0', sunGlow: '#D87E5E', sun2Core: '#FFD8B5', ground: { top: '#3A1E26', bottom: '#12060A', line: '#6B2B38' } },
  ];
  const noirPalettes = [
    { sky: { top: '#0A0A0A', mid: '#252525', bottom: '#888888' }, sunCore: '#FFFFFF', sunGlow: '#C8C8C8', sun2Core: '#E8E8E8', ground: { top: '#101010', bottom: '#000000', line: '#404040' } },
    { sky: { top: '#101010', mid: '#303030', bottom: '#9A9A9A' }, sunCore: '#F5F5F5', sunGlow: '#B8B8B8', sun2Core: '#D8D8D8', ground: { top: '#1A1A1A', bottom: '#050505', line: '#4A4A4A' } },
  ];

  const arr = (() => {
    switch (preset) {
      case 'sunset': return warmPalettes;
      case 'twilight': return coolPalettes;
      case 'aurora': return auroraPalettes;
      case 'botanical': return botanicalPalettes;
      case 'rosegold': return rosegoldPalettes;
      case 'noir': return noirPalettes;
      case 'auto':
      default:
        if (shape === 'bimodal') return auroraPalettes;
        return meanT < 0.45 ? coolPalettes : meanT > 0.55 ? warmPalettes : coolPalettes;
    }
  })();

  const idx = Math.floor((conviction * 7919) % arr.length);
  const base = arr[idx];

  if (!developed) {
    return {
      ...base,
      ground: { ...base.ground, line: mix(base.ground.line, base.ground.top, 0.4) },
    };
  }
  return base;
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

function stringSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

function formatPrediction(value: number, units: string): string {
  const formatted = Math.abs(value) >= 1000
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return units ? `${formatted} ${units}` : formatted;
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

/**
 * Compact number formatter for axis labels.
 * Keeps two significant figures for small numbers, drops decimals for large.
 */
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

/**
 * Build the footer sentence so the receipt is readable with no chart literacy.
 *
 *   open:     "@user · predicted 4 % · $35"
 *   resolved: "@user · 4 % → 4.25 % · off by 0.25%"
 */
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
  const handle = `@${username || 'anon'}`;
  if (developed && resolvedOutcome != null && Number.isFinite(resolvedOutcome)) {
    const range = Math.max(1e-6, upperBound - lowerBound);
    const errorPct = (Math.abs(prediction - resolvedOutcome) / range) * 100;
    const errorTxt = errorPct >= 1
      ? `${errorPct.toFixed(0)}%`
      : `${errorPct.toFixed(1)}%`;
    return `${handle} · ${formatScaleNumber(prediction, units)} → ${formatScaleNumber(resolvedOutcome, units)} · off by ${errorTxt}`;
  }
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
 * Numeric scale below the photo.
 *
 *  ▲                    ▼
 *  pred                  actual
 *  ━━━━━●━━━━━━━━━━○━━━━━━━━━━
 *  0    4 %         4.25 %  100
 *
 * The pred marker sits ABOVE the axis line and points up; the outcome marker
 * sits BELOW the axis and points down. This avoids label collisions when the
 * prediction and outcome are close together. Bounds are dimmed so they read
 * as "context" rather than "data."
 */
/**
 * The rarity stamp. Renders as a small pill in the top-right of the photo,
 * tinted by the tier's badge palette. Sits on the photo so colors read against
 * the sky portion of the develop scene rather than the polaroid card.
 */
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
  // Approximate label width in mono-ish font: 0.62 * fontSize per char.
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
      {/* End ticks for lower / upper bounds */}
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

      {/* Prediction marker — sits above the axis, points up to the user's call */}
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

      {/* Outcome marker — sits below the axis when present, ember tone */}
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
