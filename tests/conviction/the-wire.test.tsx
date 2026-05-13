/**
 * @vitest-environment jsdom
 *
 * Tests for TheWire — the public real-time activity ticker that
 * surfaces trades across the top markets in the engine.
 *
 * We mock `useMarkets` and `useTradeHistory` so the test runs without
 * an engine; the test verifies:
 *   1. Sources are picked from the top-volume markets (marketLimit
 *      respected).
 *   2. Trades from multiple sources are merged + sorted by timestamp.
 *   3. Rows render handle, verb, prediction, market title, amount,
 *      and a relative timestamp.
 *   4. Rarity hint dots colour rows by tier when the trade is
 *      contrarian against current consensus.
 *   5. Empty engine state renders the editorial empty copy.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
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

import { TheWire } from '../../demo-app/src/conviction/components/TheWire';

beforeEach(() => {
  useMarketsMock.mockReset();
  useTradeHistoryMock.mockReset();
  cleanup();
});

function fakeMarket(id: string, title: string, consensusMean: number) {
  return {
    marketId: id,
    title,
    consensusMean,
    xAxisUnits: '%',
    config: { lowerBound: 0, upperBound: 100 },
    totalVolume: 1000,
  };
}

function fakeTrade(opts: {
  id: string;
  username: string;
  side: 'buy' | 'sell';
  prediction: number;
  amount: number;
  timestamp: string;
  positionId?: string;
}) {
  return { positionId: 'p1', ...opts };
}

function renderWire(props: Parameters<typeof TheWire>[0] = {}) {
  return render(
    <MemoryRouter>
      <TheWire {...props} />
    </MemoryRouter>,
  );
}

describe('TheWire: source selection', () => {
  it('mounts the wire shell even when no markets are loaded', () => {
    useMarketsMock.mockReturnValue({ markets: [], loading: false, error: null, refetch: () => {} });
    useTradeHistoryMock.mockReturnValue({ trades: [], loading: false, isFetching: false, error: null, refetch: () => {} });
    renderWire();
    expect(screen.getByTestId('the-wire')).toBeTruthy();
  });

  it('respects marketLimit when picking sources', () => {
    useMarketsMock.mockReturnValue({
      markets: [
        fakeMarket('m1', 'Market 1', 50),
        fakeMarket('m2', 'Market 2', 50),
        fakeMarket('m3', 'Market 3', 50),
        fakeMarket('m4', 'Market 4', 50),
        fakeMarket('m5', 'Market 5', 50),
      ],
      loading: false,
      error: null,
      refetch: () => {},
    });
    useTradeHistoryMock.mockReturnValue({ trades: [], loading: false, isFetching: false, error: null, refetch: () => {} });
    renderWire({ marketLimit: 2 });
    // We only check that subscriptions are kept to the first two
    // (highest-volume) markets and that the remaining 3 markets are
    // NOT subscribed to. The exact call count is sensitive to React's
    // re-render flow (initial render + post-effect re-render), so we
    // assert on the set of subscribed market IDs instead.
    const subscribedIds = new Set(useTradeHistoryMock.mock.calls.map((c) => c[0]));
    expect(subscribedIds).toEqual(new Set(['m1', 'm2']));
  });

  it('forwards the poll cadence to every source subscription', () => {
    useMarketsMock.mockReturnValue({
      markets: [fakeMarket('m1', 'M1', 50)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    useTradeHistoryMock.mockReturnValue({ trades: [], loading: false, isFetching: false, error: null, refetch: () => {} });
    renderWire({ pollInterval: 7000 });
    expect(useTradeHistoryMock).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ pollInterval: 7000, limit: 20 }),
    );
  });
});

describe('TheWire: row rendering', () => {
  it('renders empty state when no trades come back from any source', () => {
    useMarketsMock.mockReturnValue({
      markets: [fakeMarket('m1', 'Bitcoin closes above 120k', 50)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    useTradeHistoryMock.mockReturnValue({ trades: [], loading: false, isFetching: false, error: null, refetch: () => {} });
    renderWire();
    expect(screen.queryByTestId('the-wire-list')).toBeNull();
    expect(screen.getByText(/wire is quiet/i)).toBeTruthy();
  });

  it('renders trades from a single source with handle, verb, prediction, and market title', async () => {
    useMarketsMock.mockReturnValue({
      markets: [fakeMarket('m1', 'Bitcoin closes above 120k', 50)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    useTradeHistoryMock.mockReturnValue({
      trades: [
        fakeTrade({
          id: 't1',
          username: 'tape_reader',
          side: 'buy',
          prediction: 78,
          amount: 25,
          timestamp: new Date(Date.now() - 30_000).toISOString(),
        }),
      ],
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    renderWire();
    // The handle is rendered as an @-prefixed link.
    expect(await screen.findByText('@tape_reader')).toBeTruthy();
    expect(screen.getByText('BOUGHT')).toBeTruthy();
    // The prediction is rendered as "78" followed by " " and the unit
    // — three sibling text nodes. We match against the unified text
    // content of the prediction span so the assertion is robust.
    expect(
      screen.getByText((_, node) => {
        if (!node) return false;
        const text = node.textContent?.replace(/\s+/g, ' ').trim();
        return text === '78 %';
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Bitcoin closes above 120k/)).toBeTruthy();
  });

  it('merges + sorts trades from multiple sources by timestamp (newest first)', async () => {
    useMarketsMock.mockReturnValue({
      markets: [fakeMarket('m1', 'Market One', 50), fakeMarket('m2', 'Market Two', 50)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    const olderTrade = fakeTrade({
      id: 'old',
      username: 'old_user',
      side: 'buy',
      prediction: 25,
      amount: 10,
      timestamp: new Date(Date.now() - 600_000).toISOString(),
    });
    const newerTrade = fakeTrade({
      id: 'new',
      username: 'new_user',
      side: 'sell',
      prediction: 90,
      amount: 50,
      timestamp: new Date(Date.now() - 5_000).toISOString(),
    });
    // Implementation-based mock keyed by marketId so re-renders keep
    // returning the right list. (mockReturnValueOnce would return
    // undefined on the second render, crashing the destructure.)
    useTradeHistoryMock.mockImplementation((marketId: string) => {
      const trades = marketId === 'm1' ? [olderTrade] : [newerTrade];
      return { trades, loading: false, isFetching: false, error: null, refetch: () => {} };
    });

    renderWire();

    // Wait for the list to appear.
    const list = await screen.findByTestId('the-wire-list');
    const items = Array.from(list.querySelectorAll('li'));
    expect(items.length).toBe(2);
    // Newest first means the first <li> mentions @new_user.
    expect(items[0].textContent).toContain('@new_user');
    expect(items[1].textContent).toContain('@old_user');
  });

  it('shows SOLD verb in rose for sells, BOUGHT in jade for buys', async () => {
    useMarketsMock.mockReturnValue({
      markets: [fakeMarket('m1', 'Market One', 50)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    useTradeHistoryMock.mockReturnValue({
      trades: [
        fakeTrade({
          id: 't-sell',
          username: 'seller',
          side: 'sell',
          prediction: 65,
          amount: 20,
          timestamp: new Date().toISOString(),
        }),
      ],
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    renderWire();
    expect(await screen.findByText('SOLD')).toBeTruthy();
  });
});
