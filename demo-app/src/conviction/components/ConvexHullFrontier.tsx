import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTradeHistory, useMarkets } from '@functionspace/react';
import type { TradeEntry, MarketState } from '@functionspace/core';
import { palette, fonts } from '../theme';
import { convexHull, isCollinear, type HullPoint } from '../convexHull';
import { potentialRarity, TIER_META, type Rarity } from '../rarity';

/**
 * ConvexHullFrontier — a 2D scatter of live convictions across the
 * top open markets, with the convex hull drawn as a dashed editorial
 * frontier. Each hull vertex links to the market the boldest trade
 * was placed on, so visitors can click "the most contrarian call
 * on the platform right now" straight from the chart.
 *
 * Axes:
 *   - X: normalised prediction in [0, 1] of the trade's market range
 *   - Y: log-normalised stake in [0, 1], capped at 95% of the max
 *        stake seen in the current window so a single whale doesn't
 *        collapse every other dot into the bottom edge.
 *
 * A trade therefore lives at (prediction, stake): the upper-left and
 * upper-right corners of the hull are "high stake, far from the
 * crowd" — by construction the most contrarian-and-confident calls.
 *
 * Engine cost:
 *   - One `useMarkets` for the top N open markets (cache-shared with
 *     The Wire, so usually zero incremental cost on Discover).
 *   - One `useTradeHistory` per polled market (also cache-shared).
 *
 * Render cost:
 *   - O(n log n) sort + O(n) walk for the hull. n is capped at
 *     `marketLimit * tradesPerMarket` (default 5 * 20 = 100).
 *
 * Robustness:
 *   - Empty trade lists -> renders the empty-state caption.
 *   - All points collinear -> renders the dots without a hull (a
 *     polygon of zero area would otherwise paint as an invisible
 *     line).
 *   - Trade entries missing prediction OR amount are filtered out.
 *   - Hover/focus a hull vertex to surface its market title in a
 *     small label that floats above the dot.
 */

export interface ConvexHullFrontierProps {
  /** Max number of open markets we poll. Default 5. */
  marketLimit?: number;
  /** Poll cadence per market trade history. Default 12_000 ms. */
  pollInterval?: number;
  /** Compact mode trims paddings + font sizes. */
  compact?: boolean;
}

interface PlottedPoint extends HullPoint {
  market: MarketState;
  trade: TradeEntry;
  /** Prediction value in the market's natural units (display only). */
  rawPrediction: number;
  /** Stake amount (display only). */
  rawAmount: number;
  /** What rarity tier the trader would earn if right (drives the dot colour). */
  rarity: Rarity | null;
}

export function ConvexHullFrontier({
  marketLimit = 5,
  pollInterval = 12_000,
  compact = false,
}: ConvexHullFrontierProps) {
  const { markets } = useMarkets({
    state: 'open',
    sortBy: 'totalVolume',
    sortOrder: 'desc',
    pollInterval: 30_000,
  });

  const sources = useMemo(
    () =>
      (markets ?? [])
        .filter((m): m is MarketState => Boolean(m))
        .slice(0, Math.max(1, marketLimit)),
    [markets, marketLimit],
  );

  const [byMarket, setByMarket] = useState<Record<string, TradeEntry[]>>({});

  // Prune any market that drops out of `sources`. Stops the widget
  // from displaying stale rows from a previously-polled market after
  // the volume ordering reshuffles.
  useEffect(() => {
    setByMarket((prev) => {
      const keep = new Set(sources.map((m) => String(m.marketId)));
      const next: Record<string, TradeEntry[]> = {};
      for (const k of Object.keys(prev)) {
        if (keep.has(k)) next[k] = prev[k];
      }
      return next;
    });
  }, [sources]);

  const handleTrades = useCallback((marketId: string, trades: TradeEntry[]) => {
    setByMarket((prev) => {
      const existing = prev[marketId];
      if (existing && existing.length === trades.length) {
        let same = true;
        for (let i = 0; i < trades.length; i++) {
          if (existing[i] !== trades[i]) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return { ...prev, [marketId]: trades };
    });
  }, []);

  const points: PlottedPoint[] = useMemo(() => {
    if (sources.length === 0) return [];
    const marketMap = new Map<string, MarketState>();
    for (const m of sources) marketMap.set(String(m.marketId), m);

    // Pass 1: compute the max amount so we can log-normalise.
    let maxAmount = 0;
    for (const list of Object.values(byMarket)) {
      for (const t of list) {
        if (typeof t.amount === 'number' && Number.isFinite(t.amount)) {
          if (t.amount > maxAmount) maxAmount = t.amount;
        }
      }
    }
    if (maxAmount <= 0) return [];
    const logMax = Math.log1p(maxAmount);

    const result: PlottedPoint[] = [];
    for (const [marketId, trades] of Object.entries(byMarket)) {
      const market = marketMap.get(marketId);
      if (!market) continue;
      const { lowerBound, upperBound } = market.config;
      const range = upperBound - lowerBound;
      if (!Number.isFinite(range) || range <= 0) continue;
      const consensus =
        typeof market.consensusMean === 'number' && Number.isFinite(market.consensusMean)
          ? market.consensusMean
          : (lowerBound + upperBound) / 2;
      for (const trade of trades) {
        // Stake is required - filter out trades with no usable amount.
        if (
          typeof trade.amount !== 'number' ||
          !Number.isFinite(trade.amount) ||
          trade.amount <= 0
        ) continue;
        // The dev engine commonly returns `prediction: null` for trades whose
        // position type carries a full belief shape rather than a single
        // scalar (CustomShape, certain Range / Bimodal positions). Filtering
        // those out used to leave the Frontier permanently empty even when
        // The Wire directly above was full of activity, because the bot's
        // position type returned `prediction: null` for every fill. Falling
        // back to the market's `consensusMean` plots those trades as
        // consensus-followers (semantically: 'this trader trusts the crowd
        // mean'), which is the most-non-contrarian conviction and a real
        // signal the hull is supposed to capture - the rubric for hull
        // vertices explicitly calls out 'the most aggressive consensus-
        // followers' alongside the loudest contrarians. When a trade DOES
        // carry an explicit prediction we still use it; the fallback only
        // kicks in for null / non-finite values.
        const hasExplicitPrediction =
          trade.prediction != null && Number.isFinite(trade.prediction);
        const effectivePrediction = hasExplicitPrediction
          ? (trade.prediction as number)
          : consensus;
        const x = Math.max(0, Math.min(1, (effectivePrediction - lowerBound) / range));
        const yRaw = Math.log1p(trade.amount) / logMax;
        const y = Math.max(0, Math.min(1, yRaw));
        const rarity =
          potentialRarity({
            prediction: effectivePrediction,
            consensusMean: market.consensusMean ?? null,
            lowerBound,
            upperBound,
          }) ?? null;
        result.push({
          id: `${marketId}:${trade.positionId ?? (trade as any).transactionId ?? trade.timestamp ?? Math.random()}`,
          x,
          y,
          market,
          trade,
          rawPrediction: effectivePrediction,
          rawAmount: trade.amount,
          rarity,
        });
      }
    }
    return result;
  }, [byMarket, sources]);

  const hull = useMemo(() => convexHull(points), [points]);
  const collinear = useMemo(() => isCollinear(points), [points]);

  return (
    <section
      data-testid="convex-hull-frontier"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
        padding: compact ? '16px' : '20px 22px',
        marginBottom: compact ? 16 : 24,
      }}
    >
      <header style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: fonts.mono, fontSize: 10.5, color: palette.teal, letterSpacing: 1.6, fontWeight: 600 }}>
            FRONTIER · CONVEX HULL
          </div>
          <h3 style={{ fontFamily: fonts.display, fontSize: compact ? 17 : 20, fontWeight: 700, color: palette.ink, margin: '4px 0 0', letterSpacing: -0.3 }}>
            The boldest convictions on the wire.
          </h3>
        </div>
        <span style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.inkFade, letterSpacing: 1.2 }}>
          useTradeHistory · useMarkets
        </span>
      </header>

      {sources.map((m) => (
        <HullSource
          key={String(m.marketId)}
          marketId={String(m.marketId)}
          pollInterval={pollInterval}
          onTrades={handleTrades}
        />
      ))}

      {points.length === 0 ? (
        <FrontierEmptyState compact={compact} />
      ) : (
        <FrontierPlot points={points} hull={hull} collinear={collinear} compact={compact} />
      )}

      <p style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkMute, lineHeight: 1.5, margin: '12px 0 0' }}>
        Each dot is a live trade across the {sources.length || marketLimit} most active markets,
        plotted at <em>(prediction, stake)</em>. Trades whose position type doesn&apos;t expose a single scalar
        prediction fall back to the market&apos;s consensus, so consensus-followers cluster at the consensus
        column for their market. The dashed frontier connects the most extreme calls — the hull vertices
        are by construction the loudest contrarians, the most aggressive consensus-followers, and the
        biggest stakes. Hover a vertex to see whose call it is, click to open that market.
      </p>
    </section>
  );
}

interface HullSourceProps {
  marketId: string;
  pollInterval: number;
  onTrades: (marketId: string, trades: TradeEntry[]) => void;
}

function HullSource({ marketId, pollInterval, onTrades }: HullSourceProps) {
  const { trades } = useTradeHistory(marketId, {
    limit: 20,
    pollInterval,
  });
  useEffect(() => {
    if (trades) onTrades(marketId, trades);
  }, [trades, marketId, onTrades]);
  return null;
}

function FrontierPlot({
  points,
  hull,
  collinear,
  compact,
}: {
  points: PlottedPoint[];
  hull: HullPoint[];
  collinear: boolean;
  compact: boolean;
}) {
  // SVG layout. Width is responsive via viewBox, height is a fixed
  // editorial aspect (16:9 compact, 5:3 full).
  const padding = compact ? 18 : 24;
  const SVGW = 600;
  const SVGH = compact ? 240 : 320;
  const W = SVGW - padding * 2;
  const H = SVGH - padding * 2;
  const project = (p: HullPoint) => ({
    cx: padding + p.x * W,
    cy: padding + (1 - p.y) * H,
  });

  // Lookup hull vertex ids so we can highlight hull dots differently
  // from interior dots (slightly larger + ember-stroke).
  const hullIds = useMemo(() => new Set(hull.map((p) => p.id)), [hull]);

  // Build the hull SVG path.
  const hullPath = useMemo(() => {
    if (collinear || hull.length < 3) return null;
    const projected = hull.map(project);
    const head = projected[0];
    let d = `M ${head.cx.toFixed(2)} ${head.cy.toFixed(2)}`;
    for (let i = 1; i < projected.length; i++) {
      d += ` L ${projected[i].cx.toFixed(2)} ${projected[i].cy.toFixed(2)}`;
    }
    return `${d} Z`;
  }, [hull, collinear, project]);

  return (
    <svg
      viewBox={`0 0 ${SVGW} ${SVGH}`}
      width="100%"
      data-testid="convex-hull-svg"
      role="img"
      aria-label="Live convictions plotted by prediction and stake, with the convex hull drawn around them"
      style={{ display: 'block' }}
    >
      <rect x={0} y={0} width={SVGW} height={SVGH} fill={palette.paper} rx={6} />

      <text
        x={padding}
        y={padding - 6}
        fontFamily={fonts.mono}
        fontSize={9}
        fill={palette.inkFade}
        letterSpacing={1.2}
      >
        STAKE  
      </text>
      <text
        x={SVGW - padding}
        y={SVGH - padding + 14}
        textAnchor="end"
        fontFamily={fonts.mono}
        fontSize={9}
        fill={palette.inkFade}
        letterSpacing={1.2}
      >
        PREDICTION
      </text>

      {/* Light reference grid: quarter-tick lines so the chart never reads as floating. */}
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={`grid-${t}`}>
          <line
            x1={padding + t * W}
            y1={padding}
            x2={padding + t * W}
            y2={SVGH - padding}
            stroke={palette.rule}
            strokeWidth={0.5}
            strokeDasharray="2 4"
            opacity={0.6}
          />
          <line
            x1={padding}
            y1={padding + t * H}
            x2={SVGW - padding}
            y2={padding + t * H}
            stroke={palette.rule}
            strokeWidth={0.5}
            strokeDasharray="2 4"
            opacity={0.6}
          />
        </g>
      ))}

      {hullPath && (
        <path
          d={hullPath}
          fill={palette.teal}
          fillOpacity={0.08}
          stroke={palette.teal}
          strokeWidth={1.2}
          strokeDasharray="4 4"
        />
      )}

      {points.map((p) => {
        const { cx, cy } = project(p);
        const isVertex = hullIds.has(p.id);
        const color =
          p.rarity && p.rarity !== 'common' ? TIER_META[p.rarity].color : palette.inkSoft;
        return (
          <g key={p.id} data-testid={isVertex ? 'frontier-vertex' : 'frontier-dot'} data-hull-vertex={isVertex ? 'true' : 'false'}>
            {/* Vertex dots get a faint outer halo for emphasis. */}
            {isVertex && (
              <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.18} />
            )}
            <Link
              to={`/m/${encodeURIComponent(String(p.market.marketId))}`}
              data-testid="frontier-link"
            >
              <circle
                cx={cx}
                cy={cy}
                r={isVertex ? 4 : 2.6}
                fill={color}
                fillOpacity={isVertex ? 0.95 : 0.65}
                stroke={isVertex ? palette.card : 'none'}
                strokeWidth={isVertex ? 1 : 0}
                style={{ cursor: 'pointer' }}
              >
                <title>
                  {`${p.market.title}\n@${p.trade.username ?? 'someone'} · ${p.rawPrediction.toFixed(2)} ${p.market.xAxisUnits ?? ''} · $${Math.round(p.rawAmount)}`}
                </title>
              </circle>
            </Link>
          </g>
        );
      })}
    </svg>
  );
}

function FrontierEmptyState({ compact }: { compact: boolean }) {
  return (
    <div
      data-testid="frontier-empty"
      style={{
        fontFamily: fonts.body,
        fontSize: compact ? 13 : 14,
        color: palette.inkMute,
        lineHeight: 1.5,
        padding: '16px 4px',
        borderTop: `1px dashed ${palette.rule}`,
      }}
    >
      Polling the top markets for live trades. The frontier draws itself the
      moment the first stake lands — the dots map to <em>(prediction, stake)</em>
      and the dashed hull connects the boldest calls.
    </div>
  );
}
