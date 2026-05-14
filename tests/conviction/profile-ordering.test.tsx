/**
 * @vitest-environment jsdom
 *
 * Profile page section ordering.
 *
 * The user explicitly asked for the "My Convictions" tab to surface
 * the LIVE PORTFOLIO first, then the RARITY LEDGER, then the
 * ACHIEVEMENTS strip. Before the fix the order was rarity ledger ->
 * achievements -> calibration -> live portfolio, which buried the
 * most actionable block (live mark-to-market on the user's open
 * positions) at the bottom of the page.
 *
 * This test mounts the Profile page for an authenticated user with
 * one OPEN bet and one RESOLVED bet, then walks the rendered DOM in
 * document order and asserts the three flagship blocks appear in the
 * requested sequence. We use stable `data-testid` attributes that
 * already exist on the section roots so we never have to depend on
 * text fragments.
 *
 * SDK hooks are mocked with the minimum fidelity each block needs:
 *   - useAuth -> author identity
 *   - useMarkets -> market list for resolution-state hydration
 *   - usePreviewSell -> stable preview for the live-portfolio cell
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
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

const useAuthMock = vi.fn();
const useMarketsMock = vi.fn();
const useMarketMock = vi.fn();
const usePreviewSellMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useAuth: (...args: any[]) => useAuthMock(...args),
  useMarkets: (...args: any[]) => useMarketsMock(...args),
  useMarket: (...args: any[]) => useMarketMock(...args),
  usePreviewSell: (...args: any[]) => usePreviewSellMock(...args),
}));

import { ProfilePage } from '../../demo-app/src/conviction/pages/Profile';
import { recordBet } from '../../demo-app/src/conviction/storage';

const openBet = {
  marketId: 'open-mkt',
  positionId: 'pos-open',
  username: 'pimo',
  reasoning: 'Open bet still in flight.',
  prediction: 55,
  spread: 4,
  conviction: 0.6,
  collateral: 20,
  shape: 'gaussian' as const,
  createdAt: new Date('2026-05-01').toISOString(),
  marketTitle: 'Open market',
  marketUnits: '%',
  lowerBound: 0,
  upperBound: 100,
  consensusAtBet: 50,
};

const resolvedBet = {
  marketId: 'closed-mkt',
  positionId: 'pos-closed',
  username: 'pimo',
  reasoning: 'Already resolved bet for the archive.',
  prediction: 30,
  spread: 5,
  conviction: 0.8,
  collateral: 15,
  shape: 'gaussian' as const,
  createdAt: new Date('2026-04-01').toISOString(),
  marketTitle: 'Resolved market',
  marketUnits: '%',
  lowerBound: 0,
  upperBound: 100,
  consensusAtBet: 45,
};

beforeEach(() => {
  useAuthMock.mockReset();
  useMarketsMock.mockReset();
  useMarketMock.mockReset();
  usePreviewSellMock.mockReset();
  window.localStorage.clear();

  useAuthMock.mockReturnValue({ user: { username: 'pimo' } });
  useMarketsMock.mockReturnValue({
    markets: [
      { marketId: 'open-mkt', resolutionState: 'open', resolvedOutcome: null },
      { marketId: 'closed-mkt', resolutionState: 'resolved', resolvedOutcome: 32 },
    ],
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  // LivePortfolioSection asks useMarket for a per-market consensus
  // snapshot. We just need it to not crash — the section itself has
  // its own loading skeleton when market is null.
  useMarketMock.mockReturnValue({
    market: null,
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  usePreviewSellMock.mockReturnValue({
    preview: null,
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  cleanup();
});

function renderProfile(username = 'pimo') {
  return render(
    <MemoryRouter initialEntries={[`/u/${username}`]}>
      <Routes>
        <Route path="/u/:username" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Helper: walks the rendered profile container in document order and
 * returns the testids of the three top-level section blocks the user
 * cares about, in the order they appear. Other blocks (notice,
 * calibration card, archive header, archive grid) are skipped.
 */
function readSectionOrder(container: HTMLElement): string[] {
  const interesting = new Set([
    'live-portfolio-block',
    'live-portfolio-empty',
    'rarity-ledger',
    'achievements-strip',
  ]);
  const order: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as HTMLElement | null;
  while (node) {
    const id = node.getAttribute('data-testid');
    if (id && interesting.has(id)) order.push(id);
    node = walker.nextNode() as HTMLElement | null;
  }
  return order;
}

describe('ProfilePage: section ordering on own profile', () => {
  it('renders Live portfolio FIRST, then Rarity ledger, then Achievements', () => {
    recordBet(openBet);
    recordBet(resolvedBet);
    const { container } = renderProfile('pimo');
    const order = readSectionOrder(container);
    expect(order[0]).toBe('live-portfolio-block');
    expect(order[1]).toBe('rarity-ledger');
    expect(order[2]).toBe('achievements-strip');
  });

  it('when there are no open positions the empty live-portfolio card still leads', () => {
    // Only the resolved bet exists -> no open positions -> the
    // "no open positions" empty state must still occupy the first slot
    // so the user lands on the live block first, not on the rarity
    // ledger.
    recordBet(resolvedBet);
    const { container } = renderProfile('pimo');
    const order = readSectionOrder(container);
    expect(order[0]).toBe('live-portfolio-empty');
    expect(order[1]).toBe('rarity-ledger');
    expect(order[2]).toBe('achievements-strip');
  });
});

describe('ProfilePage: section ordering on someone else profile', () => {
  it('does NOT render the live portfolio block on a stranger profile (privacy)', () => {
    // Authenticated as pimo, viewing macro_lurker -> live portfolio
    // must NOT appear (the SDK preview-sell endpoint is scoped to the
    // viewer, so the block would only show empty data; rendering it
    // also exposes that the stranger has open positions, which is a
    // small privacy leak).
    recordBet({ ...openBet, username: 'macro_lurker' });
    recordBet({ ...resolvedBet, username: 'macro_lurker' });
    const { container } = renderProfile('macro_lurker');
    const order = readSectionOrder(container);
    expect(order).not.toContain('live-portfolio-block');
    expect(order).not.toContain('live-portfolio-empty');
    // First two sections are now rarity ledger then achievements,
    // matching the editorial intent for non-owner views.
    expect(order[0]).toBe('rarity-ledger');
    expect(order[1]).toBe('achievements-strip');
  });
});
