import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarkets } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { getAllBets, type BetRecord } from '../storage';
import { useIsMobile } from '../useMediaQuery';
import { Polaroid } from '../components/Polaroid';
import { EditorialEmpty } from '../components/EditorialState';
import { DEMO_GALLERIES } from '../demoGalleries';
import {
  calculateRarity,
  RARITY_ORDER,
  TIER_META,
  type Rarity,
} from '../rarity';

/**
 * Explore — browse the convictions of every user on this device.
 *
 * Conviction is client-side: bet records live in localStorage. The
 * Explore page surfaces every distinct username that has placed a bet
 * (their own or, in a shared-device scenario, any guest), ranks them
 * by their best receipt, and exposes a public-facing entry into each
 * gallery via the existing /u/:username profile route.
 *
 * The page also auto-includes a small set of curated demo galleries —
 * "studio convictions" — so first-time visitors who haven't placed any
 * bets yet still see something worth browsing. In production these
 * would come from an aggregated server-side index; here they're
 * generated locally to keep the SDK demo zero-backend.
 */

interface GalleryEntry {
  username: string;
  bets: BetRecord[];
  enrichedBets: EnrichedBet[];
  bestRarity: Rarity | null;
  bestRarityScore: number;
  tierCounts: Record<Rarity, number>;
  totalStaked: number;
  isDemo: boolean;
}

interface EnrichedBet {
  bet: BetRecord;
  rarity: Rarity | null;
  rarityScore: number;
  resolutionState: 'open' | 'resolved' | 'voided' | null;
  resolvedOutcome: number | null;
}

export function ExplorePage() {
  const isMobile = useIsMobile();
  const { markets } = useMarkets();

  const marketMap = useMemo(() => {
    const m = new Map<string, { resolutionState: 'open' | 'resolved' | 'voided'; resolvedOutcome: number | null; expiresAt: string | null }>();
    for (const mkt of markets ?? []) {
      m.set(String((mkt as any).marketId), {
        resolutionState: (mkt as any).resolutionState ?? 'open',
        resolvedOutcome: (mkt as any).resolvedOutcome ?? null,
        expiresAt: (mkt as any).expiresAt ?? null,
      });
    }
    return m;
  }, [markets]);

  const entries: GalleryEntry[] = useMemo(() => {
    const all = getAllBets();
    const byUser = new Map<string, BetRecord[]>();
    for (const b of all) {
      const key = b.username || 'anonymous';
      const arr = byUser.get(key) ?? [];
      arr.push(b);
      byUser.set(key, arr);
    }
    const list: GalleryEntry[] = [];
    for (const [username, bets] of byUser) {
      list.push(enrichEntry(username, bets, marketMap, false));
    }
    // Sort: real users by best-tier desc, then by bet count.
    list.sort((a, b) => {
      const ra = a.bestRarityScore;
      const rb = b.bestRarityScore;
      if (ra !== rb) return rb - ra;
      return b.bets.length - a.bets.length;
    });

    // Always include demo galleries (small set) so the page is never empty.
    const demos = DEMO_GALLERIES.map((dg) => enrichEntry(dg.username, dg.bets, marketMap, true));
    return [...list, ...demos];
  }, [marketMap]);

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '36px 24px 80px' }}>
      <div style={{ borderBottom: `1px solid ${palette.rule}`, paddingBottom: isMobile ? 12 : 16, marginBottom: isMobile ? 24 : 32 }}>
        <span style={{ fontFamily: fonts.mono, color: palette.ember, fontSize: 11, letterSpacing: 1.8 }}>
          THE GALLERIES
        </span>
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 38 : 56,
            fontWeight: 700,
            color: palette.ink,
            margin: '6px 0 12px',
            letterSpacing: -1.2,
            lineHeight: 1,
          }}
        >
          Browse other people's convictions.
        </h1>
        <p
          style={{
            fontFamily: fonts.body,
            fontSize: isMobile ? 15 : 17,
            color: palette.inkSoft,
            margin: 0,
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          Every signed receipt becomes part of a public archive. Open a gallery to read each conviction in
          context — the why, the call, the outcome, the rarity earned.
        </p>
      </div>

      {entries.length === 0 ? (
        <EditorialEmpty
          eyebrow="Empty shelves"
          headline="No galleries yet."
          body="Convictions you (or other users on this device) place will appear here. Place your first bet and you'll be the first name on the wall."
          action={{ label: 'Browse markets →', href: '/discover' }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 280 : 340}px, 1fr))`,
            gap: isMobile ? 20 : 28,
          }}
        >
          {entries.map((entry) => (
            <GalleryCard key={entry.username + (entry.isDemo ? '-demo' : '')} entry={entry} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryCard({ entry, isMobile }: { entry: GalleryEntry; isMobile: boolean }) {
  const total = entry.bets.length;
  const resolved = entry.enrichedBets.filter((e) => e.resolutionState === 'resolved').length;
  const rareCount = RARITY_ORDER.reduce((acc, t) => (t === 'common' ? acc : acc + entry.tierCounts[t]), 0);

  // Pick the user's best bet to feature inside the card.
  const featured = entry.enrichedBets
    .slice()
    .sort((a, b) => b.rarityScore - a.rarityScore)[0];

  return (
    <Link
      to={`/u/${encodeURIComponent(entry.username)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textDecoration: 'none',
        padding: isMobile ? 16 : 20,
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
        color: palette.ink,
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        boxShadow: `0 1px 0 ${palette.rule}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 20px ${palette.shadow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = `0 1px 0 ${palette.rule}`;
      }}
      data-testid="gallery-card"
      data-username={entry.username}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.inkMute, letterSpacing: 1.4 }}>
            {entry.isDemo ? 'STUDIO PICK' : 'GALLERY'}
          </div>
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 22 : 26,
              fontWeight: 700,
              color: palette.ink,
              letterSpacing: -0.4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            @{entry.username}
          </div>
        </div>
        {entry.bestRarity && entry.bestRarity !== 'common' && (
          <span
            style={{
              padding: '4px 10px',
              background: TIER_META[entry.bestRarity].color,
              color: '#fff',
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.2,
              borderRadius: 999,
              whiteSpace: 'nowrap',
            }}
          >
            {TIER_META[entry.bestRarity].label.toUpperCase()}
          </span>
        )}
      </div>

      {featured && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Polaroid
            marketId={featured.bet.marketId}
            positionId={featured.bet.positionId}
            marketTitle={featured.bet.marketTitle ?? 'Market'}
            marketUnits={featured.bet.marketUnits}
            username={featured.bet.username}
            reasoning={featured.bet.reasoning}
            createdAt={featured.bet.createdAt}
            prediction={featured.bet.prediction}
            spread={featured.bet.spread}
            conviction={featured.bet.conviction}
            collateral={featured.bet.collateral}
            shape={featured.bet.shape}
            lowerBound={featured.bet.lowerBound ?? 0}
            upperBound={featured.bet.upperBound ?? 1}
            resolutionState={featured.resolutionState ?? 'open'}
            resolvedOutcome={featured.resolvedOutcome}
            consensusAtBet={featured.bet.consensusAtBet ?? null}
            expiresAt={featured.bet.expiresAt ?? null}
            width={isMobile ? 200 : 220}
            // Galleries spotlight other people's convictions, not the
            // viewer's own. The strip reads "@author · 3,580" so the
            // featured receipt never gets misread as the visitor's.
            predictionLabel={`@${featured.bet.username}`}
          />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          fontFamily: fonts.mono,
          fontSize: 11,
          color: palette.inkMute,
          letterSpacing: 0.3,
          marginTop: 4,
        }}
      >
        <Stat k="ON RECORD" v={String(total)} />
        <Stat k="SETTLED" v={String(resolved)} />
        <Stat k="RARE" v={String(rareCount)} />
      </div>

      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: fonts.body,
          fontSize: 13,
          color: palette.inkSoft,
        }}
      >
        <span>Total staked · ${entry.totalStaked.toFixed(0)}</span>
        <span style={{ color: palette.ember, fontWeight: 600 }}>Open gallery →</span>
      </div>
    </Link>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: palette.inkFade, letterSpacing: 1.2, marginBottom: 2 }}>{k}</div>
      <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700, color: palette.ink, letterSpacing: -0.3 }}>{v}</div>
    </div>
  );
}

function enrichEntry(
  username: string,
  bets: BetRecord[],
  marketMap: Map<string, { resolutionState: 'open' | 'resolved' | 'voided'; resolvedOutcome: number | null }>,
  isDemo: boolean,
): GalleryEntry {
  const tierCounts: Record<Rarity, number> = {
    common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0,
  };
  const enriched: EnrichedBet[] = bets.map((bet) => {
    const m = marketMap.get(String(bet.marketId));
    const resolutionState = m?.resolutionState ?? null;
    const resolvedOutcome = m?.resolvedOutcome ?? null;
    let rarity: Rarity | null = null;
    let rarityScore = 0;
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
      tierCounts[r.tier] += 1;
    }
    return { bet, rarity, rarityScore, resolutionState, resolvedOutcome };
  });

  const bestRarity: Rarity | null =
    RARITY_ORDER.slice().reverse().find((t) => tierCounts[t] > 0 && t !== 'common') ?? null;
  const bestRarityScore = enriched.reduce((acc, e) => Math.max(acc, e.rarityScore), 0);

  // For demo galleries we synthesize the enrichment because their markets
  // aren't in the marketMap. Force the resolved + outcome path and compute
  // rarity directly.
  if (isDemo) {
    for (const e of enriched) {
      if (e.bet.lowerBound != null && e.bet.upperBound != null && e.bet.consensusAtBet != null) {
        // The demo data has a contrived resolvedOutcome in the bet record
        // itself; we slot it in here.
        const outcome = (e.bet as any).__demoOutcome ?? e.bet.prediction;
        const r = calculateRarity({
          prediction: e.bet.prediction,
          resolvedOutcome: outcome,
          consensusMean: e.bet.consensusAtBet,
          lowerBound: e.bet.lowerBound,
          upperBound: e.bet.upperBound,
        });
        e.rarity = r.tier;
        e.rarityScore = r.score;
        e.resolutionState = 'resolved';
        e.resolvedOutcome = outcome;
        tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;
      }
    }
  }

  const totalStaked = bets.reduce((acc, b) => acc + b.collateral, 0);

  return {
    username,
    bets,
    enrichedBets: enriched,
    bestRarity,
    bestRarityScore,
    tierCounts,
    totalStaked,
    isDemo,
  };
}

