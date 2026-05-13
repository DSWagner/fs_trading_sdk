/**
 * @vitest-environment jsdom
 *
 * Regression tests for the Receipt page when the engine cannot supply
 * the market state on demand.
 *
 * Previously the page gated the entire render behind `!market`, which
 * meant any 404 / network error / archived market left the user stuck
 * on the "Setting the print on the page…" loading screen forever
 * (the scenario the user hit when opening receipts from their own My
 * Convictions archive). The fix renders the polaroid from the local
 * ledger snapshot as soon as anything is available, so the engine
 * fetching out is no longer a dead-end.
 *
 * Strategy: mock @functionspace/react so we can control market /
 * loading / error precisely, then assert the page renders the polaroid
 * SVG even when the engine has nothing to offer.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// jsdom doesn't implement matchMedia. The Receipt page uses
// `useIsMobile` which reads it, so we stub a permissive default.
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

const useMarketMock = vi.fn();
const useAuthMock = vi.fn();
const usePreviewSellMock = vi.fn();
const useSellMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarket: (...args: any[]) => useMarketMock(...args),
  useAuth: (...args: any[]) => useAuthMock(...args),
  usePreviewSell: (...args: any[]) => usePreviewSellMock(...args),
  useSell: (...args: any[]) => useSellMock(...args),
}));

import { ReceiptPage } from '../../demo-app/src/conviction/pages/Receipt';
import { recordBet } from '../../demo-app/src/conviction/storage';

const localBet = {
  marketId: 'archived-market',
  positionId: 'pos-1',
  username: 'me',
  reasoning: 'I think this resolves north of consensus.',
  prediction: 60,
  spread: 5,
  conviction: 0.7,
  collateral: 25,
  shape: 'gaussian' as const,
  createdAt: new Date('2026-05-01').toISOString(),
  marketTitle: 'Sample market',
  marketUnits: '%',
  lowerBound: 0,
  upperBound: 100,
  consensusAtBet: 50,
};

function renderReceipt(marketId: string, positionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/r/${marketId}/${positionId}`]}>
      <Routes>
        <Route path="/r/:marketId/:positionId" element={<ReceiptPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useMarketMock.mockReset();
  useAuthMock.mockReset();
  usePreviewSellMock.mockReset();
  useSellMock.mockReset();
  window.localStorage.clear();
  // Defaults the page is allowed to call but doesn't require for this
  // test surface.
  useAuthMock.mockReturnValue({ user: null });
  usePreviewSellMock.mockReturnValue({
    preview: null,
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  useSellMock.mockReturnValue({
    sell: vi.fn(),
    loading: false,
    error: null,
    data: null,
    reset: () => {},
  });
  cleanup();
});

describe('Receipt page: graceful market fallback', () => {
  it('renders the polaroid from the local ledger even when useMarket returns nothing', () => {
    // Engine says: I have no idea, no data, not currently fetching.
    // This is the exact shape we see when a market is archived or
    // 404s on the engine side.
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: new Error('not found'),
      refetch: () => {},
    });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');
    // The polaroid renders inside the polaroid frame wrapper.
    expect(container.querySelector('[data-testid="receipt-polaroid-frame"]')).not.toBeNull();
    // And we did NOT remain on the loading shell.
    expect(container.textContent).not.toMatch(/Setting the print on the page/);
  });

  it('does NOT render the polaroid if there is neither local data nor a share hash', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: new Error('not found'),
      refetch: () => {},
    });
    const { container } = renderReceipt('missing-market', 'missing-pos');
    // We fall through to the empty state.
    expect(container.textContent).toMatch(/No receipt found|engine could not return/i);
  });

  it('keeps the loading shell only while the engine is still in flight AND no local data exists', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: true,
      isFetching: true,
      error: null,
      refetch: () => {},
    });
    const { container } = renderReceipt('pending', 'pos');
    // EditorialLoading cycles through several lines; we only need to
    // confirm we're still on its shell, not on the receipt itself.
    expect(container.textContent).toMatch(/Developing the receipt/i);
    expect(container.querySelector('[data-testid="receipt-polaroid-frame"]')).toBeNull();
  });

  it('demo receipts render even though they are not in localStorage', () => {
    // No engine data — demo fallback should still render the polaroid.
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = renderReceipt('demo-best-picture', 'critic-1');
    expect(container.querySelector('[data-testid="receipt-polaroid-frame"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Anora has the indie distributor energy/);
  });
});
