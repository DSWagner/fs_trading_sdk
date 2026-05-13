import { useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FunctionSpaceContext as _FunctionSpaceContext,
  useAuth,
  useMarket,
  useBuy,
  usePreviewPayout,
} from '@functionspace/react';

// React 18 (demo-app) vs React 19 (workspace root) types mismatch. Cast to align.
const FunctionSpaceContext = _FunctionSpaceContext as unknown as React.Context<any>;
import { ConsensusChart } from '@functionspace/ui';
import { generateGaussian, generateRange, generateBelief } from '@functionspace/core';
import type { BeliefVector, PayoutCurve } from '@functionspace/core';
import { palette, fonts } from '../theme';
import { recordBet } from '../storage';
import { AuthGate } from '../components/AuthGate';
import { Polaroid } from '../components/Polaroid';
import { useIsMobile } from '../useMediaQuery';
import { EditorialError, EditorialLoading } from '../components/EditorialState';
import { potentialRarity, TIER_META, type Rarity } from '../rarity';

type ShapeKind = 'gaussian' | 'range' | 'bimodal';

const PROMPTS = [
  'What do you know that the crowd is missing?',
  "Why is your call's confidence what it is?",
  'If wrong, what would have to be true?',
  'What evidence shaped this view?',
];

// Hard cap on the reasoning textarea length. Sized so that the
// auto-fit logic inside `ReasoningQuote` (in components/Polaroid.tsx)
// can keep the quote at a comfortable, READABLE font (12-14 px on the
// Receipt page; 10-12 px on the BetFlow preview) without ellipsizing.
// At 180 chars the quote is concise enough to scan at a glance and
// every line keeps healthy breathing room from the photo edge - even
// on a 200 px gallery thumbnail the auto-fit lands at ~9 px and the
// final line may ellipsize, which is acceptable for a thumbnail.
// The previous 240-char cap let the quote bleed past the polaroid
// frame whenever the user pasted a long single token; the new cap
// + the wrap fixes inside ReasoningQuote eliminate that case.
const MAX_REASONING_CHARS = 180;

export function BetFlowPage() {
  const navigate = useNavigate();
  const { marketId: rawId = '' } = useParams<{ marketId: string }>();
  const ctx = useContext(FunctionSpaceContext);
  const { user, isAuthenticated } = useAuth();
  const isMobile = useIsMobile();

  const marketId = decodeURIComponent(rawId);
  const { market, loading, error } = useMarket(marketId);
  const { execute: executeBuy, loading: buyLoading, error: buyError } = useBuy(marketId);
  const { execute: previewPayout } = usePreviewPayout(marketId);

  const [shape, setShape] = useState<ShapeKind>('gaussian');
  const [prediction, setPrediction] = useState<number>(0);
  const [spread, setSpread] = useState<number>(1);
  const [secondPeak, setSecondPeak] = useState<number>(0);
  const [collateral, setCollateral] = useState<number>(10);
  const [conviction, setConviction] = useState<number>(0.7);
  const [reasoning, setReasoning] = useState<string>('');
  const [payout, setPayout] = useState<PayoutCurve | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialisedRef = useRef(false);
  const ctxRef = useRef(ctx);
  const previewPayoutRef = useRef(previewPayout);

  // Measure BOTH halves of the page so we can:
  //   1. Pass the right-column width to the polaroid so it fills 50%
  //      of the page horizontally up to a 600 px cap.
  //   2. Pass the LEFT-column (form) height so the polaroid + chart
  //      shrink to fit within the form's natural height. The user
  //      explicitly asked that the two columns end at the same vertical
  //      position — no giant empty gap below the form, and no giant
  //      empty gap below the chart.
  //
  // We use CALLBACK REFS (not useEffect + plain ref) so the
  // ResizeObservers are set up the moment the target element mounts —
  // which can happen AFTER the component's first render thanks to
  // loading/error early-returns. A useEffect with `[]` deps would miss
  // that because it fires once when the element doesn't exist yet.
  const [previewColumnWidth, setPreviewColumnWidth] = useState<number>(520);
  const previewObserverRef = useRef<ResizeObserver | null>(null);
  const setPreviewColumnRef = useCallback((el: HTMLElement | null) => {
    previewObserverRef.current?.disconnect();
    previewObserverRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    setPreviewColumnWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPreviewColumnWidth(Math.floor(entry.contentRect.width));
      }
    });
    ro.observe(el);
    previewObserverRef.current = ro;
  }, []);
  const [formColumnHeight, setFormColumnHeight] = useState<number>(900);
  const formObserverRef = useRef<ResizeObserver | null>(null);
  const setFormColumnRef = useCallback((el: HTMLElement | null) => {
    formObserverRef.current?.disconnect();
    formObserverRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    setFormColumnHeight(Math.floor(el.getBoundingClientRect().height));
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFormColumnHeight(Math.floor(entry.contentRect.height));
      }
    });
    ro.observe(el);
    formObserverRef.current = ro;
  }, []);
  useEffect(() => {
    return () => {
      previewObserverRef.current?.disconnect();
      previewObserverRef.current = null;
      formObserverRef.current?.disconnect();
      formObserverRef.current = null;
    };
  }, []);
  // Chrome in the right column = header row + gap between header and
  // polaroid row + gap between polaroid row and chart. We subtract this
  // from formColumnHeight to compute the budget that the two
  // visualisations (polaroid row + chart) can share. Each gets exactly
  // half.
  //
  // The right column now hosts TWO polaroids side-by-side ("before
  // resolution" on the left, "after resolution" on the right) instead
  // of the old single polaroid with a toggle. The header was simplified
  // to a centered "LIVE PREVIEW * YOUR RECEIPT" label after the user
  // reported the toggle and the label competing for horizontal space
  // and the label getting cropped at narrower viewports.
  const RIGHT_COL_CHROME = 36 /* header row */ + 16 /* header to polaroid row gap */ + 16 /* polaroid row to chart gap */;
  // Gap between the two side-by-side polaroids.
  const POLAROID_PAIR_GAP = 12;
  // Width floor for EACH polaroid. Below this the SVG glyphs in the
  // polaroid footer become unreadable. With two polaroids side-by-side
  // the aside must be at least 2 * MIN_VISUAL_WIDTH + POLAROID_PAIR_GAP
  // wide for the layout to render at full quality; below that the
  // polaroids hit the floor and the page may scroll horizontally on
  // ultra-narrow viewports (mobile uses a separate vertical layout).
  const MIN_VISUAL_WIDTH = 180;
  // Floor on EACH polaroid's height. With MIN_VISUAL_WIDTH of 180 the
  // ratio-locked floor on a single polaroid is 270 px tall.
  const MIN_VISUAL_HEIGHT = MIN_VISUAL_WIDTH * 1.5;
  // Floor on the WHOLE right-column stack (chrome + polaroid row + chart).
  const MIN_VISUAL_TOTAL = RIGHT_COL_CHROME + 2 * MIN_VISUAL_HEIGHT;
  // heightDerivedVisualWidth: the largest polaroid width such that
  // polaroid row + chart both fit inside the form's natural height.
  // Each row gets exactly half the visual budget (formColumnHeight -
  // chrome), and the polaroid row height = polaroidWidth * 1.5.
  const heightDerivedVisualHeight = Math.max(MIN_VISUAL_HEIGHT, (formColumnHeight - RIGHT_COL_CHROME) / 2);
  const heightDerivedVisualWidth = heightDerivedVisualHeight / 1.5;
  // The polaroid PAIR (two polaroids + gap) has to fit in
  // previewColumnWidth. So each polaroid can be at most
  // (previewColumnWidth - POLAROID_PAIR_GAP) / 2 wide. The 450 cap
  // keeps each polaroid from blowing up on ultrawide monitors.
  const previewVisualWidth = Math.max(
    MIN_VISUAL_WIDTH,
    Math.min(
      450,
      (previewColumnWidth - POLAROID_PAIR_GAP) / 2,
      heightDerivedVisualWidth,
    ),
  );
  const previewVisualHeight = Math.round(previewVisualWidth * 1.5);
  // Final right-column height: header + 2 visualisations + gaps.
  //
  // The LEFT column has TWO mechanisms working together to bottom-align
  // its CTA with the right column's chart bottom (the user's reported
  // "chart is lower than the rest of the elements" issue):
  //
  //   1. The inner form column has `min-height: MIN_VISUAL_TOTAL` so
  //      it never shrinks below the visuals' floored size. This makes
  //      the form column observably as tall as the right column when
  //      the visuals hit their floor, so the columns end at the same
  //      vertical position.
  //   2. The auth + CTA group inside the inner form column carries
  //      `margin-top: auto` (the inner div is `display: flex; flex-
  //      direction: column`), which pushes the CTA to the bottom of
  //      whatever container height the column ends up at. Combined
  //      with (1), this means the CTA visually lands at the chart's
  //      bottom y, eliminating the dead-space-below-CTA gap that the
  //      user flagged.
  const rightColumnTotalHeight = RIGHT_COL_CHROME + 2 * previewVisualHeight;
  // Stable ISO timestamp for the live-preview polaroid. Computing this
  // inline (e.g. `createdAt={new Date().toISOString()}`) re-evaluated
  // on every render, and since createdAt is one of the inputs to the
  // polaroid seed, every parent re-render (resize, zoom, slider drag
  // for unrelated state) reshuffled the suns and stars. Pinning it to
  // a useMemo with [] deps freezes the timestamp for the lifetime of
  // the page so resize/zoom no longer randomise the polaroid.
  const previewCreatedAt = useMemo(() => new Date().toISOString(), []);
  useEffect(() => {
    ctxRef.current = ctx;
    previewPayoutRef.current = previewPayout;
  });

  const promptIdx = useMemo(() => Math.floor(Math.random() * PROMPTS.length), []);

  useEffect(() => {
    if (!market || initialisedRef.current) return;
    const { lowerBound, upperBound } = market.config;
    const mid = (lowerBound + upperBound) / 2;
    const range = upperBound - lowerBound;
    setPrediction(market.consensusMean ?? mid);
    setSpread(range * 0.06);
    setSecondPeak(mid + range * 0.2);
    initialisedRef.current = true;
  }, [market]);

  const buildBelief = useCallback(
    (m: NonNullable<typeof market>): BeliefVector => {
      const { numBuckets, lowerBound, upperBound } = m.config;
      if (shape === 'range') {
        const half = Math.max(spread, (upperBound - lowerBound) * 0.005);
        const low = Math.max(lowerBound, prediction - half);
        const high = Math.min(upperBound, prediction + half);
        return generateRange(low, high, numBuckets, lowerBound, upperBound, 0.4);
      }
      if (shape === 'bimodal') {
        return generateBelief(
          [
            { type: 'point', center: prediction, spread: Math.max(spread, 0.01), weight: 0.5 },
            { type: 'point', center: secondPeak, spread: Math.max(spread, 0.01), weight: 0.7 },
          ],
          numBuckets,
          lowerBound,
          upperBound,
        );
      }
      return generateGaussian(prediction, Math.max(spread, 0.01), numBuckets, lowerBound, upperBound);
    },
    [shape, prediction, spread, secondPeak],
  );

  // Phase 1 + 2: preview belief (rAF-coalesced) + payout (debounced).
  //
  // The previous implementation called `liveCtx.setPreviewBelief(belief)`
  // synchronously on every slider tick, which forced the SDK
  // ConsensusChart subscriber to redraw at the slider's full input
  // cadence (60+ Hz). Recharts cannot keep up with that and the main
  // thread fell behind, contributing to the slider-drag crash.
  //
  // We now coalesce the broadcast through requestAnimationFrame so it
  // fires at most once per paint frame regardless of how fast the
  // slider changes. The belief is rebuilt on every effect run (cheap
  // pure math), but the EXPENSIVE broadcast to the chart subscriber
  // happens at most ~60 Hz - and any intermediate frames are merged
  // into the next-painted belief, never queued up.
  useEffect(() => {
    const liveCtx = ctxRef.current;
    if (!market || !liveCtx) return;
    let cancelled = false;
    let rafHandle: number | null = null;
    try {
      const belief = buildBelief(market);
      if (rafHandle != null) cancelAnimationFrame(rafHandle);
      rafHandle = requestAnimationFrame(() => {
        if (!cancelled) ctxRef.current?.setPreviewBelief(belief);
      });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const curve = await previewPayoutRef.current(belief, collateral);
          if (!cancelled) {
            setPayout(curve);
            ctxRef.current?.setPreviewPayout(curve);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (!cancelled) {
            setPayout(null);
            ctxRef.current?.setPreviewPayout(null);
          }
        }
      }, 350);
    } catch {
      // ignore: generator may throw on transient invalid state during slider drag
    }
    return () => {
      cancelled = true;
      if (rafHandle != null) cancelAnimationFrame(rafHandle);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [market, buildBelief, collateral]);

  // Clear preview state on unmount only.
  useEffect(() => {
    return () => {
      ctxRef.current?.setPreviewBelief(null);
      ctxRef.current?.setPreviewPayout(null);
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!market || !user) return;
    if (!reasoning.trim()) {
      setSubmitError('Write your reasoning first. The why is the asset.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const belief = buildBelief(market);
      const result = await executeBuy(belief, collateral);
      const positionId = String(result.positionId);
      recordBet({
        marketId: market.marketId,
        positionId,
        username: user.username,
        reasoning: reasoning.trim(),
        conviction,
        prediction,
        spread,
        collateral,
        shape,
        createdAt: new Date().toISOString(),
        marketTitle: market.title,
        marketUnits: market.xAxisUnits,
        lowerBound: market.config.lowerBound,
        upperBound: market.config.upperBound,
        consensusAtBet: market.consensusMean ?? null,
        expiresAt: (market as any).expiresAt ?? null,
      });
      if (ctx) {
        ctx.setPreviewBelief(null);
        ctx.setPreviewPayout(null);
      }
      navigate(
        `/r/${encodeURIComponent(String(market.marketId))}/${encodeURIComponent(positionId)}?fresh=1`,
      );
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Could not place bet.');
    } finally {
      setSubmitting(false);
    }
  }, [market, user, buildBelief, executeBuy, collateral, reasoning, conviction, prediction, spread, shape, navigate, ctx]);

  if (loading || !market) {
    return (
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 24px' }}>
        <EditorialLoading
          eyebrow="Tuning the question"
          lines={[
            'Pulling consensus from the wire…',
            'Reading the crowd\u2019s opinion…',
            'Setting up your draft receipt…',
          ]}
        />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 24px' }}>
        <EditorialError
          message={`Could not load this market: ${error.message}`}
          hint="Either the market id is wrong or the engine is briefly unreachable. Hit the back button and try Discover."
        />
      </div>
    );
  }

  const { lowerBound, upperBound } = market.config;
  const range = upperBound - lowerBound;
  const reasoningLen = reasoning.trim().length;

  const charsRemaining = Math.max(0, MAX_REASONING_CHARS - reasoning.length);

  // The "after" preview always shows the user nailing their prediction
  // (resolvedOutcome === prediction), so the post-resolution polaroid is
  // a fully-developed sharp coloured receipt. The real Receipt page is
  // what shows the ruined / undeveloped state for an actual miss - the
  // preview never demoralizes the user mid-bet by guessing they will be
  // wrong. We derive this from the DEFERRED prediction below so it stays
  // consistent with the rest of the deferred polaroid snapshot.

  const expiresAt = (market as any).expiresAt ?? null;

  // --- Performance: defer the slider inputs that feed the polaroid seed.
  //
  // Each slider tick previously did three expensive things in series:
  //   1. Recompute the polaroid seed from prediction/spread/conviction
  //      /collateral/shape, regenerating the full SVG (stars, suns,
  //      comets, aurora, nebula, ground silhouette, caption).
  //   2. Recompute the belief vector and broadcast it via
  //      ctx.setPreviewBelief, which forced the SDK ConsensusChart to
  //      redraw.
  //   3. Re-run the debounced payout preview HTTP call.
  // At 60+ Hz drag rate with TWO polaroids (before + after) and a
  // Recharts SVG, the main thread saturated and the page eventually
  // hit an OOM / unresponsive-tab state. The crash was strictly a
  // client-side render storm, NOT a Vercel issue.
  //
  // Fix: wrap the polaroid-seed inputs in `useDeferredValue`. React
  // keeps the slider input itself, the disagreement badge, the rarity
  // hint, the chart, and the payout preview running at full priority
  // (so they all feel instant), and renders the polaroid at LOW
  // priority. During a fast drag React skips intermediate polaroid
  // renders and only paints the polaroid when there's idle time. The
  // result: the slider stays buttery, the polaroid trails by ~50-100 ms,
  // and the main thread no longer falls behind.
  //
  // Combined with `React.memo` on the `Polaroid` component itself
  // (Polaroid.tsx), parents that re-render the polaroid with byte-
  // identical deferred props no-op cleanly.
  const deferredPrediction = useDeferredValue(prediction);
  const deferredSpread = useDeferredValue(spread);
  const deferredConviction = useDeferredValue(conviction);
  const deferredCollateral = useDeferredValue(collateral);
  const deferredShape = useDeferredValue(shape);
  const deferredReasoning = useDeferredValue(reasoning);

  // Factory so the same live preview can render at multiple sizes:
  // big sticky right-aside on desktop, regular top-of-form on mobile.
  // Pulls EVERY slider input into the polaroid so every change re-renders
  // the visual: the stake slider perturbs the seed and shifts the
  // ornament density, conviction shifts the sun radius and star count,
  // etc. Without these inputs feeding the seed the polaroid would only
  // react to prediction/spread/shape.
  //
  // `mode` is 'before' (still developing, no reasoning visible) or
  // 'after' (fully developed, sharp, colored, with the reasoning over
  // the ground silhouette). The right aside renders BOTH side-by-side
  // so the user can see what their receipt looks like in flight and
  // what it will look like once the market resolves in their favor.
  // Outcome the deferred "after" polaroid commits to. We derive it from
  // the DEFERRED prediction so it stays consistent with the rest of the
  // deferred snapshot - otherwise mid-drag the after-polaroid's seed and
  // its resolvedOutcome could disagree by one frame, causing visible
  // flicker between develop accuracy bands.
  const deferredPreviewOutcome = deferredPrediction;
  const renderPreviewPolaroid = (
    mode: 'before' | 'after',
    overrideWidth?: number,
  ) => (
    <Polaroid
      marketId={market.marketId}
      // The position id changes per "preview snapshot" so the seed reacts
      // to slider drags. We use a deterministic suffix from the slider
      // tuple so identical slider configs always look identical, but any
      // drag re-seeds. The mode is included so the two polaroids do not
      // collide on caches keyed by positionId. NOTE: this is built from
      // the *deferred* slider values so the polaroid only reseeds when
      // React picks up the deferred batch, not on every input event.
      positionId={`preview-${mode}-${deferredPrediction.toFixed(3)}-${deferredSpread.toFixed(3)}-${deferredConviction.toFixed(3)}-${deferredCollateral.toFixed(0)}-${deferredShape}`}
      marketTitle={market.title}
      marketUnits={market.xAxisUnits}
      username={user?.username ?? 'you'}
      reasoning={deferredReasoning || 'Your reasoning will appear here.'}
      createdAt={previewCreatedAt}
      prediction={deferredPrediction}
      spread={deferredSpread}
      conviction={deferredConviction}
      collateral={deferredCollateral}
      shape={deferredShape}
      lowerBound={lowerBound}
      upperBound={upperBound}
      width={overrideWidth ?? (isMobile ? 260 : previewVisualWidth)}
      expiresAt={expiresAt}
      resolutionState={mode === 'after' ? 'resolved' : 'open'}
      resolvedOutcome={mode === 'after' ? deferredPreviewOutcome : null}
      consensusAtBet={market.consensusMean ?? null}
      animateDevelop={mode === 'after'}
    />
  );

  // Chart card. On desktop this sits DIRECTLY UNDER the polaroid in the
  // right column (50% of page width). The card width/height match the
  // polaroid exactly so the two visualisations stack as two identically-
  // sized rectangles (the user explicitly asked for "same width and
  // height" with polaroid on top, chart on bottom).
  //
  // The SDK's ConsensusChart renders its own title and subtitle, which
  // we hide via CSS (.conviction-chart-shell .fs-chart-header) so the
  // chart sits cleanly inside our card without a duplicate header. The
  // shell also gets overflow:hidden so the Recharts SVG is clipped to
  // the card's rounded corners (fixes the rounded-left/sharp-right
  // corner bug).
  //
  // Chart inner height = polaroidHeight - card chrome (padding +
  // payout strip + gap). This makes the OUTER chart card match the
  // polaroid OUTER dimensions exactly.
  const chartChromeHeight = 12 /* top pad */ + 14 /* bottom pad */ + 6 /* gap */ + (payout ? 20 : 0);
  const chartInnerHeight = isMobile ? 220 : Math.max(240, previewVisualHeight - chartChromeHeight);
  const chartCard = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 14px 14px',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
        minWidth: 0,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
      }}
      className="conviction-chart-shell"
    >
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <ConsensusChart
          marketId={marketId}
          height={chartInnerHeight}
          xAxisTickFormatter={(v) => formatMarketNumber(v)}
          yAxisTickFormatter={(v) => {
            // Probability density values are typically tiny (0.0008 etc).
            // Render them with as few characters as possible: 0 stays
            // "0", and small values stick to 3 decimal places. This
            // keeps the Y-axis tick column narrow so the chart curve
            // gets more horizontal real estate.
            if (v === 0) return '0';
            if (Math.abs(v) >= 0.01) return v.toFixed(2);
            return v.toFixed(3);
          }}
          tooltipValueFormatter={(value, kind) => {
            if (kind === 'outcome') return formatMarketNumber(value);
            if (kind === 'payout') {
              return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
          }}
        />
      </div>
      {payout && (
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 2,
            fontFamily: fonts.mono,
            fontSize: 10.5,
            color: palette.inkSoft,
            letterSpacing: 0.3,
            flexWrap: 'wrap',
          }}
        >
          <span>MAX PAYOUT ${payout.maxPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span>AT {formatMarketNumber(payout.maxPayoutOutcome)} {market.xAxisUnits ?? ''}</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        // Canvas bumped to 1440 so the right-side visualisations get
        // ~2/3 of the page on a typical laptop — the user explicitly
        // asked for the polaroid + chart to dominate, not the form.
        maxWidth: 1440,
        margin: '0 auto',
        padding: isMobile ? '20px 16px 56px' : '32px 24px 80px',
        overflowX: 'clip',
      }}
    >
      <Link
        to="/discover"
        style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, textDecoration: 'none', letterSpacing: 0.3 }}
      >
        ← Back to Discover
      </Link>

      <div
        style={{
          display: 'grid',
          // 50:50 split. The left column holds the form (sliders,
          // shape chips, reasoning textarea, submit button). The right
          // column holds the polaroid stacked above the chart, both
          // sized to identical width and height so the right half of
          // the page reads as a clean two-up vertical stack. The two
          // columns are forced to the SAME total height (whichever is
          // taller wins, via min-height on both) so the page bottoms
          // out cleanly with no orphaned empty space below either side.
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: isMobile ? 24 : 32,
          marginTop: 16,
          alignItems: 'stretch',
        }}
      >
        <div
          data-betflow-form-outer
          style={{
            // OUTER form-column wrapper. Mostly transparent now. The
            // inner ref'd div below carries the min-height that
            // stretches the column to match the right side. Keeping
            // this outer wrapper around so the grid cell has a clean
            // single-child structure even on mobile (where the inner
            // gets `display: block` and no min-height).
            display: 'flex',
            flexDirection: 'column',
          }}
        >
        <div
          ref={setFormColumnRef}
          data-betflow-form-inner
          style={{
            // The inner ref'd div is what the ResizeObserver MEASURES.
            // Carrying min-height here (rather than on the outer
            // wrapper) means the observed height is the floored
            // value, which keeps the visuals computation stable and
            // makes the right column's chart bottom land exactly at
            // the column bottom in BOTH the "form natural >= floor"
            // and "form natural < floor" cases.
            //
            // Display flex + flex-direction column is what enables
            // `margin-top: auto` on the auth+CTA group below to push
            // the CTA to the bottom of the column whenever the floor
            // is in effect. When the form's natural content height
            // exceeds the floor, marginTop:auto has no effect and the
            // CTA sits at its natural position.
            display: 'flex',
            flexDirection: 'column',
            minHeight: isMobile ? undefined : MIN_VISUAL_TOTAL,
          }}
        >
          <span style={{ fontFamily: fonts.mono, fontSize: 10.5, color: palette.ember, letterSpacing: 1.6 }}>
            STAKE A CONVICTION
          </span>
          <h1
            style={{
              fontFamily: fonts.display,
              // Shrunk from 42 → 32 desktop so the chunky display H1 no
              // longer competes with the polaroid for "biggest thing on
              // the page" attention.
              fontSize: isMobile ? 26 : 32,
              fontWeight: 700,
              color: palette.ink,
              margin: '6px 0 8px',
              letterSpacing: -0.5,
              lineHeight: 1.12,
            }}
          >
            {market.title}
          </h1>
          <div style={{ fontFamily: fonts.body, color: palette.inkMute, fontSize: isMobile ? 12 : 13, marginBottom: 16 }}>
            Range {formatMarketNumber(lowerBound)}{'\u2013'}{formatMarketNumber(upperBound)} {market.xAxisUnits ?? ''} · Pool ${formatMarketNumber(market.totalVolume ?? 0)} ·
            Consensus µ {formatMarketNumber(market.consensusMean ?? 0)} {market.xAxisUnits ?? ''}
          </div>

          {isMobile && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: 24,
                gap: 16,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  color: palette.inkMute,
                  letterSpacing: 1.4,
                  textAlign: 'center',
                }}
              >
                LIVE PREVIEW · YOUR RECEIPT
              </div>
              {/* On mobile the two polaroids stack vertically (before
                  on top, after below) so each one stays at a readable
                  size; side-by-side at typical phone widths would
                  squash both polaroids below the legible floor. */}
              {renderPreviewPolaroid('before')}
              {renderPreviewPolaroid('after')}
              <div style={{ width: '100%' }}>{chartCard}</div>
            </div>
          )}

          <Section title="Write the why.">
            <p style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.inkMute, marginTop: 0, marginBottom: 8, lineHeight: 1.4 }}>
              {PROMPTS[promptIdx]}
            </p>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASONING_CHARS))}
              maxLength={MAX_REASONING_CHARS}
              rows={3}
              placeholder="If you turn out to be right, this becomes a meme. One paragraph is enough."
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${reasoningLen ? palette.ember : palette.rule}`,
                borderRadius: 6,
                background: palette.card,
                fontFamily: fonts.body,
                fontSize: 13.5,
                color: palette.ink,
                lineHeight: 1.45,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 10.5,
                color: reasoningLen >= 30 ? palette.jade : palette.inkFade,
                marginTop: 4,
                letterSpacing: 0.4,
              }}
            >
              {reasoningLen >= 30 ? '✓ ENOUGH SAID' : `${30 - reasoningLen} chars to a real conviction`} ·{' '}
              {charsRemaining} remaining
            </div>
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 11.5,
                color: palette.inkFade,
                marginTop: 6,
                fontStyle: 'italic',
                lineHeight: 1.4,
              }}
            >
              Reasoning is hidden on the polaroid until the market resolves. If you're right, it blooms into the photo as a quote.
            </div>
          </Section>

          <Section title="Shape the belief.">
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <ShapeChip active={shape === 'gaussian'} onClick={() => setShape('gaussian')} label="Single peak" sub="A point estimate with confidence." />
              <ShapeChip active={shape === 'range'} onClick={() => setShape('range')} label="Range" sub="Somewhere in this band." />
              <ShapeChip active={shape === 'bimodal'} onClick={() => setShape('bimodal')} label="Bimodal" sub="Two distinct outcomes." />
            </div>

            <DisagreementBadge
              prediction={prediction}
              consensusMean={market.consensusMean ?? null}
              lowerBound={lowerBound}
              upperBound={upperBound}
              units={market.xAxisUnits ?? ''}
            />

            <Slider
              label={shape === 'range' ? 'Center of range' : shape === 'bimodal' ? 'First peak' : 'Prediction'}
              units={market.xAxisUnits}
              min={lowerBound}
              max={upperBound}
              step={Math.max(0.01, range / 1000)}
              value={prediction}
              onChange={setPrediction}
            />
            {shape === 'bimodal' && (
              <Slider
                label="Second peak"
                units={market.xAxisUnits}
                min={lowerBound}
                max={upperBound}
                step={Math.max(0.01, range / 1000)}
                value={secondPeak}
                onChange={setSecondPeak}
              />
            )}
            <Slider
              label={shape === 'range' ? 'Half-width' : 'Spread (uncertainty)'}
              units={market.xAxisUnits}
              min={range * 0.005}
              max={range * 0.4}
              step={Math.max(0.01, range / 1000)}
              value={spread}
              onChange={setSpread}
            />
            <Slider
              label="Conviction × badge"
              units=""
              min={0.1}
              max={1}
              step={0.05}
              value={conviction}
              onChange={setConviction}
              format={(v) => `${Math.round(v * 10)} / 10`}
            />
            <Slider
              label="Stake (drives ornaments + sun size)"
              units="$"
              min={1}
              max={Math.min(500, (user?.walletValue ?? 500))}
              step={1}
              value={collateral}
              onChange={setCollateral}
              format={(v) => `$${v.toFixed(0)}`}
            />

            <RarityHint
              prediction={prediction}
              consensusMean={market.consensusMean ?? null}
              lowerBound={lowerBound}
              upperBound={upperBound}
              units={market.xAxisUnits ?? ''}
            />
          </Section>

          {/* Auth + CTA group. Carries `margin-top: auto` so it floats
              to the bottom of the inner form column when the column
              is taller than its natural content (i.e. when the right
              column's polaroid + chart stack is taller than the form
              and pushes the column's min-height up). The result: the
              CTA bottom lines up with the chart bottom, eliminating
              the visual "form ends 20 px above the chart" gap the
              user reported. When the form's natural content already
              exceeds the column floor, marginTop:auto is a no-op. */}
          <div data-betflow-cta-group style={{ marginTop: 'auto', paddingTop: 24 }}>
            {!isAuthenticated && (
              <div style={{ marginBottom: 22 }}>
                <AuthGate />
              </div>
            )}

            <button
              data-betflow-cta
              onClick={handleSubmit}
              disabled={!isAuthenticated || submitting || buyLoading || !reasoning.trim()}
              style={{
                width: '100%',
                padding: '13px 20px',
                // Active state: pastel-orange ember background with the
                // card color (= white in light, deep aubergine in dark)
                // for the label.
                // Disabled state: rule-colored background + ink-mute
                // label, so the text stays clearly readable in dark
                // mode (where palette.card is dark aubergine and would
                // wash against the dark rule background).
                background: isAuthenticated && reasoning.trim() ? palette.ember : palette.rule,
                color: isAuthenticated && reasoning.trim() ? palette.card : palette.inkMute,
                border: 'none',
                borderRadius: 7,
                fontFamily: fonts.display,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: -0.1,
                cursor: isAuthenticated && reasoning.trim() && !submitting ? 'pointer' : 'not-allowed',
                boxShadow: isAuthenticated && reasoning.trim() ? `0 3px 10px ${palette.shadow}` : 'none',
                transition: 'background 160ms, box-shadow 160ms, color 160ms',
              }}
            >
              {submitting || buyLoading
                ? 'Signing receipt…'
                : !reasoning.trim()
                ? 'Write your reasoning to bet'
                : `Stake $${collateral} · Sign my receipt →`}
            </button>
            {(submitError || buyError) && (
              <p style={{ fontFamily: fonts.body, color: palette.rose, marginTop: 12 }}>{submitError ?? buyError?.message}</p>
            )}
          </div>
        </div>
        </div>

        {!isMobile && (
          <aside
            ref={setPreviewColumnRef}
            data-betflow-aside
            style={{
              // Right column = 50% of the page. Polaroid sits on top,
              // chart sits directly below. The polaroid keeps its 1.5
              // portrait ratio at previewVisualWidth (centered in the
              // column for breathing room), the chart fills the full
              // aside width, and the chart wrapper carries flex-grow
              // so any vertical slack from the form-column min-height
              // gets absorbed by the chart rather than leaving an
              // empty band below the chart card.
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              minWidth: 0,
            }}
            aria-label="Live preview of your receipt and the crowd consensus chart"
          >
            <div
              data-betflow-header
              style={{
                // Centered "LIVE PREVIEW * YOUR RECEIPT" label, no toggle
                // now that the right aside renders both before- and
                // after-resolution polaroids side-by-side below. The
                // fixed 36 px height keeps RIGHT_COL_CHROME accurate; if
                // you change this row, re-snapshot betflow and verify
                // formInner.h === aside.h in dims.json.
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 36,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  color: palette.inkMute,
                  letterSpacing: 1.4,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                LIVE PREVIEW · YOUR RECEIPT
              </div>
            </div>
            {/* Two polaroids side-by-side: the LEFT one is the bet in
                flight (open, still developing, no reasoning shown), the
                RIGHT one is the receipt as it would look once the
                market resolves in the user's favor (fully developed,
                sharp, colored, with the reasoning quote over the
                ground). Both polaroids share the same seed/inputs
                except for the `mode`-suffixed positionId, so they
                differ only in their resolution state. */}
            <div
              data-betflow-polaroid-pair
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: POLAROID_PAIR_GAP,
                width: '100%',
                justifyContent: 'center',
                alignItems: 'flex-start',
                flexShrink: 0,
              }}
            >
              <div data-betflow-polaroid="before" style={{ width: previewVisualWidth }}>
                {renderPreviewPolaroid('before')}
              </div>
              <div data-betflow-polaroid="after" style={{ width: previewVisualWidth }}>
                {renderPreviewPolaroid('after')}
              </div>
            </div>
            {/* Chart wrapper carries the same outer height as a single
                polaroid (previewVisualHeight), so chrome + polaroid row
                + chart = chrome + 2 * previewVisualHeight, matching the
                form column height. */}
            <div
              data-betflow-chart
              style={{
                width: '100%',
                maxWidth: '100%',
                height: previewVisualHeight,
                display: 'flex',
              }}
            >
              {chartCard}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // Tightened section spacing (was marginTop 32, h2 22px, marginBottom 14)
    // so the form chrome takes up less vertical real estate and the eye
    // is drawn to the polaroid + chart in the sticky right column.
    <div style={{ marginTop: 22 }}>
      <h2
        style={{
          fontFamily: fonts.display,
          fontSize: 17,
          fontWeight: 700,
          color: palette.ink,
          margin: 0,
          marginBottom: 10,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function DisagreementBadge({
  prediction,
  consensusMean,
  lowerBound,
  upperBound,
  units,
}: {
  prediction: number;
  consensusMean: number | null;
  lowerBound: number;
  upperBound: number;
  units: string;
}) {
  if (consensusMean == null || !Number.isFinite(consensusMean)) return null;
  const range = upperBound - lowerBound;
  if (range <= 0) return null;
  const offset = prediction - consensusMean;
  const offsetAbs = Math.abs(offset);
  const offsetPct = (offsetAbs / range) * 100;
  const direction = offset > 0 ? 'above' : offset < 0 ? 'below' : 'on';

  let label: string;
  let color: string;
  let bg: string;
  if (offsetPct < 2) {
    label = 'In line with consensus';
    color = palette.inkSoft;
    bg = palette.paperDeep;
  } else if (offsetPct < 6) {
    label = `Modest lean · ${direction} consensus`;
    color = palette.inkSoft;
    bg = palette.paperDeep;
  } else if (offsetPct < 14) {
    label = `Contrarian call · ${direction} consensus`;
    color = palette.ember;
    bg = 'rgba(194, 65, 12, 0.10)';
  } else if (offsetPct < 28) {
    label = `Way off the crowd · ${direction} consensus`;
    color = palette.ember;
    bg = 'rgba(194, 65, 12, 0.16)';
  } else {
    label = `Lone voice · ${direction} consensus`;
    color = palette.emberDeep;
    bg = 'rgba(194, 65, 12, 0.22)';
  }

  const offsetFormatted = formatMarketNumber(offsetAbs);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        background: bg,
        border: `1px solid ${palette.rule}`,
        borderRadius: 7,
        padding: '8px 11px',
        marginBottom: 12,
        fontFamily: fonts.body,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color, letterSpacing: 0.2 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: palette.inkMute, marginTop: 1 }}>
          You are {offsetFormatted} {units} {direction} the crowd's average
          ({offsetPct.toFixed(1)}% of the range).
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10.5,
          color: palette.inkMute,
          letterSpacing: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        µ {formatMarketNumber(consensusMean)} {units}
      </span>
    </div>
  );
}

function RarityHint({
  prediction,
  consensusMean,
  lowerBound,
  upperBound,
  units,
}: {
  prediction: number;
  consensusMean: number | null;
  lowerBound: number;
  upperBound: number;
  units: string;
}) {
  const tier: Rarity | null = potentialRarity({
    prediction,
    consensusMean,
    lowerBound,
    upperBound,
  });
  const meta = tier ? TIER_META[tier] : null;
  const range = upperBound - lowerBound;
  const disagreementPct =
    consensusMean != null && range > 0
      ? Math.round((Math.abs(prediction - consensusMean) / range) * 100)
      : null;

  if (!meta || !tier) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: '9px 12px',
          background: palette.card,
          border: `1px dashed ${palette.rule}`,
          borderRadius: 7,
          fontFamily: fonts.body,
          fontSize: 12,
          color: palette.inkMute,
        }}
      >
        Rarity unlocks once the market has a crowd consensus.
      </div>
    );
  }

  const headline =
    tier === 'common'
      ? `In step with the crowd (${disagreementPct ?? 0}% off consensus)`
      : `Earn a ${meta.label.toUpperCase()} receipt if you're right.`;

  const sub =
    tier === 'common'
      ? 'Move the prediction further from consensus to chase rarer receipts.'
      : tier === 'mythic'
        ? `You're ${disagreementPct}% off consensus. Landing this is the highest tier in the game.`
        : `You're ${disagreementPct}% off consensus. Rarity scales with how contrarian and how accurate you are.`;

  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: meta.badgeFill,
        border: `1.5px solid ${meta.badgeStroke}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 11,
      }}
      data-testid="rarity-hint"
      data-tier={tier}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '4px 10px',
          background: meta.color,
          color: '#fff',
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.4,
          borderRadius: 999,
        }}
      >
        {meta.label.toUpperCase()}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 12.5,
            fontWeight: 600,
            color: meta.badgeText,
            lineHeight: 1.25,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 11,
            color: meta.badgeText,
            opacity: 0.75,
            marginTop: 2,
            lineHeight: 1.3,
          }}
        >
          {sub} {units && consensusMean != null ? `(consensus µ ${formatMarketNumber(consensusMean)} ${units})` : ''}
        </div>
      </div>
    </div>
  );
}

function ShapeChip({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: 'left',
        padding: '9px 11px',
        border: `1px solid ${active ? palette.ember : palette.rule}`,
        borderRadius: 7,
        background: active ? 'rgba(194, 65, 12, 0.10)' : palette.card,
        color: palette.ink,
        cursor: 'pointer',
        fontFamily: fonts.body,
        minWidth: 0,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{label}</div>
      <div style={{ fontSize: 11, color: palette.inkMute, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

/**
 * Market-number formatter used for the page subtitle row (range,
 * pool, consensus mu). Picks the precision based on magnitude and
 * uses 'en-US' so the thousand separator is always a comma. This is
 * what fixes the "Pool $2205110" wall-of-digits and the "Consensus
 * µ 1373.9" trailing-decimal-on-an-integer-price feel.
 */
function formatMarketNumber(value: number): string {
  if (!Number.isFinite(value)) return '\u2014';
  const absV = Math.abs(value);
  // Big integer prices (>= 1) drop the decimal; tiny probabilities
  // and small unit values keep it.
  const decimals = absV >= 1000 ? 0 : absV >= 1 ? 1 : 3;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals === 0 ? 0 : 1,
    maximumFractionDigits: decimals,
  });
}

/**
 * Default slider value formatter. Smart-rounds based on the slider's
 * step:
 *   - step >= 1: integer with thousand separators ("1,374")
 *   - 0.1 <= step < 1: one decimal ("1.4")
 *   - step < 0.1: two decimals ("1.37")
 * Uses 'en-US' locale unconditionally so the value reads consistently
 * regardless of viewer locale (matches the polaroid scale strip).
 * Replaces the previous always-toFixed(2) which produced "1373.86" on
 * integer-step price ranges.
 */
function defaultSliderFormat(value: number, step: number, units?: string): string {
  if (!Number.isFinite(value)) return '—';
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (!units) return formatted;
  const needsSpace = !(units === '%' || units === '$' || units === '€' || units === '£');
  return `${formatted}${needsSpace ? ' ' : ''}${units}`;
}

function Slider({
  label,
  units,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  units?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    // Compact slider: ~30% less vertical space than before. Per user
    // request the form chrome should recede in favour of the polaroid
    // and the chart in the sticky preview column. The slider input
    // itself is styled in index.css; smaller margins here drive the
    // visible density change.
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2, fontFamily: fonts.body }}>
        <span style={{ fontSize: 12, color: palette.inkSoft, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: palette.ink, fontFamily: fonts.mono, letterSpacing: 0.3 }}>
          {format ? format(value) : defaultSliderFormat(value, step, units)}
        </span>
      </div>
      <input
        className="conviction-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
