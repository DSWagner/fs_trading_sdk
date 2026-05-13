/**
 * Render tests for the LiveConsensusCard.
 *
 * The card subscribes to `useMarket(marketId, { pollInterval: 5000 })`
 * from `@functionspace/react`. We stub the entire module so the test
 * runs deterministically without an engine. By controlling the mocked
 * hook's return value we can exercise the three branches of the card:
 *
 *   1. Loading (market === null, loading === true).
 *   2. Open market with a drift since the user placed the bet.
 *      Sub-cases: crowd moved TOWARD user (jade verdict) and
 *      crowd moved AWAY from user (ember verdict).
 *   3. Resolved market - card pivots to a SETTLED outcome stamp
 *      with a verdict color (jade if accurate, rose if missed).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Mock @functionspace/react module BEFORE importing the component
// (vitest hoists vi.mock to the top of the file). We replace `useMarket`
// and `useAuth` only; everything else is irrelevant for this component
// but we keep the import surface complete so other re-exports remain
// callable if the component evolves.
const useMarketMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarket: (...args: any[]) => useMarketMock(...args),
}));

// Import AFTER the mock declaration so the component picks up our stub.
import { LiveConsensusCard } from '../../demo-app/src/conviction/components/LiveConsensusCard';

beforeEach(() => {
  useMarketMock.mockReset();
  cleanup();
});

function mockMarket(state: {
  consensusMean?: number | null;
  resolutionState?: 'open' | 'resolved' | 'voided';
  resolvedOutcome?: number | null;
}) {
  useMarketMock.mockReturnValue({
    market: {
      consensusMean: state.consensusMean ?? null,
      resolutionState: state.resolutionState ?? 'open',
      resolvedOutcome: state.resolvedOutcome ?? null,
    },
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
}

describe('LiveConsensusCard: loading state', () => {
  it('renders a loading shell while the market is not yet available', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: true,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { getByTestId, container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={50}
        prediction={60}
        lowerBound={0}
        upperBound={100}
        marketUnits="%"
      />,
    );
    expect(getByTestId('live-consensus-card-loading')).toBeTruthy();
    expect(container.textContent ?? '').toMatch(/Pulling the latest consensus/);
  });
});

describe('LiveConsensusCard: open + drift', () => {
  it('renders LIVE eyebrow and current consensus when open', () => {
    mockMarket({ consensusMean: 52, resolutionState: 'open' });
    const { getByTestId, container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={50}
        prediction={60}
        lowerBound={0}
        upperBound={100}
        marketUnits="%"
      />,
    );
    expect(getByTestId('live-consensus-card-open')).toBeTruthy();
    expect(container.textContent ?? '').toMatch(/LIVE/);
    expect(container.textContent ?? '').toMatch(/Consensus now/);
  });

  it('classifies drift TOWARD the user prediction as "Coming your way"', () => {
    // consensusAtBet=50, prediction=60, liveConsensus=55. distance fell
    // from 10 to 5 -> crowd moved toward user -> "Coming your way".
    mockMarket({ consensusMean: 55, resolutionState: 'open' });
    const { container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={50}
        prediction={60}
        lowerBound={0}
        upperBound={100}
      />,
    );
    expect(container.textContent ?? '').toMatch(/Coming your way/);
  });

  it('classifies drift AWAY from the user prediction as "Drifting away"', () => {
    // consensusAtBet=50, prediction=60, liveConsensus=45. distance grew
    // from 10 to 15 -> crowd moved away from user -> "Drifting away".
    mockMarket({ consensusMean: 45, resolutionState: 'open' });
    const { container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={50}
        prediction={60}
        lowerBound={0}
        upperBound={100}
      />,
    );
    expect(container.textContent ?? '').toMatch(/Drifting away/);
  });

  it('classifies sub-half-percent drift as "No drift yet"', () => {
    // |52 - 51.95| / 100 = 0.05% which is below the 0.5% threshold.
    mockMarket({ consensusMean: 51.95, resolutionState: 'open' });
    const { container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={52}
        prediction={60}
        lowerBound={0}
        upperBound={100}
      />,
    );
    expect(container.textContent ?? '').toMatch(/No drift yet/);
  });
});

describe('LiveConsensusCard: resolved state', () => {
  it('renders a SETTLED outcome stamp when the market is resolved', () => {
    mockMarket({
      consensusMean: 50,
      resolutionState: 'resolved',
      resolvedOutcome: 62,
    });
    const { getByTestId, container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={50}
        prediction={60}
        lowerBound={0}
        upperBound={100}
        marketUnits="%"
      />,
    );
    expect(getByTestId('live-consensus-card-resolved')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toMatch(/SETTLED/);
    expect(text).toMatch(/Outcome/);
    expect(text).toMatch(/62/);
    expect(text).toMatch(/Off by/);
  });
});

describe('LiveConsensusCard: degenerate inputs', () => {
  it('returns null when both consensus values are missing', () => {
    mockMarket({ consensusMean: null, resolutionState: 'open' });
    const { container } = render(
      <LiveConsensusCard
        marketId="m1"
        consensusAtBet={null}
        prediction={60}
        lowerBound={0}
        upperBound={100}
      />,
    );
    // Card renders nothing meaningful when neither value is available.
    expect(container.querySelector('[data-testid^="live-consensus-card"]')).toBeNull();
  });
});
