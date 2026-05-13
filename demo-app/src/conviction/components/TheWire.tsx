import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTradeHistory, useMarkets } from '@functionspace/react';
import type { TradeEntry, MarketState } from '@functionspace/core';
import { palette, fonts } from '../theme';
import { potentialRarity, TIER_META, type Rarity } from '../rarity';

/**
 * The Wire — public real-time activity ticker.
 *
 * This is the answer to the user's question "why can't my friend see
 * my polaroids on Vercel?" Polaroid metadata (the reasoning) only
 * lives in the author's localStorage, but the engine knows EVERY
 * buy/sell that touches a market, with username + prediction +
 * amount + timestamp. `useTradeHistory(marketId)` exposes that feed
 * per market.
 *
 * We poll `useTradeHistory` for the top few markets every ~12 seconds,
 * merge the trade lists, sort by timestamp, and render the most
 * recent N events as a vertical "wire" — exactly the kind of public
 * activity feed that makes prediction markets feel alive. Each row
 * carries:
 *   - the handle (linked to /u/<username>)
 *   - BOUGHT / SOLD verb in jade/rose
 *   - prediction value + market units
 *   - market title (linked to /m/<marketId>)
 *   - amount staked
 *   - a relative timestamp ("28s ago", "4m ago")
 *   - a rarity hint dot — what tier this prediction COULD earn if the
 *     trader is right, computed via `potentialRarity` against the
 *     market's current consensus
 *
 * The rarity hint dot is the visual hook: rows pop in coloured by
 * how contrarian the call is. Mythic predictions paint ember-red,
 * legendary gold, epic purple, etc. A "common" call gets a quiet ink
 * dot. The feed becomes a heatmap of bold convictions across the
 * platform.
 *
 * Design constraints:
 *   - reads from up to 3 markets so we don't hammer the engine
 *   - 12-second poll keeps the feed feeling live without burning
 *     bandwidth
 *   - SDK cache deduplicates across components, so if Discover and
 *     Landing both render this we still only fire one fetch per
 *     market-key per poll cycle
 *   - degrades gracefully when the engine returns empty arrays
 *     (shows an editorial empty state rather than blank)
 */

export interface TheWireProps {
  /** Maximum rows shown in the feed. Default: 8. */
  rowLimit?: number;
  /** Max markets we poll for trade history. Default: 3. */
  marketLimit?: number;
  /** Poll cadence for each market's trade history, ms. Default: 12_000. */
  pollInterval?: number;
  /** Compact mode trims paddings and font sizes for embedding inside a wider page. */
  compact?: boolean;
}

export function TheWire({
  rowLimit = 8,
  marketLimit = 3,
  pollInterval = 12_000,
  compact = false,
}: TheWireProps) {
  // Pick the top N highest-volume open markets as our wire sources.
  // We deliberately bias toward volume so each polled market has real
  // trade activity to surface; sampling random low-volume markets
  // would give us mostly empty feeds.
  const { markets } = useMarkets({
    state: 'open',
    sortBy: 'totalVolume',
    sortOrder: 'desc',
    pollInterval: 30_000,
  });

  const sources = useMemo(
    () =>
      (markets ?? [])
        .slice(0, marketLimit)
        .map((m) => ({ marketId: String(m.marketId), market: m })),
    [markets, marketLimit],
  );

  return (
    <section
      data-testid="the-wire"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        padding: compact ? '14px 16px' : '18px 22px',
        marginBottom: compact ? 24 : 32,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: compact ? 10 : 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10.5,
              letterSpacing: 1.6,
              color: palette.ember,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: palette.ember,
                animation: 'conviction-pulse 1600ms ease-in-out infinite',
              }}
            />
            THE WIRE · LIVE
          </div>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: compact ? 18 : 22,
              fontWeight: 700,
              color: palette.ink,
              margin: '4px 0 0',
              letterSpacing: -0.4,
            }}
          >
            Other people are placing bets right now.
          </h3>
        </div>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: 1.3,
            color: palette.inkMute,
          }}
        >
          POLLED EVERY {Math.round(pollInterval / 1000)}S
        </span>
      </header>

      {/* Mount one invisible subscriber per source market. Each child
          subscribes to useTradeHistory for its marketId and reports
          back via the lifted onTrades callback. We then merge + sort
          + slice in the parent so we render a single unified feed. */}
      <WireMerger
        sources={sources}
        rowLimit={rowLimit}
        pollInterval={pollInterval}
        compact={compact}
      />
    </section>
  );
}

interface WireMergerProps {
  sources: Array<{ marketId: string; market: MarketState }>;
  rowLimit: number;
  pollInterval: number;
  compact: boolean;
}

function WireMerger({ sources, rowLimit, pollInterval, compact }: WireMergerProps) {
  // Lifted-state pattern: each WireSource child writes its trades into
  // this map keyed by marketId, the parent merges them on render.
  // Using an object (not state per source) keeps the merge O(n) and
  // means the feed re-orders the instant any source updates.
  const [byMarket, setByMarket] = useState<Record<string, TradeEntry[]>>({});

  // When the source list changes, prune stale entries.
  useEffect(() => {
    setByMarket((prev) => {
      const allowed = new Set(sources.map((s) => s.marketId));
      const next: Record<string, TradeEntry[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(k)) next[k] = v;
      }
      return next;
    });
  }, [sources]);

  // MUST be useCallback. Without a stable identity, the WireSource
  // children's useEffect would re-fire every render (because their
  // dep array sees a "new" onTrades), which would call setByMarket
  // again, which would re-render WireMerger and create a brand-new
  // handleTrades, looping forever. With useCallback the identity is
  // stable across renders and the loop is broken.
  //
  // We ALSO content-compare the incoming trades array against the
  // previously-stored array (length + trade ids). The SDK cache
  // returns stable references between polls in production, but in
  // tests (and in production if the cache implementation changes)
  // we get fresh objects on every render. Without the content check,
  // a non-stable reference would still cause WireMerger to re-render
  // continuously even though the actual data is unchanged.
  const handleTrades = useCallback((marketId: string, trades: TradeEntry[]) => {
    setByMarket((prev) => {
      const existing = prev[marketId];
      if (existing === trades) return prev;
      if (existing && tradesMatch(existing, trades)) return prev;
      return { ...prev, [marketId]: trades };
    });
  }, []);

  // Merge + sort. Newest first.
  const merged = useMemo(() => {
    const rows: Array<{ trade: TradeEntry; market: MarketState }> = [];
    for (const s of sources) {
      const trades = byMarket[s.marketId] ?? [];
      for (const t of trades) rows.push({ trade: t, market: s.market });
    }
    rows.sort((a, b) => +new Date(b.trade.timestamp) - +new Date(a.trade.timestamp));
    return rows.slice(0, rowLimit);
  }, [byMarket, sources, rowLimit]);

  return (
    <>
      {sources.map((s) => (
        <WireSource
          key={s.marketId}
          marketId={s.marketId}
          pollInterval={pollInterval}
          onTrades={handleTrades}
        />
      ))}
      {merged.length === 0 ? (
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 13,
            color: palette.inkMute,
            padding: '14px 4px',
            textAlign: 'center',
          }}
        >
          The wire is quiet. Trades will appear here the moment they hit the engine.
        </div>
      ) : (
        <ul
          data-testid="the-wire-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? 2 : 4,
          }}
        >
          {merged.map((row) => (
            <WireRow
              key={`${row.trade.id}`}
              trade={row.trade}
              market={row.market}
              compact={compact}
            />
          ))}
        </ul>
      )}
    </>
  );
}

interface WireSourceProps {
  marketId: string;
  pollInterval: number;
  onTrades: (marketId: string, trades: TradeEntry[]) => void;
}

/**
 * Invisible subscription pump for a single market's trade history.
 * Renders nothing — its job is to subscribe via `useTradeHistory` and
 * push the resulting list up to the merger whenever it changes. Using
 * one child per source keeps each subscription independent (so a
 * single market erroring out doesn't kill the rest of the feed) and
 * lets the SDK cache deduplicate across the rest of the app for free.
 */
function WireSource({ marketId, pollInterval, onTrades }: WireSourceProps) {
  const { trades } = useTradeHistory(marketId, {
    limit: 20,
    pollInterval,
  });

  useEffect(() => {
    if (trades) onTrades(marketId, trades);
  }, [trades, marketId, onTrades]);

  return null;
}

interface WireRowProps {
  trade: TradeEntry;
  market: MarketState;
  compact: boolean;
}

function WireRow({ trade, market, compact }: WireRowProps) {
  const units = market.xAxisUnits ?? '';
  const range = market.config.upperBound - market.config.lowerBound;
  // Rarity hint: how contrarian is this trade against current
  // consensus? We compute potentialRarity (the OPTIMISTIC tier the
  // trader could earn if they end up close to the truth).
  const rarity: Rarity | null = useMemo(() => {
    if (trade.prediction == null) return null;
    return potentialRarity({
      prediction: trade.prediction,
      consensusMean: market.consensusMean ?? null,
      lowerBound: market.config.lowerBound,
      upperBound: market.config.upperBound,
    });
  }, [trade.prediction, market.consensusMean, market.config.lowerBound, market.config.upperBound]);

  const tierColor = rarity ? TIER_META[rarity].color : palette.inkFade;
  const verb = trade.side === 'buy' ? 'BOUGHT' : 'SOLD';
  const verbColor = trade.side === 'buy' ? palette.jade : palette.rose;
  const ago = relativeTime(trade.timestamp);

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: compact ? '6px 4px' : '8px 6px',
        borderTop: `1px solid ${palette.rulesoft}`,
        fontFamily: fonts.body,
        fontSize: compact ? 13 : 14,
        color: palette.ink,
        animation: 'conviction-fade-in 220ms ease-out',
      }}
    >
      {/* Rarity hint dot — colours the row by tier. */}
      <span
        aria-hidden="true"
        title={rarity ? `Could earn ${TIER_META[rarity].label}` : 'Aligned with consensus'}
        style={{
          flex: '0 0 auto',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tierColor,
          boxShadow:
            rarity && rarity !== 'common'
              ? `0 0 8px ${tierColor}, 0 0 2px ${tierColor}`
              : 'none',
        }}
      />
      <Link
        to={`/u/${encodeURIComponent(trade.username)}`}
        style={{
          fontFamily: fonts.mono,
          fontSize: compact ? 11.5 : 12.5,
          color: palette.inkSoft,
          textDecoration: 'none',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          maxWidth: compact ? 88 : 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        @{trade.username}
      </Link>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: compact ? 10 : 11,
          letterSpacing: 1.1,
          color: verbColor,
          fontWeight: 700,
        }}
      >
        {verb}
      </span>
      {trade.prediction != null && (
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: compact ? 11.5 : 12.5,
            color: palette.ink,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {formatPrediction(trade.prediction, range)} {units}
        </span>
      )}
      <Link
        to={`/m/${encodeURIComponent(String(market.marketId))}`}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          color: palette.inkSoft,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        “{market.title}”
      </Link>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          color: palette.inkMute,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
        }}
      >
        ${formatAmount(trade.amount)}
      </span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10.5,
          color: palette.inkFade,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          minWidth: 44,
          textAlign: 'right',
        }}
      >
        {ago}
      </span>
    </li>
  );
}

function tradesMatch(a: TradeEntry[], b: TradeEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

function relativeTime(ts: string): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatPrediction(v: number, range: number): string {
  // Choose precision proportional to the range so a 0-1 market shows
  // two decimals while a 0-1000 market shows whole numbers.
  if (!Number.isFinite(v)) return '—';
  const precision = range >= 100 ? 0 : range >= 10 ? 1 : 2;
  return v.toFixed(precision);
}

function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}
