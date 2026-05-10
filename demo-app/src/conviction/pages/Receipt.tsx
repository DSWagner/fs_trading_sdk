import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMarket } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from '../components/Polaroid';
import { getBet } from '../storage';
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

  const { market, loading: marketLoading } = useMarket(marketId);

  const local = useMemo(() => getBet(marketId, positionId), [marketId, positionId]);
  const fromHash = useMemo(() => readShareFromHash(), []);

  const merged = useMemo(() => {
    const base = local ?? null;
    if (base) return base;
    if (fromHash && market) {
      return {
        marketId,
        positionId,
        username: fromHash.username ?? 'someone',
        reasoning: fromHash.reasoning ?? '',
        conviction: fromHash.conviction ?? 0.5,
        prediction: fromHash.prediction ?? (market.consensusMean ?? 0),
        spread: fromHash.spread ?? Math.max(1, (market.config.upperBound - market.config.lowerBound) * 0.1),
        collateral: fromHash.collateral ?? 0,
        shape: (fromHash.shape ?? 'gaussian') as 'gaussian' | 'range' | 'bimodal',
        createdAt: fromHash.createdAt ?? new Date().toISOString(),
        marketTitle: market.title,
        marketUnits: market.xAxisUnits,
        lowerBound: market.config.lowerBound,
        upperBound: market.config.upperBound,
        preset: fromHash.preset,
      };
    }
    return null;
  }, [local, fromHash, market, marketId, positionId]);

  if (marketLoading || !market) {
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
          body="Either the share link is incomplete, the bet was placed on a different device, or the original receipt was deleted. The market itself is still live."
          action={{ label: `View market →`, href: `/m/${encodeURIComponent(String(marketId))}` }}
        />
      </div>
    );
  }

  return <ReceiptView merged={merged} marketResolutionState={market.resolutionState} resolvedOutcome={(market as any).resolvedOutcome ?? null} fresh={isFresh} />;
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
    preset: merged.preset,
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
    } catch {
      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 2400);
    }
  };

  const polaroidNode = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div ref={polaroidRef}>
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
          width={isMobile ? 300 : 420}
          preset={merged.preset}
          animateDevelop
        />
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
