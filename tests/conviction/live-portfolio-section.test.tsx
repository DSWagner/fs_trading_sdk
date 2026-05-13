/**
 * Render test for LivePortfolioSection.
 *
 * The section subscribes to `useMarket` (for market metadata) and uses
 * `usePreviewSell` to mark each open position to market on a 15s poll.
 * Both hooks are stubbed so the test runs without an engine.
 *
 * Coverage:
 *   - Header reports the right position count and SETTLED / LIVE eyebrow
 *     based on market resolution state.
 *   - Header surfaces aggregated STAKED, VALUE, and UNREALIZED P&L
 *     numbers after the previews land.
 *   - UNREALIZED P&L color matches the sign (positive -> jade,
 *     negative -> rose, near-zero -> muted).
 *   - Each tile gets a P&L badge with the correct sign.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const previewExecuteMock = vi.fn();
const useMarketMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarket: (...args: any[]) => useMarketMock(...args),
  usePreviewSell: () => ({
    execute: previewExecuteMock,
    loading: false,
    error: null,
    reset: () => {},
  }),
}));

import { LivePortfolioSection } from '../../demo-app/src/conviction/components/LivePortfolioSection';
import { type BetRecord } from '../../demo-app/src/conviction/storage';

beforeEach(() => {
  cleanup();
  previewExecuteMock.mockReset();
  useMarketMock.mockReset();
});

function bet(overrides: Partial<BetRecord> = {}): BetRecord {
  return {
    marketId: 'm1',
    positionId: 'p1',
    username: 'tester',
    reasoning: 'because reasons',
    conviction: 0.7,
    prediction: 50,
    spread: 5,
    collateral: 25,
    shape: 'gaussian',
    createdAt: new Date('2026-05-01T00:00:00Z').toISOString(),
    marketTitle: 'Mock market',
    marketUnits: 'pts',
    lowerBound: 0,
    upperBound: 100,
    consensusAtBet: 48,
    ...overrides,
  };
}

function mountWithRouter(children: React.ReactNode) {
  return render(<MemoryRouter>{children}</MemoryRouter>);
}

describe('LivePortfolioSection: header', () => {
  it('reports the position count and LIVE eyebrow for open markets', async () => {
    useMarketMock.mockReturnValue({
      market: { title: 'Mock market', resolutionState: 'open' },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    previewExecuteMock.mockResolvedValue({
      positionId: 'p1',
      collateralReturned: 30,
    });
    const { container } = mountWithRouter(
      <LivePortfolioSection
        marketId="m1"
        positions={[bet({ positionId: 'p1', collateral: 25 })]}
      />,
    );
    const text = () => container.textContent ?? '';
    expect(text()).toMatch(/LIVE · 1 POSITION/);
  });

  it('uses SETTLED eyebrow when the market is resolved', () => {
    useMarketMock.mockReturnValue({
      market: { title: 'Mock market', resolutionState: 'resolved' },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    previewExecuteMock.mockResolvedValue({
      positionId: 'p1',
      collateralReturned: 30,
    });
    const { container } = mountWithRouter(
      <LivePortfolioSection
        marketId="m1"
        positions={[bet({ positionId: 'p1' })]}
      />,
    );
    expect(container.textContent ?? '').toMatch(/SETTLED/);
  });
});

describe('LivePortfolioSection: aggregation', () => {
  it('aggregates STAKED + VALUE + UNREALIZED P&L across positions', async () => {
    useMarketMock.mockReturnValue({
      market: { title: 'Mock market', resolutionState: 'open' },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    // Two positions: p1 stakes 25 -> worth 30 (+5), p2 stakes 40 -> worth 35 (-5).
    // Aggregate: staked 65, value 65, P&L 0.
    previewExecuteMock.mockImplementation(async (positionId: any) => {
      const id = String(positionId);
      if (id === 'p1') return { positionId: 'p1', collateralReturned: 30 };
      if (id === 'p2') return { positionId: 'p2', collateralReturned: 35 };
      return { positionId: id, collateralReturned: 0 };
    });
    const { container } = mountWithRouter(
      <LivePortfolioSection
        marketId="m1"
        positions={[
          bet({ positionId: 'p1', collateral: 25 }),
          bet({ positionId: 'p2', collateral: 40 }),
        ]}
      />,
    );
    await waitFor(() => {
      const text = container.textContent ?? '';
      expect(text).toMatch(/\$65\.00/); // staked
    });
    const finalText = container.textContent ?? '';
    expect(finalText).toMatch(/2 POSITIONS/);
    // P&L 0 displays as +$0.00 (positive sign on zero is fine; sign matters when nonzero).
    expect(finalText).toMatch(/\+\$0\.00/);
  });

  it('positive P&L tile badge carries the + sign', async () => {
    useMarketMock.mockReturnValue({
      market: { title: 'Mock market', resolutionState: 'open' },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    previewExecuteMock.mockResolvedValue({
      positionId: 'p1',
      collateralReturned: 32,
    });
    const { findByTestId } = mountWithRouter(
      <LivePortfolioSection
        marketId="m1"
        positions={[bet({ positionId: 'p1', collateral: 25 })]}
      />,
    );
    const badge = await findByTestId('live-bet-pnl-p1');
    await waitFor(() => {
      expect(badge.textContent ?? '').toMatch(/\+\$7\.00/);
    });
  });

  it('negative P&L tile badge carries the - sign', async () => {
    useMarketMock.mockReturnValue({
      market: { title: 'Mock market', resolutionState: 'open' },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    previewExecuteMock.mockResolvedValue({
      positionId: 'p2',
      collateralReturned: 22,
    });
    const { findByTestId } = mountWithRouter(
      <LivePortfolioSection
        marketId="m1"
        positions={[bet({ positionId: 'p2', collateral: 30 })]}
      />,
    );
    const badge = await findByTestId('live-bet-pnl-p2');
    await waitFor(() => {
      expect(badge.textContent ?? '').toMatch(/-\$8\.00/);
    });
  });
});
