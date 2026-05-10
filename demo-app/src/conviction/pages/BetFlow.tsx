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
import { Polaroid, POLAROID_PRESETS, type PolaroidPreset } from '../components/Polaroid';
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
  const [preset, setPreset] = useState<PolaroidPreset>('auto');
  const [payout, setPayout] = useState<PayoutCurve | null>(null);
  const [previewMode, setPreviewMode] = useState<'before' | 'after'>('before');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialisedRef = useRef(false);
  // Keep refs to the live context and preview-payout executor so the preview
  // effect below can call them without listing them as dependencies. Listing
  // them in deps causes an infinite render loop, because the effect updates
  // context state on every run, which produces a new ctx object on the next
  // render, which retriggers the effect.
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
  // Deps intentionally exclude ctx and previewPayout: see ctxRef comment above.
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

  // Clear preview state on unmount only (no ctx dep: see ctxRef comment).
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
        preset,
        consensusAtBet: market.consensusMean ?? null,
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
  }, [market, user, buildBelief, executeBuy, collateral, reasoning, conviction, prediction, spread, shape, preset, navigate, ctx]);

  if (loading || !market) {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
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
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
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
  // prediction toward the consensus mean. Falls back to a near-prediction
  // value if no consensus is available yet. Gives the user a believable
  // "called it / close" sample of how the developed receipt will look.
  const previewOutcome = (() => {
    const mean = market.consensusMean;
    if (typeof mean === 'number' && Number.isFinite(mean)) {
      return prediction + (mean - prediction) * 0.8;
    }
    return prediction;
  })();

  const previewPolaroid = (
    <Polaroid
      marketId={market.marketId}
      positionId="preview"
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
      width={isMobile ? 280 : 320}
      preset={preset}
      resolutionState={previewMode === 'after' ? 'resolved' : 'open'}
      resolvedOutcome={previewMode === 'after' ? previewOutcome : null}
      animateDevelop={previewMode === 'after'}
    />
  );

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

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '20px 16px 56px' : '32px 24px 80px' }}>
      <Link
        to="/discover"
        style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, textDecoration: 'none', letterSpacing: 0.3 }}
      >
        ← Back to Discover
      </Link>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr)',
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
            </div>
          )}

          <Section title="Step 1 · Write the why.">
            <p style={{ fontFamily: fonts.body, fontSize: 14, color: palette.inkMute, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
              {PROMPTS[promptIdx]}
            </p>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value.slice(0, 400))}
              rows={4}
              placeholder="Your reasoning becomes the caption on the receipt. One paragraph is enough."
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
          </Section>

          <Section title="Step 2 · Shape the belief.">
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
              label="Stake"
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

          <Section title="Step 3 · Style the receipt.">
            <p style={{ fontFamily: fonts.body, fontSize: 14, color: palette.inkMute, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              Pick a palette for the photo. Auto reads your prediction and chooses for you.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 8,
              }}
            >
              {POLAROID_PRESETS.map((p) => (
                <PresetSwatch
                  key={p.id}
                  active={preset === p.id}
                  presetId={p.id}
                  label={p.label}
                  sub={p.sub}
                  onClick={() => setPreset(p.id)}
                />
              ))}
            </div>
          </Section>

          <Section title="Step 4 · See the consensus you're betting against.">
            <div
              className="conviction-chart-shell"
              style={{
                background: palette.card,
                border: `1px solid ${palette.rule}`,
                borderRadius: 8,
                padding: '12px 12px 28px',
              }}
            >
              <ConsensusChart marketId={marketId} height={320} />
            </div>
            {payout && (
              <div style={{ display: 'flex', gap: 24, marginTop: 12, fontFamily: fonts.mono, fontSize: 12, color: palette.inkSoft, letterSpacing: 0.3 }}>
                <span>MAX PAYOUT ${payout.maxPayout.toFixed(2)}</span>
                <span>AT {payout.maxPayoutOutcome.toFixed(2)} {market.xAxisUnits ?? ''}</span>
              </div>
            )}
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
          <aside style={{ position: 'sticky', top: 96, alignSelf: 'flex-start' }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute, letterSpacing: 1.4, marginBottom: 12 }}>
              LIVE PREVIEW · YOUR RECEIPT
            </div>
            {previewToggle}
            {previewPolaroid}
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
    bg = '#FFF4EC';
  } else if (offsetPct < 28) {
    label = `Way off the crowd · ${direction} consensus`;
    color = palette.ember;
    bg = '#FFE9D9';
  } else {
    label = `Lone voice · ${direction} consensus`;
    color = palette.emberDeep;
    bg = '#FFDFCB';
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

const PRESET_SWATCH_COLORS: Record<PolaroidPreset, { sky: string; sun: string; ground: string }> = {
  auto: { sky: 'linear-gradient(180deg, #1F1234 0%, #5A2A3F 50%, #79A4C8 100%)', sun: '#FFD494', ground: '#1A1F2A' },
  sunset: { sky: 'linear-gradient(180deg, #1F1234 0%, #5A2A3F 55%, #E2865A 100%)', sun: '#FFD494', ground: '#2C1517' },
  twilight: { sky: 'linear-gradient(180deg, #0C1530 0%, #1F3A5F 55%, #79A4C8 100%)', sun: '#E0F0FF', ground: '#101F30' },
  aurora: { sky: 'linear-gradient(180deg, #0B1830 0%, #2D1F58 55%, #5C2860 100%)', sun: '#A8F0D8', ground: '#150A28' },
  botanical: { sky: 'linear-gradient(180deg, #0F2418 0%, #2C5240 55%, #A8C896 100%)', sun: '#FFF6CE', ground: '#1A2C1F' },
  rosegold: { sky: 'linear-gradient(180deg, #2B1424 0%, #7A3450 55%, #F2B8C0 100%)', sun: '#FFE0B8', ground: '#321820' },
  noir: { sky: 'linear-gradient(180deg, #0A0A0A 0%, #252525 55%, #888888 100%)', sun: '#FFFFFF', ground: '#101010' },
};

/**
 * Live readout of the rarity tier the user *would* earn if they end up
 * right. Updates as they drag the prediction slider. Designed so the
 * gamification mechanic is obvious without a tutorial: the further you
 * stray from consensus, the rarer the receipt — but you have to be right.
 */
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

function PresetSwatch({
  active,
  presetId,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  presetId: PolaroidPreset;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  const c = PRESET_SWATCH_COLORS[presetId];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 10,
        border: `1px solid ${active ? palette.ember : palette.rule}`,
        borderRadius: 8,
        background: palette.card,
        color: palette.ink,
        cursor: 'pointer',
        fontFamily: fonts.body,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      aria-pressed={active}
    >
      <div
        style={{
          position: 'relative',
          height: 38,
          borderRadius: 4,
          background: c.sky,
          overflow: 'hidden',
          border: `1px solid ${palette.rule}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '38%',
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: '50%',
            background: c.sun,
            boxShadow: `0 0 10px ${c.sun}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 12,
            background: c.ground,
          }}
        />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: palette.inkMute, marginTop: 2, lineHeight: 1.3 }}>{sub}</div>
      </div>
    </button>
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
        background: active ? '#FFF4EC' : palette.card,
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
