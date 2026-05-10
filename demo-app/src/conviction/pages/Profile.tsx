import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, useMarkets } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from '../components/Polaroid';
import { getBetsByUser, type BetRecord } from '../storage';
import { useIsMobile } from '../useMediaQuery';
import { EditorialEmpty } from '../components/EditorialState';
import {
  calculateRarity,
  RARITY_ORDER,
  TIER_META,
  type Rarity,
} from '../rarity';

/**
 * Profile page: shows the user's full conviction record, the rarity ledger
 * (how many of each tier they've earned), the single best receipt, and a
 * micro-calibration sparkline showing how conviction maps to actual
 * accuracy across resolved bets.
 */

interface EnrichedBet {
  record: BetRecord;
  resolutionState: 'open' | 'resolved' | 'voided' | null;
  resolvedOutcome: number | null;
  rarity: Rarity | null;
  rarityScore: number;
  /** Accuracy in [0,1]; null for unresolved. */
  accuracy: number | null;
}

export function ProfilePage() {
  const { username = '' } = useParams<{ username: string }>();
  const cleanUsername = decodeURIComponent(username);
  const { user } = useAuth();
  const bets = useMemo(() => getBetsByUser(cleanUsername), [cleanUsername]);
  const isMobile = useIsMobile();
  const { markets } = useMarkets();

  const isOwn = user?.username === cleanUsername;

  const marketMap = useMemo(() => {
    const m = new Map<string, { resolutionState: 'open' | 'resolved' | 'voided'; resolvedOutcome: number | null }>();
    for (const mkt of markets ?? []) {
      m.set(String((mkt as any).marketId), {
        resolutionState: (mkt as any).resolutionState ?? 'open',
        resolvedOutcome: (mkt as any).resolvedOutcome ?? null,
      });
    }
    return m;
  }, [markets]);

  const enriched: EnrichedBet[] = useMemo(() => {
    return bets.map((bet) => {
      const m = marketMap.get(String(bet.marketId));
      const resolutionState = m?.resolutionState ?? null;
      const resolvedOutcome = m?.resolvedOutcome ?? null;
      let rarity: Rarity | null = null;
      let rarityScore = 0;
      let accuracy: number | null = null;
      if (
        resolutionState === 'resolved' &&
        resolvedOutcome != null &&
        bet.consensusAtBet != null &&
        bet.lowerBound != null &&
        bet.upperBound != null
      ) {
        const r = calculateRarity({
          prediction: bet.prediction,
          resolvedOutcome,
          consensusMean: bet.consensusAtBet,
          lowerBound: bet.lowerBound,
          upperBound: bet.upperBound,
        });
        rarity = r.tier;
        rarityScore = r.score;
        accuracy = r.accuracy;
      }
      return { record: bet, resolutionState, resolvedOutcome, rarity, rarityScore, accuracy };
    });
  }, [bets, marketMap]);

  const tierCounts = useMemo(() => {
    const counts: Record<Rarity, number> = {
      common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0,
    };
    for (const e of enriched) {
      if (e.rarity) counts[e.rarity] += 1;
    }
    return counts;
  }, [enriched]);

  const bestBet = useMemo(() => {
    let best: EnrichedBet | null = null;
    for (const e of enriched) {
      if (e.rarity && e.rarity !== 'common' && (!best || e.rarityScore > best.rarityScore)) {
        best = e;
      }
    }
    return best;
  }, [enriched]);

  const stats = useMemo(() => {
    if (bets.length === 0) return null;
    const total = bets.length;
    const totalStaked = bets.reduce((acc, b) => acc + b.collateral, 0);
    const avgConviction = bets.reduce((acc, b) => acc + b.conviction, 0) / total;
    const resolvedCount = enriched.filter((e) => e.resolutionState === 'resolved').length;
    return { total, totalStaked, avgConviction, resolvedCount };
  }, [bets, enriched]);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '32px 24px 80px' }}>
      <div
        style={{
          borderBottom: `1px solid ${palette.rule}`,
          paddingBottom: isMobile ? 20 : 28,
          marginBottom: isMobile ? 24 : 32,
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'flex-end',
          gap: isMobile ? 16 : 32,
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div>
          <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.6 }}>
            CONVICTION RECORD {isOwn ? '· YOU' : ''}
          </span>
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 40 : 60,
              fontWeight: 700,
              color: palette.ink,
              margin: '6px 0 0',
              letterSpacing: -1.5,
              lineHeight: 0.95,
              wordBreak: 'break-word',
            }}
          >
            @{cleanUsername}
          </h1>
        </div>
        {stats && (
          <div
            style={{
              display: 'flex',
              gap: isMobile ? 18 : 28,
              marginLeft: isMobile ? 0 : 'auto',
              paddingBottom: 4,
              flexWrap: 'wrap',
            }}
          >
            <Stat k="ON RECORD" v={String(stats.total)} mobile={isMobile} />
            <Stat k="RESOLVED" v={String(stats.resolvedCount)} mobile={isMobile} />
            <Stat k="TOTAL STAKED" v={`$${stats.totalStaked.toFixed(0)}`} mobile={isMobile} />
            <Stat k="AVG CONVICTION" v={`${Math.round(stats.avgConviction * 10)}/10`} mobile={isMobile} />
          </div>
        )}
      </div>

      {bets.length === 0 ? (
        <EmptyState isOwn={isOwn} username={cleanUsername} />
      ) : (
        <>
          <RarityLedger tierCounts={tierCounts} bestBet={bestBet} isMobile={isMobile} />
          <CalibrationCard enriched={enriched} isMobile={isMobile} />
          <h2
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 20 : 24,
              fontWeight: 700,
              color: palette.ink,
              letterSpacing: -0.3,
              margin: '40px 0 16px',
            }}
          >
            The archive
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 220 : 260}px, 1fr))`, gap: isMobile ? 18 : 28 }}>
            {enriched.map((e) => (
              <BetTile key={`${e.record.marketId}:${e.record.positionId}`} bet={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RarityLedger({
  tierCounts,
  bestBet,
  isMobile,
}: {
  tierCounts: Record<Rarity, number>;
  bestBet: EnrichedBet | null;
  isMobile: boolean;
}) {
  const totalRare = RARITY_ORDER.reduce((acc, t) => (t === 'common' ? acc : acc + tierCounts[t]), 0);
  return (
    <section
      style={{
        marginBottom: 28,
        padding: isMobile ? '16px' : '20px 24px',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
      }}
      data-testid="rarity-ledger"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.4, marginBottom: 4 }}>
            RARITY LEDGER
          </div>
          <div style={{ fontFamily: fonts.display, fontSize: isMobile ? 16 : 18, fontWeight: 600, color: palette.ink }}>
            {totalRare === 0
              ? 'No rare receipts yet. Bet contrarian, be right.'
              : `${totalRare} rare ${totalRare === 1 ? 'receipt' : 'receipts'} earned.`}
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)',
          gap: 10,
        }}
      >
        {RARITY_ORDER.map((tier) => {
          const meta = TIER_META[tier];
          const count = tierCounts[tier];
          const muted = count === 0;
          return (
            <div
              key={tier}
              data-testid={`rarity-cell-${tier}`}
              style={{
                padding: '10px 8px',
                background: muted ? palette.paper : meta.badgeFill,
                border: `1px solid ${muted ? palette.rule : meta.badgeStroke}`,
                borderRadius: 6,
                textAlign: 'center',
                opacity: muted ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 9.5,
                  letterSpacing: 1.4,
                  color: muted ? palette.inkMute : meta.badgeText,
                  marginBottom: 4,
                }}
              >
                {meta.label.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: isMobile ? 18 : 22,
                  fontWeight: 700,
                  color: muted ? palette.inkMute : meta.color,
                }}
              >
                {count}
              </div>
            </div>
          );
        })}
      </div>
      {bestBet && (
        <Link
          to={`/r/${encodeURIComponent(String(bestBet.record.marketId))}/${encodeURIComponent(String(bestBet.record.positionId))}`}
          style={{
            display: 'block',
            marginTop: 14,
            paddingTop: 14,
            borderTop: `1px solid ${palette.rule}`,
            textDecoration: 'none',
            color: palette.ink,
          }}
        >
          <div style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: palette.inkMute, marginBottom: 6 }}>
            BEST RECEIPT TO DATE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 10px',
                background: TIER_META[bestBet.rarity!].color,
                color: '#fff',
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.2,
                borderRadius: 999,
              }}
            >
              {TIER_META[bestBet.rarity!].label.toUpperCase()}
            </span>
            <span style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, color: palette.ink }}>
              {bestBet.record.marketTitle ?? 'Market'}
            </span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkMute }}>
              View receipt →
            </span>
          </div>
        </Link>
      )}
    </section>
  );
}

function CalibrationCard({
  enriched,
  isMobile,
}: {
  enriched: EnrichedBet[];
  isMobile: boolean;
}) {
  const resolved = enriched.filter((e) => e.accuracy != null);
  if (resolved.length === 0) {
    return null;
  }
  // Three buckets: low conviction (≤0.4), medium (≤0.7), high (>0.7).
  const buckets: Array<{ label: string; n: number; meanAccuracy: number; meanConviction: number }> = [
    { label: 'Low conviction', n: 0, meanAccuracy: 0, meanConviction: 0 },
    { label: 'Medium', n: 0, meanAccuracy: 0, meanConviction: 0 },
    { label: 'High conviction', n: 0, meanAccuracy: 0, meanConviction: 0 },
  ];
  for (const e of resolved) {
    const idx = e.record.conviction <= 0.4 ? 0 : e.record.conviction <= 0.7 ? 1 : 2;
    const b = buckets[idx];
    b.n += 1;
    b.meanAccuracy += e.accuracy!;
    b.meanConviction += e.record.conviction;
  }
  for (const b of buckets) {
    if (b.n > 0) {
      b.meanAccuracy /= b.n;
      b.meanConviction /= b.n;
    }
  }
  const max = 1;
  return (
    <section
      style={{
        marginBottom: 28,
        padding: isMobile ? '16px' : '20px 24px',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
      }}
      data-testid="calibration-card"
    >
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.4, marginBottom: 4 }}>
        CALIBRATION
      </div>
      <div style={{ fontFamily: fonts.display, fontSize: isMobile ? 16 : 18, fontWeight: 600, color: palette.ink, marginBottom: 14 }}>
        Are your high-conviction bets actually your most accurate?
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {buckets.map((b) => {
          const fillPct = b.n > 0 ? Math.round((b.meanAccuracy / max) * 100) : 0;
          const empty = b.n === 0;
          return (
            <div key={b.label} style={{ padding: '12px 10px', background: palette.paper, border: `1px solid ${palette.rule}`, borderRadius: 6 }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.3, color: palette.inkMute }}>
                {b.label.toUpperCase()}
              </div>
              <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, color: empty ? palette.inkMute : palette.ink, margin: '6px 0' }}>
                {empty ? '—' : `${fillPct}%`}
              </div>
              <div style={{ height: 6, background: palette.rule, borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${fillPct}%`,
                    height: '100%',
                    background: empty ? palette.inkMute : palette.ember,
                    transition: 'width 320ms',
                  }}
                />
              </div>
              <div style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.inkMute, marginTop: 6, letterSpacing: 0.5 }}>
                {b.n} {b.n === 1 ? 'bet' : 'bets'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BetTile({ bet }: { bet: EnrichedBet }) {
  const r = bet.record;
  return (
    <Link
      to={`/r/${encodeURIComponent(String(r.marketId))}/${encodeURIComponent(String(r.positionId))}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <Polaroid
        marketId={r.marketId}
        positionId={r.positionId}
        marketTitle={r.marketTitle ?? 'Market'}
        marketUnits={r.marketUnits}
        username={r.username}
        reasoning={r.reasoning}
        createdAt={r.createdAt}
        prediction={r.prediction}
        spread={r.spread}
        conviction={r.conviction}
        collateral={r.collateral}
        shape={r.shape}
        lowerBound={r.lowerBound ?? 0}
        upperBound={r.upperBound ?? 1}
        resolutionState={bet.resolutionState ?? 'open'}
        resolvedOutcome={bet.resolvedOutcome}
        consensusAtBet={r.consensusAtBet ?? null}
        expiresAt={r.expiresAt ?? null}
        width={260}
        interactive
      />
    </Link>
  );
}

function Stat({ k, v, mobile }: { k: string; v: string; mobile?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.inkMute, letterSpacing: 1.4, marginBottom: 4 }}>
        {k}
      </div>
      <div style={{ fontFamily: fonts.display, fontSize: mobile ? 22 : 28, color: palette.ink, fontWeight: 700, letterSpacing: -0.4 }}>
        {v}
      </div>
    </div>
  );
}

function EmptyState({ isOwn, username }: { isOwn: boolean; username: string }) {
  return (
    <EditorialEmpty
      eyebrow={isOwn ? 'Empty archive' : `@${username}`}
      headline={isOwn ? 'No record yet.' : `@${username} hasn\u2019t gone on the record yet.`}
      body={isOwn
        ? 'Your first conviction is the hardest. Pick a market \u2014 even a small stake creates a permanent receipt that future-you can stand by.'
        : 'Once they sign their first conviction, it shows up here \u2014 reasoning intact, claim timestamped.'}
      action={isOwn ? { label: 'Browse markets \u2192', href: '/discover' } : undefined}
    />
  );
}
