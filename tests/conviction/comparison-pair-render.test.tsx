/**
 * @vitest-environment jsdom
 *
 * UI render test for ComparisonPair.
 *
 * Pins three regressions the user reported live on Vercel:
 *
 *   1. The CROWD polaroid in the "Same market. Two convictions" block
 *      used to render its scale strip with the literal prefix "you · "
 *      (because Polaroid had that prefix hard-coded). The fix added a
 *      `predictionLabel` prop and ComparisonPair now passes
 *      `predictionLabel="crowd"` to the crowd polaroid only. This test
 *      asserts BOTH polaroids render with the correct label so a future
 *      refactor cannot silently regress one or the other.
 *
 *   2. The block must still render the editorial chrome (header,
 *      "useConsensus" stamp, diff band) so we know the new prop did
 *      not accidentally short-circuit the parent.
 *
 *   3. When the consensus is degenerate (e.g. all mass collapsed),
 *      ComparisonPair self-hides instead of crashing.
 *
 * Strategy: mock @functionspace/react so we can hand the component
 * a deterministic consensus density and a stable market object.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
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

const useConsensusMock = vi.fn();
const useMarketMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useConsensus: (...args: any[]) => useConsensusMock(...args),
  useMarket: (...args: any[]) => useMarketMock(...args),
}));

import { ComparisonPair } from '../../demo-app/src/conviction/components/ComparisonPair';

// A small, deterministic gaussian density centred at 40, so the crowd's
// summarised mean lands away from the user's prediction of 60. This
// makes the assertions on the two scale strips unambiguous: the user
// row prints "you · 60" and the crowd row prints "crowd · 40".
function gaussianAt(mean: number, sigma: number, n = 41) {
  const lo = 0;
  const hi = 100;
  const step = (hi - lo) / (n - 1);
  const points: Array<{ x: number; y: number }> = [];
  const norm = 1 / (sigma * Math.sqrt(2 * Math.PI));
  for (let i = 0; i < n; i++) {
    const x = lo + i * step;
    const y = norm * Math.exp(-0.5 * ((x - mean) / sigma) ** 2);
    points.push({ x, y });
  }
  return points;
}

const baseUserBet = {
  username: 'pimo',
  reasoning: 'Spread is mispriced; the tail does the work.',
  createdAt: new Date('2026-05-01').toISOString(),
  prediction: 60,
  spread: 6,
  conviction: 0.72,
  collateral: 25,
  shape: 'gaussian' as const,
  consensusAtBet: 50,
};

function renderPair(overrides: Partial<React.ComponentProps<typeof ComparisonPair>> = {}) {
  return render(
    <ComparisonPair
      marketId="haaland-2627"
      positionId="pos-1"
      marketTitle="Erling Haaland Total EPL Goals in 26/27 Season"
      marketUnits="goals"
      lowerBound={0}
      upperBound={100}
      userBet={baseUserBet}
      resolutionState="open"
      resolvedOutcome={null}
      width={320}
      isMobile={false}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  useConsensusMock.mockReset();
  useMarketMock.mockReset();
  useMarketMock.mockReturnValue({
    market: { expiresAt: '2026-06-01T00:00:00.000Z' },
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  cleanup();
});

describe('ComparisonPair render', () => {
  it('renders both polaroids with the correct scale-strip labels (you vs crowd)', () => {
    useConsensusMock.mockReturnValue({
      consensus: { points: gaussianAt(40, 8) },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = renderPair();
    const text = container.textContent ?? '';
    // The USER polaroid must keep its "you · NN" label.
    expect(text).toMatch(/you · 60/);
    // The CROWD polaroid must say "crowd · NN" (not "you ·").
    expect(text).toMatch(/crowd · /);
    // The pair must render the editorial header.
    expect(text).toMatch(/Same market\. Two convictions\./);
    expect(text).toMatch(/useConsensus/);
    // Two polaroid SVGs total: user + crowd.
    const polaroids = container.querySelectorAll('svg[role="img"][aria-label^="Polaroid receipt"]');
    expect(polaroids.length).toBe(2);
  });

  it('the crowd polaroid label is "crowd ·" exactly (never the misleading "you · 40" duplicate)', () => {
    useConsensusMock.mockReturnValue({
      consensus: { points: gaussianAt(40, 8) },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = renderPair();
    // Count occurrences of "you · " — must be exactly 1 (the user
    // polaroid). If the regression returns this will be 2.
    const matches = (container.textContent ?? '').match(/you · /g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('renders the loading skeleton while consensus is still loading (no crash)', () => {
    useConsensusMock.mockReturnValue({
      consensus: null,
      loading: true,
      isFetching: true,
      error: null,
      refetch: () => {},
    });
    const { container } = renderPair();
    // Skeleton — not the full polaroid pair yet.
    const polaroids = container.querySelectorAll('svg[role="img"][aria-label^="Polaroid receipt"]');
    expect(polaroids.length).toBe(0);
    expect(container.textContent ?? '').not.toMatch(/Same market\. Two convictions\./);
  });

  it('self-hides entirely when consensus is degenerate (empty array, no mass)', () => {
    useConsensusMock.mockReturnValue({
      consensus: { points: [] },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = renderPair();
    expect(container.querySelector('[data-testid="comparison-pair"]')).toBeNull();
  });
});
