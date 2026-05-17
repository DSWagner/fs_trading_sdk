import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMarket, useAuth } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from '../components/Polaroid';
import { LiveConsensusCard } from '../components/LiveConsensusCard';
import { ConsensusDriftSparkline } from '../components/ConsensusDriftSparkline';
import { ComparisonPair } from '../components/ComparisonPair';
import { CashOutPanel } from '../components/CashOutPanel';
import { CashedOutStamp } from '../components/CashedOutStamp';
import { ShareKit } from '../components/ShareKit';
import { getBet, getCashOut, type CashOutRecord, type BetRecord } from '../storage';
import { getDemoBet, isDemoMarketId } from '../demoGalleries';
import { buildEmbedUrl, buildShareUrl, readShareFromHash } from '../hash';
import { buildChallengeUrl } from '../challenge';
import { VerifiedReceiptBadge } from '../components/VerifiedReceiptBadge';
import { useIsMobile } from '../useMediaQuery';
// downloadPolaroidPng is now invoked transitively through the ShareKit
// component, which owns the receipt's PNG export flow. Importing it
// directly here would be dead code, so the import has moved to ShareKit.
import { EditorialEmpty, EditorialLoading } from '../components/EditorialState';
import { buildMarkdownReceipt } from '../markdownReceipt';

/**
 * Receipt page. Hydrates a bet from:
 *   1. The URL hash (?#r=<base64>) — for shared/embedded receipts
 *   2. localStorage — for the original author's view
 *   3. Live market data — for the current market context (consensus, range, etc.)
 */
export function ReceiptPage() {
  const { marketId: rawMarket = '', positionId: rawPos = '' } = useParams<{ marketId: string; positionId: string }>();
  const [searchParams] = useSearchParams();
  const isFresh = searchParams.get('fresh') === '1';

  const marketId = decodeURIComponent(rawMarket);
  const positionId = decodeURIComponent(rawPos);

  // Curated demo bets (the Studio Pick galleries) ship with synthetic
  // market IDs (e.g. `demo-gpt-release`) that are not real engine
  // markets. Hitting the SDK with these IDs returns `422 Unprocessable
  // Content` on every fetch, every poll, and every focus event, which
  //   (a) floods the console with errors when the user views a Pick,
  //   (b) leaves the live-consensus card stuck in a loading skeleton,
  //   (c) shows "Could not load history right now" for the drift
  //       sparkline,
  //   (d) flashes a comparison-pair skeleton that never resolves.
  //
  // We detect demo markets up front and pass `enabled: false` through
  // every SDK hook tied to a demo ID. The hooks still mount (rules of
  // hooks), but they never fetch and never subscribe to a poll. The
  // Receipt then renders entirely from the demo bet payload, which
  // already carries everything needed (bounds, consensus snapshot,
  // pre-baked outcome, units, title).
  const isDemo = useMemo(() => isDemoMarketId(marketId), [marketId]);

  // Poll the market every 5 seconds while the receipt is open. This is
  // the magic that turns the polaroid from a frozen snapshot into a
  // living object: the SDK cache (`useMarket` -> `useCacheSubscription`)
  // broadcasts updates to every subscriber on this market when the
  // poll lands, and the LiveConsensusCard below reflects the drift in
  // real time. Resolved markets stop drifting and just hold their final
  // value, so the cost of polling them is minor; the SDK also bails on
  // background tabs so this won't burn battery while the user's away.
  //
  // We also surface the `error` field. The previous implementation
  // gated the entire page on `!market`, which meant any engine-side
  // 404 (e.g. a stale marketId in localStorage whose market was later
  // archived) left the user stuck on the loading screen forever. Now
  // the local ledger snapshot is enough to render — the live drift
  // card and cash-out panel quietly degrade when the engine has
  // nothing fresh to add.
  const { market, loading: marketLoading, error: marketError } = useMarket(marketId, {
    pollInterval: isDemo ? 0 : 5_000,
    enabled: !isDemo,
  });

  const local = useMemo(() => getBet(marketId, positionId), [marketId, positionId]);
  const fromHash = useMemo(() => readShareFromHash(), []);
  // Fall back to a curated demo bet if neither the local ledger nor
  // the share-hash has a record. This is what lets a visitor click
  // through from a Studio Pick gallery to a fully rendered receipt
  // even though the demo bets were never written into localStorage.
  const demo = useMemo(() => getDemoBet(marketId, positionId), [marketId, positionId]);

  const merged = useMemo(() => {
    const base = local ?? null;
    if (base) {
      // Backfill expiresAt from the live market if it wasn't pinned on
      // the original record (older versions of the app didn't store it).
      if (base.expiresAt == null && market && (market as any).expiresAt) {
        return { ...base, expiresAt: (market as any).expiresAt };
      }
      return base;
    }
    if (demo) {
      // Demo bets ship with everything they need to render — bounds,
      // consensus snapshot, even a pre-baked outcome — so we surface
      // them as-is, casting to the BetRecord shape the rest of the
      // page consumes.
      return demo as BetRecord;
    }
    if (fromHash) {
      // We can render from the share-hash payload alone — the live
      // market only enriches title/bounds when it eventually arrives.
      const lowerBound = fromHash.lowerBound ?? market?.config.lowerBound ?? 0;
      const upperBound = fromHash.upperBound ?? market?.config.upperBound ?? 1;
      return {
        marketId,
        positionId,
        username: fromHash.username ?? 'someone',
        reasoning: fromHash.reasoning ?? '',
        conviction: fromHash.conviction ?? 0.5,
        prediction: fromHash.prediction ?? (market?.consensusMean ?? (lowerBound + upperBound) / 2),
        spread: fromHash.spread ?? Math.max(1, (upperBound - lowerBound) * 0.1),
        // Hash-encoded second peak. Only meaningful for `bimodal`
        // receipts. When omitted the polaroid falls back to the
        // legacy symmetric reconstruction in `densityAt`.
        secondPeak: fromHash.secondPeak ?? null,
        collateral: fromHash.collateral ?? 0,
        shape: (fromHash.shape ?? 'gaussian') as 'gaussian' | 'range' | 'bimodal',
        createdAt: fromHash.createdAt ?? new Date().toISOString(),
        marketTitle: fromHash.marketTitle ?? market?.title ?? 'Market',
        marketUnits: market?.xAxisUnits,
        lowerBound,
        upperBound,
        consensusAtBet: fromHash.consensusAtBet ?? null,
        expiresAt: fromHash.expiresAt ?? (market as any)?.expiresAt ?? null,
      };
    }
    return null;
  }, [local, fromHash, demo, market, marketId, positionId]);

  // Render the loading screen only when we have nothing to draw yet —
  // no local ledger entry, no share-hash payload, and the market is
  // still in flight without an error. Once any one of those resolves
  // (or errors), we fall through and either render the receipt or
  // show the empty state.
  if (!merged && marketLoading) {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
        <EditorialLoading
          eyebrow="Developing the receipt"
          lines={[
            'Pulling consensus from the wire…',
            'Reading the latest crowd opinion…',
            'Setting the print on the page…',
          ]}
        />
      </div>
    );
  }
  if (!merged) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <EditorialEmpty
          eyebrow="No receipt found"
          headline="This receipt is not in the archive."
          body={
            marketError
              ? 'The engine could not return this market right now, and we have no local copy of this receipt. Try opening the original share link, or browse the discover page.'
              : 'Either the share link is incomplete, the bet was placed on a different device, or the original receipt was deleted. The market itself is still live.'
          }
          action={{ label: `View market →`, href: `/m/${encodeURIComponent(String(marketId))}` }}
        />
      </div>
    );
  }

  // If this is a demo bet, synthesize a "resolved" market state from
  // the pre-baked __demoOutcome so the polaroid renders with its
  // outcome marker and rarity stamp — exactly like a real settled bet.
  const demoOutcome = (merged as BetRecord & { __demoOutcome?: number }).__demoOutcome;
  const effectiveResolutionState = market?.resolutionState ?? (demoOutcome != null ? 'resolved' : undefined);
  const effectiveResolvedOutcome = (market as any)?.resolvedOutcome ?? demoOutcome ?? null;

  return (
    <ReceiptView
      merged={merged}
      marketResolutionState={effectiveResolutionState}
      resolvedOutcome={effectiveResolvedOutcome}
      fresh={isFresh}
    />
  );
}

function ReceiptView({
  merged,
  marketResolutionState,
  resolvedOutcome,
  fresh,
}: {
  merged: ReturnType<typeof getBet> | NonNullable<ReturnType<typeof getBet>>;
  marketResolutionState?: string;
  resolvedOutcome: number | null;
  fresh?: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'shared' | 'embedded' | 'markdown' | 'markdown-error'>('idle');
  const [showCelebration, setShowCelebration] = useState(false);
  // (Previous local `downloadState` removed; the ShareKit owns this state now.)
  const polaroidRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const { user, isAuthenticated } = useAuth();
  // Curated Studio Pick galleries ship with synthetic market IDs that
  // are not real engine markets. Hitting the SDK with these IDs yields
  // 422s on every fetch + every poll + every focus event, which floods
  // the console and pins the live drift / sparkline / comparison cards
  // in their loading skeletons. We compute `isDemo` once from the
  // merged record's marketId and pass `enabled={!isDemo}` through to
  // every SDK-bound child here so the demo path stays silent and the
  // page renders entirely from the demo bet's pre-baked payload.
  const isDemo = useMemo(() => isDemoMarketId(String(merged.marketId)), [merged.marketId]);

  // Cash-out state: starts from localStorage so the stamp survives a
  // page reload before the SDK cache surfaces the position as sold.
  // The CashOutPanel's `onCashedOut` callback hands us the freshly
  // sold record on success, which we use to play the stamp landing
  // animation exactly once (`landingPending` flag).
  const [cashedOut, setCashedOut] = useState<CashOutRecord | null>(() => {
    if (!merged) return null;
    return getCashOut(merged.marketId, merged.positionId);
  });
  const [landingPending, setLandingPending] = useState(false);

  useEffect(() => {
    if (fresh) {
      setShowCelebration(true);
      const t = setTimeout(() => setShowCelebration(false), 2400);
      return () => clearTimeout(t);
    }
  }, [fresh]);

  if (!merged) return null;

  const sharePayload = {
    reasoning: merged.reasoning,
    conviction: merged.conviction,
    username: merged.username,
    prediction: merged.prediction,
    spread: merged.spread,
    // Persist the second bimodal peak in share + embed URLs so a
    // shared link replays the same two-peak silhouette the chart
    // drew at bet time. Only relevant when shape === 'bimodal'; the
    // hash decoder treats null / undefined as "fall back to the
    // legacy symmetric reconstruction".
    secondPeak: merged.shape === 'bimodal' ? merged.secondPeak ?? null : null,
    shape: merged.shape,
    collateral: merged.collateral,
    createdAt: merged.createdAt,
    marketTitle: merged.marketTitle,
    consensusAtBet: merged.consensusAtBet ?? null,
    expiresAt: (merged as any).expiresAt ?? null,
  };

  const shareUrl = buildShareUrl(
    `/r/${encodeURIComponent(String(merged.marketId))}/${encodeURIComponent(String(merged.positionId))}`,
    sharePayload,
  );
  const embedUrl = buildEmbedUrl(merged.marketId, merged.positionId, sharePayload);
  const embedCode = `<iframe src="${embedUrl}" width="340" height="450" style="border:none;" loading="lazy"></iframe>`;

  const onCopyShare = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopyState('shared');
    setTimeout(() => setCopyState('idle'), 1500);
  };
  const onCopyEmbed = async () => {
    await navigator.clipboard.writeText(embedCode);
    setCopyState('embedded');
    setTimeout(() => setCopyState('idle'), 1500);
  };

  const onCopyMarkdown = async () => {
    const md = buildMarkdownReceipt({
      username: merged.username,
      reasoning: merged.reasoning,
      marketTitle: merged.marketTitle ?? 'this market',
      marketUnits: merged.marketUnits,
      prediction: merged.prediction,
      collateral: merged.collateral,
      conviction: merged.conviction,
      shape: merged.shape,
      createdAt: merged.createdAt,
      shareUrl,
      embedUrl,
      resolutionState: marketResolutionState,
      resolvedOutcome,
      consensusAtBet: merged.consensusAtBet ?? null,
      lowerBound: merged.lowerBound,
      upperBound: merged.upperBound,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
        setCopyState('markdown');
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch {
      setCopyState('markdown-error');
    }
    setTimeout(() => setCopyState('idle'), 2000);
  };

  // Receipt page polaroid sizing.
  //
  // Polaroid sizing.
  //
  // The receipt page renders inside a `maxWidth: 1120` container with
  // `padding: 0 24` (so the content area is at most 1072 px), then
  // inside a `1fr 1fr` grid with `gap: 56`. The right column on a
  // 1120-wide-or-larger viewport tops out at (1120 - 48 - 56) / 2 =
  // 508 px. On NARROWER viewports (e.g. a 1024-wide window like the
  // user's screenshot), the right column shrinks to (1024 - 48 - 56)
  // / 2 = 460 px -- which is LESS than our desired 480 px polaroid.
  //
  // Previous attempt: pin the wrapper to `width: 480, height: 720`.
  // That broke on the 1024-wide viewport because the grid cell
  // capped the wrapper's WIDTH at ~460 px (grid items can't push
  // their cell wider than `1fr` allows) but the wrapper's HEIGHT
  // stayed pinned at 720 px. The SVG inside, with the global CSS
  // rule `max-width: 100%; height: auto; aspect-ratio: 2/3`, then
  // sized down to 460 x 690, leaving 30 px of empty matte at the
  // bottom of the wrapper -- exactly the "polaroid is cut off, the
  // caption is missing" bug the user kept reporting.
  //
  // The fix: the wrapper expresses width as a UPPER BOUND
  // (`maxWidth: polaroidWidth`) and height as a derived property
  // (`aspectRatio: '2/3'`). When the grid cell shrinks the
  // wrapper, BOTH dimensions shrink in lockstep, the SVG inside
  // (also `width: 100%, height: 100%`) tracks them exactly, and
  // the caption strip stays visible at every viewport.
  const polaroidWidth = isMobile ? 300 : 480;
  const isOwner = user?.username === merged.username;
  const isOpen = marketResolutionState !== 'resolved' && marketResolutionState !== 'voided';
  const showCashOutPanel = isOwner && isOpen && cashedOut == null;
  const showCashedStamp = cashedOut != null;

  // The "SHARE THIS CONVICTION" panel — embed-code copy + markdown
  // copy + share-link copy. The user explicitly asked to relocate
  // this from the bottom of the LEFT column (where it used to sit
  // beneath the consensus drift sparkline) to UNDER the polaroid on
  // the RIGHT column, so the receipt's actionable share surface
  // stays anchored to the artifact people are sharing. We render
  // the panel here so it can be slotted into polaroidNode below
  // ShareKit and above the cross-link.
  const shareBlockNode = (
    <div
      data-testid="receipt-share-embed-block"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 8,
        padding: 20,
        width: '100%',
        maxWidth: polaroidWidth,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute, letterSpacing: 1.2, marginBottom: 10 }}>
        SHARE THIS CONVICTION
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onCopyShare} style={primaryButton}>
          {copyState === 'shared' ? 'Link copied ✓' : 'Copy share link'}
        </button>
        <button onClick={onCopyEmbed} style={secondaryButton}>
          {copyState === 'embedded' ? 'Embed copied ✓' : 'Copy embed code'}
        </button>
        <button onClick={onCopyMarkdown} style={secondaryButton} title="Copy a quote-block snippet for Substack, GitHub, Notion, or any blog editor">
          {copyState === 'markdown' && 'Markdown copied ✓'}
          {copyState === 'markdown-error' && 'Copy failed'}
          {copyState !== 'markdown' && copyState !== 'markdown-error' && 'Copy as Markdown'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          background: palette.paper,
          border: `1px solid ${palette.rule}`,
          borderRadius: 6,
          padding: '10px 12px',
          fontFamily: fonts.mono,
          fontSize: 11,
          color: palette.inkSoft,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {embedCode}
      </pre>
      <p style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkMute, lineHeight: 1.5, margin: '14px 0 0' }}>
        The embed widget is iframe-friendly and self-contained. Drop it in any blog, Substack, Notion page, or
        forum reply — the receipt auto-develops on resolution.
      </p>
    </div>
  );

  // The wrapper is the absolute-positioning context for the
  // `CashedOutStamp` overlay and the `ShareKit` PNG-export ref. It
  // doubles as the visual "frame" the user perceives around the
  // artifact.
  //
  // BOTH wrapper dimensions are set as explicit pixel values via JS:
  //
  //   - We measure the FLEX CONTAINER (the wrapper's parent)
  //     synchronously via `useLayoutEffect` and refresh on every
  //     resize via `ResizeObserver`.
  //   - The wrapper's pixel width is `min(measured-container-width,
  //     polaroidWidth)`, so the wrapper fits in the column on
  //     narrow viewports but never grows past the editorial cap on
  //     wide viewports.
  //   - The wrapper's pixel height is exactly `width * 1.5`, the
  //     polaroid's 2:3 portrait ratio expressed as a concrete
  //     number.
  //
  // The Polaroid SVG inside is then rendered with `fillParent`,
  // which adds INLINE
  // `position: absolute; inset: 0; width: 100%; height: 100%` on
  // the SVG element. The SVG fills the wrapper's concrete pixel
  // rectangle to the pixel.
  //
  // No CSS layout property (width: 100%, max-width, aspect-ratio,
  // padding-bottom, height: auto, flex-item sizing, align-items)
  // is in the load-bearing position any more. The wrapper is a
  // pixel rectangle from React state, the SVG is inline-styled to
  // fill it. Every previous regression (the wrapper rendering as
  // a square, the caption clipped, the "fraction of a second
  // correct then breaks" follow-up render) was a CSS layout path
  // failing on the live receipt grid. There is now no CSS layout
  // path between "wrapper has these dimensions" and "SVG fills
  // those dimensions".
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [polaroidPixelWidth, setPolaroidPixelWidth] = useState<number>(polaroidWidth);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) setPolaroidPixelWidth(Math.min(w, polaroidWidth));
    };
    compute();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [polaroidWidth]);
  const polaroidPixelHeight = Math.round(polaroidPixelWidth * 1.5);

  const polaroidNode = (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}
    >
      <div
        ref={polaroidRef}
        style={{
          position: 'relative',
          width: polaroidPixelWidth,
          height: polaroidPixelHeight,
          flexShrink: 0,
        }}
        data-testid="receipt-polaroid-frame"
      >
        <Polaroid
          marketId={merged.marketId}
          positionId={merged.positionId}
          marketTitle={merged.marketTitle ?? ''}
          marketUnits={merged.marketUnits}
          username={merged.username}
          reasoning={merged.reasoning}
          createdAt={merged.createdAt}
          prediction={merged.prediction}
          spread={merged.spread}
          secondPeak={merged.shape === 'bimodal' ? merged.secondPeak ?? null : null}
          conviction={merged.conviction}
          collateral={merged.collateral}
          shape={merged.shape}
          lowerBound={merged.lowerBound ?? 0}
          upperBound={merged.upperBound ?? 1}
          resolutionState={marketResolutionState}
          resolvedOutcome={resolvedOutcome}
          width={polaroidWidth}
          animateDevelop
          consensusAtBet={merged.consensusAtBet ?? null}
          expiresAt={(merged as any).expiresAt ?? null}
          // Inline-fill the wrapper's measured pixel box. See the
          // wrapper sizing comment above and the `fillParent` prop
          // doc on Polaroid.tsx for the full rationale.
          fillParent
        />
        {showCashedStamp && cashedOut && (
          <CashedOutStamp
            polaroidWidth={polaroidWidth}
            realizedPnl={cashedOut.realizedPnl}
            animateLanding={landingPending}
          />
        )}
      </div>
      {/* Unified share kit. Wraps Web Share API (file-bearing on
          mobile / modern Chromium), Twitter intent fallback on
          desktop, a copy-link button, and the existing 2x DPR
          PNG download — all behind one editorial pill row. The
          previous standalone "Download as PNG" button is now the
          third action in this kit, so the receipt page no longer
          has TWO separate share affordances. */}
      <ShareKit
        polaroidRef={polaroidRef}
        shareUrl={typeof window !== 'undefined' ? window.location.href : ''}
        username={merged.username}
        marketTitle={merged.marketTitle ?? 'a market'}
      />
      {shareBlockNode}
      <Link
        to={`/u/${encodeURIComponent(merged.username)}`}
        style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, textDecoration: 'none', marginTop: 4 }}
      >
        See @{merged.username}'s other convictions →
      </Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '20px 16px 56px' : '32px 24px 80px' }}>
      <Link to="/discover" style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, textDecoration: 'none' }}>
        ← Back to Discover
      </Link>
      {showCelebration && (
        <div
          style={{
            background: palette.jade,
            color: palette.card,
            padding: '12px 18px',
            borderRadius: 6,
            fontFamily: fonts.body,
            fontSize: 14,
            marginTop: 16,
            boxShadow: `0 4px 12px ${palette.shadow}`,
            animation: 'fadein 220ms ease-out',
          }}
        >
          ✓ Conviction signed. Your receipt is now part of the public record.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? 28 : 56,
          marginTop: isMobile ? 16 : 24,
          alignItems: 'start',
        }}
      >
        {isMobile && polaroidNode}
        <div style={{ paddingTop: isMobile ? 0 : 16 }}>
          <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.6 }}>
            RECEIPT · {marketResolutionState === 'resolved' ? 'SETTLED' : 'PENDING'}
          </span>
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 30 : 44,
              fontWeight: 700,
              color: palette.ink,
              margin: '8px 0 14px',
              letterSpacing: -0.7,
              lineHeight: 1.05,
            }}
          >
            "{merged.marketTitle}"
          </h1>
          <p
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 18 : 22,
              color: palette.inkSoft,
              fontStyle: 'italic',
              lineHeight: 1.45,
              marginTop: 8,
              marginBottom: isMobile ? 22 : 28,
            }}
          >
            {merged.reasoning}
          </p>

          <div
            style={{
              display: 'flex',
              gap: isMobile ? 18 : 30,
              fontFamily: fonts.mono,
              fontSize: 12,
              color: palette.inkMute,
              letterSpacing: 0.4,
              marginBottom: isMobile ? 24 : 32,
              flexWrap: 'wrap',
            }}
          >
            <Stat k="HANDLE" v={`@${merged.username}`} />
            <Stat k="STAKE" v={`$${merged.collateral}`} />
            <Stat k="CONVICTION" v={`${Math.round(merged.conviction * 10)}/10`} />
            <Stat k="SHAPE" v={merged.shape.toUpperCase()} />
          </div>

          {/* On-device Ed25519 verify badge. Recomputes the canonical
              fingerprint from the LIVE receipt fields and verifies it
              against the stored signature; the badge flips between
              `verified`, `tampered`, `invalid`, `unsigned`, and
              `unsupported` automatically. Receipts authored before
              this feature shipped (or on hosts without Ed25519)
              simply render the muted "no on-device signature" pill -
              the rest of the receipt continues working unchanged. */}
          <div style={{ marginBottom: isMobile ? 16 : 20 }}>
            <VerifiedReceiptBadge
              signature={(merged as any)?.signature ?? null}
              inputs={{
                marketId: merged.marketId,
                positionId: merged.positionId,
                username: merged.username,
                prediction: merged.prediction,
                conviction: merged.conviction,
                collateral: merged.collateral,
                spread: merged.spread,
                shape: merged.shape,
                reasoning: merged.reasoning,
                createdAt: merged.createdAt,
              }}
              compact={isMobile}
            />
          </div>

          {/* Demo-bet notice. Curated Studio Pick galleries ship with
              synthetic market IDs that are not on the engine, so the
              live drift / drift-sparkline / crowd-comparison blocks are
              suppressed (they would 422 forever). We show a single
              honest editorial line in their place so the column doesn't
              read as broken. */}
          {isDemo && (
            <div
              data-testid="receipt-demo-notice"
              style={{
                marginBottom: 16,
                padding: '14px 16px',
                background: palette.card,
                border: `1px dashed ${palette.rule}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10.5,
                  letterSpacing: 1.6,
                  color: palette.ember,
                  fontWeight: 600,
                }}
              >
                STUDIO PICK · CURATED DEMO
              </div>
              <div
                style={{
                  fontFamily: fonts.body,
                  fontSize: 12.5,
                  color: palette.inkMute,
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                This is a hand-curated example receipt. Live drift,
                history sparkline, and crowd comparison are disabled —
                this market doesn't exist on the live engine. The
                polaroid still reflects the original conviction exactly
                as it was signed.
              </div>
            </div>
          )}

          {/* Live consensus drift card. Drives the "this receipt is a
              living object" feel by polling the market every 5 seconds
              and showing where the crowd has moved since the user
              placed the bet. For resolved markets it pivots to a
              settled-outcome stamp instead. The rarity calculation
              still uses the pinned consensus-at-bet snapshot, so
              rarity stays stable - this card is purely an additive
              live overlay. */}
          <div style={{ marginBottom: 16 }} data-testid="receipt-live-drift">
            <LiveConsensusCard
              marketId={merged.marketId}
              consensusAtBet={merged.consensusAtBet ?? null}
              prediction={merged.prediction}
              lowerBound={merged.lowerBound ?? 0}
              upperBound={merged.upperBound ?? 1}
              marketUnits={merged.marketUnits ?? ''}
              enabled={!isDemo}
            />
          </div>

          {/* Challenge this call -- the "Receipt for Receipt" mechanic.
              Visible only when (a) the viewer is signed in, (b) the
              viewer is NOT the author, and (c) the market is still
              open. Clicking the button navigates to /m/:marketId with
              a `challenge` query parameter that the BetFlow page
              decodes to seed the sliders with a mirrored
              counter-prediction and a quoted reasoning blockquote.
              For authors / resolved markets / signed-out users the
              block hides itself, so a shared receipt link reads
              cleanly without the call-to-arms. */}
          {isAuthenticated && !isOwner && isOpen && (
            <ChallengeBlock
              marketId={merged.marketId}
              author={merged.username}
              isMobile={isMobile}
              payload={{
                reasoning: merged.reasoning,
                conviction: merged.conviction,
                username: merged.username,
                prediction: merged.prediction,
                spread: merged.spread,
                shape: merged.shape,
                collateral: merged.collateral,
                createdAt: merged.createdAt,
                marketTitle: merged.marketTitle,
                consensusAtBet: merged.consensusAtBet ?? null,
              }}
            />
          )}

          {/* Comparison pair — your call vs the crowd, side by side.
              Reads the live consensus density from useConsensus,
              integrates it into a {mean, spread, conviction} triple,
              and renders a "crowd polaroid" next to the user's. The
              receipt becomes a two-up editorial spread: same world,
              two convictions about it. */}
          <ComparisonPair
            marketId={merged.marketId}
            positionId={merged.positionId}
            marketTitle={merged.marketTitle ?? ''}
            marketUnits={merged.marketUnits ?? ''}
            lowerBound={merged.lowerBound ?? 0}
            upperBound={merged.upperBound ?? 1}
            userBet={{
              username: merged.username,
              reasoning: merged.reasoning,
              createdAt: merged.createdAt,
              prediction: merged.prediction,
              spread: merged.spread,
              conviction: merged.conviction,
              collateral: merged.collateral,
              shape: merged.shape,
              consensusAtBet: merged.consensusAtBet ?? null,
            }}
            resolutionState={marketResolutionState}
            resolvedOutcome={resolvedOutcome}
            width={isMobile ? 260 : 320}
            isMobile={isMobile}
            enabled={!isDemo}
          />

          {/* Macro-historical consensus drift sparkline. Pulls the
              full snapshot history for this market (useMarketHistory)
              every 60s and renders a compact path of the consensus
              mean over time, overlaid with the user's prediction line
              and a "you signed here" caret. This turns the receipt
              from "your single moment in time" into "your moment in
              the wider arc of crowd opinion." */}
          <ConsensusDriftSparkline
            marketId={String(merged.marketId)}
            prediction={merged.prediction}
            consensusAtBet={merged.consensusAtBet ?? null}
            lowerBound={merged.lowerBound ?? 0}
            upperBound={merged.upperBound ?? 1}
            marketUnits={merged.marketUnits ?? ''}
            createdAt={merged.createdAt}
            compact={isMobile}
            enabled={!isDemo}
          />

          {/* Cash-out panel. Visible only to the bet author while the
              market is still open AND the position hasn't been cashed
              out already. Pulls a live preview-sell from the engine on
              a 10 s poll, then on confirm executes useSell and writes
              a CashOutRecord to localStorage so the polaroid receives
              a "CASHED OUT" stamp overlay immediately - no waiting
              for the SDK cache to surface position.status === 'sold'. */}
          {showCashOutPanel && (
            <div style={{ marginBottom: 16 }} data-testid="receipt-cashout">
              <CashOutPanel
                marketId={merged.marketId}
                positionId={merged.positionId}
                originalCollateral={merged.collateral}
                onCashedOut={(record) => {
                  setCashedOut(record);
                  setLandingPending(true);
                  // Drop the landing flag after the stamp animation
                  // completes so subsequent re-renders don't replay it.
                  window.setTimeout(() => setLandingPending(false), 500);
                }}
              />
            </div>
          )}

          {/* Realized cash-out summary - shown to everyone (not just the
              author) so a shared receipt link communicates that the
              position has been closed. The stamp on the polaroid carries
              the visual; this is the human-readable detail row. */}
          {cashedOut && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                background: palette.card,
                border: `1px solid ${palette.rule}`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
              data-testid="receipt-cashout-summary"
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10.5,
                  letterSpacing: 1.4,
                  color: palette.rose,
                  fontWeight: 600,
                }}
              >
                POSITION CLOSED
              </span>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  color: palette.inkSoft,
                  marginTop: 2,
                }}
              >
                {cashedOut.realizedPnl >= 0
                  ? `Cashed out for $${cashedOut.collateralReturned.toFixed(2)} (+$${cashedOut.realizedPnl.toFixed(2)} from a $${cashedOut.originalCollateral.toFixed(2)} stake).`
                  : `Cashed out for $${cashedOut.collateralReturned.toFixed(2)} (loss of $${Math.abs(cashedOut.realizedPnl).toFixed(2)} from a $${cashedOut.originalCollateral.toFixed(2)} stake).`}
              </span>
            </div>
          )}

          {/* The "SHARE THIS CONVICTION" embed/markdown panel that used
              to sit here as the closing block of the left column has
              been relocated to UNDER the polaroid on the right column
              (see `shareBlockNode` above). Anchoring share actions to
              the artifact being shared reads better as an editorial
              spread and keeps the long-text column focused on the
              conviction narrative itself. */}
        </div>

        {!isMobile && polaroidNode}
      </div>

      <style>{`@keyframes fadein { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: palette.inkFade, letterSpacing: 1.4, marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 13, color: palette.ink, fontWeight: 600 }}>{v}</div>
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  padding: '10px 16px',
  background: palette.ember,
  color: palette.card,
  border: 'none',
  borderRadius: 6,
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: 0.3,
};

const secondaryButton: React.CSSProperties = {
  padding: '10px 16px',
  background: palette.card,
  color: palette.inkSoft,
  border: `1px solid ${palette.rule}`,
  borderRadius: 6,
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: 0.3,
};

/**
 * Receipt-for-Receipt CTA. Rendered only when the viewer is signed in,
 * is NOT the author, and the market is still open. The button is
 * accessible as a plain anchor so middle-click / cmd-click open the
 * challenge in a new tab (same behaviour as the rest of the editorial
 * links on this page).
 */
function ChallengeBlock({
  marketId,
  author,
  isMobile,
  payload,
}: {
  marketId: string | number;
  author: string;
  isMobile: boolean;
  payload: Parameters<typeof buildChallengeUrl>[1];
}) {
  const href = buildChallengeUrl(marketId, payload);
  return (
    <div
      data-testid="receipt-challenge-block"
      style={{
        marginBottom: 16,
        padding: isMobile ? '14px 16px' : '16px 18px',
        background: palette.card,
        border: `1px dashed ${palette.teal}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10.5,
            letterSpacing: 1.4,
            color: palette.teal,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          RECEIPT FOR RECEIPT
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 14 : 15,
            fontWeight: 600,
            color: palette.ink,
            lineHeight: 1.4,
          }}
        >
          Think @{author} is wrong? Sign a counter-conviction.
        </div>
      </div>
      <Link
        to={href}
        data-testid="receipt-challenge-button"
        style={{
          padding: '10px 16px',
          background: palette.teal,
          color: palette.card,
          border: 'none',
          borderRadius: 6,
          fontFamily: fonts.body,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: 0.3,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Challenge this call →
      </Link>
    </div>
  );
}
