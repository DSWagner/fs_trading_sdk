/**
 * @vitest-environment jsdom
 *
 * Render tests for the StreakHalo component.
 *
 * The halo is a NavBar ornament that should:
 *   1. Render NOTHING when the viewer has no resolved bets.
 *   2. Render NOTHING when the most-recent bet was a miss (current
 *      streak = 0 even if longest > 0).
 *   3. Render an SVG with the matching tier when the viewer has at
 *      least one resolved + accurate bet at the head of their history.
 *
 * The component depends on:
 *   - `useMarkets` (mocked here so we control which markets are
 *     "resolved" and what the resolvedOutcome is)
 *   - `getBetsByUser` from `../storage` (writes synthetic bet
 *     records into localStorage before the render)
 *   - `calculateRarity` (real, not mocked - we feed it real numbers)
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

const useMarketsMock = vi.fn();
vi.mock('@functionspace/react', () => ({
  useMarkets: (...args: any[]) => useMarketsMock(...args),
}));

import { StreakHalo } from '../../demo-app/src/conviction/components/StreakHalo';
import { recordBet } from '../../demo-app/src/conviction/storage';

const FIXED_DAY = (n: number) => new Date(2026, 4, n).toISOString();

beforeEach(() => {
  window.localStorage.clear();
  useMarketsMock.mockReset();
  cleanup();
});

afterEach(() => {
  cleanup();
});

function plantBets(username: string, patterns: Array<'hit' | 'miss'>) {
  // Most recent first per the array order; we record OLDEST first so
  // that the storage layer's unshift puts the newest at the head and
  // the streak walk reads them in the right order.
  const records: Array<{ marketId: string; resolutionState: string; resolvedOutcome: number }> = [];
  for (let i = patterns.length - 1; i >= 0; i--) {
    const pattern = patterns[i];
    const isHit = pattern === 'hit';
    const marketId = `m-${i}`;
    // accuracy = 1 - |prediction - outcome| / range
    // hit: prediction = 50, outcome = 50 -> accuracy = 1
    // miss: prediction = 0, outcome = 100 -> accuracy = 0
    const prediction = isHit ? 50 : 0;
    const resolvedOutcome = isHit ? 50 : 100;
    recordBet({
      marketId,
      positionId: `pos-${i}`,
      username,
      reasoning: 'r',
      conviction: 0.7,
      prediction,
      spread: 5,
      collateral: 10,
      shape: 'gaussian',
      createdAt: FIXED_DAY(i + 1),
      consensusAtBet: 25,
      lowerBound: 0,
      upperBound: 100,
    });
    records.push({ marketId, resolutionState: 'resolved', resolvedOutcome });
  }
  return records;
}

function configureMarkets(records: Array<{ marketId: string; resolutionState: string; resolvedOutcome: number }>) {
  useMarketsMock.mockReturnValue({
    markets: records.map((r) => ({
      marketId: r.marketId,
      resolutionState: r.resolutionState,
      resolvedOutcome: r.resolvedOutcome,
      resolvedAt: FIXED_DAY(20),
    })),
    loading: false,
    error: null,
    refetch: () => {},
  });
}

describe('StreakHalo render', () => {
  it('renders nothing for a user with no resolved bets', () => {
    useMarketsMock.mockReturnValue({ markets: [], loading: false, error: null, refetch: () => {} });
    const { container } = render(<StreakHalo username="ghost" />);
    expect(container.querySelector('[data-testid="streak-halo"]')).toBeNull();
  });

  it('renders nothing for a user whose most-recent bet was a miss', () => {
    const recs = plantBets('streakless', ['miss', 'hit', 'hit', 'hit']);
    configureMarkets(recs);
    const { container } = render(<StreakHalo username="streakless" />);
    expect(container.querySelector('[data-testid="streak-halo"]')).toBeNull();
  });

  it('renders tier 1 for a 1-bet current streak', () => {
    const recs = plantBets('warmup', ['hit']);
    configureMarkets(recs);
    const { container } = render(<StreakHalo username="warmup" />);
    const halo = container.querySelector('[data-testid="streak-halo"]');
    expect(halo).not.toBeNull();
    expect(halo?.getAttribute('data-streak-tier')).toBe('1');
  });

  it('renders tier 2 for a 3-bet current streak', () => {
    const recs = plantBets('hot', ['hit', 'hit', 'hit']);
    configureMarkets(recs);
    const { container } = render(<StreakHalo username="hot" />);
    const halo = container.querySelector('[data-testid="streak-halo"]');
    expect(halo?.getAttribute('data-streak-tier')).toBe('2');
  });

  it('renders tier 4 for a 10+ streak (comet)', () => {
    const recs = plantBets('mythic', Array.from({ length: 12 }, () => 'hit' as const));
    configureMarkets(recs);
    const { container } = render(<StreakHalo username="mythic" />);
    const halo = container.querySelector('[data-testid="streak-halo"]');
    expect(halo?.getAttribute('data-streak-tier')).toBe('4');
  });
});
