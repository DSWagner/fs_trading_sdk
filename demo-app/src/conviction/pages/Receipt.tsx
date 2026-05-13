import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMarket, useAuth } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from '../components/Polaroid';
import { LiveConsensusCard } from '../components/LiveConsensusCard';
import { CashOutPanel } from '../components/CashOutPanel';
import { CashedOutStamp } from '../components/CashedOutStamp';
import { getBet, getCashOut, type CashOutRecord, type BetRecord } from '../storage';
import { getDemoBet } from '../demoGalleries';
import { buildEmbedUrl, buildShareUrl, readShareFromHash } from '../hash';
import { useIsMobile } from '../useMediaQuery';
import { downloadPolaroidPng } from '../components/downloadPolaroid';
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
    pollInterval: 5_000,
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
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const polaroidRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const { user } = useAuth();

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

  const onDownload = async () => {
    setDownloadState('busy');
    try {
      const safeName = `conviction-${String(merged.marketId)}-${String(merged.positionId)}.png`
        .replace(/[^a-z0-9._-]/gi, '_');
      await downloadPolaroidPng(polaroidRef.current, safeName);
      setDownloadState('done');
      setTimeout(() => setDownloadState('idle'), 1800);
    } catch (err) {
      console.error('[Polaroid download] failed:', err);
      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 2400);
    }
  };

  const polaroidWidth = isMobile ? 300 : 420;
  const isOwner = user?.username === merged.username;
  const isOpen = marketResolutionState !== 'resolved' && marketResolutionState !== 'voided';
  const showCashOutPanel = isOwner && isOpen && cashedOut == null;
  const showCashedStamp = cashedOut != null;

  const polaroidNode = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div
        ref={polaroidRef}
        style={{ position: 'relative', display: 'inline-block' }}
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
        />
        {showCashedStamp && cashedOut && (
          <CashedOutStamp
            polaroidWidth={polaroidWidth}
            realizedPnl={cashedOut.realizedPnl}
            animateLanding={landingPending}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadState === 'busy'}
          style={{
            padding: '8px 14px',
            background: 'transparent',
            color: palette.inkSoft,
            border: `1px solid ${palette.rule}`,
            borderRadius: 6,
            fontFamily: fonts.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: downloadState === 'busy' ? 'wait' : 'pointer',
            letterSpacing: 0.3,
          }}
        >
          {downloadState === 'busy' && 'Rendering…'}
          {downloadState === 'done' && 'Saved ✓'}
          {downloadState === 'error' && 'Try again'}
          {downloadState === 'idle' && 'Download as PNG'}
        </button>
        <Link
          to={`/u/${encodeURIComponent(merged.username)}`}
          style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, textDecoration: 'none' }}
        >
          See @{merged.username}'s other convictions →
        </Link>
      </div>
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
            />
          </div>

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

          <div
            style={{
              background: palette.card,
              border: `1px solid ${palette.rule}`,
              borderRadius: 8,
              padding: 20,
              marginBottom: 16,
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
          </div>
          <p style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, lineHeight: 1.5, marginTop: 18 }}>
            The embed widget is iframe-friendly and self-contained. Drop it in any blog, Substack, Notion page, or
            forum reply. The receipt automatically develops on resolution — no maintenance required.
          </p>
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
