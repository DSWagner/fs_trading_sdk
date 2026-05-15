import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarkets } from '@functionspace/react';
import type { MarketState } from '@functionspace/core';
import { palette, fonts } from '../theme';
import { useIsMobile } from '../useMediaQuery';
import { EditorialEmpty, EditorialError, EditorialLoading } from '../components/EditorialState';
import { TheWire } from '../components/TheWire';
import { ConvexHullFrontier } from '../components/ConvexHullFrontier';

/**
 * Discover — an editorial feed of markets worth a take. Curated toward weird,
 * pop-culture, social, and outlier markets — the categories Conviction's
 * audience actually cares about.
 */

const PRIMARY_CATEGORIES: { id: string; label: string; tag: string }[] = [
  { id: 'all', label: 'Everything', tag: 'ALL' },
  { id: 'culture', label: 'Pop culture', tag: 'CULTURE' },
  { id: 'social', label: 'Social', tag: 'SOCIAL' },
  { id: 'sports', label: 'Sports', tag: 'SPORTS' },
  { id: 'politics', label: 'Politics', tag: 'POLITICS' },
  { id: 'tech', label: 'Tech / AI', tag: 'TECH' },
  { id: 'crypto', label: 'Crypto', tag: 'CRYPTO' },
  { id: 'macro', label: 'Macro', tag: 'MACRO' },
];

export function DiscoverPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const isMobile = useIsMobile();

  const { markets, loading, error } = useMarkets({
    state: 'open',
    sortBy: 'totalVolume',
    sortOrder: 'desc',
    pollInterval: 15000,
  });

  const filtered = useMemo(() => {
    let xs = markets;
    if (activeCategory !== 'all') {
      xs = xs.filter((m) => marketHasCategory(m, activeCategory));
    }
    if (search.trim()) {
      const needle = search.toLowerCase();
      xs = xs.filter((m) => (m.title ?? '').toLowerCase().includes(needle));
    }
    return xs;
  }, [markets, activeCategory, search]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '36px 24px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${palette.rule}`, paddingBottom: isMobile ? 12 : 16, gap: 12, flexWrap: 'wrap' }}>
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 34 : 48,
            fontWeight: 700,
            color: palette.ink,
            margin: 0,
            letterSpacing: -1,
          }}
        >
          Discover
        </h1>
        {loading ? (
          <EditorialLoading
            inline
            lines={[
              'Pulling markets from the wire…',
              'Counting the open questions…',
              'Listening for fresh consensus…',
            ]}
          />
        ) : (
          <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute, letterSpacing: 1.5 }}>
            {`${filtered.length} OPEN MARKET${filtered.length === 1 ? '' : 'S'}`}
          </span>
        )}
      </div>

      <p style={{ fontFamily: fonts.body, fontSize: isMobile ? 16 : 18, color: palette.inkSoft, marginTop: 16, marginBottom: 24, maxWidth: 700 }}>
        Skip the obvious. The most rewarding bets are the ones nobody else is paying attention to.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {PRIMARY_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: `1px solid ${activeCategory === cat.id ? palette.ember : palette.rule}`,
              background: activeCategory === cat.id ? palette.ember : palette.card,
              color: activeCategory === cat.id ? palette.card : palette.inkSoft,
              fontFamily: fonts.body,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.3,
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search markets…"
        style={{
          width: '100%',
          maxWidth: 360,
          padding: '10px 14px',
          border: `1px solid ${palette.rule}`,
          borderRadius: 6,
          fontFamily: fonts.body,
          fontSize: 14,
          background: palette.card,
          color: palette.ink,
          outline: 'none',
          marginBottom: 32,
        }}
      />

      {error && (
        <EditorialError
          message={`Could not reach the market wire: ${error.message}`}
          hint="Check your connection or try again in a few seconds. The engine occasionally takes a breath."
        />
      )}

      {/* The Wire — public real-time activity ticker.
          Renders above the featured market so the first thing the
          visitor sees on Discover is "other people are placing bets
          right now." Driven by useTradeHistory polled across the top
          markets and merged on the client. */}
      {!loading && !error && <TheWire rowLimit={8} marketLimit={3} compact={isMobile} />}

      {/* Convex Hull Frontier — 2D scatter of every live conviction
          across the top markets, with the convex hull drawn as a
          dashed editorial frontier. Vertices are by construction the
          loudest contrarians and the heaviest stakes; each one
          links to its source market. Adds a top-down "shape of the
          crowd's calls right now" visual layer above the linear
          row-by-row Wire feed. */}
      {!loading && !error && <ConvexHullFrontier marketLimit={5} compact={isMobile} />}

      {!loading && featured && (
        <FeaturedMarket market={featured} isMobile={isMobile} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 260 : 320}px, 1fr))`, gap: 18, marginTop: 32 }}>
        {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        {!loading && rest.map((m) => <MarketRow key={m.marketId} market={m} />)}
        {!loading && filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <EditorialEmpty
              eyebrow={search.trim() ? `No hits for "${search.trim().slice(0, 40)}"` : 'Quiet shelf'}
              headline={search.trim() ? 'Nothing matches that search.' : 'No open markets in this category.'}
              body={search.trim()
                ? 'Try a broader phrase, or clear the filter and browse what is on the floor.'
                : 'New questions get posted constantly. Try another category, or check back in a few minutes.'}
              action={{ label: 'Reset filters', href: '#' }}
              onActionClick={(e) => {
                e.preventDefault();
                setSearch('');
                setActiveCategory('all');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedMarket({ market, isMobile }: { market: MarketState; isMobile: boolean }) {
  const cat = primaryCategory(market);
  const volume = (market.totalVolume ?? 0).toFixed(0);
  return (
    <Link
      to={`/m/${encodeURIComponent(String(market.marketId))}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        padding: isMobile ? 22 : 32,
        boxShadow: `0 6px 16px ${palette.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.6 }}>
          THE BIG QUESTION · {cat.toUpperCase()}
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute }}>${volume} POOL</span>
      </div>
      <h2
        style={{
          fontFamily: fonts.display,
          fontSize: isMobile ? 26 : 36,
          fontWeight: 700,
          color: palette.ink,
          margin: '12px 0 14px',
          letterSpacing: -0.5,
          lineHeight: 1.1,
        }}
      >
        {market.title}
      </h2>
      <div
        style={{
          display: 'flex',
          gap: isMobile ? 12 : 24,
          color: palette.inkSoft,
          fontFamily: fonts.body,
          fontSize: isMobile ? 13 : 14,
          flexWrap: 'wrap',
          alignItems: 'baseline',
        }}
      >
        <span>
          Range: {market.config.lowerBound} – {market.config.upperBound} {market.xAxisUnits ?? ''}
        </span>
        <span>Consensus: {(market.consensusMean ?? 0).toFixed(1)} {market.xAxisUnits ?? ''}</span>
        <span style={{ color: palette.ember, fontWeight: 600, marginLeft: isMobile ? 0 : 'auto' }}>Stake your call →</span>
      </div>
    </Link>
  );
}

function MarketRow({ market }: { market: MarketState }) {
  const cat = primaryCategory(market);
  return (
    <Link
      to={`/m/${encodeURIComponent(String(market.marketId))}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 8,
        padding: 18,
        transition: 'transform 120ms, box-shadow 120ms',
      }}
    >
      <div style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.ember, letterSpacing: 1.6, marginBottom: 10 }}>
        {cat.toUpperCase()}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 19,
          fontWeight: 600,
          color: palette.ink,
          marginBottom: 10,
          letterSpacing: -0.2,
          lineHeight: 1.25,
          minHeight: 48,
        }}
      >
        {market.title}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: fonts.mono, fontSize: 11, color: palette.inkMute, letterSpacing: 0.4 }}>
        <span>POOL ${(market.totalVolume ?? 0).toFixed(0)}</span>
        <span>µ {(market.consensusMean ?? 0).toFixed(1)} {market.xAxisUnits ?? ''}</span>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: palette.card, border: `1px solid ${palette.rule}`, borderRadius: 8, padding: 18, height: 130 }}>
      <div style={{ height: 12, width: 80, background: palette.rule, borderRadius: 4, marginBottom: 12 }} />
      <div style={{ height: 18, background: palette.rule, borderRadius: 4, marginBottom: 8 }} />
      <div style={{ height: 18, width: '70%', background: palette.rule, borderRadius: 4, marginBottom: 22 }} />
      <div style={{ height: 12, background: palette.rule, borderRadius: 4 }} />
    </div>
  );
}

// ----- helpers -----

function primaryCategory(m: MarketState): string {
  const cats = (m as any).categories ?? (m.metadata as any)?.categories ?? [];
  if (Array.isArray(cats) && cats.length > 0) return String(cats[0]);
  if (m.marketSubtype) return String(m.marketSubtype);
  if (m.marketType) return String(m.marketType);
  return 'Open';
}

function marketHasCategory(m: MarketState, want: string): boolean {
  const haystack: string[] = [];
  const cats = (m as any).categories ?? (m.metadata as any)?.categories ?? [];
  if (Array.isArray(cats)) haystack.push(...cats.map(String));
  if (m.marketType) haystack.push(String(m.marketType));
  if (m.marketSubtype) haystack.push(String(m.marketSubtype));
  if (m.title) haystack.push(m.title);
  const lower = haystack.join(' ').toLowerCase();

  switch (want) {
    case 'culture':
      return /culture|pop|celebrity|award|grammy|oscar|emmy|movie|music|tv|film|entertain/.test(lower);
    case 'social':
      return /social|twitter|x\b|tiktok|youtube|reddit|discord|trend|viral|meme/.test(lower);
    case 'sports':
      return /sport|nba|nfl|mlb|soccer|football|basket|cricket|tennis|golf|olympic|esport/.test(lower);
    case 'politics':
      return /politic|election|senate|congress|presid|vote|govern|policy/.test(lower);
    case 'tech':
      return /tech|ai\b|gpt|claude|openai|anthropic|nvidia|model|gpu|chip|software/.test(lower);
    case 'crypto':
      return /crypto|btc|bitcoin|eth|ether|solana|sol\b|coin|defi|nft|chain/.test(lower);
    case 'macro':
      return /macro|gdp|cpi|inflat|rate|fed|treasur|unemploy|econom|recession|housing/.test(lower);
    default:
      return true;
  }
}
