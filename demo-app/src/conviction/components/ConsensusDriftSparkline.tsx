import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketHistory } from '@functionspace/react';
import { transformHistoryToFanChart } from '@functionspace/core';
import { palette, fonts } from '../theme';

/**
 * Consensus Drift Sparkline.
 *
 * The receipt page already shows a single-snapshot live consensus
 * card. This component goes one level deeper: it asks the engine for
 * the FULL market history (via `useMarketHistory`), transforms the
 * snapshots into a time series with `transformHistoryToFanChart`
 * (a pure helper exported from `@functionspace/core`), and renders a
 * compact sparkline of the consensus mean over time.
 *
 * The result is a small "movie" of how the crowd has changed its mind
 * since the user signed their conviction — exactly the kind of
 * editorial visual that turns the receipt from a static screenshot
 * into a living artefact. We overlay:
 *   - the user's prediction (horizontal dashed line)
 *   - the consensus-at-bet snapshot (small notch on the timeline)
 *   - "you signed here" caret if we can position it temporally
 *
 * Polling is intentionally slow (60 s). The fast-cadence drift card
 * already covers the immediate live feel; this sparkline is the
 * macro-historical accompaniment.
 *
 * Renders inline as a horizontally laid-out card section — designed
 * to slot into the Receipt page just below the live consensus card.
 */

export interface ConsensusDriftSparklineProps {
  marketId: string;
  /** The user's prediction; rendered as a horizontal reference line. */
  prediction: number;
  /** The consensus mean at the moment the user signed. */
  consensusAtBet: number | null;
  lowerBound: number;
  upperBound: number;
  marketUnits: string;
  /** ISO timestamp of the original bet. Drives the "signed here" caret. */
  createdAt: string;
  /** Compact mode for embeds. */
  compact?: boolean;
  /**
   * When false, the component renders nothing AND skips the SDK history
   * fetch + 60s poll. Used by the Receipt page for curated demo bets
   * whose market IDs are not real engine markets and would 422 forever.
   */
  enabled?: boolean;
}

interface DriftSeries {
  points: Array<{ t: number; mean: number }>;
  tMin: number;
  tMax: number;
  meanMin: number;
  meanMax: number;
}

export function ConsensusDriftSparkline({
  marketId,
  prediction,
  consensusAtBet,
  lowerBound,
  upperBound,
  marketUnits,
  createdAt,
  compact = false,
  enabled = true,
}: ConsensusDriftSparklineProps) {
  // Pull the last 200 snapshots, polled once a minute. The fast-cadence
  // drift card next door already handles the immediate live feel;
  // this view is the macro-historical accompaniment, so a slow poll
  // is fine and keeps the engine cost minimal.
  //
  // `enabled: false` short-circuits both the initial fetch and the
  // poll, so demo market IDs (which 422 forever) stay silent.
  const { history, loading, error } = useMarketHistory(marketId, {
    limit: 200,
    pollInterval: enabled ? 60_000 : 0,
    enabled,
  });

  // Replay state. `playProgress` is in [0, 1]: 0 means "show nothing",
  // 1 means "show the full path." We also remember whether we're
  // actively playing so the toggle button reads Play / Pause correctly.
  // Both default to "full path, idle" so the static view is unchanged
  // from before the replay feature shipped.
  const [playProgress, setPlayProgress] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);

  // Hover state. `hoverProgress` is the cursor's progress along the
  // time axis [0, 1], or null when the user is not currently hovering
  // the chart. Hover takes precedence over replay for the headline
  // readout: if the user is dragging their mouse across the chart we
  // show the value AT THE CURSOR, even mid-replay, because that's
  // the immediate feedback they're asking for.
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Total replay duration in ms. Tuned so even a market with a
  // ridiculously long history (200 snapshots) replays in 5 seconds —
  // long enough to read as a "movie", short enough to not feel slow.
  const REPLAY_MS = 4800;

  // The animation loop. Reads the current timestamp on each rAF tick,
  // converts elapsed-since-start into [0, 1] progress, and ends when
  // progress reaches 1. Pausing freezes progress at its current value.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    playStartRef.current = performance.now() - playProgress * REPLAY_MS;
    const tick = (now: number) => {
      const start = playStartRef.current ?? now;
      const elapsed = now - start;
      const next = Math.min(1, elapsed / REPLAY_MS);
      setPlayProgress(next);
      if (next >= 1) {
        setIsPlaying(false);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // We deliberately omit `playProgress` from the dep array — it
    // updates every frame, and including it would tear down the rAF
    // loop on every tick. Only the start/stop intent (isPlaying) matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const startReplay = () => {
    setPlayProgress(0);
    setIsPlaying(true);
  };
  const pauseReplay = () => {
    setIsPlaying(false);
  };

  const series: DriftSeries | null = useMemo(() => {
    if (!history?.snapshots?.length) return null;
    const fan = transformHistoryToFanChart(history.snapshots, lowerBound, upperBound, 200);
    if (fan.length < 2) return null;
    const points = fan.map((p) => ({ t: p.timestamp, mean: p.mean }));
    let tMin = Infinity;
    let tMax = -Infinity;
    let meanMin = Infinity;
    let meanMax = -Infinity;
    for (const p of points) {
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
      if (p.mean < meanMin) meanMin = p.mean;
      if (p.mean > meanMax) meanMax = p.mean;
    }
    // Pad the y range with the user's prediction + the bet-time
    // consensus so all reference marks are inside the rendered band.
    if (Number.isFinite(prediction)) {
      meanMin = Math.min(meanMin, prediction);
      meanMax = Math.max(meanMax, prediction);
    }
    if (consensusAtBet != null && Number.isFinite(consensusAtBet)) {
      meanMin = Math.min(meanMin, consensusAtBet);
      meanMax = Math.max(meanMax, consensusAtBet);
    }
    // 5% top/bottom padding so the trace doesn't kiss the frame.
    const yPad = Math.max((meanMax - meanMin) * 0.08, (upperBound - lowerBound) * 0.005);
    meanMin -= yPad;
    meanMax += yPad;
    return { points, tMin, tMax, meanMin, meanMax };
  }, [history, lowerBound, upperBound, prediction, consensusAtBet]);

  const w = compact ? 280 : 460;
  const h = compact ? 72 : 92;
  const padL = 10;
  const padR = 10;
  const padT = 10;
  const padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Full path covering every snapshot. Always computed so we can use
  // it as the "ghost" trace behind the replay.
  const fullPath = useMemo(() => {
    if (!series) return '';
    const { points, tMin, tMax, meanMin, meanMax } = series;
    const tSpan = Math.max(1, tMax - tMin);
    const ySpan = Math.max(0.0001, meanMax - meanMin);
    let d = '';
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = padL + ((p.t - tMin) / tSpan) * plotW;
      const y = padT + (1 - (p.mean - meanMin) / ySpan) * plotH;
      d += `${i === 0 ? 'M' : ' L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  }, [series, plotH, plotW]);

  // Partial path covering only the snapshots already "played." Used
  // as the foreground trace during replay. When playProgress === 1
  // this exactly matches fullPath, so the static view is byte-identical
  // to the pre-replay implementation.
  const playedPath = useMemo(() => {
    if (!series) return '';
    const { points, tMin, tMax, meanMin, meanMax } = series;
    const tSpan = Math.max(1, tMax - tMin);
    const ySpan = Math.max(0.0001, meanMax - meanMin);
    const visibleCount = Math.max(2, Math.round(points.length * playProgress));
    let d = '';
    for (let i = 0; i < visibleCount; i++) {
      const p = points[i];
      const x = padL + ((p.t - tMin) / tSpan) * plotW;
      const y = padT + (1 - (p.mean - meanMin) / ySpan) * plotH;
      d += `${i === 0 ? 'M' : ' L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  }, [series, plotH, plotW, playProgress]);

  if (!enabled) return null;

  if (loading && !series) {
    return (
      <ShellCard compact={compact}>
        <Header />
        <div
          data-testid="drift-sparkline-loading"
          style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute, letterSpacing: 1.1, padding: '10px 4px' }}
        >
          PULLING MARKET HISTORY…
        </div>
      </ShellCard>
    );
  }
  if (error && !series) {
    return (
      <ShellCard compact={compact}>
        <Header />
        <div style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkMute, padding: '10px 4px' }}>
          Could not load history right now.
        </div>
      </ShellCard>
    );
  }
  if (!series) {
    return (
      <ShellCard compact={compact}>
        <Header />
        <div style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkMute, padding: '10px 4px' }}>
          The market has only one snapshot so far — drift will appear after the next trade.
        </div>
      </ShellCard>
    );
  }

  const { points, tMin, tMax, meanMin, meanMax } = series;
  const tSpan = Math.max(1, tMax - tMin);
  const ySpan = Math.max(0.0001, meanMax - meanMin);

  const last = points[points.length - 1];
  const first = points[0];
  const drift = last.mean - first.mean;
  const driftPct = Math.abs(drift) / Math.max(0.0001, upperBound - lowerBound);

  // Cursor progress = where the readout / hairline / dot are pinned.
  // Priority: hover > active replay > resting at "latest snapshot".
  // The user's complaint was that the chart had NO value readout
  // during replay or hover. Cursor progress now drives the headline
  // value so both interactions surface a live number.
  const cursorProgress: number =
    hoverProgress != null
      ? hoverProgress
      : isPlaying || playProgress < 1
        ? playProgress
        : 1;
  const cursorMode: 'hover' | 'replay' | 'latest' =
    hoverProgress != null ? 'hover' : isPlaying || playProgress < 1 ? 'replay' : 'latest';
  const cursor = pickCursor(points, cursorProgress);
  const cursorX = padL + ((cursor.t - tMin) / tSpan) * plotW;

  const fromBet = consensusAtBet != null ? cursor.mean - consensusAtBet : null;
  const cursorAgeMs = Math.max(0, Date.now() - cursor.t);
  // Format milliseconds into a friendly "Xm ago / Xh ago / Xd ago"
  // bucket so the time delta is human-readable at every scale.
  const formatAge = (ms: number): string => {
    if (ms < 60_000) return 'just now';
    const minutes = Math.round(ms / 60_000);
    if (minutes < 90) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };
  // Format a market value with sensible decimal precision based on
  // the market's absolute scale. Sub-1 markets get 3 decimals
  // (e.g. probability markets), 1..1000 gets 2, larger gets none.
  const formatValue = (v: number): string => {
    const abs = Math.abs(v);
    if (abs < 1) return v.toFixed(3);
    if (abs < 1000) return v.toFixed(2);
    if (abs < 1_000_000) return v.toFixed(0);
    if (abs < 1_000_000_000) return (v / 1_000_000).toFixed(2) + ' Million';
    return (v / 1_000_000_000).toFixed(2) + ' Billion';
  };

  // Map a clientX coordinate to a cursor progress in [0, 1] across
  // the SVG's plot area. Used by mouse / touch handlers below.
  const computeProgressFromPointer = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    // Map clientX to viewBox X. The SVG uses preserveAspectRatio
    // default (xMidYMid meet), so the viewBox scales uniformly.
    // For our use case, viewBox width === w === bounding-rect width
    // (the SVG renders at intrinsic size), so the ratio is direct.
    const localX = ((clientX - rect.left) / rect.width) * w;
    const tx = (localX - padL) / plotW;
    return Math.max(0, Math.min(1, tx));
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = computeProgressFromPointer(e.clientX);
    if (p != null) setHoverProgress(p);
  };
  const onPointerLeave = () => {
    setHoverProgress(null);
  };

  // Replay: animate the consensus path being drawn from t=0 to the
  // present. The slider value is "how many points of the time series
  // have been drawn so far," from 0 to points.length. When the user
  // clicks Play, we kick off a requestAnimationFrame loop that
  // increments this counter at ~one point every (DURATION/points)
  // ms so the full timeline replays over DURATION ms regardless of
  // snapshot count. Clicking Pause halts the animation in place;
  // clicking the rendered SVG also pauses (acts as a scrub
  // intercept).
  //
  // We split the consensus path into two visible layers during
  // replay: the "played" portion in ink colour, and the "future"
  // portion in inkFade so the user can see the whole arc the replay
  // is travelling along. After playback completes, both layers
  // collapse into a single dark trace.


  const predictionY = padT + (1 - (prediction - meanMin) / ySpan) * plotH;
  const consensusY =
    consensusAtBet != null ? padT + (1 - (consensusAtBet - meanMin) / ySpan) * plotH : null;

  // "Signed here" caret on the X axis. We anchor it to the snapshot
  // closest to createdAt; if the user signed BEFORE the first
  // snapshot we still cap at tMin so the caret stays inside the frame.
  const betT = new Date(createdAt).getTime();
  const clampedBetT = Math.min(Math.max(betT, tMin), tMax);
  const betX = padL + ((clampedBetT - tMin) / tSpan) * plotW;

  const driftColor =
    driftPct < 0.005
      ? palette.inkMute
      : (drift > 0) === (prediction > (consensusAtBet ?? first.mean))
        ? palette.jade
        : palette.rose;

  return (
    <ShellCard compact={compact}>
      <Header />
      <div
        data-testid="drift-sparkline"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 10 : 14,
          flexWrap: 'wrap',
        }}
      >
        <svg
          ref={svgRef}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="Consensus drift sparkline"
          style={{ flex: '0 0 auto', maxWidth: '100%', cursor: 'crosshair', touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerMove}
        >
          {/* y guide: prediction reference line */}
          <line
            x1={padL}
            x2={w - padR}
            y1={predictionY}
            y2={predictionY}
            stroke={palette.ember}
            strokeOpacity={0.55}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          {/* y guide: consensus-at-bet horizontal hairline */}
          {consensusY != null && (
            <line
              x1={padL}
              x2={w - padR}
              y1={consensusY}
              y2={consensusY}
              stroke={palette.teal}
              strokeOpacity={0.35}
              strokeDasharray="1 3"
              strokeWidth={1}
            />
          )}
          {/* "signed here" vertical caret */}
          <line
            x1={betX}
            x2={betX}
            y1={padT}
            y2={h - padB + 4}
            stroke={palette.inkFade}
            strokeWidth={1}
          />
          <polygon
            points={`${betX - 3},${h - padB + 4} ${betX + 3},${h - padB + 4} ${betX},${h - padB - 1}`}
            fill={palette.inkFade}
          />
          {/* Ghost trace (full path, faded). Always painted underneath
              so the user can see the full arc the replay is travelling
              along. Becomes invisible-by-overlap once the replay
              finishes (playedPath === fullPath). */}
          <path
            d={fullPath}
            fill="none"
            stroke={palette.inkFade}
            strokeWidth={1}
            strokeOpacity={isPlaying || playProgress < 1 ? 0.55 : 0}
            strokeLinejoin="round"
          />
          {/* Played trace — the foreground darkening that grows during
              replay. With playProgress === 1 this equals fullPath, so
              the rendered visual is identical to the pre-replay
              implementation. */}
          <path
            d={playedPath}
            fill="none"
            stroke={palette.ink}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
          {/* Cursor hairline: vertical reference line at the
              currently-pinned cursor X. Visible whenever the user
              is hovering OR a replay is mid-flight. Hidden when the
              cursor is just resting on the latest snapshot, because
              then the end-dot already marks the position and the
              extra line would be visual noise. */}
          {(cursorMode === 'hover' || cursorMode === 'replay') && (
            <line
              x1={cursorX}
              x2={cursorX}
              y1={padT}
              y2={h - padB + 2}
              stroke={cursorMode === 'hover' ? palette.ember : palette.teal}
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray={cursorMode === 'hover' ? '2 2' : undefined}
              pointerEvents="none"
            />
          )}
          {/* End dot in drift colour. Tracks the cursor (hover OR
              replay playhead OR latest snapshot) so the dot, the
              hairline, and the headline value all agree on a single
              "currently-pinned point in time." */}
          <CursorDot
            cx={cursorX}
            cy={padT + (1 - (cursor.mean - meanMin) / ySpan) * plotH}
            color={cursorMode === 'hover' ? palette.ember : driftColor}
            highlighted={cursorMode !== 'latest'}
          />
        </svg>
        <div
          data-testid="drift-readout"
          style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200 }}
        >
          {/* Contextual eyebrow: tells the user WHAT the headline
              number below means (live latest / hover sample /
              replay playhead). The colour matches the cursor's
              hairline / dot so the chart and the readout read as a
              single coordinated overlay. */}
          <span
            data-testid="drift-readout-label"
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              letterSpacing: 1.4,
              color:
                cursorMode === 'hover'
                  ? palette.ember
                  : cursorMode === 'replay'
                    ? palette.teal
                    : palette.inkMute,
            }}
          >
            {cursorMode === 'hover'
              ? 'AT CURSOR'
              : cursorMode === 'replay'
                ? `REPLAYING · ${Math.round(cursorProgress * 100)}%`
                : 'LATEST CONSENSUS'}
          </span>
          {/* Headline: the consensus mean at the currently-pinned
              cursor position. Updates LIVE during hover and during
              replay so the user can read the actual value at any
              point on the timeline. */}
          <span
            data-testid="drift-readout-value"
            style={{
              fontFamily: fonts.display,
              fontSize: compact ? 18 : 22,
              fontWeight: 700,
              color:
                cursorMode === 'hover'
                  ? palette.ember
                  : cursorMode === 'replay'
                    ? palette.teal
                    : palette.ink,
              letterSpacing: -0.3,
            }}
          >
            {formatValue(cursor.mean)}{marketUnits ? ` ${marketUnits}` : ''}
          </span>
          {/* Subline: when this snapshot was, and (when known) how
              far it is from the consensus at bet time. Replaces
              the previous "200 snapshots tracked" line with
              something the user can act on. */}
          <span
            data-testid="drift-readout-context"
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              color: palette.inkMute,
              lineHeight: 1.4,
              maxWidth: 220,
            }}
          >
            {formatAge(cursorAgeMs)}
            {fromBet != null && (
              <>
                {' · '}
                <span style={{ color: fromBet === 0 ? palette.inkMute : (fromBet > 0 ? palette.jade : palette.rose) }}>
                  {fromBet >= 0 ? '+' : ''}
                  {formatValue(fromBet)}
                  {' from your bet-time consensus'}
                </span>
              </>
            )}
          </span>
          {/* Total drift summary -- kept as a secondary stat so the
              user can still see the macro trajectory at a glance. */}
          <span
            data-testid="drift-total"
            style={{
              fontFamily: fonts.mono,
              fontSize: 10.5,
              letterSpacing: 1,
              color: palette.inkFade,
              marginTop: 2,
            }}
          >
            TOTAL DRIFT{' '}
            <span style={{ color: driftColor, fontWeight: 600 }}>
              {drift >= 0 ? '+' : ''}
              {formatValue(drift)}
              {marketUnits ? ` ${marketUnits}` : ''}
            </span>
            {' · '}
            {points.length} snapshots
          </span>
          {/* Replay control. Only shown when there are at least 3
              snapshots — anything shorter replays instantly and the
              button reads as noise. */}
          {points.length >= 3 && (
            <button
              type="button"
              onClick={isPlaying ? pauseReplay : startReplay}
              data-testid="drift-replay-button"
              aria-pressed={isPlaying}
              style={{
                marginTop: 6,
                alignSelf: 'flex-start',
                padding: '6px 12px',
                background: 'transparent',
                color: palette.ember,
                border: `1px solid ${palette.ember}`,
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: fonts.mono,
                fontSize: 10.5,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontWeight: 600,
                transition: 'background 160ms ease, color 160ms ease',
              }}
            >
              {isPlaying
                ? `Pause · ${Math.round(playProgress * 100)}%`
                : playProgress < 1
                  ? `Resume · ${Math.round(playProgress * 100)}%`
                  : '▸ Replay the drift'}
            </button>
          )}
        </div>
      </div>
    </ShellCard>
  );
}

/**
 * Cursor dot. Marks the point on the consensus path that the
 * headline readout, the hairline, and the timeline are all
 * referring to. Three states:
 *   - "hover": user is dragging their pointer across the chart;
 *     the dot follows the pointer and the dot grows slightly to
 *     reinforce the live-feedback feel.
 *   - "replay": the dot tracks the interpolated playhead position
 *     between the last fully-played snapshot and the next.
 *   - "latest": the dot rests on the latest snapshot, marking
 *     where the live trace ends.
 */
function CursorDot({
  cx,
  cy,
  color,
  highlighted,
}: {
  cx: number;
  cy: number;
  color: string;
  highlighted: boolean;
}) {
  const r = highlighted ? 4.6 : 3.4;
  return (
    <>
      {highlighted && (
        <circle cx={cx} cy={cy} r={r + 3} fill={color} fillOpacity={0.18} pointerEvents="none" />
      )}
      <circle cx={cx} cy={cy} r={r} fill={color} pointerEvents="none" />
    </>
  );
}

function pickCursor(
  points: Array<{ t: number; mean: number }>,
  progress: number,
): { t: number; mean: number } {
  if (!points || points.length === 0) return { t: 0, mean: 0 };
  const safe = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1));
  if (points.length === 1) return points[0];
  if (safe >= 1) return points[points.length - 1];
  if (safe <= 0) return points[0];
  const cursorIndex = safe * (points.length - 1);
  const lo = Math.max(0, Math.min(points.length - 1, Math.floor(cursorIndex)));
  const hi = Math.max(0, Math.min(points.length - 1, lo + 1));
  // Defensive: if the array is sparse or arithmetic produces an
  // out-of-range index for any reason, fall back to the nearest
  // valid endpoint instead of crashing the render. (jsdom test
  // environments without a real SVG layout occasionally hit this
  // path with a synthetic pointer event before the series settles.)
  const a = points[lo] ?? points[0];
  const b = points[hi] ?? a;
  if (!a || !b) return { t: 0, mean: 0 };
  const frac = cursorIndex - lo;
  return {
    t: a.t + (b.t - a.t) * frac,
    mean: a.mean + (b.mean - a.mean) * frac,
  };
}

function Header() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10.5,
          letterSpacing: 1.5,
          color: palette.teal,
          fontWeight: 600,
        }}
      >
        CONSENSUS DRIFT · MACRO
      </span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          letterSpacing: 1,
          color: palette.inkFade,
        }}
      >
        useMarketHistory
      </span>
    </div>
  );
}

function ShellCard({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  return (
    <section
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 8,
        padding: compact ? '12px 14px' : '14px 18px',
        marginBottom: 16,
      }}
    >
      {children}
    </section>
  );
}
