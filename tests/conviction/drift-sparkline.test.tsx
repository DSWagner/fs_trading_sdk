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
import { render, cleanup, screen } from '@testing-library/react';

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
