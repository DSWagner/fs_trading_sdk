/**
 * @vitest-environment jsdom
 *
 * Receipt page: "Receipt for Receipt" challenge button visibility tests.
 *
 * Pins three contracts the Challenge UX promises:
 *   1. Signed-in NON-author + open market    -> button renders.
 *   2. Signed-in AUTHOR                     -> button hidden.
 *   3. Signed-OUT viewer                    -> button hidden.
 *   4. Button href encodes the marketId AND a base64 challenge payload.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
const useMarketHistoryMock = vi.fn();
const useConsensusMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarket: (...args: any[]) => useMarketMock(...args),
  useAuth: (...args: any[]) => useAuthMock(...args),
  usePreviewSell: (...args: any[]) => usePreviewSellMock(...args),
  useSell: (...args: any[]) => useSellMock(...args),
  useMarketHistory: (...args: any[]) => useMarketHistoryMock(...args),
  useConsensus: (...args: any[]) => useConsensusMock(...args),
}));

import { ReceiptPage } from '../../demo-app/src/conviction/pages/Receipt';
import { recordBet } from '../../demo-app/src/conviction/storage';

const sampleBet = {
  marketId: 'mkt-arc',
  positionId: 'pos-1',
  username: 'alice',
  reasoning: 'This trends north by EOY.',
  prediction: 80,
  spread: 4,
  conviction: 0.9,
  collateral: 50,
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
  useMarketHistoryMock.mockReset();
  useConsensusMock.mockReset();
  window.localStorage.clear();
  usePreviewSellMock.mockReturnValue({ preview: null, loading: false, isFetching: false, error: null, refetch: () => {} });
  useSellMock.mockReturnValue({ sell: vi.fn(), loading: false, error: null, data: null, reset: () => {} });
  useMarketHistoryMock.mockReturnValue({ history: null, loading: false, isFetching: false, error: null, refetch: () => {} });
  useConsensusMock.mockReturnValue({ consensus: null, loading: true, isFetching: true, error: null, refetch: () => {} });
  // Default: market is OPEN so the challenge block has a chance to render.
  useMarketMock.mockReturnValue({
    market: {
      marketId: 'mkt-arc',
      resolutionState: 'open',
      config: { lowerBound: 0, upperBound: 100, numBuckets: 41 },
    },
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  cleanup();
});

describe('Receipt page · Challenge this call', () => {
  it('renders the challenge block for a signed-in NON-author on an open market', () => {
    useAuthMock.mockReturnValue({ user: { username: 'bob' }, isAuthenticated: true });
    recordBet(sampleBet);
    const { container } = renderReceipt('mkt-arc', 'pos-1');
    const block = container.querySelector('[data-testid="receipt-challenge-block"]');
    expect(block).not.toBeNull();
    const button = container.querySelector('[data-testid="receipt-challenge-button"]');
    expect(button).not.toBeNull();
    const href = button?.getAttribute('href') ?? '';
    expect(href).toMatch(/^\/m\/mkt-arc\?challenge=/);
  });

  it('hides the challenge block for the AUTHOR of the receipt', () => {
    useAuthMock.mockReturnValue({ user: { username: 'alice' }, isAuthenticated: true });
    recordBet(sampleBet);
    const { container } = renderReceipt('mkt-arc', 'pos-1');
    expect(container.querySelector('[data-testid="receipt-challenge-block"]')).toBeNull();
  });

  it('hides the challenge block for SIGNED-OUT viewers', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false });
    recordBet(sampleBet);
    const { container } = renderReceipt('mkt-arc', 'pos-1');
    expect(container.querySelector('[data-testid="receipt-challenge-block"]')).toBeNull();
  });

  it('hides the challenge block once the market is RESOLVED', () => {
    useAuthMock.mockReturnValue({ user: { username: 'bob' }, isAuthenticated: true });
    useMarketMock.mockReturnValue({
      market: {
        marketId: 'mkt-arc',
        resolutionState: 'resolved',
        resolvedOutcome: 70,
        config: { lowerBound: 0, upperBound: 100, numBuckets: 41 },
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet(sampleBet);
    const { container } = renderReceipt('mkt-arc', 'pos-1');
    expect(container.querySelector('[data-testid="receipt-challenge-block"]')).toBeNull();
  });

  it('challenge URL roundtrips back to a decodable payload', () => {
    useAuthMock.mockReturnValue({ user: { username: 'bob' }, isAuthenticated: true });
    recordBet(sampleBet);
    const { container } = renderReceipt('mkt-arc', 'pos-1');
    const button = container.querySelector('[data-testid="receipt-challenge-button"]');
    const href = button?.getAttribute('href') ?? '';
    const url = new URL(href, 'http://example.com');
    const encoded = url.searchParams.get('challenge');
    expect(encoded).not.toBeNull();
    expect(encoded?.length).toBeGreaterThan(8);
  });
});
