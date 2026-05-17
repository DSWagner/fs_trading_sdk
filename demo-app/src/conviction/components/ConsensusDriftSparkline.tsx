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
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="Consensus drift sparkline"
          style={{ flex: '0 0 auto', maxWidth: '100%' }}
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
          {/* End dot in drift colour. During replay it tracks the most
              recently played snapshot, not the latest snapshot, so the
              dot reads as the "playhead" moving along the curve. */}
          <PlayheadDot
            points={points}
            playProgress={playProgress}
            tMin={tMin}
            tSpan={tSpan}
            meanMin={meanMin}
            ySpan={ySpan}
            padL={padL}
            padT={padT}
            plotW={plotW}
            plotH={plotH}
            color={driftColor}
          />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              letterSpacing: 1.2,
              color: palette.inkMute,
            }}
          >
            DRIFT SINCE FIRST SNAPSHOT
          </span>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: compact ? 16 : 20,
              fontWeight: 700,
              color: driftColor,
              letterSpacing: -0.3,
            }}
          >
            {drift >= 0 ? '+' : ''}
            {drift.toFixed(2)} {marketUnits}
          </span>
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              color: palette.inkMute,
              lineHeight: 1.4,
              maxWidth: 220,
            }}
          >
            {points.length} snapshots tracked · last
            {' '}
            {Math.max(1, Math.round((Date.now() - last.t) / 60000))}m ago
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
 * Playhead dot. During replay it tracks the interpolated position
 * between the last fully-played snapshot and the next one. After
 * replay (or when the user hasn't started one), it sits on the
 * latest snapshot. The visual cue is what makes the replay read as
 * "the crowd's mind moving" rather than just a path drawing in.
 */
function PlayheadDot({
  points,
  playProgress,
  tMin,
  tSpan,
  meanMin,
  ySpan,
  padL,
  padT,
  plotW,
  plotH,
  color,
}: {
  points: Array<{ t: number; mean: number }>;
  playProgress: number;
  tMin: number;
  tSpan: number;
  meanMin: number;
  ySpan: number;
  padL: number;
  padT: number;
  plotW: number;
  plotH: number;
  color: string;
}) {
  const cursor = pickCursor(points, playProgress);
  const cx = padL + ((cursor.t - tMin) / tSpan) * plotW;
  const cy = padT + (1 - (cursor.mean - meanMin) / ySpan) * plotH;
  return <circle cx={cx} cy={cy} r={3.4} fill={color} />;
}

function pickCursor(
  points: Array<{ t: number; mean: number }>,
  progress: number,
): { t: number; mean: number } {
  const safe = Math.max(0, Math.min(1, progress));
  if (points.length === 0) return { t: 0, mean: 0 };
  if (safe >= 1) return points[points.length - 1];
  const cursorIndex = safe * (points.length - 1);
  const lo = Math.floor(cursorIndex);
  const hi = Math.min(points.length - 1, lo + 1);
  const t = cursorIndex - lo;
  const a = points[lo];
  const b = points[hi];
  return {
    t: a.t + (b.t - a.t) * t,
    mean: a.mean + (b.mean - a.mean) * t,
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
