import type { BetRecord } from './storage';

/**
 * Curated demo galleries that ship with the app so first-time visitors
 * see worth-browsing receipts even before anyone on this device has
 * placed a bet.
 *
 * These live OUTSIDE localStorage on purpose:
 *   - the Explore (Galleries) page surfaces them alongside real users
 *     so the rail is never empty,
 *   - the Profile page falls back to them when a visitor clicks through
 *     `/u/<demo-handle>` and there is no localStorage entry for that
 *     handle (because the bet was never actually placed against the
 *     SDK engine — it's a curated showcase),
 *   - the Receipt page falls back to them when `/r/<demoMarketId>/<id>`
 *     is opened from a demo gallery card.
 *
 * In production these would be served by a backend index of public
 * receipts. Keeping them as a static module lets the demo stay
 * zero-backend while still delivering the "I can browse other people's
 * convictions" promise.
 */
export type DemoBet = BetRecord & {
  /** Pre-set outcome for rarity computation in the absence of a live market. */
  __demoOutcome?: number;
};

export interface DemoGallery {
  username: string;
  bets: DemoBet[];
}

export const DEMO_GALLERIES: DemoGallery[] = [
  {
    username: 'critic_at_large',
    bets: [
      {
        marketId: 'demo-best-picture',
        positionId: 'critic-1',
        username: 'critic_at_large',
        reasoning:
          'Anora has the indie distributor energy nobody saw coming. Voters reward audacity in odd years.',
        prediction: 78,
        spread: 4,
        conviction: 0.85,
        collateral: 25,
        shape: 'gaussian',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
        marketTitle: 'Best Picture at the Oscars',
        marketUnits: 'votes',
        lowerBound: 0,
        upperBound: 100,
        consensusAtBet: 28,
        __demoOutcome: 78,
      },
    ],
  },
  {
    username: 'lab_lurker',
    bets: [
      {
        marketId: 'demo-gpt-release',
        positionId: 'lab-1',
        username: 'lab_lurker',
        reasoning:
          "If they wanted to reset the narrative they would ship before WWDC. Otherwise it is a fall thing.",
        prediction: 180,
        spread: 30,
        conviction: 0.55,
        collateral: 12,
        shape: 'gaussian',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
        marketTitle: 'GPT-5 release date',
        marketUnits: 'days',
        lowerBound: 0,
        upperBound: 365,
        consensusAtBet: 70,
        __demoOutcome: 180,
      },
    ],
  },
  {
    username: 'swiftie_prime',
    bets: [
      {
        marketId: 'demo-taylor-tour',
        positionId: 'swiftie-1',
        username: 'swiftie_prime',
        reasoning:
          'Ticket re-sale supply collapse means a refresh is coming. Late spring announcement.',
        prediction: 8,
        spread: 1.4,
        conviction: 0.92,
        collateral: 40,
        shape: 'gaussian',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        marketTitle: 'Taylor Swift announces tour leg 4',
        marketUnits: 'weeks',
        lowerBound: 0,
        upperBound: 24,
        consensusAtBet: 5,
        __demoOutcome: 8,
      },
    ],
  },
];

/** Look up a curated demo gallery by username (case-sensitive). */
export function getDemoGallery(username: string): DemoGallery | null {
  return DEMO_GALLERIES.find((g) => g.username === username) ?? null;
}

/** Look up a single demo bet by marketId + positionId. */
export function getDemoBet(marketId: string, positionId: string): DemoBet | null {
  for (const g of DEMO_GALLERIES) {
    for (const b of g.bets) {
      if (String(b.marketId) === String(marketId) && String(b.positionId) === String(positionId)) {
        return b;
      }
    }
  }
  return null;
}

/** Is the given marketId one of the demo gallery markets? */
export function isDemoMarketId(marketId: string): boolean {
  return DEMO_GALLERIES.some((g) => g.bets.some((b) => String(b.marketId) === String(marketId)));
}
