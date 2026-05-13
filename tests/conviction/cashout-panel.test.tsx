/**
 * Integration test for the CashOutPanel component.
 *
 * The panel orchestrates two SDK hooks (`usePreviewSell` for mark-to-
 * market on a 10s poll, `useSell` for the actual close) and the local
 * `recordCashOut` storage helper. We stub both hooks and the storage
 * helper to drive the panel through its full lifecycle:
 *
 *   1. Mount -> preview-sell resolves -> panel shows current value
 *      and unrealized P&L (vs original collateral).
 *   2. User clicks "Cash out now" -> panel swaps the primary button
 *      for a two-stage confirm.
 *   3. User clicks "Confirm" -> useSell resolves -> panel records the
 *      cash-out and renders the CASHED OUT summary block.
 *   4. The parent's onCashedOut callback fires with the full record.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const previewExecuteMock = vi.fn();
const sellExecuteMock = vi.fn();

vi.mock('@functionspace/react', () => ({
  usePreviewSell: () => ({
    execute: previewExecuteMock,
    loading: false,
    error: null,
    reset: () => {},
  }),
  useSell: () => ({
    execute: sellExecuteMock,
    loading: false,
    error: null,
    reset: () => {},
  }),
}));

import { CashOutPanel } from '../../demo-app/src/conviction/components/CashOutPanel';
import {
  clearCashOuts,
  getCashOut,
} from '../../demo-app/src/conviction/storage';

beforeEach(() => {
  cleanup();
  previewExecuteMock.mockReset();
  sellExecuteMock.mockReset();
  clearCashOuts();
});

describe('CashOutPanel: preview lifecycle', () => {
  it('renders the live mark-to-market and unrealized P&L', async () => {
    previewExecuteMock.mockResolvedValueOnce({
      positionId: 'p1',
      collateralReturned: 32.5,
    });
    const { findByText, getByTestId } = render(
      <CashOutPanel marketId="m1" positionId="p1" originalCollateral={25} />,
    );
    expect(getByTestId('cashout-panel-live')).toBeTruthy();
    expect(await findByText('$32.50')).toBeTruthy();
    expect(await findByText('+$7.50')).toBeTruthy();
  });

  it('shows the original stake', async () => {
    previewExecuteMock.mockResolvedValueOnce({
      positionId: 'p1',
      collateralReturned: 18,
    });
    const { findByText } = render(
      <CashOutPanel marketId="m1" positionId="p1" originalCollateral={25} />,
    );
    expect(await findByText('-$7.00')).toBeTruthy();
    expect(await findByText('$25.00')).toBeTruthy();
  });
});

describe('CashOutPanel: confirm + sell flow', () => {
  it('walks the user through confirm -> sell -> CASHED OUT summary', async () => {
    previewExecuteMock.mockResolvedValueOnce({
      positionId: 'p1',
      collateralReturned: 40,
    });
    sellExecuteMock.mockResolvedValueOnce({
      positionId: 'p1',
      collateralReturned: 40,
    });
    const onCashedOut = vi.fn();
    const user = userEvent.setup();
    const { findByTestId, getByTestId, queryByTestId, findByText } = render(
      <CashOutPanel
        marketId="m1"
        positionId="p1"
        originalCollateral={25}
        onCashedOut={onCashedOut}
      />,
    );
    // Wait for the initial preview to resolve.
    await findByText('$40.00');
    // Click "Cash out now" -> confirm appears.
    await user.click(getByTestId('cashout-trigger'));
    expect(await findByTestId('cashout-confirm')).toBeTruthy();
    // Click "Confirm" -> sellExecute fires.
    await user.click(getByTestId('cashout-confirm'));
    // After sell resolves the panel swaps into the CASHED summary.
    await findByTestId('cashout-panel-cashed');
    expect(queryByTestId('cashout-trigger')).toBeNull();
    // Realized values shown in the CASHED summary.
    expect(await findByText('+$15.00')).toBeTruthy();
    // onCashedOut callback received the realized record.
    expect(onCashedOut).toHaveBeenCalledTimes(1);
    expect(onCashedOut.mock.calls[0][0]).toMatchObject({
      marketId: 'm1',
      positionId: 'p1',
      originalCollateral: 25,
      collateralReturned: 40,
      realizedPnl: 15,
    });
    // And we wrote it through to localStorage so a reload remembers.
    const stored = getCashOut('m1', 'p1');
    expect(stored).not.toBeNull();
    expect(stored?.realizedPnl).toBe(15);
  });

  it('allows the user to cancel the confirm prompt', async () => {
    previewExecuteMock.mockResolvedValueOnce({
      positionId: 'p1',
      collateralReturned: 30,
    });
    const user = userEvent.setup();
    const { findByText, findByTestId, getByTestId, queryByTestId } = render(
      <CashOutPanel marketId="m1" positionId="p1" originalCollateral={25} />,
    );
    await findByText('$30.00');
    await user.click(getByTestId('cashout-trigger'));
    expect(await findByTestId('cashout-cancel')).toBeTruthy();
    await user.click(getByTestId('cashout-cancel'));
    await waitFor(() => {
      expect(queryByTestId('cashout-confirm')).toBeNull();
    });
    // Trigger button is back, confirm and cancel are gone.
    expect(getByTestId('cashout-trigger')).toBeTruthy();
    // sellExecute was never called.
    expect(sellExecuteMock).not.toHaveBeenCalled();
  });
});
