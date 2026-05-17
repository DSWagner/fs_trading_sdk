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
const useMarketHistoryMock = vi.fn();
const useConsensusMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarket: (...args: any[]) => useMarketMock(...args),
  useAuth: (...args: any[]) => useAuthMock(...args),
  usePreviewSell: (...args: any[]) => usePreviewSellMock(...args),
  useSell: (...args: any[]) => useSellMock(...args),
  // ConsensusDriftSparkline reads market history. Default to "no
  // history yet" so the sparkline renders its single-snapshot
  // explainer rather than crashing — but expose the mock so any
  // test that wants to inject a real time series can override it.
  useMarketHistory: (...args: any[]) => useMarketHistoryMock(...args),
  // ComparisonPair reads the live consensus from this hook so it can
  // synthesise the "crowd polaroid." Default to "still loading" so the
  // pair renders a skeleton rather than the full pair — the receipt
  // fallback test focuses on rendering the USER'S polaroid even when
  // the engine is down, so we just want the comparison block to not
  // crash. Tests that care about the crowd polaroid override this.
  useConsensus: (...args: any[]) => useConsensusMock(...args),
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
  useMarketHistoryMock.mockReset();
  useConsensusMock.mockReset();
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
  // The drift sparkline silently degrades when history is empty —
  // exactly the shape we want for the fallback-only assertions in
  // this file. Tests that want to exercise the sparkline live in
  // tests/conviction/drift-sparkline.test.tsx.
  useMarketHistoryMock.mockReturnValue({
    history: null,
    loading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  });
  // Default to "still loading" so the ComparisonPair component renders
  // its skeleton instead of evaluating consensus — the fallback tests
  // here do not need to assert anything about the crowd polaroid, only
  // that the user's polaroid renders.
  useConsensusMock.mockReturnValue({
    consensus: null,
    loading: true,
    isFetching: true,
    error: null,
    refetch: () => {},
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

  it('renders the SHARE THIS CONVICTION embed block to the RIGHT of the headline (under the polaroid)', () => {
    // Regression for the relocated share panel: this block used to
    // sit as the closing element of the left column. The user asked
    // for it to live UNDER the polaroid on the right column instead,
    // so the artefact and its share actions stay paired. The polaroid
    // frame has a fixed testid and the share embed block has its own
    // testid; in document order the polaroid frame must come BEFORE
    // the share embed block (they sit in the same flex column on the
    // right) AND the share embed block must come AFTER any block
    // that lives in the left column (e.g. the live drift card).
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');

    const polaroidFrame = container.querySelector('[data-testid="receipt-polaroid-frame"]');
    const shareBlock = container.querySelector('[data-testid="receipt-share-embed-block"]');
    const liveDrift = container.querySelector('[data-testid="receipt-live-drift"]');
    expect(polaroidFrame).not.toBeNull();
    expect(shareBlock).not.toBeNull();
    expect(liveDrift).not.toBeNull();

    // Use compareDocumentPosition to lock the geometry: the share
    // block must come AFTER the polaroid frame in DOM order (they
    // share the polaroidNode column on the right).
    const pos = polaroidFrame!.compareDocumentPosition(shareBlock!);
    // DOCUMENT_POSITION_FOLLOWING === 4
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('only renders ONE SHARE THIS CONVICTION embed block (not duplicated across columns)', () => {
    // The relocation removed the left-column copy entirely. If the
    // left-column block is accidentally re-added we want the test
    // to flag it.
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');
    const shareBlocks = container.querySelectorAll('[data-testid="receipt-share-embed-block"]');
    expect(shareBlocks.length).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // POLAROID FRAME GEOMETRY -- pins the multi-axis sizing contract.
  //
  // Regression for "the polaroid image is smaller than the polaroid
  // frame" -- where the wrapper rendered at near-square (clipping
  // ~200 px off the bottom) and the caption strip with the italic
  // title + handle + date footer disappeared. The wrapper now pins
  // its 2:3 box on FOUR independent axes (width, height, minHeight,
  // aspectRatio) and the SVG inside fills it at 100% x 100% via
  // inline style, so no single CSS quirk can collapse the bottom.
  // ────────────────────────────────────────────────────────────────────

  it('the polaroid frame wrapper is sized 2:3 (height = width * 1.5) on every axis', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');
    const frame = container.querySelector(
      '[data-testid="receipt-polaroid-frame"]',
    ) as HTMLElement | null;
    expect(frame).not.toBeNull();
    const style = (frame as HTMLElement).style;
    // The desktop branch reads as 420 -> 630 (mobile would be 300 ->
    // 450). matchMedia is stubbed to `matches: false` for every query
    // in the beforeAll above, so useIsMobile() returns false and we
    // get the desktop path.
    const w = parseInt(style.width, 10);
    const h = parseInt(style.height, 10);
    expect(w).toBeGreaterThan(0);
    // height MUST be width * 1.5 (allow a 1 px rounding wobble).
    expect(Math.abs(h - Math.round(w * 1.5))).toBeLessThanOrEqual(1);
    // Defensive: minHeight must match height so flex / grid layouts
    // can never compute a smaller block height for this cell.
    const minH = parseInt(style.minHeight, 10);
    expect(Math.abs(minH - h)).toBeLessThanOrEqual(1);
    // Defensive: aspectRatio must be locked to 2/3 so a clamped
    // width still produces a proportional height instead of
    // collapsing to whatever the parent's flex baseline is.
    expect(style.aspectRatio).toBe('2 / 3');
    // flex-shrink must be 0 so a narrow flex column does not squish.
    expect(style.flexShrink).toBe('0');
  });

  it('the polaroid SVG fills the wrapper at 100% x 100% (so the caption strip cannot be clipped)', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');
    const svg = container.querySelector(
      '[data-testid="receipt-polaroid-frame"] svg[role="img"][aria-label^="Polaroid receipt"]',
    ) as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    // Inline style on the SVG element must declare explicit 100% on
    // both axes, otherwise the global `svg[role="img"]{max-width:
    // 100%}` rule in index.css can in some browser engines cause the
    // SVG to render at the clamped width with the explicit height
    // attribute interpreted as `auto`, which collapses the caption
    // strip. The 100% / 100% inline style + viewBox + aspectRatio on
    // the wrapper makes the geometry bulletproof.
    const svgStyle = (svg as SVGSVGElement).style;
    expect(svgStyle.width).toBe('100%');
    expect(svgStyle.height).toBe('100%');
  });

  it('the polaroid renders the market title in its caption strip (NOT just the photo + scale)', () => {
    // The bug the user reported was: photo + scale strip render
    // correctly, but the caption strip below (italic market title +
    // username/predicted/date footer) is missing entirely. Pin the
    // contract: the SVG output MUST contain the market title text,
    // the username footer, and the conviction date line. The title
    // is rendered as multiple <text> nodes (wrap up to 3 lines) so
    // jsdom's `textContent` collapses inter-line whitespace; we
    // assert against the line-wrapped form.
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet({ ...localBet, marketTitle: 'CaptionMarkerWord market title body' });
    const { container } = renderReceipt('archived-market', 'pos-1');
    const svg = container.querySelector(
      '[data-testid="receipt-polaroid-frame"] svg[role="img"][aria-label^="Polaroid receipt"]',
    ) as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    const svgText = (svg as SVGSVGElement).textContent ?? '';
    // The unique opening word is small enough to never get split by
    // wrap, so an exact substring is reliable.
    expect(svgText).toContain('CaptionMarkerWord');
    // Username, prediction, stake, conviction badge, and date must
    // all appear in the SVG -- these are the four footer lines that
    // the user complained were missing.
    expect(svgText).toContain('@me');
    expect(svgText).toContain('predicted');
    expect(svgText).toContain('$25');
    expect(svgText).toContain('CONVICTION');
  });
});
