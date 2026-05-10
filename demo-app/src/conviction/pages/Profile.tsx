import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { Polaroid } from '../components/Polaroid';
import { getBetsByUser, type BetRecord } from '../storage';
import { useIsMobile } from '../useMediaQuery';
import { EditorialEmpty } from '../components/EditorialState';

export function ProfilePage() {
  const { username = '' } = useParams<{ username: string }>();
  const cleanUsername = decodeURIComponent(username);
  const { user } = useAuth();
  const bets = useMemo(() => getBetsByUser(cleanUsername), [cleanUsername]);
  const isMobile = useIsMobile();

  const isOwn = user?.username === cleanUsername;

  const stats = useMemo(() => {
    if (bets.length === 0) return null;
    const total = bets.length;
    const totalStaked = bets.reduce((acc, b) => acc + b.collateral, 0);
    const avgConviction = bets.reduce((acc, b) => acc + b.conviction, 0) / total;
    return { total, totalStaked, avgConviction };
  }, [bets]);

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
            <Stat k="TOTAL STAKED" v={`$${stats.totalStaked.toFixed(0)}`} mobile={isMobile} />
            <Stat k="AVG CONVICTION" v={`${Math.round(stats.avgConviction * 10)}/10`} mobile={isMobile} />
          </div>
        )}
      </div>

      {bets.length === 0 ? (
        <EmptyState isOwn={isOwn} username={cleanUsername} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 220 : 260}px, 1fr))`, gap: isMobile ? 18 : 28 }}>
          {bets.map((b) => (
            <BetTile key={`${b.marketId}:${b.positionId}`} bet={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BetTile({ bet }: { bet: BetRecord }) {
  return (
    <Link
      to={`/r/${encodeURIComponent(String(bet.marketId))}/${encodeURIComponent(String(bet.positionId))}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <Polaroid
        marketId={bet.marketId}
        positionId={bet.positionId}
        marketTitle={bet.marketTitle ?? 'Market'}
        marketUnits={bet.marketUnits}
        username={bet.username}
        reasoning={bet.reasoning}
        createdAt={bet.createdAt}
        prediction={bet.prediction}
        spread={bet.spread}
        conviction={bet.conviction}
        collateral={bet.collateral}
        shape={bet.shape}
        lowerBound={bet.lowerBound ?? 0}
        upperBound={bet.upperBound ?? 1}
        preset={bet.preset}
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
