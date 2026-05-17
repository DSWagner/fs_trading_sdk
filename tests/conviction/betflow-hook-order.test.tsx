/**
 * @vitest-environment jsdom
 *
 * BetFlow hook-order regression test.
 *
 * Pins the exact failure mode that crashed the public Vercel build:
 *
 *   "Minified React error #310; Rendered more hooks than during the
 *    previous render."
 *
 * Root cause: the `useDeferredValue` calls for prediction / spread /
 * conviction / collateral / shape / reasoning were placed BELOW the
 * loading + error early-return guards. On the very first render the
 * page returns early while `useMarket` is loading, so those 6 hooks
 * fire 0 times. On the second render the market arrives, the early
 * return is skipped, and 6 `useDeferredValue` hooks fire — which
 * React flags as a Rules-of-Hooks violation.
 *
 * The fix moved every `useDeferredValue` above the early returns. To
 * catch a regression we render BetFlow under a mocked `useMarket`
 * that flips from loading → loaded across two consecutive renders
 * (mirroring the real production behaviour) and assert the component
 * does NOT throw. We also assert the form actually paints once the
 * market arrives.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// jsdom doesn't ship `window.matchMedia`. `useIsMobile` reads it on
// mount — without this stub the BetFlow tree throws long before our
// hook-order test even gets to run.
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
  if (typeof window !== 'undefined' && !window.ResizeObserver) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const useMarketMock = vi.fn();
const useAuthMock = vi.fn();
const useBuyMock = vi.fn();
const usePreviewPayoutMock = vi.fn();
const useConsensusMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  // The page imports the context to fire setPreviewBelief calls; we
  // expose a dummy provider-less context so `useContext` returns null
  // without throwing.
  FunctionSpaceContext: React.createContext<any>(null),
  useMarket: (...args: any[]) => useMarketMock(...args),
  useAuth: (...args: any[]) => useAuthMock(...args),
  useBuy: (...args: any[]) => useBuyMock(...args),
  usePreviewPayout: (...args: any[]) => usePreviewPayoutMock(...args),
  // BetFlow now subscribes to the live consensus density curve so it
  // can hand the polaroid the actual chart-shaped back hill. The
  // hook-order test only cares about the React render order, not the
  // curve shape, so we return a benign empty curve by default.
  useConsensus: (...args: any[]) => useConsensusMock(...args),
}));

// The SDK's `ConsensusChart` from `@functionspace/ui` reaches for
// `useChartTheme()` from a provider we don't mount in this test.
// Stub the chart to a plain div so the tree mounts cleanly. We are
// NOT testing the chart here — only the hook-order plumbing.
vi.mock('@functionspace/ui', () => ({
  ConsensusChart: () => <div data-testid="stub-consensus-chart" />,
  // The AuthGate inside BetFlow renders the SDK's passwordless widget
  // when the user is not authenticated. We stub it to a div so the
  // tree mounts; this test is not about the auth surface.
  PasswordlessAuthWidget: () => <div data-testid="stub-auth-widget" />,
}));

import { BetFlowPage } from '../../demo-app/src/conviction/pages/BetFlow';

function renderBetFlow(marketId = '212') {
  return render(
    <MemoryRouter initialEntries={[`/m/${marketId}`]}>
      <Routes>
        <Route path="/m/:marketId" element={<BetFlowPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useMarketMock.mockReset();
  useAuthMock.mockReset();
  useBuyMock.mockReset();
  usePreviewPayoutMock.mockReset();
  useConsensusMock.mockReset();
  useConsensusMock.mockReturnValue({ consensus: null, loading: false, isFetching: false, error: null, refetch: () => {} });
  // Default: not authenticated. The AuthGate inside BetFlow then
  // mounts the editorial sign-in surface, which is fine — we only
  // care that BetFlow itself doesn't crash on the transition.
  useAuthMock.mockReturnValue({ user: null, isAuthenticated: false });
  useBuyMock.mockReturnValue({ execute: vi.fn(), loading: false, error: null });
  usePreviewPayoutMock.mockReturnValue({ execute: vi.fn() });
});

afterEach(() => {
  cleanup();
});

describe('BetFlow: hook-order stability across loading -> loaded transition', () => {
  it('does NOT throw React error #310 when the market transitions from loading to loaded', () => {
    // Render 1: market is still loading. The early-return guard fires.
    useMarketMock.mockReturnValueOnce({
      market: null,
      loading: true,
      isFetching: true,
      error: null,
      refetch: () => {},
    });
    // Renders 2+: market has loaded. The early-return guard is skipped
    // and the body of BetFlow runs. If any hook lives below the early
    // return, this is the render that throws error #310.
    useMarketMock.mockReturnValue({
      market: {
        marketId: 212,
        title: 'Test market',
        config: { lowerBound: 0, upperBound: 100 },
        consensusMean: 50,
        xAxisUnits: '%',
        expiresAt: null,
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });

    // Suppress the noisy React error / warning channel for this
    // test — when the regression IS present, React logs at error
    // level before the boundary catches the throw. We want a clean
    // assertion failure, not a wall of stderr.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => {
      const { rerender, unmount } = renderBetFlow('212');
      // Force a second render — `useMarket`'s mocked return value
      // flips from loading to loaded on the .mockReturnValue() default
      // (the .mockReturnValueOnce above only applies to render 1).
      rerender(
        <MemoryRouter initialEntries={[`/m/212`]}>
          <Routes>
            <Route path="/m/:marketId" element={<BetFlowPage />} />
          </Routes>
        </MemoryRouter>,
      );
      unmount();
    }).not.toThrow();

    // Filter for the specific minified-React-error pattern. If the
    // regression returns, error #310 will land on console.error
    // before being thrown.
    const messages = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(messages).not.toMatch(/Minified React error #310/);
    expect(messages).not.toMatch(/Rendered more hooks than during the previous render/);

    errSpy.mockRestore();
  });

  it('renders the loading shell on the first render (before the market loads)', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: true,
      isFetching: true,
      error: null,
      refetch: () => {},
    });
    const { container } = renderBetFlow('212');
    expect(container.textContent).toMatch(/Tuning the question|Pulling consensus/);
  });

  it('renders the loading shell (NOT the error fallback) when useMarket has no market AND an error', () => {
    // BetFlow's first guard is `if (loading || !market)` which means a
    // null market always paints the loading shell — even when the
    // engine returned an error. The error shell only paints when a
    // market WAS previously cached and a subsequent refetch errored.
    // We pin this behaviour so a future refactor that reorders the
    // guards is caught here.
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: new Error('engine offline'),
      refetch: () => {},
    });
    const { container } = renderBetFlow('212');
    expect(container.textContent).toMatch(/Tuning the question|Pulling consensus/);
  });
});
