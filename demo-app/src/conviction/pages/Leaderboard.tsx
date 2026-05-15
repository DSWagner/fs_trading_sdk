import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarkets } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { useIsMobile } from '../useMediaQuery';
import { getAllBets } from '../storage';
import { DEMO_GALLERIES, type DemoBet } from '../demoGalleries';
import { calculateRarity } from '../rarity';
import {
  buildLeaderboard,
  type LeaderboardRow,
  type CalibrationSample,
} from '../calibration';
import { EditorialEmpty } from '../components/EditorialState';

/**
 * Live calibration leaderboard.
 *
 * Ranks authors across the platform by how well-calibrated their
 * convictions have proven. For each resolved bet we compute
 * |conviction - accuracy| in [0, 1]; the calibration score is
 * `1 - mean(|conviction - accuracy|)` across the author's history.
 * Higher = the author's stated confidence consistently matches their
 * realised accuracy. See `calibration.ts` for the full derivation
 * and the choice-of-metric writeup.
 *
 * Data sources, in priority order:
 *   1. The viewer's own bets from `getAllBets()` (localStorage).
 *      Cross-referenced with `useMarkets()` to attach resolution
 *      outcomes when the engine has settled the market.
 *   2. Every demo gallery bet from `DEMO_GALLERIES`. Each demo bet
 *      ships with a baked `__demoOutcome` so we can compute its
 *      accuracy without engine data.
 *
 * Edge cases:
 *   - Authors with zero resolved bets are dropped (they have no
 *     calibration to score).
 *   - When neither localStorage nor the demo galleries have any
 *     resolved bets, the page renders an editorial empty state
 *     instead of a blank board.
 *
 * This page is deliberately the simplest of the five new features so
 * it sets the editorial tone: a single ranked list, a tasteful row
 * format with the score in a monospace badge, and clickable handles
 * that route to `/u/<username>` profiles. The "live" part is the
 * useMarkets poll that refreshes resolution states every 30 seconds.
 */
export function LeaderboardPage() {
  const isMobile = useIsMobile();
  const { markets } = useMarkets({ pollInterval: 30_000 });
  const rows = useLeaderboardRows(markets);
  return (
    <div
      data-testid="leaderboard-page"
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: isMobile ? '24px 16px 56px' : '36px 24px 80px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderBottom: `1px solid ${palette.rule}`,
          paddingBottom: isMobile ? 12 : 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
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
          Leaderboard
        </h1>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: palette.inkMute,
            letterSpacing: 1.5,
          }}
        >
          CALIBRATION · 1 − mean|conviction − accuracy|
        </span>
      </div>
      <p
        style={{
          fontFamily: fonts.body,
          fontSize: isMobile ? 16 : 18,
          color: palette.inkSoft,
          marginTop: 16,
          marginBottom: 28,
          maxWidth: 640,
          lineHeight: 1.5,
        }}
      >
        The bettors whose stated confidence consistently matches their realised accuracy.
        Higher is better: a score of <code style={{ fontFamily: fonts.mono }}>0.92</code> means their conviction lined up with the outcome on 92 percent of the absolute range, on average.
      </p>

      {rows.length === 0 ? (
        <EditorialEmpty
          eyebrow="Quiet wire"
          headline="No resolved convictions yet."
          body="Calibration only scores once a market settles. Place a few bets, wait for the dust to clear, and check back here."
          action={{ label: 'Browse the wire', href: '/discover' }}
        />
      ) : (
        <ol
          data-testid="leaderboard-rows"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {rows.map((row, i) => (
            <LeaderboardRowView
              key={row.username}
              rank={i + 1}
              row={row}
              isMobile={isMobile}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

interface SampleWithUser {
  username: string;
  sample: CalibrationSample;
}

/**
 * Hook factored out so tests can exercise the row-derivation logic
 * without rendering the full page (the page also pulls layout +
 * `useIsMobile` which complicates jsdom snapshots).
 *
 * Walk:
 *   1. Demo galleries -> samples (every bet has __demoOutcome baked
 *      in, so accuracy is computable client-side).
 *   2. Local bets -> samples (cross-reference market resolution from
 *      useMarkets to attach the outcome).
 *   3. Drop samples with no accuracy.
 *   4. `buildLeaderboard` groups + sorts.
 */
function useLeaderboardRows(markets: ReadonlyArray<any> | undefined): LeaderboardRow[] {
  return useMemo(() => {
    const pairs: SampleWithUser[] = [];

    const marketMap = new Map<string, { resolvedOutcome: number | null; resolutionState: string }>();
    for (const m of markets ?? []) {
      marketMap.set(String((m as any).marketId), {
        resolvedOutcome: (m as any).resolvedOutcome ?? null,
        resolutionState: (m as any).resolutionState ?? 'open',
      });
    }

    // Demo galleries: every record carries its own __demoOutcome.
    for (const gallery of DEMO_GALLERIES) {
      for (const bet of gallery.bets) {
        const accuracy = accuracyForBet(bet, bet.__demoOutcome ?? null);
        if (accuracy == null) continue;
        pairs.push({
          username: gallery.username,
          sample: { conviction: bet.conviction, accuracy },
        });
      }
    }

    // Local bets: pull outcome from useMarkets data.
    for (const bet of getAllBets()) {
      const market = marketMap.get(String(bet.marketId));
      if (!market || market.resolutionState !== 'resolved') continue;
      const accuracy = accuracyForBet(bet, market.resolvedOutcome);
      if (accuracy == null) continue;
      pairs.push({
        username: bet.username,
        sample: { conviction: bet.conviction, accuracy },
      });
    }

    return buildLeaderboard(pairs);
  }, [markets]);
}

function accuracyForBet(
  bet: Pick<DemoBet, 'prediction' | 'consensusAtBet' | 'lowerBound' | 'upperBound'>,
  resolvedOutcome: number | null | undefined,
): number | null {
  if (resolvedOutcome == null) return null;
  if (bet.lowerBound == null || bet.upperBound == null) return null;
  return calculateRarity({
    prediction: bet.prediction,
    resolvedOutcome,
    consensusMean: bet.consensusAtBet ?? null,
    lowerBound: bet.lowerBound,
    upperBound: bet.upperBound,
  }).accuracy;
}

function LeaderboardRowView({
  rank,
  row,
  isMobile,
}: {
  rank: number;
  row: LeaderboardRow;
  isMobile: boolean;
}) {
  const scorePct = Math.round(row.score.score * 100);
  return (
    <li
      data-testid="leaderboard-row"
      data-rank={rank}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        padding: isMobile ? '14px 14px' : '16px 18px',
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 18,
          color: palette.inkMute,
          letterSpacing: 1,
          width: 28,
          textAlign: 'right',
        }}
      >
        {rank}
      </span>
      <Link
        to={`/u/${encodeURIComponent(row.username)}`}
        style={{
          fontFamily: fonts.display,
          fontSize: isMobile ? 15 : 17,
          fontWeight: 600,
          color: palette.ink,
          textDecoration: 'none',
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        @{row.username}
      </Link>
      <span
        title={`${row.score.hits}/${row.score.samples} called`}
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          color: palette.inkMute,
          letterSpacing: 0.6,
          whiteSpace: 'nowrap',
        }}
      >
        {row.score.hits}/{row.score.samples}
      </span>
      <span
        data-testid="leaderboard-score"
        style={{
          fontFamily: fonts.mono,
          fontSize: isMobile ? 14 : 16,
          fontWeight: 700,
          color: palette.ember,
          background: palette.paperDeep,
          border: `1px solid ${palette.rule}`,
          borderRadius: 6,
          padding: '4px 10px',
          letterSpacing: 0.5,
          minWidth: 56,
          textAlign: 'right',
        }}
      >
        {scorePct}
      </span>
    </li>
  );
}
