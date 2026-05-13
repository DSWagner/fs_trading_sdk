/**
 * Tests for the cash-out localStorage layer.
 *
 * Covers:
 *   - record + read round-trip
 *   - replace-existing semantics (selling the same position twice
 *     overwrites the prior record - shouldn't happen in production
 *     but should not throw or accumulate ghost rows if it does)
 *   - tolerance to corrupt store
 *   - clear wipes everything
 *   - keys are numeric- and string-id robust (parity with bet ledger)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCashOut,
  getCashOut,
  clearCashOuts,
  type CashOutRecord,
} from '../../demo-app/src/conviction/storage';

function clearStorage() {
  window.localStorage.clear();
}

const sample = (overrides: Partial<CashOutRecord> = {}): CashOutRecord => ({
  marketId: 'm1',
  positionId: 'p1',
  cashedOutAt: new Date('2026-05-13T10:00:00Z').toISOString(),
  originalCollateral: 25,
  collateralReturned: 31.42,
  realizedPnl: 6.42,
  ...overrides,
});

describe('cash-out storage: record + read round-trip', () => {
  beforeEach(clearStorage);

  it('round-trips a single cash-out record', () => {
    const r = sample();
    recordCashOut(r);
    expect(getCashOut(r.marketId, r.positionId)).toEqual(r);
  });

  it('returns null when no cash-out exists for the position', () => {
    expect(getCashOut('absent', 'absent')).toBeNull();
  });

  it('handles numeric ids identically to string ids', () => {
    recordCashOut(sample({ marketId: 7, positionId: 42 }));
    expect(getCashOut(7, 42)).not.toBeNull();
    expect(getCashOut('7', '42')).not.toBeNull();
    expect(getCashOut(7, 42)).toEqual(getCashOut('7', '42'));
  });

  it('keeps independent records for different position ids', () => {
    recordCashOut(sample({ positionId: 'a', realizedPnl: 1 }));
    recordCashOut(sample({ positionId: 'b', realizedPnl: 2 }));
    expect(getCashOut('m1', 'a')?.realizedPnl).toBe(1);
    expect(getCashOut('m1', 'b')?.realizedPnl).toBe(2);
  });
});

describe('cash-out storage: replace + clear semantics', () => {
  beforeEach(clearStorage);

  it('replaces an existing record for the same (marketId, positionId)', () => {
    recordCashOut(sample({ realizedPnl: 5 }));
    recordCashOut(sample({ realizedPnl: 9 }));
    const r = getCashOut('m1', 'p1');
    expect(r?.realizedPnl).toBe(9);
  });

  it('clearCashOuts wipes every record', () => {
    recordCashOut(sample({ positionId: 'a' }));
    recordCashOut(sample({ positionId: 'b' }));
    expect(getCashOut('m1', 'a')).not.toBeNull();
    clearCashOuts();
    expect(getCashOut('m1', 'a')).toBeNull();
    expect(getCashOut('m1', 'b')).toBeNull();
  });
});

describe('cash-out storage: corrupt store tolerance', () => {
  beforeEach(clearStorage);

  it('returns null when the stored value is not JSON', () => {
    window.localStorage.setItem('conviction.v1.cashouts', '{not json');
    expect(getCashOut('m1', 'p1')).toBeNull();
  });

  it('a successful write after a corrupt store recovers cleanly', () => {
    window.localStorage.setItem('conviction.v1.cashouts', '{also broken');
    recordCashOut(sample());
    expect(getCashOut('m1', 'p1')).not.toBeNull();
  });

  it('returns null when the stored JSON has no cashouts array', () => {
    window.localStorage.setItem(
      'conviction.v1.cashouts',
      JSON.stringify({ unrelated: true }),
    );
    expect(getCashOut('m1', 'p1')).toBeNull();
  });
});
