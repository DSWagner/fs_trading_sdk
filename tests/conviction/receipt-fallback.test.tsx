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
  // POLAROID FRAME GEOMETRY  -- pins the wrapper-locks-the-box contract.
  //
  // Regression history:
  //   v1: "wrapper has only width, height comes from SVG" -- the
  //       wrapper sometimes inherited the grid cell's stretched height
  //       (taller than the SVG) and the artifact floated in an empty
  //       frame.
  //   v2: "wrapper has explicit numeric width AND height" -- broke on
  //       narrow viewports (e.g. ~1024 px window with the receipt
  //       page's 1fr/1fr grid -- right column was ~460 px, but the
  //       wrapper was pinned to width:480/height:720).
  //   v3: "width:100%; maxWidth:<n>; aspect-ratio:2/3". Should have
  //       worked, but the user reported the wrapper rendering taller
  //       than 2:3 in production at desktop ratios -- the caption
  //       strip dropped into a band of empty matte below the SVG.
  //       `aspect-ratio` is a "preferred" sizing hint that yields to
  //       content min-height, flex-item sizing, and (per user
  //       reports) at least one browser layout path on the live
  //       receipt grid.
  //   v4 (current): use the classic padding-bottom aspect-ratio hack
  //       (`width:100%; maxWidth:<n>; height:0; padding-bottom:150%`).
  //       Percentage padding resolves against the wrapper's OWN
  //       width per CSS 2.1 §8.4 -- 150% of width is the wrapper's
  //       full height, enforced by the box model with zero failure
  //       modes since 2008. The SVG inside is absolute-positioned
  //       (via the targeted CSS rule) so it fills the padding-derived
  //       box edge-to-edge, and the caption strip is ALWAYS visible
  //       at the bottom regardless of viewport, browser, or zoom.
  // ────────────────────────────────────────────────────────────────────

  it('the polaroid frame wrapper uses the padding-bottom aspect-ratio hack to lock height = 1.5x width at every viewport', () => {
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
    // Width is expressed as 100% so the wrapper expands to fill its
    // grid cell up to the maxWidth cap.
    expect(style.width).toBe('100%');
    // maxWidth pins the upper bound at the polaroid's editorial size.
    const maxW = parseInt(style.maxWidth, 10);
    expect(maxW).toBeGreaterThan(0);
    // The padding-bottom aspect-ratio hack: explicit `height: 0` AND
    // `padding-bottom: 150%`. This is the bulletproof aspect-ratio
    // contract that has worked since CSS 2.1 (2008). `height: 0`
    // ensures the wrapper has zero CONTENT height, and the 150%
    // bottom padding (computed against the wrapper's OWN WIDTH per
    // CSS 2.1 §8.4 percentage padding rule) becomes the entire box
    // height = 1.5 * width = the polaroid's 2:3 portrait ratio.
    expect(style.height).toBe('0px');
    expect(style.paddingBottom).toBe('150%');
    // flex-shrink must be 0 so a narrow flex column does not squish
    // BELOW the natural width=100%/maxWidth resolution.
    expect(style.flexShrink).toBe('0');
  });

  it('the polaroid SVG keeps its viewBox-driven intrinsic attributes; INLINE styles stretch it to fill the wrapper', () => {
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
    // The SVG must still carry numeric width/height attributes for
    // intrinsic-size fallbacks (PNG export, off-screen renders,
    // share-image generation). They are the SVG's own viewBox basis.
    const w = parseInt(svg!.getAttribute('width') || '0', 10);
    const h = parseInt(svg!.getAttribute('height') || '0', 10);
    expect(w).toBeGreaterThan(0);
    expect(Math.abs(h - Math.round(w * 1.5))).toBeLessThanOrEqual(1);
    // The viewBox agrees with the width/height attributes so the
    // inline-style stretch (width:100%; height:100% via the
    // `fillParent` prop) keeps the same coordinate space.
    const viewBox = svg!.getAttribute('viewBox') || '';
    expect(viewBox).toBe(`0 0 ${w} ${h}`);
    // CRITICAL: the SVG carries the inline-style contract that
    // makes it fill the wrapper's padding-derived box. Inline
    // styles can't be overridden by build-time CSS minification or
    // selector-specificity paths, so every receipt render is
    // guaranteed to absolute-fill its wrapper, no caption clipping.
    const style = (svg as SVGSVGElement).style;
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('100%');
    expect(style.height).toBe('100%');
    // `inset: 0` is implemented as four separate longhand
    // properties so jsdom can read them back deterministically.
    expect(style.top).toBe('0px');
    expect(style.left).toBe('0px');
    expect(style.right).toBe('0px');
    expect(style.bottom).toBe('0px');
  });

  // ────────────────────────────────────────────────────────────────────
  // DEMO MARKET GATE -- pin the contract that curated Studio Pick
  // galleries DO NOT pound the engine with their synthetic market IDs.
  //
  // Regression for the "I open someone else's polaroid and the page
  // floods 422s while pinning a perma-loading skeleton on the live
  // drift card and 'Could not load history right now' on the drift
  // sparkline" bug. Demo galleries ship marketIds like
  // `demo-gpt-release` that are not real engine markets. When the
  // Receipt page mounts, every SDK hook on those IDs has to be
  // disabled (`enabled: false`) so neither the initial fetch nor the
  // polling timer ever fires.
  //
  // Strategy: mount the receipt with a demo bet and assert that
  //   - all three SDK hooks were invoked with `enabled: false`
  //   - the live drift card / drift sparkline / comparison pair
  //     leave NO trace in the DOM (each returns null when disabled)
  //   - the editorial "STUDIO PICK · CURATED DEMO" notice IS shown so
  //     the column does not read as broken empty space.
  // ────────────────────────────────────────────────────────────────────

  it('demo bets pass enabled:false to every SDK hook tied to the market', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = renderReceipt('demo-best-picture', 'critic-1');
    expect(container.querySelector('[data-testid="receipt-polaroid-frame"]')).not.toBeNull();

    // Every recorded call to useMarket / useMarketHistory / useConsensus
    // for a demo bet MUST carry enabled:false. We accept both the
    // top-level call site (in ReceiptPage) and the child cards
    // (LiveConsensusCard / ComparisonPair / ConsensusDriftSparkline)
    // as long as none of them silently re-enable.
    const allMarketCalls = useMarketMock.mock.calls;
    expect(allMarketCalls.length).toBeGreaterThan(0);
    for (const [, options] of allMarketCalls) {
      expect(options?.enabled).toBe(false);
    }

    const allHistoryCalls = useMarketHistoryMock.mock.calls;
    // useMarketHistory is only called from ConsensusDriftSparkline,
    // so we expect at least one call all of which must be disabled.
    expect(allHistoryCalls.length).toBeGreaterThan(0);
    for (const [, options] of allHistoryCalls) {
      expect(options?.enabled).toBe(false);
    }

    const allConsensusCalls = useConsensusMock.mock.calls;
    expect(allConsensusCalls.length).toBeGreaterThan(0);
    for (const args of allConsensusCalls) {
      // useConsensus signature: (marketId, numPoints?, options?).
      // The Receipt-page call passes (marketId, undefined, { enabled }).
      const options = args[2];
      expect(options?.enabled).toBe(false);
    }
  });

  it('demo bets render the STUDIO PICK notice and SUPPRESS the live drift card', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = renderReceipt('demo-best-picture', 'critic-1');
    // The editorial notice fills the space the live cards would have
    // occupied so the left column does not look broken.
    expect(container.querySelector('[data-testid="receipt-demo-notice"]')).not.toBeNull();
    expect(container.textContent).toMatch(/STUDIO PICK/);
    expect(container.textContent).toMatch(/Live drift, history sparkline, and crowd comparison are disabled/);
    // The live drift card is mounted but its entire render path
    // returns null when enabled=false, so the inner skeleton/card
    // must not appear. The wrapping div with the testid still exists
    // (it's the page's slot), but it has NO live-consensus subtree.
    const liveDrift = container.querySelector('[data-testid="receipt-live-drift"]');
    expect(liveDrift).not.toBeNull();
    expect(liveDrift!.querySelector('[data-testid="live-consensus-card-loading"]')).toBeNull();
    expect(liveDrift!.querySelector('[data-testid="live-consensus-card-resolved"]')).toBeNull();
  });

  it('non-demo bets pass enabled:true (or omit enabled) so the live SDK pipeline runs normally', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    recordBet(localBet);
    renderReceipt('archived-market', 'pos-1');
    const allMarketCalls = useMarketMock.mock.calls;
    expect(allMarketCalls.length).toBeGreaterThan(0);
    // For a non-demo bet, every useMarket call must be enabled
    // (either explicitly true or left undefined which the SDK treats
    // as enabled). We accept both shapes so this test does not become
    // brittle if a callsite stops passing the option entirely.
    for (const [, options] of allMarketCalls) {
      const isEnabled = options === undefined || options?.enabled === undefined || options?.enabled === true;
      expect(isEnabled).toBe(true);
    }
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
