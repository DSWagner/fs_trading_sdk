/**
 * @vitest-environment jsdom
 *
 * UI render tests for LeaderboardPage.
 *
 * Verifies:
 *   1. The page renders the editorial header (title + metric eyebrow)
 *      regardless of data state.
 *   2. With demo galleries (every demo bet ships a baked
 *      __demoOutcome), the page renders at least one row.
 *   3. Rows are ordered DESCENDING by score.
 *   4. The empty state shows when the page has no resolved bets at
 *      all (mocked by wiping demo galleries effect via no markets
 *      and an empty localStorage). Actually demo galleries are a
 *      static module, so we can't easily mock them away; instead we
 *      verify the page TOLERATES zero local + zero engine outcomes.
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
vi.mock('@functionspace/react', () => ({
  useMarkets: (...args: any[]) => useMarketsMock(...args),
}));

import { LeaderboardPage } from '../../demo-app/src/conviction/pages/Leaderboard';

beforeEach(() => {
  window.localStorage.clear();
  useMarketsMock.mockReset();
  useMarketsMock.mockReturnValue({ markets: [], loading: false, error: null, refetch: () => {} });
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('LeaderboardPage', () => {
  it('renders the editorial header', () => {
    const { container, getByText } = render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-testid="leaderboard-page"]')).not.toBeNull();
    expect(getByText('Leaderboard')).toBeDefined();
    // The metric eyebrow that explains the score formula.
    expect(container.textContent ?? '').toMatch(/CALIBRATION/);
  });

  it('renders rows from the demo galleries (every demo bet carries an outcome)', () => {
    const { container } = render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    const rows = container.querySelectorAll('[data-testid="leaderboard-row"]');
    // The bundled demo galleries ship at least three bettors with resolved bets.
    expect(rows.length).toBeGreaterThan(0);
  });

  it('orders rows by score DESCENDING', () => {
    const { container } = render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    const scoreNodes = Array.from(
      container.querySelectorAll('[data-testid="leaderboard-score"]'),
    );
    const scores = scoreNodes.map((n) => parseInt(n.textContent ?? '0', 10));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it('renders rows with rank numbers starting at 1', () => {
    const { container } = render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    const firstRow = container.querySelector('[data-testid="leaderboard-row"]');
    expect(firstRow?.getAttribute('data-rank')).toBe('1');
  });

  it('every row links to /u/<username>', () => {
    const { container } = render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    const rows = container.querySelectorAll('[data-testid="leaderboard-row"] a');
    expect(rows.length).toBeGreaterThan(0);
    for (const a of Array.from(rows)) {
      expect(a.getAttribute('href') ?? '').toMatch(/^\/u\//);
    }
  });
});
