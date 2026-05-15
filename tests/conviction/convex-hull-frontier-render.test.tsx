/**
 * @vitest-environment jsdom
 *
 * UI render tests for ConvexHullFrontier.
 *
 * The component pulls live trade history from useTradeHistory + market
 * metadata from useMarkets. We mock both so we can pin:
 *   1. The empty state renders when there are no trades.
 *   2. With multiple trades across multiple markets, the SVG draws a
 *      hull path (data-testid="convex-hull-svg") and each trade
 *      becomes either a frontier-dot or a frontier-vertex.
 *   3. Hull vertices are clickable and route to the market path.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
const useTradeHistoryMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarkets: (...args: any[]) => useMarketsMock(...args),
  useTradeHistory: (...args: any[]) => useTradeHistoryMock(...args),
}));

import { ConvexHullFrontier } from '../../demo-app/src/conviction/components/ConvexHullFrontier';

function fakeMarket(id: string, lo = 0, hi = 100, consensus = 50) {
  return {
    marketId: id,
    title: `Market ${id}`,
    xAxisUnits: 'pts',
    consensusMean: consensus,
    config: { lowerBound: lo, upperBound: hi, numBuckets: 41 },
  };
}

function fakeTrade(username: string, prediction: number, amount: number, action: 'buy' | 'sell' = 'buy', positionId = 'p1') {
  return {
    username,
    action,
    prediction,
    amount,
    timestamp: new Date('2026-05-14T12:00:00Z').toISOString(),
    positionId,
  };
}

beforeEach(() => {
  useMarketsMock.mockReset();
  useTradeHistoryMock.mockReset();
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('ConvexHullFrontier', () => {
  it('renders the empty state when no trades have been polled yet', () => {
    // IMPORTANT: pin BOTH the outer result and the inner `trades` array
    // to STABLE references. The component's `useTradeHistory` source
    // pump fires `useEffect` whenever `trades` changes by reference, so
    // a fresh object literal per call (which `mockImplementation`
    // produces) would trigger an infinite render loop. `mockReturnValue`
    // returns the same object every call; pre-allocated arrays keep
    // the inner reference stable across renders.
    const EMPTY: any[] = [];
    useMarketsMock.mockReturnValue({ markets: [fakeMarket('m1')], loading: false, error: null });
    useTradeHistoryMock.mockReturnValue({ trades: EMPTY, loading: false, error: null });
    const { container } = render(
      <MemoryRouter>
        <ConvexHullFrontier marketLimit={1} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-testid="convex-hull-frontier"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="frontier-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="convex-hull-svg"]')).toBeNull();
  });

  it('renders an SVG with hull vertices when trades are present', () => {
    // Pre-allocate the per-market trade arrays so their references are
    // stable across renders (see note in the empty-state test).
    const tradesByMarket: Record<string, any[]> = {
      m1: [
        fakeTrade('a', 10, 5, 'buy', 'p-a'),
        fakeTrade('b', 90, 200, 'buy', 'p-b'),
        fakeTrade('c', 50, 50, 'buy', 'p-c'),
      ],
      m2: [
        fakeTrade('d', 5, 100, 'buy', 'p-d'),
        fakeTrade('e', 45, 80, 'buy', 'p-e'),
      ],
    };
    const resultByMarket: Record<string, any> = {
      m1: { trades: tradesByMarket.m1, loading: false, error: null },
      m2: { trades: tradesByMarket.m2, loading: false, error: null },
    };
    useMarketsMock.mockReturnValue({
      markets: [fakeMarket('m1'), fakeMarket('m2', 0, 50, 25)],
      loading: false,
      error: null,
    });
    useTradeHistoryMock.mockImplementation((mid: string) => resultByMarket[mid] ?? { trades: [], loading: false, error: null });
    const { container } = render(
      <MemoryRouter>
        <ConvexHullFrontier marketLimit={2} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-testid="convex-hull-svg"]')).not.toBeNull();
    const vertices = container.querySelectorAll('[data-testid="frontier-vertex"]');
    expect(vertices.length).toBeGreaterThanOrEqual(3);
  });

  it('vertices link to /m/<marketId>', () => {
    const TRADES = [
      fakeTrade('a', 0, 5, 'buy', 'p1'),
      fakeTrade('b', 100, 5, 'buy', 'p2'),
      fakeTrade('c', 50, 200, 'buy', 'p3'),
    ];
    useMarketsMock.mockReturnValue({ markets: [fakeMarket('mango')], loading: false, error: null });
    useTradeHistoryMock.mockReturnValue({ trades: TRADES, loading: false, error: null });
    const { container } = render(
      <MemoryRouter>
        <ConvexHullFrontier marketLimit={1} />
      </MemoryRouter>,
    );
    const links = container.querySelectorAll('[data-testid="frontier-link"]');
    expect(links.length).toBeGreaterThan(0);
    for (const link of Array.from(links)) {
      expect(link.getAttribute('href') ?? '').toMatch(/^\/m\/mango$/);
    }
  });
});
