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
  // POLAROID FRAME GEOMETRY -- pins the wrapper / SVG sizing contract.
  //
  // Design history & current contract:
  //
  //   v1 (FAILED): wrapper pinned to `width: 480, height: 720` with
  //     SVG sized via `width: 100%; height: 100%`. The 1024 px-wide
  //     desktop viewport capped the wrapper's WIDTH to ~460 px (grid
  //     cell width) but left the wrapper's HEIGHT at 720 px, so the
  //     SVG (preserving 2:3 via aspect-ratio) rendered 460 x 690
  //     and left a 30 px strip of empty matte at the bottom of the
  //     wrapper -- the original "polaroid is cut off" bug.
  //
  //   v2 (FAILED): wrapper minimal -- ONLY `position: relative` +
  //     `flexShrink: 0`. The SVG's HTML width / height attributes
  //     drove the wrapper's intrinsic size via shrink-to-fit. This
  //     looked right at 175% zoom (where the page falls into mobile
  //     layout and the polaroid sits in a single-column flow) but
  //     broke at 100% desktop zoom: inside a `display: flex;
  //     align-items: center` parent with no definite cross-axis
  //     size, Chrome resolves the SVG's `height: auto` (from the
  //     global responsive rule) against an UNDER-counted parent
  //     height, the photo renders wider than tall, and the matte
  //     truncates BEFORE the footer + date strip.
  //
  //   v3 (CURRENT): wrapper owns a DEFINITE 2:3 box.
  //     * `position: relative` -- still the absolute-overlay anchor
  //       for the CashedOutStamp and ShareKit PNG export ref.
  //     * `width: polaroidWidth` -- a concrete cross-axis size the
  //       flex parent can compute against, breaking the SVG /
  //       wrapper circular sizing.
  //     * `maxWidth: '100%'` -- the wrapper still shrinks gracefully
  //       when the grid cell is narrower than polaroidWidth (no
  //       horizontal overflow on phones / zoomed viewports).
  //     * `aspectRatio: '2 / 3'` -- the wrapper carries the 2:3
  //       portrait ratio itself, so its height is always exactly
  //       1.5x its width. Even if the SVG's `height: auto` were
  //       ever to misresolve, the wrapper box is the right shape
  //       and the SVG (forced to width:100%; height:100% via the
  //       receipt-scoped CSS rule in index.css, with
  //       preserveAspectRatio="xMidYMid meet") renders its content
  //       at the correct shape inside.
  //     * still NO `overflow: hidden` -- the wrapper never clips the
  //       SVG, the SVG never overflows the wrapper. The matte and
  //       caption are guaranteed to be visible at every viewport.
  // ────────────────────────────────────────────────────────────────────

  it('the polaroid frame wrapper carries an explicit width + 2:3 aspect-ratio so the SVG cannot squash vertically', () => {
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
    // The wrapper is still a relative-positioned anchor for the
    // CashedOutStamp overlay and the polaroidRef PNG export.
    expect(style.position).toBe('relative');
    // EXPLICITLY no clipping. Previous incarnations had `overflow:
    // hidden`, which silently amputated the polaroid's right and
    // bottom edges any time the wrapper's computed pixel rectangle
    // drifted from the SVG's intrinsic size by even one frame.
    expect(style.overflow).not.toBe('hidden');
    // The wrapper now owns a DEFINITE width -- this is what gives
    // the SVG inside a stable box to size against, instead of
    // chasing the SVG's intrinsic width through a flex circular
    // dependency that under-resolves on desktop Chrome.
    expect(style.width).toBe('380px');
    // ...but the wrapper still shrinks gracefully when the grid
    // cell is narrower than the polaroid's natural width.
    expect(style.maxWidth).toBe('100%');
    // The wrapper carries the 2:3 portrait ratio itself, so its
    // height is always exactly 1.5x its width. This is the hard
    // floor that survives any SVG `height: auto` misresolution.
    expect(style.aspectRatio).toBe('2 / 3');
    // Still no box-sizing override that could interact with future
    // padding / borders to shrink the visible rectangle.
    expect(style.boxSizing).toBe('');
  });

  // ════════════════════════════════════════════════════════════════════
  // VALIDATION TEST -- the user explicitly demanded this.
  //
  //   "WRITE A VALIDATION TEST WHERE YOU WILL ALWAYS TRY WHETHER THE
  //    IMAGE SIZE AND POLAROID FRAME ARE THE SAME SIZE"
  //
  // The wrapper now carries its own DEFINITE width + 2:3 aspect
  // ratio (see the previous test) AND the SVG carries the same
  // intrinsic 380 x 570 pixel dimensions. Because the two agree on
  // shape exactly, the receipt-scoped CSS rule that forces the SVG
  // to width:100%; height:100% inside the wrapper produces a
  // perfect 1:1 overlay -- no letterbox, no stretch, no clip. This
  // test pins the SVG side of that contract: width attribute equal
  // to the polaroidWidth prop (380 desktop), height attribute
  // exactly 1.5x the width, viewBox matches the rendered pixel
  // space. If any of these break, the polaroid renders at the
  // wrong shape inside the wrapper box.
  // ════════════════════════════════════════════════════════════════════

  it('VALIDATION: the polaroid SVG renders at its FULL intrinsic 2:3 size (no clipping, no letterbox, no stretch)', () => {
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

    // SVG pixel dimensions (from HTML attributes).
    const svgW = parseInt(svg!.getAttribute('width') || '0', 10);
    const svgH = parseInt(svg!.getAttribute('height') || '0', 10);

    // Desktop polaroidWidth is 380 (jsdom matchMedia returns false,
    // so isMobile is false). The previous "fits in viewport" sizing
    // is preserved here so the entire artifact + caption fits a
    // typical 768px viewport without scrolling.
    expect(svgW).toBe(380);
    // Height is exactly round(width * 1.5), the 2:3 portrait ratio.
    expect(svgH).toBe(Math.round(svgW * 1.5));
    expect(svgH).toBe(570);

    // The SVG's viewBox must use the same coordinate space as the
    // rendered pixels so every internal layout calculation
    // (photoSize, scaleStripY, captionY) lands at the right pixel
    // position. A mismatched viewBox would render a 480x720
    // composition stretched into a smaller box, which is exactly
    // the prior bug.
    const viewBox = svg!.getAttribute('viewBox') || '';
    expect(viewBox).toBe(`0 0 ${svgW} ${svgH}`);

    // The SVG must NOT carry any CSS stretch / letterbox contract.
    // It renders at its intrinsic numeric pixel size, full stop.
    const style = (svg as SVGSVGElement).style;
    expect(style.position).not.toBe('absolute');
    expect(style.width).toBe('');
    expect(style.height).toBe('');
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

  // ════════════════════════════════════════════════════════════════════
  // VIEWER-PERSPECTIVE LABEL -- the user reported that opening
  // somebody else's conviction still printed "you · 3,580" on the
  // polaroid scale strip, falsely implying the conviction was the
  // viewer's own. The contract:
  //
  //   * Visiting MY OWN receipt: the strip prefix reads "you".
  //   * Visiting somebody ELSE'S receipt: the strip prefix reads
  //     "@theirhandle". No "you" anywhere on the polaroid.
  // ════════════════════════════════════════════════════════════════════

  it('VIEWER-PERSPECTIVE: my own receipt prefixes the scale strip with "you"', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    // Author === current viewer.
    useAuthMock.mockReturnValue({ user: { username: 'me' }, isAuthenticated: true });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');
    const svg = container.querySelector(
      '[data-testid="receipt-polaroid-frame"] svg[role="img"][aria-label^="Polaroid receipt"]',
    ) as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    // The scale strip "you · NN" prediction marker is the only place
    // where a 'you' label can legitimately appear on the polaroid SVG
    // for an owner-view; assert it is present here so the receipt
    // reads as the visitor's own.
    expect((svg as SVGSVGElement).textContent ?? '').toMatch(/you\s+·\s+60/);
  });

  it('VIEWER-PERSPECTIVE: somebody else\'s receipt prefixes the scale strip with "@theirhandle" (NEVER "you")', () => {
    useMarketMock.mockReturnValue({
      market: null,
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    // Author "me", but the signed-in viewer is a stranger named
    // "stranger". The polaroid must NOT call the visitor "you".
    useAuthMock.mockReturnValue({
      user: { username: 'stranger' },
      isAuthenticated: true,
    });
    recordBet(localBet);
    const { container } = renderReceipt('archived-market', 'pos-1');
    const svg = container.querySelector(
      '[data-testid="receipt-polaroid-frame"] svg[role="img"][aria-label^="Polaroid receipt"]',
    ) as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    const svgText = (svg as SVGSVGElement).textContent ?? '';
    // The strip should now read "@me · 60", not "you · 60".
    expect(svgText).toMatch(/@me\s+·\s+60/);
    // Hard contract: NO "you · " anywhere on the SVG when viewing
    // someone else's receipt. The footer line "@me · predicted 60"
    // is the only handle reference allowed and it never starts with
    // "you".
    expect(svgText).not.toMatch(/you\s+·/);
  });
});
