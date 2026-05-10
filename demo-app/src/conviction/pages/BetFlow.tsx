import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  const [previewMode, setPreviewMode] = useState<'before' | 'after'>('before');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialisedRef = useRef(false);
  const ctxRef = useRef(ctx);
  const previewPayoutRef = useRef(previewPayout);
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

  // Phase 1 + 2: preview belief (instant) + payout (debounced).
  useEffect(() => {
    const liveCtx = ctxRef.current;
    if (!market || !liveCtx) return;
    let cancelled = false;
    try {
      const belief = buildBelief(market);
      liveCtx.setPreviewBelief(belief);
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

  const charsRemaining = Math.max(0, 400 - reasoning.length);

  // Outcome used for the "After" preview: 80% of the way from the user's
  // prediction toward the consensus mean. Gives a believable preview of
  // what the developed receipt will look like.
  const previewOutcome = (() => {
    const mean = market.consensusMean;
    if (typeof mean === 'number' && Number.isFinite(mean)) {
      return prediction + (mean - prediction) * 0.8;
    }
    return prediction;
  })();

  const expiresAt = (market as any).expiresAt ?? null;

  // Factory so the same live preview can render at multiple sizes:
  // big sticky right-aside on desktop, regular top-of-form on mobile.
  // Pulls EVERY slider input into the polaroid so every change re-renders
  // the visual — the stake slider now perturbs the seed and shifts the
  // ornament density, conviction shifts the sun radius and star count,
  // etc. Without these inputs feeding the seed the polaroid would only
  // react to prediction/spread/shape.
  const renderPreviewPolaroid = (overrideWidth?: number) => (
    <Polaroid
      marketId={market.marketId}
      // The position id changes per "preview snapshot" so the seed reacts
      // to slider drags. We use a deterministic suffix from the slider
      // tuple so identical slider configs always look identical, but any
      // drag re-seeds.
      positionId={`preview-${prediction.toFixed(3)}-${spread.toFixed(3)}-${conviction.toFixed(3)}-${collateral.toFixed(0)}-${shape}`}
      marketTitle={market.title}
      marketUnits={market.xAxisUnits}
      username={user?.username ?? 'you'}
      reasoning={reasoning || 'Your reasoning will appear here.'}
      createdAt={new Date().toISOString()}
      prediction={prediction}
      spread={spread}
      conviction={conviction}
      collateral={collateral}
      shape={shape}
      lowerBound={lowerBound}
      upperBound={upperBound}
      width={overrideWidth ?? (isMobile ? 280 : 320)}
      expiresAt={expiresAt}
      resolutionState={previewMode === 'after' ? 'resolved' : 'open'}
      resolvedOutcome={previewMode === 'after' ? previewOutcome : null}
      consensusAtBet={market.consensusMean ?? null}
      animateDevelop={previewMode === 'after'}
    />
  );

  const previewPolaroid = renderPreviewPolaroid();

  const previewToggle = (
    <div
      style={{
        display: 'inline-flex',
        padding: 2,
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 999,
        marginBottom: 10,
      }}
    >
      {(['before', 'after'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setPreviewMode(mode)}
          style={{
            border: 'none',
            background: previewMode === mode ? palette.ember : 'transparent',
            color: previewMode === mode ? palette.card : palette.inkMute,
            padding: '6px 14px',
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            borderRadius: 999,
            cursor: 'pointer',
            transition: 'background 160ms, color 160ms',
          }}
        >
          {mode === 'before' ? 'Before resolution' : 'After resolution'}
        </button>
      ))}
    </div>
  );

  // Chart card. On desktop this becomes part of the sticky right column
  // alongside the polaroid; on mobile it lives inline in the form.
  const chartCard = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 12px 12px',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        minWidth: 0,
      }}
      className="conviction-chart-shell"
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: 1.4,
          color: palette.inkMute,
        }}
      >
        CROWD vs. YOU
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 12,
          color: palette.inkMute,
          lineHeight: 1.4,
          marginBottom: 4,
        }}
      >
        Your trade preview (dashed) over the crowd's consensus (solid). The gap is your contrarian edge.
      </div>
      <ConsensusChart marketId={marketId} height={isMobile ? 260 : 300} />
      {payout && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 4,
            fontFamily: fonts.mono,
            fontSize: 11,
            color: palette.inkSoft,
            letterSpacing: 0.3,
            flexWrap: 'wrap',
          }}
        >
          <span>MAX PAYOUT ${payout.maxPayout.toFixed(2)}</span>
          <span>AT {payout.maxPayoutOutcome.toFixed(2)} {market.xAxisUnits ?? ''}</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        // Wider canvas — was 1120, now 1320 — so the consensus chart can
        // breathe alongside the polaroid in the sticky right column
        // without crowding the form on the left.
        maxWidth: 1320,
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
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1.25fr) minmax(0, 1fr)',
          gap: isMobile ? 24 : 40,
          marginTop: 16,
        }}
      >
        <div>
          <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.6 }}>
            STAKE A CONVICTION
          </span>
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 30 : 42,
              fontWeight: 700,
              color: palette.ink,
              margin: '8px 0 12px',
              letterSpacing: -0.7,
              lineHeight: 1.1,
            }}
          >
            {market.title}
          </h1>
          <div style={{ fontFamily: fonts.body, color: palette.inkMute, fontSize: isMobile ? 13 : 14, marginBottom: 20 }}>
            Range {lowerBound}–{upperBound} {market.xAxisUnits ?? ''} · Pool ${(market.totalVolume ?? 0).toFixed(0)} ·
            Consensus µ {(market.consensusMean ?? 0).toFixed(1)} {market.xAxisUnits ?? ''}
          </div>

          {isMobile && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <div style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute, letterSpacing: 1.4, marginBottom: 12, alignSelf: 'flex-start' }}>
                LIVE PREVIEW · YOUR RECEIPT
              </div>
              {previewToggle}
              {previewPolaroid}
              <div style={{ marginTop: 20, width: '100%' }}>{chartCard}</div>
            </div>
          )}

          <Section title="Write the why.">
            <p style={{ fontFamily: fonts.body, fontSize: 14, color: palette.inkMute, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
              {PROMPTS[promptIdx]}
            </p>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value.slice(0, 400))}
              rows={4}
              placeholder="If you turn out to be right, this becomes a meme. One paragraph is enough."
              style={{
                width: '100%',
                padding: '14px 16px',
                border: `1px solid ${reasoningLen ? palette.ember : palette.rule}`,
                borderRadius: 6,
                background: palette.card,
                fontFamily: fonts.body,
                fontSize: 16,
                color: palette.ink,
                lineHeight: 1.5,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: reasoningLen >= 30 ? palette.jade : palette.inkFade,
                marginTop: 6,
                letterSpacing: 0.4,
              }}
            >
              {reasoningLen >= 30 ? '✓ ENOUGH SAID' : `${30 - reasoningLen} chars to a real conviction`} ·{' '}
              {charsRemaining} remaining
            </div>
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 12,
                color: palette.inkFade,
                marginTop: 8,
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              Reasoning is hidden on the polaroid until the market resolves. If you're right, it blooms into the photo as a quote.
            </div>
          </Section>

          <Section title="Shape the belief.">
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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

          {!isAuthenticated && (
            <div style={{ marginTop: 24 }}>
              <AuthGate />
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isAuthenticated || submitting || buyLoading || !reasoning.trim()}
            style={{
              width: '100%',
              marginTop: 32,
              padding: '18px 24px',
              background: isAuthenticated && reasoning.trim() ? palette.ember : palette.rule,
              color: palette.card,
              border: 'none',
              borderRadius: 8,
              fontFamily: fonts.display,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: -0.2,
              cursor: isAuthenticated && reasoning.trim() && !submitting ? 'pointer' : 'not-allowed',
              boxShadow: `0 4px 14px ${palette.shadow}`,
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

        {!isMobile && (
          <aside
            style={{
              position: 'sticky',
              // The whole right column locks together at top: 88 so both
              // polaroid AND chart stay visible while the user scrolls
              // through the form on the left. The internal flex column
              // stacks them.
              top: 88,
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 104px)',
              overflowY: 'auto',
              paddingRight: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            aria-label="Live preview of your receipt and the crowd consensus chart"
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  color: palette.inkMute,
                  letterSpacing: 1.4,
                  alignSelf: 'flex-start',
                }}
              >
                LIVE PREVIEW · YOUR RECEIPT
              </div>
              {previewToggle}
              {previewPolaroid}
            </div>
            {chartCard}
          </aside>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2
        style={{
          fontFamily: fonts.display,
          fontSize: 22,
          fontWeight: 700,
          color: palette.ink,
          margin: 0,
          marginBottom: 14,
          letterSpacing: -0.3,
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

  const offsetFormatted = offsetAbs >= 100
    ? offsetAbs.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : offsetAbs.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: bg,
        border: `1px solid ${palette.rule}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 18,
        fontFamily: fonts.body,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color, letterSpacing: 0.2 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: palette.inkMute, marginTop: 2 }}>
          You are {offsetFormatted} {units} {direction} the crowd's average
          ({offsetPct.toFixed(1)}% of the range).
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          color: palette.inkMute,
          letterSpacing: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        µ {consensusMean.toFixed(2)} {units}
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
          marginTop: 12,
          padding: '12px 14px',
          background: palette.card,
          border: `1px dashed ${palette.rule}`,
          borderRadius: 8,
          fontFamily: fonts.body,
          fontSize: 13,
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
        marginTop: 14,
        padding: '14px 16px',
        background: meta.badgeFill,
        border: `1.5px solid ${meta.badgeStroke}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
      data-testid="rarity-hint"
      data-tier={tier}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '6px 12px',
          background: meta.color,
          color: '#fff',
          fontFamily: fonts.mono,
          fontSize: 11,
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
            fontSize: 14,
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
            fontSize: 12,
            color: meta.badgeText,
            opacity: 0.75,
            marginTop: 2,
            lineHeight: 1.3,
          }}
        >
          {sub} {units && consensusMean != null ? `(consensus µ ${consensusMean.toFixed(1)} ${units})` : ''}
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
        padding: '12px 14px',
        border: `1px solid ${active ? palette.ember : palette.rule}`,
        borderRadius: 8,
        background: active ? 'rgba(194, 65, 12, 0.10)' : palette.card,
        color: palette.ink,
        cursor: 'pointer',
        fontFamily: fonts.body,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 12, color: palette.inkMute, marginTop: 3 }}>{sub}</div>
    </button>
  );
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
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, fontFamily: fonts.body }}>
        <span style={{ fontSize: 13, color: palette.inkSoft, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, color: palette.ink, fontFamily: fonts.mono, letterSpacing: 0.4 }}>
          {format ? format(value) : `${value.toFixed(2)} ${units ?? ''}`}
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
