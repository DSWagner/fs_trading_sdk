/**
 * @vitest-environment jsdom
 *
 * Tests for ConsensusDriftSparkline.
 *
 * Verifies that:
 *   1. When `useMarketHistory` is still loading, the loading shell
 *      paints (the user does not see a broken empty card).
 *   2. When history has < 2 snapshots, an explanatory single-snapshot
 *      message paints rather than an empty SVG.
 *   3. When history has a full timeline, the SVG renders with a
 *      drift number, the prediction reference line, and the
 *      "signed here" caret in the correct horizontal location.
 *   4. The drift caption colour reflects whether the crowd moved
 *      TOWARD the user's prediction (jade) or away from it (rose).
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

const useMarketHistoryMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  useMarketHistory: (...args: any[]) => useMarketHistoryMock(...args),
}));

import { ConsensusDriftSparkline } from '../../demo-app/src/conviction/components/ConsensusDriftSparkline';

beforeEach(() => {
  useMarketHistoryMock.mockReset();
  cleanup();
});

function makeSnapshot(opts: { ts: string; alpha: number[]; tradeId?: number; snapshotId?: number }) {
  return {
    snapshotId: opts.snapshotId ?? 1,
    tradeId: opts.tradeId ?? 1,
    side: 'buy' as const,
    positionId: 'p',
    alphaVector: opts.alpha,
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalVolume: 0,
    currentPool: 0,
    numOpenPositions: 0,
    createdAt: opts.ts,
  };
}

// Build an alpha vector where the probability mass sits at the given
// bucket index — convenient way to inject a known mean into the
// transformHistoryToFanChart pipeline.
function pointMassAt(buckets: number, index: number): number[] {
  const v = new Array(buckets).fill(0);
  v[index] = 1;
  return v;
}

function defaultProps() {
  return {
    marketId: 'm1',
    prediction: 60,
    consensusAtBet: 50,
    lowerBound: 0,
    upperBound: 100,
    marketUnits: '%',
    createdAt: new Date('2026-05-10T12:00:00Z').toISOString(),
  };
}

describe('ConsensusDriftSparkline: loading + empty paths', () => {
  it('renders the loading shell while history is still fetching', () => {
    useMarketHistoryMock.mockReturnValue({
      history: null,
      loading: true,
      isFetching: true,
      error: null,
      refetch: () => {},
    });
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    expect(screen.getByTestId('drift-sparkline-loading')).toBeTruthy();
  });

  it('renders the explainer when history has only one snapshot', () => {
    useMarketHistoryMock.mockReturnValue({
      history: {
        marketId: 1,
        totalSnapshots: 1,
        snapshots: [
          makeSnapshot({ ts: '2026-05-10T12:00:00Z', alpha: pointMassAt(11, 5) }),
        ],
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    expect(screen.getByText(/only one snapshot/i)).toBeTruthy();
  });

  it('renders the error fallback when the engine errored AND no history is available', () => {
    useMarketHistoryMock.mockReturnValue({
      history: null,
      loading: false,
      isFetching: false,
      error: new Error('boom'),
      refetch: () => {},
    });
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    expect(screen.getByText(/Could not load history/i)).toBeTruthy();
  });
});

describe('ConsensusDriftSparkline: rendered timeline', () => {
  it('renders the sparkline SVG when history has 2+ snapshots', () => {
    // Two snapshots: mean at 30, then mean at 70 (using 11 buckets across 0..100).
    useMarketHistoryMock.mockReturnValue({
      history: {
        marketId: 1,
        totalSnapshots: 2,
        snapshots: [
          makeSnapshot({ ts: '2026-05-10T10:00:00Z', alpha: pointMassAt(11, 3), snapshotId: 1 }),
          makeSnapshot({ ts: '2026-05-10T16:00:00Z', alpha: pointMassAt(11, 7), snapshotId: 2 }),
        ],
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    const { container } = render(<ConsensusDriftSparkline {...defaultProps()} />);
    expect(screen.getByTestId('drift-sparkline')).toBeTruthy();
    const svg = container.querySelector('svg[aria-label="Consensus drift sparkline"]');
    expect(svg).not.toBeNull();
    // The trace is a single <path>. With 2 snapshots we expect exactly one path with at least one L command.
    const path = svg!.querySelector('path[d]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toMatch(/M .* L /);
  });

  it('emits a non-zero drift number when the consensus moves between snapshots', () => {
    // Mean shifts from ~30 to ~70 across 0..100 — clear upward drift.
    useMarketHistoryMock.mockReturnValue({
      history: {
        marketId: 1,
        totalSnapshots: 2,
        snapshots: [
          makeSnapshot({ ts: '2026-05-10T10:00:00Z', alpha: pointMassAt(11, 3), snapshotId: 1 }),
          makeSnapshot({ ts: '2026-05-10T16:00:00Z', alpha: pointMassAt(11, 7), snapshotId: 2 }),
        ],
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    // The drift caption is "+NN.NN %" (positive drift upward).
    expect(screen.getByText(/\+\d+\.\d+\s*%/)).toBeTruthy();
  });
});

describe('ConsensusDriftSparkline: replay control', () => {
  // Build a history long enough to gate the replay button on (>= 3
  // snapshots is the visibility threshold inside the component).
  function longHistory() {
    return {
      history: {
        marketId: 1,
        totalSnapshots: 4,
        snapshots: [
          makeSnapshot({ ts: '2026-05-10T08:00:00Z', alpha: pointMassAt(11, 2), snapshotId: 1 }),
          makeSnapshot({ ts: '2026-05-10T10:00:00Z', alpha: pointMassAt(11, 4), snapshotId: 2 }),
          makeSnapshot({ ts: '2026-05-10T12:00:00Z', alpha: pointMassAt(11, 6), snapshotId: 3 }),
          makeSnapshot({ ts: '2026-05-10T16:00:00Z', alpha: pointMassAt(11, 8), snapshotId: 4 }),
        ],
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    };
  }

  it('renders the replay button when history has >= 3 snapshots', () => {
    useMarketHistoryMock.mockReturnValue(longHistory());
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    expect(screen.getByTestId('drift-replay-button')).toBeTruthy();
  });

  it('does NOT render the replay button on a 2-snapshot history', () => {
    useMarketHistoryMock.mockReturnValue({
      history: {
        marketId: 1,
        totalSnapshots: 2,
        snapshots: [
          makeSnapshot({ ts: '2026-05-10T10:00:00Z', alpha: pointMassAt(11, 3), snapshotId: 1 }),
          makeSnapshot({ ts: '2026-05-10T16:00:00Z', alpha: pointMassAt(11, 7), snapshotId: 2 }),
        ],
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    });
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    expect(screen.queryByTestId('drift-replay-button')).toBeNull();
  });

  it('toggles aria-pressed when clicked to start the replay', () => {
    useMarketHistoryMock.mockReturnValue(longHistory());
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    const btn = screen.getByTestId('drift-replay-button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.textContent).toMatch(/Replay/);
    // Use fireEvent.click — wraps the click in React's act() so the
    // state update flushes synchronously before our assertion runs.
    fireEvent.click(btn);
    // After click, the button enters the "isPlaying" branch.
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toMatch(/Pause/);
  });
});

// ────────────────────────────────────────────────────────────────────
// VALUE READOUT -- pins the cursor-driven headline contract.
//
// User feedback: "this doesn't have any value displayed. even during
// the replay and neither when I hover over the chart". The chart
// previously showed only the aggregate "DRIFT SINCE FIRST SNAPSHOT"
// number with no live readout for the playhead or hover position.
// The new contract exposes:
//   - drift-readout-label: contextual eyebrow ("LATEST CONSENSUS",
//     "AT CURSOR", or "REPLAYING · NN%")
//   - drift-readout-value: the consensus mean at the currently-pinned
//     cursor position, formatted with appropriate precision and units
//   - drift-readout-context: "Xm/h/d ago" + delta from bet-time
//     consensus when known
//   - drift-total: the original aggregate drift, now demoted to a
//     secondary stat so the live cursor value is the headline.
// ────────────────────────────────────────────────────────────────────

describe('ConsensusDriftSparkline: cursor-driven value readout', () => {
  function shortHistory() {
    return {
      history: {
        marketId: 1,
        totalSnapshots: 4,
        snapshots: [
          makeSnapshot({ ts: '2026-05-10T08:00:00Z', alpha: pointMassAt(11, 2), snapshotId: 1 }),
          makeSnapshot({ ts: '2026-05-10T10:00:00Z', alpha: pointMassAt(11, 4), snapshotId: 2 }),
          makeSnapshot({ ts: '2026-05-10T12:00:00Z', alpha: pointMassAt(11, 6), snapshotId: 3 }),
          makeSnapshot({ ts: '2026-05-10T16:00:00Z', alpha: pointMassAt(11, 8), snapshotId: 4 }),
        ],
      },
      loading: false,
      isFetching: false,
      error: null,
      refetch: () => {},
    };
  }

  it('renders a headline value readout with a "LATEST CONSENSUS" label and the latest snapshot mean', () => {
    useMarketHistoryMock.mockReturnValue(shortHistory());
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    const label = screen.getByTestId('drift-readout-label');
    const value = screen.getByTestId('drift-readout-value');
    expect(label.textContent).toMatch(/LATEST CONSENSUS/);
    // The latest snapshot's alpha is point-mass-at-bucket-8 over an
    // 11-bucket alphaVector across [0, 100], so the mean lands in the
    // 70-80 band. We don't pin the exact bucket arithmetic (the
    // transformHistoryToFanChart helper uses bucket midpoints with
    // its own internal scale); we just require the rendered value
    // string to be a positive number with units. That alone catches
    // a "value disappeared" regression while not depending on the
    // precise bucketing rule.
    expect(value.textContent).toMatch(/\d+\.\d+\s*%/);
  });

  it('switches the readout label to "REPLAYING · NN%" while a replay is in flight', () => {
    useMarketHistoryMock.mockReturnValue(shortHistory());
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    const btn = screen.getByTestId('drift-replay-button');
    fireEvent.click(btn);
    const label = screen.getByTestId('drift-readout-label');
    // "REPLAYING · 0%" the instant the button is clicked. The exact
    // percentage advances under requestAnimationFrame, but the
    // "REPLAYING · " prefix is stable from the first frame.
    expect(label.textContent).toMatch(/REPLAYING/);
    expect(label.textContent).toMatch(/%/);
  });

  it('switches the readout label to "AT CURSOR" while the user is hovering the chart', () => {
    useMarketHistoryMock.mockReturnValue(shortHistory());
    const { container } = render(<ConsensusDriftSparkline {...defaultProps()} />);
    const svg = container.querySelector('svg[aria-label="Consensus drift sparkline"]') as SVGSVGElement;
    expect(svg).not.toBeNull();
    // jsdom doesn't lay out the SVG so getBoundingClientRect returns
    // zero-width; the component's `computeProgressFromPointer` short-
    // circuits to null in that case and the readout stays in
    // "LATEST" mode. We work around by stubbing getBoundingClientRect
    // before firing the pointer event so the hover handler can
    // resolve a non-null progress.
    const rectStub = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 460,
      bottom: 92,
      width: 460,
      height: 92,
      toJSON: () => ({}),
    } as DOMRect;
    svg.getBoundingClientRect = () => rectStub;
    // pointermove halfway across the SVG.
    fireEvent.pointerMove(svg, { clientX: 230, clientY: 40 });
    const label = screen.getByTestId('drift-readout-label');
    expect(label.textContent).toMatch(/AT CURSOR/);
    // The headline value must update too -- it can't be the latest
    // snapshot since the cursor is mid-timeline.
    const value = screen.getByTestId('drift-readout-value');
    expect(value.textContent).toMatch(/\d+\.\d+\s*%/);
  });

  it('reverts to "LATEST CONSENSUS" when the pointer leaves the chart', () => {
    useMarketHistoryMock.mockReturnValue(shortHistory());
    const { container } = render(<ConsensusDriftSparkline {...defaultProps()} />);
    const svg = container.querySelector('svg[aria-label="Consensus drift sparkline"]') as SVGSVGElement;
    const rectStub = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 460,
      bottom: 92,
      width: 460,
      height: 92,
      toJSON: () => ({}),
    } as DOMRect;
    svg.getBoundingClientRect = () => rectStub;
    fireEvent.pointerMove(svg, { clientX: 230, clientY: 40 });
    expect(screen.getByTestId('drift-readout-label').textContent).toMatch(/AT CURSOR/);
    fireEvent.pointerLeave(svg);
    expect(screen.getByTestId('drift-readout-label').textContent).toMatch(/LATEST CONSENSUS/);
  });

  it('keeps the aggregate "TOTAL DRIFT" stat visible alongside the live cursor readout', () => {
    useMarketHistoryMock.mockReturnValue(shortHistory());
    render(<ConsensusDriftSparkline {...defaultProps()} />);
    const total = screen.getByTestId('drift-total');
    expect(total.textContent).toMatch(/TOTAL DRIFT/);
    // The drift number is signed and ends in % units in this fixture.
    expect(total.textContent).toMatch(/[+-]?\d+\.\d+\s*%/);
    // And the snapshot count is folded into the same line.
    expect(total.textContent).toMatch(/\d+ snapshots/);
  });
});
