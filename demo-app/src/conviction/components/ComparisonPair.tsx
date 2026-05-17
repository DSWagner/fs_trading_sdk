import { useMemo } from 'react';
import { useConsensus, useMarket } from '@functionspace/react';
import { Polaroid } from './Polaroid';
import { palette, fonts } from '../theme';

/**
 * Comparison Pair — your call vs the crowd, rendered as twin Polaroids.
 *
 * The receipt already tells the user "here is the conviction I signed."
 * This component adds the editorial-payoff visual right next to it:
 * what would a polaroid look like if the CROWD signed a receipt today?
 *
 * Mechanics:
 *   - We read the live consensus distribution from `useConsensus` (a
 *     hook we were already touching elsewhere) and the live market
 *     from `useMarket` (cache shared across the receipt page).
 *   - From the consensus density we compute its mean, standard
 *     deviation, and a normalised "conviction" score (inverse spread
 *     against the market range). These three numbers become the
 *     `prediction`, `spread`, and `conviction` of a synthesised crowd
 *     polaroid.
 *   - The crowd polaroid renders with the same procedural pipeline
 *     as the user's, so the resulting image carries the same
 *     "rarity sky" and celestial layer style — but anchored to the
 *     crowd's belief instead of the user's. Visually, two polaroids
 *     side-by-side: the same world, two different convictions about
 *     it.
 *   - The crowd polaroid takes `username="@thecrowd"` and a
 *     pre-written reasoning string ("Aggregate of all current
 *     positions on this market.") so the footer reads naturally
 *     without exposing engine internals.
 *
 * The component degrades cleanly: if the consensus is still loading,
 * or returns degenerate input (no mass), or has fewer than 3 buckets,
 * the comparison block hides itself entirely rather than rendering
 * a half-broken polaroid.
 *
 * Footprint:
 *   - Two SDK hooks reused, no new ones.
 *   - All polaroid math goes through the existing `Polaroid`
 *     component (same component the user's receipt renders with),
 *     so rarity, celestial events, and palette stay consistent.
 *   - Mobile: stacks vertically and shrinks each polaroid to 250px.
 */

export interface ComparisonPairProps {
  marketId: string | number;
  positionId: string | number;
  marketTitle: string;
  marketUnits?: string;
  lowerBound: number;
  upperBound: number;
  /** The user's own bet, rendered on the left. */
  userBet: {
    username: string;
    reasoning: string;
    createdAt: string;
    prediction: number;
    spread: number;
    conviction: number;
    collateral: number;
    shape: 'gaussian' | 'range' | 'bimodal';
    consensusAtBet: number | null;
  };
  /** Resolution state propagated through to both polaroids. */
  resolutionState?: 'open' | 'resolved' | 'voided' | string;
  resolvedOutcome?: number | null;
  /** Pre-computed polaroid width (matches the parent's primary polaroid). */
  width: number;
  /** Stack vertically when true. */
  isMobile: boolean;
  /**
   * When false, the entire block renders nothing AND skips the live
   * `useConsensus` / `useMarket` SDK fetches. The Receipt page disables
   * this for curated demo bets whose market IDs are not real engine
   * markets — without this gate the SDK polls them forever, fills the
   * console with 422s, and pins a perma-skeleton on the page.
   */
  enabled?: boolean;
  /**
   * Whether the signed-in viewer IS the bet author. Drives the
   * left-hand polaroid's scale-strip prefix: the author sees "you"
   * but a stranger sees "@theirhandle" so the receipt never falsely
   * implies the conviction belongs to the viewer. The crowd
   * polaroid on the right is unaffected and always reads "crowd".
   */
  isOwner?: boolean;
}

export function ComparisonPair({
  marketId,
  positionId,
  marketTitle,
  marketUnits,
  lowerBound,
  upperBound,
  userBet,
  resolutionState,
  resolvedOutcome,
  width,
  isMobile,
  enabled = true,
  isOwner = true,
}: ComparisonPairProps) {
  // Both hooks tap into the same SDK cache the rest of the Receipt
  // page is already using, so this adds zero engine cost. When
  // `enabled` is false (demo markets) we pass `enabled: false` through
  // to the SDK so neither hook fetches or polls.
  const { consensus, loading: consensusLoading } = useConsensus(marketId, undefined, {
    enabled,
  });
  const { market } = useMarket(marketId, { enabled });

  const crowdSummary = useMemo(
    () => summariseConsensus(consensus, lowerBound, upperBound),
    [consensus, lowerBound, upperBound],
  );

  if (!enabled) return null;

  // Hide the block when the engine has not yet sent us enough data to
  // render a meaningful crowd polaroid. We don't want to flash a
  // degenerate frame in the middle of the receipt.
  if (consensusLoading) return <PairSkeleton width={width} isMobile={isMobile} />;
  if (!crowdSummary) return null;

  const crowdWidth = isMobile ? Math.min(width, 280) : width;
  const userWidth = isMobile ? Math.min(width, 280) : width;
  // The crowd polaroid uses the SAME createdAt as the user's bet so
  // the "develop" progression for both polaroids tracks the same
  // pre-resolution arc and reads visually consistent. After the bet
  // resolves we also propagate `resolvedOutcome`, which means both
  // polaroids slide into their post-resolution state in lockstep.
  const crowdReasoning =
    'The aggregate belief currently priced into the market. Updates as new bets shift the consensus.';

  return (
    <section
      data-testid="comparison-pair"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
        padding: isMobile ? '20px 14px' : '24px 22px',
        marginBottom: 24,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10.5,
              letterSpacing: 1.6,
              color: palette.teal,
              fontWeight: 600,
            }}
          >
            {isOwner ? 'YOUR CALL · VS · THE CROWD' : `@${userBet.username.toUpperCase()} · VS · THE CROWD`}
          </div>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 18 : 22,
              fontWeight: 700,
              color: palette.ink,
              margin: '4px 0 0',
              letterSpacing: -0.4,
            }}
          >
            Same market. Two convictions.
          </h3>
        </div>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: 1.2,
            color: palette.inkFade,
          }}
        >
          useConsensus
        </span>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? 16 : 22,
          alignItems: 'start',
          justifyItems: 'center',
        }}
      >
        <PairColumn
          label={isOwner ? 'YOU' : `@${userBet.username}`}
          subLabel={isOwner ? `@${userBet.username}` : 'their conviction'}
          isMobile={isMobile}
        >
          <Polaroid
            marketId={marketId}
            positionId={positionId}
            marketTitle={marketTitle}
            marketUnits={marketUnits}
            username={userBet.username}
            reasoning={userBet.reasoning}
            createdAt={userBet.createdAt}
            prediction={userBet.prediction}
            spread={userBet.spread}
            conviction={userBet.conviction}
            collateral={userBet.collateral}
            shape={userBet.shape}
            lowerBound={lowerBound}
            upperBound={upperBound}
            resolutionState={resolutionState}
            resolvedOutcome={resolvedOutcome}
            width={userWidth}
            consensusAtBet={userBet.consensusAtBet}
            expiresAt={(market as any)?.expiresAt ?? null}
            // "you" only when the signed-in viewer IS the author.
            // Otherwise the strip reads "@theirhandle" so a visitor
            // never sees a stranger's conviction labelled as their own.
            predictionLabel={isOwner ? 'you' : `@${userBet.username}`}
          />
        </PairColumn>

        <PairColumn
          label="THE CROWD"
          subLabel="aggregate consensus"
          isMobile={isMobile}
        >
          <Polaroid
            // Use a deterministic synthetic key so the crowd polaroid
            // has its own stable seed (separate from the user's),
            // which means it gets a different procedural sky / star
            // configuration. Same market though — the underlying
            // landscape stays anchored to this market's identity.
            marketId={`crowd-${marketId}`}
            positionId={`crowd-${positionId}`}
            marketTitle={marketTitle}
            marketUnits={marketUnits}
            username="thecrowd"
            reasoning={crowdReasoning}
            createdAt={userBet.createdAt}
            prediction={crowdSummary.mean}
            spread={crowdSummary.spread}
            conviction={crowdSummary.conviction}
            collateral={Math.max(userBet.collateral, 1)}
            shape="gaussian"
            lowerBound={lowerBound}
            upperBound={upperBound}
            resolutionState={resolutionState}
            resolvedOutcome={resolvedOutcome}
            width={crowdWidth}
            consensusAtBet={crowdSummary.mean}
            expiresAt={(market as any)?.expiresAt ?? null}
            // The receipt's main polaroid is always the user's, so its
            // scale strip prefix "you" is correct there. The CROWD
            // polaroid in this side-by-side pair must instead read
            // "crowd · 38.45" so the two polaroids stay
            // distinguishable at a glance. Without this, both columns
            // confusingly print the same "you · NN.NN" label.
            predictionLabel="crowd"
          />
        </PairColumn>
      </div>

      <DiffBand
        userPrediction={userBet.prediction}
        crowdMean={crowdSummary.mean}
        marketUnits={marketUnits ?? ''}
        lowerBound={lowerBound}
        upperBound={upperBound}
        resolvedOutcome={resolvedOutcome}
        resolutionState={resolutionState}
        authorHandle={userBet.username}
        isOwner={isOwner}
      />
    </section>
  );
}

function PairColumn({
  label,
  subLabel,
  isMobile,
  children,
}: {
  label: string;
  subLabel: string;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: '100%' }}>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10.5,
          letterSpacing: 1.6,
          color: palette.ember,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: isMobile ? 12 : 13,
          color: palette.inkMute,
        }}
      >
        {subLabel}
      </div>
      {children}
    </div>
  );
}

function PairSkeleton({ width, isMobile }: { width: number; isMobile: boolean }) {
  const w = isMobile ? Math.min(width, 280) : width;
  return (
    <section
      data-testid="comparison-pair-skeleton"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
        padding: isMobile ? '20px 14px' : '24px 22px',
        marginBottom: 24,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? 16 : 22,
        justifyItems: 'center',
      }}
    >
      <div
        style={{
          width: w,
          height: w * 1.2,
          background: palette.rulesoft,
          borderRadius: 8,
          opacity: 0.55,
        }}
      />
      <div
        style={{
          width: w,
          height: w * 1.2,
          background: palette.rulesoft,
          borderRadius: 8,
          opacity: 0.35,
        }}
      />
    </section>
  );
}

interface DiffBandProps {
  userPrediction: number;
  crowdMean: number;
  marketUnits: string;
  lowerBound: number;
  upperBound: number;
  resolvedOutcome?: number | null;
  resolutionState?: string;
  /** Author handle used in non-owner diff sentences ("@pimo is …"). */
  authorHandle: string;
  /** Whether the signed-in viewer IS the author. */
  isOwner: boolean;
}

/**
 * The diff band sits below both polaroids and turns the picture into a
 * sentence. When the viewer IS the author it reads in second person
 * ("You are 12 % higher than the crowd"). When the viewer is a stranger
 * it reads about the author in third person ("@pimo is 12 % higher than
 * the crowd") so the page never falsely claims the conviction is the
 * viewer's.
 */
function DiffBand({
  userPrediction,
  crowdMean,
  marketUnits,
  lowerBound,
  upperBound,
  resolvedOutcome,
  resolutionState,
  authorHandle,
  isOwner,
}: DiffBandProps) {
  const diff = userPrediction - crowdMean;
  const range = Math.max(0.0001, upperBound - lowerBound);
  const diffPct = (Math.abs(diff) / range) * 100;
  const sign = diff >= 0 ? 'higher' : 'lower';
  const resolved =
    resolutionState === 'resolved' && resolvedOutcome != null && Number.isFinite(resolvedOutcome);
  let verdict: { text: string; color: string } | null = null;
  if (resolved) {
    const userErr = Math.abs(userPrediction - (resolvedOutcome as number));
    const crowdErr = Math.abs(crowdMean - (resolvedOutcome as number));
    if (userErr < crowdErr - range * 0.01) {
      verdict = {
        text: isOwner
          ? 'You called it tighter than the crowd.'
          : `@${authorHandle} called it tighter than the crowd.`,
        color: palette.jade,
      };
    } else if (crowdErr < userErr - range * 0.01) {
      verdict = {
        text: isOwner
          ? 'The crowd called it tighter than you.'
          : `The crowd called it tighter than @${authorHandle}.`,
        color: palette.rose,
      };
    } else {
      verdict = {
        text: isOwner
          ? 'You and the crowd landed equally close.'
          : `@${authorHandle} and the crowd landed equally close.`,
        color: palette.inkSoft,
      };
    }
  }
  return (
    <div
      data-testid="comparison-diff"
      style={{
        marginTop: 18,
        padding: '12px 14px',
        borderTop: `1px solid ${palette.rulesoft}`,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: fonts.body,
        fontSize: 13,
        color: palette.inkSoft,
      }}
    >
      <span>
        {isOwner ? 'You are ' : <>@{authorHandle} is </>}
        <strong style={{ color: palette.ember }}>{diffPct.toFixed(1)}%</strong> of the
        range {sign} than the crowd
        {marketUnits ? <> (<span style={{ fontFamily: fonts.mono }}>{userPrediction.toFixed(2)} vs {crowdMean.toFixed(2)} {marketUnits}</span>)</> : null}.
      </span>
      {verdict && (
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: 1.2,
            color: verdict.color,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {verdict.text}
        </span>
      )}
    </div>
  );
}

/**
 * Pure helper: collapse a consensus density into the three scalars a
 * Polaroid needs (prediction, spread, conviction). Mirrors the math
 * the SDK uses internally so the synthetic polaroid reads as if a
 * real user had signed it.
 *
 * Returns null when the consensus is empty, all-zero, has fewer than
 * 3 sample points, or integrates to zero — in any of which cases
 * we'd be inventing a misleading visual.
 *
 * Accepts the `ConsensusCurve` shape returned by `useConsensus` —
 * `{ points: { x, y }[], config }` — or just the raw points array,
 * since callers in tests sometimes pass the inner list directly.
 */
type CurveLike =
  | { points: Array<{ x: number; y: number }> }
  | Array<{ x: number; y: number }>
  | null
  | undefined;

export function summariseConsensus(
  curve: CurveLike,
  lowerBound: number,
  upperBound: number,
): { mean: number; spread: number; conviction: number } | null {
  const points = Array.isArray(curve) ? curve : curve?.points;
  if (!points || points.length < 3) return null;

  // Trapezoidal integration over the density curve. `y` is a density
  // (not a normalised probability), so we have to integrate against
  // dx to get a probability mass we can then divide by.
  let mass = 0;
  let meanAcc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    const dx = b.x - a.x;
    const sliceMass = ((a.y + b.y) / 2) * dx;
    if (!Number.isFinite(sliceMass)) continue;
    mass += sliceMass;
    meanAcc += sliceMass * ((a.x + b.x) / 2);
  }
  if (!Number.isFinite(mass) || mass <= 0) return null;
  const mean = meanAcc / mass;

  let varAcc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    const dx = b.x - a.x;
    const midX = (a.x + b.x) / 2;
    const sliceMass = ((a.y + b.y) / 2) * dx;
    const d = midX - mean;
    varAcc += sliceMass * d * d;
  }
  const stdDev = Math.sqrt(Math.max(0, varAcc / mass));

  const range = Math.max(0.0001, upperBound - lowerBound);
  // `spread` in Polaroid terms is a 0..1 value; we map the crowd's
  // stdDev as a fraction of the market range, clamped to [0.05, 1]
  // so the polaroid always has a visible shape.
  const spread = Math.max(0.05, Math.min(1, (stdDev * 2) / range));
  // Conviction is the inverse: tighter distribution -> higher
  // conviction. We bound it to [0.05, 1] for the same reason.
  const conviction = Math.max(0.05, Math.min(1, 1 - spread));
  return { mean, spread, conviction };
}
