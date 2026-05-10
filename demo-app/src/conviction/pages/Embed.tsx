import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMarket } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from '../components/Polaroid';
import { getBet } from '../storage';
import { readShareFromHash } from '../hash';

/**
 * Bare receipt for iframe embedding. No nav, no chrome, no auth required.
 * The receipt hydrates from URL hash payload first (so embeds work for anyone),
 * falling back to local cache.
 */
export function EmbedPage() {
  const { marketId: rawMarket = '', positionId: rawPos = '' } = useParams<{
    marketId: string;
    positionId: string;
  }>();
  const marketId = decodeURIComponent(rawMarket);
  const positionId = decodeURIComponent(rawPos);
  const fromHash = useMemo(() => readShareFromHash(), []);
  const local = useMemo(() => getBet(marketId, positionId), [marketId, positionId]);
  const { market } = useMarket(marketId);

  const merged = useMemo(() => {
    if (local) return local;
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
        marketTitle: fromHash.marketTitle ?? market.title,
        marketUnits: market.xAxisUnits,
        lowerBound: market.config.lowerBound,
        upperBound: market.config.upperBound,
        preset: fromHash.preset,
        consensusAtBet: fromHash.consensusAtBet ?? null,
      };
    }
    return null;
  }, [local, fromHash, market, marketId, positionId]);

  if (!merged) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: fonts.body,
          background: palette.paper,
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: 1.6,
            color: palette.ember,
            marginBottom: 8,
          }}
        >
          RECEIPT UNAVAILABLE
        </div>
        <div style={{ fontFamily: fonts.display, fontSize: 18, color: palette.ink, lineHeight: 1.3 }}>
          The link is missing the embedded payload. Visit conviction directly to see it in full.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: palette.paper,
        padding: 16,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        boxSizing: 'border-box',
      }}
    >
      <a
        href={`/r/${encodeURIComponent(String(merged.marketId))}/${encodeURIComponent(String(merged.positionId))}${typeof window !== 'undefined' ? window.location.hash : ''}`}
        target="_top"
        style={{ textDecoration: 'none', display: 'block' }}
      >
        <Polaroid
          marketId={merged.marketId}
          positionId={merged.positionId}
          marketTitle={merged.marketTitle ?? 'Market'}
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
          resolutionState={market?.resolutionState}
          resolvedOutcome={(market as any)?.resolvedOutcome ?? null}
          width={300}
          preset={merged.preset}
          consensusAtBet={(merged as any).consensusAtBet ?? null}
          interactive
        />
      </a>
      <a
        href="/"
        target="_top"
        style={{
          fontFamily: fonts.mono,
          fontSize: 9,
          letterSpacing: 1.5,
          color: palette.inkMute,
          textDecoration: 'none',
          marginTop: 'auto',
        }}
      >
        ◆ POWERED BY CONVICTION
      </a>
    </div>
  );
}
