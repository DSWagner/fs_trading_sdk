import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket, usePreviewSell } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from './Polaroid';
import { type BetRecord } from '../storage';

/**
 * Live portfolio section for a single market.
 *
 * The SDK's data hooks (`useMarket`, `usePreviewSell`) are scoped to a
 * single marketId, so iterating a user's positions across MANY markets
 * means rendering one of these sections per unique marketId in the
 * user's bet ledger. The parent (Profile.tsx) is responsible for that
 * grouping.
 *
 * Within a section we:
 *   1. Subscribe to `useMarket(marketId, { pollInterval: 15000 })` so
 *      the market title / consensus / resolution-state stays fresh
 *      automatically.
 *   2. On mount + on a 15s poll, fire `previewSell(positionId)` for
 *      every position the user holds in this market. Results are
 *      stored in a positionId -> { value, ts } map.
 *   3. Render each position as a thumbnail polaroid with a live P&L
 *      badge overlay in the top-right corner. The badge color is
 *      jade (gain), rose (loss), or muted (flat).
 *
 * Errors from individual previewSell calls are swallowed so a single
 * bad position doesn't break the whole section; the affected tile
 * just shows "—" in its P&L badge.
 */
export interface LivePortfolioSectionProps {
  marketId: string | number;
  positions: BetRecord[];
}

const POLL_MS = 15_000;

interface LiveValue {
  value: number;
  ts: number;
}

export function LivePortfolioSection({
  marketId,
  positions,
}: LivePortfolioSectionProps) {
  const { market } = useMarket(marketId, { pollInterval: POLL_MS });
  const { execute: previewSellExecute } = usePreviewSell(marketId);
  const [valueMap, setValueMap] = useState<Record<string, LiveValue>>({});
  const seqRef = useRef(0);

  const positionIds = useMemo(
    () => positions.map((p) => String(p.positionId)),
    [positions],
  );

  // Poll every position in this market on a 15s cadence. Each tick
  // bumps a sequence number so callbacks from older ticks are discarded
  // when their resolve order out-races a newer tick. AbortControllers
  // cancel in-flight previews when the section unmounts or the position
  // list changes.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abort: AbortController | null = null;

    async function tick() {
      const mySeq = ++seqRef.current;
      abort = new AbortController();
      try {
        const results = await Promise.allSettled(
          positionIds.map((pid) =>
            previewSellExecute(
              Number.isNaN(Number(pid)) ? (pid as any) : Number(pid),
              { signal: abort!.signal },
            ),
          ),
        );
        if (cancelled || seqRef.current !== mySeq) return;
        const next: Record<string, LiveValue> = { ...valueMap };
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            next[positionIds[idx]] = {
              value: r.value.collateralReturned,
              ts: Date.now(),
            };
          }
        });
        setValueMap(next);
      } catch {
        // Aborts and individual rejections handled per-promise above.
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    }
    if (positionIds.length > 0) tick();
    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      if (abort) abort.abort();
    };
    // valueMap intentionally omitted: we don't want to refire the loop
    // every time a tick lands. The closure captures the latest map
    // via the setter callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionIds.join('|'), previewSellExecute]);

  const totalStaked = useMemo(
    () => positions.reduce((acc, p) => acc + p.collateral, 0),
    [positions],
  );
  const totalLiveValue = useMemo(() => {
    return positions.reduce((acc, p) => {
      const live = valueMap[String(p.positionId)];
      // Fall back to original collateral when the engine hasn't
      // responded yet, so the total never reads as "0" while the
      // initial preview is in flight.
      return acc + (live ? live.value : p.collateral);
    }, 0);
  }, [positions, valueMap]);
  const unrealizedPnl = totalLiveValue - totalStaked;
  const haveAnyLive = Object.keys(valueMap).length > 0;
  const headerColor =
    !haveAnyLive || Math.abs(unrealizedPnl) < 0.005
      ? palette.inkMute
      : unrealizedPnl > 0
        ? palette.jade
        : palette.rose;

  const resolutionState =
    (market as any)?.resolutionState ?? null;
  const marketTitle =
    market?.title ?? positions[0]?.marketTitle ?? `Market ${marketId}`;
  const marketLink = `/m/${encodeURIComponent(String(marketId))}`;

  return (
    <section
      data-testid={`live-portfolio-section-${marketId}`}
      style={{
        marginBottom: 28,
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 12,
          borderBottom: `1px dashed ${palette.rule}`,
          paddingBottom: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10.5,
              letterSpacing: 1.4,
              color: resolutionState === 'resolved' ? palette.inkMute : palette.ember,
              fontWeight: 600,
            }}
          >
            {resolutionState === 'resolved'
              ? 'SETTLED'
              : resolutionState === 'voided'
                ? 'VOIDED'
                : 'LIVE'}{' '}
            · {positions.length} {positions.length === 1 ? 'POSITION' : 'POSITIONS'}
          </div>
          <Link
            to={marketLink}
            style={{
              display: 'block',
              marginTop: 4,
              fontFamily: fonts.display,
              fontSize: 16,
              fontWeight: 700,
              color: palette.ink,
              letterSpacing: -0.2,
              textDecoration: 'none',
              wordBreak: 'break-word',
            }}
          >
            {marketTitle}
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
          <Stat label="STAKED" value={`$${totalStaked.toFixed(2)}`} />
          <Stat label="VALUE" value={haveAnyLive ? `$${totalLiveValue.toFixed(2)}` : '—'} />
          <Stat
            label="UNREALIZED P&L"
            value={haveAnyLive ? formatSignedDollars(unrealizedPnl) : '—'}
            color={headerColor}
          />
        </div>
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 18,
        }}
      >
        {positions.map((p) => {
          const live = valueMap[String(p.positionId)];
          const pnl = live ? live.value - p.collateral : null;
          return (
            <LiveBetTile key={`${p.marketId}:${p.positionId}`} bet={p} pnl={pnl} />
          );
        })}
      </div>
    </section>
  );
}

function LiveBetTile({
  bet,
  pnl,
}: {
  bet: BetRecord;
  pnl: number | null;
}) {
  const positive = pnl != null && pnl > 0;
  const flat = pnl != null && Math.abs(pnl) < 0.005;
  const badgeColor =
    pnl == null ? palette.inkMute : flat ? palette.inkSoft : positive ? palette.jade : palette.rose;
  const badgeLabel = pnl == null ? '…' : formatSignedDollars(pnl);
  return (
    <Link
      to={`/r/${encodeURIComponent(String(bet.marketId))}/${encodeURIComponent(String(bet.positionId))}`}
      style={{ textDecoration: 'none', display: 'block', position: 'relative' }}
      data-testid={`live-bet-tile-${bet.positionId}`}
    >
      <Polaroid
        marketId={bet.marketId}
        positionId={bet.positionId}
        marketTitle={bet.marketTitle ?? 'Market'}
        marketUnits={bet.marketUnits}
        username={bet.username}
        reasoning={bet.reasoning}
        createdAt={bet.createdAt}
        prediction={bet.prediction}
        spread={bet.spread}
        conviction={bet.conviction}
        collateral={bet.collateral}
        shape={bet.shape}
        lowerBound={bet.lowerBound ?? 0}
        upperBound={bet.upperBound ?? 1}
        consensusAtBet={bet.consensusAtBet ?? null}
        expiresAt={bet.expiresAt ?? null}
        resolutionState="open"
        width={220}
        interactive
      />
      <span
        data-testid={`live-bet-pnl-${bet.positionId}`}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '4px 8px',
          borderRadius: 999,
          background: palette.card,
          border: `1px solid ${badgeColor}`,
          color: badgeColor,
          fontFamily: fonts.mono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.8,
          boxShadow: `0 1px 4px ${palette.shadow}`,
          pointerEvents: 'none',
        }}
      >
        {badgeLabel}
      </span>
    </Link>
  );
}

/**
 * Format a signed dollar amount as `+$X.XX`, `-$X.XX`, or `$0.00`.
 * Specifically NOT `$-7.00`, which is what naive
 * `${sign}$${value.toFixed(2)}` concatenation produces and reads
 * like a typo.
 */
function formatSignedDollars(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.005) return '+$0.00';
  const sign = value > 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          letterSpacing: 1.4,
          color: palette.inkMute,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 14,
          fontWeight: 700,
          color: color ?? palette.ink,
          letterSpacing: 0.4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
