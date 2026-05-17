import { useMemo } from 'react';
import { useMarket } from '@functionspace/react';
import { palette, fonts } from '../theme';

/**
 * Live consensus drift card.
 *
 * Subscribes to the SDK `useMarket` cache with a 5-second poll so the
 * market's current consensus mean and resolution state stay fresh while
 * the receipt is open. The card surfaces two pieces of information:
 *
 *   1. Where the crowd's consensus has DRIFTED since the bet was placed
 *      (signed delta, plus how that drift compares to the user's own
 *      prediction - did the crowd come toward me, or away from me?).
 *   2. Whether the receipt has SETTLED, and if so the resolved outcome,
 *      with a verdict color (jade if the user nailed it, rose if not).
 *
 * The rarity-determining `consensusAtBet` snapshot is NOT touched here:
 * the polaroid keeps using that pinned value for its rarity calculation.
 * This card is purely an additive live overlay - "here's the world as
 * it stands right now relative to your receipt".
 *
 * Why this matters for the demo: it converts the polaroid from a frozen
 * snapshot into a living object, and exercises the SDK's
 * cache+subscription model (poll interval, automatic re-render on
 * data change) in a way the rest of Conviction did not previously do.
 */
export interface LiveConsensusCardProps {
  marketId: string | number;
  /** Consensus mean at the moment the user placed the bet (pinned). */
  consensusAtBet: number | null;
  /** The user's own prediction value. */
  prediction: number;
  /** Lower bound of the market's outcome range, for % normalization. */
  lowerBound: number;
  /** Upper bound of the market's outcome range, for % normalization. */
  upperBound: number;
  /** Units string (e.g. "%", "USD"). Rendered next to numeric values. */
  marketUnits?: string;
  /** Compact mode renders without the outer card chrome. */
  compact?: boolean;
  /**
   * When false, the card renders nothing AND does not subscribe to the
   * SDK market cache (no network request, no polling). The Receipt page
   * uses this to suppress live data fetches for curated demo bets whose
   * market IDs (e.g. `demo-gpt-release`) are not real engine markets
   * and would 422 in a tight loop, polluting the console and rendering
   * a perma-loading skeleton on someone else's polaroid view.
   */
  enabled?: boolean;
}

const POLL_INTERVAL_MS = 5_000;

export function LiveConsensusCard({
  marketId,
  consensusAtBet,
  prediction,
  lowerBound,
  upperBound,
  marketUnits = '',
  compact = false,
  enabled = true,
}: LiveConsensusCardProps) {
  // `useMarket` accepts `enabled: false` which suppresses both the
  // initial fetch and any polling, keeping the SDK cache idle for this
  // marketId. The hook MUST be called unconditionally (rules of hooks)
  // so we always invoke it but pass through the gate.
  const { market, loading, error } = useMarket(marketId, {
    pollInterval: enabled ? POLL_INTERVAL_MS : 0,
    enabled,
  });

  if (!enabled) return null;

  const liveConsensus = market?.consensusMean ?? null;
  const resolutionState = (market as any)?.resolutionState ?? 'open';
  const resolvedOutcome: number | null =
    (market as any)?.resolvedOutcome ?? null;

  const drift = useMemo(() => {
    if (consensusAtBet == null || liveConsensus == null) return null;
    if (!Number.isFinite(consensusAtBet) || !Number.isFinite(liveConsensus)) return null;
    const range = upperBound - lowerBound;
    if (!Number.isFinite(range) || range <= 0) return null;
    const delta = liveConsensus - consensusAtBet;
    const driftPct = (Math.abs(delta) / range) * 100;
    // Did the crowd come TOWARD the user's prediction or move AWAY?
    const distAtBet = Math.abs(prediction - consensusAtBet);
    const distNow = Math.abs(prediction - liveConsensus);
    const towardUser = distNow < distAtBet;
    const movedExactlyOnUs = Math.abs(distNow - distAtBet) < 1e-9;
    return {
      delta,
      driftPct,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      towardUser,
      movedExactlyOnUs,
      distAtBet,
      distNow,
    };
  }, [consensusAtBet, liveConsensus, prediction, lowerBound, upperBound]);

  if (loading && !market) {
    return (
      <CardShell compact={compact} testId="live-consensus-card-loading">
        <Eyebrow color={palette.inkMute}>LIVE</Eyebrow>
        <div style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.inkMute, marginTop: 6 }}>
          Pulling the latest consensus from the wire…
        </div>
      </CardShell>
    );
  }
  if (error || !market) {
    return null;
  }

  // Resolved view: the market is settled, drift becomes irrelevant. Show
  // the settled outcome stamp instead of the live drift line.
  if (resolutionState === 'resolved' && resolvedOutcome != null) {
    const range = upperBound - lowerBound;
    const errAbsPct =
      range > 0
        ? Math.round((Math.abs(resolvedOutcome - prediction) / range) * 100)
        : null;
    const accurate = errAbsPct != null && errAbsPct <= 6;
    const accentColor = accurate ? palette.jade : palette.rose;
    return (
      <CardShell compact={compact} testId="live-consensus-card-resolved">
        <Eyebrow color={accentColor}>SETTLED</Eyebrow>
        <Row>
          <Label>Outcome</Label>
          <Value color={palette.ink}>
            {formatNum(resolvedOutcome)}{' '}
            <Unit>{marketUnits}</Unit>
          </Value>
        </Row>
        <Row>
          <Label>Your call</Label>
          <Value>
            {formatNum(prediction)} <Unit>{marketUnits}</Unit>
          </Value>
        </Row>
        {errAbsPct != null && (
          <Row>
            <Label>Off by</Label>
            <Value color={accentColor}>
              {errAbsPct}% of range
            </Value>
          </Row>
        )}
      </CardShell>
    );
  }

  // Open view: show the live consensus drift relative to the bet snapshot.
  if (drift == null || consensusAtBet == null || liveConsensus == null) {
    return null;
  }
  const driftColor =
    drift.driftPct < 0.5
      ? palette.inkMute
      : drift.towardUser
        ? palette.jade
        : palette.ember;
  const arrow =
    drift.direction === 'up' ? '↑' : drift.direction === 'down' ? '↓' : '·';
  const driftDirectionLabel =
    drift.driftPct < 0.5
      ? 'No drift yet'
      : drift.towardUser
        ? 'Coming your way'
        : drift.movedExactlyOnUs
          ? 'Holding'
          : 'Drifting away';

  return (
    <CardShell compact={compact} testId="live-consensus-card-open">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <PulsingDot color={palette.ember} />
        <Eyebrow color={palette.ember}>LIVE · POLLING EVERY 5s</Eyebrow>
      </div>
      <Row>
        <Label>Consensus now</Label>
        <Value color={palette.ink}>
          {formatNum(liveConsensus)} <Unit>{marketUnits}</Unit>
        </Value>
      </Row>
      <Row>
        <Label>At bet time</Label>
        <Value color={palette.inkMute}>
          {formatNum(consensusAtBet)} <Unit>{marketUnits}</Unit>
        </Value>
      </Row>
      <Row>
        <Label>Drift</Label>
        <Value color={driftColor}>
          <span style={{ fontFamily: fonts.mono, marginRight: 4 }}>{arrow}</span>
          {drift.driftPct < 0.01 ? '<0.01' : drift.driftPct.toFixed(2)}% of range
        </Value>
      </Row>
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px dashed ${palette.rule}`,
          fontFamily: fonts.body,
          fontSize: 12,
          color: driftColor,
          fontStyle: 'italic',
          letterSpacing: 0.2,
        }}
      >
        {driftDirectionLabel}.
      </div>
      <style>{`
        @keyframes conviction-live-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(230, 138, 79, 0.55); }
          70%  { box-shadow: 0 0 0 7px rgba(230, 138, 79, 0); }
          100% { box-shadow: 0 0 0 0 rgba(230, 138, 79, 0); }
        }
      `}</style>
    </CardShell>
  );
}

function CardShell({
  children,
  compact,
  testId,
}: {
  children: React.ReactNode;
  compact: boolean;
  testId: string;
}) {
  if (compact) {
    return (
      <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    );
  }
  return (
    <div
      data-testid={testId}
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 10.5,
        letterSpacing: 1.4,
        color,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.inkMute }}>
      {children}
    </span>
  );
}

function Value({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 13,
        color: color ?? palette.ink,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {children}
    </span>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: palette.inkMute, fontWeight: 400, fontSize: 11.5 }}>
      {children}
    </span>
  );
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        animation: 'conviction-live-pulse 1800ms ease-out infinite',
      }}
    />
  );
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const absV = Math.abs(value);
  const decimals = absV >= 1000 ? 0 : absV >= 1 ? 1 : 3;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals === 0 ? 0 : 1,
    maximumFractionDigits: decimals,
  });
}
